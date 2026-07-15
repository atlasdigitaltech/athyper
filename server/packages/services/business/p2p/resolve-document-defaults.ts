/**
 * resolve-document-defaults — single source of truth for the NOT NULL system
 * fields P2P documents need before insert.
 *
 * Why this exists:
 *   Three write paths (the generic records create handler, the line-source
 *   `POST /api/p2p/receipts/from-commitment` route, and the P2P facade /
 *   from-commitment services) all need the same resolution for:
 *     - company_code_id + base_currency_code from master.company_code
 *     - fiscal_year + period_number from master.fiscal_period
 *     - document_no via control.next_entity_number
 *   Before the extraction the logic lived in two places, with a third
 *   already on the way (Plan E2 from-commitment expansions). One drift
 *   bug is enough to mis-post a GL period; this module is the audit
 *   anchor for the policy.
 *
 * Behaviour is intentionally identical to the original inline logic in:
 *   server/packages/services/records/routes/records.route.ts
 *     (§receipt|service_sheet|purchase_requisition branch)
 *   server/packages/services/records/routes/line-source.route.ts
 *     (receiptFromCommitmentHandler)
 *
 * AUDIT NOTE — fiscal_period resolution policy:
 *   resolveFiscalPeriod() defaults to STRICT mode: when no master.fiscal_-
 *   period row matches the document date, it returns
 *   { ok: false, reason: 'fiscal_period_missing' } so the caller can
 *   surface an actionable 422 to the user. The previous "warn + fallback
 *   to Gregorian UTC year+month" behaviour mis-bucketed posts for non-
 *   Gregorian tenants (4-4-5, 13-period retail, non-January start, lunar)
 *   because the period_gate trigger accepts dates under different period
 *   semantics.
 *
 *   Callers that explicitly need the permissive Gregorian fallback (e.g.
 *   the pre-prod demo flow, or a legacy import path running with a known
 *   Gregorian tenant) opt in via `mode: 'permissive'`. Every permissive
 *   fallback still emits a `fiscal_period_gregorian_fallback` warn log so
 *   the misconfiguration stays visible.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface BusinessLogger {
  warn(event: string, fields?: Record<string, unknown>): void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Company code + functional currency
// ──────────────────────────────────────────────────────────────────────────────

export interface ResolveCompanyAndCurrencyInput {
  tenantId:           string;
  /** When supplied, look up base_currency_code for this company_code_id.
   *  When null/undefined, pick the first active company_code for the tenant. */
  companyCodeIdHint?: string | null;
}

export interface ResolveCompanyAndCurrencyResult {
  /** null when no active company_code exists for the tenant. */
  companyCodeId:    string | null;
  /** null when the resolved company_code carries no functional_currency. */
  baseCurrencyCode: string | null;
}

