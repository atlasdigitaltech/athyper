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

export interface AmountSummaryCardProps {
  lines: AmountBreakdownLine[];
  title?: string;
  className?: string;
}

const INDENT_CLASS = ["", "pl-4", "pl-8"] as const;

function formatAmount(amount: unknown, currencyCode: string): string {
  return fmtMoneyNumber(amount, { currencyCode }) ?? "--";
}

export function AmountSummaryCard({
  lines,
  title = "Amount Summary",
  className,
}: AmountSummaryCardProps) {
  if (lines.length === 0) return null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-0">
        <div className="border-b border-border/60 px-4 py-3 sm:px-5 lg:px-[22px]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

            return (
              <div
                key={line.label}
                className={cn(
                  "flex min-w-0 flex-col gap-1.5 bg-card px-4 py-3.5 sm:px-5 lg:px-[22px]",
                  INDENT_CLASS[line.indent] ?? "",
                )}
              >
                <div className={cn(
                  "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  intentColors?.text,
                )}>
                  {line.label}
                </div>
                <div className="flex min-w-0 items-baseline gap-2">
                  {currencyCode && (
                    <span className={cn(
                      "shrink-0 text-base leading-none tabular-nums text-foreground",
                      isBold ? "font-bold" : "font-semibold",
                    )}>
                      {currencyCode}
                    </span>
                  )}
                  <span className={cn(
                    "min-w-0 truncate text-base leading-none tabular-nums text-foreground",
                    isBold ? "font-bold" : "font-semibold",
                  )}>
                    {formatAmount(line.amount, currencyCode)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
