/**
 * @athyper/document-runtime — Amount Summary Card
 *
 * Spec v1.2 §C.1: Renders an amount breakdown grid showing the waterfall
 * from subtotal through deductions to outstanding amount.
 *
 * Each tile: label + ISO currency prefix + emphasized numeric amount.
 * Total rows get bold styling. Indented rows shift right.
 */
"use client";

import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { Card, CardContent } from "@athyper/ui/primitives";
import { type AmountBreakdownLine } from "@athyper/api-contracts/documents";
import { fmtMoneyNumber, normaliseCurrencyCode } from "@athyper/runtime-shared/core";
import type { AmountDelta } from "./useAmountDelta";

export interface AmountSummaryCardProps {
  lines: AmountBreakdownLine[];
  title?: string;
  className?: string;
  /**
   * Phase 10 #4: optional pending-edit deltas keyed by `line.label`.
   * When present, each matching line gets a subtle subtext showing the
   * preview delta (e.g. "+200.00 pending"). Saved value stays prominent.
   */
  pendingDeltas?: Record<string, AmountDelta>;
}

function formatSignedAmount(delta: number, currencyCode: string): string {
  const formatted = fmtMoneyNumber(Math.abs(delta), { currencyCode }) ?? "--";
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${formatted}`;
}

function describeDeltaSources(sources: AmountDelta["sources"]): string {
  const parts: string[] = [];
  if (sources.creates) parts.push(`${sources.creates} new line${sources.creates > 1 ? "s" : ""}`);
  if (sources.updates) parts.push(`${sources.updates} update${sources.updates > 1 ? "s" : ""}`);
  if (sources.deletes) parts.push(`${sources.deletes} deletion${sources.deletes > 1 ? "s" : ""}`);
  return parts.length > 0 ? `From ${parts.join(", ")}` : "From pending changes";
}

const INDENT_CLASS = ["", "pl-4", "pl-8"] as const;

function formatAmount(amount: unknown, currencyCode: string): string {
  return fmtMoneyNumber(amount, { currencyCode }) ?? "--";
}

export function AmountSummaryCard({
  lines,
  title = "Amount Summary",
  className,
  pendingDeltas,
}: AmountSummaryCardProps) {
  if (lines.length === 0) return null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-0">
        <div className="border-b border-border/60 px-4 py-3 sm:px-5 lg:px-[22px]">
          <h3 className="text-xs font-mediumr text-muted-foreground">
            {title}
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-px bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
          {lines.map((line) => {
            const intentColors = line.intent
              ? resolveSemanticColors(line.intent as SemanticIntent)
              : null;

            const currencyCode = normaliseCurrencyCode(line.currency_code) ?? line.currency_code;
            const isBold = line.is_total;
            const delta = pendingDeltas?.[line.label];
            const hasDelta = delta && delta.delta !== 0;

            return (
              <div
                key={line.label}
                className={cn(
                  "flex min-w-0 flex-col gap-1.5 bg-card px-4 py-3.5 sm:px-5 lg:px-[22px]",
                  INDENT_CLASS[line.indent] ?? "",
                )}
              >
                <div className={cn(
                  "text-xs font-mediumr text-muted-foreground",
                  intentColors?.text,
                )}>
                  {line.label}
                </div>
                <div className="flex min-w-0 items-baseline gap-2">
                  {currencyCode && (
                    <span className={cn(
                      "shrink-0 text-base leading-none tabular-nums text-foreground",
                      isBold ? "font-medium" : "font-medium",
                    )}>
                      {currencyCode}
                    </span>
                  )}
                  <span className={cn(
                    "min-w-0 truncate text-base leading-none tabular-nums text-foreground",
                    isBold ? "font-medium" : "font-medium",
                  )}>
                    {formatAmount(line.amount, currencyCode)}
                  </span>
                </div>
                {/* Phase 10 #4: pending preview delta. Subtle subtext beneath
                    the saved amount — does NOT replace the value (server is
                    still authoritative). Tooltip credits the source counts.
                    Approximation hint is appended for `full` mode (not yet
                    implemented; future-proofed here). */}
                {hasDelta && (
                  <div
                    data-pending-delta-sign={delta!.delta >= 0 ? "positive" : "negative"}
                    className={cn(
                      "text-xs italic tabular-nums text-muted-foreground/80",
                    )}
                    title={[
                      describeDeltaSources(delta!.sources),
                      delta!.approximate ? "Approximate — actual value will be computed on Save" : null,
                    ].filter(Boolean).join(" · ")}
                  >
                    {formatSignedAmount(delta!.delta, currencyCode)} pending
                    {delta!.approximate && " (≈)"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
