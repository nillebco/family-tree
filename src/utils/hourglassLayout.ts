import type { AncestorNode, DescendantNode, NodeInfo, SiblingNode } from "./treeBuilder";

export const NODE_W = 200;
export const NODE_H = 120;
export const H_GAP = 24;
export const V_GAP = 60;
export const SPOUSE_GAP = 8;

export interface PlacedNode {
  info: NodeInfo;
  x: number;
  y: number;
  siblingCount?: number;
  childCount?: number; // total children across all families (for sibling nodes)
}

export interface PlacedLink {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  key: string;
  isMarriage?: boolean;
}

export interface LayoutResult {
  nodes: PlacedNode[];
  links: PlacedLink[];
  width: number;
  height: number;
}

// ── Sibling children helpers ────────────────────────────────────────

/** Count direct children across all families of a SiblingNode */
function siblingDirectChildCount(sib: SiblingNode): number {
  let count = 0;
  for (const fam of sib.families) count += fam.children.length;
  return count;
}

/** Count how many horizontal slots a sibling (or sibling child) occupies, recursively */
export function siblingSlotCount(
  sib: SiblingNode,
  expandedSiblingChildren: Set<string>
): number {
  if (!expandedSiblingChildren.has(sib.info.handle)) return 1;
  const totalChildren = siblingDirectChildCount(sib);
  if (totalChildren === 0) return 1;
  // Each family needs at least 2 slots (couple) or sum of child slot widths
  let totalSlots = 0;
  for (const fam of sib.families) {
    const hasSpouse = !!fam.spouse;
    const coupleSlots = hasSpouse ? 2 : 1;
    let childSlots = 0;
    for (const child of fam.children) {
      childSlots += siblingSlotCount(child, expandedSiblingChildren);
    }
    totalSlots += Math.max(coupleSlots, childSlots);
  }
  return Math.max(1, totalSlots);
}

/** Place a sibling's spouse and children below them, recursively */
function layoutSiblingFamily(
  sib: SiblingNode,
  sibX: number,
  sibY: number,
  nodes: PlacedNode[],
  links: PlacedLink[],
  expandedSiblingChildren: Set<string>
): void {
  const nodeSpan = NODE_W + H_GAP;
  const coupleSpan = NODE_W + SPOUSE_GAP;

  let cursor = sibX; // leftEdge for this sibling's children

  for (const fam of sib.families) {
    const hasSpouse = !!fam.spouse;
    const childY = sibY + NODE_H + V_GAP;

    if (fam.children.length === 0) {
      // Just place spouse next to sibling
      if (fam.spouse) {
        const spouseX = sibX + coupleSpan;
        nodes.push({ info: fam.spouse, x: spouseX, y: sibY });
        links.push({
          fromX: spouseX,
          fromY: sibY + NODE_H / 2,
          toX: sibX + NODE_W,
          toY: sibY + NODE_H / 2,
          key: `sm-${sib.info.id}-${fam.spouse.id}`,
          isMarriage: true,
        });
      }
      continue;
    }

    // Place children
    const childPositions: { x: number }[] = [];
    for (const child of fam.children) {
      const cx = cursor;
      const directChildren = siblingDirectChildCount(child);
      nodes.push({
        info: child.info,
        x: cx,
        y: childY,
        childCount: directChildren || undefined,
      });
      childPositions.push({ x: cx });
      // If this child is expanded, recurse to place their family
      if (expandedSiblingChildren.has(child.info.handle)) {
        layoutSiblingFamily(child, cx, childY, nodes, links, expandedSiblingChildren);
      }
      cursor += siblingSlotCount(child, expandedSiblingChildren) * nodeSpan;
    }

    // Place spouse next to sibling
    if (fam.spouse) {
      const spouseX = sibX + coupleSpan;
      nodes.push({ info: fam.spouse, x: spouseX, y: sibY });
      links.push({
        fromX: spouseX,
        fromY: sibY + NODE_H / 2,
        toX: sibX + NODE_W,
        toY: sibY + NODE_H / 2,
        key: `sm-${sib.info.id}-${fam.spouse.id}`,
        isMarriage: true,
      });
    }

    // Drop point for parent-child links
    const dropX = hasSpouse
      ? (sibX + NODE_W / 2 + sibX + coupleSpan + NODE_W / 2) / 2
      : sibX + NODE_W / 2;

    for (const cp of childPositions) {
      links.push({
        fromX: dropX,
        fromY: sibY + NODE_H,
        toX: cp.x + NODE_W / 2,
        toY: childY,
        key: `sc-${sib.info.id}-${cp.x}`,
      });
    }
  }
}

