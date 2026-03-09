"use client";

// components/finance/admin/CloseDependencyGraph.tsx
//
// Phase 7 — Visual DAG for close task dependencies.
// Renders tasks in topological layers (columns) with SVG edges.
// Each node shows readiness state, signal indicators, and downstream impact.
// Uses the existing graph API data (CloseTaskNodeDTO[]).

import { useMemo, useRef, useCallback, useState, useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import type {
  CloseTaskNodeDTO,
  TaskReadinessState,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const NODE_WIDTH = 160;
const NODE_HEIGHT = 72;
const LAYER_GAP_X = 60;
const NODE_GAP_Y = 16;
const PADDING = 24;

// ---------------------------------------------------------------------------
// Readiness styling
// ---------------------------------------------------------------------------

const READINESS_STYLE: Record<
  TaskReadinessState,
  { bg: string; border: string; text: string; icon: typeof Circle }
> = {
  SATISFIED: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700", icon: CheckCircle2 },
  READY: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700", icon: Play },
  IN_PROGRESS: { bg: "bg-violet-50", border: "border-violet-300", text: "text-violet-700", icon: Loader2 },
  NOT_READY: { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-600", icon: Circle },
  BLOCKED: { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", icon: XCircle },
  FAILED: { bg: "bg-red-50", border: "border-red-400", text: "text-red-800", icon: AlertTriangle },
  SKIPPED: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-400", icon: Circle },
};

// ---------------------------------------------------------------------------
// Topological layering (Kahn's algorithm)
// ---------------------------------------------------------------------------

interface LayeredNode {
  node: CloseTaskNodeDTO;
  layer: number;
  layerIndex: number;
  x: number;
  y: number;
}

function computeLayers(nodes: CloseTaskNodeDTO[]): LayeredNode[] {
  const codeToNode = new Map(nodes.map((n) => [n.taskCode, n]));
  const codes = new Set(nodes.map((n) => n.taskCode));

  // Build in-degree counting only predecessors within our node set
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.taskCode, 0);
    adj.set(n.taskCode, []);
  }

  for (const n of nodes) {
    for (const succ of n.successorTaskCodes) {
      if (!codes.has(succ)) continue;
      adj.get(n.taskCode)!.push(succ);
      inDegree.set(succ, (inDegree.get(succ) ?? 0) + 1);
    }
  }

  // Assign layers via BFS (longest path from source for better visual spread)
  const layer = new Map<string, number>();
  const queue: string[] = [];

  for (const [code, deg] of inDegree) {
    if (deg === 0) {
      queue.push(code);
      layer.set(code, 0);
    }
  }

  // Use longest path to push nodes as far right as possible
  while (queue.length > 0) {
    const code = queue.shift()!;
    const currentLayer = layer.get(code) ?? 0;

    for (const succ of adj.get(code) ?? []) {
      const newLayer = currentLayer + 1;
      if (newLayer > (layer.get(succ) ?? 0)) {
        layer.set(succ, newLayer);
      }
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  // Handle cycle members (if any remain with inDegree > 0)
  for (const n of nodes) {
    if (!layer.has(n.taskCode)) {
      layer.set(n.taskCode, 0);
    }
  }

  // Group by layer
  const layerGroups = new Map<number, CloseTaskNodeDTO[]>();
  for (const n of nodes) {
    const l = layer.get(n.taskCode) ?? 0;
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(n);
  }

  // Compute positions
  const result: LayeredNode[] = [];
  for (const [l, group] of layerGroups) {
    for (let i = 0; i < group.length; i++) {
      result.push({
        node: group[i],
        layer: l,
        layerIndex: i,
        x: PADDING + l * (NODE_WIDTH + LAYER_GAP_X),
        y: PADDING + i * (NODE_HEIGHT + NODE_GAP_Y),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Edge computation
// ---------------------------------------------------------------------------

interface Edge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isBlocking: boolean;
}

function computeEdges(
  layoutNodes: LayeredNode[],
  allNodes: CloseTaskNodeDTO[],
): Edge[] {
  const posMap = new Map<string, { x: number; y: number }>();
  for (const ln of layoutNodes) {
    posMap.set(ln.node.taskCode, { x: ln.x, y: ln.y });
  }

  const blockedBySet = new Map<string, Set<string>>();
  for (const n of allNodes) {
    blockedBySet.set(n.taskCode, new Set(n.blockedByTaskCodes));
  }

  const edges: Edge[] = [];
  for (const n of allNodes) {
    const fromPos = posMap.get(n.taskCode);
    if (!fromPos) continue;

    for (const succ of n.successorTaskCodes) {
      const toPos = posMap.get(succ);
      if (!toPos) continue;

      const isBlocking = blockedBySet.get(succ)?.has(n.taskCode) ?? false;

      edges.push({
        fromX: fromPos.x + NODE_WIDTH,
        fromY: fromPos.y + NODE_HEIGHT / 2,
        toX: toPos.x,
        toY: toPos.y + NODE_HEIGHT / 2,
        isBlocking,
      });
    }
  }

  return edges;
}

// ---------------------------------------------------------------------------
// SVG Edge rendering
// ---------------------------------------------------------------------------

function EdgeLine({ edge }: { edge: Edge }) {
  // Bezier curve for smooth edges
  const dx = edge.toX - edge.fromX;
  const controlOffset = Math.min(dx * 0.4, 40);

  const d = `M ${edge.fromX} ${edge.fromY} C ${edge.fromX + controlOffset} ${edge.fromY}, ${edge.toX - controlOffset} ${edge.toY}, ${edge.toX} ${edge.toY}`;

  return (
    <path
      d={d}
      fill="none"
      stroke={edge.isBlocking ? "#ef4444" : "#d1d5db"}
      strokeWidth={edge.isBlocking ? 2 : 1.5}
      strokeDasharray={edge.isBlocking ? "4 3" : undefined}
      markerEnd={edge.isBlocking ? "url(#arrowhead-red)" : "url(#arrowhead-gray)"}
    />
  );
}

// ---------------------------------------------------------------------------
// Graph Node
// ---------------------------------------------------------------------------

function GraphNode({
  layoutNode,
  isHighlighted,
  onHover,
}: {
  layoutNode: LayeredNode;
  isHighlighted: boolean;
  onHover: (code: string | null) => void;
}) {
  const { node } = layoutNode;
  const style = READINESS_STYLE[node.readinessState] ?? READINESS_STYLE.NOT_READY;
  const Icon = style.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <g
          transform={`translate(${layoutNode.x}, ${layoutNode.y})`}
          onMouseEnter={() => onHover(node.taskCode)}
          onMouseLeave={() => onHover(null)}
          className="cursor-default"
        >
          <rect
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={8}
            ry={8}
            className={`${isHighlighted ? "stroke-2" : "stroke-1"}`}
            fill="white"
            stroke={
              isHighlighted
                ? "#6366f1"
                : node.readinessState === "BLOCKED" || node.readinessState === "FAILED"
                  ? "#fca5a5"
                  : node.readinessState === "SATISFIED"
                    ? "#86efac"
                    : node.readinessState === "READY"
                      ? "#93c5fd"
                      : "#e5e7eb"
            }
            strokeWidth={isHighlighted ? 2 : 1}
          />

          {/* Readiness indicator bar */}
          <rect
            x={0}
            y={0}
            width={4}
            height={NODE_HEIGHT}
            rx={8}
            fill={
              node.readinessState === "SATISFIED"
                ? "#22c55e"
                : node.readinessState === "READY"
                  ? "#3b82f6"
                  : node.readinessState === "IN_PROGRESS"
                    ? "#8b5cf6"
                    : node.readinessState === "BLOCKED" || node.readinessState === "FAILED"
                      ? "#ef4444"
                      : "#9ca3af"
            }
          />

          {/* Task code */}
          <text
            x={14}
            y={22}
            fontSize={11}
            fontWeight={600}
            fill="#1f2937"
            className="select-none"
          >
            {truncate(node.taskCode, 18)}
          </text>

          {/* Task name */}
          <text
            x={14}
            y={38}
            fontSize={9}
            fill="#6b7280"
            className="select-none"
          >
            {truncate(node.taskName, 22)}
          </text>

          {/* Bottom row: readiness + signals + impact */}
          <text
            x={14}
            y={58}
            fontSize={9}
            fill={
              node.readinessState === "BLOCKED" || node.readinessState === "FAILED"
                ? "#dc2626"
                : node.readinessState === "SATISFIED"
                  ? "#16a34a"
                  : "#6b7280"
            }
            className="select-none"
          >
            {node.readinessState}
          </text>

          {/* Signal indicator */}
          {node.activeSignalCount > 0 && (
            <g transform={`translate(${NODE_WIDTH - 36}, 48)`}>
              <circle cx={6} cy={6} r={9} fill="#fef2f2" stroke="#fca5a5" strokeWidth={1} />
              <text x={6} y={10} fontSize={8} fontWeight={700} fill="#dc2626" textAnchor="middle">
                {node.activeSignalCount}
              </text>
            </g>
          )}

          {/* Downstream impact badge */}
          {node.downstreamImpactCount > 0 && (
            <g transform={`translate(${NODE_WIDTH - 16}, 48)`}>
              <text
                x={0}
                y={10}
                fontSize={8}
                fill="#9ca3af"
                textAnchor="end"
                className="select-none"
              >
                {"\u2193"}{node.downstreamImpactCount}
              </text>
            </g>
          )}
        </g>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[250px]">
        <p className="font-medium">{node.taskName}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {node.category} &middot; {node.completionMode}
          {node.estimatedDurationMinutes ? ` \u00b7 ${node.estimatedDurationMinutes}min` : ""}
        </p>
        <p className="text-xs mt-1">
          Status: {node.status} &middot; Readiness: {node.readinessState}
        </p>
        {node.blockedByTaskCodes.length > 0 && (
          <p className="text-xs text-red-500 mt-1">
            Blocked by: {node.blockedByTaskCodes.join(", ")}
          </p>
        )}
        {node.activeSignalCount > 0 && (
          <p className="text-xs text-red-500 mt-1">
            {node.activeSignalCount} active risk signal{node.activeSignalCount !== 1 ? "s" : ""}
          </p>
        )}
        {node.assignedRole && (
          <p className="text-xs text-muted-foreground mt-1">
            Owner: {node.assignedRole}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export interface CloseDependencyGraphProps {
  nodes: CloseTaskNodeDTO[];
}

export function CloseDependencyGraph({ nodes }: CloseDependencyGraphProps) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  const layoutNodes = useMemo(() => computeLayers(nodes), [nodes]);
  const edges = useMemo(() => computeEdges(layoutNodes, nodes), [layoutNodes, nodes]);

  // Compute SVG dimensions
  const svgWidth = useMemo(() => {
    if (layoutNodes.length === 0) return 400;
    return Math.max(...layoutNodes.map((n) => n.x + NODE_WIDTH)) + PADDING;
  }, [layoutNodes]);

  const svgHeight = useMemo(() => {
    if (layoutNodes.length === 0) return 200;
    return Math.max(...layoutNodes.map((n) => n.y + NODE_HEIGHT)) + PADDING;
  }, [layoutNodes]);

  // Build set of connected codes for highlighting
  const connectedCodes = useMemo(() => {
    if (!hoveredCode) return new Set<string>();
    const target = nodes.find((n) => n.taskCode === hoveredCode);
    if (!target) return new Set<string>();
    const connected = new Set<string>([
      hoveredCode,
      ...target.predecessorTaskCodes,
      ...target.successorTaskCodes,
    ]);
    return connected;
  }, [hoveredCode, nodes]);

  // Summary counts
  const signalAffectedCount = useMemo(
    () => nodes.filter((n) => n.activeSignalCount > 0).length,
    [nodes],
  );

  if (nodes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dependency Graph</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">
            No tasks to display
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Dependency Graph</CardTitle>
            <CardDescription>
              {nodes.length} tasks &middot; {edges.length} dependencies
              {signalAffectedCount > 0 && (
                <span className="text-red-600">
                  {" "}&middot; {signalAffectedCount} signal-affected
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-500" />
              Satisfied
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-blue-500" />
              Ready
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-violet-500" />
              In Progress
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-red-500" />
              Blocked
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-gray-400" />
              Waiting
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full">
          <div style={{ minWidth: svgWidth, minHeight: svgHeight }}>
            <TooltipProvider>
              <svg
                width={svgWidth}
                height={svgHeight}
                className="select-none"
              >
                {/* Arrowhead markers */}
                <defs>
                  <marker
                    id="arrowhead-gray"
                    markerWidth="8"
                    markerHeight="6"
                    refX="8"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#d1d5db" />
                  </marker>
                  <marker
                    id="arrowhead-red"
                    markerWidth="8"
                    markerHeight="6"
                    refX="8"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
                  </marker>
                </defs>

                {/* Edges (render behind nodes) */}
                <g>
                  {edges.map((edge, i) => (
                    <EdgeLine key={i} edge={edge} />
                  ))}
                </g>

                {/* Nodes */}
                <g>
                  {layoutNodes.map((ln) => (
                    <GraphNode
                      key={ln.node.taskCode}
                      layoutNode={ln}
                      isHighlighted={connectedCodes.has(ln.node.taskCode)}
                      onHover={setHoveredCode}
                    />
                  ))}
                </g>
              </svg>
            </TooltipProvider>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "\u2026" : str;
}
