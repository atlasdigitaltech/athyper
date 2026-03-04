"use client";

import { Clock, Loader2 } from "lucide-react";
import { useMemo } from "react";

import type { MeshAuditEntry } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEntityActivity } from "@/lib/schema-manager/use-entity-activity";

// ─── Event Label Mapping ──────────────────────────────────────

const EVENT_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  "mesh.entity_created": { label: "Entity Created", variant: "default" },
  "mesh.entity_updated": { label: "Entity Updated", variant: "secondary" },
  "mesh.entity_deleted": { label: "Entity Deleted", variant: "destructive" },
  "mesh.field_added": { label: "Field Added", variant: "default" },
  "mesh.field_updated": { label: "Field Updated", variant: "secondary" },
  "mesh.field_deleted": { label: "Field Deleted", variant: "destructive" },
  "mesh.field_reordered": { label: "Fields Reordered", variant: "outline" },
  "mesh.relation_added": { label: "Relation Added", variant: "default" },
  "mesh.relation_deleted": {
    label: "Relation Deleted",
    variant: "destructive",
  },
  "mesh.index_added": { label: "Index Added", variant: "default" },
  "mesh.index_deleted": { label: "Index Deleted", variant: "destructive" },
  "mesh.policy_updated": { label: "Policy Updated", variant: "secondary" },
  "mesh.overlay_saved": { label: "Overlay Saved", variant: "secondary" },
  "mesh.version_created": { label: "Version Created", variant: "default" },
  "mesh.version_published": { label: "Version Published", variant: "default" },
  "mesh.version_deprecated": {
    label: "Version Deprecated",
    variant: "outline",
  },
  "mesh.schema_compiled": { label: "Schema Compiled", variant: "outline" },
};

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Activity Entry ───────────────────────────────────────────

function ActivityEntry({ entry }: { entry: MeshAuditEntry }) {
  const eventInfo = EVENT_LABELS[entry.event] ?? {
    label: entry.event,
    variant: "outline" as const,
  };
  const hasChanges = entry.before != null || entry.after != null;

  return (
    <div className="relative flex gap-3 pb-6 last:pb-0">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className="size-2 rounded-full bg-foreground/30 mt-2" />
        <div className="w-px flex-1 bg-border" />
      </div>

      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={eventInfo.variant}
            className="text-[10px] leading-tight"
          >
            {eventInfo.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(entry.ts)}
          </span>
        </div>

        {entry.sidHash && (
          <p className="text-xs text-muted-foreground">
            User{" "}
            <span className="font-mono">{entry.sidHash.slice(0, 8)}...</span>
          </p>
        )}

        {entry.correlationId && (
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            {entry.correlationId.slice(0, 8)}
          </p>
        )}

        {hasChanges && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              View changes
            </summary>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
              {entry.before != null && (
                <div className="rounded border bg-destructive/10 p-2 overflow-auto max-h-32">
                  <p className="font-medium text-destructive mb-1">Before</p>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.before, null, 2)}
                  </pre>
                </div>
              )}
              {entry.after != null && (
                <div className="rounded border bg-success/10 p-2 overflow-auto max-h-32">
                  <p className="font-medium text-success mb-1">After</p>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// ─── Activity Drawer ──────────────────────────────────────────

interface ActivityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
}

export function ActivityDrawer({
  open,
  onOpenChange,
  entityName,
}: ActivityDrawerProps) {
  const { entries, loading, error, hasMore, loadMore, refresh } =
    useEntityActivity(entityName);

  const groupedEntries = useMemo(() => {
    const groups: { date: string; entries: MeshAuditEntry[] }[] = [];
    let currentDate = "";

    for (const entry of entries) {
      const date = new Date(entry.ts).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }

    return groups;
  }, [entries]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            Activity
          </SheetTitle>
          <SheetDescription>
            Admin change history for{" "}
            <span className="font-mono">{entityName}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {loading && entries.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={refresh}
              >
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No activity recorded yet.
            </p>
          )}

          {groupedEntries.map((group) => (
            <div key={group.date}>
              <p className="text-xs font-medium text-muted-foreground mb-3">
                {group.date}
              </p>
              {group.entries.map((entry, i) => (
                <ActivityEntry key={`${entry.ts}-${i}`} entry={entry} />
              ))}
            </div>
          ))}

          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : null}
              Load more
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