export async function resolveCompanyAndBaseCurrency(
  db:    AnyDb,
  input: ResolveCompanyAndCurrencyInput,
): Promise<ResolveCompanyAndCurrencyResult> {
  const { tenantId, companyCodeIdHint } = input;

  if (companyCodeIdHint) {
    const row = await sql<{ functional_currency: string }>`
      SELECT functional_currency
        FROM master.company_code
       WHERE id        = ${companyCodeIdHint}::uuid
         AND tenant_id = ${tenantId}::uuid
       LIMIT 1
    `.execute(db);
    return {
      companyCodeId:    companyCodeIdHint,
      baseCurrencyCode: row.rows[0]?.functional_currency ?? null,
    };
  }

  const row = await sql<{ id: string; functional_currency: string }>`
    SELECT id, functional_currency
      FROM master.company_code
     WHERE tenant_id = ${tenantId}::uuid
       AND status    = 'active'
     ORDER BY created_at ASC
     LIMIT 1
  `.execute(db);
  if (!row.rows[0]) {
    return { companyCodeId: null, baseCurrencyCode: null };
  }
  return {
    companyCodeId:    row.rows[0].id,
    baseCurrencyCode: row.rows[0].functional_currency,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Fiscal period (with Gregorian fallback — see AUDIT NOTE at top)
// ──────────────────────────────────────────────────────────────────────────────

export type FiscalPeriodResolutionMode = "strict" | "permissive";

export interface ResolveFiscalPeriodInput {
  tenantId:        string;
  companyCodeId:   string;
  /** ISO date string (e.g. '2026-06-20'). The fiscal_period row whose
   *  start_date..end_date contains this date wins; ties broken by lowest
   *  period_number. */
  documentDate:    string;
  /** Resolution policy when no fiscal_period row matches the date.
   *  - 'strict'     (default) — return { ok:false, reason:'fiscal_period_missing' }
   *  - 'permissive' — derive fiscal_year/period_number from UTC year+month
   *                   and emit a warn log. Use only for tenants known to
   *                   run a Gregorian Jan-Dec fiscal calendar. */
  mode?:           FiscalPeriodResolutionMode;
  logger?:         BusinessLogger;
  /** Identifier appended to the Gregorian-fallback warn log so the source
   *  of the misconfiguration is greppable. */
  fallbackLogTag?: string;
  /** Extra fields merged into the Gregorian-fallback warn log (e.g.
   *  { entity: 'receipt' } so log searches narrow quickly). */
  fallbackLogFields?: Record<string, unknown>;
}

export type ResolveFiscalPeriodOutcome =
  | {
      ok:                  true;
      fiscalYear:          number;
      periodNumber:        number;
      /** 'fiscal_period' when a master.fiscal_period row matched;
       *  'gregorian_fallback' when no row matched and mode='permissive'. */
      source:              "fiscal_period" | "gregorian_fallback";
    }
  | {
      ok:                  false;
      reason:              "fiscal_period_missing";
      tenantId:            string;
      companyCodeId:       string;
      documentDate:        string;
    };

export async function resolveFiscalPeriod(
  db:    AnyDb,
  input: ResolveFiscalPeriodInput,
): Promise<ResolveFiscalPeriodOutcome> {
  const { tenantId, companyCodeId, documentDate } = input;

  const row = await sql<{ fiscal_year: number; period_number: number }>`
    SELECT fiscal_year, period_number
      FROM master.fiscal_period
     WHERE tenant_id       = ${tenantId}::uuid
       AND company_code_id = ${companyCodeId}::uuid
       AND period_number  BETWEEN 1 AND 12
       AND start_date     <= ${documentDate}::date
       AND end_date       >= ${documentDate}::date
     ORDER BY period_number ASC
     LIMIT 1
  `.execute(db);

  return applyFiscalPeriodPolicy(row.rows[0] ?? null, input);
}

/**
 * Pure policy function exposed for unit tests. Given a fiscal_period row
 * (or null when none matched) and the resolution input, returns the same
 * outcome `resolveFiscalPeriod` would. No DB access; logger is the only
 * side-effect channel.
 */
export function applyFiscalPeriodPolicy(
  row:   { fiscal_year: number; period_number: number } | null,
  input: ResolveFiscalPeriodInput,
): ResolveFiscalPeriodOutcome {
  const { tenantId, companyCodeId, documentDate, logger,
          mode = "strict",
          fallbackLogTag = "fiscal_period_gregorian_fallback",
          fallbackLogFields = {} } = input;

  if (row) {
    return {
      ok:           true,
      fiscalYear:   row.fiscal_year,
      periodNumber: row.period_number,
      source:       "fiscal_period",
    };
  }

  if (mode === "strict") {
    return {
      ok:            false,
      reason:        "fiscal_period_missing",
      tenantId,
      companyCodeId,
      documentDate,
    };
  }

  // permissive — Gregorian fallback with audit log.
  const d            = new Date(documentDate);
  const fiscalYear   = d.getUTCFullYear();
  const periodNumber = d.getUTCMonth() + 1;

  logger?.warn(fallbackLogTag, {
    tenantId,
    companyCodeId,
    documentDate,
    fallbackFiscalYear: fiscalYear,
    fallbackPeriodNumber: periodNumber,
    ...fallbackLogFields,
  });

  return { ok: true, fiscalYear, periodNumber, source: "gregorian_fallback" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Document number allocation
// ──────────────────────────────────────────────────────────────────────────────

export interface AllocateDocumentNumberInput {
  tenantId:        string;
  /** Entity code as registered in control.entity (e.g. 'receipt'). */
  entityCode:      string;
  /** Numbering-field key on control.entity_numbering_config. Defaults to
   *  'document_no' which is the canonical key used across P2P. */
  numberField?:    string;
  companyCodeId?:  string | null;
  fiscalYear?:     number | null;
  periodNumber?:   number | null;
  effectiveDate?:  string | Date | null;
  /** Prefix used when control.next_entity_number returns null (no series
   *  configured / RPC failure). Format: `${prefix}-YYYYMM-XXXXXX`. */
  fallbackPrefix:  string;
}

export async function allocateDocumentNumber(
  db:    AnyDb,
  input: AllocateDocumentNumberInput,
): Promise<string> {
  const {
    tenantId, entityCode, numberField = "document_no",
    companyCodeId = null, fiscalYear = null, periodNumber = null,
    effectiveDate = null, fallbackPrefix,
  } = input;

  let configured: string | null = null;
  try {
    const result = await sql<{ value: string | null }>`
      SELECT control.next_entity_number(
        ${tenantId}::uuid,
        ${entityCode}::text,
        ${numberField}::text,
        ${companyCodeId}::uuid,
        ${fiscalYear}::smallint,
        ${periodNumber}::smallint,
        NULL,
        ${effectiveDate}::date
      ) AS value
    `.execute(db);
    configured = result.rows[0]?.value ?? null;
  } catch {
    // Swallow — the fallback path below covers tenants without a series row.
  }

  if (configured) return configured;

  return buildFallbackDocumentNumber(fallbackPrefix);
}

/**
 * Pure function exposed for unit tests. Produces a stable-shaped fallback
 * document number when control.next_entity_number returned null. Format:
 * `${prefix}-YYYYMM-XXXXXX`. The randomness can be controlled in tests by
 * passing a deterministic randFn.
 */
export function buildFallbackDocumentNumber(
  prefix:  string,
  now?:    Date,
  randFn?: () => string,
): string {
  const ts     = now ?? new Date();
  const yyyymm = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}`;
  const rand   = (randFn ?? defaultRand)();
  return `${prefix}-${yyyymm}-${rand}`;
}

function defaultRand(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
