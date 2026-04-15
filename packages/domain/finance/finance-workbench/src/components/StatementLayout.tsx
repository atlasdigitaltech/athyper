"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "./format";
import { PeriodStatusBar } from "./PeriodStatusBar";
import type { FiscalPeriodStatus } from "../lib/period";

interface StatementLayoutProps {
  title: string;
  companyCode?: string;
  fiscalYear: number;
  period: number | null;
  periodStatus: FiscalPeriodStatus | null;
  currentLabel?: string;
  priorLabel?: string;
  showComparative?: boolean;
  isLive?: boolean;       // false when reading from snapshot
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function StatementLayout({
  title,
  companyCode,
  fiscalYear,
  period,
  periodStatus,
  currentLabel,
  priorLabel,
  showComparative = false,
  isLive = true,
  children,
  footer,
}: StatementLayoutProps) {
  return (
    <div className="flex flex-col gap-0 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-0 py-1.5 border-b mb-0">
        <span className="text-xs font-semibold">{title}</span>
        <PeriodStatusBar
          fiscalYear={fiscalYear}
          period={period}
          status={periodStatus}
          companyCode={companyCode}
        />
        {isLive && (
          <span className="text-[9px] font-medium px-1.5 py-0 rounded border bg-info/10 text-info border-info/30">
            Live
          </span>
        )}
        <div className="flex-1" />
        {showComparative && (
          <div className="flex items-center gap-6 pr-2">
            <span className="text-[10px] font-medium text-muted-foreground w-24 text-right">
              {currentLabel ?? "Current"}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground w-24 text-right">
              {priorLabel ?? "Prior year"}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground w-20 text-right">
              Variance
            </span>
          </div>
        )}
        {!showComparative && (
          <div className="pr-2">
            <span className="text-[10px] font-medium text-muted-foreground w-28 text-right block">
              {currentLabel ?? "Balance"}
            </span>
          </div>
        )}
      </div>

      {/* Content sections */}
      <div className="flex flex-col gap-0">
        {children}
      </div>

      {/* Footer total */}
      {footer && (
        <div className="border-t mt-1 pt-1">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Total row shown in statement footer or at bottom of a section. */
export function StatementTotal({
  label,
  current,
  prior,
  showComparative = false,
  bold = true,
  borderTop = false,
}: {
  label: string;
  current: number;
  prior?: number;
  showComparative?: boolean;
  bold?: boolean;
  borderTop?: boolean;
}) {
  const variance = showComparative && prior !== undefined ? current - prior : null;

  return (
    <div
      className={cn(
        "flex items-center py-1 px-2 bg-muted/30",
        borderTop && "border-t",
        bold && "font-semibold",
      )}
    >
      <span className="flex-1 text-xs">{label}</span>
      <div className="flex items-center gap-6 pr-0">
        <span className="font-mono text-xs w-28 text-right">{fmtCompact(current)}</span>
        {showComparative && (
          <>
            <span className="font-mono text-xs w-28 text-right text-muted-foreground">
              {prior !== undefined ? fmtCompact(prior) : "—"}
            </span>
            <span
              className={cn(
                "font-mono text-xs w-20 text-right",
                variance !== null && variance > 0
                  ? "text-success"
                  : variance !== null && variance < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {variance !== null ? fmtCompact(variance) : "—"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
