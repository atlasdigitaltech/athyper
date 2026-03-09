"use client";

// components/finance/PackViewer.tsx
//
// Renders a report pack instance: header with status/actions,
// ordered list of pack items with status indicators, and
// navigation to view individual statement instances.

import { useState } from "react";
import {
  Badge,
  Card,
  Button,
} from "@neon/ui";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  SkipForward,
  Package,
  MessageSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  PackInstanceDTO,
  PackInstanceItemDTO,
  PackInstanceStatus,
  PackItemStatus,
  ReportCommentaryDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PackViewerProps {
  instance: PackInstanceDTO;
  items: PackInstanceItemDTO[];
  commentary?: ReportCommentaryDTO[];
  onStatusChange?: (
    packInstanceId: string,
    targetStatus: PackInstanceStatus,
  ) => void;
  onRefresh?: () => void;
  onViewStatement?: (statementInstanceId: string) => void;
  statusUpdating?: boolean;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const PACK_STATUS_COLORS: Record<PackInstanceStatus, string> = {
  GENERATING: "bg-amber-100 text-amber-700",
  DRAFT: "bg-slate-100 text-slate-700",
  REVIEWED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  FINALIZED: "bg-purple-100 text-purple-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  SUPERSEDED: "bg-gray-100 text-gray-500",
};

const NEXT_STATUS: Partial<Record<PackInstanceStatus, PackInstanceStatus>> = {
  DRAFT: "REVIEWED",
  REVIEWED: "APPROVED",
  APPROVED: "FINALIZED",
  FINALIZED: "PUBLISHED",
};

const STATUS_ACTION_LABEL: Partial<Record<PackInstanceStatus, string>> = {
  DRAFT: "Mark as Reviewed",
  REVIEWED: "Approve",
  APPROVED: "Finalize",
  FINALIZED: "Publish",
};

const ITEM_STATUS_ICON: Record<PackItemStatus, typeof CheckCircle2> = {
  PENDING: Clock,
  GENERATING: Loader2,
  COMPLETED: CheckCircle2,
  FAILED: AlertCircle,
  SKIPPED: SkipForward,
};

const ITEM_STATUS_COLOR: Record<PackItemStatus, string> = {
  PENDING: "text-muted-foreground",
  GENERATING: "text-amber-500 animate-spin",
  COMPLETED: "text-green-600",
  FAILED: "text-red-600",
  SKIPPED: "text-gray-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PackViewer({
  instance,
  items,
  commentary = [],
  onStatusChange,
  onRefresh,
  onViewStatement,
  statusUpdating,
}: PackViewerProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const nextStatus = NEXT_STATUS[instance.status];
  const completedCount = items.filter((i) => i.itemStatus === "COMPLETED").length;
  const failedCount = items.filter((i) => i.itemStatus === "FAILED").length;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {instance.packName}
              </h2>
              <Badge className={cn("text-xs", PACK_STATUS_COLORS[instance.status])}>
                {instance.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              FY {instance.fiscalYear} &middot; Period{" "}
              {instance.periodFrom === instance.periodTo
                ? instance.periodFrom
                : `${instance.periodFrom}-${instance.periodTo}`}
              {" "}&middot; Book: {instance.bookCode}
              {instance.varianceSource && ` \u00b7 vs ${instance.varianceSource.replace(/_/g, " ")}`}
              {instance.periodMode && ` \u00b7 ${instance.periodMode}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
            )}
            {nextStatus && onStatusChange && (
              <Button
                size="sm"
                disabled={statusUpdating || failedCount > 0}
                onClick={() => onStatusChange(instance.id, nextStatus)}
                title={failedCount > 0 ? "Cannot advance: some items failed" : undefined}
              >
                {statusUpdating
                  ? "Updating..."
                  : STATUS_ACTION_LABEL[instance.status]}
              </Button>
            )}
          </div>
        </div>

        {/* Generation metadata */}
        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          {instance.generatedAt && (
            <span>
              Generated {new Date(instance.generatedAt).toLocaleString()}
              {instance.generationDurationMs != null &&
                ` (${instance.generationDurationMs}ms)`}
            </span>
          )}
          <span>
            {completedCount}/{instance.totalItems} items completed
            {failedCount > 0 && (
              <span className="text-red-600 ml-1">
                ({failedCount} failed)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Pack items list */}
      <div className="divide-y">
        {items.map((item) => {
          const StatusIcon = ITEM_STATUS_ICON[item.itemStatus];
          const isExpanded = expandedItems.has(item.id);
          const itemCommentary = commentary.filter(
            (c) => c.packInstanceItemId === item.id,
          );
          const hasDetail = item.statementInstanceId || item.narrativeContent || itemCommentary.length > 0;

          return (
            <div key={item.id}>
              {/* Item row */}
              <div
                className={cn(
                  "flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30",
                  item.pageBreakBefore && "border-t-2 border-border",
                )}
              >
                {/* Expand/collapse */}
                {hasDetail ? (
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <span className="w-5" />
                )}

                {/* Status icon */}
                <StatusIcon className={cn("h-4 w-4", ITEM_STATUS_COLOR[item.itemStatus])} />

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{item.label}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {item.itemType}
                    </Badge>
                    {itemCommentary.length > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {itemCommentary.length}
                      </span>
                    )}
                  </div>
                  {item.errorMessage && (
                    <p className="text-xs text-red-600 mt-0.5 truncate">
                      {item.errorMessage}
                    </p>
                  )}
                </div>

                {/* Resolved parameters */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {item.resolvedBookCode && (
                    <span>{item.resolvedBookCode}</span>
                  )}
                  {item.resolvedPeriodMode && (
                    <span>{item.resolvedPeriodMode}</span>
                  )}
                </div>

                {/* View statement button */}
                {item.statementInstanceId && onViewStatement && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewStatement(item.statementInstanceId!)}
                  >
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    View
                  </Button>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-muted/10 px-6 py-3 pl-14 border-t border-border/30">
                  {/* Narrative content */}
                  {item.narrativeContent && (
                    <div className="text-sm whitespace-pre-wrap mb-3">
                      {item.narrativeContent}
                    </div>
                  )}

                  {/* Commentary */}
                  {itemCommentary.length > 0 && (
                    <div className="space-y-2">
                      {itemCommentary.map((c) => (
                        <CommentaryCard key={c.id} commentary={c} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="px-6 py-12 text-center text-muted-foreground">
          No items in this pack.
        </div>
      )}

      {/* Pack-level commentary */}
      {commentary.filter((c) => c.targetKind === "pack_instance").length > 0 && (
        <div className="border-t px-6 py-4">
          <h3 className="text-sm font-medium mb-3">Pack Commentary</h3>
          <div className="space-y-2">
            {commentary
              .filter((c) => c.targetKind === "pack_instance")
              .map((c) => (
                <CommentaryCard key={c.id} commentary={c} />
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Commentary card
// ---------------------------------------------------------------------------

const COMMENTARY_TYPE_COLORS: Record<string, string> = {
  NARRATIVE: "bg-blue-50 text-blue-700 border-blue-200",
  HIGHLIGHT: "bg-amber-50 text-amber-700 border-amber-200",
  RISK: "bg-red-50 text-red-700 border-red-200",
  ACTION: "bg-green-50 text-green-700 border-green-200",
  APPROVAL_NOTE: "bg-purple-50 text-purple-700 border-purple-200",
};

function CommentaryCard({ commentary }: { commentary: ReportCommentaryDTO }) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-sm",
        COMMENTARY_TYPE_COLORS[commentary.commentaryType] ?? "border-border",
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] py-0">
            {commentary.commentaryType}
          </Badge>
          {commentary.title && (
            <span className="font-medium">{commentary.title}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {commentary.authorName && `${commentary.authorName} \u00b7 `}
          {new Date(commentary.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="whitespace-pre-wrap">{commentary.body}</p>
    </div>
  );
}
