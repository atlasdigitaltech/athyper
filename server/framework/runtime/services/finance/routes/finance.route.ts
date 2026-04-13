/**
 * Finance Routes — read-model endpoints for the GL Workbench
 *
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

export interface FinanceRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Scope params ──────────────────────────────────────────────────────────────

export interface ScopeParams {
  scopeType: string;
  scopeId: string;
  fiscalYear: number;
  period: number | null;
  bookId: string | null;
  currency: string | null;
  comparative: boolean;
}

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
    bookId:     (query["bookId"]   as string | undefined) ?? null,
    currency:   (query["currency"] as string | undefined) ?? null,
    comparative: query["comparative"] === "true",
  };
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

  const rows = await query.execute() as Array<{
    accountCode: string;
    accountName: string;
    accountClass: string;
    openingDebit: string;
    openingCredit: string;
    movementDebit: string;
    movementCredit: string;
    closingDebit: string;
    closingCredit: string;
  }>;

  return rows.map((r) => {
    const cd = parseFloat(r.closingDebit  ?? "0");
    const cc = parseFloat(r.closingCredit ?? "0");
    return {
      accountCode:    r.accountCode,
      accountName:    r.accountName,
      accountClass:   r.accountClass,
      openingDebit:   parseFloat(r.openingDebit  ?? "0"),
      openingCredit:  parseFloat(r.openingCredit ?? "0"),
      movementDebit:  parseFloat(r.movementDebit  ?? "0"),
      movementCredit: parseFloat(r.movementCredit ?? "0"),
      closingDebit:   cd,
      closingCredit:  cc,
      net:            cd - cc,
    };
  });
}

// ── Grouping helpers for financial statements ─────────────────────────────────

interface StatementSectionShape {
  code: string;
  label: string;
  rows: Array<{ accountCode: string; accountName: string; current: number; prior?: number }>;
  total: number;
  priorTotal?: number;
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

// ── User company-access resolver ──────────────────────────────────────────────
// Returns the set of company_code UUIDs the caller may see.
// • allCompanies=true  → no restriction (user has at least one tenant-wide role)
// • allCompanies=false → restrict to allowedIds (may be empty → show all as fallback)
//
// Resolution path: JWT sub → principal_profile.keycloak_id → principal →
//   group_member → group_role.company_code_id

async function resolveUserCompanyAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  keycloakSub: string | null,
): Promise<{ allCompanies: boolean; allowedIds: string[] }> {
  if (!keycloakSub) return { allCompanies: true, allowedIds: [] };

  // Check if the user has any tenant-wide role (company_code_id IS NULL)
  const wideRow = await sql<{ has_wide: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM   master.principal_profile pp
      JOIN   master.principal          p  ON p.id = pp.principal_id AND p.tenant_id = ${tenantId}::uuid
      JOIN   master.group_member       gm ON gm.principal_id = p.id AND gm.tenant_id = ${tenantId}::uuid
      JOIN   master.group_role         gr ON gr.group_id = gm.group_id AND gr.tenant_id = ${tenantId}::uuid
      WHERE  pp.keycloak_id        = ${keycloakSub}
        AND  pp.tenant_id          = ${tenantId}::uuid
        AND  gr.company_code_id   IS NULL
        AND  gr.status             = 'active'
    ) AS has_wide
  `.execute(db);

  if (wideRow.rows[0]?.has_wide) return { allCompanies: true, allowedIds: [] };

  // Collect company-specific grants
  const ccRows = await sql<{ company_code_id: string }>`
    SELECT DISTINCT gr.company_code_id
    FROM   master.principal_profile pp
    JOIN   master.principal          p  ON p.id = pp.principal_id AND p.tenant_id = ${tenantId}::uuid
    JOIN   master.group_member       gm ON gm.principal_id = p.id AND gm.tenant_id = ${tenantId}::uuid
    JOIN   master.group_role         gr ON gr.group_id = gm.group_id AND gr.tenant_id = ${tenantId}::uuid
    WHERE  pp.keycloak_id        = ${keycloakSub}
      AND  pp.tenant_id          = ${tenantId}::uuid
      AND  gr.company_code_id   IS NOT NULL
      AND  gr.status             = 'active'
  `.execute(db);

  return { allCompanies: false, allowedIds: ccRows.rows.map((r) => r.company_code_id) };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createFinanceRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

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
      const access = await resolveUserCompanyAccess(db, tenantId, userSub);

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
        parentEntityId: string | null; countryCode: string;
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
        WHERE  le.tenant_id = ${tenantId}::uuid
          AND  le.status    = 'active'
        ORDER  BY le.code
      `.execute(db);
      res.json(rows.rows);
    } catch (err) { logger?.error("finance_entities_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/master/charts ────────────────────────────────────────
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
          COUNT(ga.id) FILTER (WHERE ga.node_type = 'posting') AS "accountCount",
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
        fiscalPeriodStatus: string; openedAt: string | null;
        softClosedAt: string | null; hardClosedAt: string | null;
      }>;

      const bpsMap = new Map<string, string>();
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
          company_code_id: string; fiscal_year: number; period_number: number; bookPeriodStatus: string;
        }>;
        for (const r of bpsRows) bpsMap.set(`${r.company_code_id}:${r.fiscal_year}:${r.period_number}`, r.bookPeriodStatus);
      }

      const STATUS_RANK: Record<string, number> = { hard_close: 4, soft_close: 3, future: 2, open: 1 };
      const ccMap = new Map(companies.map((c) => [c.company_code_id, c.company_code]));
      const result = fpRows.map((fp) => {
        const bookStatus = bpsMap.get(`${fp.company_code_id}:${fp.fiscal_year}:${fp.period_number}`) ?? null;
        const fpRank  = STATUS_RANK[fp.fiscalPeriodStatus] ?? 0;
        const bpsRank = bookStatus ? (STATUS_RANK[bookStatus] ?? 0) : 0;
        const effectiveStatus = fpRank >= bpsRank ? fp.fiscalPeriodStatus : bookStatus;
        return {
          companyCode: ccMap.get(fp.company_code_id) ?? fp.company_code_id,
          fiscalYear: fp.fiscal_year, periodNumber: fp.period_number,
          fiscalPeriodStatus: fp.fiscalPeriodStatus, bookPeriodStatus: bookStatus,
          effectiveStatus, openedAt: fp.openedAt,
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
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json(emptyBalanceSheet()); return; }
      const companyIds = companies.map((c) => c.company_code_id);

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
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json(emptyProfitLoss()); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const balances = await fetchGlBalances(db, tenantId, companyIds, parsed);
      const priorBalances = parsed.comparative
        ? await fetchGlBalances(db, tenantId, companyIds, { ...parsed, fiscalYear: parsed.fiscalYear - 1 })
        : [];
      const priorMap = new Map(priorBalances.map((r) => [r.accountCode, r]));

      const plBalances = balances.filter((r) => ["revenue", "expense"].includes(r.accountClass));
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
