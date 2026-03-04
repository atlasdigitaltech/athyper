"use client";

import {
    Background,
    Controls,
    ReactFlow,
    useEdgesState,
    useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitPullRequestArrow, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Edge, Node } from "@xyflow/react";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

interface LifecycleData {
    id: string;
    code: string;
    name: string;
    states: LifecycleState[];
    transitions: LifecycleTransition[];
}

function buildGraph(data: LifecycleData) {
    const COLS = Math.ceil(Math.sqrt(data.states.length));

    const nodes: Node[] = data.states.map((state, i) => ({
        id: state.id,
        position: {
            x: (i % COLS) * 220,
            y: Math.floor(i / COLS) * 140,
        },
        data: { label: state.name },
        style: {
            background: state.isTerminal ? "#dc2626" : "#1e40af",
            color: "#fff",
            border: state.isTerminal ? "2px solid #991b1b" : "1px solid #1e3a8a",
            borderRadius: state.isTerminal ? "50%" : "8px",
            padding: state.isTerminal ? "16px" : "12px 20px",
            fontSize: "12px",
            fontWeight: 600,
            textAlign: "center" as const,
            minWidth: state.isTerminal ? "80px" : "100px",
        },
    }));

    const edges: Edge[] = data.transitions.map((t) => ({
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

export default function LifecyclePage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    const [lifecycle, setLifecycle] = useState<LifecycleData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchLifecycle = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/lifecycle`,
                { headers: buildHeaders(), credentials: "same-origin", signal: controller.signal },
            );
            if (res.status === 404) {
                setLifecycle(null);
                return;
            }
            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load lifecycle (${res.status})`);
            }
            const body = (await res.json()) as { data: LifecycleData };
            setLifecycle(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load lifecycle");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [entityName]);

    useEffect(() => {
        fetchLifecycle();
        return () => abortRef.current?.abort();
    }, [fetchLifecycle]);

    if (loading) {
        return <Skeleton className="h-[500px] rounded-md" />;
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchLifecycle}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Retry
                </Button>
            </div>
        );
    }

    if (!lifecycle) {
        return (
            <EmptyState
                icon={GitPullRequestArrow}
                title="No lifecycle assigned"
                description="Assign a lifecycle state machine to define the workflow stages for this entity."
                actionLabel="Assign Lifecycle"
            />
        );
    }

    return <LifecycleGraph lifecycle={lifecycle} onRefresh={fetchLifecycle} />;
}

function LifecycleGraph({ lifecycle, onRefresh }: { lifecycle: LifecycleData; onRefresh: () => void }) {
    const initial = buildGraph(lifecycle);
    const [nodes, , onNodesChange] = useNodesState(initial.nodes);
    const [edges, , onEdgesChange] = useEdgesState(initial.edges);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{lifecycle.name}</h3>
                    <Badge variant="secondary" className="text-xs font-mono">{lifecycle.code}</Badge>
                    <Badge variant="outline" className="text-xs">
                        {lifecycle.states.length} states
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        {lifecycle.transitions.length} transitions
                    </Badge>
                </div>
                <Button variant="outline" size="sm" onClick={onRefresh}>
                    <RefreshCw className="size-3.5" />
                </Button>
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
                        Transition
                    </span>
                </CardContent>
            </Card>

            <div className="h-[500px] rounded-md border bg-slate-950">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
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
        </div>
    );
}
