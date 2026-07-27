/**
 * resolveActiveFiscalContext — per-request fiscal-context helper.
 *
 * Resolves the caller's active company code and returns the fiscal profile
 * (timezone, week-start, fiscal-year start month, today anchor) needed by
 * downstream helpers like `resolveRelativeRange` and any future fiscal
 * date-math on the server. Returns calendar defaults on any failure — never
 * throws — so a missing header or a deleted row can't 500 a list request.
 *
 * Resolution order:
 *   1. `X-Company-Code-ID` request header (set by the BFF from V4Session).
 *   2. `master.principal_ui_profile.default_company_code_id` for the caller.
 *   3. Calendar defaults (UTC / Mon-start / calendar-year).
 *
 * Caching:
 *   • Per-request memo via a WeakMap keyed on the express request object —
 *     multiple filter tokens in the same list request share one lookup.
 *   • Process-wide LRU keyed on `(tenantId, companyCodeId)` with a 30s TTL —
 *     back-to-back requests from the same session hit warm cache.
 *
 * Tenant-scoped: the LRU key always includes tenantId so multi-tenant
 * deployments cannot leak profile data across tenants.
 */

import type { Request } from "express";
import { sql, type Kysely } from "kysely";
import { todayInZone } from "@athyper/temporal";

// ─── Public contract ────────────────────────────────────────────────────────

export interface ActiveFiscalContext {
  /** Business-date anchor — today in the resolved timezone. UTC when no context. */
  today: string;                  // "YYYY-MM-DD"
  /** 0=Sun, 1=Mon, 6=Sat. Defaults to Mon (matches legacy sigil behaviour). */
  weekStart: 0 | 1 | 6;
  /** 1-12. Defaults to 1 (calendar year). */
  fiscalYearStartMonth: number;
  /** IANA timezone name; UTC when no context. */
  timeZone: string;
  /** null when no company code is in scope for this request. */
  companyCodeId: string | null;
  /** Default book for period resolution. Populated in Phase 7b consumers. */
  defaultBookId: string | null;
  /** Provenance for logging / debug — "header", "session_default", or "calendar_default". */
  source: "header" | "session_default" | "calendar_default";
}

export interface FiscalContextDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  tenantId: string;
  /** Caller's principal UUID — used for the session-default fallback lookup. */
  principalId?: string | null;
  /** Optional logger for cache-miss / fallback warnings. */
  logger?: { warn(event: string, fields?: Record<string, unknown>): void };
}

export const CALENDAR_DEFAULT_CONTEXT: Readonly<ActiveFiscalContext> = Object.freeze({
  today: todayInZone("UTC"),
  weekStart: 1,
  fiscalYearStartMonth: 1,
  timeZone: "UTC",
  companyCodeId: null,
  defaultBookId: null,
  source: "calendar_default",
});

// ─── Two-tier cache ─────────────────────────────────────────────────────────

// Per-request memo — keyed on the express Request object itself. GC'd when
// the request handler returns and the object becomes unreachable.
const REQUEST_MEMO = new WeakMap<Request, Promise<ActiveFiscalContext>>();

// Process-wide LRU. Small size + short TTL because company profiles change
// rarely and we don't want to blow the heap on tenants with many companies.
interface LruEntry {
  ctx: ActiveFiscalContext;
  expiresAt: number;
}
const LRU_MAX = 512;
const LRU_TTL_MS = 30_000;
const LRU = new Map<string, LruEntry>();

/** Test hook — invalidate all cached contexts. Not called from production code. */
export function _resetFiscalContextCache(): void {
  LRU.clear();
}

// ─── Resolver ───────────────────────────────────────────────────────────────

export async function resolveActiveFiscalContext(
  req: Request,
  deps: FiscalContextDeps,
): Promise<ActiveFiscalContext> {
  const memoed = REQUEST_MEMO.get(req);
  if (memoed) return memoed;
  const promise = resolveInner(req, deps);
  REQUEST_MEMO.set(req, promise);
  return promise;
}

