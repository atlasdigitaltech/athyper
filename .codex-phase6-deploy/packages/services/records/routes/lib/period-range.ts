/**
 * resolvePeriodRange — async period-aware sigil expansion.
 *
 * @this_period / @last_period cannot be resolved by pure calendar math because
 * "period" means whatever `master.fiscal_period` says it means for the caller's
 * active company code (12 monthly, 4 quarterly, weekly-13, or a bespoke pack).
 * This helper does the async lookup that the pure resolver in
 * @athyper/finance-rules::resolveDateRangePreset explicitly refuses to guess.
 *
 * Excludes adjustment periods (period_type <> 'normal') so filter UX matches
 * the operator's mental model of accounting periods, not close-out buckets.
 *
 * Per-request cache: same `req` + same `(companyCodeId, today, key)` triple
 * → one SELECT, no matter how many filters need it. Stored on a WeakMap so
 * it GCs with the request. No process-wide cache — period tables change with
 * period close events and staleness would be a real footgun.
 */

import type { Request } from "express";
import { sql, type Kysely } from "kysely";

export type PeriodSigilKey = "this_period" | "last_period";

export interface PeriodRangeDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  tenantId: string;
  companyCodeId: string;
  /** Business-date anchor (today in the company's timezone). "YYYY-MM-DD". */
  today: string;
  logger?: { warn(event: string, fields?: Record<string, unknown>): void };
}

// Per-request cache: WeakMap<Request, Map<cacheKey, Promise<Range | null>>>
const REQUEST_CACHE = new WeakMap<Request, Map<string, Promise<{ from: string; to: string } | null>>>();

/** Test hook — invalidate all cached lookups (test-only). */
export function _resetPeriodRangeCache(): void {
  // WeakMaps aren't iterable; the tests instantiate fresh Requests instead.
  // Keeping this export for symmetry with fiscal-context and future needs.
}

export async function resolvePeriodRange(
  req: Request,
  key: PeriodSigilKey,
  deps: PeriodRangeDeps,
): Promise<{ from: string; to: string } | null> {
  const cacheKey = `${deps.companyCodeId}:${deps.today}:${key}`;
  let bucket = REQUEST_CACHE.get(req);
  if (!bucket) {
    bucket = new Map();
    REQUEST_CACHE.set(req, bucket);
  }
  const hit = bucket.get(cacheKey);
  if (hit) return hit;

  const promise = resolveInner(key, deps);
  bucket.set(cacheKey, promise);
  return promise;
}

async function resolveInner(
  key: PeriodSigilKey,
  deps: PeriodRangeDeps,
): Promise<{ from: string; to: string } | null> {
  try {
    const currentRow = await selectCurrentPeriod(deps);
    if (!currentRow) return null;

    if (key === "this_period") {
      return { from: currentRow.start_date, to: currentRow.end_date };
    }

    // last_period: the row immediately before (fiscalYear, periodNumber).
    // Wrap: if current is (FY, 1), the previous is (FY-1, max period of FY-1).
    const prevRow = await selectPreviousPeriod(deps, currentRow.fiscal_year, currentRow.period_number);
    if (!prevRow) return null;
    return { from: prevRow.start_date, to: prevRow.end_date };
  } catch (err) {
    deps.logger?.warn("period_range.lookup_failed", { key, error: String(err) });
    return null;
  }
}

// ─── SQL ────────────────────────────────────────────────────────────────────

interface PeriodRow {
  fiscal_year: number;
  period_number: number;
  start_date: string;
  end_date: string;
}

async function selectCurrentPeriod(deps: PeriodRangeDeps): Promise<PeriodRow | null> {
  const result = await sql<PeriodRow>`
    SELECT fiscal_year, period_number, start_date::text AS start_date, end_date::text AS end_date
      FROM master.fiscal_period
     WHERE tenant_id       = ${deps.tenantId}
       AND company_code_id = ${deps.companyCodeId}
       AND period_type     = 'normal'
       AND start_date <= ${deps.today}::date
       AND end_date   >= ${deps.today}::date
     ORDER BY fiscal_year DESC, period_number DESC
     LIMIT 1
  `.execute(deps.db);
  return result.rows[0] ?? null;
}

async function selectPreviousPeriod(
  deps: PeriodRangeDeps,
  fiscalYear: number,
  periodNumber: number,
): Promise<PeriodRow | null> {
  // "Previous" = the largest (fiscal_year, period_number) tuple strictly less
  // than the current one. SQL lexicographic ordering does this natively via
  // the ROW comparison operator.
  const result = await sql<PeriodRow>`
    SELECT fiscal_year, period_number, start_date::text AS start_date, end_date::text AS end_date
      FROM master.fiscal_period
     WHERE tenant_id       = ${deps.tenantId}
       AND company_code_id = ${deps.companyCodeId}
       AND period_type     = 'normal'
       AND (fiscal_year, period_number) < (${fiscalYear}::smallint, ${periodNumber}::smallint)
     ORDER BY fiscal_year DESC, period_number DESC
     LIMIT 1
  `.execute(deps.db);
  return result.rows[0] ?? null;
}
