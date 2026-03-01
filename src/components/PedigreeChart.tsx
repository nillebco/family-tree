import { useCallback, useMemo, useRef, useState } from "react";
import { applyWheelZoom } from "@arielladigitalconsulting/new-react-org-chart";
import type { GrampsData } from "../types/gramps";
import {
  buildHourglass,
  type AncestorNode,
  type DescendantNode,
  type DescendantFamily,
  type NodeInfo,
} from "../utils/treeBuilder";

const NODE_W = 200;
const NODE_H = 120;
const H_GAP = 24;
const V_GAP = 60;
const SPOUSE_GAP = 8; // small gap between person and spouse
const MARGIN = 40;

interface PlacedNode {
  info: NodeInfo;
  x: number;
  y: number;
  hiddenSiblings?: number;
}

interface PlacedLink {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  key: string;
  isMarriage?: boolean; // horizontal marriage line
}

// ── Sibling filtering for direct-line path ─────────────────────────

/** Map from direct-line child handle → number of hidden siblings */
type HiddenSiblingMap = Map<string, number>;

/**
 * Filter the descendant tree so that along the direct-line path,
 * only the direct-line child is shown (siblings hidden) unless expanded.
 * Below the selected person, everything is shown normally.
 */
function filterDescendantTree(
  node: DescendantNode,
  directLine: Set<string>,
  expandedSiblings: Set<string>,
  selectedHandle: string,
  hiddenMap: HiddenSiblingMap
): DescendantNode {
  // If this node IS the selected person or is below the selected person,
  // show everything normally (no filtering)
  if (node.info.handle === selectedHandle) {
    return node;
  }

  const filteredFamilies: DescendantFamily[] = [];

  for (const fam of node.families) {
    // Find the direct-line child in this family
    const directChild = fam.children.find((c) => directLine.has(c.info.handle));

    if (!directChild) {
      // No direct-line child in this family — show all children as-is
      filteredFamilies.push(fam);
      continue;
    }

    // This family has a direct-line child
    const isExpanded = expandedSiblings.has(directChild.info.handle);
    const siblingCount = fam.children.length - 1;

    if (isExpanded || siblingCount === 0) {
      // Expanded or no siblings: show all children, but recurse to filter deeper
      const filteredChildren = fam.children.map((c) =>
        directLine.has(c.info.handle)
          ? filterDescendantTree(c, directLine, expandedSiblings, selectedHandle, hiddenMap)
          : c
      );
      filteredFamilies.push({ ...fam, children: filteredChildren });
    } else {
      // Collapsed: keep only the direct-line child, record hidden count
      hiddenMap.set(directChild.info.handle, siblingCount);
      const filteredChild = filterDescendantTree(
        directChild, directLine, expandedSiblings, selectedHandle, hiddenMap
      );
      filteredFamilies.push({ ...fam, children: [filteredChild] });
    }
  }

  return { ...node, families: filteredFamilies };
}

// ── Ancestor layout (fans out UPWARD) ──────────────────────────────

function ancestorLeafCount(node: AncestorNode): number {
  if (!node.father && !node.mother) return 1;
  let count = 0;
  if (node.father) count += ancestorLeafCount(node.father);
  if (node.mother) count += ancestorLeafCount(node.mother);
  return count;
}

function ancestorDepth(node: AncestorNode): number {
  let d = 0;
  if (node.father) d = Math.max(d, 1 + ancestorDepth(node.father));
  if (node.mother) d = Math.max(d, 1 + ancestorDepth(node.mother));
  return d;
}

function layoutAncestors(
  node: AncestorNode,
  generation: number,
  leftEdge: number,
  baselineY: number,
  nodes: PlacedNode[],
  links: PlacedLink[]
): { x: number; width: number } {
  const nodeSpan = NODE_W + H_GAP;
  const y = baselineY - generation * (NODE_H + V_GAP);

  const parents: AncestorNode[] = [];
  if (node.father) parents.push(node.father);
  if (node.mother) parents.push(node.mother);

  if (parents.length === 0) {
    const x = leftEdge;
    nodes.push({ info: node.info, x, y });
    return { x, width: nodeSpan };
  }

  let cursor = leftEdge;
  const parentPositions: { x: number; width: number }[] = [];
  for (const parent of parents) {
    const leafWidth = ancestorLeafCount(parent) * nodeSpan;
    const pos = layoutAncestors(
      parent,
      generation + 1,
      cursor,
      baselineY,
      nodes,
      links
    );
    parentPositions.push(pos);
    cursor += leafWidth;
  }

  const firstParentX = parentPositions[0].x;
  const lastParentX = parentPositions[parentPositions.length - 1].x;
  const x = (firstParentX + lastParentX) / 2;
  const totalWidth = cursor - leftEdge;

  nodes.push({ info: node.info, x, y });

  for (let i = 0; i < parents.length; i++) {
    const px = parentPositions[i].x + NODE_W / 2;
    const py = y - (NODE_H + V_GAP) + NODE_H;
    links.push({
      fromX: px,
      fromY: py,
      toX: x + NODE_W / 2,
      toY: y,
      key: `a-${parents[i].info.id}-${node.info.id}`,
    });
  }

  return { x, width: totalWidth };
}

