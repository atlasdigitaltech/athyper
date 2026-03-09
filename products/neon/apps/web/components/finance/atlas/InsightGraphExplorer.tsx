"use client";

// components/finance/atlas/InsightGraphExplorer.tsx
//
// Insight Graph explorer — shows the materialized relationship graph
// with node/edge tables, stats, hotspots, and provenance.

import { useState } from "react";
import {
  Badge,
  Card,
} from "@neon/ui";
import {
  Network,
  RefreshCw,
  Loader2,
  Flame,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useInsightGraph } from "@/lib/finance/use-insight-graph";
import type { InsightGraphNode, InsightGraphEdge } from "@/lib/finance/use-insight-graph";
import { InsightGraphVisualizer } from "./InsightGraphVisualizer";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InsightGraphExplorerProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Node type styling
// ---------------------------------------------------------------------------

const NODE_TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  PERIOD: { bg: "bg-blue-100", text: "text-blue-700" },
  CLOSE_RUN: { bg: "bg-indigo-100", text: "text-indigo-700" },
  RELEASE: { bg: "bg-purple-100", text: "text-purple-700" },
  ANOMALY: { bg: "bg-red-100", text: "text-red-700" },
  RISK_SIGNAL: { bg: "bg-amber-100", text: "text-amber-700" },
  TASK: { bg: "bg-teal-100", text: "text-teal-700" },
  ACCOUNT: { bg: "bg-emerald-100", text: "text-emerald-700" },
  RECONCILIATION: { bg: "bg-cyan-100", text: "text-cyan-700" },
};

