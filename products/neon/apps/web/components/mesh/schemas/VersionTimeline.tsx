"use client";

import { AlertTriangle, Archive, ArrowRightLeft, Clock, Eye, GitCommit, Plus, RefreshCw, Rocket, User } from "lucide-react";
import { useCallback, useState } from "react";

import type { SchemaDiff } from "@/lib/schema-manager/schema-diff";
import type { VersionSummary } from "@/lib/schema-manager/types";

import { SchemaDiffViewer } from "@/components/mesh/schemas/SchemaDiffViewer";
import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntityVersions } from "@/lib/schema-manager/use-entity-versions";
import { useMutation } from "@/lib/schema-manager/use-mutation";


interface VersionTimelineProps {
    entityName: string;
    readonly?: boolean;
}

export function VersionTimeline({ entityName, readonly }: VersionTimelineProps) {
    const { versions, loading, error, refresh } = useEntityVersions(entityName);
    const [compareMode, setCompareMode] = useState(false);
    const [compareVersions, setCompareVersions] = useState<[string | null, string | null]>([null, null]);
    const [diffResult, setDiffResult] = useState<SchemaDiff | null>(null);
    const [diffLoading, setDiffLoading] = useState(false);

    const publishMutation = useMutation<void>({
        url: `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/publish`,
        method: "POST",
        onSuccess: () => refresh(),
    });

    const deprecateMutation = useMutation<void>({
        url: `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/deprecate`,
        method: "POST",
        onSuccess: () => refresh(),
    });

    const handleToggleCompare = useCallback((versionId: string) => {
        setCompareVersions((prev) => {
            if (prev[0] === versionId) return [null, prev[1]];
            if (prev[1] === versionId) return [prev[0], null];
            if (!prev[0]) return [versionId, prev[1]];
            return [prev[0], versionId];
        });
        setDiffResult(null);
    }, []);

    const handleViewDiff = useCallback(async () => {
        if (!compareVersions[0] || !compareVersions[1]) return;
        setDiffLoading(true);
        try {
            const res = await fetch(
                `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/diff?base=${compareVersions[0]}&target=${compareVersions[1]}`
            );
            if (res.ok) {
                const body = (await res.json()) as { success: boolean; data?: SchemaDiff };
                if (body.success && body.data) {
                    setDiffResult(body.data);
                }
            }
        } catch {
            // Silently fail — diff is non-critical UI
        } finally {
            setDiffLoading(false);
        }
    }, [compareVersions, entityName]);

    const handlePublish = useCallback(async () => {
        await publishMutation.mutate();
    }, [publishMutation]);

    const handleDeprecate = useCallback(async () => {
        await deprecateMutation.mutate();
    }, [deprecateMutation]);

    const handleNewVersion = useCallback(async () => {
        const res = await fetch(`/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/versions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        if (res.ok) refresh();
    }, [entityName, refresh]);

    if (loading) {
        return (
            <div className="space-y-4">
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
                <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Retry
                </Button>
            </div>
        );
    }

    if (versions.length === 0) {
        return (
            <EmptyState
                icon={GitCommit}
                title="No versions"
                description="Create the first version of this entity to start defining its schema."
                actionLabel="Create Version"
                onAction={readonly ? undefined : handleNewVersion}
            />
        );
    }

    const sorted = [...versions].sort((a, b) => b.versionNo - a.versionNo);
    const currentVersion = sorted[0];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Version History</h3>
                    <Badge variant="secondary" className="text-xs">{versions.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={compareMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                            setCompareMode(!compareMode);
                            setCompareVersions([null, null]);
                            setDiffResult(null);
                        }}
                        className="gap-1.5"
                    >
                        <ArrowRightLeft className="size-3.5" />
                        {compareMode ? "Exit Compare" : "Compare"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={refresh}>
                        <RefreshCw className="size-3.5" />
                    </Button>

                    {/* Publish button — only for draft versions */}
                    {!readonly && currentVersion?.status === "draft" && (
                        <Button
                            size="sm"
                            variant="default"
                            className="gap-1.5"
                            onClick={handlePublish}
                            disabled={publishMutation.loading}
                        >
                            <Rocket className="size-3.5" />
                            {publishMutation.loading ? "Publishing..." : "Publish"}
                        </Button>
                    )}

                    {/* Deprecate button — only for published versions */}
                    {!readonly && currentVersion?.status === "published" && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-warning"
                            onClick={handleDeprecate}
                            disabled={deprecateMutation.loading}
                        >
                            <Archive className="size-3.5" />
                            {deprecateMutation.loading ? "Deprecating..." : "Deprecate"}
                        </Button>
                    )}

                    {/* New Version — only for published/archived (to create next draft) */}
                    {!readonly && currentVersion?.status !== "draft" && (
                        <Button size="sm" onClick={handleNewVersion}>
                            <Plus className="mr-1.5 size-3.5" />
                            New Version
                        </Button>
                    )}
                </div>
            </div>

            {compareMode && (
                <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">
                        Select two versions to compare. Click on version cards to select them.
                        {compareVersions[0] && compareVersions[1] && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="ml-2 h-6 text-xs"
                                onClick={handleViewDiff}
                                disabled={diffLoading}
                            >
                                <ArrowRightLeft className="mr-1 size-3" />
                                {diffLoading ? "Loading..." : "View Diff"}
                            </Button>
                        )}
                    </p>
                </div>
            )}

            {/* Diff viewer panel */}
            {diffResult && (
                <div className="rounded-md border p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Version Diff</h4>
                        <Button variant="ghost" size="sm" onClick={() => setDiffResult(null)}>
                            Close
                        </Button>
                    </div>
                    <SchemaDiffViewer diff={diffResult} />
                </div>
            )}

            {/* Mutation errors */}
            {(publishMutation.error || deprecateMutation.error) && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 flex items-center gap-2">
                    <AlertTriangle className="size-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive">
                        {publishMutation.error || deprecateMutation.error}
                    </p>
                </div>
            )}

            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

                <div className="space-y-4">
                    {sorted.map((version, index) => (
                        <VersionCard
                            key={version.id}
                            version={version}
                            isLatest={index === 0}
                            compareMode={compareMode}
                            isSelected={
                                compareVersions[0] === version.id ||
                                compareVersions[1] === version.id
                            }
                            onToggleCompare={() => handleToggleCompare(version.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

interface VersionCardProps {
    version: VersionSummary;
    isLatest: boolean;
    compareMode: boolean;
    isSelected: boolean;
    onToggleCompare: () => void;
}

function VersionCard({ version, isLatest, compareMode, isSelected, onToggleCompare }: VersionCardProps) {
    const formattedDate = version.publishedAt
        ? new Date(version.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
          })
        : new Date(version.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
          });

    return (
        <div
            className={`relative flex gap-4 pl-2 cursor-pointer transition-colors rounded-md ${
                isSelected ? "bg-primary/5 ring-1 ring-primary/30" : ""
            }`}
            onClick={compareMode ? onToggleCompare : undefined}
        >
            {/* Timeline node */}
            <div className="relative z-10 mt-4 flex shrink-0 items-center justify-center">
                <div
                    className={`size-8 rounded-full border-2 flex items-center justify-center ${
                        version.status === "published"
                            ? "border-success bg-success/10"
                            : version.status === "draft"
                              ? "border-warning bg-warning/10"
                              : "border-muted-foreground/30 bg-muted"
                    }`}
                >
                    <GitCommit className="size-4 text-muted-foreground" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 rounded-md border p-4 my-1">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">v{version.versionNo}</span>
                        <StatusDot status={version.status} />
                        <Badge
                            variant={version.status === "published" ? "default" : "outline"}
                            className="text-xs capitalize"
                        >
                            {version.status}
                        </Badge>
                        {isLatest && (
                            <Badge variant="secondary" className="text-xs">Latest</Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                            <Eye className="size-3" />
                            View
                        </Button>
                    </div>
                </div>

                {version.label && (
                    <p className="mt-1 text-sm text-muted-foreground">{version.label}</p>
                )}

                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {formattedDate}
                    </span>
                    {version.publishedBy && (
                        <span className="inline-flex items-center gap-1">
                            <User className="size-3" />
                            {version.publishedBy}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
