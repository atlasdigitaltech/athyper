"use client";

/**
 * FlowSummaryPanel - sticky right-side panel showing running totals and key
 * derived fields during the intake wizard.
 */

import { cn } from "@athyper/theme/utils";
import { Card, CardContent } from "@athyper/ui/primitives";
import { fmtMoney, fmtMoneyNumber } from "@athyper/runtime-shared/core";
import type { SummaryBalance, SummaryLine } from "./useFlowEngine";

const AMOUNT_ROLES = new Set(["subtotal", "addition", "deduction", "total"]);
const ROLE_INTENT: Record<string, string> = {
  total:     "text-foreground font-bold",
  subtotal:  "text-foreground font-medium",
  addition:  "text-success",
  deduction: "text-destructive",
};
const ROLE_PREFIX: Record<string, string> = {
  addition:  "+",
  deduction: "-",
};

function fmtNumber(v: unknown, minorUnits = 2): string {
  return fmtMoneyNumber(v, { minorUnits }) ?? String(v ?? "--");
}

function fmtSummaryAmount(line: SummaryLine, fallbackCurrencyCode: string): string {
  const currencyCode = line.currency_code ?? fallbackCurrencyCode;
  return fmtMoney(line.value, {
    currencyCode,
    currencyCodePosition: line.currency_code_position ?? "prefix",
    minorUnits: line.minor_units,
    fallbackMinorUnits: line.fallback_minor_units ?? 2,
  }) ?? fmtNumber(line.value, line.fallback_minor_units ?? 2);
}

export interface FlowSummaryPanelProps {
  lines: SummaryLine[];
  balance?: SummaryBalance | null;
  currencyCode?: string;
  className?: string;
}

export function FlowSummaryPanel({
  lines,
  balance,
  currencyCode = "",
  className,
}: FlowSummaryPanelProps) {
  const amountLines = lines.filter((l) => AMOUNT_ROLES.has(l.summary_role));
  const metaLines = lines.filter((l) => l.summary_role === "meta");

  const hasContent = amountLines.length > 0 || metaLines.length > 0 || Boolean(balance);
  if (!hasContent) return null;

  return (
    <Card className={cn("sticky top-4 h-fit", className)}>
      <CardContent className="pt-5 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </h3>

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
                  Number(line.value) === 0
                    ? "text-muted-foreground/50"
                    : (ROLE_INTENT[line.summary_role] ?? "text-foreground"),
                )}>
                  {fmtSummaryAmount(line, currencyCode)}
                </span>
              </div>
            ))}
          </div>
        )}

        {balance && (
          <div className="flex items-baseline justify-between gap-2 border-t pt-2">
            <span className="text-xs font-semibold text-foreground">
              {balance.label}
            </span>
            <span className={cn(
              "text-sm tabular-nums font-semibold shrink-0",
              balance.status === "balanced" && "text-success",
              balance.status === "imbalanced" && "text-destructive",
              balance.status === "none" && "text-muted-foreground",
            )}>
              {balance.status === "none"
                ? "No lines"
                : balance.status === "balanced"
                  ? "Balanced"
                  : `Imbalance: ${fmtMoney(balance.difference, { currencyCode, currencyCodePosition: "prefix" }) ?? fmtNumber(balance.difference)}`}
            </span>
          </div>
        )}

        {metaLines.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {metaLines.map((line) => (
              <div
                key={line.field_name}
                className={cn(
                  "flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5",
                  line.is_override && "border-warning/40 bg-warning/5",
                  line.is_missing && "border-warning/40 bg-warning/5",
                )}
              >
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {line.label}
                </span>
                <span className={cn(
                  "text-2xs font-medium",
                  line.is_missing ? "text-warning" : "text-foreground",
                )}>
                  {line.displayValue ?? "--"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
