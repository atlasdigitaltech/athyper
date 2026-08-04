/**
 * Finance Routes — read-model endpoints for the GL Workbench
 *
 * GET  /api/finance/accounts/search            — GL account search (code/name ILIKE, node_type filter)
 * GET  /api/finance/tax-groups/search          — tax group chooser (code/name/type filtered)
 * GET  /api/finance/master/companies           — list companies for scope selector
 * GET  /api/finance/master/entities            — list legal entities for scope selector
 * GET  /api/finance/period-status              — fiscal + book period status for a scope
 * GET  /api/finance/trial-balance              — trial balance (from ledger.gl_balance)
 * GET  /api/finance/gl-detail                  — GL ledger card (from document.journal_line)
 * GET  /api/finance/statements/balance-sheet   — balance sheet (from ledger.gl_balance)
 * GET  /api/finance/statements/profit-loss     — profit & loss (from ledger.gl_balance)
 *
 * NOTE: Trial balance and financial statements read from ledger.gl_balance —
 * the pre-aggregated, PostingService-maintained balance store. When a period is
 * hard_closed, gl_balance already holds the immutable final figures; no need to
 * sum raw journal_line rows. Only gl-detail (ledger card) reads journal_line.
 */

import type { RequestHandler, Router } from "express";
import { sql, type Kysely } from "kysely";
import { verifyBearer, resolveTenantId } from "@athyper/svc-shared";
import { incrementRateLimit } from "@athyper/svc-shared";
import type { CacheClient } from "@athyper/svc-iam";
import type { CheckPermissionBatchFn } from "@athyper/svc-shared";
import { decidePeriodGate, type FiscalPeriodStatus } from "@athyper/finance-rules";

export interface FinanceRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  cache?: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  /**
   * RBAC batch check used by data-export endpoints (apportionment CSV,
   * future finance reports). When omitted, all gated endpoints refuse
   * with 403 — fail-closed by design.
   */
  checkPermissionBatch?: CheckPermissionBatchFn;
  featureFlags?: {
    isEnabled(code:string,tenantId?:string):Promise<boolean>;
  };
  bankInterfaceTester?: {
    test(input: {
      tenantId: string;
      profileId: string;
      interfaceType: string;
      providerCode: string | null;
      credentialProvider: string | null;
      credentialReference: string | null;
      credentialVersion: string | null;
      config: Record<string, unknown>;
    }): Promise<{ ok: boolean; code: string; latencyMs?: number }>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

export async function enforceWriteRateLimit(
  cache: FinanceRouteDeps["cache"],
  res: Parameters<RequestHandler>[1],
  key: string,
  limit = 30,
  windowSec = 60,
): Promise<boolean> {
  if (!cache) return true;

  const count = await incrementRateLimit(cache, key, windowSec).catch(() => 0);
  if (count === 0) return true;
  if (count <= limit) return true;

  res.setHeader("Retry-After", String(windowSec));
  res.status(429).json({
    error: "RATE_LIMITED",
    message: "Too many write attempts. Please wait and try again.",
    retry_after_seconds: windowSec,
  });
  return false;
}

// ── Scope params ──────────────────────────────────────────────────────────────

export interface ScopeParams {
  scopeType: string;
  scopeId: string;
  fiscalYear: number;
  period: number | null;
  bookId: string | null;
  currency: string | null;
  transactionCurrency: string | null;
  comparative: boolean;
}

interface StatementDateRangeParams {
  dateFrom: string;
  dateTo: string;
  datePreset: string | null;
}

type StatementGroupBy = "none" | "fiscal_year" | "fiscal_quarter" | "fiscal_period";
type StatementBucketMode = Exclude<StatementGroupBy, "none">;

export function parseScopeParams(query: Record<string, unknown>): ScopeParams | { error: string } {
  const scopeType = query["scopeType"] as string | undefined;
  const scopeId   = query["scopeId"]   as string | undefined;
  const fyRaw     = query["fiscalYear"] as string | undefined;
  if (!scopeType || !["company", "legal_entity", "group"].includes(scopeType))
    return { error: "scopeType must be company | legal_entity | group" };
  if (!scopeId?.trim()) return { error: "scopeId is required" };
  const fiscalYear = parseInt(fyRaw ?? "", 10);
  if (isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100)
    return { error: "fiscalYear must be a valid year" };
  const periodRaw = query["period"] as string | undefined;
  const period = periodRaw !== undefined && periodRaw !== "" ? parseInt(periodRaw, 10) : null;
  if (period !== null && (isNaN(period) || period < 0 || period > 16))
    return { error: "period must be 0-16" };
  return {
    scopeType, scopeId, fiscalYear, period,
    bookId:              (query["bookId"]              as string | undefined) ?? null,
    currency:            (query["currency"]            as string | undefined) ?? null,
    transactionCurrency: (query["transactionCurrency"] as string | undefined)
                      ?? (query["txnCurrency"]         as string | undefined)
                      ?? null,
    comparative: query["comparative"] === "true",
  };
}

function parseDateOnlyParam(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // eslint-disable-next-line no-direct-date-parse -- reason: regex above guarantees canonical YYYY-MM-DD; explicit Z suffix forces UTC parse.
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function parseStatementDateRange(query: Record<string, unknown>): StatementDateRangeParams | { error: string } | null {
  const dateFrom = parseDateOnlyParam(query["dateFrom"]);
  const dateTo = parseDateOnlyParam(query["dateTo"]);
  if (!dateFrom && !dateTo) return null;
  if (!dateFrom || !dateTo) return { error: "dateFrom and dateTo are required for date range statements" };
  if (dateFrom > dateTo) return { error: "dateFrom must be on or before dateTo" };
  return {
    dateFrom,
    dateTo,
    datePreset: typeof query["datePreset"] === "string" ? query["datePreset"] : null,
  };
}

function parseStatementGroupBy(query: Record<string, unknown>): StatementGroupBy | { error: string } {
  const raw = typeof query["groupBy"] === "string" ? query["groupBy"].trim().toLowerCase() : "";
  switch (raw) {
    case "":
    case "none":
    case "off":
      return "none";
    case "fy":
    case "year":
    case "years":
    case "fiscal_year":
      return "fiscal_year";
    case "q":
    case "quarter":
    case "quarters":
    case "fiscal_quarter":
      return "fiscal_quarter";
    case "p":
    case "period":
    case "periods":
    case "month":
    case "months":
    case "fiscal_period":
      return "fiscal_period";
    default:
      return { error: "groupBy must be none | fiscal_year | fiscal_quarter | fiscal_period" };
  }
}

function parseStatementAccumulatedValues(query: Record<string, unknown>): boolean | { error: string } {
  const rawValue = query["accumulatedValues"] ?? query["accumulated"];
  if (rawValue === undefined) return true;
  if (typeof rawValue !== "string") return { error: "accumulatedValues must be true or false" };

  switch (rawValue.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return { error: "accumulatedValues must be true or false" };
  }
}

// ── Scope resolver (calls master.fn_resolve_scope_companies) ─────────────────

export async function resolveCompanyIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  scope: Pick<ScopeParams, "scopeType" | "scopeId">,
): Promise<Array<{ company_code_id: string; company_code: string }>> {
  const { rows } = await sql<{ company_code_id: string; company_code: string }>`
    SELECT company_code_id, company_code
    FROM master.fn_resolve_scope_companies(${tenantId}::uuid, ${scope.scopeType}, ${scope.scopeId})
  `.execute(db);
  return rows;
}

// ── ledger.gl_balance query helper ────────────────────────────────────────────
// This is the authoritative source for all balance-based reports.
// For a specific period: picks the gl_balance row for that period.
// For full-year (period = null): uses the max posted period in the fiscal year.

interface GlBalance {
  accountCode: string;
  accountName: string;
  accountClass: string;
  openingDebit: number;
  openingCredit: number;
  movementDebit: number;
  movementCredit: number;
  closingDebit: number;
  closingCredit: number;
  /** closingDebit - closingCredit */
  net: number;
}

type RawGlBalanceRow = {
  accountCode: string;
  accountName: string;
  accountClass: string;
  openingDebit: string | number | null;
  openingCredit: string | number | null;
  movementDebit: string | number | null;
  movementCredit: string | number | null;
  closingDebit: string | number | null;
  closingCredit: string | number | null;
};

function parseMoney(value: string | number | null | undefined): number {
  const amount = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(amount) ? amount : 0;
}

function mapGlBalanceRows(rows: RawGlBalanceRow[]): GlBalance[] {
  return rows.map((r) => {
    const cd = parseMoney(r.closingDebit);
    const cc = parseMoney(r.closingCredit);
    return {
      accountCode:    r.accountCode,
      accountName:    r.accountName,
      accountClass:   r.accountClass,
      openingDebit:   parseMoney(r.openingDebit),
      openingCredit:  parseMoney(r.openingCredit),
      movementDebit:  parseMoney(r.movementDebit),
      movementCredit: parseMoney(r.movementCredit),
      closingDebit:   cd,
      closingCredit:  cc,
      net:            cd - cc,
    };
  });
}

async function fetchLiveGlBalancesFromJournalLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyIds: string[],
  params: ScopeParams,
): Promise<GlBalance[]> {
  if (companyIds.length === 0) return [];

  const companyIdList = sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `);
  const period = params.period;
  const openingDebit = period === null
    ? sql<string>`0`
    : sql<string>`COALESCE(SUM(CASE WHEN jl.period_number < ${period} THEN jl.base_debit ELSE 0 END), 0)`;
  const openingCredit = period === null
    ? sql<string>`0`
    : sql<string>`COALESCE(SUM(CASE WHEN jl.period_number < ${period} THEN jl.base_credit ELSE 0 END), 0)`;
  const movementDebit = period === null
    ? sql<string>`COALESCE(SUM(jl.base_debit), 0)`
    : sql<string>`COALESCE(SUM(CASE WHEN jl.period_number = ${period} THEN jl.base_debit ELSE 0 END), 0)`;
  const movementCredit = period === null
    ? sql<string>`COALESCE(SUM(jl.base_credit), 0)`
    : sql<string>`COALESCE(SUM(CASE WHEN jl.period_number = ${period} THEN jl.base_credit ELSE 0 END), 0)`;
  const closingDebit = period === null
    ? sql<string>`COALESCE(SUM(jl.base_debit), 0)`
    : sql<string>`COALESCE(SUM(CASE WHEN jl.period_number <= ${period} THEN jl.base_debit ELSE 0 END), 0)`;
  const closingCredit = period === null
    ? sql<string>`COALESCE(SUM(jl.base_credit), 0)`
    : sql<string>`COALESCE(SUM(CASE WHEN jl.period_number <= ${period} THEN jl.base_credit ELSE 0 END), 0)`;
  const bookFilter = params.bookId ? sql`AND jl.book_id = ${params.bookId}::uuid` : sql``;
  const transactionCurrencyFilter = params.transactionCurrency
    ? sql`AND jl.transaction_currency = ${params.transactionCurrency}`
    : sql``;

  const { rows } = await sql<RawGlBalanceRow>`
    SELECT
      ga.code            AS "accountCode",
      ga.name            AS "accountName",
      ga.account_class   AS "accountClass",
      ${openingDebit}    AS "openingDebit",
      ${openingCredit}   AS "openingCredit",
      ${movementDebit}   AS "movementDebit",
      ${movementCredit}  AS "movementCredit",
      ${closingDebit}    AS "closingDebit",
      ${closingCredit}   AS "closingCredit"
    FROM document.journal_line jl
    JOIN document.journal_entry je ON je.id = jl.journal_entry_id
    JOIN master.gl_account ga ON ga.id = jl.gl_account_id
    WHERE jl.tenant_id = ${tenantId}::uuid
      AND jl.company_code_id = ANY(ARRAY[${companyIdList}])
      AND jl.fiscal_year = ${params.fiscalYear}
      AND je.status = 'posted'
      ${bookFilter}
      ${transactionCurrencyFilter}
    GROUP BY ga.code, ga.name, ga.account_class
    HAVING
      ${openingDebit} <> 0 OR ${openingCredit} <> 0 OR
      ${movementDebit} <> 0 OR ${movementCredit} <> 0 OR
      ${closingDebit} <> 0 OR ${closingCredit} <> 0
    ORDER BY ga.code
  `.execute(db);

  return mapGlBalanceRows(rows);
}

async function fetchLiveGlBalancesFromJournalLinesByPostingDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyIds: string[],
  params: ScopeParams,
  dateFrom: string,
  dateTo: string,
): Promise<GlBalance[]> {
  if (companyIds.length === 0) return [];

  const companyIdList = sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `);
  const bookFilter = params.bookId ? sql`AND jl.book_id = ${params.bookId}::uuid` : sql``;
  const transactionCurrencyFilter = params.transactionCurrency
    ? sql`AND jl.transaction_currency = ${params.transactionCurrency}`
    : sql``;

  const { rows } = await sql<RawGlBalanceRow>`
    SELECT
      ga.code            AS "accountCode",
      ga.name            AS "accountName",
      ga.account_class   AS "accountClass",
      0                  AS "openingDebit",
      0                  AS "openingCredit",
      COALESCE(SUM(jl.base_debit), 0)  AS "movementDebit",
      COALESCE(SUM(jl.base_credit), 0) AS "movementCredit",
      COALESCE(SUM(jl.base_debit), 0)  AS "closingDebit",
      COALESCE(SUM(jl.base_credit), 0) AS "closingCredit"
    FROM document.journal_line jl
    JOIN document.journal_entry je ON je.id = jl.journal_entry_id
    JOIN master.gl_account ga ON ga.id = jl.gl_account_id
    WHERE jl.tenant_id = ${tenantId}::uuid
      AND jl.company_code_id = ANY(ARRAY[${companyIdList}])
      AND je.status = 'posted'
      AND je.posting_date >= ${dateFrom}::date
      AND je.posting_date <= ${dateTo}::date
      ${bookFilter}
      ${transactionCurrencyFilter}
    GROUP BY ga.code, ga.name, ga.account_class
    HAVING COALESCE(SUM(jl.base_debit), 0) <> 0 OR COALESCE(SUM(jl.base_credit), 0) <> 0
    ORDER BY ga.code
  `.execute(db);

  return mapGlBalanceRows(rows);
}

