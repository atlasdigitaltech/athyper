/**
 * Bank Reconciliation Routes
 *
 * GET  /api/finance/bank/accounts                     — house bank accounts for a scope
 * GET  /api/finance/bank/statement/:bankAccountId     — payment_entry rows for a bank account
 * GET  /api/finance/bank/unreconciled/:bankAccountId  — uncleared payments (pending recon)
 * POST /api/finance/bank/reconcile                    — [DEPRECATED] mark payments cleared (legacy)
 *
 * Phase 5 — Bank Statement Import & Reconciliation:
 * POST /api/finance/bank/statements/import            — upload CSV/OFX statement file
 * GET  /api/finance/bank/statements/:bankAccountId    — list imported statements
 * GET  /api/finance/bank/statements/:statementId/lines — statement lines with recon status
 * POST /api/finance/bank/statements/:statementId/auto-match — run auto-match engine
 * POST /api/finance/bank/reconcile/match              — manual: link payment ↔ statement line
 * POST /api/finance/bank/reconcile/split              — manual: split statement line across payments
 * POST /api/finance/bank/reconcile/exception          — mark statement line as exception
 * POST /api/finance/bank/reconcile/sign-off           — sign off statement + post adjustment JEs
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import type { IncomingMessage } from "node:http";
import { type FinanceRouteDeps, parseScopeParams, resolveCompanyIds } from "./finance.route.js";
import {
  verifyBearer,
  resolveTenantId,
  isUuid,
  resolvePrincipalIdOrNull,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import { importBankStatement }   from "./bank-statement-import.service.js";
import { runAutoMatch }          from "./bank-auto-match.service.js";
import { postReconAdjustment }   from "./bank-recon-posting.service.js";

export function createBankRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  async function resolveActorId(tenantId: string, xRealm: string, claims: Record<string, unknown>): Promise<string> {
    const sub = String(claims["sub"] ?? "");
    if (!sub) return SYSTEM_PRINCIPAL_UUID;
    return (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm)) ?? SYSTEM_PRINCIPAL_UUID;
  }

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
        .$if(!!parsed.transactionCurrency, (qb) => qb.where("ba.currency_code", "=", parsed.transactionCurrency as string))
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
      if (parsed.transactionCurrency) q = q.where("pe.currency_code", "=", parsed.transactionCurrency) as typeof q;

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
        .where("pe.cleared_date", "is", null)
        .where("pe.bank_statement_line_id", "is", null)
        .where("pe.status", "not in", ["cleared", "reversed", "voided", "cancelled"]);

      if (companyIds.length > 0) q = q.where("pe.company_code_id", "in", companyIds) as typeof q;
      if (parsed.period !== null) q = q.where("pe.period_number", "=", parsed.period) as typeof q;
      if (parsed.transactionCurrency) q = q.where("pe.currency_code", "=", parsed.transactionCurrency) as typeof q;

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

  // ── POST /api/finance/bank/reconcile  [DEPRECATED] ──────────────────────
  // Legacy compatibility endpoint. Reconciliation state is recorded on
  // cleared_date/bank_statement_line_id; payment_entry.status remains lifecycle-owned.
  // Kept for backward compatibility with the bank recon UI until Phase 5 UI lands.
  // New code should use the Phase 5 statement-import + sign-off flow instead.
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
      const paymentIds = body.payment_ids.filter(isUuid);
      if (paymentIds.length === 0) {
        res.status(400).json({ error: "INVALID_VALUE", message: "No valid payment UUIDs provided" });
        return;
      }

      const clearedDate = body.cleared_date ? new Date(body.cleared_date) : new Date();
      const clearedDateStr = clearedDate.toISOString().split("T")[0]!;

      const result = await db
        .updateTable("document.payment_entry")
        .set({ cleared_date: clearedDateStr, updated_at: sql`now()` })
        .where("tenant_id", "=", tenantId)
        .where("bank_account_id", "=", body.bank_account_id)
        .where("id", "in", paymentIds)
        .where("is_posted", "=", true)
        .where("cleared_date", "is", null)
        .where("bank_statement_line_id", "is", null)
        .where("status", "not in", ["reversed", "voided", "cancelled"])
        .executeTakeFirst();

      const cleared = Number(result?.numUpdatedRows ?? 0);
      res.json({ cleared, cleared_date: clearedDate.toISOString(), _deprecated: true });
    } catch (err) {
      logger?.error("finance_bank_reconcile_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── POST /api/finance/bank/statements/import ──────────────────────────────
  // Uploads a CSV or OFX bank statement file.
  // Content-Type: multipart/form-data
  //   file:           the statement file (required)
  //   bank_account_id: uuid (required)
  //   company_code_id: uuid (required)
  //   format:          csv | ofx | auto  (default: auto)
  //   statement_ref:   bank-assigned reference (optional)
  //   period_start:    YYYY-MM-DD override (optional)
  //   period_end:      YYYY-MM-DD override (optional)
  //   currency_code:   3-char ISO (optional — inferred from bank account)
  router.post("/finance/bank/statements/import", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_HEADER", message: "Tenant resolution failed" }); return; }

      // Read raw multipart body via the relay (already parsed by express-formidable or raw buffer)
      // In our stack multipart arrives as req.body._file_<field> Buffer or via req.files.
      // We accept both raw Buffer on req.body.file and the parsed files object.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bodyAny = req.body as any;
      const rawBytes: Buffer | undefined =
        Buffer.isBuffer(bodyAny?.file) ? bodyAny.file :
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Buffer.isBuffer((req as any)?.files?.file?.data) ? (req as any).files.file.data :
        undefined;

      if (!rawBytes || rawBytes.length === 0) {
        res.status(400).json({ error: "MISSING_FILE", message: "No statement file received" });
        return;
      }

      const bankAccountId = String(bodyAny?.bank_account_id ?? "");
      const companyCodeId = String(bodyAny?.company_code_id ?? "");
      if (!isUuid(bankAccountId)) { res.status(400).json({ error: "MISSING_FIELD", message: "bank_account_id required" }); return; }
      if (!isUuid(companyCodeId)) { res.status(400).json({ error: "MISSING_FIELD", message: "company_code_id required" }); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileName = String((req as any)?.files?.file?.name ?? bodyAny?.file_name ?? "upload.csv");
      const format   = (bodyAny?.format as "csv" | "ofx" | "auto" | undefined) ?? "auto";

      const actorId = await resolveActorId(tenantId, xRealm, claims as Record<string, unknown>);

      const result = await importBankStatement(db, {
        tenantId,
        companyCodeId,
        bankAccountId,
        createdBy:    actorId,
        fileName,
        rawBytes,
        format,
        statementRef: bodyAny?.statement_ref ?? undefined,
        periodStart:  bodyAny?.period_start  ?? undefined,
        periodEnd:    bodyAny?.period_end     ?? undefined,
        currencyCode: bodyAny?.currency_code  ?? undefined,
      });

      res.status(result.isDuplicate ? 200 : 201).json(result);
    } catch (err) {
      logger?.error("finance_bank_import_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── GET /api/finance/bank/statements/:bankAccountId ───────────────────────
  // Lists imported statements for a bank account.
  router.get("/finance/bank/statements/:bankAccountId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const bankAccountId = req.params["bankAccountId"] as string;
      if (!isUuid(bankAccountId)) { res.json({ items: [] }); return; }

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);

      const items = await db
        .selectFrom("document.bank_statement as bst")
        .select([
          "bst.id", "bst.statement_ref as statementRef",
          "bst.period_start_date as periodStart", "bst.period_end_date as periodEnd",
          "bst.opening_balance as openingBalance", "bst.closing_balance as closingBalance",
          "bst.currency_code as currencyCode",
          "bst.line_count as lineCount", "bst.source_format as sourceFormat",
          "bst.status", "bst.created_at as importedAt",
        ])
        .where("bst.tenant_id",       "=", tenantId)
        .where("bst.bank_account_id", "=", bankAccountId)
        .orderBy("bst.period_end_date", "desc")
        .limit(limit).offset(offset)
        .execute();

      res.json({ items });
    } catch (err) { logger?.error("finance_bank_statements_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── GET /api/finance/bank/statements/:statementId/lines ──────────────────
  router.get("/finance/bank/statements/:statementId/lines", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const statementId = req.params["statementId"] as string;
      if (!isUuid(statementId)) { res.json({ items: [] }); return; }

      const reconStatus = req.query["reconStatus"] as string | undefined;

      let q = db
        .selectFrom("document.bank_statement_line as bsl")
        .select([
          "bsl.id", "bsl.line_no as lineNo",
          "bsl.transaction_date as transactionDate", "bsl.value_date as valueDate",
          "bsl.description", "bsl.reference_number as referenceNumber",
          "bsl.counterparty_name as counterpartyName",
          "bsl.amount", "bsl.currency_code as currencyCode",
          "bsl.transaction_type as transactionType",
          "bsl.recon_status as reconStatus", "bsl.recon_case_id as reconCaseId",
        ])
        .where("bsl.tenant_id",        "=", tenantId)
        .where("bsl.bank_statement_id","=", statementId);

      if (reconStatus) q = q.where("bsl.recon_status", "=", reconStatus) as typeof q;

      const items = await q.orderBy("bsl.line_no", "asc").execute();
      res.json({ items });
    } catch (err) { logger?.error("finance_bank_stmt_lines_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/finance/bank/statements/:statementId/auto-match ────────────
  // Runs the auto-match engine for a specific statement.
  // Body: { company_code_id: string, bank_account_id: string }
  router.post("/finance/bank/statements/:statementId/auto-match", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_HEADER" }); return; }

      const statementId = req.params["statementId"] as string;
      if (!isUuid(statementId)) { res.status(400).json({ error: "INVALID_PARAM", message: "statementId must be a UUID" }); return; }

      // Load statement to get bank_account_id + company_code_id
      const stmt = await db
        .selectFrom("document.bank_statement as bst")
        .select(["bst.bank_account_id", "bst.company_code_id"])
        .where("bst.id",        "=", statementId)
        .where("bst.tenant_id", "=", tenantId)
        .executeTakeFirst() as { bank_account_id: string; company_code_id: string } | undefined;

      if (!stmt) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      // Mark statement as 'matching'
      await db
        .updateTable("document.bank_statement")
        .set({ status: "matching", updated_at: sql`now()` })
        .where("id", "=", statementId)
        .where("tenant_id", "=", tenantId)
        .execute();

      const actorId = await resolveActorId(tenantId, xRealm, claims as Record<string, unknown>);
      const result = await runAutoMatch(db, {
        tenantId,
        bankAccountId: stmt.bank_account_id,
        companyCodeId: stmt.company_code_id,
        statementId,
        createdBy: actorId,
      });

      res.json({ statementId, ...result });
    } catch (err) { logger?.error("finance_bank_auto_match_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/finance/bank/reconcile/match ────────────────────────────────
  // Manual: link a specific payment_entry to a bank_statement_line.
  // Body: { payment_entry_id, bank_statement_line_id, notes? }
  router.post("/finance/bank/reconcile/match", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_HEADER" }); return; }

      const body = req.body as {
        payment_entry_id?: string;
        bank_statement_line_id?: string;
        notes?: string;
      };

      if (!isUuid(body.payment_entry_id ?? "")) { res.status(400).json({ error: "MISSING_FIELD", message: "payment_entry_id required" }); return; }
      if (!isUuid(body.bank_statement_line_id ?? "")) { res.status(400).json({ error: "MISSING_FIELD", message: "bank_statement_line_id required" }); return; }

      const payId  = body.payment_entry_id!;
      const lineId = body.bank_statement_line_id!;
      const userId = await resolveActorId(tenantId, xRealm, claims as Record<string, unknown>);

      // Load both rows
      const pay = await db
        .selectFrom("document.payment_entry as pe")
        .select(["pe.payment_amount", "pe.payment_direction", "pe.posting_date", "pe.company_code_id", "pe.bank_account_id"])
        .where("pe.id", "=", payId).where("pe.tenant_id", "=", tenantId)
        .executeTakeFirst() as { payment_amount: string; payment_direction: string; posting_date: string; company_code_id: string; bank_account_id: string } | undefined;
      if (!pay) { res.status(404).json({ error: "NOT_FOUND", message: "Payment not found" }); return; }

      const line = await db
        .selectFrom("document.bank_statement_line as bsl")
        .select(["bsl.amount", "bsl.transaction_date", "bsl.bank_statement_id", "bsl.currency_code"])
        .where("bsl.id", "=", lineId).where("bsl.tenant_id", "=", tenantId)
        .executeTakeFirst() as { amount: string; transaction_date: string; bank_statement_id: string; currency_code: string } | undefined;
      if (!line) { res.status(404).json({ error: "NOT_FOUND", message: "Statement line not found" }); return; }

      const payAmt  = parseFloat(pay.payment_amount) * (pay.payment_direction === "OUTBOUND" ? -1 : 1);
      const lineAmt = parseFloat(line.amount);
      const diff    = payAmt - lineAmt;

      // Generate case number
      const datePart   = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const caseNumber = `RC-${datePart}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      const caseRow = await sql<{ id: string }>`
        INSERT INTO document.bank_recon_case
          (tenant_id, company_code_id, bank_account_id, case_number,
           case_type, confidence_score, status, difference_amount, currency_code,
           matched_at, created_at, created_by)
        VALUES (
          ${tenantId}::uuid, ${pay.company_code_id}::uuid, ${pay.bank_account_id}::uuid, ${caseNumber},
          'manual', 1.0, 'matched', ${diff}, ${line.currency_code},
          now(), now(), ${userId}::uuid
        )
        RETURNING id
      `.execute(db);

      const caseId = caseRow.rows[0]?.id;
      if (!caseId) throw new Error("Failed to create recon case");

      await sql`
        INSERT INTO document.bank_recon_case_line
          (tenant_id, bank_recon_case_id, side, payment_entry_id, bank_statement_line_id,
           amount, notes, created_at, created_by)
        VALUES
          (${tenantId}::uuid, ${caseId}::uuid, 'payment', ${payId}::uuid, NULL,
           ${Math.abs(parseFloat(pay.payment_amount))}, ${body.notes ?? null}, now(), ${userId}::uuid),
          (${tenantId}::uuid, ${caseId}::uuid, 'statement', NULL, ${lineId}::uuid,
           ${Math.abs(lineAmt)}, NULL, now(), ${userId}::uuid)
      `.execute(db);

      await db.updateTable("document.bank_statement_line")
        .set({ recon_status: "matched", recon_case_id: caseId, updated_at: sql`now()` })
        .where("id", "=", lineId)
        .where("tenant_id", "=", tenantId)
        .execute();

      await db.updateTable("document.payment_entry")
        .set({ cleared_date: line.transaction_date, bank_statement_line_id: lineId, updated_at: sql`now()` })
        .where("id", "=", payId)
        .where("tenant_id", "=", tenantId)
        .execute();

      res.status(201).json({ caseId, caseNumber, differenceAmount: diff });
    } catch (err) { logger?.error("finance_bank_manual_match_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/finance/bank/reconcile/split ────────────────────────────────
  // Manual: split one statement line across multiple payment_entry rows.
  // Body: { bank_statement_line_id, splits: [{ payment_entry_id, amount }][], notes? }
  router.post("/finance/bank/reconcile/split", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_HEADER" }); return; }

      const body = req.body as {
        bank_statement_line_id?: string;
        splits?: Array<{ payment_entry_id: string; amount: number }>;
        notes?: string;
      };

      if (!isUuid(body.bank_statement_line_id ?? "")) { res.status(400).json({ error: "MISSING_FIELD", message: "bank_statement_line_id required" }); return; }
      if (!Array.isArray(body.splits) || body.splits.length < 2) { res.status(400).json({ error: "INVALID_VALUE", message: "splits must have at least 2 entries" }); return; }

      const lineId = body.bank_statement_line_id!;
      const userId = await resolveActorId(tenantId, xRealm, claims as Record<string, unknown>);

      const line = await db
        .selectFrom("document.bank_statement_line as bsl")
        .select(["bsl.amount", "bsl.transaction_date", "bsl.bank_statement_id", "bsl.currency_code"])
        .where("bsl.id", "=", lineId).where("bsl.tenant_id", "=", tenantId)
        .executeTakeFirst() as { amount: string; transaction_date: string; bank_statement_id: string; currency_code: string } | undefined;
      if (!line) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      // Resolve company + bank account from first payment
      const firstPay = await db
        .selectFrom("document.payment_entry as pe")
        .select(["pe.company_code_id", "pe.bank_account_id"])
        .where("pe.id", "=", body.splits[0]!.payment_entry_id)
        .where("pe.tenant_id", "=", tenantId)
        .executeTakeFirst() as { company_code_id: string; bank_account_id: string } | undefined;
      if (!firstPay) { res.status(404).json({ error: "NOT_FOUND", message: "First payment not found" }); return; }

      const totalSplitAmt = body.splits.reduce((s, sp) => s + sp.amount, 0);
      const diff = parseFloat(line.amount) - totalSplitAmt;

      const datePart   = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const caseNumber = `RC-${datePart}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      const caseRow = await sql<{ id: string }>`
        INSERT INTO document.bank_recon_case
          (tenant_id, company_code_id, bank_account_id, case_number,
           case_type, confidence_score, status, difference_amount, currency_code,
           matched_at, created_at, created_by)
        VALUES (
          ${tenantId}::uuid, ${firstPay.company_code_id}::uuid, ${firstPay.bank_account_id}::uuid, ${caseNumber},
          'manual', 1.0, 'matched', ${diff}, ${line.currency_code},
          now(), now(), ${userId}::uuid
        )
        RETURNING id
      `.execute(db);

      const caseId = caseRow.rows[0]?.id;
      if (!caseId) throw new Error("Failed to create split recon case");

      // Statement side
      await sql`
        INSERT INTO document.bank_recon_case_line
          (tenant_id, bank_recon_case_id, side, bank_statement_line_id, amount, notes, created_at, created_by)
        VALUES
          (${tenantId}::uuid, ${caseId}::uuid, 'statement', ${lineId}::uuid,
           ${Math.abs(parseFloat(line.amount))}, ${body.notes ?? null}, now(), ${userId}::uuid)
      `.execute(db);

      // Payment sides
      for (const sp of body.splits) {
        await sql`
          INSERT INTO document.bank_recon_case_line
            (tenant_id, bank_recon_case_id, side, payment_entry_id, amount, created_at, created_by)
          VALUES
            (${tenantId}::uuid, ${caseId}::uuid, 'payment', ${sp.payment_entry_id}::uuid,
             ${sp.amount}, now(), ${userId}::uuid)
        `.execute(db);

        await db.updateTable("document.payment_entry")
          .set({ cleared_date: line.transaction_date, bank_statement_line_id: lineId, updated_at: sql`now()` })
          .where("id", "=", sp.payment_entry_id)
          .where("tenant_id", "=", tenantId)
          .execute();
      }

      await db.updateTable("document.bank_statement_line")
        .set({ recon_status: "split", recon_case_id: caseId, updated_at: sql`now()` })
        .where("id", "=", lineId)
        .where("tenant_id", "=", tenantId)
        .execute();

      res.status(201).json({ caseId, caseNumber, differenceAmount: diff });
    } catch (err) { logger?.error("finance_bank_split_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/finance/bank/reconcile/exception ────────────────────────────
  // Mark a statement line as an exception (unresolvable, needs external action).
  // Body: { bank_statement_line_id, notes }
  router.post("/finance/bank/reconcile/exception", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_HEADER" }); return; }

      const body = req.body as { bank_statement_line_id?: string; notes?: string };
      if (!isUuid(body.bank_statement_line_id ?? "")) { res.status(400).json({ error: "MISSING_FIELD" }); return; }

      await db.updateTable("document.bank_statement_line")
        .set({ recon_status: "exception", updated_at: sql`now()` })
        .where("id", "=", body.bank_statement_line_id!)
        .where("tenant_id", "=", tenantId)
        .execute();

      res.json({ updated: true });
    } catch (err) { logger?.error("finance_bank_exception_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/finance/bank/reconcile/sign-off ─────────────────────────────
  // Sign off an entire bank statement: posts adjustment JEs for all open cases
  // that have a non-zero difference, then marks statement status='signed_off'.
  // Body: {
  //   statement_id, book_id, posting_date, fiscal_year, period_number
  // }
  router.post("/finance/bank/reconcile/sign-off", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_HEADER" }); return; }

      const body = req.body as {
        statement_id?: string;
        book_id?: string;
        posting_date?: string;
        fiscal_year?: number;
        period_number?: number;
      };

      if (!isUuid(body.statement_id ?? "")) { res.status(400).json({ error: "MISSING_FIELD", message: "statement_id required" }); return; }
      if (!isUuid(body.book_id ?? "")) { res.status(400).json({ error: "MISSING_FIELD", message: "book_id required" }); return; }
      if (!body.posting_date || !body.fiscal_year || !body.period_number) {
        res.status(400).json({ error: "MISSING_FIELD", message: "posting_date, fiscal_year, period_number required" });
        return;
      }

      const stmt = await db
        .selectFrom("document.bank_statement as bst")
        .select(["bst.bank_account_id", "bst.company_code_id", "bst.status"])
        .where("bst.id",        "=", body.statement_id!)
        .where("bst.tenant_id", "=", tenantId)
        .executeTakeFirst() as { bank_account_id: string; company_code_id: string; status: string } | undefined;

      if (!stmt) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      if (stmt.status === "signed_off") { res.status(409).json({ error: "ALREADY_SIGNED_OFF" }); return; }

      // Validate: all lines must be matched, split, exception, or excluded
      const openLines = await db
        .selectFrom("document.bank_statement_line as bsl")
        .select(db.fn.count<string>("bsl.id").as("cnt"))
        .where("bsl.tenant_id",        "=", tenantId)
        .where("bsl.bank_statement_id","=", body.statement_id!)
        .where("bsl.recon_status",     "=", "unmatched")
        .executeTakeFirst() as { cnt: string } | undefined;

      const openCount = parseInt(openLines?.cnt ?? "0", 10);
      if (openCount > 0) {
        res.status(422).json({
          error: "UNMATCHED_LINES",
          message: `${openCount} statement line(s) are still unmatched. Resolve or mark as exception before sign-off.`,
          openCount,
        });
        return;
      }

      // Post adjustment JEs for bank_charge / fx_difference cases
      const cases = await sql<{ id: string; case_type: string }>`
        SELECT DISTINCT brc.id, brc.case_type
          FROM document.bank_recon_case brc
          JOIN document.bank_recon_case_line brcl
            ON brcl.tenant_id = brc.tenant_id
           AND brcl.bank_recon_case_id = brc.id
           AND brcl.side = 'statement'
          JOIN document.bank_statement_line bsl
            ON bsl.tenant_id = brcl.tenant_id
           AND bsl.id = brcl.bank_statement_line_id
         WHERE brc.tenant_id = ${tenantId}::uuid
           AND brc.bank_account_id = ${stmt.bank_account_id}::uuid
           AND brc.status IN ('open', 'matched')
           AND brc.case_type IN ('bank_charge', 'fx_difference', 'near_match')
           AND bsl.bank_statement_id = ${body.statement_id!}::uuid
      `.execute(db);

      const userId = await resolveActorId(tenantId, xRealm, claims as Record<string, unknown>);
      const jeIds: string[] = [];

      for (const c of cases.rows) {
        const postResult = await postReconAdjustment(db, {
          tenantId,
          companyCodeId: stmt.company_code_id,
          bankAccountId: stmt.bank_account_id,
          reconCaseId:   c.id,
          postedBy:      userId,
          postingDate:   body.posting_date!,
          fiscalYear:    body.fiscal_year!,
          periodNumber:  body.period_number!,
          bookId:        body.book_id!,
        });
        if (postResult.jeId) jeIds.push(postResult.jeId);
      }

      // Mark statement signed_off
      await db
        .updateTable("document.bank_statement")
        .set({ status: "signed_off", signed_off_at: sql`now()`, signed_off_by: userId, updated_at: sql`now()` })
        .where("id",        "=", body.statement_id!)
        .where("tenant_id", "=", tenantId)
        .execute();

      res.json({
        statementId:  body.statement_id,
        status:       "signed_off",
        jesPosted:    jeIds.length,
        jeIds,
      });
    } catch (err) { logger?.error("finance_bank_signoff_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  return router;
}
