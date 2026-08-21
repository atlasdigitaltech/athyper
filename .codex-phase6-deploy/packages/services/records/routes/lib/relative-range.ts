/**
 * Server-side @<token> filter sigil expansion.
 *
 * `?filter.posting_date=@this_month` arrives here as the string "this_month"
 * (the @ prefix is stripped by parseServerFilterSigil). We delegate the actual
 * math to @athyper/finance-rules::resolveDateRangePreset so the client and
 * server agree on every calendar edge case (fiscal quarters, DST, week-start).
 *
 * The `ctx` parameter is per-request fiscal context resolved by
 * @athyper/svc-shared::resolveActiveFiscalContext. When present, it carries
 * (today, weekStart, fiscalYearStartMonth) derived from the caller's active
 * company code — so a KSA-scoped `@this_week` request returns Saturday-Friday
 * and an India-scoped `@this_fiscal_year` returns April–March. Callers that
 * don't supply context (or requests without an active scope) fall back to
 * UTC / Monday / calendar-year — same as before this pipeline landed.
 */

import { resolveDateRangePreset, type DateRangePresetKey } from "@athyper/finance-rules";
import { todayInZone } from "@athyper/temporal";

// Legacy token → new preset-key mapping. Empty today because the finance-rules
// preset keys mirror the legacy sigils 1:1. Any future rename lives here so
// wire compat is preserved.
export const LEGACY_TOKEN_ALIASES: Partial<Record<string, DateRangePresetKey>> = {};

// `this_period` / `last_period` need a live period-status lookup — the pure
// resolver throws for them so callers dispatch to the period service instead.
// This layer returns null so the filter falls through to non-range operators.
export const NON_CALENDAR_KEYS: ReadonlySet<string> = new Set(["this_period", "last_period"]);

export interface RelativeRangeContext {
  /** Business-date anchor. Defaults to today in UTC. */
  today?: string;
  /** 0=Sun, 1=Mon, 6=Sat. Defaults to Monday-start (matches legacy). */
  weekStart?: 0 | 1 | 6;
  /** Fiscal year start month, 1-12. Defaults to calendar year (matches legacy). */
  fiscalYearStartMonth?: number;
}

export function resolveRelativeRange(
  token: string,
  ctx: RelativeRangeContext = {},
): { from: string; to: string } | null {
  if (NON_CALENDAR_KEYS.has(token)) return null;
  const mappedKey = (LEGACY_TOKEN_ALIASES[token] ?? token) as DateRangePresetKey;
  try {
    return resolveDateRangePreset(mappedKey, {
      today: ctx.today ?? todayInZone("UTC"),
      weekStart: ctx.weekStart ?? 1,
      fiscalYearStartMonth: ctx.fiscalYearStartMonth ?? 1,
    });
  } catch {
    return null;
  }
}