async function fetchGlBalances(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyIds: string[],
  params: ScopeParams,
): Promise<GlBalance[]> {
  if (companyIds.length === 0) return [];

  // For full-year (period = null), find the max period_number that exists in gl_balance
  let effectivePeriod = params.period;
  if (effectivePeriod === null) {
    const maxRow = await db
      .selectFrom("ledger.gl_balance as glb")
      .select(db.fn.max("glb.period_number").as("maxPeriod"))
      .where("glb.tenant_id", "=", tenantId)
      .where("glb.company_code_id", "in", companyIds)
      .where("glb.fiscal_year", "=", params.fiscalYear)
      .executeTakeFirst() as { maxPeriod: number | null } | undefined;
    effectivePeriod = maxRow?.maxPeriod ?? 12;
  }

  let query = db
    .selectFrom("ledger.gl_balance as glb")
    .innerJoin("master.gl_account as ga", "ga.id", "glb.gl_account_id")
    .select([
      "ga.code as accountCode",
      "ga.name as accountName",
      "ga.account_class as accountClass",
      db.fn.sum("glb.opening_debit").as("openingDebit"),
      db.fn.sum("glb.opening_credit").as("openingCredit"),
      db.fn.sum("glb.period_debit").as("movementDebit"),
      db.fn.sum("glb.period_credit").as("movementCredit"),
      db.fn.sum("glb.closing_debit").as("closingDebit"),
      db.fn.sum("glb.closing_credit").as("closingCredit"),
    ])
    .where("glb.tenant_id", "=", tenantId)
    .where("glb.company_code_id", "in", companyIds)
    .where("glb.fiscal_year", "=", params.fiscalYear)
    .where("glb.period_number", "=", effectivePeriod)
    .groupBy(["ga.code", "ga.name", "ga.account_class"])
    .orderBy("ga.code", "asc");

  if (params.bookId) {
    query = query.where("glb.book_id", "=", params.bookId) as typeof query;
  }

  const rows = await query.execute() as RawGlBalanceRow[];
  if (rows.length === 0) {
    return fetchLiveGlBalancesFromJournalLines(db, tenantId, companyIds, params);
  }

  return mapGlBalanceRows(rows);
}

function normalizeProfitLossBalance(balance: GlBalance): GlBalance | null {
  if (["revenue", "income", "contra_revenue"].includes(balance.accountClass)) {
    return {
      ...balance,
      accountClass: "revenue",
      net: balance.movementCredit - balance.movementDebit,
    };
  }
  if (["expense", "contra_expense"].includes(balance.accountClass)) {
    return {
      ...balance,
      accountClass: "expense",
      net: balance.movementDebit - balance.movementCredit,
    };
  }
  return null;
}

// ── Grouping helpers for financial statements ─────────────────────────────────

interface StatementSectionShape {
  code: string;
  label: string;
  rows: Array<{
    accountCode: string;
    accountName: string;
    current: number;
    prior?: number;
    buckets?: Record<string, number>;
  }>;
  total: number;
  priorTotal?: number;
  bucketTotals?: Record<string, number>;
}

interface StatementBucketShape {
  key: string;
  label: string;
  fiscalYear: number;
  period: number | null;
  quarter?: number | null;
  startDate: string;
  endDate: string;
}

interface FiscalPeriodRow {
  fiscalYear: number;
  periodNumber: number;
  periodType: string | null;
  startDate: string | Date;
  endDate: string | Date;
}

function buildSections(
  rows: GlBalance[],
  priorMap: Map<string, GlBalance>,
): Record<string, StatementSectionShape[]> {
  const byClass = new Map<string, GlBalance[]>();
  for (const r of rows) {
    const arr = byClass.get(r.accountClass) ?? [];
    arr.push(r);
    byClass.set(r.accountClass, arr);
  }
  const out: Record<string, StatementSectionShape[]> = {};
  for (const [cls, classRows] of byClass) {
    const total      = classRows.reduce((s, r) => s + r.net, 0);
    const priorTotal = classRows.reduce((s, r) => s + (priorMap.get(r.accountCode)?.net ?? 0), 0);
    out[cls] = [{
      code:  cls,
      label: cls.charAt(0).toUpperCase() + cls.slice(1).replace(/_/g, " "),
      rows:  classRows.map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        current: r.net,
        prior: priorMap.size > 0 ? (priorMap.get(r.accountCode)?.net ?? 0) : undefined,
      })),
      total,
      priorTotal: priorMap.size > 0 ? priorTotal : undefined,
    }];
  }
  return out;
}

function sumSections(sections: StatementSectionShape[]): number {
  return sections.reduce((s, sec) => s + sec.total, 0);
}
function sumSectionsPrior(sections: StatementSectionShape[]): number | undefined {
  if (sections.every((s) => s.priorTotal === undefined)) return undefined;
  return sections.reduce((s, sec) => s + (sec.priorTotal ?? 0), 0);
}

function toDateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function shortMonthYear(dateValue: string): string {
  // eslint-disable-next-line no-direct-date-parse -- reason: explicit Z suffix forces UTC parse; toLocaleDateString below uses timeZone: "UTC".
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fiscalYearBucketLabel(fiscalYear: number, startDate: string, endDate: string): string {
  void startDate;
  void endDate;
  return `FY ${fiscalYear}`;
}

function periodBucketLabel(row: FiscalPeriodRow): string {
  if ((row.periodType ?? "").toLowerCase().includes("opening") || row.periodNumber === 0) return "Opening";
  const startDate = toDateOnly(row.startDate);
  if (row.periodNumber >= 1 && row.periodNumber <= 12) return shortMonthYear(startDate);
  return `P${row.periodNumber}`;
}

function clampDateRange(
  startDate: string,
  endDate: string,
  range?: StatementDateRangeParams | null,
): { startDate: string; endDate: string } {
  if (!range) return { startDate, endDate };
  return {
    startDate: startDate < range.dateFrom ? range.dateFrom : startDate,
    endDate: endDate > range.dateTo ? range.dateTo : endDate,
  };
}

function isStatementPeriod(row: FiscalPeriodRow): boolean {
  return Number(row.periodNumber) > 0 && !(row.periodType ?? "").toLowerCase().includes("opening");
}

function quarterForPeriod(periodNumber: number): number {
  if (periodNumber <= 0) return 1;
  return Math.min(4, Math.max(1, Math.ceil(periodNumber / 3)));
}

function buildFiscalYearBuckets(
  rows: FiscalPeriodRow[],
  range?: StatementDateRangeParams | null,
): StatementBucketShape[] {
  const fiscalYears = Array.from(new Set(rows.map((row) => Number(row.fiscalYear)))).sort((a, b) => a - b);
  return fiscalYears.map((fiscalYear) => {
    const yearRows = rows.filter((row) => Number(row.fiscalYear) === fiscalYear);
    const firstYearRow = yearRows[0];
    if (!firstYearRow) {
      return {
        key: `fy-${fiscalYear}`,
        label: `FY ${fiscalYear}`,
        fiscalYear,
        period: null,
        startDate: range?.dateFrom ?? `${fiscalYear}-01-01`,
        endDate: range?.dateTo ?? `${fiscalYear}-12-31`,
      };
    }

    const startDate = yearRows.reduce((min, row) => {
      const value = toDateOnly(row.startDate);
      return value < min ? value : min;
    }, toDateOnly(firstYearRow.startDate));
    const endDate = yearRows.reduce((max, row) => {
      const value = toDateOnly(row.endDate);
      return value > max ? value : max;
    }, toDateOnly(firstYearRow.endDate));
    const statementRows = yearRows.filter(isStatementPeriod);
    const periodRows = statementRows.length > 0 ? statementRows : yearRows;
    const period = periodRows.reduce((max, row) => Math.max(max, Number(row.periodNumber)), 0);
    const clipped = clampDateRange(startDate, endDate, range);

    return {
      key: `fy-${fiscalYear}`,
      label: fiscalYearBucketLabel(fiscalYear, startDate, endDate),
      fiscalYear,
      period,
      startDate: clipped.startDate,
      endDate: clipped.endDate,
    };
  });
}

function buildFiscalQuarterBuckets(
  rows: FiscalPeriodRow[],
  range?: StatementDateRangeParams | null,
): StatementBucketShape[] {
  const groups = new Map<string, FiscalPeriodRow[]>();
  for (const row of rows.filter(isStatementPeriod)) {
    const fiscalYear = Number(row.fiscalYear);
    const quarter = quarterForPeriod(Number(row.periodNumber));
    const key = `fy-${fiscalYear}-q-${quarter}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.entries()).map(([key, groupRows]) => {
    const firstRow = groupRows[0];
    const fiscalYear = Number(firstRow?.fiscalYear ?? 0);
    const quarter = quarterForPeriod(Number(firstRow?.periodNumber ?? 1));
    const startDate = groupRows.reduce((min, row) => {
      const value = toDateOnly(row.startDate);
      return value < min ? value : min;
    }, toDateOnly(firstRow!.startDate));
    const endDate = groupRows.reduce((max, row) => {
      const value = toDateOnly(row.endDate);
      return value > max ? value : max;
    }, toDateOnly(firstRow!.endDate));
    const period = groupRows.reduce((max, row) => Math.max(max, Number(row.periodNumber)), 0);
    const clipped = clampDateRange(startDate, endDate, range);

    return {
      key,
      label: `FY ${fiscalYear} Q${quarter}`,
      fiscalYear,
      quarter,
      period,
      startDate: clipped.startDate,
      endDate: clipped.endDate,
    };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function buildFiscalPeriodBuckets(
  rows: FiscalPeriodRow[],
  range?: StatementDateRangeParams | null,
): StatementBucketShape[] {
  const periodRows = rows.filter(isStatementPeriod);
  const sourceRows = periodRows.length > 0 ? periodRows : rows;
  return sourceRows.map((row) => {
    const fiscalYear = Number(row.fiscalYear);
    const periodNumber = Number(row.periodNumber);
    const startDate = toDateOnly(row.startDate);
    const endDate = toDateOnly(row.endDate);
    const clipped = clampDateRange(startDate, endDate, range);
    return {
      key: `fy-${fiscalYear}-p-${periodNumber}`,
      label: periodBucketLabel(row),
      fiscalYear,
      period: periodNumber,
      startDate: clipped.startDate,
      endDate: clipped.endDate,
    };
  });
}

async function buildStatementDateBuckets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyId: string,
  range: StatementDateRangeParams,
  groupBy: StatementBucketMode,
): Promise<StatementBucketShape[]> {
  const rows = await db
    .selectFrom("master.fiscal_period as fp")
    .select([
      "fp.fiscal_year as fiscalYear",
      "fp.period_number as periodNumber",
      "fp.period_type as periodType",
      "fp.start_date as startDate",
      "fp.end_date as endDate",
    ])
    .where("fp.tenant_id", "=", tenantId)
    .where("fp.company_code_id", "=", companyId)
    .where("fp.end_date", ">=", range.dateFrom)
    .where("fp.start_date", "<=", range.dateTo)
    .orderBy("fp.start_date", "asc")
    .execute() as FiscalPeriodRow[];

  if (rows.length === 0) {
    return buildCalendarDateBuckets(range, groupBy);
  }

  if (groupBy === "fiscal_year") return buildFiscalYearBuckets(rows, range);
  if (groupBy === "fiscal_quarter") return buildFiscalQuarterBuckets(rows, range);
  return buildFiscalPeriodBuckets(rows, range);
}

async function buildStatementFiscalBuckets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyId: string,
  params: ScopeParams,
  groupBy: StatementBucketMode,
): Promise<StatementBucketShape[]> {
  let query = db
    .selectFrom("master.fiscal_period as fp")
    .select([
      "fp.fiscal_year as fiscalYear",
      "fp.period_number as periodNumber",
      "fp.period_type as periodType",
      "fp.start_date as startDate",
      "fp.end_date as endDate",
    ])
    .where("fp.tenant_id", "=", tenantId)
    .where("fp.company_code_id", "=", companyId)
    .where("fp.fiscal_year", "=", params.fiscalYear)
    .orderBy("fp.start_date", "asc");

  if (params.period !== null) {
    query = query.where("fp.period_number", "<=", params.period) as typeof query;
  }

  const rows = await query.execute() as FiscalPeriodRow[];
  if (rows.length === 0) return buildFallbackFiscalBuckets(params, groupBy);

  if (groupBy === "fiscal_year") return buildFiscalYearBuckets(rows);
  if (groupBy === "fiscal_quarter") return buildFiscalQuarterBuckets(rows);
  return buildFiscalPeriodBuckets(rows);
}

async function buildSingleDateRangeBucket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyId: string,
  range: StatementDateRangeParams,
): Promise<StatementBucketShape> {
  const row = await db
    .selectFrom("master.fiscal_period as fp")
    .select([
      "fp.fiscal_year as fiscalYear",
      "fp.period_number as periodNumber",
      "fp.period_type as periodType",
      "fp.start_date as startDate",
      "fp.end_date as endDate",
    ])
    .where("fp.tenant_id", "=", tenantId)
    .where("fp.company_code_id", "=", companyId)
    .where("fp.start_date", "<=", range.dateTo)
    .where("fp.end_date", ">=", range.dateTo)
    .orderBy("fp.start_date", "desc")
    .executeTakeFirst() as FiscalPeriodRow | undefined;

  if (!row) {
    return {
      key: "range",
      label: "Range",
      fiscalYear: Number(range.dateTo.slice(0, 4)),
      period: null,
      startDate: range.dateFrom,
      endDate: range.dateTo,
    };
  }

  return {
    key: "range",
    label: "Range",
    fiscalYear: Number(row.fiscalYear),
    period: Number(row.periodNumber),
    startDate: range.dateFrom,
    endDate: range.dateTo,
  };
}

function buildCalendarDateBuckets(
  range: StatementDateRangeParams,
  groupBy: StatementBucketMode,
): StatementBucketShape[] {
  // eslint-disable-next-line no-direct-date-parse -- reason: dateFrom/dateTo already validated as canonical YYYY-MM-DD; Z suffix forces UTC.
  const start = new Date(`${range.dateFrom}T00:00:00Z`);
  // eslint-disable-next-line no-direct-date-parse -- reason: dateFrom/dateTo already validated as canonical YYYY-MM-DD; Z suffix forces UTC.
  const end = new Date(`${range.dateTo}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  if (groupBy === "fiscal_period") {
    const buckets: StatementBucketShape[] = [];
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth();
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      const startDate = monthStart < start ? range.dateFrom : monthStart.toISOString().slice(0, 10);
      const endDate = monthEnd > end ? range.dateTo : monthEnd.toISOString().slice(0, 10);
      buckets.push({
        key: `fy-${year}-p-${month + 1}`,
        label: shortMonthYear(startDate),
        fiscalYear: year,
        period: month + 1,
        startDate,
        endDate,
      });
      cursor = new Date(Date.UTC(year, month + 1, 1));
    }
    return buckets;
  }

  if (groupBy === "fiscal_quarter") {
    const buckets: StatementBucketShape[] = [];
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1));
    while (cursor <= end) {
      const year = cursor.getUTCFullYear();
      const quarter = Math.floor(cursor.getUTCMonth() / 3) + 1;
      const quarterStart = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
      const quarterEnd = new Date(Date.UTC(year, quarter * 3, 0));
      const startDate = quarterStart < start ? range.dateFrom : quarterStart.toISOString().slice(0, 10);
      const endDate = quarterEnd > end ? range.dateTo : quarterEnd.toISOString().slice(0, 10);
      buckets.push({
        key: `fy-${year}-q-${quarter}`,
        label: `FY ${year} Q${quarter}`,
        fiscalYear: year,
        quarter,
        period: quarter * 3,
        startDate,
        endDate,
      });
      cursor = new Date(Date.UTC(year, quarter * 3, 1));
    }
    return buckets;
  }

  const buckets: StatementBucketShape[] = [];
  const startYear = Number(range.dateFrom.slice(0, 4));
  const endYear = Number(range.dateTo.slice(0, 4));
  for (let year = startYear; year <= endYear; year += 1) {
    const startDate = year === startYear ? range.dateFrom : `${year}-01-01`;
    const endDate = year === endYear ? range.dateTo : `${year}-12-31`;
    buckets.push({
      key: `fy-${year}`,
      label: `FY ${year}`,
      fiscalYear: year,
      period: null,
      startDate,
      endDate,
    });
  }
  return buckets;
}