const EDGE_TYPE_STYLE: Record<string, string> = {
  BLOCKED_BY: "text-red-600",
  TRIGGERED_BY: "text-amber-600",
  AFFECTS: "text-orange-600",
  DERIVED_FROM: "text-blue-600",
  RECONCILES: "text-teal-600",
  ESCALATED_TO: "text-purple-600",
  DEPENDS_ON: "text-gray-600",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightGraphExplorer({ entityCode, fiscalYear, periodNumber }: InsightGraphExplorerProps) {
  const { data, loading, error, refresh } = useInsightGraph({ entityCode, fiscalYear, periodNumber });
  const [view, setView] = useState<"graph" | "nodes" | "edges" | "hotspots">("graph");
  const [filterType, setFilterType] = useState<string>("");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Materializing insight graph...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <Network className="h-4 w-4" />
          {error}
          <button onClick={refresh} className="ml-auto text-xs underline">Retry</button>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const nodeTypes = Object.keys(data.stats.nodesByType);
  const filteredNodes = filterType ? data.nodes.filter(n => n.type === filterType) : data.nodes;
  const filteredEdges = filterType
    ? data.edges.filter(e => e.source.startsWith(filterType + ":") || e.target.startsWith(filterType + ":"))
    : data.edges;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nodes</p>
          <p className="text-xl font-semibold tabular-nums">{data.stats.nodeCount}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Edges</p>
          <p className="text-xl font-semibold tabular-nums">{data.stats.edgeCount}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Node Types</p>
          <p className="text-xl font-semibold tabular-nums">{nodeTypes.length}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hotspots</p>
          <p className="text-xl font-semibold tabular-nums text-amber-600">{data.stats.hotspots.length}</p>
        </Card>
      </div>

      {/* Node type distribution */}
      <Card className="px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Node Distribution</p>
        <div className="flex flex-wrap gap-2">
          {nodeTypes.map((type) => {
            const style = NODE_TYPE_STYLE[type] ?? { bg: "bg-gray-100", text: "text-gray-700" };
            return (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? "" : type)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-all",
                  style.bg, style.text,
                  filterType === type && "ring-2 ring-offset-1 ring-indigo-400",
                )}
              >
                {type} ({data.stats.nodesByType[type]})
              </button>
            );
          })}
          {filterType && (
            <button
              onClick={() => setFilterType("")}
              className="text-xs text-muted-foreground underline"
            >
              Clear filter
            </button>
          )}
        </div>
      </Card>

      {/* View tabs */}
      <div className="flex items-center gap-2">
        {(["graph", "nodes", "edges", "hotspots"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              view === v
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {v === "graph" ? "Graph View"
              : v === "nodes" ? `Nodes (${filteredNodes.length})`
              : v === "edges" ? `Edges (${filteredEdges.length})`
              : `Hotspots (${data.stats.hotspots.length})`}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={refresh} className="rounded p-1 text-muted-foreground hover:bg-accent" title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Force-directed graph */}
      {view === "graph" && (
        <InsightGraphVisualizer nodes={data.nodes} edges={data.edges} />
      )}

      {/* Node list */}
      {view === "nodes" && (
        <Card className="divide-y overflow-hidden">
          {filteredNodes.map((node) => (
            <NodeRow key={node.id} node={node} />
          ))}
          {filteredNodes.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No nodes match the current filter.
            </div>
          )}
        </Card>
      )}

      {/* Edge list */}
      {view === "edges" && (
        <Card className="divide-y overflow-hidden">
          {filteredEdges.map((edge) => (
            <EdgeRow key={edge.id} edge={edge} />
          ))}
          {filteredEdges.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No edges match the current filter.
            </div>
          )}
        </Card>
      )}

      {/* Hotspots */}
      {view === "hotspots" && (
        <Card className="divide-y overflow-hidden">
          {data.stats.hotspots.map((hs, i) => (
            <div key={hs.nodeId} className="flex items-center gap-3 px-4 py-2.5">
              <Flame className={cn(
                "h-4 w-4 shrink-0",
                i === 0 ? "text-red-500" : i < 3 ? "text-amber-500" : "text-gray-400",
              )} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{hs.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{hs.nodeId}</p>
              </div>
              <Badge variant="outline" className="text-xs tabular-nums">
                {hs.edgeCount} connections
              </Badge>
            </div>
          ))}
          {data.stats.hotspots.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No hotspots detected.
            </div>
          )}
        </Card>
      )}

      {/* Provenance */}
      <Card className="px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          {data.provenance.deterministic ? "deterministic" : "adaptive"}
          {" · "}v{data.provenance.generatorVersion}
          {" · "}hash {data.provenance.graphHash}
          {" · "}generated {new Date(data.provenance.generatedAt).toLocaleString()}
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NodeRow({ node }: { node: InsightGraphNode }) {
  const [expanded, setExpanded] = useState(false);
  const style = NODE_TYPE_STYLE[node.type] ?? { bg: "bg-gray-100", text: "text-gray-700" };

  return (
    <div className="px-4 py-2.5">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setExpanded(!expanded)}>
        <Badge className={cn("text-[10px] shrink-0", style.bg, style.text)}>{node.type}</Badge>
        <span className="text-sm truncate flex-1">{node.label}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{node.status}</Badge>
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-2 text-[11px] text-muted-foreground font-mono">
          <p>ID: {node.id}</p>
          {Object.entries(node)
            .filter(([k]) => !["id", "type", "label", "status"].includes(k))
            .map(([k, v]) => (
              <p key={k}>{k}: {String(v)}</p>
            ))}
        </div>
      )}
    </div>
  );
}

function EdgeRow({ edge }: { edge: InsightGraphEdge }) {
  const color = EDGE_TYPE_STYLE[edge.type] ?? "text-gray-600";

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <Badge variant="outline" className={cn("text-[10px] shrink-0", color)}>{edge.type}</Badge>
      <span className="text-xs font-mono text-muted-foreground truncate">
        {edge.source}
      </span>
      <span className="text-[10px] text-muted-foreground">→</span>
      <span className="text-xs font-mono text-muted-foreground truncate">
        {edge.target}
      </span>
      {edge.label && <span className="text-[10px] text-muted-foreground truncate ml-auto">{edge.label}</span>}
    </div>
  );
}
