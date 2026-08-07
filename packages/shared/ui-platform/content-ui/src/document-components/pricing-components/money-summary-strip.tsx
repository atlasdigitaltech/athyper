"use client";

import { cn } from "@athyper/platform-theme/utils";

export interface MoneySummaryMetric {
  label: string;
  amount: number;
  currencyCode: string;
  emphasized?: boolean;
}

export interface MoneySummaryStripProps {
  metrics: MoneySummaryMetric[];
  className?: string;
  compact?: boolean;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function MoneySummaryStrip({ metrics, className, compact = false }: MoneySummaryStripProps) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1", className)}>
      {metrics.map((metric, index) => (
        <span key={`${metric.label}:${index}`} className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
          {index > 0 && <span aria-hidden className="mr-1 text-sm text-muted-foreground/40">·</span>}
          {!compact && (
            <span className={cn(
              "text-sm font-normal text-muted-foreground",
              metric.emphasized && "font-semibold text-foreground",
            )}>
              {metric.label}
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums text-foreground">{formatAmount(metric.amount)}</span>
          <span className="text-xs font-normal tracking-wide text-muted-foreground">{metric.currencyCode}</span>
        </span>
      ))}
    </div>
  );
}
