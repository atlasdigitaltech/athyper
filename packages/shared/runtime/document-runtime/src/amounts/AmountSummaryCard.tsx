/**
 * @athyper/document-runtime — Amount Summary Card
 *
 * Spec v1.2 §C.1: Renders an amount breakdown grid showing the waterfall
 * from subtotal through deductions to outstanding amount.
 *
 * Each row: label (left-aligned) + formatted currency amount (right-aligned).
 * Total rows get a top border and bold styling. Indented rows shift right.
 */
"use client";

import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { Card, CardContent } from "@athyper/ui/primitives";
import { type AmountBreakdownLine } from "@athyper/api-contracts/documents";

export interface AmountSummaryCardProps {
  lines: AmountBreakdownLine[];
  title?: string;
  className?: string;
}

function formatAmount(amount: number, currencyCode: string): string {
  return `${currencyCode} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

const INDENT_CLASS = ["", "pl-4", "pl-8"] as const;

export function AmountSummaryCard({
  lines,
  title = "Amount Summary",
  className,
}: AmountSummaryCardProps) {
  if (lines.length === 0) return null;

  return (
    <Card className={className}>
      <CardContent className="pt-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
          {lines.map((line) => {
            const intentColors = line.intent
              ? resolveSemanticColors(line.intent as SemanticIntent)
              : null;

            return (
              <div
                key={line.label}
                className={cn(INDENT_CLASS[line.indent] ?? "")}
              >
                <div className="text-xs text-muted-foreground">{line.label}</div>
                <div
                  className={cn(
                    line.is_total ? "font-bold" : "font-medium",
                    intentColors?.text,
                  )}
                >
                  {formatAmount(line.amount, line.currency_code)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
