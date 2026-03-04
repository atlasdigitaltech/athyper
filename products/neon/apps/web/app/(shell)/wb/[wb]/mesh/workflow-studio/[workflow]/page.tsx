"use client";

import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Loader2, Plus, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { StatePropertyData } from "@/components/mesh/workflow-studio/StatePropertyPanel";
import type { TransitionGateData } from "@/components/mesh/workflow-studio/TransitionGateEditor";
import type { Connection, Edge, Node } from "@xyflow/react";

import { StatePropertyPanel } from "@/components/mesh/workflow-studio/StatePropertyPanel";
import { TransitionGateEditor } from "@/components/mesh/workflow-studio/TransitionGateEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";

interface LifecycleState {
  id: string;
  code: string;
  name: string;
  isTerminal: boolean;
  sortOrder: number;
}

interface LifecycleTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  operationCode: string;
}

interface LifecycleDetail {
  id: string;
  code: string;
  name: string;
  states: LifecycleState[];
  transitions: LifecycleTransition[];
}

function buildGraph(data: LifecycleDetail) {
  const states = data.states ?? [];
  const transitions = data.transitions ?? [];
  const COLS = Math.max(3, Math.ceil(Math.sqrt(states.length)));

  const nodes: Node[] = states.map((state, i) => ({
    id: state.id,
    position: { x: (i % COLS) * 220, y: Math.floor(i / COLS) * 140 },
    data: {
      label: `${state.name}\n(${state.code})`,
      stateName: state.name,
      stateCode: state.code,
      isTerminal: state.isTerminal,
      description: "",
    },
    style: {
      background: state.isTerminal ? "#dc2626" : "#1e40af",
      color: "#fff",
      border: state.isTerminal ? "2px solid #991b1b" : "1px solid #1e3a8a",
      borderRadius: state.isTerminal ? "50%" : "8px",
      padding: state.isTerminal ? "16px" : "12px 20px",
      fontSize: "12px",
      fontWeight: 600,
      textAlign: "center" as const,
      minWidth: "100px",
      whiteSpace: "pre-line" as const,
    },
  }));

  const edges: Edge[] = transitions.map((t) => ({
    id: t.id,
    source: t.fromStateId,
    target: t.toStateId,
    label: t.operationCode,
    type: "smoothstep",
    style: { stroke: "#64748b", strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: "#94a3b8" },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 0.8 },
    markerEnd: { type: "arrowclosed" as const },
  }));

  return { nodes, edges };
}

