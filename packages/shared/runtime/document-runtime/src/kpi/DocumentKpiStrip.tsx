/**
 * @athyper/document-runtime — DocumentKpiStrip
 *
 * Reusable horizontal KPI data grid for document headers.
 *
 * Each cell: LABEL (small-caps) · optional BADGE (top-right) · VALUE · sub-value.
 * The "xl" flag renders the hero Total cell — large font + faded decimal.
 * The "mono" flag wraps reference codes in a muted pill.
 * Non-neutral "intent" cells receive a 2px left-border accent.
 * All tokens come from the CSS theme — no hardcoded palette values.
 */
"use client";

import React from "react";
import { cn } from "@athyper/theme/utils";

// ── Public types ───────────────────────────────────────────────────────────

export interface KpiStripCell {
  key: string;
  label: string;
  /** Primary display value */
  value: string;
  /** Currency code shown as a pill beside the xl value */
  currency?: string;
  /** Secondary line below the value */
  subValue?: string;
  /** Color intent applied to the primary value + left-border accent */
  intent?: "success" | "warning" | "error" | "info" | "neutral";
  /** Color intent applied to sub-value */
  subIntent?: "success" | "warning" | "error" | "info" | "neutral";
  /** Render value in a monospace pill — for reference codes, IDs */
  mono?: boolean;
  /** Hero display size — for Total / Amount cells */
  xl?: boolean;
  /** Optional small badge chip shown alongside the label, e.g. "+12.5%" */
  badge?: string;
  /** Color intent for the badge chip */
  badgeIntent?: "success" | "warning" | "error" | "info" | "neutral";
}

export interface DocumentKpiStripProps {
  cells: KpiStripCell[];
  className?: string;
}

// ── Intent maps — full class strings so Tailwind can scan them ─────────────

const INTENT_VALUE_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  error:   "text-destructive",
  info:    "text-info",
  neutral: "text-muted-foreground",
};

const INTENT_SUB_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  error:   "text-destructive",
  info:    "text-info",
  neutral: "text-muted-foreground",
};

// Left-border accent for intent cells — side-specific so it doesn't bleed
// into the right-border cell divider
const INTENT_LEFT_BORDER: Record<string, string> = {
  success: "border-l-2 border-l-success",
  warning: "border-l-2 border-l-warning",
  error:   "border-l-2 border-l-destructive",
  info:    "border-l-2 border-l-info",
};

// Badge chip background + text — matches StatusBadge palette
const INTENT_BADGE_CLS: Record<string, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error:   "bg-destructive/10 text-destructive border-destructive/20",
  info:    "bg-info/10 text-info border-info/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function splitDecimal(s: string): [string, string] {
  const i = s.lastIndexOf(".");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}

function getCurrencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency", currency: code,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value ?? code;
    return sym === code ? "" : sym;   // if Intl returns the code itself, suppress (show code in pill)
  } catch {
    return "";
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function DocumentKpiStrip({ cells, className }: DocumentKpiStripProps) {
  if (cells.length === 0) return null;

  return (
    <div
      className={cn(
        "border-t border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, minmax(130px, 1fr))` }}
    >
      {cells.map((cell, i) => {
        const hasIntent     = !!cell.intent && cell.intent !== "neutral";
        const leftBorderCls = hasIntent ? (INTENT_LEFT_BORDER[cell.intent!] ?? "") : "";

        return (
          <div
            key={cell.key}
            className={cn(
              "group relative min-w-0 px-3 py-2 transition-colors hover:bg-muted/20",
              hasIntent && "pl-[13px]",
              leftBorderCls,
              i < cells.length - 1 && "border-r border-border/50",
            )}
          >
            {/* ── Label row: label + optional badge chip ─────────────── */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground leading-none truncate">
                {cell.label}
              </span>

              {cell.badge && (
                <span className={cn(
                  "inline-flex items-center h-[17px] px-[6px] rounded-[4px] text-[9.5px] font-semibold border leading-none whitespace-nowrap shrink-0",
                  INTENT_BADGE_CLS[cell.badgeIntent ?? "neutral"],
                )}>
                  {cell.badge}
                </span>
              )}
            </div>

            {/* ── Value ─────────────────────────────────────────────── */}
            {cell.xl ? (
              /* Amount cell — amount-lg for value, supporting-sm for symbol/code */
              <div
                className="flex items-baseline gap-1 flex-wrap leading-tight"
                title={cell.value}
              >
                {cell.currency && getCurrencySymbol(cell.currency) && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {getCurrencySymbol(cell.currency)}
                  </span>
                )}
                <span className="text-[14px] font-bold tabular-nums text-foreground whitespace-nowrap">
                  {cell.value}
                </span>
                {cell.currency && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {cell.currency}
                  </span>
                )}
              </div>
            ) : cell.mono ? (
              /* Reference code — monospace pill, same font weight/size */
              <div
                className="inline-flex items-center max-w-full rounded-[6px] bg-muted border border-border/60 px-2 py-[5px] font-mono text-[14px] font-semibold text-foreground leading-none"
                title={cell.value}
              >
                <span className="truncate">{cell.value}</span>
              </div>
            ) : (
              /* Standard value */
              <div
                className={cn(
                  "text-[14px] font-semibold leading-tight tabular-nums truncate",
                  cell.intent ? INTENT_VALUE_TEXT[cell.intent] : "text-foreground",
                )}
                title={cell.value}
              >
                {cell.value}
              </div>
            )}

            {/* ── Sub-value ──────────────────────────────────────────── */}
            {cell.subValue && (
              <div className={cn(
                "text-[11px] mt-1 leading-snug truncate",
                cell.subIntent ? INTENT_SUB_TEXT[cell.subIntent] : "text-muted-foreground",
              )}>
                {cell.subValue}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
