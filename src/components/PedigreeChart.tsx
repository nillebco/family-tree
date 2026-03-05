import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyWheelZoom } from "../utils/wheelZoom";
import type { GrampsData } from "../types/gramps";
import { buildHourglass } from "../utils/treeBuilder";
import { layoutHourglass, NODE_W, NODE_H } from "../utils/hourglassLayout";
import { exportGrampsNdjson } from "../utils/grampsParser";
import PersonDetailPanel from "./PersonDetailPanel";

const MARGIN = 40;

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
  initialCreateMode?: boolean;
  onBack: () => void;
  onDataChanged: (data: GrampsData) => void;
}

export default function PedigreeChart({
  data,
  selectedHandle,
  initialCreateMode,
  onBack,
  onDataChanged,
}: PedigreeChartProps) {
  const includePrivate = useMemo(
    () => new URLSearchParams(window.location.search).has("private"),
    []
  );
  const [zoom, setZoom] = useState(1);
  const [maxUp, setMaxUp] = useState(4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const [detailHandle, setDetailHandle] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState(!!initialCreateMode);
  const [expandedSiblings, setExpandedSiblings] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedSiblingChildren, setExpandedSiblingChildren] = useState<Set<string>>(
    () => new Set()
  );

  const toggleSiblings = useCallback((handle: string) => {
    setExpandedSiblings((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }, []);

  const toggleSiblingChildren = useCallback((handle: string) => {
    setExpandedSiblingChildren((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const ndjson = exportGrampsNdjson(data);
    const blob = new Blob([ndjson], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gramps-export.ndjson";
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);
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

  const { nodes, links, width: contentW, height: contentH } = useMemo(
    () =>
      layoutHourglass(
        hourglass.ancestors,
        hourglass.selectedDescendants,
        expandedSiblings,
        expandedSiblingChildren
      ),
    [hourglass.ancestors, hourglass.selectedDescendants, expandedSiblings, expandedSiblingChildren]
  );

  const enrichedNodes = nodes;

  // Attach wheel handler natively with { passive: false } so preventDefault works
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((prev) => applyWheelZoom(prev, e.deltaY));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsPanning(true);
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
    setIsPanning(false);
  }, []);

  const PANEL_WIDTH = 360;
  // SVG always fills the viewport; content is scaled to fit inside
  const svgW = detailHandle ? window.innerWidth - PANEL_WIDTH : window.innerWidth;
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
        <button onClick={handleExport}>Export NDJSON</button>
      </div>
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{
          cursor: isPanning ? "grabbing" : "grab",
          touchAction: "none",
        }}
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
            const isMale = p.gender === 1;
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

            // Badge position: LEFT for males, RIGHT for females
            const badgeX = isMale ? 4 : NODE_W - 4;
            const collapseArrow = isMale ? "\u25B6" : "\u25C0";

            return (
              <g
                key={p.id}
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setDetailHandle(p.handle)}
              >
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
                {n.siblingCount != null && n.siblingCount > 0 && (
                  <g
                    transform={`translate(${badgeX}, ${NODE_H - 4})`}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSiblings(p.handle);
                    }}
                  >
                    <rect
                      x={-14}
                      y={-10}
                      width={28}
                      height={20}
                      rx={10}
                      fill={expandedSiblings.has(p.handle) ? "#4285f4" : "#94a3b8"}
                    />
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#fff"
                      fontSize={10}
                      fontWeight={600}
                    >
                      {expandedSiblings.has(p.handle)
                        ? `${collapseArrow} ${n.siblingCount}`
                        : `+${n.siblingCount}`}
                    </text>
                  </g>
                )}
                {n.childCount != null && n.childCount > 0 && (
                  <g
                    transform={`translate(${NODE_W / 2}, ${NODE_H + 2})`}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSiblingChildren(p.handle);
                    }}
                  >
                    <rect
                      x={-14}
                      y={-10}
                      width={28}
                      height={20}
                      rx={10}
                      fill={expandedSiblingChildren.has(p.handle) ? "#e57373" : "#94a3b8"}
                    />
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#fff"
                      fontSize={10}
                      fontWeight={600}
                    >
                      {expandedSiblingChildren.has(p.handle)
                        ? `\u25B2 ${n.childCount}`
                        : `\u25BC ${n.childCount}`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {detailHandle && (
        <PersonDetailPanel
          handle={detailHandle}
          data={data}
          includePrivate={includePrivate}
          onClose={() => setDetailHandle(null)}
          onNavigate={(h) => setDetailHandle(h)}
          onDataChanged={onDataChanged}
        />
      )}
      {createMode && (
        <PersonDetailPanel
          handle=""
          createMode
          data={data}
          includePrivate={includePrivate}
          onClose={() => setCreateMode(false)}
          onNavigate={(h) => {
            setCreateMode(false);
            setDetailHandle(h);
          }}
          onDataChanged={onDataChanged}
        />
      )}
      {!detailHandle && !createMode && (
        <button className="fab-add-person" onClick={() => setCreateMode(true)} title="Add new person">+</button>
      )}
    </div>
  );
}
