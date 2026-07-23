"use client";

import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { Badge, Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { ConflictSeverity, FinanceSetupConflict } from "../../lib/finance-setup.types";

const SEVERITY_ICON: Record<ConflictSeverity, LucideIcon> = {
  blocker: AlertCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

const SEVERITY_TONE: Record<ConflictSeverity, string> = {
  blocker: "text-destructive",
  error:   "text-destructive",
  warning: "text-warning",
  info:    "text-info",
};

const SEVERITY_BADGE: Record<ConflictSeverity, "destructive" | "warning" | "info"> = {
  blocker: "destructive",
  error:   "destructive",
  warning: "warning",
  info:    "info",
};

const CATEGORY_LABEL: Record<FinanceSetupConflict["category"], string> = {
  foundation:  "Addresses & contacts",
  chart:       "Chart",
  book:        "Books",
  gl_control:  "GL controls",
  posting_role:"Posting roles",
  house_bank:  "House banks",
  period:      "Period",
  assignment:  "Assignment",
};

function ConflictRow({ conflict }: { conflict: FinanceSetupConflict }) {
  const Icon = SEVERITY_ICON[conflict.severity];
  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-transparent p-3 transition-colors",
        "hover:border-border hover:bg-muted/40",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", SEVERITY_TONE[conflict.severity])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{conflict.title}</span>
          <Badge variant={SEVERITY_BADGE[conflict.severity]} size="sm">
            {CATEGORY_LABEL[conflict.category]}
          </Badge>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{conflict.message}</p>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {conflict.reasonCode}
        </span>
      </div>
      {conflict.actionHref ? (
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link href={conflict.actionHref} aria-label={conflict.actionLabel ?? "Fix"}>
            {conflict.actionLabel ?? "Fix"}
            <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </li>
  );
}

export interface NeedsAttentionInboxProps {
  conflicts:   FinanceSetupConflict[];
  totalCount?: number;   // when provided and > conflicts.length, shows "show all" link
  showAllHref?: string;
  className?:  string;
  emptyLabel?: string;
}

export function NeedsAttentionInbox({
  conflicts,
  totalCount,
  showAllHref,
  className,
  emptyLabel = "All clear — nothing needs attention.",
}: NeedsAttentionInboxProps) {
  const remainingCount = totalCount ? Math.max(0, totalCount - conflicts.length) : 0;

  return (
    <section
      className={cn("rounded-lg border bg-card", className)}
      aria-labelledby="finance-setup-inbox"
    >
      <div className="flex items-center justify-between border-b p-3">
        <h2 id="finance-setup-inbox" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Needs Attention
        </h2>
        {totalCount && totalCount > 0 ? (
          <Badge variant="secondary" size="sm">
            {totalCount}
          </Badge>
        ) : null}
      </div>

      {conflicts.length === 0 ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          {emptyLabel}
        </div>
      ) : (
        <ul role="list" className="divide-y divide-border/60 p-1">
          {conflicts.map((c) => (
            <ConflictRow key={c.id} conflict={c} />
          ))}
        </ul>
      )}

      {remainingCount > 0 && showAllHref ? (
        <div className="border-t p-2 text-center">
          <Button asChild variant="link" size="sm">
            <Link href={showAllHref}>
              Show all {totalCount} issues
              <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
