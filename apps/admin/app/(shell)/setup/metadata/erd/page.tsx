"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { PageFrame, StatePanel } from "@athyper/platform-surface-kit";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge } from "@athyper/platform-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ErdNode {
  id: string;
  name: string;
  label: string | null;
  entity_class: string;
  module_id: string;
}

interface ErdEdge {
  id: string;
  from_entity: string;
  to_entity: string;
  relation_name: string;
  relation_kind: string;
  fk_field: string | null;
}

interface ErdData {
  nodes: ErdNode[];
  edges: ErdEdge[];
  modules: string[];
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 56;
const COL_GAP = 60;
const ROW_GAP = 40;
const COLS = 5;

function layoutNodes(nodes: ErdNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    positions.set(node.name, {
      x: col * (NODE_W + COL_GAP) + 20,
      y: row * (NODE_H + ROW_GAP) + 20,
    });
  });
  return positions;
}

// ─── Class colours ────────────────────────────────────────────────────────────

type ClassColor = { bg: string; border: string; text: string };

const DEFAULT_CLASS_COLOR: ClassColor = { bg: "#f8fafc", border: "#94a3b8", text: "#475569" };

const CLASS_COLOR: Record<string, ClassColor> = {
  MASTER:    { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8" },
  DOCUMENT:  { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
  CONTROL:   DEFAULT_CLASS_COLOR,
  REFERENCE: { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
  LOG:       { bg: "#fff7ed", border: "#f97316", text: "#9a3412" },
  ANALYTICS: { bg: "#faf5ff", border: "#a855f7", text: "#6b21a8" },
};

// ─── Canvas ───────────────────────────────────────────────────────────────────

function ErdCanvas({
  nodes,
  edges,
  onNodeClick,
  nodeIdMap,
}: {
  nodes: ErdNode[];
  edges: ErdEdge[];
  onNodeClick: (nodeId: string) => void;
  nodeIdMap: Map<string, string>; // name → id
}) {
  const positions = layoutNodes(nodes);
  const totalCols = Math.min(nodes.length, COLS);
  const totalRows = Math.ceil(nodes.length / COLS);
  const svgW = totalCols * (NODE_W + COL_GAP) + 40;
  const svgH = totalRows * (NODE_H + ROW_GAP) + 40;

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Build edges only for nodes in current view
  const nodeNames = new Set(nodes.map((n) => n.name));
  const visibleEdges = edges.filter(
    (e) => nodeNames.has(e.from_entity) && nodeNames.has(e.to_entity),
  );

  return (
    <div className="overflow-auto rounded-lg border bg-muted/30">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="block"
        style={{ minWidth: svgW }}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Edges */}
        {visibleEdges.map((edge) => {
          const fromPos = positions.get(edge.from_entity);
          const toPos = positions.get(edge.to_entity);
          if (!fromPos || !toPos) return null;

          const x1 = fromPos.x + NODE_W;
          const y1 = fromPos.y + NODE_H / 2;
          const x2 = toPos.x;
          const y2 = toPos.y + NODE_H / 2;
          const cx1 = x1 + Math.abs(x2 - x1) / 3;
          const cx2 = x2 - Math.abs(x2 - x1) / 3;

          return (
            <g key={edge.id}>
              <path
                d={`M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                markerEnd="url(#arrow)"
              />
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 4}
                fontSize="12"
                fill="#94a3b8"
                textAnchor="middle"
              >
                {edge.relation_name}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions.get(node.name);
          if (!pos) return null;
          const colors = CLASS_COLOR[node.entity_class] ?? DEFAULT_CLASS_COLOR;
          const isHovered = hoveredNode === node.name;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: "pointer" }}
              onClick={() => {
                const id = nodeIdMap.get(node.name);
                if (id) onNodeClick(id);
              }}
              onMouseEnter={() => setHoveredNode(node.name)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={colors.bg}
                stroke={isHovered ? colors.border : "#e2e8f0"}
                strokeWidth={isHovered ? 2 : 1}
                filter={isHovered ? "drop-shadow(0 2px 4px rgb(0 0 0 / 0.1))" : undefined}
              />
              <rect
                x={0}
                y={0}
                width={4}
                height={NODE_H}
                rx={2}
                fill={colors.border}
              />
              <text
                x={12}
                y={22}
                fontSize="12"
                fontWeight="500"
                fill={colors.text}
                fontFamily="monospace"
              >
                {node.name.length > 20 ? node.name.slice(0, 18) + "…" : node.name}
              </text>
              <text
                x={12}
                y={38}
                fontSize="12"
                fill="#94a3b8"
              >
                {node.entity_class} · {node.module_id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ErdPage() {
  const router = useRouter();
  const [data, setData] = useState<ErdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = moduleFilter !== "all" ? `?module=${encodeURIComponent(moduleFilter)}` : "";
      const res = await fetch(`/api/relay/metadata/admin/erd${params}`);
      if (res.ok) setData(await res.json() as ErdData);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter]);

  useEffect(() => { void load(); }, [load]);

  const nodeIdMap = new Map(data?.nodes.map((n) => [n.name, n.id]) ?? []);

  const allModules = data?.modules ?? [];

  return (
    <PageFrame
      eyebrow="Meta Studio"
      title="Schema ERD"
      description={data ? `${data.nodes.length} entities · ${data.edges.length} relations` : undefined}
      actions={
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={load}>
          Refresh
        </Button>
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="h-8 w-48 text-sm">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {allModules.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Legend */}
        <div className="ml-4 flex flex-wrap items-center gap-3">
          {Object.entries(CLASS_COLOR).map(([cls, colors]) => (
            <div key={cls} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}
              />
              <span className="text-xs text-muted-foreground">{cls}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <StatePanel title="Loading…" message="Building entity relationship diagram." />
      ) : !data || data.nodes.length === 0 ? (
        <StatePanel title="No entities" message="No entities found for the selected module." />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Click any entity to open its detail page.
          </p>
          <ErdCanvas
            nodes={data.nodes}
            edges={data.edges}
            nodeIdMap={nodeIdMap}
            onNodeClick={(id) => router.push(`/setup/metadata/${id}`)}
          />
        </>
      )}
    </PageFrame>
  );
}
