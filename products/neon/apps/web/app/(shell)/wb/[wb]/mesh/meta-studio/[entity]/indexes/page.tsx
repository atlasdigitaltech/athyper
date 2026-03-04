"use client";

import { Database, Plus, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { IndexDefinition } from "@/lib/schema-manager/types";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";


const METHOD_COLORS: Record<string, string> = {
    btree: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300",
    gin: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300",
    gist: "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300",
    hash: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
};

export default function IndexesPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    const [indexes, setIndexes] = useState<IndexDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchIndexes = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/indexes`,
                { headers: buildHeaders(), credentials: "same-origin", signal: controller.signal },
            );
            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load indexes (${res.status})`);
            }
            const body = (await res.json()) as { data: IndexDefinition[] };
            setIndexes(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load indexes");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [entityName]);

    useEffect(() => {
        fetchIndexes();
        return () => abortRef.current?.abort();
    }, [fetchIndexes]);

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-md" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchIndexes}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Retry
                </Button>
            </div>
        );
    }

    if (indexes.length === 0) {
        return (
            <EmptyState
                icon={Database}
                title="No indexes defined"
                description="Add indexes to optimize query performance for this entity."
                actionLabel="Add Index"
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Indexes</h3>
                    <Badge variant="secondary" className="text-xs">{indexes.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchIndexes}>
                        <RefreshCw className="size-3.5" />
                    </Button>
                    <Button size="sm">
                        <Plus className="mr-1.5 size-3.5" />
                        Add Index
                    </Button>
                </div>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-center">Unique</TableHead>
                        <TableHead>Columns</TableHead>
                        <TableHead>Where Clause</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {indexes.map((idx) => (
                        <TableRow key={idx.id}>
                            <TableCell className="font-mono text-sm font-medium">{idx.name}</TableCell>
                            <TableCell>
                                <Badge variant="outline" className={`text-xs font-mono ${METHOD_COLORS[idx.method] ?? ""}`}>
                                    {idx.method}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                                {idx.isUnique ? (
                                    <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                                        unique
                                    </Badge>
                                ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {Array.isArray(idx.columns)
                                    ? (idx.columns as string[]).join(", ")
                                    : JSON.stringify(idx.columns)}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                                {idx.whereClause ?? "—"}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