// ── Descendant layout (fans out DOWNWARD, with spouse nodes) ───────

/**
 * Width of a single family unit in leaf slots:
 * - The couple (person + optional spouse) takes 2 slots if spouse, 1 otherwise
 * - Children subtrees may need more
 * - Return the max of both
 */
function familyLeafCount(
  children: DescendantNode[],
  hasSpouse: boolean
): number {
  const coupleSlots = hasSpouse ? 2 : 1;
  if (children.length === 0) return coupleSlots;
  let childSlots = 0;
  for (const child of children) childSlots += descendantLeafCount(child);
  return Math.max(childSlots, coupleSlots);
}

/** Total leaf slots for a person across all their families */
function descendantLeafCount(node: DescendantNode): number {
  if (node.families.length === 0) return 1;
  let total = 0;
  for (const fam of node.families) {
    total += familyLeafCount(fam.children, !!fam.spouse);
  }
  return total;
}

/**
 * Layout a single family unit: person (or reference to already-placed person)
 * + spouse side-by-side, children centered below the couple.
 * Returns the x where the person node is placed.
 */
function layoutFamily(
  personInfo: NodeInfo,
  spouseInfo: NodeInfo | undefined,
  children: DescendantNode[],
  generation: number,
  leftEdge: number,
  topY: number,
  nodes: PlacedNode[],
  links: PlacedLink[],
  placePerson: boolean // false when person is already placed (e.g. skipRoot or shared across families)
): { personX: number; width: number } {
  const nodeSpan = NODE_W + H_GAP;
  const coupleSpan = NODE_W + SPOUSE_GAP;
  const y = topY + generation * (NODE_H + V_GAP);
  const hasSpouse = !!spouseInfo;
  const totalSlots = familyLeafCount(children, hasSpouse);
  const totalWidth = totalSlots * nodeSpan;

  if (children.length === 0) {
    // No children: place person + spouse at leftEdge
    const personX = leftEdge;
    if (placePerson) {
      nodes.push({ info: personInfo, x: personX, y });
    }
    if (spouseInfo) {
      const spouseX = personX + coupleSpan;
      nodes.push({ info: spouseInfo, x: spouseX, y });
      links.push({
        fromX: spouseX,
        fromY: y + NODE_H / 2,
        toX: personX + NODE_W,
        toY: y + NODE_H / 2,
        key: `m-${personInfo.id}-${spouseInfo.id}`,
        isMarriage: true,
      });
    }
    return { personX, width: totalWidth };
  }

  // Layout children, then center couple above
  let cursor = leftEdge;
  const childPositions: { x: number }[] = [];
  for (const child of children) {
    const leafWidth = descendantLeafCount(child) * nodeSpan;
    const pos = layoutDescendants(child, generation + 1, cursor, topY, nodes, links);
    childPositions.push(pos);
    cursor += leafWidth;
  }

  const firstChildX = childPositions[0].x;
  const lastChildX = childPositions[childPositions.length - 1].x;

  // The couple center should be above the children
  let personX: number;
  if (hasSpouse) {
    // Couple: person + spouse. Center the pair over children.
    const coupleCenter = (firstChildX + lastChildX + NODE_W) / 2;
    personX = coupleCenter - coupleSpan / 2 - SPOUSE_GAP / 2;
  } else {
    personX = (firstChildX + lastChildX) / 2;
  }

  if (placePerson) {
    nodes.push({ info: personInfo, x: personX, y });
  }

  let dropX: number;
  if (spouseInfo) {
    const spouseX = personX + coupleSpan;
    nodes.push({ info: spouseInfo, x: spouseX, y });
    links.push({
      fromX: spouseX,
      fromY: y + NODE_H / 2,
      toX: personX + NODE_W,
      toY: y + NODE_H / 2,
      key: `m-${personInfo.id}-${spouseInfo.id}`,
      isMarriage: true,
    });
    // Children drop from midpoint of couple
    dropX = (personX + NODE_W / 2 + spouseX + NODE_W / 2) / 2;
  } else {
    dropX = personX + NODE_W / 2;
  }

  // Links to children
  for (const cp of childPositions) {
    links.push({
      fromX: dropX,
      fromY: y + NODE_H,
      toX: cp.x + NODE_W / 2,
      toY: y + NODE_H + V_GAP,
      key: `d-${personInfo.id}-${cp.x}`,
    });
  }

  return { personX, width: totalWidth };
}

