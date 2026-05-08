"use client";

/**
 * Schema ERD Viewer — /setup/metadata/erd
 *
 * Interactive entity-relationship diagram built with @xyflow/react.
 * Renders all registered entities as nodes and their declared relations
 * (control.entity_relation via effective entity versions) as edges.
 *
 * Features:
 *   • Entity boxes: name, entity_class badge, module_id
 *   • Edges labeled with relation_name; styled by relation_kind
 *     – belongs_to  → solid blue arrow (N:1)
 *     – has_many    → dashed green arrow (1:N)
 *     – m2m         → dotted purple double-arrow (N:N)
 *   • Filter by module
 *   • Zoom / pan / fit-to-screen (reactflow Controls)
 *   • Export as SVG (programmatic, no extra deps)
 *
 * API: GET /api/relay/metadata/admin/erd?module=<id>
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Network,
  Download,
  Maximize2,
  AlertCircle,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Skeleton,
} from "@athyper/ui/primitives";
import { relayFetch } from "../../_components/admin-ui";

// ── API types ─────────────────────────────────────────────────────────────────

interface ErdApiNode {
  id: string;
  name: string;
  label: string | null;
  entity_class: string;
  module_id: string;
}

interface ErdApiEdge {
  id: string;
  from_entity: string;
  to_entity: string;
  relation_name: string;
  relation_kind: string;
  fk_field: string | null;
}

interface ErdData {
  nodes: ErdApiNode[];
  edges: ErdApiEdge[];
  modules: string[];
}

// ── Flow node type ────────────────────────────────────────────────────────────

interface ErdNodeData extends Record<string, unknown> {
  name: string;
  label: string | null;
  entity_class: string;
  module_id: string;
}

type ErdNode = Node<ErdNodeData, "entityNode">;

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_W = 204;
const NODE_H = 78;
const H_GAP  = 80;
const V_GAP  = 32;
const COLS   = 5;

const CLASS_BADGE: Record<string, string> = {
  REFERENCE: "bg-primary/10 text-primary border-primary/30",
  MASTER:    "bg-success/10 text-success border-success/30",
  DOCUMENT:  "bg-warning/10 text-warning border-warning/30",
  CONTROL:   "bg-muted text-muted-foreground border-border",
  JOURNAL:   "bg-categorical-4/10 text-categorical-4 border-categorical-4/30",
};

const RELATION_COLOR: Record<string, string> = {
  belongs_to: "var(--info)",
  has_many:   "var(--success)",
  m2m:        "var(--categorical-4)",
};

const ENTITY_CLASS_COLOR: Record<string, string> = {
  REFERENCE: "var(--info)",
  MASTER:    "var(--success)",
  DOCUMENT:  "var(--warning)",
  CONTROL:   "var(--muted-foreground)",
  JOURNAL:   "var(--categorical-4)",
};

function relationColor(kind: string): string {
  return RELATION_COLOR[kind] ?? "var(--muted-foreground)";
}

function entityClassColor(entityClass: string): string {
  return ENTITY_CLASS_COLOR[entityClass] ?? ENTITY_CLASS_COLOR["CONTROL"]!;
}

// ── Entity node component ─────────────────────────────────────────────────────

function EntityNode({ data }: NodeProps<ErdNode>) {
  const badgeClass = CLASS_BADGE[data.entity_class] ?? CLASS_BADGE["CONTROL"]!;
  return (
    <div
      className="rounded-lg border bg-card shadow-sm px-3 py-2 select-none"
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!opacity-0 !pointer-events-none"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!opacity-0 !pointer-events-none"
      />

      {/* Label + name */}
      <p className="text-xs font-semibold truncate leading-tight">{data.label ?? data.name}</p>
      <p className="text-doc-support font-mono text-muted-foreground truncate mt-0.5">
        {data.name}
      </p>

      {/* Class + module */}
      <div className="flex items-center justify-between mt-2">
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-doc-field-label font-medium ${badgeClass}`}
        >
          {data.entity_class}
        </span>
        <span className="text-doc-field-label text-muted-foreground font-mono">{data.module_id}</span>
      </div>
    </div>
  );
}

const NODE_TYPES = { entityNode: EntityNode };

// ── Layout helpers ────────────────────────────────────────────────────────────

function computeLayout(entities: ErdApiNode[]): ErdNode[] {
  // Sort by module, then name — so same-module entities cluster
  const sorted = [...entities].sort((a, b) =>
    a.module_id !== b.module_id
      ? a.module_id.localeCompare(b.module_id)
      : a.name.localeCompare(b.name),
  );
  return sorted.map((e, i) => ({
    id: e.name,
    type: "entityNode" as const,
    data: {
      name: e.name,
      label: e.label,
      entity_class: e.entity_class,
      module_id: e.module_id,
    },
    position: {
      x: (i % COLS) * (NODE_W + H_GAP),
      y: Math.floor(i / COLS) * (NODE_H + V_GAP),
    },
  }));
}

function buildFlowEdges(apiEdges: ErdApiEdge[], visibleNodeIds: Set<string>): Edge[] {
  return apiEdges
    .filter((e) => visibleNodeIds.has(e.from_entity) && visibleNodeIds.has(e.to_entity))
    .map((e) => {
      const color = relationColor(e.relation_kind);
      const isHasMany = e.relation_kind === "has_many";
      const isM2m     = e.relation_kind === "m2m";
      return {
        id: e.id,
        source: e.from_entity,
        target: e.to_entity,
        type: "smoothstep" as const,
        label: e.relation_name,
        labelStyle: {
          fontSize: 9,
          fontFamily: "ui-monospace, monospace",
          fill: color,
        },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        labelBgStyle: { fill: "var(--popover)", fillOpacity: 0.9, stroke: color, strokeWidth: 0.5 },
        style: {
          stroke: color,
          strokeWidth: 1.5,
          ...(isHasMany ? { strokeDasharray: "6 3" } : {}),
          ...(isM2m     ? { strokeDasharray: "3 3" } : {}),
        },
        data: {
          relation_kind: e.relation_kind,
          relation_name: e.relation_name,
          fk_field: e.fk_field,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 12 },
        ...(isM2m
          ? { markerStart: { type: MarkerType.ArrowClosed, color, width: 16, height: 12 } }
          : {}),
      };
    });
}

// ── SVG export (programmatic, no extra deps) ──────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SvgClassFill {
  bg: string;
  border: string;
  text: string;
  badge: string;
}

interface SvgColorSet {
  canvas: string;
  labelBackground: string;
  mutedText: string;
  relation: Record<string, string>;
  entityClass: Record<string, SvgClassFill>;
}

function readThemeVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function mixWithSurface(color: string, surface: string, amount: number): string {
  return `color-mix(in oklab, ${color} ${amount}%, ${surface})`;
}

function svgClassFill(color: string, surface: string): SvgClassFill {
  return {
    bg: mixWithSurface(color, surface, 12),
    border: color,
    text: color,
    badge: mixWithSurface(color, surface, 24),
  };
}

function getResolvedSvgColors(): SvgColorSet {
  const canvas = readThemeVar("--background", "Canvas");
  const labelBackground = readThemeVar("--popover", canvas);
  const mutedText = readThemeVar("--muted-foreground", "currentColor");
  const info = readThemeVar("--info", mutedText);
  const success = readThemeVar("--success", mutedText);
  const warning = readThemeVar("--warning", mutedText);
  const categorical4 = readThemeVar("--categorical-4", mutedText);

  return {
    canvas,
    labelBackground,
    mutedText,
    relation: {
      belongs_to: info,
      has_many: success,
      m2m: categorical4,
    },
    entityClass: {
      REFERENCE: svgClassFill(info, canvas),
      MASTER:    svgClassFill(success, canvas),
      DOCUMENT:  svgClassFill(warning, canvas),
      CONTROL:   svgClassFill(mutedText, canvas),
      JOURNAL:   svgClassFill(categorical4, canvas),
    },
  };
}

function exportAsSvg(flowNodes: ErdNode[], flowEdges: Edge[]) {
  if (flowNodes.length === 0) return;

  const svgColors = getResolvedSvgColors();
  const PADDING = 64;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const n of flowNodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + NODE_H);
  }

  const ox = -minX + PADDING;
  const oy = -minY + PADDING;
  const W  = maxX - minX + PADDING * 2;
  const H  = maxY - minY + PADDING * 2;

  const nodeById = new Map(flowNodes.map((n) => [n.id, n]));

  let edgeParts = "";
  for (const e of flowEdges) {
    const sn = nodeById.get(e.source);
    const tn = nodeById.get(e.target);
    if (!sn || !tn) continue;

    const sx  = sn.position.x + ox + NODE_W;
    const sy  = sn.position.y + oy + NODE_H / 2;
    const tx  = tn.position.x + ox;
    const ty  = tn.position.y + oy + NODE_H / 2;
    const cpx = (sx + tx) / 2;

    const d    = e.data as Record<string, unknown>;
    const kind = String(d?.["relation_kind"] ?? "");
    const lbl  = String(d?.["relation_name"] ?? "");
    const col  = svgColors.relation[kind] ?? svgColors.mutedText;
    const dash =
      kind === "has_many" ? ' stroke-dasharray="6 3"' : kind === "m2m" ? ' stroke-dasharray="3 3"' : "";
    const mid = `M${sx},${sy} C${cpx},${sy} ${cpx},${ty} ${tx},${ty}`;

    edgeParts += `<path d="${mid}" fill="none" stroke="${col}" stroke-width="1.5"${dash} marker-end="url(#arr-${kind})"/>`;
    if (kind === "m2m") {
      edgeParts += `<path d="${mid}" fill="none" stroke="none" marker-start="url(#arr-m2m-start)"/>`;
    }

    if (lbl) {
      const lx = cpx;
      const ly = (sy + ty) / 2 - 8;
      const lw = lbl.length * 5.8 + 12;
      edgeParts += `<rect x="${lx - lw / 2}" y="${ly - 10}" width="${lw}" height="14" rx="2" fill="${svgColors.labelBackground}" stroke="${col}" stroke-width="0.5"/>`;
      edgeParts += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="9" fill="${col}" font-family="ui-monospace,monospace">${escapeXml(lbl)}</text>`;
    }
  }

  let nodeParts = "";
  for (const n of flowNodes) {
    const x  = n.position.x + ox;
    const y  = n.position.y + oy;
    const nd = n.data as ErdNodeData;
    const c  = svgColors.entityClass[nd.entity_class] ?? svgColors.entityClass["CONTROL"]!;
    const disp  = escapeXml((nd.label || nd.name).slice(0, 26));
    const mono  = escapeXml(nd.name.slice(0, 30));
    const bw    = nd.entity_class.length * 5.6 + 14;

    nodeParts += `<g transform="translate(${x},${y})">`;
    nodeParts += `<rect width="${NODE_W}" height="${NODE_H}" rx="6" fill="${c.bg}" stroke="${c.border}" stroke-width="1.5"/>`;
    nodeParts += `<text x="10" y="21" font-size="11.5" font-weight="600" fill="${c.text}" font-family="system-ui,sans-serif">${disp}</text>`;
    nodeParts += `<text x="10" y="35" font-size="9" fill="${svgColors.mutedText}" font-family="ui-monospace,monospace">${mono}</text>`;
    nodeParts += `<rect x="8" y="48" width="${bw}" height="16" rx="3" fill="${c.badge}"/>`;
    nodeParts += `<text x="${8 + bw / 2}" y="58.5" text-anchor="middle" font-size="8.5" font-weight="600" fill="${c.text}" font-family="system-ui,sans-serif">${nd.entity_class}</text>`;
    nodeParts += `<text x="${NODE_W - 8}" y="58.5" text-anchor="end" font-size="8.5" fill="${svgColors.mutedText}" font-family="system-ui,sans-serif">${escapeXml(nd.module_id)}</text>`;
    nodeParts += `</g>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <marker id="arr-belongs_to" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
    <polygon points="0 0,8 3,0 6" fill="${svgColors.relation.belongs_to}"/>
  </marker>
  <marker id="arr-has_many" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
    <polygon points="0 0,8 3,0 6" fill="${svgColors.relation.has_many}"/>
  </marker>
  <marker id="arr-m2m" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
    <polygon points="0 0,8 3,0 6" fill="${svgColors.relation.m2m}"/>
  </marker>
  <marker id="arr-m2m-start" markerWidth="8" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
    <polygon points="0 0,8 3,0 6" fill="${svgColors.relation.m2m}"/>
  </marker>
</defs>
<rect width="${W}" height="${H}" fill="${svgColors.canvas}"/>
${edgeParts}
${nodeParts}
</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "schema-erd.svg";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Inner panel — requires useReactFlow (must render inside <ReactFlow>) ──────

function ErdInnerControls({ fitSignal }: { fitSignal: number }) {
  const { fitView, getNodes, getEdges } = useReactFlow<ErdNode, Edge>();

  // Fit view whenever fitSignal changes (data load / filter change)
  useEffect(() => {
    if (fitSignal > 0) {
      const id = setTimeout(() => fitView({ padding: 0.1, duration: 350 }), 80);
      return () => clearTimeout(id);
    }
  }, [fitSignal, fitView]);

  const handleExport = useCallback(() => {
    exportAsSvg(getNodes() as ErdNode[], getEdges());
  }, [getNodes, getEdges]);

  return (
    <Panel position="top-right" className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs bg-background/90 backdrop-blur-sm shadow-sm"
        onClick={() => fitView({ padding: 0.1, duration: 350 })}
      >
        <Maximize2 className="size-3" />
        Fit
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs bg-background/90 backdrop-blur-sm shadow-sm"
        onClick={handleExport}
      >
        <Download className="size-3" />
        SVG
      </Button>
    </Panel>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 text-doc-support text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-6 bg-info inline-block rounded" />
        belongs_to (N:1)
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-0.5 w-6 inline-block rounded text-success"
          style={{
            background: "currentColor",
            backgroundImage: "repeating-linear-gradient(90deg, currentColor 0, currentColor 4px, transparent 4px, transparent 7px)",
          }}
        />
        has_many (1:N)
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-0.5 w-6 inline-block rounded text-categorical-4"
          style={{
            background: "transparent",
            backgroundImage: "repeating-linear-gradient(90deg, currentColor 0, currentColor 2px, transparent 2px, transparent 5px)",
          }}
        />
        m2m (N:N)
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchemaErdPage() {
  const [moduleFilter, setModuleFilter] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<ErdNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [fitSignal, setFitSignal] = useState(0);

  const { data, isLoading, error } = useQuery<ErdData>({
    queryKey: ["setup", "erd"],
    queryFn: () => relayFetch<ErdData>("/metadata/admin/erd"),
    staleTime: 2 * 60 * 1000,
  });

  // Rebuild layout when data or module filter changes
  useEffect(() => {
    if (!data) return;

    const filtered = moduleFilter
      ? data.nodes.filter((n) => n.module_id === moduleFilter)
      : data.nodes;

    const visibleIds = new Set(filtered.map((n) => n.name));

    setNodes(computeLayout(filtered));
    setEdges(buildFlowEdges(data.edges, visibleIds));
    setFitSignal((s) => s + 1);
  }, [data, moduleFilter, setNodes, setEdges]);

  const modules  = data?.modules ?? [];
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  return (
    <PageFrame
      title="Schema ERD"
      description="Interactive entity-relationship diagram — entities and their declared associations"
    >
      <div className="space-y-3">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Module filter */}
          <Select value={moduleFilter || "__all__"} onValueChange={(v) => setModuleFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue placeholder="All modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Legend */}
          <Legend />

          {/* Stats */}
          {data && (
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" size="sm">{nodeCount} entities</Badge>
              <Badge variant="outline" size="sm">{edgeCount} relations</Badge>
            </div>
          )}
        </div>

        {/* Canvas */}
        {isLoading ? (
          <Skeleton className="w-full rounded-lg" style={{ height: "calc(100vh - 280px)", minHeight: 480 }} />
        ) : error ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Failed to load ERD data</p>
              <p className="text-xs text-muted-foreground mt-0.5">{String(error)}</p>
            </div>
          </div>
        ) : nodeCount === 0 && data ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <Network className="size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No entities found for the selected module</p>
          </div>
        ) : (
          <div
            className="rounded-lg border overflow-hidden bg-background"
            style={{ height: "calc(100vh - 300px)", minHeight: 520 }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              deleteKeyCode={null}
              fitView={false}
              minZoom={0.05}
              maxZoom={2}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) => {
                  const cls = (n.data as ErdNodeData | undefined)?.entity_class ?? "";
                  return entityClassColor(cls);
                }}
                maskColor="var(--background)"
                style={{ background: "var(--muted)" }}
              />
              <ErdInnerControls fitSignal={fitSignal} />
            </ReactFlow>
          </div>
        )}

      </div>
    </PageFrame>
  );
}
