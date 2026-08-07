import type { ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

/** Subset of SemanticIntent relevant to metric values. */
export type MetricTone = "neutral" | "success" | "warning" | "error";

export interface Metric {
  /** Stable unique key for React reconciliation. Falls back to label when omitted
   *  but MUST be provided when two metrics can share the same label. */
  id?: string;
  label: string;
  value: ReactNode;
  tone?: MetricTone;
}

export interface MetricStripProps {
  metrics: Metric[];
  className?: string;
}

const TONE_VALUE_CLASS: Record<MetricTone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  error:   "text-destructive",
};

export function MetricStrip({ metrics, className }: MetricStripProps) {
  return (
    <div className={cn("flex flex-wrap gap-px overflow-hidden rounded-lg border bg-border", className)}>
      {metrics.map((metric, index) => (
        <div
          key={metric.id ?? metric.label ?? index}
          className="flex min-w-[120px] flex-1 flex-col gap-0.5 bg-card px-4 py-3"
        >
          <span className="truncate text-xs text-muted-foreground">{metric.label}</span>
          <span className={cn("text-sm font-medium tabular-nums", TONE_VALUE_CLASS[metric.tone ?? "neutral"])}>
            {metric.value}
          </span>
        </div>
      ))}
    </div>
  );
}
