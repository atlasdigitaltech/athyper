"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { fmtCompact } from "./format";

type ReportTone = "neutral" | "success" | "warning" | "danger";

function reportToneClass(tone: ReportTone): string {
  switch (tone) {
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-destructive";
    default:
      return "text-foreground";
  }
}

export function ReportLiveBadge({ live = true, className }: { live?: boolean; className?: string }) {
  if (!live) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-info/30 bg-info/10 px-2 py-0.5",
        "text-xs font-medium leading-none text-info",
        className,
      )}
    >
      Live
    </span>
  );
}

export function ReportTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("shrink-0 text-sm font-medium leading-5 text-foreground", className)}>
      {children}
    </span>
  );
}

export function ReportChooserSuffix({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-0.5 inline-flex h-4 w-3 shrink-0 flex-col items-center justify-center text-current",
        className,
      )}
    >
      <ChevronUp className="h-3 w-3 animate-pulse opacity-85 motion-reduce:animate-none [animation-duration:1.15s]" />
      <ChevronDown className="-mt-1.5 h-3 w-3 animate-pulse opacity-85 motion-reduce:animate-none [animation-delay:180ms] [animation-duration:1.15s]" />
    </span>
  );
}

export function ReportHeaderRow({
  title,
  meta,
  actions,
  className,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("-mx-2 border-b sm:-mx-4", className)}>
      <div className="flex h-10 min-w-0 items-center gap-3 overflow-x-auto px-2 py-1 text-sm leading-5 text-muted-foreground sm:px-4">
        <ReportTitle>{title}</ReportTitle>
        {meta}
        <div className="flex-1" />
        {actions && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReportMetaRow({
  source,
  asAt,
  totalLabel,
  totalValue,
  countLabel,
  className,
}: {
  source?: string;
  asAt?: string | Date | null;
  totalLabel?: string;
  totalValue?: ReactNode;
  countLabel?: string;
  className?: string;
}) {
  const asAtLabel = asAt
    ? asAt instanceof Date
      ? asAt.toLocaleDateString()
      : new Date(asAt).toLocaleDateString()
    : "period end";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 text-xs leading-4 text-muted-foreground", className)}>
      <span>
        {source && <>Source: {source} - </>}
        As at {asAtLabel}
      </span>
      {(totalLabel || countLabel) && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {totalLabel && (
            <span>
              {totalLabel}: <span className="font-medium text-foreground">{totalValue}</span>
            </span>
          )}
          {countLabel && <span>{countLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function ReportMetricGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-5", className)}>
      {children}
    </div>
  );
}

export function ReportMetricCard({
  label,
  value,
  detail,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: ReportTone;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1 rounded-lg border bg-background px-3 py-2.5", className)}>
      <div className="text-xs font-medium leading-4 text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium leading-5 tabular-nums", reportToneClass(tone))}>
        {value}
      </div>
      {detail && <div className="text-xs leading-4 text-muted-foreground">{detail}</div>}
    </div>
  );
}

export function ReportGraphMetric({
  label,
  value,
  displayValue,
  tone = "neutral",
}: {
  label: string;
  value: number;
  displayValue?: string;
  tone?: ReportTone;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm leading-5">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className={cn("shrink-0 font-medium tabular-nums", reportToneClass(tone))}>
        {displayValue ?? fmtCompact(value)}
      </span>
    </div>
  );
}

export function StatementColumnHeader({
  currentLabel,
  priorLabel,
  showComparative,
  accountLabel = "Account",
}: {
  currentLabel?: string;
  priorLabel?: string;
  showComparative: boolean;
  accountLabel?: string;
}) {
  return (
    <div className="flex items-center border-b bg-muted/20 px-2 py-2 text-xs font-medium leading-4 text-muted-foreground">
      <span className="flex-1">{accountLabel}</span>
      <div className="flex items-center gap-6 pr-0">
        <span className="w-28 text-right">
          {currentLabel ?? "Amount"}
        </span>
        {showComparative && (
          <>
            <span className="w-28 text-right">
              {priorLabel ?? "Prior year"}
            </span>
            <span className="w-20 text-right">Variance</span>
          </>
        )}
      </div>
    </div>
  );
}
