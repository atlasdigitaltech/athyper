"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LineItemFooterAmountStrip
//
// Inline, label+value strip rendered in the LineItemSheet drawer footer.
// Shows the line's running money breakdown (e.g. Net · Discount · Tax · Gross)
// using LineItemAmountConfig.summaryFields. Values come from the live `draft`
// with `line` as the saved fallback, so the bar updates as the user edits.
//
// Driven entirely by metadata — entity owns display_config.line_summary_strip
// and per-field ui_hint.line_summary; the strip itself owns no field knowledge.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { cn } from "@athyper/theme/utils";
import { fmtMoneyNumber, normaliseCurrencyCode } from "@athyper/runtime-shared/core";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { LineAmountSummaryField, LineItemAmountConfig, LineRecord } from "../types";
import { recordValue } from "../meta";

export interface LineItemFooterAmountStripStatus {
  label:  string;
  intent: "info" | "warning" | "error" | "success";
}

export interface LineItemFooterAmountStripProps {
  amountConfig:  LineItemAmountConfig;
  entity:        CompiledEntity | null;
  draft:         Record<string, unknown>;
  line?:         LineRecord | null;
  /** Document-level currency fallback when neither field nor entity declares one. */
  currencyCode?: string;
  /** Optional trailing status chip (e.g. unallocated, unbalanced). */
  status?:       LineItemFooterAmountStripStatus | null;
  /** Drawer width — passed by parent for responsive collapse. */
  compact?:      boolean;
}

const STATUS_TONE: Record<LineItemFooterAmountStripStatus["intent"], string> = {
  info:    "bg-muted/60 text-muted-foreground",
  warning: "bg-amber-100/70 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  error:   "bg-destructive/10 text-destructive",
  success: "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
};

function readNumeric(
  field: LineAmountSummaryField,
  draft: Record<string, unknown>,
  line:  LineRecord | null | undefined,
): number {
  const draftValue = draft[field.name];
  const fallback   = line ? recordValue(line, field.name) : undefined;
  const raw        = draftValue !== undefined ? draftValue : fallback;
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function resolveFieldCurrency(
  fieldName:    string,
  entity:       CompiledEntity | null,
  draft:        Record<string, unknown>,
  line:         LineRecord | null | undefined,
  fallback?:    string,
): string | undefined {
  const fieldDef = entity?.fields.find((f) => f.name === fieldName);
  const moneyCfg = fieldDef?.money_config as Record<string, unknown> | null | undefined;

  if (moneyCfg) {
    if (moneyCfg["currency_source"] === "constant") {
      const code = normaliseCurrencyCode(moneyCfg["currency_code"] ?? moneyCfg["constant_currency"]);
      if (code) return code;
    }
    const ref = moneyCfg["currency_field"];
    if (typeof ref === "string" && ref) {
      const v = draft[ref] ?? (line ? recordValue(line, ref) : undefined);
      const code = normaliseCurrencyCode(v);
      if (code) return code;
    }
  }
  return normaliseCurrencyCode(fallback) ?? fallback;
}

function Slot({
  label,
  value,
  currency,
  bold,
  compact,
}: {
  label:    string;
  value:    number;
  currency: string | undefined;
  bold:     boolean;
  compact:  boolean;
}): ReactNode {
  const formatted = fmtMoneyNumber(Math.abs(value), { currencyCode: currency }) ?? "0.00";

  return (
    <span
      className={cn(
        "flex shrink-0 items-baseline gap-1.5 whitespace-nowrap leading-none",
        bold && "pl-1",
      )}
      title={compact ? `${label}: ${formatted}${currency ? ` ${currency}` : ""}` : undefined}
    >
      {!compact && (
        <span className={cn(
          "text-sm font-normal text-muted-foreground",
          bold && "font-semibold text-foreground",
        )}>
          {label}
        </span>
      )}
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatted}
      </span>
      {currency && (
        <span className={cn(
          "text-xs font-normal uppercase tracking-wide text-muted-foreground",
          bold && "text-foreground/80",
        )}>
          {currency}
        </span>
      )}
    </span>
  );
}

export function LineItemFooterAmountStrip({
  amountConfig,
  entity,
  draft,
  line,
  currencyCode,
  status,
  compact = false,
}: LineItemFooterAmountStripProps) {
  if (!amountConfig.summaryFields.length) return null;

  const visibleFields = amountConfig.summaryFields.filter((field) =>
    entity ? entity.fields.some((f) => f.name === field.name) : true,
  );
  if (visibleFields.length === 0) return null;

  const headerCurrency = normaliseCurrencyCode(currencyCode) ?? currencyCode;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      {visibleFields.map((field, idx) => {
        const value    = readNumeric(field, draft, line);
        const currency = resolveFieldCurrency(field.name, entity, draft, line, headerCurrency);
        const showSep  = idx > 0;

        return (
          <span key={field.name} className="flex shrink-0 items-baseline gap-2.5">
            {showSep && (
              <span aria-hidden className="text-muted-foreground/40">·</span>
            )}
            <Slot
              label={field.label}
              value={value}
              currency={currency}
              bold={!!field.bold}
              compact={compact}
            />
          </span>
        );
      })}

      {status && (
        <span
          className={cn(
            "ml-1 inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wide",
            STATUS_TONE[status.intent],
          )}
        >
          {status.label}
        </span>
      )}
    </div>
  );
}
