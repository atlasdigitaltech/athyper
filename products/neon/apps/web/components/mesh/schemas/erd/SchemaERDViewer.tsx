"use client";

import {
    Background,
    Controls,
    MiniMap,
    ReactFlow,
    useEdgesState,
    useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";

import type { FieldDefinition, RelationDefinition } from "@/lib/schema-manager/types";
import type { Edge, Node } from "@xyflow/react";

// ─── Constants ──────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
    ref: "#6366f1", // indigo
    ent: "#1d4ed8", // blue
    doc: "#0d9488", // teal
};

const EDGE_COLORS: Record<string, string> = {
    belongs_to: "#3b82f6",
    has_many: "#22c55e",
    m2m: "#a855f7",
};

const CARDINALITY_LABELS: Record<string, string> = {
    belongs_to: "N:1",
    has_many: "1:N",
    m2m: "M:N",
};

// ─── Types ──────────────────────────────────────────────────────

interface ERDEntity {
    name: string;
    kind?: "ref" | "ent" | "doc";
    fieldCount: number;
    fields: FieldDefinition[];
}

interface SchemaERDViewerProps {
    entity: ERDEntity;
    relations: RelationDefinition[];
    onNodeClick?: (entityName: string) => void;
}

// ─── Graph Builder ──────────────────────────────────────────────

function buildERDGraph(entity: ERDEntity, relations: RelationDefinition[]) {
    // Collect all unique entity names
    const entityMap = new Map<string, { kind?: string; fieldCount: number }>();
    entityMap.set(entity.name, { kind: entity.kind, fieldCount: entity.fieldCount });

    for (const rel of relations) {
        if (!entityMap.has(rel.targetEntity)) {
            entityMap.set(rel.targetEntity, { kind: undefined, fieldCount: 0 });
        }
    }

    const entities = Array.from(entityMap.entries());
    const COLS = Math.max(2, Math.ceil(Math.sqrt(entities.length)));
    const COL_WIDTH = 280;
    const ROW_HEIGHT = 180;

    // Build entity nodes
    const nodes: Node[] = entities.map(([name, info], i) => {
        const isCurrent = name === entity.name;
        const bg = isCurrent
            ? (KIND_COLORS[info.kind ?? "ent"] ?? "#1d4ed8")
            : "#1e293b";
        const borderColor = isCurrent ? "#60a5fa" : "#334155";

        // For the current entity, show up to 6 field names
        const fieldLines = isCurrent
            ? entity.fields
                .slice(0, 6)
                .map((f) => `${f.name}: ${f.dataType}`)
                .join("\n") + (entity.fields.length > 6 ? `\n... +${entity.fields.length - 6} more` : "")
            : "";

        const kindBadge = info.kind ? ` [${info.kind.toUpperCase()}]` : "";
        const label = `${name}${kindBadge}\n${isCurrent ? `${entity.fieldCount} fields` : ""}`;

        return {
            id: name,
            position: {
                x: (i % COLS) * COL_WIDTH,
                y: Math.floor(i / COLS) * ROW_HEIGHT,
            },
            data: { label },
            ariaLabel: `Entity: ${name}${isCurrent ? " (current)" : ""}${kindBadge}`,
            style: {
                background: bg,
                color: "#fff",
                border: `${isCurrent ? "2px" : "1px"} solid ${borderColor}`,
                borderRadius: "8px",
                padding: "12px 16px",
                fontSize: "12px",
                fontWeight: 600,
                minWidth: "160px",
                textAlign: "center" as const,
                whiteSpace: "pre-line" as const,
                lineHeight: "1.5",
            },
        };
    });

    // Build relation edges with cardinality markers
    const edges: Edge[] = relations.map((rel) => {
        const kindLabel = CARDINALITY_LABELS[rel.relationKind] ?? rel.relationKind;
        const fkLabel = rel.fkField ? ` (${rel.fkField})` : "";
        const deleteLabel = rel.onDelete !== "restrict" ? ` [${rel.onDelete}]` : "";

        return {
            id: rel.id,
            source: entity.name,
            target: rel.targetEntity,
            label: `${rel.name}\n${kindLabel}${fkLabel}${deleteLabel}`,
            type: rel.relationKind === "m2m" ? "straight" : "smoothstep",
            animated: rel.relationKind === "m2m",
            ariaLabel: `${entity.name} ${rel.relationKind} ${rel.targetEntity}${fkLabel}`,
            style: {
                stroke: EDGE_COLORS[rel.relationKind] ?? "#64748b",
                strokeWidth: 1.5,
            },
            labelStyle: {
                fontSize: 10,
                fill: "#94a3b8",
                whiteSpace: "pre-line",
            },
            labelBgStyle: {
                fill: "#0f172a",
                fillOpacity: 0.85,
            },
            markerEnd: rel.relationKind !== "m2m"
                ? { type: "arrowclosed" as const }
                : undefined,
        };
    });

    return { nodes, edges };
}

// ─── Component ──────────────────────────────────────────────────

export function SchemaERDViewer({ entity, relations, onNodeClick }: SchemaERDViewerProps) {
    const initial = useMemo(
        () => buildERDGraph(entity, relations),
        [entity, relations],
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

    // Sync when data changes
    useEffect(() => {
        const updated = buildERDGraph(entity, relations);
        setNodes(updated.nodes);
        setEdges(updated.edges);
    }, [entity, relations, setNodes, setEdges]);

    return (
        <div
            className="h-full min-h-[500px] rounded-md border bg-background"
            role="img"
            aria-label={`Entity relationship diagram for ${entity.name} showing ${relations.length} relation${relations.length === 1 ? "" : "s"}`}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(_event, node) => onNodeClick?.(node.id)}
                fitView
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#1e293b" gap={20} />
                <Controls
                    showInteractive={false}
                    className="[&>button]:bg-muted [&>button]:border-border [&>button]:text-muted-foreground"
                />
                <MiniMap
                    nodeColor={(node) => node.id === entity.name ? "#3b82f6" : "#475569"}
                    maskColor="rgba(0,0,0,0.6)"
                    className="bg-card border-border"
                />
            </ReactFlow>
        </div>
    );
}
