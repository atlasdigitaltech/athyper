"use client";

/**
 * FlowSummaryPanel — sticky right-side panel showing running totals and key
 * derived fields during the intake wizard.
 *
 * Renders two sections:
 *   1. Amount waterfall — fields with summary_role in
 *      [subtotal, addition, deduction, total]
 *   2. Meta chips — fields with summary_role='meta' (currency, match_type,
 *      payment_term, fiscal_year, period_number)
 */

import React from "react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent } from "@athyper/ui/primitives";
import type { SummaryLine } from "./useFlowEngine";

const AMOUNT_ROLES = new Set(["subtotal", "addition", "deduction", "total"]);
const ROLE_INTENT: Record<string, string> = {
  total:    "text-foreground font-bold",
  subtotal: "text-foreground font-medium",
  addition: "text-success",
  deduction:"text-destructive",
};
const ROLE_PREFIX: Record<string, string> = {
  addition:  "+",
  deduction: "−",
};

function fmt(v: unknown): string {
  const n = Number(v);
  if (isNaN(n)) return String(v ?? "—");
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export interface FlowSummaryPanelProps {
  lines: SummaryLine[];
  currencyCode?: string;
  className?: string;
}

export function FlowSummaryPanel({
  lines,
  currencyCode = "",
  className,
}: FlowSummaryPanelProps) {
  const amountLines = lines.filter((l) => AMOUNT_ROLES.has(l.summary_role));
  const metaLines = lines.filter((l) => l.summary_role === "meta");

  const hasContent = amountLines.length > 0 || metaLines.length > 0;
  if (!hasContent) return null;

  return (
    <Card className={cn("sticky top-4 h-fit", className)}>
      <CardContent className="pt-5 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </h3>

        {/* Amount waterfall */}
        {amountLines.length > 0 && (
          <div className="space-y-2">
            {amountLines.map((line) => (
              <div
                key={line.field_name}
                className={cn(
                  "flex items-baseline justify-between gap-2",
                  line.summary_role === "total" && "border-t pt-2 mt-1",
                )}
              >
                <span className={cn(
                  "text-xs text-muted-foreground",
                  line.summary_role === "total" && "font-semibold text-foreground",
                )}>
                  {ROLE_PREFIX[line.summary_role] ?? ""}
                  {line.label}
                  {line.is_override && (
                    <span className="ml-1 text-2xs text-warning uppercase tracking-wider">
                      override
                    </span>
                  )}
                </span>
                <span className={cn(
                  "text-sm tabular-nums shrink-0",
                  // Only apply semantic colour when the amount is non-zero
                  Number(line.value) === 0
                    ? "text-muted-foreground/50"
                    : (ROLE_INTENT[line.summary_role] ?? "text-foreground"),
                )}>
                  {fmt(line.value)}
                  {currencyCode && (
                    <span className="ml-1 text-2xs text-muted-foreground font-mono">
                      {currencyCode}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Meta chips */}
        {metaLines.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {metaLines.map((line) => (
              <div
                key={line.field_name}
                className={cn(
                  "flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5",
                  line.is_override && "border-warning/40 bg-warning/5",
                )}
              >
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {line.label}
                </span>
                <span className="text-2xs font-medium text-foreground">
                  {line.displayValue ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