/**
 * Layout a descendant node: iterate over their families left-to-right.
 * The person node is placed once (in the first family), subsequent families
 * only place the spouse + children with a marriage line back to the person.
 */
function layoutDescendants(
  node: DescendantNode,
  generation: number,
  leftEdge: number,
  topY: number,
  nodes: PlacedNode[],
  links: PlacedLink[],
  skipRoot: boolean = false
): { x: number; width: number } {
  const nodeSpan = NODE_W + H_GAP;

  if (node.families.length === 0) {
    // No families at all: single person
    const x = leftEdge;
    if (!skipRoot) {
      const y = topY + generation * (NODE_H + V_GAP);
      nodes.push({ info: node.info, x, y });
    }
    return { x, width: nodeSpan };
  }

  let cursor = leftEdge;
  let personX = leftEdge; // will be set by first family

  for (let fi = 0; fi < node.families.length; fi++) {
    const fam = node.families[fi];
    const isFirstFamily = fi === 0;
    const placePerson = isFirstFamily && !skipRoot;

    const result = layoutFamily(
      node.info,
      fam.spouse,
      fam.children,
      generation,
      cursor,
      topY,
      nodes,
      links,
      placePerson
    );

    if (isFirstFamily) {
      personX = result.personX;
    } else {
      // For subsequent families, draw a marriage line from spouse back to person
      // The spouse is already placed by layoutFamily; we need a long marriage line
      // connecting back to the person node
      if (fam.spouse) {
        const y = topY + generation * (NODE_H + V_GAP);
        const spouseX = result.personX; // layoutFamily placed "person" here but we didn't render it
        // Remove the short marriage link that layoutFamily added (it points to the wrong person pos)
        // and add a long one back to the real person
        const shortKey = `m-${node.info.id}-${fam.spouse.id}`;
        const idx = links.findIndex((l) => l.key === shortKey);
        if (idx >= 0) {
          links[idx] = {
            fromX: personX + NODE_W,
            fromY: y + NODE_H / 2,
            toX: spouseX + (fam.spouse ? NODE_W + SPOUSE_GAP : 0),
            toY: y + NODE_H / 2,
            key: shortKey,
            isMarriage: true,
          };
        }
      }
    }

    cursor += result.width;
  }

  return { x: personX, width: cursor - leftEdge };
}

// ── Combined hourglass layout ──────────────────────────────────────

interface LayoutResult {
  nodes: PlacedNode[];
  links: PlacedLink[];
  width: number;
  height: number;
}

function layoutHourglass(
  ancestors: AncestorNode,
  descendants: DescendantNode
): LayoutResult {
  const nodeSpan = NODE_W + H_GAP;
  const nodes: PlacedNode[] = [];
  const links: PlacedLink[] = [];

  const aDepth = ancestorDepth(ancestors);
  const aLeaves = ancestorLeafCount(ancestors);
  const dLeaves = Math.max(descendantLeafCount(descendants), 1);

  const totalLeaves = Math.max(aLeaves, dLeaves);
  const totalWidth = totalLeaves * nodeSpan;

  const baselineY = aDepth * (NODE_H + V_GAP);

  const aWidth = aLeaves * nodeSpan;
  const aLeftEdge = (totalWidth - aWidth) / 2;

  const ancestorPos = layoutAncestors(
    ancestors,
    0,
    aLeftEdge,
    baselineY,
    nodes,
    links
  );

  const dTopY = baselineY;
  const dNodes: PlacedNode[] = [];
  const dLinks: PlacedLink[] = [];
  const descPos = layoutDescendants(
    descendants,
    0,
    0,
    dTopY,
    dNodes,
    dLinks,
    true
  );

  const dShift = ancestorPos.x - descPos.x;
  for (const n of dNodes) n.x += dShift;
  for (const l of dLinks) {
    l.fromX += dShift;
    l.toX += dShift;
  }

  nodes.push(...dNodes);
  links.push(...dLinks);

  // Compute bounds
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + NODE_W);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y + NODE_H);
  }

  if (nodes.length > 0) {
    for (const n of nodes) {
      n.x -= minX;
      n.y -= minY;
    }
    for (const l of links) {
      l.fromX -= minX;
      l.toX -= minX;
      l.fromY -= minY;
      l.toY -= minY;
    }
  }

  return {
    nodes,
    links,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ── Rendering ──────────────────────────────────────────────────────

function truncate(text: string, maxWidth: number, fontSize: number): string {
  const charWidth = fontSize * 0.55;
  const maxChars = Math.max(1, Math.floor((maxWidth - 16) / charWidth));
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 3)) + "...";
}