function buildFallbackFiscalBuckets(
  params: ScopeParams,
  groupBy: StatementBucketMode,
): StatementBucketShape[] {
  const endPeriod = params.period ?? 12;
  if (groupBy === "fiscal_period") {
    return Array.from({ length: Math.max(endPeriod, 1) }, (_, index) => {
      const period = index + 1;
      return {
        key: `fy-${params.fiscalYear}-p-${period}`,
        label: `P${period}`,
        fiscalYear: params.fiscalYear,
        period,
        startDate: `${params.fiscalYear}-01-01`,
        endDate: `${params.fiscalYear}-12-31`,
      };
    });
  }

  if (groupBy === "fiscal_quarter") {
    return Array.from({ length: Math.ceil(Math.max(endPeriod, 1) / 3) }, (_, index) => {
      const quarter = index + 1;
      return {
        key: `fy-${params.fiscalYear}-q-${quarter}`,
        label: `FY ${params.fiscalYear} Q${quarter}`,
        fiscalYear: params.fiscalYear,
        quarter,
        period: Math.min(quarter * 3, endPeriod),
        startDate: `${params.fiscalYear}-01-01`,
        endDate: `${params.fiscalYear}-12-31`,
      };
    });
  }

  return [{
    key: `fy-${params.fiscalYear}`,
    label: `FY ${params.fiscalYear}`,
    fiscalYear: params.fiscalYear,
    period: params.period,
    startDate: `${params.fiscalYear}-01-01`,
    endDate: `${params.fiscalYear}-12-31`,
  }];
}

function aggregateGlBalances(rows: GlBalance[]): GlBalance[] {
  const byAccount = new Map<string, GlBalance>();

  for (const row of rows) {
    const current = byAccount.get(row.accountCode);
    if (!current) {
      byAccount.set(row.accountCode, { ...row });
      continue;
    }

    current.openingDebit += row.openingDebit;
    current.openingCredit += row.openingCredit;
    current.movementDebit += row.movementDebit;
    current.movementCredit += row.movementCredit;
    current.closingDebit += row.closingDebit;
    current.closingCredit += row.closingCredit;
    current.net += row.net;
  }

  return Array.from(byAccount.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

function toMovementBalance(row: GlBalance): GlBalance {
  return {
    ...row,
    closingDebit: row.movementDebit,
    closingCredit: row.movementCredit,
    net: row.movementDebit - row.movementCredit,
  };
}

function accumulationStartForBucket(
  buckets: StatementBucketShape[],
  bucket: StatementBucketShape,
): string {
  const fiscalYearBucketStarts = buckets
    .filter((item) => item.fiscalYear === bucket.fiscalYear && item.startDate <= bucket.startDate)
    .map((item) => item.startDate)
    .sort();
  return fiscalYearBucketStarts[0] ?? bucket.startDate;
}

function attachBucketsToSections(
  sections: StatementSectionShape[],
  buckets: StatementBucketShape[],
  bucketRows: Map<string, Map<string, number>>,
): StatementSectionShape[] {
  return sections.map((section) => {
    const rows = section.rows.map((row) => {
      const rowBuckets: Record<string, number> = {};
      for (const bucket of buckets) {
        rowBuckets[bucket.key] = bucketRows.get(bucket.key)?.get(row.accountCode) ?? 0;
      }
      return { ...row, buckets: rowBuckets };
    });

    const bucketTotals: Record<string, number> = {};
    for (const bucket of buckets) {
      bucketTotals[bucket.key] = rows.reduce((sum, row) => sum + (row.buckets?.[bucket.key] ?? 0), 0);
    }

    return { ...section, rows, bucketTotals };
  });
}

function buildBucketRowsMap(
  buckets: StatementBucketShape[],
  rowsByBucket: Map<string, GlBalance[]>,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const bucket of buckets) {
    const byAccount = new Map<string, number>();
    for (const row of rowsByBucket.get(bucket.key) ?? []) {
      byAccount.set(row.accountCode, row.net);
    }
    out.set(bucket.key, byAccount);
  }
  return out;
}

function sumBucketTotals(sections: StatementSectionShape[], bucketKey: string | undefined): number {
  if (!bucketKey) return 0;
  return sections.reduce((sum, section) => sum + (section.bucketTotals?.[bucketKey] ?? 0), 0);
}

function bucketModeFor(buckets: StatementBucketShape[]): StatementBucketMode {
  if (buckets.some((bucket) => bucket.key.includes("-p-"))) return "fiscal_period";
  if (buckets.some((bucket) => bucket.key.includes("-q-"))) return "fiscal_quarter";
  return "fiscal_year";
}

function omitBucketColumns<T extends { buckets?: StatementBucketShape[]; bucketMode?: StatementBucketMode }>(
  payload: T,
): Omit<T, "buckets" | "bucketMode"> {
  const rest = { ...payload };
  delete rest.buckets;
  delete rest.bucketMode;
  return rest;
}

async function buildBalanceSheetDateRangePayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyIds: string[],
  params: ScopeParams,
  buckets: StatementBucketShape[],
  range: StatementDateRangeParams | null,
  accumulatedValues: boolean,
) {
  const bucketResults = await Promise.all(buckets.map(async (bucket) => {
    let rows: GlBalance[];
    if (accumulatedValues) {
      rows = await fetchGlBalances(db, tenantId, companyIds, {
        ...params,
        fiscalYear: bucket.fiscalYear,
        period: bucket.period,
        comparative: false,
      });
    } else {
      rows = await fetchLiveGlBalancesFromJournalLinesByPostingDate(
        db,
        tenantId,
        companyIds,
        { ...params, fiscalYear: bucket.fiscalYear, period: bucket.period, comparative: false },
        bucket.startDate,
        bucket.endDate,
      );
      if (rows.length === 0) {
        rows = (await fetchGlBalances(db, tenantId, companyIds, {
          ...params,
          fiscalYear: bucket.fiscalYear,
          period: bucket.period,
          comparative: false,
        })).map(toMovementBalance);
      }
    }
    return {
      bucket,
      rows: rows.filter((row) => ["asset", "liability", "equity"].includes(row.accountClass)),
    };
  }));

  const rowsByBucket = new Map(bucketResults.map((result) => [result.bucket.key, result.rows]));
  const aggregateRows = aggregateGlBalances(bucketResults.flatMap((result) => result.rows));
  const grouped = buildSections(aggregateRows, new Map());
  const bucketMap = buildBucketRowsMap(buckets, rowsByBucket);

  const assets = attachBucketsToSections(grouped.asset ?? [], buckets, bucketMap);
  const liabilities = attachBucketsToSections(grouped.liability ?? [], buckets, bucketMap);
  const equity = attachBucketsToSections(grouped.equity ?? [], buckets, bucketMap);
  const lastBucketKey = buckets[buckets.length - 1]?.key;
  const totalAssets = sumBucketTotals(assets, lastBucketKey);
  const totalLiabilities = sumBucketTotals(liabilities, lastBucketKey);
  const totalEquity = sumBucketTotals(equity, lastBucketKey);

  return {
    assets, liabilities, equity,
    buckets,
    bucketMode: bucketModeFor(buckets),
    accumulatedValues,
    dateRange: range ?? undefined,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
    asAt: new Date().toISOString(), isLive: true,
  };
}

async function buildProfitLossDateRangePayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  companyIds: string[],
  params: ScopeParams,
  buckets: StatementBucketShape[],
  range: StatementDateRangeParams | null,
  accumulatedValues: boolean,
) {
  const bucketResults = await Promise.all(buckets.map(async (bucket) => {
    const startDate = accumulatedValues
      ? accumulationStartForBucket(buckets, bucket)
      : bucket.startDate;
    const rows = await fetchLiveGlBalancesFromJournalLinesByPostingDate(
      db,
      tenantId,
      companyIds,
      { ...params, fiscalYear: bucket.fiscalYear, period: bucket.period, comparative: false },
      startDate,
      bucket.endDate,
    );
    return {
      bucket,
      rows: rows
        .map(normalizeProfitLossBalance)
        .filter((row): row is GlBalance => row !== null),
    };
  }));

  const rowsByBucket = new Map(bucketResults.map((result) => [result.bucket.key, result.rows]));
  const aggregateRows = aggregateGlBalances(bucketResults.flatMap((result) => result.rows));
  const grouped = buildSections(aggregateRows, new Map());
  const bucketMap = buildBucketRowsMap(buckets, rowsByBucket);

  const revenue = attachBucketsToSections(grouped.revenue ?? [], buckets, bucketMap);
  const expenses = attachBucketsToSections(grouped.expense ?? [], buckets, bucketMap);
  const totalRevenue = sumSections(revenue);
  const totalExpenses = sumSections(expenses);

  return {
    revenue,
    costOfSales: [],
    grossProfit: totalRevenue,
    operatingExpenses: expenses,
    operatingProfit: totalRevenue - totalExpenses,
    otherIncome: [],
    otherExpenses: [],
    netProfit: totalRevenue - totalExpenses,
    buckets,
    bucketMode: bucketModeFor(buckets),
    accumulatedValues,
    dateRange: range ?? undefined,
    asAt: new Date().toISOString(), isLive: true,
  };
}

// ── User company-access resolver ──────────────────────────────────────────────
// Returns the set of company_code UUIDs the caller may see.
// • allCompanies=true  → no restriction (user has a tenant-wide role)
// • allCompanies=false → restrict to allowedIds (may be empty → show all as fallback)
//
// Resolution path: JWT sub → principal_identity_binding (provider_code='keycloak') →
//   principal → auth_group_member → auth_group_role
//   (assignment_scope_type / assignment_scope_ref_id)
//
// Phase 2: principal_profile.keycloak_id is deprecated — resolution uses
// principal_identity_binding.subject_id exclusively.
//
// Two-dimension scope model:
//   assignment_scope_type = 'tenant'       → allCompanies = true
//   assignment_scope_type = 'company_code' → allowedIds += assignment_scope_ref_id
//   assignment_scope_type = 'legal_entity' → allowedIds += CCs under that LE subtree

