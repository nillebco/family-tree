import { useCallback, useMemo, useRef, useState } from "react";
import type { OrgChartNode } from "@arielladigitalconsulting/new-react-org-chart";
import { applyWheelZoom } from "@arielladigitalconsulting/new-react-org-chart";
import type { GrampsData } from "../types/gramps";
import { buildPedigreeTree } from "../utils/treeBuilder";

const NODE_W = 200;
const NODE_H = 140;
const H_GAP = 24;
const V_GAP = 60;
const MARGIN = 40;

interface LayoutNode {
  node: OrgChartNode;
  x: number;
  y: number;
  children: LayoutNode[];
}

/** Count leaf nodes in subtree */
function leafCount(node: OrgChartNode): number {
  if (!node.children || node.children.length === 0) return 1;
  let total = 0;
  for (const c of node.children) total += leafCount(c);
  return total;
}

/** Layout tree with proper subtree-width-aware positioning */
function layoutTree(root: OrgChartNode): {
  nodes: LayoutNode[];
  width: number;
  height: number;
} {
  const allNodes: LayoutNode[] = [];
  const nodeSpan = NODE_W + H_GAP;
  let maxDepth = 0;

  function layout(
    node: OrgChartNode,
    depth: number,
    leftEdge: number
  ): LayoutNode {
    maxDepth = Math.max(maxDepth, depth);
    const y = depth * (NODE_H + V_GAP);

    const children = node.children ?? [];
    if (children.length === 0) {
      const ln: LayoutNode = {
        node,
        x: leftEdge,
        y,
        children: [],
      };
      allNodes.push(ln);
      return ln;
    }

    // Layout children left-to-right, each getting space proportional to leaf count
    const childLayouts: LayoutNode[] = [];
    let cursor = leftEdge;
    for (const child of children) {
      const width = leafCount(child) * nodeSpan;
      const childLayout = layout(child, depth + 1, cursor);
      childLayouts.push(childLayout);
      cursor += width;
    }

    // Center this node over its children
    const firstChild = childLayouts[0];
    const lastChild = childLayouts[childLayouts.length - 1];
    const x =
      (firstChild.x + lastChild.x) / 2;

    const ln: LayoutNode = {
      node,
      x,
      y,
      children: childLayouts,
    };
    allNodes.push(ln);
    return ln;
  }

  layout(root, 0, 0);

  const totalLeaves = leafCount(root);
  const width = totalLeaves * nodeSpan - H_GAP;
  const height = (maxDepth + 1) * (NODE_H + V_GAP) - V_GAP;

  return { nodes: allNodes, width, height };
}

/** Truncate text to fit in a given pixel width */
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
  const panRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const tree = useMemo(
    () => buildPedigreeTree(selectedHandle, data, maxUp),
    [selectedHandle, data, maxUp]
  );

  const { nodes, width: contentW, height: contentH } = useMemo(
    () => layoutTree(tree),
    [tree]
  );

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

  const svgW = Math.max(contentW + MARGIN * 2, window.innerWidth);
  const svgH = Math.max(contentH + MARGIN * 2, window.innerHeight - 60);

  // Auto-fit scale
  const fitScale = Math.min(
    (svgW - MARGIN * 2) / Math.max(contentW, 1),
    (svgH - MARGIN * 2) / Math.max(contentH, 1)
  );
  const scale = fitScale * zoom;

  const offsetX =
    MARGIN + ((svgW - MARGIN * 2) - contentW * scale) / 2 + pan.x;
  const offsetY =
    MARGIN + ((svgH - MARGIN * 2) - contentH * scale) / 2 + pan.y;

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
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
          Reset view
        </button>
      </div>
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ cursor: panRef.current ? "grabbing" : "grab", touchAction: "none" }}
        onWheelCapture={(e) => e.preventDefault()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g transform={`translate(${offsetX},${offsetY}) scale(${scale})`}>
          {/* Links */}
          {nodes.map((ln) =>
            ln.children.map((child) => {
              const px = ln.x + NODE_W / 2;
              const py = ln.y + NODE_H;
              const cx = child.x + NODE_W / 2;
              const cy = child.y;
              const midY = py + V_GAP / 2;
              return (
                <path
                  key={`${ln.node.id}-${child.node.id}`}
                  d={`M${px},${py}V${midY}H${cx}V${cy}`}
                  fill="none"
                  stroke="#a9a9a9"
                  strokeWidth={1.25}
                />
              );
            })
          )}
          {/* Nodes */}
          {nodes.map((ln) => {
            const p = ln.node.person;
            const isSelected = p.totalReports === -1;
            const cornerR = 8;
            return (
              <g key={ln.node.id} transform={`translate(${ln.x},${ln.y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={cornerR}
                  fill={isSelected ? "#e8f0fe" : "#fff"}
                  stroke={isSelected ? "#4285f4" : "#c9c9c9"}
                  strokeWidth={isSelected ? 2 : 1}
                />
                {/* Avatar circle */}
                <circle
                  cx={NODE_W / 2}
                  cy={28}
                  r={18}
                  fill={isSelected ? "#4285f4" : "#94a3b8"}
                />
                <text
                  x={NODE_W / 2}
                  y={28}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  fontSize={14}
                  fontWeight={600}
                >
                  {(p.name?.charAt(0) || "?").toUpperCase()}
                </text>
                {/* Name */}
                <text
                  x={NODE_W / 2}
                  y={62}
                  textAnchor="middle"
                  fill="#222d38"
                  fontSize={13}
                  fontWeight={600}
                >
                  {truncate(p.name, NODE_W, 13)}
                </text>
                {/* Dates */}
                <text
                  x={NODE_W / 2}
                  y={82}
                  textAnchor="middle"
                  fill="#616f80"
                  fontSize={11}
                >
                  {truncate(p.title, NODE_W, 11)}
                </text>
                {/* Place */}
                {p.department && (
                  <text
                    x={NODE_W / 2}
                    y={100}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={10}
                  >
                    {truncate(p.department, NODE_W, 10)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