export default function WorkflowEditorPage() {
  const { wb, workflow } = useParams<{ wb: string; workflow: string }>();

  const [lifecycle, setLifecycle] = useState<LifecycleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // State Form
  const [stateFormOpen, setStateFormOpen] = useState(false);
  const [stateName, setStateName] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [stateIsTerminal, setStateIsTerminal] = useState(false);

  const fetchLifecycle = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/mesh/lifecycle?id=${encodeURIComponent(workflow)}`,
        {
          headers: buildHeaders(),
          credentials: "same-origin",
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(
          body.error?.message ?? `Failed to load lifecycle (${res.status})`,
        );
      }

      const body = (await res.json()) as { data: LifecycleDetail };
      setLifecycle(body.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load lifecycle");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [workflow]);

  useEffect(() => {
    fetchLifecycle();
    return () => abortRef.current?.abort();
  }, [fetchLifecycle]);

  if (loading) {
    return <Skeleton className="h-[600px] rounded-md" />;
  }

  if (error || !lifecycle) {
    return (
      <div className="space-y-4">
        <Link
          href={`/wb/${wb}/mesh/workflow-studio`}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" /> Back to Workflow Studio
        </Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {error ?? "Lifecycle not found"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={fetchLifecycle}
          >
            <RefreshCw className="mr-1.5 size-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <WorkflowCanvas lifecycle={lifecycle} wb={wb} onRefresh={fetchLifecycle} />
  );
}

function WorkflowCanvas({
  lifecycle,
  wb,
  onRefresh,
}: {
  lifecycle: LifecycleDetail;
  wb: string;
  onRefresh: () => void;
}) {
  const initial = buildGraph(lifecycle);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add State dialog
  const [stateFormOpen, setStateFormOpen] = useState(false);
  const [stateName, setStateName] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [stateIsTerminal, setStateIsTerminal] = useState(false);

  // Side panels
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [gateEditorOpen, setGateEditorOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [statePanelOpen, setStatePanelOpen] = useState(false);

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge);
      setGateEditorOpen(true);
    },
    [],
  );

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
      setStatePanelOpen(true);
    },
    [],
  );

  const handleSaveGate = useCallback(
    (edgeId: string, data: TransitionGateData) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                label: data.operationCode,
                data: { ...e.data, gate: data },
              }
            : e,
        ),
      );
      setDirty(true);
    },
    [setEdges],
  );

  const handleSaveState = useCallback(
    (nodeId: string, data: StatePropertyData) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: `${data.name}\n(${data.code})`,
                  stateName: data.name,
                  stateCode: data.code,
                  isTerminal: data.isTerminal,
                  description: data.description,
                },
                style: {
                  ...n.style,
                  background: data.isTerminal ? "#dc2626" : "#1e40af",
                  border: data.isTerminal
                    ? "2px solid #991b1b"
                    : "1px solid #1e3a8a",
                  borderRadius: data.isTerminal ? "50%" : "8px",
                  padding: data.isTerminal ? "16px" : "12px 20px",
                },
              }
            : n,
        ),
      );
      setDirty(true);
    },
    [setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            label: "transition",
            style: { stroke: "#64748b", strokeWidth: 1.5 },
            labelStyle: { fontSize: 10, fill: "#94a3b8" },
            labelBgStyle: { fill: "#0f172a", fillOpacity: 0.8 },
            markerEnd: { type: "arrowclosed" as const },
          },
          eds,
        ),
      );
      setDirty(true);
    },
    [setEdges],
  );

  const handleAddState = useCallback(() => {
    if (!stateName.trim() || !stateCode.trim()) return;

    const newNode: Node = {
      id: `temp_${Date.now()}`,
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: `${stateName}\n(${stateCode})` },
      style: {
        background: stateIsTerminal ? "#dc2626" : "#1e40af",
        color: "#fff",
        border: stateIsTerminal ? "2px solid #991b1b" : "1px solid #1e3a8a",
        borderRadius: stateIsTerminal ? "50%" : "8px",
        padding: stateIsTerminal ? "16px" : "12px 20px",
        fontSize: "12px",
        fontWeight: 600,
        textAlign: "center" as const,
        minWidth: "100px",
        whiteSpace: "pre-line" as const,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setStateFormOpen(false);
    setStateName("");
    setStateCode("");
    setStateIsTerminal(false);
    setDirty(true);
  }, [stateName, stateCode, stateIsTerminal, setNodes]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const states = nodes.map((n, i) => {
        const d = n.data as Record<string, unknown>;
        return {
          id: n.id.startsWith("temp_") ? undefined : n.id,
          code: (d.stateCode as string) ?? "",
          name:
            (d.stateName as string) ??
            (typeof d.label === "string" ? d.label.split("\n")[0] : ""),
          isTerminal:
            (d.isTerminal as boolean) ?? n.style?.borderRadius === "50%",
          description: (d.description as string) ?? "",
          sortOrder: i,
        };
      });

      const transitions = edges.map((e) => {
        const gate = (e.data as Record<string, unknown>)?.gate as
          | TransitionGateData
          | undefined;
        return {
          id: e.id,
          fromStateId: e.source,
          toStateId: e.target,
          operationCode: typeof e.label === "string" ? e.label : "transition",
          ...(gate ? { gates: gate } : {}),
        };
      });

      const res = await fetch("/api/admin/mesh/lifecycle", {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: lifecycle.id,
          states,
          transitions,
        }),
      });

      if (res.ok) {
        setDirty(false);
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, lifecycle.id, onRefresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/wb/${wb}/mesh/workflow-studio`}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3.5" />
          </Link>
          <h2 className="text-lg font-semibold">{lifecycle.name}</h2>
          <Badge variant="secondary" className="text-xs font-mono">
            {lifecycle.code}
          </Badge>
          {dirty && (
            <Badge variant="outline" className="text-xs text-amber-600">
              Unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStateFormOpen(true)}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add State
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="p-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-blue-700" />
            Normal State
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-red-600" />
            Terminal State
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-6 bg-slate-500" />
            Transition (drag between nodes to connect)
          </span>
        </CardContent>
      </Card>

      <div className="h-[600px] rounded-md border bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            setDirty(true);
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
            setDirty(true);
          }}
          onConnect={onConnect}
          onEdgeClick={handleEdgeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={20} />
          <Controls
            showInteractive={false}
            className="[&>button]:bg-slate-800 [&>button]:border-slate-700 [&>button]:text-slate-300"
          />
        </ReactFlow>
      </div>

      {/* Add State Dialog */}
      <Dialog open={stateFormOpen} onOpenChange={setStateFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add State</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">State Name</label>
              <Input
                placeholder="e.g., Under Review"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">State Code</label>
              <Input
                placeholder="e.g., under_review"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stateIsTerminal}
                onChange={(e) => setStateIsTerminal(e.target.checked)}
                className="rounded border-input"
              />
              Terminal state (workflow ends here)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStateFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddState}
              disabled={!stateName.trim() || !stateCode.trim()}
            >
              Add State
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transition Gate Editor */}
      <TransitionGateEditor
        edge={selectedEdge}
        open={gateEditorOpen}
        onOpenChange={setGateEditorOpen}
        onSave={handleSaveGate}
      />

      {/* State Property Panel */}
      <StatePropertyPanel
        node={selectedNode}
        open={statePanelOpen}
        onOpenChange={setStatePanelOpen}
        onSave={handleSaveState}
      />
    </div>
  );
}
