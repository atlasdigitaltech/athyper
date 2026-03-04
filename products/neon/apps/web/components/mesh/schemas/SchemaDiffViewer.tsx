"use client";

import { AlertTriangle, Minus, Plus, RefreshCw } from "lucide-react";

import type { FieldDiffEntry, IndexDiffEntry, RelationDiffEntry, SchemaDiff } from "@/lib/schema-manager/schema-diff";

import { Badge } from "@/components/ui/badge";
import { DIFF_ICON_COLOR } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";


// ─── Diff Entry Row ───────────────────────────────────────────

function DiffIcon({ kind }: { kind: string }) {
    const colorClass = DIFF_ICON_COLOR[kind];
    switch (kind) {
        case "added":
            return <Plus className={cn("size-3.5", colorClass)} />;
        case "removed":
            return <Minus className={cn("size-3.5", colorClass)} />;
        case "modified":
        case "renamed":
        case "type_changed":
            return <RefreshCw className={cn("size-3.5", colorClass)} />;
        default:
            return null;
    }
}

function FieldDiffRow({ entry }: { entry: FieldDiffEntry }) {
    return (
        <div className="flex items-start gap-2 py-1.5 text-sm">
            <DiffIcon kind={entry.kind} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{entry.fieldName}</span>
                    <Badge variant="outline" className="text-[10px]">{entry.kind}</Badge>
                    {entry.breaking && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="size-2.5" />
                            Breaking
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>
            </div>
        </div>
    );
}

function RelationDiffRow({ entry }: { entry: RelationDiffEntry }) {
    return (
        <div className="flex items-start gap-2 py-1.5 text-sm">
            <DiffIcon kind={entry.kind} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{entry.relationName}</span>
                    <Badge variant="outline" className="text-[10px]">{entry.kind}</Badge>
                    {entry.breaking && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="size-2.5" />
                            Breaking
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>
            </div>
        </div>
    );
}

function IndexDiffRow({ entry }: { entry: IndexDiffEntry }) {
    return (
        <div className="flex items-start gap-2 py-1.5 text-sm">
            <DiffIcon kind={entry.kind} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{entry.indexName}</span>
                    <Badge variant="outline" className="text-[10px]">{entry.kind}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>
            </div>
        </div>
    );
}

// ─── Schema Diff Viewer ───────────────────────────────────────

interface SchemaDiffViewerProps {
    diff: SchemaDiff;
}

export function SchemaDiffViewer({ diff }: SchemaDiffViewerProps) {
    const hasChanges = diff.fields.length > 0 || diff.relations.length > 0 || diff.indexes.length > 0;

    if (!hasChanges) {
        return (
            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                No changes between versions
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{diff.summary}</p>
                {diff.breaking && (
                    <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="size-3" />
                        Contains breaking changes
                    </Badge>
                )}
            </div>

            {diff.fields.length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Fields ({diff.fields.length})
                    </h4>
                    <div className="rounded-md border divide-y">
                        {diff.fields.map((entry, i) => (
                            <div key={i} className="px-3">
                                <FieldDiffRow entry={entry} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {diff.relations.length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Relations ({diff.relations.length})
                    </h4>
                    <div className="rounded-md border divide-y">
                        {diff.relations.map((entry, i) => (
                            <div key={i} className="px-3">
                                <RelationDiffRow entry={entry} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {diff.indexes.length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Indexes ({diff.indexes.length})
                    </h4>
                    <div className="rounded-md border divide-y">
                        {diff.indexes.map((entry, i) => (
                            <div key={i} className="px-3">
                                <IndexDiffRow entry={entry} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