// ── Ancestor layout (fans out UPWARD) ──────────────────────────────

export function ancestorLeafCount(
  node: AncestorNode,
  expandedSiblings: Set<string>,
  expandedSiblingChildren: Set<string> = new Set(),
  descendantExtraSlots: number = 0
): number {
  const expanded = expandedSiblings.has(node.info.handle);
  let siblingSlots = 0;
  if (expanded) {
    for (const sib of node.siblings) {
      siblingSlots += siblingSlotCount(sib, expandedSiblingChildren);
    }
  }

  if (!node.father && !node.mother) return 1 + siblingSlots + descendantExtraSlots;

  let parentCount = 0;
  if (node.father)
    parentCount += ancestorLeafCount(node.father, expandedSiblings, expandedSiblingChildren, 0);
  if (node.mother)
    parentCount += ancestorLeafCount(node.mother, expandedSiblings, expandedSiblingChildren, 0);
  return parentCount + siblingSlots + descendantExtraSlots;
}

export function ancestorDepth(node: AncestorNode): number {
  let d = 0;
  if (node.father) d = Math.max(d, 1 + ancestorDepth(node.father));
  if (node.mother) d = Math.max(d, 1 + ancestorDepth(node.mother));
  return d;
}

export function layoutAncestors(
  node: AncestorNode,
  generation: number,
  leftEdge: number,
  baselineY: number,
  nodes: PlacedNode[],
  links: PlacedLink[],
  expandedSiblings: Set<string>,
  cumulativeSibOffset: number = 0,
  expandedSiblingChildren: Set<string> = new Set(),
  descendantExtraSlots: number = 0
): { x: number; width: number } {
  const nodeSpan = NODE_W + H_GAP;
  const y = baselineY - generation * (NODE_H + V_GAP);

  const expanded = expandedSiblings.has(node.info.handle);
  let siblingSlots = 0;
  if (expanded) {
    for (const sib of node.siblings) {
      siblingSlots += siblingSlotCount(sib, expandedSiblingChildren);
    }
  }
  const isMale = node.info.gender === 1;

  const parents: AncestorNode[] = [];
  if (node.father) parents.push(node.father);
  if (node.mother) parents.push(node.mother);

  // ── Leaf case (no parents) ──
  if (parents.length === 0) {
    let x: number;

    if (expanded && isMale) {
      x = leftEdge + (siblingSlots + descendantExtraSlots) * nodeSpan;
      let cursor = leftEdge;
      for (const sib of node.siblings) {
        const slotWidth = siblingSlotCount(sib, expandedSiblingChildren);
        const sx = cursor;
        const directChildren = siblingDirectChildCount(sib);
        nodes.push({ info: sib.info, x: sx, y, childCount: directChildren || undefined });
        if (expandedSiblingChildren.has(sib.info.handle)) {
          layoutSiblingFamily(sib, sx, y, nodes, links, expandedSiblingChildren);
        }
        cursor += slotWidth * nodeSpan;
      }
    } else {
      x = leftEdge;
      if (expanded) {
        let cursor = leftEdge + (1 + descendantExtraSlots) * nodeSpan;
        for (const sib of node.siblings) {
          const slotWidth = siblingSlotCount(sib, expandedSiblingChildren);
          const sx = cursor;
          const totalChildren = sib.families.reduce((sum, f) => sum + f.children.length, 0);
          nodes.push({ info: sib.info, x: sx, y, childCount: totalChildren || undefined });
          if (expandedSiblingChildren.has(sib.info.handle)) {
            layoutSiblingFamily(sib, sx, y, nodes, links, expandedSiblingChildren);
          }
          cursor += slotWidth * nodeSpan;
        }
      }
    }

    nodes.push({ info: node.info, x, y, siblingCount: node.siblings.length });
    return { x, width: (1 + siblingSlots + descendantExtraSlots) * nodeSpan };
  }

  // ── Node with parents ──
  // Males: siblings LEFT, allocated at leftEdge, parent subtree shifted right.
  // Females: parent subtree at leftEdge, siblings extend right.
  const siblingsOnLeft = isMale && expanded;

  let parentLeftEdge = leftEdge;
  if (siblingsOnLeft) {
    parentLeftEdge = leftEdge + siblingSlots * nodeSpan;
  }

  // Pass cumulativeSibOffset + this node's siblingSlots to parents,
  // so parent-level siblings are pushed further out.
  const childOffset = cumulativeSibOffset + siblingSlots;

  let cursor = parentLeftEdge;
  const parentPositions: { x: number; width: number }[] = [];
  for (const parent of parents) {
    const leafWidth = ancestorLeafCount(parent, expandedSiblings, expandedSiblingChildren) * nodeSpan;
    const pos = layoutAncestors(
      parent,
      generation + 1,
      cursor,
      baselineY,
      nodes,
      links,
      expandedSiblings,
      childOffset,
      expandedSiblingChildren
    );
    parentPositions.push(pos);
    cursor += leafWidth;
  }

  const firstParentX = parentPositions[0].x;
  const lastParentX = parentPositions[parentPositions.length - 1].x;
  const x = (firstParentX + lastParentX) / 2;
  const totalWidth = cursor - leftEdge + (!siblingsOnLeft && expanded ? (siblingSlots + descendantExtraSlots) * nodeSpan : descendantExtraSlots * nodeSpan);

  nodes.push({ info: node.info, x, y, siblingCount: node.siblings.length });

  // Place expanded siblings, offset by cumulativeSibOffset so that
  // parent-level siblings are further from the direct line than child-level.
  if (expanded) {
    if (isMale) {
      // Siblings to the LEFT, pushed out by cumulative offset
      let sibCursor = 0;
      for (const sib of node.siblings) {
        const slotWidth = siblingSlotCount(sib, expandedSiblingChildren);
        const sx = x - (cumulativeSibOffset + descendantExtraSlots + sibCursor + slotWidth) * nodeSpan;
        const directChildren = siblingDirectChildCount(sib);
        nodes.push({ info: sib.info, x: sx, y, childCount: directChildren || undefined });
        if (expandedSiblingChildren.has(sib.info.handle)) {
          layoutSiblingFamily(sib, sx, y, nodes, links, expandedSiblingChildren);
        }
        for (let pi = 0; pi < parents.length; pi++) {
          const px = parentPositions[pi].x + NODE_W / 2;
          const py = y - (NODE_H + V_GAP) + NODE_H;
          links.push({
            fromX: px,
            fromY: py,
            toX: sx + NODE_W / 2,
            toY: y,
            key: `a-${parents[pi].info.id}-sib-${sib.info.id}`,
          });
        }
        sibCursor += slotWidth;
      }
    } else {
      // Siblings to the RIGHT, pushed out by cumulative offset
      let sibCursor = 0;
      for (const sib of node.siblings) {
        const slotWidth = siblingSlotCount(sib, expandedSiblingChildren);
        const sx = x + (cumulativeSibOffset + descendantExtraSlots + sibCursor + 1) * nodeSpan;
        const directChildren = siblingDirectChildCount(sib);
        nodes.push({ info: sib.info, x: sx, y, childCount: directChildren || undefined });
        if (expandedSiblingChildren.has(sib.info.handle)) {
          layoutSiblingFamily(sib, sx, y, nodes, links, expandedSiblingChildren);
        }
        for (let pi = 0; pi < parents.length; pi++) {
          const px = parentPositions[pi].x + NODE_W / 2;
          const py = y - (NODE_H + V_GAP) + NODE_H;
          links.push({
            fromX: px,
            fromY: py,
            toX: sx + NODE_W / 2,
            toY: y,
            key: `a-${parents[pi].info.id}-sib-${sib.info.id}`,
          });
        }
        sibCursor += slotWidth;
      }
    }
  }

  // Links from parents to the direct-line person
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

export function descendantLeafCount(node: DescendantNode): number {
  if (node.families.length === 0) return 1;
  let total = 0;
  for (const fam of node.families) {
    total += familyLeafCount(fam.children, !!fam.spouse);
  }
  return total;
}

function layoutFamily(
  personInfo: NodeInfo,
  spouseInfo: NodeInfo | undefined,
  children: DescendantNode[],
  generation: number,
  leftEdge: number,
  topY: number,
  nodes: PlacedNode[],
  links: PlacedLink[],
  placePerson: boolean
): { personX: number; width: number } {
  const nodeSpan = NODE_W + H_GAP;
  const coupleSpan = NODE_W + SPOUSE_GAP;
  const y = topY + generation * (NODE_H + V_GAP);
  const hasSpouse = !!spouseInfo;
  const totalSlots = familyLeafCount(children, hasSpouse);
  const totalWidth = totalSlots * nodeSpan;

  if (children.length === 0) {
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

  let cursor = leftEdge;
  const childPositions: { x: number }[] = [];
  for (const child of children) {
    const leafWidth = descendantLeafCount(child) * nodeSpan;
    const pos = layoutDescendants(
      child,
      generation + 1,
      cursor,
      topY,
      nodes,
      links
    );
    childPositions.push(pos);
    cursor += leafWidth;
  }

  const firstChildX = childPositions[0].x;
  const lastChildX = childPositions[childPositions.length - 1].x;

  let personX: number;
  if (hasSpouse) {
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
    dropX = (personX + NODE_W / 2 + spouseX + NODE_W / 2) / 2;
  } else {
    dropX = personX + NODE_W / 2;
  }

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
    const x = leftEdge;
    if (!skipRoot) {
      const y = topY + generation * (NODE_H + V_GAP);
      nodes.push({ info: node.info, x, y });
    }
    return { x, width: nodeSpan };
  }

  let cursor = leftEdge;
  let personX = leftEdge;

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
      if (fam.spouse) {
        const y = topY + generation * (NODE_H + V_GAP);
        const spouseX = result.personX;
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

export function layoutHourglass(
  ancestors: AncestorNode,
  selectedDescendants: DescendantNode,
  expandedSiblings: Set<string>,
  expandedSiblingChildren: Set<string> = new Set()
): LayoutResult {
  const nodeSpan = NODE_W + H_GAP;
  const nodes: PlacedNode[] = [];
  const links: PlacedLink[] = [];

  const aDepth = ancestorDepth(ancestors);
  const sdLeaves = Math.max(descendantLeafCount(selectedDescendants), 1);

  // Pre-compute descendant extent to avoid sibling/descendant overlap
  let descendantExtraSlots = 0;
  const hasExpandedSiblings =
    expandedSiblings.has(ancestors.info.handle) && ancestors.siblings.length > 0;
  if (hasExpandedSiblings && selectedDescendants.families.length > 0) {
    const preNodes: PlacedNode[] = [];
    const preLinks: PlacedLink[] = [];
    const prePos = layoutDescendants(
      selectedDescendants, 0, 0, 0, preNodes, preLinks, true
    );
    const isMale = ancestors.info.gender === 1;
    if (isMale) {
      // Siblings go LEFT; descendants extend LEFT by prePos.x pixels
      descendantExtraSlots = Math.max(0, Math.ceil(prePos.x / nodeSpan));
    } else {
      // Siblings go RIGHT; descendants extend RIGHT
      let maxX = 0;
      for (const n of preNodes) maxX = Math.max(maxX, n.x + NODE_W);
      const rightExtent = Math.max(0, maxX - prePos.x - NODE_W);
      descendantExtraSlots = Math.max(0, Math.ceil(rightExtent / nodeSpan));
    }
  }

  const aLeaves = ancestorLeafCount(
    ancestors, expandedSiblings, expandedSiblingChildren, descendantExtraSlots
  );

  const totalLeaves = Math.max(aLeaves, sdLeaves);
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
    links,
    expandedSiblings,
    0,
    expandedSiblingChildren,
    descendantExtraSlots
  );

  if (selectedDescendants.families.length > 0) {
    const sdNodes: PlacedNode[] = [];
    const sdLinks: PlacedLink[] = [];
    const sdPos = layoutDescendants(
      selectedDescendants,
      0,
      0,
      baselineY,
      sdNodes,
      sdLinks,
      true
    );

    const sdShift = ancestorPos.x - sdPos.x;
    for (const n of sdNodes) n.x += sdShift;
    for (const l of sdLinks) {
      l.fromX += sdShift;
      l.toX += sdShift;
    }

    nodes.push(...sdNodes);
    links.push(...sdLinks);
  }

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