async function resolveUserCompanyAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  keycloakSub: string | null,
  realmKey = "athyper",
): Promise<{ allCompanies: boolean; allowedIds: string[] }> {
  if (!keycloakSub) return { allCompanies: false, allowedIds: [] };

  // Single CTE resolves both dimensions in one round-trip:
  //   has_wide  → any 'tenant'-scoped active role
  //   cc_ids    → all CC UUIDs from CC-scope + LE-scope roles
  const scopeResult = await sql<{ has_wide: boolean; cc_ids: string[] | null }>`
    WITH principal_roles AS (
      SELECT
        scope.scope_kind AS assignment_scope_type,
        scope.resource_id AS assignment_scope_ref_id,
        true AS include_descendants
      FROM   master.principal_identity_binding pib
      JOIN   master.principal           p  ON p.id = pib.principal_id AND p.tenant_id = ${tenantId}::uuid
      JOIN master.auth_current_group_member_v gm
        ON gm.principal_id = p.id AND gm.tenant_id = ${tenantId}::uuid AND gm.plane_code = 'neon'
      JOIN master.auth_current_group_role_v gr
        ON gr.group_id = gm.group_id AND gr.tenant_id = gm.tenant_id AND gr.plane_code = gm.plane_code
      JOIN master.auth_scope_target_resolved_v scope
        ON scope.scope_target_id = gr.scope_target_id
       AND scope.tenant_id = gr.tenant_id
       AND scope.plane_code = gr.plane_code
       AND scope.status = 'active'
      WHERE  pib.subject_id    = ${keycloakSub}
        AND  pib.realm_key     = ${realmKey}
        AND  pib.provider_code = 'keycloak'
        AND  pib.tenant_id     = ${tenantId}::uuid
    ),
    scoped_ccs AS (
      -- Direct company_code scope
      SELECT assignment_scope_ref_id AS cc_id
      FROM   principal_roles
      WHERE  assignment_scope_type = 'company_code'

      UNION

      -- Legal entity — full descendant subtree
      SELECT sub.company_code_id AS cc_id
      FROM   principal_roles pr
      CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(${tenantId}::uuid, pr.assignment_scope_ref_id) sub
      WHERE  pr.assignment_scope_type = 'legal_entity'
        AND  pr.include_descendants   = true

      UNION

      -- Legal entity — direct CCs only
      SELECT cc.id AS cc_id
      FROM   principal_roles pr
      JOIN   master.company_code cc
        ON   cc.legal_entity_id = pr.assignment_scope_ref_id
        AND  cc.tenant_id       = ${tenantId}::uuid
        AND  cc.is_active       = true
      WHERE  pr.assignment_scope_type = 'legal_entity'
        AND  pr.include_descendants   = false
    )
    SELECT
      coalesce(
        (SELECT bool_or(assignment_scope_type = 'tenant') FROM principal_roles),
        false
      ) AS has_wide,
      (SELECT array_agg(DISTINCT cc_id) FROM scoped_ccs) AS cc_ids
  `.execute(db);

  const row = scopeResult.rows[0];
  if (row?.has_wide) return { allCompanies: true, allowedIds: [] };
  return { allCompanies: false, allowedIds: row?.cc_ids ?? [] };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createFinanceRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // Compact context projection for Finance selectors. Canonical Entity APIs
  // remain authoritative for CRUD; this endpoint joins the records needed to
  // resolve legal-entity/company scope in one tenant-isolated request.
  router.get("/finance/master/scope-options", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.json({ tenantId: null, tenantCode: null, tenantName: null, activeLegalEntityId: null, activeLegalEntityCode: null, activeLegalEntityName: null, legalEntities: [], companies: [], defaultCompanyCode: null });
        return;
      }

      const headerLegalEntityId = ((req.headers["x-legal-entity-id"] as string | undefined) ?? "").trim();
      const requestedLegalEntityId = ((req.query["legalEntityId"] as string | undefined) ?? "").trim();
      if (headerLegalEntityId && requestedLegalEntityId && headerLegalEntityId !== requestedLegalEntityId) {
        res.status(403).json({ error: "LEGAL_ENTITY_SCOPE_MISMATCH", message: "Requested legal entity differs from the active session scope." });
        return;
      }
      const activeLegalEntityId = requestedLegalEntityId || headerLegalEntityId || null;
      const userSub = (claims["sub"] as string | undefined) ?? null;
      const access = await resolveUserCompanyAccess(db, tenantId, userSub, xRealm);

      let query = db
        .selectFrom("master.company_code as cc")
        .innerJoin("master.legal_entity as le", (join) => join
          .onRef("le.id", "=", "cc.legal_entity_id")
          .onRef("le.tenant_id", "=", "cc.tenant_id"))
        .select([
          "cc.id", "cc.code", "cc.name",
          "cc.functional_currency as functionalCurrency",
          "cc.fiscal_year_start_month as fiscalYearStartMonth",
          "le.id as legalEntityId", "le.code as legalEntityCode", "le.name as legalEntityName",
        ])
        .where("cc.tenant_id", "=", tenantId)
        .where("cc.status", "=", "active")
        .where("le.status", "=", "active");

      if (activeLegalEntityId) query = query.where("le.id", "=", activeLegalEntityId) as typeof query;
      if (!access.allCompanies && access.allowedIds.length > 0) {
        query = query.where("cc.id", "in", access.allowedIds) as typeof query;
      }

      const companies = await query.orderBy("cc.code", "asc").execute();
      const legalEntities = [...new Map(companies.map((company) => [company.legalEntityId, {
        id: company.legalEntityId,
        code: company.legalEntityCode,
        name: company.legalEntityName,
      }])).values()];
      const [tenant, scopedLegalEntity] = await Promise.all([
        db.selectFrom("master.tenant as t")
          .select(["t.code", "t.display_name as name"])
          .where("t.id", "=", tenantId)
          .executeTakeFirst(),
        activeLegalEntityId
          ? db.selectFrom("master.legal_entity as le")
              .select(["le.id", "le.code", "le.name"])
              .where("le.tenant_id", "=", tenantId)
              .where("le.id", "=", activeLegalEntityId)
              .where("le.status", "=", "active")
              .executeTakeFirst()
          : Promise.resolve(undefined),
      ]);
      const activeLegalEntity = scopedLegalEntity
        ?? (legalEntities.length === 1 ? legalEntities[0]! : null);
      const settingsDirectoryEnabled = await deps.featureFlags
        ?.isEnabled("finance.settings_directory", tenantId) ?? true;

      res.json({
        tenantId,
        tenantCode: tenant?.code ?? null,
        tenantName: tenant?.name ?? null,
        activeLegalEntityId: activeLegalEntity?.id ?? activeLegalEntityId,
        activeLegalEntityCode: activeLegalEntity?.code ?? null,
        activeLegalEntityName: activeLegalEntity?.name ?? null,
        legalEntities,
        companies,
        defaultCompanyCode: companies.length === 1 ? companies[0]!.code : null,
        featureFlags: {
          financeSettingsDirectory: settingsDirectoryEnabled,
        },
      });
    } catch (err) {
      logger?.error("finance_scope_options_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/master/companies ─────────────────────────────────────
  // Returns companies the calling user is allowed to see.
  // Includes fiscal_year_start_month so the UI can render correct period labels.
  router.get("/finance/master/companies", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const userSub = (claims["sub"] as string | undefined) ?? null;
      const access = await resolveUserCompanyAccess(db, tenantId, userSub, xRealm);

      let query = db
        .selectFrom("master.company_code as cc")
        .select([
          "cc.id", "cc.code", "cc.name",
          "cc.functional_currency as functionalCurrency",
          "cc.legal_entity_id as legalEntityId",
          "cc.fiscal_year_start_month as fiscalYearStartMonth",
        ])
        .where("cc.tenant_id", "=", tenantId)
        .where("cc.status", "=", "active");

      // Apply company-code restriction when user has specific grants (non-empty)
      if (!access.allCompanies && access.allowedIds.length > 0) {
        query = query.where("cc.id", "in", access.allowedIds) as typeof query;
      }
      // If allowedIds is empty and allCompanies=false → no roles resolved yet;
      // fall through and return all companies (non-breaking for new/unassigned users).

      const rows = await query.orderBy("cc.code", "asc").execute();
      res.json(rows);
    } catch (err) { logger?.error("finance_companies_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/master/periods ───────────────────────────────────────
  // Returns fiscal periods for a given company code + fiscal year, including
  // lifecycle status (future | open | soft_close | hard_close).
  // Used by the FinanceContextBar to show which periods are available/open.
  router.get("/finance/master/periods", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const companyCode = ((req.query["companyCode"] as string) ?? "").trim();
      const fyRaw = req.query["fiscalYear"] as string | undefined;
      const fiscalYear = parseInt(fyRaw ?? "", 10);
      if (!companyCode) { res.status(400).json({ error: "companyCode is required" }); return; }
      if (isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
        res.status(400).json({ error: "fiscalYear must be a valid year" }); return;
      }

      const company = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.id"])
        .where("cc.tenant_id", "=", tenantId)
        .where("cc.code", "=", companyCode)
        .executeTakeFirst() as { id: string } | undefined;
      if (!company) { res.json([]); return; }

      const rows = await db
        .selectFrom("master.fiscal_period as fp")
        .select([
          "fp.period_number as periodNumber",
          "fp.period_type as periodType",
          "fp.start_date as startDate",
          "fp.end_date as endDate",
          "fp.status",
        ])
        .where("fp.tenant_id", "=", tenantId)
        .where("fp.company_code_id", "=", company.id)
        .where("fp.fiscal_year", "=", fiscalYear)
        .orderBy("fp.period_number", "asc")
        .execute();
      res.json(rows);
    } catch (err) { logger?.error("finance_periods_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/master/entities ──────────────────────────────────────
  router.get("/finance/master/entities", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }
      const rows = await sql<{
        id: string; code: string; name: string;
        entityType: string; consolidationMethod: string | null;
        parentEntityId: string | null; countryCode: string; countryName: string | null;
        ownershipPct: number | null;
        functionalCurrency: string; reportingCurrency: string;
        companyCodes: string[];
      }>`
        SELECT
          le.id, le.code, le.name,
          le.entity_type         AS "entityType",
          le.consolidation_method AS "consolidationMethod",
          le.parent_entity_id    AS "parentEntityId",
          le.country_code        AS "countryCode",
          c.name                 AS "countryName",
          le.ownership_pct       AS "ownershipPct",
          le.functional_currency AS "functionalCurrency",
          le.reporting_currency  AS "reportingCurrency",
          COALESCE(
            (SELECT json_agg(cc.code ORDER BY cc.code)
             FROM   master.company_code cc
             WHERE  cc.legal_entity_id = le.id
               AND  cc.tenant_id       = le.tenant_id
               AND  cc.status          = 'active'),
            '[]'::json
          ) AS "companyCodes"
        FROM   master.legal_entity le
        LEFT JOIN shared.country c ON c.code = le.country_code
        WHERE  le.tenant_id = ${tenantId}::uuid
          AND  le.status    = 'active'
        ORDER  BY le.code
      `.execute(db);
      res.json(rows.rows);
    } catch (err) { logger?.error("finance_entities_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/master/charts ────────────────────────────────────────
  // ── GET /api/finance/master/ledger-books ─────────────────────────────────
  router.get("/finance/master/ledger-books", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const scopeType = ((req.query["scopeType"] as string | undefined) ?? "").trim();
      const scopeId = ((req.query["scopeId"] as string | undefined) ?? "").trim();
      let companyIds: string[] | null = null;

      if (scopeType || scopeId) {
        if (!scopeType || !["company", "legal_entity", "group"].includes(scopeType) || !scopeId) {
          res.status(400).json({ error: "scopeType and scopeId are required together" });
          return;
        }
        const companies = await resolveCompanyIds(db, tenantId, { scopeType, scopeId });
        companyIds = companies.map((company) => company.company_code_id);
        if (companyIds.length === 0) { res.json([]); return; }
      }

      if (companyIds) {
        const { rows } = await sql<{
          id: string;
          code: string;
          name: string;
          category: string | null;
          reportingStandard: string | null;
          baseCurrencyCode: string | null;
          isPrimary: boolean;
        }>`
          SELECT
            lb.id,
            lb.code,
            lb.name,
            lb.category,
            lb.reporting_standard AS "reportingStandard",
            lb.base_currency_code AS "baseCurrencyCode",
            lb.is_primary         AS "isPrimary"
          FROM master.ledger_book lb
          JOIN master.company_code_book_assignment ba
            ON ba.book_id = lb.id
           AND ba.tenant_id = lb.tenant_id
          WHERE lb.tenant_id = ${tenantId}::uuid
            AND lb.is_active = true
            AND ba.is_active = true
            AND ba.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
            AND (ba.effective_to IS NULL OR ba.effective_to >= CURRENT_DATE)
          GROUP BY lb.id, lb.code, lb.name, lb.category, lb.reporting_standard, lb.base_currency_code, lb.is_primary, lb.sort_order
          ORDER BY lb.is_primary DESC, MIN(ba.priority), lb.sort_order, lb.code
        `.execute(db);
        res.json(rows);
        return;
      }

      const { rows } = await sql<{
        id: string;
        code: string;
        name: string;
        category: string | null;
        reportingStandard: string | null;
        baseCurrencyCode: string | null;
        isPrimary: boolean;
      }>`
        SELECT
          lb.id,
          lb.code,
          lb.name,
          lb.category,
          lb.reporting_standard AS "reportingStandard",
          lb.base_currency_code AS "baseCurrencyCode",
          lb.is_primary         AS "isPrimary"
        FROM master.ledger_book lb
        WHERE lb.tenant_id = ${tenantId}::uuid
          AND lb.is_active = true
        ORDER BY lb.is_primary DESC, lb.sort_order, lb.code
      `.execute(db);
      res.json(rows);
    } catch (err) { logger?.error("finance_ledger_books_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  router.get("/finance/master/charts", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }
      const rows = await sql<{
        id: string; code: string; name: string;
        framework: string; country: string | null;
        version: number; isLocked: boolean;
        accountCount: number; assignmentCount: number;
        tier: "group" | "operating" | "local";
      }>`
        SELECT
          coa.id,
          coa.code,
          coa.name,
          coa.framework,
          coa.country_code      AS country,
          coa.version,
          coa.is_locked         AS "isLocked",
          COUNT(ga.id) FILTER (
            WHERE ga.node_type = 'posting'
              AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
          ) AS "accountCount",
          COUNT(DISTINCT asgn.company_code_id)                  AS "assignmentCount",
          CASE
            WHEN bool_or(asgn.assignment_type = 'group')     THEN 'group'
            WHEN bool_or(asgn.assignment_type = 'operating') THEN 'operating'
            ELSE 'local'
          END AS tier
        FROM   master.chart_of_account coa
        LEFT   JOIN master.gl_account ga
               ON  ga.chart_of_account_id = coa.id
               AND ga.tenant_id           = coa.tenant_id
        LEFT   JOIN master.company_code_chart_assignment asgn
               ON  asgn.chart_of_account_id = coa.id
               AND asgn.tenant_id           = coa.tenant_id
               AND asgn.status              = 'active'
        WHERE  coa.tenant_id = ${tenantId}::uuid
          AND  coa.status    = 'active'
          AND  COALESCE((coa.metadata->>'_selectable')::boolean, true) = true
        GROUP  BY coa.id
        ORDER  BY coa.code
      `.execute(db);
      res.json(rows.rows);
    } catch (err) { logger?.error("finance_charts_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/master/charts/:chartCode/accounts ────────────────────
  router.get("/finance/master/charts/:chartCode/accounts", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }
      const chartCode = req.params["chartCode"] as string;
      if (!chartCode?.trim()) { res.status(400).json({ error: "chartCode is required" }); return; }
      const rows = await sql<{
        id: string; code: string; name: string; parentId: string | null;
        level: number; accountClass: string; nodeType: string;
        normalBalance: string; subledgerType: string | null;
      }>`
        SELECT
          ga.id,
          ga.code,
          ga.name,
          ga.parent_id       AS "parentId",
          ga.level_no        AS level,
          ga.account_class   AS "accountClass",
          ga.node_type       AS "nodeType",
          ga.normal_balance  AS "normalBalance",
          ga.subledger_type  AS "subledgerType"
        FROM   master.gl_account ga
        JOIN   master.chart_of_account coa ON coa.id = ga.chart_of_account_id
        WHERE  ga.tenant_id  = ${tenantId}::uuid
          AND  coa.code      = ${chartCode}
          AND  ga.status     = 'active'
        ORDER  BY ga.path, ga.code
      `.execute(db);
      res.json(rows.rows);
    } catch (err) { logger?.error("finance_accounts_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/accounts/search?q=&node_type=&limit= ─────────────────
  // Searches master.gl_account by code ILIKE or name ILIKE within the tenant.
  // ?q         search term (required, min 1 char)
  // ?node_type posting | header (default: posting — only leaf accounts)
  // ?limit     max results (default 10, max 50)

  router.get("/finance/accounts/search", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ data: [] }); return; }

      const q        = ((req.query["q"]         as string | undefined) ?? "").trim();
      const nodeType = ((req.query["node_type"] as string | undefined) ?? "posting").trim();
      const limit    = Math.min(50, Math.max(1, Number(req.query["limit"] ?? 10)));

      if (!q) { res.json({ data: [] }); return; }

      const pattern = `%${q}%`;
      const rows = await sql<{ id: string; code: string; name: string; account_class: string; normal_balance: string; node_type: string }>`
        SELECT ga.id, ga.code, ga.name, ga.account_class, ga.normal_balance, ga.node_type
        FROM   master.gl_account ga
        WHERE  ga.tenant_id = ${tenantId}::uuid
          AND  ga.status    = 'active'
          AND  (${nodeType} = '' OR ga.node_type = ${nodeType})
          AND  (${nodeType} <> 'posting' OR COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true)
          AND  (ga.code ILIKE ${pattern} OR ga.name ILIKE ${pattern})
        ORDER  BY ga.code
        LIMIT  ${limit}
      `.execute(db);

      res.json({ data: rows.rows });
    } catch (err) { logger?.error("finance_accounts_search_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/tax-groups/search?q=&category=&id=&limit= ────────────
  // Searches control.tax_group through its active rate schedules so callers can
  // pick the group ID that invoice tax calculation expects.
  router.get("/finance/tax-groups/search", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ data: [] }); return; }

      const q        = ((req.query["q"]        as string | undefined) ?? "").trim();
      const id       = ((req.query["id"]       as string | undefined) ?? "").trim();
      // term_type filter (lowercase): 'tax' | 'withholding' | 'charge'
      // Back-compat: accept legacy uppercase 'category' query param values.
      const rawCat   = ((req.query["term_type"] as string | undefined)
                        ?? (req.query["category"] as string | undefined)
                        ?? "").trim().toLowerCase();
      const termType = rawCat === "indirect" || rawCat === "surcharge" || rawCat === "customs_duty"
                         ? "tax"
                         : rawCat === "withholding"
                           ? "withholding"
                           : rawCat;
      const limit    = Math.min(50, Math.max(1, Number(req.query["limit"] ?? 10)));
      const pattern  = `%${q}%`;
      const idFilter = id || null;

      const rows = await sql<{
        id: string; code: string; name: string; description: string | null;
        term_type: string | null; rate_value: string | null; tax_type_code: string | null;
      }>`
        SELECT DISTINCT ON (tg.id)
          tg.id,
          tg.code,
          tg.name,
          tg.description,
          CASE tt.tax_class
            WHEN 'withholding' THEN 'withholding'
            WHEN 'customs' THEN 'charge'
            ELSE 'tax'
          END AS term_type,
          trs.rate_value,
          tt.code AS tax_type_code
        FROM control.tax_group tg
        JOIN control.tax_group_component tgc
          ON  tgc.tax_group_id = tg.id
          AND tgc.tenant_id    = tg.tenant_id
          AND tgc.is_active    = true
        JOIN control.tax_rate_schedule trs
          ON  trs.id        = tgc.tax_rate_schedule_id
          AND trs.tenant_id = tgc.tenant_id
          AND trs.is_active = true
        JOIN master.tax_type tt
          ON  tt.id        = trs.tax_type_id
          AND tt.tenant_id = trs.tenant_id
          AND tt.status    = 'active'
        WHERE tg.tenant_id = ${tenantId}::uuid
          AND tg.status    = 'active'
          AND (${idFilter}::uuid IS NULL OR tg.id = ${idFilter}::uuid)
          AND (
            ${termType} = ''
            OR CASE tt.tax_class
                 WHEN 'withholding' THEN 'withholding'
                 WHEN 'customs' THEN 'charge'
                 ELSE 'tax'
               END = ${termType}
          )
          AND (
            tt.tax_class = 'withholding'
            OR trs.tax_direction IN ('PURCHASE', 'BOTH')
            OR trs.wht_basis IS NOT NULL
          )
          AND (
            ${q} = ''
            OR tg.code ILIKE ${pattern}
            OR tg.name ILIKE ${pattern}
            OR COALESCE(tg.description, '') ILIKE ${pattern}
            OR tt.code ILIKE ${pattern}
            OR tt.name ILIKE ${pattern}
          )
        ORDER BY tg.id, tgc.calculation_seq
        LIMIT ${limit}
      `.execute(db);

      res.json({ data: rows.rows });
    } catch (err) { logger?.error("finance_tax_groups_search_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/master/controls?companyCode= ─────────────────────────
  router.get("/finance/master/controls", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }
      const companyCode = (req.query["companyCode"] as string | undefined)?.trim();
      if (!companyCode) { res.status(400).json({ error: "companyCode is required" }); return; }
      const rows = await sql<{
        companyCode: string; accountCode: string; accountName: string;
        accountClass: string; subledgerType: string | null;
        postingAllowed: boolean; blockedForManual: boolean; blockedForAuto: boolean;
        requiresCostCenter: boolean; requiresProfitCenter: boolean; requiresProject: boolean;
        defaultCostCenter: string | null; taxTreatment: string | null;
        reconciliation: string | null;
      }>`
        SELECT
          cc.code                    AS "companyCode",
          ga.code                    AS "accountCode",
          ga.name                    AS "accountName",
          ga.account_class           AS "accountClass",
          ga.subledger_type          AS "subledgerType",
          ccga.posting_allowed       AS "postingAllowed",
          ccga.blocked_for_manual    AS "blockedForManual",
          ccga.blocked_for_auto      AS "blockedForAuto",
          ccga.requires_cost_center  AS "requiresCostCenter",
          ccga.requires_profit_center AS "requiresProfitCenter",
          ccga.requires_project      AS "requiresProject",
          cst.code                   AS "defaultCostCenter",
          ccga.tax_category          AS "taxTreatment",
          ccga.reconciliation_type   AS "reconciliation"
        FROM   master.company_code_gl_account ccga
        JOIN   master.gl_account ga      ON ga.id = ccga.gl_account_id
        JOIN   master.company_code cc    ON cc.id = ccga.company_code_id
        LEFT   JOIN master.cost_center cst
               ON  cst.id = ccga.default_cost_center_id
               AND cst.tenant_id = ccga.tenant_id
        WHERE  ccga.tenant_id = ${tenantId}::uuid
          AND  cc.code        = ${companyCode}
          AND  ccga.status    = 'active'
        ORDER  BY ga.code
      `.execute(db);
      res.json(rows.rows);
    } catch (err) { logger?.error("finance_controls_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/period-status ────────────────────────────────────────
  router.get("/finance/period-status", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json([]); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      let fpQuery = db
        .selectFrom("master.fiscal_period as fp")
        .select(["fp.company_code_id", "fp.fiscal_year", "fp.period_number",
          "fp.status as fiscalPeriodStatus",
          "fp.opened_at as openedAt", "fp.soft_closed_at as softClosedAt",
          "fp.hard_closed_at as hardClosedAt"])
        .where("fp.tenant_id", "=", tenantId)
        .where("fp.company_code_id", "in", companyIds)
        .where("fp.fiscal_year", "=", parsed.fiscalYear);
      if (parsed.period !== null) fpQuery = fpQuery.where("fp.period_number", "=", parsed.period);

      const fpRows = await fpQuery.execute() as Array<{
        company_code_id: string; fiscal_year: number; period_number: number;
        fiscalPeriodStatus: FiscalPeriodStatus; openedAt: string | null;
        softClosedAt: string | null; hardClosedAt: string | null;
      }>;

      const bpsMap = new Map<string, FiscalPeriodStatus>();
      if (parsed.bookId) {
        let bpsQ = db
          .selectFrom("governance.book_period_status as bps")
          .select(["bps.company_code_id", "bps.fiscal_year", "bps.period_number",
            "bps.status as bookPeriodStatus"])
          .where("bps.tenant_id", "=", tenantId)
          .where("bps.company_code_id", "in", companyIds)
          .where("bps.book_id", "=", parsed.bookId)
          .where("bps.fiscal_year", "=", parsed.fiscalYear);
        if (parsed.period !== null) bpsQ = bpsQ.where("bps.period_number", "=", parsed.period);
        const bpsRows = await bpsQ.execute() as Array<{
          company_code_id: string; fiscal_year: number; period_number: number; bookPeriodStatus: FiscalPeriodStatus;
        }>;
        for (const r of bpsRows) bpsMap.set(`${r.company_code_id}:${r.fiscal_year}:${r.period_number}`, r.bookPeriodStatus);
      }

      const STATUS_RANK: Record<FiscalPeriodStatus, number> = { hard_close: 4, soft_close: 3, future: 2, open: 1 };
      const ccMap = new Map(companies.map((c) => [c.company_code_id, c.company_code]));
      const result = fpRows.map((fp) => {
        const key = `${fp.company_code_id}:${fp.fiscal_year}:${fp.period_number}`;
        const rawBookStatus = bpsMap.get(key) ?? null;
        const bookStatus = parsed.bookId ? (rawBookStatus ?? "future") : null;
        const bookPeriodStatusSource = !parsed.bookId
          ? "not_requested"
          : rawBookStatus
            ? "row"
            : "missing_treated_as_future";
        const periodGateDecision = decidePeriodGate({
          fiscalPeriodStatus: fp.fiscalPeriodStatus,
          bookPeriodStatus: parsed.bookId ? rawBookStatus : null,
        });
        const postability = periodGateDecision.allowed
          ? (fp.fiscalPeriodStatus === "soft_close" || bookStatus === "soft_close" ? "adjustment_only" : "postable")
          : (fp.fiscalPeriodStatus === "hard_close" || bookStatus === "hard_close" ? "read_only" : "locked");
        const fpRank  = STATUS_RANK[fp.fiscalPeriodStatus] ?? 0;
        const bpsRank = bookStatus ? (STATUS_RANK[bookStatus] ?? 0) : 0;
        const effectiveStatus = fpRank >= bpsRank ? fp.fiscalPeriodStatus : bookStatus;
        return {
          companyCode: ccMap.get(fp.company_code_id) ?? fp.company_code_id,
          fiscalYear: fp.fiscal_year, periodNumber: fp.period_number,
          fiscalPeriodStatus: fp.fiscalPeriodStatus, bookPeriodStatus: bookStatus,
          bookPeriodStatusSource,
          effectiveStatus,
          periodGateDecision,
          postability,
          postabilityReasonCode: periodGateDecision.reason,
          openedAt: fp.openedAt,
          softClosedAt: fp.softClosedAt, hardClosedAt: fp.hardClosedAt,
        };
      });
      res.json(result);
    } catch (err) { logger?.error("finance_period_status_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/trial-balance ────────────────────────────────────────
  // Reads from ledger.gl_balance (pre-aggregated PostingService store).
  router.get("/finance/trial-balance", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ rows: [], asAt: new Date().toISOString(), isLive: true }); return; }
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ rows: [], asAt: new Date().toISOString(), isLive: true }); return; }

      const balances = await fetchGlBalances(db, tenantId, companies.map((c) => c.company_code_id), parsed);
      const ccMap = new Map(companies.map((c) => [c.company_code_id, c.company_code]));

      // Determine isLive: period is live unless hard_closed
      const periodStatuses = await db
        .selectFrom("master.fiscal_period as fp")
        .select("fp.status")
        .where("fp.tenant_id", "=", tenantId)
        .where("fp.company_code_id", "in", companies.map((c) => c.company_code_id))
        .where("fp.fiscal_year", "=", parsed.fiscalYear)
        .$if(parsed.period !== null, (qb) => qb.where("fp.period_number", "=", parsed.period as number))
        .execute() as Array<{ status: string }>;
      const isLive = periodStatuses.some((p) => p.status !== "hard_close");

      const rows = balances.map((b) => ({
        companyCode:     ccMap.get(companies[0]?.company_code_id ?? "") ?? "",
        accountCode:     b.accountCode,
        accountName:     b.accountName,
        accountClass:    b.accountClass,
        openingDebit:    b.openingDebit,
        openingCredit:   b.openingCredit,
        movementDebit:   b.movementDebit,
        movementCredit:  b.movementCredit,
        closingDebit:    b.closingDebit,
        closingCredit:   b.closingCredit,
        closingBalance:  b.net,
      }));

      res.json({ rows, asAt: new Date().toISOString(), isLive });
    } catch (err) { logger?.error("finance_trial_balance_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/gl-detail ────────────────────────────────────────────
  // GL ledger card: reads document.journal_line (individual postings).
  router.get("/finance/gl-detail", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const accountCode = (req.query["accountCode"] as string | undefined)?.trim();
      if (!accountCode) { res.status(400).json({ error: "accountCode is required" }); return; }

      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.status(404).json({ error: "No companies found for scope" }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const account = await db
        .selectFrom("master.gl_account as ga")
        .select(["ga.id", "ga.code", "ga.name", "ga.account_class as accountClass"])
        .where("ga.tenant_id", "=", tenantId)
        .where("ga.code", "=", accountCode)
        .executeTakeFirst() as { id: string; code: string; name: string; accountClass: string } | undefined;
      if (!account) { res.status(404).json({ error: `Account ${accountCode} not found` }); return; }

      // Opening balance from gl_balance (prior period or period 0)
      const openingBalance = await (async () => {
        if (parsed.period === null || parsed.period === 0) return 0;
        const row = await db
          .selectFrom("ledger.gl_balance as glb")
          .select([
            db.fn.sum("glb.opening_debit").as("od"),
            db.fn.sum("glb.opening_credit").as("oc"),
          ])
          .where("glb.tenant_id", "=", tenantId)
          .where("glb.company_code_id", "in", companyIds)
          .where("glb.gl_account_id", "=", account.id)
          .where("glb.fiscal_year", "=", parsed.fiscalYear)
          .where("glb.period_number", "=", parsed.period)
          .$if(!!parsed.bookId, (qb) => qb.where("glb.book_id", "=", parsed.bookId as string))
          .executeTakeFirst() as { od: string | null; oc: string | null } | undefined;
        return parseFloat(row?.od ?? "0") - parseFloat(row?.oc ?? "0");
      })();

      // Individual journal lines for the period
      let linesQuery = db
        .selectFrom("document.journal_line as jl")
        .innerJoin("document.journal_entry as je", "je.id", "jl.journal_entry_id")
        .select([
          "je.id as journalEntryId", "jl.id as journalLineId",
          "je.je_number as entryNumber", "je.description as narration",
          "je.source_doc_type as sourceDocType",
          "je.posting_date as postingDate",
          "jl.base_debit as debitAmount", "jl.base_credit as creditAmount",
          "je.posted_at as postedAt", "je.posted_by as postedBy",
        ])
        .where("jl.tenant_id", "=", tenantId)
        .where("jl.company_code_id", "in", companyIds)
        .where("jl.gl_account_id", "=", account.id)
        .where("jl.fiscal_year", "=", parsed.fiscalYear)
        .orderBy("je.posting_date", "asc")
        .orderBy("je.je_number", "asc");

      if (parsed.period !== null) {
        linesQuery = linesQuery.where("jl.period_number", "=", parsed.period) as typeof linesQuery;
      }
      if (parsed.bookId) {
        linesQuery = linesQuery.where("jl.book_id", "=", parsed.bookId) as typeof linesQuery;
      }
      if (parsed.transactionCurrency) {
        linesQuery = linesQuery.where("jl.transaction_currency", "=", parsed.transactionCurrency) as typeof linesQuery;
      }

      const lines = await linesQuery.execute() as Array<Record<string, unknown>>;
      let running = openingBalance;
      const linesWithRunning = lines.map((line) => {
        const d = parseFloat(String(line["debitAmount"]  ?? "0"));
        const c = parseFloat(String(line["creditAmount"] ?? "0"));
        running += d - c;
        return {
          journalEntryId: line["journalEntryId"], journalLineId: line["journalLineId"],
          companyCode: companies[0]?.company_code ?? "",
          postingDate: line["postingDate"], entryNumber: line["entryNumber"],
          narration: line["narration"] ?? null, sourceDocType: line["sourceDocType"] ?? null,
          sourceDocRef: null, costCenter: null, project: null,
          debitAmount: d, creditAmount: c, runningBalance: running,
          postedAt: line["postedAt"], postedBy: line["postedBy"] ?? null,
        };
      });

      res.json({
        accountCode: account.code, accountName: account.name, accountClass: account.accountClass,
        openingBalance, closingBalance: running,
        lines: linesWithRunning, asAt: new Date().toISOString(), isLive: true,
      });
    } catch (err) { logger?.error("finance_gl_detail_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/statements/balance-sheet ─────────────────────────────
  router.get("/finance/statements/balance-sheet", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const dateRange = parseStatementDateRange(req.query as Record<string, unknown>);
      if (dateRange && "error" in dateRange) { res.status(400).json({ error: dateRange.error }); return; }
      const groupBy = parseStatementGroupBy(req.query as Record<string, unknown>);
      if (typeof groupBy !== "string") { res.status(400).json({ error: groupBy.error }); return; }
      const accumulatedValues = parseStatementAccumulatedValues(req.query as Record<string, unknown>);
      if (typeof accumulatedValues !== "boolean") { res.status(400).json({ error: accumulatedValues.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json(emptyBalanceSheet()); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      if (dateRange) {
        const bucketCompanyId = companyIds[0];
        if (!bucketCompanyId) { res.json(emptyBalanceSheet()); return; }
        if (groupBy === "none") {
          const bucket = await buildSingleDateRangeBucket(db, tenantId, bucketCompanyId, dateRange);
          const payload = await buildBalanceSheetDateRangePayload(
            db,
            tenantId,
            companyIds,
            parsed,
            [bucket],
            dateRange,
            accumulatedValues,
          );
          res.json(omitBucketColumns(payload));
          return;
        }
        const buckets = await buildStatementDateBuckets(db, tenantId, bucketCompanyId, dateRange, groupBy);
        res.json(await buildBalanceSheetDateRangePayload(
          db,
          tenantId,
          companyIds,
          parsed,
          buckets,
          dateRange,
          accumulatedValues,
        ));
        return;
      }

      if (groupBy !== "none") {
        const bucketCompanyId = companyIds[0];
        if (!bucketCompanyId) { res.json(emptyBalanceSheet()); return; }
        const buckets = await buildStatementFiscalBuckets(db, tenantId, bucketCompanyId, parsed, groupBy);
        res.json(await buildBalanceSheetDateRangePayload(
          db,
          tenantId,
          companyIds,
          parsed,
          buckets,
          null,
          accumulatedValues,
        ));
        return;
      }

      const balances = await fetchGlBalances(db, tenantId, companyIds, parsed);
      const priorBalances = parsed.comparative
        ? await fetchGlBalances(db, tenantId, companyIds, { ...parsed, fiscalYear: parsed.fiscalYear - 1 })
        : [];
      const priorMap = new Map(priorBalances.map((r) => [r.accountCode, r]));

      const bsBalances = balances.filter((r) => ["asset", "liability", "equity"].includes(r.accountClass));
      const grouped = buildSections(bsBalances, priorMap);

      const assets     = grouped.asset ?? [];
      const liabilities = grouped.liability ?? [];
      const equity     = grouped.equity ?? [];

      res.json({
        assets, liabilities, equity,
        totalAssets:      sumSections(assets),
        totalLiabilities: sumSections(liabilities),
        totalEquity:      sumSections(equity),
        totalLiabilitiesAndEquity: sumSections(liabilities) + sumSections(equity),
        asAt: new Date().toISOString(), isLive: true,
        priorTotalAssets:      sumSectionsPrior(assets),
        priorTotalLiabilities: sumSectionsPrior(liabilities),
        priorTotalEquity:      sumSectionsPrior(equity),
      });
    } catch (err) { logger?.error("finance_balance_sheet_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/statements/profit-loss ───────────────────────────────
  router.get("/finance/statements/profit-loss", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const dateRange = parseStatementDateRange(req.query as Record<string, unknown>);
      if (dateRange && "error" in dateRange) { res.status(400).json({ error: dateRange.error }); return; }
      const groupBy = parseStatementGroupBy(req.query as Record<string, unknown>);
      if (typeof groupBy !== "string") { res.status(400).json({ error: groupBy.error }); return; }
      const accumulatedValues = parseStatementAccumulatedValues(req.query as Record<string, unknown>);
      if (typeof accumulatedValues !== "boolean") { res.status(400).json({ error: accumulatedValues.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json(emptyProfitLoss()); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      if (dateRange) {
        const bucketCompanyId = companyIds[0];
        if (!bucketCompanyId) { res.json(emptyProfitLoss()); return; }
        if (groupBy === "none") {
          const bucket = await buildSingleDateRangeBucket(db, tenantId, bucketCompanyId, dateRange);
          const payload = await buildProfitLossDateRangePayload(
            db,
            tenantId,
            companyIds,
            parsed,
            [bucket],
            dateRange,
            accumulatedValues,
          );
          res.json(omitBucketColumns(payload));
          return;
        }
        const buckets = await buildStatementDateBuckets(db, tenantId, bucketCompanyId, dateRange, groupBy);
        res.json(await buildProfitLossDateRangePayload(
          db,
          tenantId,
          companyIds,
          parsed,
          buckets,
          dateRange,
          accumulatedValues,
        ));
        return;
      }

      if (groupBy !== "none") {
        const bucketCompanyId = companyIds[0];
        if (!bucketCompanyId) { res.json(emptyProfitLoss()); return; }
        const buckets = await buildStatementFiscalBuckets(db, tenantId, bucketCompanyId, parsed, groupBy);
        res.json(await buildProfitLossDateRangePayload(
          db,
          tenantId,
          companyIds,
          parsed,
          buckets,
          null,
          accumulatedValues,
        ));
        return;
      }

      const balances = await fetchGlBalances(db, tenantId, companyIds, parsed);
      let priorBalances = parsed.comparative
        ? await fetchGlBalances(db, tenantId, companyIds, { ...parsed, fiscalYear: parsed.fiscalYear - 1 })
        : [];
      let plBalances = balances
        .map(normalizeProfitLossBalance)
        .filter((r): r is GlBalance => r !== null);
      let priorPlBalances = priorBalances
        .map(normalizeProfitLossBalance)
        .filter((r): r is GlBalance => r !== null);

      if (plBalances.length === 0) {
        const liveBalances = await fetchLiveGlBalancesFromJournalLines(db, tenantId, companyIds, parsed);
        const livePlBalances = liveBalances
          .map(normalizeProfitLossBalance)
          .filter((r): r is GlBalance => r !== null);
        if (livePlBalances.length > 0) {
          plBalances = livePlBalances;
          if (parsed.comparative) {
            priorBalances = await fetchLiveGlBalancesFromJournalLines(
              db,
              tenantId,
              companyIds,
              { ...parsed, fiscalYear: parsed.fiscalYear - 1 },
            );
            priorPlBalances = priorBalances
              .map(normalizeProfitLossBalance)
              .filter((r): r is GlBalance => r !== null);
          }
        }
      }

      const priorMap = new Map(priorPlBalances.map((r) => [r.accountCode, r]));
      const grouped = buildSections(plBalances, priorMap);

      const revenue  = grouped.revenue ?? [];
      const expenses = grouped.expense ?? [];
      const totalRevenue  = sumSections(revenue);
      const totalExpenses = sumSections(expenses);
      const priorRev  = sumSectionsPrior(revenue);
      const priorExp  = sumSectionsPrior(expenses);

      res.json({
        revenue, costOfSales: [], grossProfit: totalRevenue,
        operatingExpenses: expenses, operatingProfit: totalRevenue - totalExpenses,
        otherIncome: [], otherExpenses: [], netProfit: totalRevenue - totalExpenses,
        asAt: new Date().toISOString(), isLive: true,
        priorGrossProfit: priorRev,
        priorOperatingProfit: priorRev !== undefined && priorExp !== undefined ? priorRev - priorExp : undefined,
        priorNetProfit: priorRev !== undefined && priorExp !== undefined ? priorRev - priorExp : undefined,
      });
    } catch (err) { logger?.error("finance_profit_loss_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  return router;
}

function emptyBalanceSheet() {
  return {
    assets: [], liabilities: [], equity: [],
    totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalLiabilitiesAndEquity: 0,
    asAt: new Date().toISOString(), isLive: true,
  };
}
function emptyProfitLoss() {
  return {
    revenue: [], costOfSales: [], grossProfit: 0, operatingExpenses: [], operatingProfit: 0,
    otherIncome: [], otherExpenses: [], netProfit: 0, asAt: new Date().toISOString(), isLive: true,
  };
}
