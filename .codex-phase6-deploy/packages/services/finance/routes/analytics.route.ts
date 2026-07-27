/**
 * Finance Analytics Routes
 *
 * GET /api/finance/dashboard/kpis    — session-company KPIs, no scope param
 * GET /api/finance/account-analysis  — period-by-period account movements (full FY)
 * GET /api/finance/statements/cash-flow — indirect cash flow statement
 *
 * All balance reads source from ledger.gl_balance (the pre-aggregated store).
 * Cash flow uses the indirect method: operating = income-statement movements +
 * working-capital changes; investing = non-current asset changes;
 * financing = debt + equity changes.  Opening/closing cash from subledger_type='bank'.
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import { verifyBearer, resolveTenantId } from "@athyper/svc-shared";
import {
  type FinanceRouteDeps,
  parseScopeParams,
  resolveCompanyIds,
} from "./finance.route.js";

export function createAnalyticsRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /api/finance/dashboard/kpis ──────────────────────────────────────────
  // No scope param. Resolves session default (first active) company + current period.
  router.get("/finance/dashboard/kpis", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const empty = {
        revenueMtd: null, expensesMtd: null,
        openAp: null, openAr: null, cashBalance: null,
        journalCount: null, period: null,
        asAt: new Date().toISOString(),
      };
      if (!tenantId) { res.json(empty); return; }

      // Session default company: first active company for tenant
      const company = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.id", "cc.code"])
        .where("cc.tenant_id", "=", tenantId)
        .where("cc.status", "=", "active")
        .orderBy("cc.code", "asc")
        .executeTakeFirst() as { id: string; code: string } | undefined;
      if (!company) { res.json(empty); return; }

      // Current period: most recent open/soft_close normal period
      const periodRow = await db
        .selectFrom("master.fiscal_period as fp")
        .select([
          "fp.fiscal_year as fiscalYear",
          "fp.period_number as periodNumber",
          "fp.start_date as startDate",
        ])
        .where("fp.tenant_id", "=", tenantId)
        .where("fp.company_code_id", "=", company.id)
        .where("fp.status", "in", ["open", "soft_close"])
        .where("fp.period_type", "=", "normal")
        .orderBy("fp.fiscal_year", "desc")
        .orderBy("fp.period_number", "desc")
        .executeTakeFirst() as { fiscalYear: number; periodNumber: number; startDate: string } | undefined;
      if (!periodRow) { res.json({ ...empty }); return; }

      const { fiscalYear, periodNumber, startDate } = periodRow;
      const ccId = company.id;

      // All KPI queries in parallel — each catches its own error to avoid
      // one missing table/data blocking the entire response.
      const [revenueRow, expenseRow, apRow, cashRow, journalRow] = await Promise.all([
        sql<{ total: string }>`
          SELECT COALESCE(SUM(glb.period_credit - glb.period_debit), 0) AS total
          FROM   ledger.gl_balance glb
          JOIN   master.gl_account ga ON ga.id = glb.gl_account_id
          WHERE  glb.tenant_id       = ${tenantId}::uuid
            AND  glb.company_code_id = ${ccId}::uuid
            AND  glb.fiscal_year     = ${fiscalYear}
            AND  glb.period_number   = ${periodNumber}
            AND  ga.account_class    = 'revenue'
        `.execute(db).then((r) => r.rows[0]).catch(() => null),

        sql<{ total: string }>`
          SELECT COALESCE(SUM(glb.period_debit - glb.period_credit), 0) AS total
          FROM   ledger.gl_balance glb
          JOIN   master.gl_account ga ON ga.id = glb.gl_account_id
          WHERE  glb.tenant_id       = ${tenantId}::uuid
            AND  glb.company_code_id = ${ccId}::uuid
            AND  glb.fiscal_year     = ${fiscalYear}
            AND  glb.period_number   = ${periodNumber}
            AND  ga.account_class    = 'expense'
        `.execute(db).then((r) => r.rows[0]).catch(() => null),

        sql<{ total: string }>`
          SELECT COALESCE(SUM(outstanding_amount), 0) AS total
          FROM   document.purchase_invoice
          WHERE  tenant_id       = ${tenantId}::uuid
            AND  company_code_id = ${ccId}::uuid
            AND  outstanding_amount > 0
            AND  status NOT IN ('cancelled', 'reversed', 'rejected', 'draft')
        `.execute(db).then((r) => r.rows[0]).catch(() => null),

        sql<{ closing_debit: string; closing_credit: string }>`
          SELECT
            COALESCE(SUM(glb.closing_debit),  0) AS closing_debit,
            COALESCE(SUM(glb.closing_credit), 0) AS closing_credit
          FROM   ledger.gl_balance glb
          JOIN   master.gl_account ga ON ga.id = glb.gl_account_id
          WHERE  glb.tenant_id       = ${tenantId}::uuid
            AND  glb.company_code_id = ${ccId}::uuid
            AND  glb.fiscal_year     = ${fiscalYear}
            AND  glb.period_number   = ${periodNumber}
            AND  ga.subledger_type   = 'bank'
        `.execute(db).then((r) => r.rows[0]).catch(() => null),

        sql<{ total: string }>`
          SELECT COUNT(*)::text AS total
          FROM   document.journal_entry
          WHERE  tenant_id       = ${tenantId}::uuid
            AND  company_code_id = ${ccId}::uuid
            AND  fiscal_year     = ${fiscalYear}
            AND  period_number   = ${periodNumber}
            AND  status          = 'posted'
        `.execute(db).then((r) => r.rows[0]).catch(() => null),
      ]);

      const pf = parseFloat;
      const d = new Date(startDate);
      const periodLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      const cashDebit  = pf(cashRow?.closing_debit  ?? "0");
      const cashCredit = pf(cashRow?.closing_credit ?? "0");

      res.json({
        revenueMtd:   revenueRow  ? pf(revenueRow.total)  : null,
        expensesMtd:  expenseRow  ? pf(expenseRow.total)  : null,
        openAp:       apRow       ? pf(apRow.total)       : null,
        openAr:       null, // sales_invoice not yet in schema
        cashBalance:  cashRow     ? cashDebit - cashCredit : null,
        journalCount: journalRow  ? Number(journalRow.total) : null,
        period:       periodLabel,
        asAt:         new Date().toISOString(),
      });
    } catch (err) {
      logger?.error("finance_dashboard_kpis_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/account-analysis ─────────────────────────────────────────
  // Period-by-period movements for a single GL account across the full fiscal year.
  // Required params: accountCode, scopeType, scopeId, fiscalYear
  router.get("/finance/account-analysis", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }

      const accountCode = (req.query["accountCode"] as string | undefined)?.trim();
      if (!accountCode) { res.status(400).json({ error: "accountCode is required" }); return; }

      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) {
        res.status(404).json({ error: "No companies found for scope" }); return;
      }
      const companyIds = companies.map((c) => c.company_code_id);
      const companyIdList = sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `);

      const account = await db
        .selectFrom("master.gl_account as ga")
        .select([
          "ga.id", "ga.code", "ga.name",
          "ga.account_class as accountClass",
          "ga.normal_balance as normalBalance",
        ])
        .where("ga.tenant_id", "=", tenantId)
        .where("ga.code", "=", accountCode)
        .executeTakeFirst() as {
          id: string; code: string; name: string;
          accountClass: string; normalBalance: string;
        } | undefined;
      if (!account) {
        res.status(404).json({ error: `Account ${accountCode} not found` }); return;
      }

      // All periods for this account in the fiscal year
      const { rows: periodRows } = await sql<{
        period_number:   number;
        period_name:     string | null;
        period_type:     string | null;
        start_date:      string | null;
        opening_balance: string;
        total_debits:    string;
        total_credits:   string;
        closing_balance: string;
      }>`
        SELECT
          glb.period_number,
          fp.name        AS period_name,
          fp.period_type,
          fp.start_date,
          SUM(glb.opening_debit  - glb.opening_credit) AS opening_balance,
          SUM(glb.period_debit)                         AS total_debits,
          SUM(glb.period_credit)                        AS total_credits,
          SUM(glb.closing_debit  - glb.closing_credit)  AS closing_balance
        FROM   ledger.gl_balance glb
        JOIN   master.gl_account ga
               ON ga.id = glb.gl_account_id
        LEFT   JOIN master.fiscal_period fp
               ON  fp.tenant_id       = glb.tenant_id
               AND fp.company_code_id = glb.company_code_id
               AND fp.fiscal_year     = glb.fiscal_year
               AND fp.period_number   = glb.period_number
        WHERE  glb.tenant_id       = ${tenantId}::uuid
          AND  glb.company_code_id = ANY(ARRAY[${companyIdList}])
          AND  glb.fiscal_year     = ${parsed.fiscalYear}
          AND  ga.code             = ${accountCode}
        GROUP  BY glb.period_number, fp.name, fp.period_type, fp.start_date
        ORDER  BY glb.period_number
      `.execute(db);

      // JE count per period for this account
      const { rows: entryCounts } = await sql<{
        period_number: number;
        entry_count:   string;
      }>`
        SELECT
          jl.period_number,
          COUNT(DISTINCT jl.journal_entry_id)::text AS entry_count
        FROM   document.journal_line jl
        WHERE  jl.tenant_id       = ${tenantId}::uuid
          AND  jl.company_code_id = ANY(ARRAY[${companyIdList}])
          AND  jl.gl_account_id   = ${account.id}::uuid
          AND  jl.fiscal_year     = ${parsed.fiscalYear}
        GROUP  BY jl.period_number
      `.execute(db);

      const entryCountMap = new Map(entryCounts.map((r) => [r.period_number, Number(r.entry_count)]));
      const pf = parseFloat;

      let adjustmentOrdinal = 0;
      const periods = periodRows.map((r) => {
        const opening = pf(r.opening_balance ?? "0");
        const debits  = pf(r.total_debits    ?? "0");
        const credits = pf(r.total_credits   ?? "0");
        const closing = pf(r.closing_balance ?? "0");
        const isAdj   = r.period_type === "adjustment";
        if (isAdj) adjustmentOrdinal += 1;

        let periodLabel: string;
        if (r.period_name) {
          periodLabel = r.period_name;
        } else if (r.start_date) {
          periodLabel = new Date(r.start_date).toLocaleString("en", { month: "short" });
        } else {
          periodLabel = isAdj ? `Adj ${adjustmentOrdinal}` : `P${r.period_number}`;
        }

        return {
          period:         isAdj ? `adj${adjustmentOrdinal}` : r.period_number,
          periodLabel,
          openingBalance: opening,
          totalDebits:    debits,
          totalCredits:   credits,
          netMovement:    debits - credits,
          closingBalance: closing,
          entryCount:     entryCountMap.get(r.period_number) ?? 0,
        };
      });

      res.json({
        accountCode:       account.code,
        accountName:       account.name,
        accountClass:      account.accountClass,
        normalBalance:     account.normalBalance as "debit" | "credit",
        periods,
        yearOpeningBalance: periods[0]?.openingBalance ?? 0,
        yearTotalDebits:    periods.reduce((s, p) => s + p.totalDebits,  0),
        yearTotalCredits:   periods.reduce((s, p) => s + p.totalCredits, 0),
        yearClosingBalance: periods[periods.length - 1]?.closingBalance ?? 0,
        isLive:            true,
        asAt:              new Date().toISOString(),
      });
    } catch (err) {
      logger?.error("finance_account_analysis_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/statements/cash-flow ─────────────────────────────────────
  // Indirect method grouped by cash-flow section.
  // Operating = income-statement movements + working-capital changes.
  // Investing  = changes in non-current asset accounts.
  // Financing  = changes in liability + equity accounts.
  // Opening/closing cash from gl_balance for bank subledger accounts.
  router.get("/finance/statements/cash-flow", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json(emptyCashFlow()); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }

      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json(emptyCashFlow()); return; }
      const companyIds   = companies.map((c) => c.company_code_id);
      const companyIdList = sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `);

      // Effective period (same logic as fetchGlBalances)
      let effectivePeriod = parsed.period;
      if (effectivePeriod === null) {
        const maxRow = await db
          .selectFrom("ledger.gl_balance as glb")
          .select(db.fn.max("glb.period_number").as("maxPeriod"))
          .where("glb.tenant_id", "=", tenantId)
          .where("glb.company_code_id", "in", companyIds)
          .where("glb.fiscal_year", "=", parsed.fiscalYear)
          .executeTakeFirst() as { maxPeriod: number | null } | undefined;
        effectivePeriod = maxRow?.maxPeriod ?? 12;
      }

      // Fetch all balances with subledger classification
      const { rows } = await sql<{
        account_code:   string;
        account_name:   string;
        account_class:  string;
        subledger_type: string | null;
        od: string; oc: string;   // opening debit/credit
        pd: string; pc: string;   // period (movement) debit/credit
        cd: string; cc: string;   // closing debit/credit
      }>`
        SELECT
          ga.code           AS account_code,
          ga.name           AS account_name,
          ga.account_class,
          ga.subledger_type,
          SUM(glb.opening_debit)  AS od,
          SUM(glb.opening_credit) AS oc,
          SUM(glb.period_debit)   AS pd,
          SUM(glb.period_credit)  AS pc,
          SUM(glb.closing_debit)  AS cd,
          SUM(glb.closing_credit) AS cc
        FROM   ledger.gl_balance glb
        JOIN   master.gl_account ga ON ga.id = glb.gl_account_id
        WHERE  glb.tenant_id       = ${tenantId}::uuid
          AND  glb.company_code_id = ANY(ARRAY[${companyIdList}])
          AND  glb.fiscal_year     = ${parsed.fiscalYear}
          AND  glb.period_number   = ${effectivePeriod}
        GROUP  BY ga.code, ga.name, ga.account_class, ga.subledger_type
        ORDER  BY ga.code
      `.execute(db);

      const pf = parseFloat;
      const CASH_SUBS      = new Set(["bank", "cash"]);
      const INVESTING_SUBS = new Set(["fixed_asset", "investment", "intangible", "right_of_use"]);

      let openingCash = 0;
      let closingCash = 0;

      type CfRow = { accountCode: string; accountName: string; current: number };
      const operatingRows: CfRow[] = [];
      const investingRows: CfRow[] = [];
      const financingRows: CfRow[] = [];

      for (const r of rows) {
        const od = pf(r.od ?? "0"), oc = pf(r.oc ?? "0");
        const pd = pf(r.pd ?? "0"), pc = pf(r.pc ?? "0");
        const cd = pf(r.cd ?? "0"), cc = pf(r.cc ?? "0");

        const isAsset     = r.account_class === "asset";
        const isLiability = r.account_class === "liability";
        const isEquity    = r.account_class === "equity";
        const isCash      = isAsset && CASH_SUBS.has(r.subledger_type ?? "");
        const isInvesting = isAsset && INVESTING_SUBS.has(r.subledger_type ?? "");

        if (isCash) {
          openingCash += od - oc;
          closingCash += cd - cc;
          continue;
        }

        if (r.account_class === "revenue") {
          // Revenue: credit movements = positive operating cash received
          const impact = pc - pd;
          if (impact !== 0) operatingRows.push({ accountCode: r.account_code, accountName: r.account_name, current: impact });
        } else if (r.account_class === "expense") {
          // Expense: debit movements = negative operating cash
          const impact = -(pd - pc);
          if (impact !== 0) operatingRows.push({ accountCode: r.account_code, accountName: r.account_name, current: impact });
        } else if (isInvesting) {
          // Asset decrease = positive (cash received); increase = negative (cash paid)
          const change = (od - oc) - (cd - cc);
          if (change !== 0) investingRows.push({ accountCode: r.account_code, accountName: r.account_name, current: change });
        } else if (isLiability || isEquity) {
          // Liability/equity increase = positive cash; decrease = negative
          const change = (cd - cc) - (od - oc);
          if (change !== 0) financingRows.push({ accountCode: r.account_code, accountName: r.account_name, current: change });
        } else if (isAsset) {
          // Other assets (working capital): decrease = positive operating cash
          const change = (od - oc) - (cd - cc);
          if (change !== 0) operatingRows.push({ accountCode: r.account_code, accountName: r.account_name, current: change });
        }
      }

      const toSection = (code: string, label: string, cfRows: CfRow[]) => ({
        code, label, rows: cfRows,
        total: cfRows.reduce((s, r) => s + r.current, 0),
      });

      const operating  = [toSection("operating", "Operating Activities", operatingRows)];
      const investing  = [toSection("investing",  "Investing Activities",  investingRows)];
      const financing  = [toSection("financing",  "Financing Activities",  financingRows)];

      const netOperating = operating.reduce((s, sec) => s + sec.total, 0);
      const netInvesting = investing.reduce((s, sec) => s + sec.total, 0);
      const netFinancing = financing.reduce((s, sec) => s + sec.total, 0);

      res.json({
        operating, investing, financing,
        netOperating, netInvesting, netFinancing,
        netChange:   netOperating + netInvesting + netFinancing,
        openingCash, closingCash,
        asAt:   new Date().toISOString(),
        isLive: true,
      });
    } catch (err) {
      logger?.error("finance_cash_flow_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}

function emptyCashFlow() {
  return {
    operating: [], investing: [], financing: [],
    netOperating: 0, netInvesting: 0, netFinancing: 0, netChange: 0,
    openingCash: 0, closingCash: 0,
    asAt: new Date().toISOString(), isLive: true,
  };
}