interface PedigreeChartProps {
  data: GrampsData;
  selectedHandle: string;
  onBack: () => void;
}

export default function PedigreeChart({
  data,
  selectedHandle,
  onBack,
}: PedigreeChartProps) {
  const [zoom, setZoom] = useState(1);
  const [maxUp, setMaxUp] = useState(4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [expandedSiblings, setExpandedSiblings] = useState<Set<string>>(new Set());
  const panRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const hourglass = useMemo(
    () => buildHourglass(selectedHandle, data, maxUp),
    [selectedHandle, data, maxUp]
  );

  const { filteredDescendants, hiddenSiblingMap } = useMemo(() => {
    const hiddenMap: HiddenSiblingMap = new Map();
    const filtered = filterDescendantTree(
      hourglass.descendants,
      hourglass.directLine,
      expandedSiblings,
      selectedHandle,
      hiddenMap
    );
    return { filteredDescendants: filtered, hiddenSiblingMap: hiddenMap };
  }, [hourglass, expandedSiblings, selectedHandle]);

  const { nodes, links, width: contentW, height: contentH } = useMemo(
    () => layoutHourglass(hourglass.ancestors, filteredDescendants),
    [hourglass.ancestors, filteredDescendants]
  );

  // Enrich nodes with hidden sibling counts
  const enrichedNodes = useMemo(() => {
    return nodes.map((n) => {
      const count = hiddenSiblingMap.get(n.info.handle);
      if (count !== undefined) {
        return { ...n, hiddenSiblings: count };
      }
      return n;
    });
  }, [nodes, hiddenSiblingMap]);

  const toggleSiblings = useCallback((handle: string) => {
    setExpandedSiblings((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) {
        next.delete(handle);
      } else {
        next.add(handle);
      }
      return next;
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => applyWheelZoom(prev, e.deltaY));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!panRef.current) return;
      setPan({
        x: panRef.current.panX + (e.clientX - panRef.current.startX),
        y: panRef.current.panY + (e.clientY - panRef.current.startY),
      });
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    panRef.current = null;
  }, []);

  // SVG always fills the viewport; content is scaled to fit inside
  const svgW = window.innerWidth;
  const svgH = window.innerHeight - 60;

  const availW = svgW - MARGIN * 2;
  const availH = svgH - MARGIN * 2;

  const fitScale = Math.min(
    availW / Math.max(contentW, 1),
    availH / Math.max(contentH, 1)
  );
  const scale = fitScale * zoom;

  const offsetX =
    MARGIN + (availW - contentW * scale) / 2 + pan.x;
  const offsetY =
    MARGIN + (availH - contentH * scale) / 2 + pan.y;

  return (
    <div className="pedigree-chart">
      <div className="chart-toolbar">
        <button onClick={onBack}>Back to person list</button>
        <label>
          Ancestor depth:
          <select
            value={maxUp}
            onChange={(e) => setMaxUp(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </button>
      </div>
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{
          cursor: panRef.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onWheelCapture={(e) => e.preventDefault()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g transform={`translate(${offsetX},${offsetY}) scale(${scale})`}>
          {/* Links */}
          {links.map((l) => {
            if (l.isMarriage) {
              // Horizontal marriage line
              return (
                <line
                  key={l.key}
                  x1={l.fromX}
                  y1={l.fromY}
                  x2={l.toX}
                  y2={l.toY}
                  stroke="#e57373"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
              );
            }
            const midY = (l.fromY + l.toY) / 2;
            return (
              <path
                key={l.key}
                d={`M${l.fromX},${l.fromY}V${midY}H${l.toX}V${l.toY}`}
                fill="none"
                stroke="#a9a9a9"
                strokeWidth={1.25}
              />
            );
          })}
          {/* Nodes */}
          {enrichedNodes.map((n) => {
            const p = n.info;
            const isSelected = p.isSelected;
            const bgFill = isSelected
              ? "#e8f0fe"
              : p.isPrivate
                ? "#f0f0f0"
                : "#fff";
            const strokeColor = isSelected
              ? "#4285f4"
              : p.isPrivate
                ? "#b0b0b0"
                : "#c9c9c9";

            // Expander arrow for hidden siblings
            const hasHidden = n.hiddenSiblings !== undefined && n.hiddenSiblings > 0;
            const isExpanded = expandedSiblings.has(p.handle);
            // Men/unknown: arrow left; Women: arrow right
            const arrowOnLeft = p.gender !== 0; // 1=male, 2=unknown → left
            const arrowSize = 8;
            const arrowX = arrowOnLeft ? -20 : NODE_W + 12;
            const arrowY = NODE_H / 2;

            return (
              <g key={p.id} transform={`translate(${n.x},${n.y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={bgFill}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <circle
                  cx={NODE_W / 2}
                  cy={22}
                  r={16}
                  fill={isSelected ? "#4285f4" : p.isPrivate ? "#b0b0b0" : "#94a3b8"}
                />
                <text
                  x={NODE_W / 2}
                  y={22}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  fontSize={13}
                  fontWeight={600}
                >
                  {(p.name?.charAt(0) || "?").toUpperCase()}
                </text>
                <text
                  x={NODE_W / 2}
                  y={54}
                  textAnchor="middle"
                  fill="#222d38"
                  fontSize={12}
                  fontWeight={600}
                >
                  {truncate(p.name, NODE_W, 12)}
                </text>
                <text
                  x={NODE_W / 2}
                  y={72}
                  textAnchor="middle"
                  fill="#616f80"
                  fontSize={11}
                >
                  {truncate(p.dates, NODE_W, 11)}
                </text>
                {p.place && (
                  <text
                    x={NODE_W / 2}
                    y={90}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={10}
                  >
                    {truncate(p.place, NODE_W, 10)}
                  </text>
                )}
                {/* Sibling expander arrow */}
                {(hasHidden || isExpanded) && (
                  <g
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSiblings(p.handle);
                    }}
                  >
                    {/* Hit area */}
                    <rect
                      x={arrowX - 12}
                      y={arrowY - 16}
                      width={32}
                      height={32}
                      fill="transparent"
                    />
                    {/* Arrow triangle: collapsed = outward (◀ left, ▶ right), expanded = inward */}
                    <polygon
                      points={
                        isExpanded
                          ? // Expanded: arrow points inward (▶ for left-side, ◀ for right-side)
                            arrowOnLeft
                            ? `${arrowX + arrowSize},${arrowY} ${arrowX - arrowSize},${arrowY - arrowSize} ${arrowX - arrowSize},${arrowY + arrowSize}`
                            : `${arrowX - arrowSize},${arrowY} ${arrowX + arrowSize},${arrowY - arrowSize} ${arrowX + arrowSize},${arrowY + arrowSize}`
                          : // Collapsed: arrow points outward (◀ for left-side, ▶ for right-side)
                            arrowOnLeft
                            ? `${arrowX - arrowSize},${arrowY} ${arrowX + arrowSize},${arrowY - arrowSize} ${arrowX + arrowSize},${arrowY + arrowSize}`
                            : `${arrowX + arrowSize},${arrowY} ${arrowX - arrowSize},${arrowY - arrowSize} ${arrowX - arrowSize},${arrowY + arrowSize}`
                      }
                      fill="#4285f4"
                    />
                    {/* Sibling count badge */}
                    {hasHidden && !isExpanded && (
                      <>
                        <circle
                          cx={arrowX}
                          cy={arrowY - 14}
                          r={9}
                          fill="#e57373"
                        />
                        <text
                          x={arrowX}
                          y={arrowY - 14}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#fff"
                          fontSize={9}
                          fontWeight={700}
                        >
                          +{n.hiddenSiblings}
                        </text>
                      </>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
