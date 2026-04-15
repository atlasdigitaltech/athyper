/**
 * Bank Reconciliation Routes
 *
 * GET  /api/finance/bank/accounts                     — house bank accounts for a scope
 * GET  /api/finance/bank/statement/:bankAccountId     — payment_entry rows for a bank account
 * GET  /api/finance/bank/unreconciled/:bankAccountId  — uncleared payments (pending recon)
 * POST /api/finance/bank/reconcile                    — mark selected payments as cleared
 */

import type { RequestHandler, Router } from "express";
import { sql, type Kysely } from "kysely";
import { type FinanceRouteDeps, parseScopeParams, resolveCompanyIds } from "./finance.route.js";
import { verifyBearer, resolveTenantId, isUuid } from "@athyper/svc-shared";

export function createBankRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /api/finance/bank/accounts ────────────────────────────────────────
  // Returns house bank accounts linked to company_codes in the scope.
  // Link: master.bank_account_link WHERE owner_type = 'company_code'
  // Config: master.bank_account_house_config (GL account mapping)
  router.get("/finance/bank/accounts", (async (req, res, next) => {
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

      const rows = await db
        .selectFrom("master.bank_account_link as bal")
        .innerJoin("master.bank_account as ba", (jb) =>
          jb.onRef("ba.id", "=", "bal.bank_account_id").on("ba.tenant_id", "=", tenantId),
        )
        .leftJoin("master.bank_account_house_config as hc", "hc.bank_account_link_id", "bal.id")
        .leftJoin("master.gl_account as ga", "ga.id", "hc.gl_account_id")
        .select([
          "ba.id", "ba.name", "ba.account_holder_name as accountHolderName",
          "ba.account_id_type as accountIdType",
          "ba.account_last4 as accountLast4",
          "ba.currency_code as currencyCode",
          "ba.is_verified as isVerified", "ba.status",
          "bal.company_code_id as companyCodeId",
          "bal.purpose", "bal.is_primary as isPrimary",
          "hc.gl_account_id as glAccountId",
          "ga.code as glAccountCode", "ga.name as glAccountName",
        ])
        .where("bal.tenant_id", "=", tenantId)
        .where("bal.owner_type", "=", "company_code")
        .where("bal.owner_id", "in", companyIds)
        .where("ba.status", "=", "active")
        .where((eb) =>
          eb.or([
            eb("bal.effective_until", "is", null),
            eb("bal.effective_until", ">=", eb.val(new Date().toISOString().split("T")[0]!)),
          ]),
        )
        .orderBy("bal.is_primary", "desc")
        .orderBy("ba.name", "asc")
        .execute();

      res.json(rows);
    } catch (err) { logger?.error("finance_bank_accounts_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/bank/statement/:bankAccountId ────────────────────────
  // Returns all payment_entry rows for a specific bank account (the bank statement view).
  router.get("/finance/bank/statement/:bankAccountId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const bankAccountId = req.params["bankAccountId"] as string;
      if (!isUuid(bankAccountId)) { res.json({ items: [] }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(500, parseInt(String(req.query["limit"]  ?? "100"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),   10);

      let q = db
        .selectFrom("document.payment_entry as pe")
        .select([
          "pe.id", "pe.payment_number as paymentNumber",
          "pe.payment_direction as paymentDirection",
          "pe.payment_type as paymentType",
          "pe.supplier_name as counterpartyName",
          "pe.payment_amount as paymentAmount",
          "pe.currency_code as currencyCode",
          "pe.value_date as valueDate",
          "pe.posting_date as postingDate",
          "pe.payment_reference as paymentReference",
          "pe.bank_reference as bankReference",
          "pe.check_number as checkNumber",
          "pe.is_posted as isPosted",
          "pe.is_transmitted as isTransmitted",
          "pe.is_voided as isVoided",
          "pe.status",
          "pe.cleared_date as clearedDate",
          "pe.fiscal_year as fiscalYear",
          "pe.period_number as periodNumber",
        ])
        .where("pe.tenant_id", "=", tenantId)
        .where("pe.bank_account_id", "=", bankAccountId)
        .where("pe.fiscal_year", "=", parsed.fiscalYear);

      if (companyIds.length > 0) q = q.where("pe.company_code_id", "in", companyIds) as typeof q;
      if (parsed.period !== null) q = q.where("pe.period_number", "=", parsed.period) as typeof q;

      const items = await q.orderBy("pe.value_date", "desc").orderBy("pe.payment_number", "desc")
        .limit(limit).offset(offset).execute();

      // Running balance (for bank statement display: INBOUND + / OUTBOUND -)
      let running = 0;
      const itemsWithRunning = [...items].reverse().map((item) => {
        const amt = parseFloat(String((item as Record<string, unknown>)["paymentAmount"] ?? "0"));
        const dir = (item as Record<string, unknown>)["paymentDirection"] as string;
        running += dir === "INBOUND" ? amt : -amt;
        return { ...item, runningBalance: running };
      }).reverse();

      res.json({ items: itemsWithRunning, asAt: new Date().toISOString() });
    } catch (err) { logger?.error("finance_bank_statement_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/bank/unreconciled/:bankAccountId ─────────────────────
  // Returns posted payments that have not yet been cleared (status != 'cleared').
  router.get("/finance/bank/unreconciled/:bankAccountId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const bankAccountId = req.params["bankAccountId"] as string;
      if (!isUuid(bankAccountId)) { res.json({ items: [] }); return; }
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      const companyIds = companies.map((c) => c.company_code_id);

      let q = db
        .selectFrom("document.payment_entry as pe")
        .select([
          "pe.id", "pe.payment_number as paymentNumber",
          "pe.payment_direction as paymentDirection",
          "pe.supplier_name as counterpartyName",
          "pe.payment_amount as paymentAmount",
          "pe.currency_code as currencyCode",
          "pe.value_date as valueDate", "pe.posting_date as postingDate",
          "pe.bank_reference as bankReference",
          "pe.payment_reference as paymentReference",
          "pe.status", "pe.is_posted as isPosted",
          "pe.cleared_date as clearedDate",
        ])
        .where("pe.tenant_id", "=", tenantId)
        .where("pe.bank_account_id", "=", bankAccountId)
        .where("pe.is_posted", "=", true)
        .where("pe.status", "not in", ["cleared", "reversed", "voided", "cancelled"]);

      if (companyIds.length > 0) q = q.where("pe.company_code_id", "in", companyIds) as typeof q;
      if (parsed.period !== null) q = q.where("pe.period_number", "=", parsed.period) as typeof q;

      const items = await q.orderBy("pe.value_date", "asc").execute();
      res.json({
        items,
        totalUnreconciled: items.reduce((s, r) => {
          const amt = parseFloat(String((r as Record<string, unknown>)["paymentAmount"] ?? "0"));
          const dir = (r as Record<string, unknown>)["paymentDirection"] as string;
          return s + (dir === "INBOUND" ? amt : -amt);
        }, 0),
        count: items.length,
        asAt: new Date().toISOString(),
      });
    } catch (err) { logger?.error("finance_bank_unreconciled_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/bank/reconcile ─────────────────────────────────────
  // Mark a set of payment_entry rows as cleared (bank reconciliation action).
  // Body: { bank_account_id: string, payment_ids: string[], cleared_date?: string }
  // Only updates posted, un-cleared payments. Returns { cleared, cleared_date }.
  router.post("/finance/bank/reconcile", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_HEADER", message: "Tenant resolution failed" }); return; }

      const body = req.body as {
        bank_account_id?: string;
        payment_ids?: string[];
        cleared_date?: string;
      };

      if (!body.bank_account_id?.trim() || !isUuid(body.bank_account_id)) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'bank_account_id' is required" });
        return;
      }
      if (!Array.isArray(body.payment_ids) || body.payment_ids.length === 0) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'payment_ids' must be a non-empty array" });
        return;
      }
      // Sanitise: only accept valid UUIDs
      const paymentIds = body.payment_ids.filter(isUuid);
      if (paymentIds.length === 0) {
        res.status(400).json({ error: "INVALID_VALUE", message: "No valid payment UUIDs provided" });
        return;
      }

      const clearedDate = body.cleared_date ? new Date(body.cleared_date) : new Date();
      const clearedDateStr = clearedDate.toISOString().split("T")[0]!; // YYYY-MM-DD

      const result = await db
        .updateTable("document.payment_entry")
        .set({ status: "cleared", cleared_date: clearedDateStr, updated_at: sql`now()` })
        .where("tenant_id", "=", tenantId)
        .where("bank_account_id", "=", body.bank_account_id)
        .where("id", "in", paymentIds)
        .where("is_posted", "=", true)
        .where("status", "not in", ["cleared", "reversed", "voided", "cancelled"])
        .executeTakeFirst();

      const cleared = Number(result?.numUpdatedRows ?? 0);
      res.json({ cleared, cleared_date: clearedDate.toISOString() });
    } catch (err) {
      logger?.error("finance_bank_reconcile_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
