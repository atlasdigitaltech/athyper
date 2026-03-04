"use client";

import { Plus, RefreshCw, Shield, ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EntityPolicy, FieldSecurityPolicy } from "@/lib/schema-manager/types";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";


interface PoliciesData {
    entityPolicies: EntityPolicy[];
    fieldSecurityPolicies: FieldSecurityPolicy[];
}

const MASK_COLORS: Record<string, string> = {
    null: "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400",
    redact: "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400",
    hash: "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400",
    partial: "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400",
    remove: "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300",
};

export default function PoliciesPage() {
    const { entity } = useParams<{ entity: string }>();
    const entityName = decodeURIComponent(entity);

    const [data, setData] = useState<PoliciesData>({ entityPolicies: [], fieldSecurityPolicies: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchPolicies = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/policies`,
                { headers: buildHeaders(), credentials: "same-origin", signal: controller.signal },
            );
            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load policies (${res.status})`);
            }
            const body = (await res.json()) as { data?: Partial<PoliciesData> };
            setData({
                entityPolicies: body.data?.entityPolicies ?? [],
                fieldSecurityPolicies: body.data?.fieldSecurityPolicies ?? [],
            });
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load policies");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [entityName]);

    useEffect(() => {
        fetchPolicies();
        return () => abortRef.current?.abort();
    }, [fetchPolicies]);

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 rounded-md" />
                <Skeleton className="h-48 rounded-md" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchPolicies}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Retry
                </Button>
            </div>
        );
    }

    const { entityPolicies, fieldSecurityPolicies } = data;
    const hasAny = entityPolicies.length > 0 || fieldSecurityPolicies.length > 0;

    if (!hasAny) {
        return (
            <EmptyState
                icon={Shield}
                title="No policies configured"
                description="Define access policies and field-level security rules for this entity."
                actionLabel="Add Policy"
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Entity Policies */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium">Entity Policies</h3>
                        <Badge variant="secondary" className="text-xs">{entityPolicies.length}</Badge>
                    </div>
                    <Button size="sm" variant="outline">
                        <Plus className="mr-1.5 size-3.5" />
                        Add Policy
                    </Button>
                </div>

                {entityPolicies.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                        {entityPolicies.map((policy) => (
                            <Card key={policy.id}>
                                <CardContent className="p-4 space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline" className="text-xs">
                                            Access: {policy.accessMode}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            OU Scope: {policy.ouScopeMode}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            Audit: {policy.auditMode}
                                        </Badge>
                                    </div>
                                    {policy.retentionPolicy && (
                                        <p className="text-xs text-muted-foreground font-mono">
                                            Retention: {JSON.stringify(policy.retentionPolicy)}
                                        </p>
                                    )}
                                    {policy.cacheFlags && (
                                        <p className="text-xs text-muted-foreground font-mono">
                                            Cache: {JSON.stringify(policy.cacheFlags)}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">No entity-level policies configured.</p>
                )}
            </section>

            <Separator />

            {/* Field Security Policies */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium">Field Security</h3>
                        <Badge variant="secondary" className="text-xs">{fieldSecurityPolicies.length}</Badge>
                    </div>
                    <Button size="sm" variant="outline">
                        <Plus className="mr-1.5 size-3.5" />
                        Add Rule
                    </Button>
                </div>

                {fieldSecurityPolicies.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Field Path</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Roles</TableHead>
                                <TableHead>Mask Strategy</TableHead>
                                <TableHead>Scope</TableHead>
                                <TableHead className="text-center">Priority</TableHead>
                                <TableHead className="text-center">Active</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fieldSecurityPolicies.map((fsp) => (
                                <TableRow key={fsp.id}>
                                    <TableCell className="font-mono text-sm">{fsp.fieldPath}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-xs capitalize">{fsp.policyType}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                                        {fsp.roleList ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`text-xs font-mono ${MASK_COLORS[fsp.maskStrategy] ?? ""}`}>
                                            {fsp.maskStrategy}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{fsp.scope}</TableCell>
                                    <TableCell className="text-center text-xs">{fsp.priority}</TableCell>
                                    <TableCell className="text-center">
                                        <div className={`inline-block size-2 rounded-full ${fsp.isActive ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-sm text-muted-foreground">No field-level security rules configured.</p>
                )}
            </section>
        </div>
    );
}
