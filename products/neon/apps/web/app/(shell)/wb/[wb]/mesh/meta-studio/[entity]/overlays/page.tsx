"use client";

import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Layers, Plus, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { OverlayDefinition } from "@/lib/schema-manager/types";
import type { DragEndEvent } from "@dnd-kit/core";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";


const CONFLICT_COLORS: Record<string, string> = {
    fail: "text-red-600 border-red-300 dark:text-red-400 dark:border-red-700",
    overwrite: "text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700",
    merge: "text-green-600 border-green-300 dark:text-green-400 dark:border-green-700",
};

const CHANGE_KIND_LABELS: Record<string, string> = {
    addField: "Add Field",
    removeField: "Remove Field",
    modifyField: "Modify Field",
    tweakPolicy: "Tweak Policy",
    overrideValidation: "Override Validation",
    overrideUi: "Override UI",
};

export default function OverlaysPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    const [overlays, setOverlays] = useState<OverlayDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchOverlays = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/overlays`,
                { headers: buildHeaders(), credentials: "same-origin", signal: controller.signal },
            );
            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load overlays (${res.status})`);
            }
            const body = (await res.json()) as { data: OverlayDefinition[] };
            setOverlays(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load overlays");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [entityName]);

    useEffect(() => {
        fetchOverlays();
        return () => abortRef.current?.abort();
    }, [fetchOverlays]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = overlays.findIndex((o) => o.id === active.id);
        const newIndex = overlays.findIndex((o) => o.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(overlays, oldIndex, newIndex).map((o, i) => ({
            ...o,
            priority: i,
        }));
        setOverlays(reordered);
    }, [overlays]);

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-md" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchOverlays}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Retry
                </Button>
            </div>
        );
    }

    if (overlays.length === 0) {
        return (
            <EmptyState
                icon={Layers}
                title="No overlays defined"
                description="Overlays extend base entity schemas with tenant-specific or context-specific modifications."
                actionLabel="Create Overlay"
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Overlays</h3>
                    <Badge variant="secondary" className="text-xs">{overlays.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchOverlays}>
                        <RefreshCw className="size-3.5" />
                    </Button>
                    <Button size="sm">
                        <Plus className="mr-1.5 size-3.5" />
                        Create Overlay
                    </Button>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Drag to reorder overlay priority. Higher priority overlays are applied last and can override earlier ones.
            </p>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={overlays.map((o) => o.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {overlays.map((overlay) => (
                            <SortableOverlayCard key={overlay.id} overlay={overlay} />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}

function SortableOverlayCard({ overlay }: { overlay: OverlayDefinition }) {
    const {
        attributes, listeners, setNodeRef,
        transform, transition, isDragging,
    } = useSortable({ id: overlay.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className={isDragging ? "z-10" : ""}>
            <Card className={isDragging ? "shadow-lg" : ""}>
                <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                        <button
                            {...attributes}
                            {...listeners}
                            className="mt-1 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
                        >
                            <GripVertical className="size-4" />
                        </button>

                        <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium">{overlay.overlayKey}</span>
                                <Badge variant="secondary" className="text-xs">Priority: {overlay.priority}</Badge>
                                <Badge variant="outline" className={`text-xs ${CONFLICT_COLORS[overlay.conflictMode] ?? ""}`}>
                                    {overlay.conflictMode}
                                </Badge>
                                <StatusDot status={overlay.isActive ? "published" : "archived"} />
                            </div>

                            {overlay.changes.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {overlay.changes.map((change) => (
                                        <Badge key={change.id} variant="outline" className="text-xs font-normal">
                                            {CHANGE_KIND_LABELS[change.kind] ?? change.kind}: <code className="ml-1 font-mono">{change.path}</code>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
