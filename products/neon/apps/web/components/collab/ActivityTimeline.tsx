"use client";

import {
  GitBranch,
  ShieldCheck,
  Eye,
  AlertTriangle,
  FileText,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useTimeline, type TimelineEntry } from "@/lib/collab";
import { SEVERITY_BORDER } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ─── Icon mapping by timeline source ─────────────────────────

const SOURCE_ICON: Record<string, React.ReactNode> = {
  workflow_audit: <GitBranch className="size-4" />,
  permission_decision: <ShieldCheck className="size-4" />,
  field_access: <Eye className="size-4" />,
  security_event: <AlertTriangle className="size-4" />,
  audit_log: <FileText className="size-4" />,
};

// ─── Timeline entry card ─────────────────────────────────────

function TimelineCard({ entry }: { entry: TimelineEntry }) {
  const icon = SOURCE_ICON[entry.source] ?? <FileText className="size-4" />;
  const borderColor =
    SEVERITY_BORDER[entry.severity] ?? "border-l-muted-foreground";
  const dateStr = new Date(entry.occurredAt).toLocaleString();

  return (
    <div className={cn("flex gap-3 border-l-2 py-3 pl-4", borderColor)}>
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{entry.summary}</span>
          <Badge variant="outline" className="text-[10px]">
            {entry.source.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
          <span>{dateStr}</span>
          {entry.actorDisplayName && (
            <>
              <span>&middot;</span>
              <span>{entry.actorDisplayName}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

interface ActivityTimelineProps {
  entityType: string;
  entityId: string;
}

export function ActivityTimeline({
  entityType,
  entityId,
}: ActivityTimelineProps) {
  const { entries, isLoading, error, hasMore, loadMore } = useTimeline({
    entityType,
    entityId,
  });

  if (isLoading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load timeline: {error.message ?? "Unknown error"}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {entries.map((entry) => (
        <TimelineCard key={entry.id} entry={entry} />
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          className="mt-2 w-full rounded-md py-2 text-center text-sm text-muted-foreground hover:bg-accent"
        >
          Load more
        </button>
      )}
    </div>
  );
}