async function resolveInner(req: Request, deps: FiscalContextDeps): Promise<ActiveFiscalContext> {
  const explicit = readHeaderCompanyCodeId(req);
  if (explicit) {
    const ctx = await loadFromCompanyCode(deps, explicit, "header");
    if (ctx) return ctx;
    deps.logger?.warn("fiscal_context.header_lookup_failed", { companyCodeId: explicit });
  }

  if (deps.principalId) {
    const fallbackId = await loadDefaultCompanyCodeId(deps, deps.principalId);
    if (fallbackId) {
      const ctx = await loadFromCompanyCode(deps, fallbackId, "session_default");
      if (ctx) return ctx;
      deps.logger?.warn("fiscal_context.default_lookup_failed", { companyCodeId: fallbackId });
    }
  }

  return CALENDAR_DEFAULT_CONTEXT;
}

function readHeaderCompanyCodeId(req: Request): string | null {
  const raw = req.headers["x-company-code-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadDefaultCompanyCodeId(deps: FiscalContextDeps, principalId: string): Promise<string | null> {
  try {
    const row = await deps.db
      .selectFrom("master.principal_ui_profile as p")
      .select("p.default_company_code_id")
      .where("p.tenant_id", "=", deps.tenantId)
      .where("p.principal_id", "=", principalId)
      .executeTakeFirst();
    if (!row?.default_company_code_id) return null;
    return String(row.default_company_code_id);
  } catch (err) {
    deps.logger?.warn("fiscal_context.default_lookup_error", { error: String(err) });
    return null;
  }
}

async function loadFromCompanyCode(
  deps: FiscalContextDeps,
  companyCodeId: string,
  source: "header" | "session_default",
): Promise<ActiveFiscalContext | null> {
  const cacheKey = `${deps.tenantId}:${companyCodeId}`;
  const now = Date.now();
  const cached = LRU.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    // Refresh "today" in the cached zone — the profile is stable, but the
    // anchor is not. Cheaper than re-selecting the whole row.
    return { ...cached.ctx, today: todayInZone(cached.ctx.timeZone), source };
  }

  const row = await selectCompanyProfile(deps.db, deps.tenantId, companyCodeId);
  if (!row) return null;

  const ctx: ActiveFiscalContext = {
    today: todayInZone(row.timezone_code ?? "UTC"),
    weekStart: normaliseWeekStart(row.week_start),
    fiscalYearStartMonth: normaliseFyStart(row.fiscal_year_start_month),
    timeZone: row.timezone_code ?? "UTC",
    companyCodeId,
    defaultBookId: row.default_ledger_book_id ?? null,
    source,
  };

  evictLruIfFull();
  LRU.set(cacheKey, { ctx, expiresAt: now + LRU_TTL_MS });
  return ctx;
}

async function selectCompanyProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyCodeId: string,
): Promise<{
  timezone_code: string | null;
  week_start: number | null;
  fiscal_year_start_month: number;
  default_ledger_book_id: string | null;
} | null> {
  const result = await sql<{
    timezone_code: string | null;
    week_start: number | null;
    fiscal_year_start_month: number;
    default_ledger_book_id: string | null;
  }>`
    SELECT timezone_code,
           week_start,
           fiscal_year_start_month,
           default_ledger_book_id
      FROM master.company_code
     WHERE tenant_id = ${tenantId}
       AND id        = ${companyCodeId}
     LIMIT 1
  `.execute(db);
  return result.rows[0] ?? null;
}

function normaliseWeekStart(v: number | null | undefined): 0 | 1 | 6 {
  if (v === 0 || v === 1 || v === 6) return v;
  return 1;
}

function normaliseFyStart(v: number | null | undefined): number {
  if (typeof v !== "number") return 1;
  const rounded = Math.round(v);
  if (rounded < 1 || rounded > 12) return 1;
  return rounded;
}

function evictLruIfFull(): void {
  if (LRU.size < LRU_MAX) return;
  // Map iteration order is insertion order — drop the oldest entry.
  const oldestKey = LRU.keys().next().value;
  if (oldestKey !== undefined) LRU.delete(oldestKey);
}
