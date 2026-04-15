/**
 * AP / AR Routes
 *
 * GET  /api/finance/ap/invoices             — paginated AP invoice list
 * GET  /api/finance/ap/invoices/:id         — single AP invoice with lines
 * GET  /api/finance/ap/payments             — payment_entry WHERE direction = OUTBOUND
 * POST /api/finance/ap/payments             — create draft payment entry for an AP invoice
 * GET  /api/finance/ap/payment-methods      — list active payment methods (OUTBOUND/BOTH)
 * GET  /api/finance/ap/aging                — AP aging buckets by supplier
 * GET  /api/finance/ar/invoices             — paginated AR invoice list (graceful when module inactive)
 * GET  /api/finance/ar/receipts             — payment_entry WHERE direction = INBOUND
 * POST /api/finance/ar/receipts             — create draft receipt (standalone INBOUND payment entry)
 * GET  /api/finance/ar/payment-methods      — list active payment methods (INBOUND/BOTH)
 * GET  /api/finance/ar/aging                — AR aging buckets by customer
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import {
  type FinanceRouteDeps,
  parseScopeParams,
  resolveCompanyIds,
} from "./finance.route.js";
import { verifyBearer, resolveTenantId, isUuid, resolvePrincipalIdOrNull, extractOrgHeaders } from "@athyper/svc-shared";
import { randomUUID } from "node:crypto";

// ── Route factory ─────────────────────────────────────────────────────────────

export function createApRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /api/finance/ap/invoices ──────────────────────────────────────────
  router.get("/finance/ap/invoices", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;
      const supplierId = req.query["supplierId"] as string | undefined;
      if (supplierId !== undefined && !isUuid(supplierId)) {
        res.json({ items: [], total: 0 });
        return;
      }

      let q = db
        .selectFrom("document.purchase_invoice as pi")
        .leftJoin("master.supplier as s", (jb) =>
          jb.onRef("s.id", "=", "pi.supplier_id").on("s.tenant_id", "=", tenantId),
        )
        .select([
          "pi.id", "pi.invoice_number", "pi.supplier_invoice_number",
          "pi.supplier_invoice_date as supplierInvoiceDate",
          "pi.document_date as documentDate", "pi.posting_date as postingDate",
          "pi.due_date as dueDate", "pi.fiscal_year as fiscalYear",
          "pi.period_number as periodNumber",
          "pi.currency_code as currencyCode",
          "pi.total_amount as totalAmount",
          "pi.payable_amount as payableAmount",
          "pi.paid_amount as paidAmount",
          "pi.outstanding_amount as outstandingAmount",
          "pi.status", "pi.match_status as matchStatus",
          "pi.is_posted as isPosted", "pi.is_on_hold as isOnHold",
          "pi.is_credit_note as isCreditNote", "pi.is_reversal as isReversal",
          "s.code as supplierCode", "s.name as supplierName",
        ])
        .where("pi.tenant_id", "=", tenantId)
        .where("pi.company_code_id", "in", companyIds)
        .where("pi.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("pi.period_number", "=", parsed.period) as typeof q;
      if (status) q = q.where("pi.status", "=", status) as typeof q;
      if (supplierId) q = q.where("pi.supplier_id", "=", supplierId) as typeof q;

      const [items, countRow] = await Promise.all([
        q.orderBy("pi.posting_date", "desc").orderBy("pi.invoice_number", "desc")
          .limit(limit).offset(offset).execute(),
        db.selectFrom("document.purchase_invoice as pi")
          .select(db.fn.countAll().as("total"))
          .where("pi.tenant_id", "=", tenantId)
          .where("pi.company_code_id", "in", companyIds)
          .where("pi.fiscal_year", "=", parsed.fiscalYear)
          .$if(parsed.period !== null, (qb) => qb.where("pi.period_number", "=", parsed.period as number))
          .$if(!!status, (qb) => qb.where("pi.status", "=", status as string))
          .$if(!!supplierId, (qb) => qb.where("pi.supplier_id", "=", supplierId as string))
          .executeTakeFirst(),
      ]);

      res.json({ items, total: Number(countRow?.total ?? 0) });
    } catch (err) { logger?.error("finance_ap_invoices_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ap/invoices/:id ─────────────────────────────────────
  router.get("/finance/ap/invoices/:id", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const invoiceId = req.params["id"] as string;
      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .leftJoin("master.supplier as s", (jb) =>
          jb.onRef("s.id", "=", "pi.supplier_id").on("s.tenant_id", "=", tenantId),
        )
        .selectAll("pi")
        .select(["s.code as supplierCode", "s.name as supplierName"])
        .where("pi.tenant_id", "=", tenantId)
        .where("pi.id", "=", invoiceId)
        .executeTakeFirst();

      if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

      const lines = await db
        .selectFrom("document.purchase_invoice_line as pil")
        .selectAll()
        .where("pil.tenant_id", "=", tenantId)
        .where("pil.purchase_invoice_id", "=", invoiceId)
        .orderBy("pil.line_no", "asc")
        .execute();

      const allocations = await db
        .selectFrom("document.payment_entry_allocation as pea")
        .innerJoin("document.payment_entry as pe", "pe.id", "pea.payment_entry_id")
        .select([
          "pea.id", "pea.allocated_amount as allocatedAmount",
          "pea.discount_amount as discountAmount",
          "pea.net_payment_amount as netPaymentAmount",
          "pe.payment_number as paymentNumber",
          "pe.posting_date as postingDate", "pe.status as paymentStatus",
        ])
        .where("pea.tenant_id", "=", tenantId)
        .where("pea.purchase_invoice_id", "=", invoiceId)
        .orderBy("pe.posting_date", "desc")
        .execute();

      res.json({ ...invoice, lines, allocations });
    } catch (err) { logger?.error("finance_ap_invoice_detail_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ap/payments ─────────────────────────────────────────
  router.get("/finance/ap/payments", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;

      let q = db
        .selectFrom("document.payment_entry as pe")
        .select([
          "pe.id", "pe.payment_number as paymentNumber",
          "pe.payment_type as paymentType", "pe.payment_direction as paymentDirection",
          "pe.supplier_name as supplierName", "pe.supplier_id as supplierId",
          "pe.payment_amount as paymentAmount", "pe.currency_code as currencyCode",
          "pe.base_amount as baseAmount", "pe.base_currency_code as baseCurrencyCode",
          "pe.document_date as documentDate", "pe.posting_date as postingDate",
          "pe.value_date as valueDate", "pe.fiscal_year as fiscalYear",
          "pe.payment_reference as paymentReference",
          "pe.bank_reference as bankReference",
          "pe.is_posted as isPosted", "pe.is_transmitted as isTransmitted",
          "pe.is_voided as isVoided", "pe.status",
        ])
        .where("pe.tenant_id", "=", tenantId)
        .where("pe.company_code_id", "in", companyIds)
        .where("pe.payment_direction", "=", "OUTBOUND")
        .where("pe.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("pe.period_number", "=", parsed.period) as typeof q;
      if (status) q = q.where("pe.status", "=", status) as typeof q;

      const [items, countRow] = await Promise.all([
        q.orderBy("pe.posting_date", "desc").orderBy("pe.payment_number", "desc")
          .limit(limit).offset(offset).execute(),
        (q as typeof q).clearSelect().select(db.fn.countAll().as("total")).executeTakeFirst(),
      ]);

      res.json({ items, total: Number((countRow as Record<string, unknown> | undefined)?.["total"] ?? 0) });
    } catch (err) { logger?.error("finance_ap_payments_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/ap/payments ────────────────────────────────────────────
  // Create a draft payment entry for an AP invoice.
  //
  // Body:
  //   invoice_id         — purchase_invoice.id (UUID)
  //   payment_method_id  — master.payment_method.id (UUID)
  //   value_date?        — payment value date (ISO date, defaults to today)
  //   notes?             — optional memo
  //
  // Creates:
  //   document.payment_entry (status='draft', is_batch_payment=false)
  //   document.payment_entry_allocation (line_no=1, allocated_amount=outstanding_amount)
  //
  // Returns 201 { payment_entry_id, payment_number, status }.
  router.post("/finance/ap/payments", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const invoiceId       = String(body["invoice_id"]        ?? "").trim();
      const paymentMethodId = String(body["payment_method_id"] ?? "").trim();

      if (!invoiceId || !isUuid(invoiceId)) {
        res.status(400).json({ error: "INVALID_INVOICE_ID" });
        return;
      }
      if (!paymentMethodId || !isUuid(paymentMethodId)) {
        res.status(400).json({ error: "INVALID_PAYMENT_METHOD_ID" });
        return;
      }

      const today     = new Date().toISOString().slice(0, 10);
      const valueDate = body["value_date"] ? String(body["value_date"]) : today;
      const notes     = body["notes"] ? String(body["notes"]) : null;

      // Load invoice
      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .leftJoin("master.supplier as s", (jb) =>
          jb.onRef("s.id", "=", "pi.supplier_id").on("s.tenant_id", "=", tenantId),
        )
        .select([
          "pi.id",
          "pi.company_code_id as companyCodeId",
          "pi.supplier_id     as supplierId",
          "pi.currency_code   as currencyCode",
          "pi.outstanding_amount as outstandingAmount",
          "pi.fiscal_year     as fiscalYear",
          "pi.period_number   as periodNumber",
          "pi.status",
          "s.name             as supplierName",
        ])
        .where("pi.id",        "=", invoiceId)
        .where("pi.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!invoice) {
        res.status(404).json({ error: "INVOICE_NOT_FOUND" });
        return;
      }

      const outstanding = parseFloat(String(invoice["outstandingAmount"] ?? "0"));
      if (outstanding <= 0) {
        res.status(409).json({ error: "NO_OUTSTANDING", message: "Invoice has no outstanding balance" });
        return;
      }

      // Validate payment method belongs to tenant
      const paymentMethod = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id"])
        .where("pm.id",        "=", paymentMethodId)
        .where("pm.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string } | undefined;

      if (!paymentMethod) {
        res.status(400).json({ error: "PAYMENT_METHOD_NOT_FOUND" });
        return;
      }

      // Auto-generate payment number: PAY-{YYYY}-{seq}
      const fiscalYear = Number(invoice["fiscalYear"]);
      const countRow = await db
        .selectFrom("document.payment_entry as pe")
        .select(db.fn.countAll().as("cnt"))
        .where("pe.tenant_id",  "=", tenantId)
        .where("pe.fiscal_year", "=", fiscalYear)
        .executeTakeFirst() as { cnt: string | number } | undefined;
      const seq = parseInt(String(countRow?.cnt ?? "0"), 10) + 1;
      const paymentNumber = `PAY-${fiscalYear}-${String(seq).padStart(5, "0")}`;

      const paymentEntryId = randomUUID();
      const currencyCode   = String(invoice["currencyCode"]);

      await db.transaction().execute(async (trx) => {
        // Insert payment_entry (draft)
        await trx
          .insertInto("document.payment_entry" as never)
          .values({
            id:                 paymentEntryId,
            tenant_id:          tenantId,
            company_code_id:    invoice["companyCodeId"],
            payment_number:     paymentNumber,
            payment_type:       "STANDARD",
            payment_direction:  "OUTBOUND",
            supplier_id:        invoice["supplierId"] ?? null,
            supplier_name:      invoice["supplierName"] ?? "Unknown Supplier",
            payment_method_id:  paymentMethodId,
            value_date:         valueDate,
            document_date:      today,
            posting_date:       today,
            currency_code:      currencyCode,
            base_currency_code: currencyCode,
            payment_amount:     outstanding.toFixed(4),
            base_amount:        outstanding.toFixed(4),
            fiscal_year:        fiscalYear,
            period_number:      Number(invoice["periodNumber"]),
            status:             "draft",
            is_batch_payment:   false,
            is_posted:          false,
            is_printed:         false,
            is_transmitted:     false,
            is_voided:          false,
            is_reversal:        false,
            line_count:         1,
            notes:              notes,
            tags:               sql`'[]'::jsonb`,
            metadata:           sql`'{}'::jsonb`,
            created_at:         sql`now()`,
            created_by:         principalId,
          } as never)
          .execute();

        // Insert payment_entry_allocation
        await trx
          .insertInto("document.payment_entry_allocation" as never)
          .values({
            id:                randomUUID(),
            tenant_id:         tenantId,
            payment_entry_id:  paymentEntryId,
            line_no:           1,
            purchase_invoice_id: invoiceId,
            currency_code:     currencyCode,
            allocated_amount:  outstanding.toFixed(4),
            discount_amount:   "0",
            withholding_tax_amount: "0",
            advance_recovery_amount: "0",
            retention_amount:  "0",
            created_at:        sql`now()`,
            created_by:        principalId,
          } as never)
          .execute();
      });

      logger?.info?.("finance_ap_payment_created", {
        paymentEntryId, paymentNumber, invoiceId, tenantId,
      });

      res.status(201).json({
        payment_entry_id: paymentEntryId,
        payment_number:   paymentNumber,
        status:           "draft",
      });
    } catch (err) {
      logger?.error("finance_ap_payment_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ap/payment-methods ──────────────────────────────────────
  // List active payment methods for the tenant, scoped to OUTBOUND direction.
  router.get("/finance/ap/payment-methods", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const methods = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id", "pm.code", "pm.name", "pm.direction", "pm.is_active as isActive"])
        .where("pm.tenant_id", "=", tenantId)
        .where("pm.is_active", "=", true)
        .where((eb) => eb.or([
          eb("pm.direction", "=", "OUTBOUND"),
          eb("pm.direction", "=", "BOTH"),
        ]))
        .orderBy("pm.name", "asc")
        .execute() as Array<{ id: string; code: string; name: string; direction: string; isActive: boolean }>;

      res.json({ items: methods });
    } catch (err) {
      logger?.error("finance_ap_payment_methods_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ap/aging ─────────────────────────────────────────────
  // AP aging: outstanding invoices bucketed by days overdue.
  router.get("/finance/ap/aging", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      // Use raw SQL for the conditional SUM aging buckets
      const { rows } = await sql<{
        supplier_id: string | null;
        supplier_code: string | null;
        supplier_name: string | null;
        current_amount: string;
        days_1_30: string;
        days_31_60: string;
        days_61_90: string;
        over_90: string;
        total_outstanding: string;
      }>`
        SELECT
          pi.supplier_id,
          s.code AS supplier_code,
          s.name AS supplier_name,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date IS NULL OR pi.due_date >= CURRENT_DATE), 0) AS current_amount,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE
              AND pi.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS days_1_30,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE - INTERVAL '30 days'
              AND pi.due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) AS days_31_60,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE - INTERVAL '60 days'
              AND pi.due_date >= CURRENT_DATE - INTERVAL '90 days'), 0) AS days_61_90,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE - INTERVAL '90 days'), 0) AS over_90,
          SUM(pi.outstanding_amount) AS total_outstanding
        FROM document.purchase_invoice pi
        LEFT JOIN master.supplier s
          ON s.id = pi.supplier_id AND s.tenant_id = pi.tenant_id
        WHERE pi.tenant_id = ${tenantId}::uuid
          AND pi.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          AND pi.outstanding_amount > 0
          AND pi.status NOT IN ('cancelled', 'reversed', 'rejected', 'draft')
        GROUP BY pi.supplier_id, s.code, s.name
        ORDER BY total_outstanding DESC
      `.execute(db);

      const result = rows.map((r) => ({
        supplierId:       r.supplier_id,
        supplierCode:     r.supplier_code,
        supplierName:     r.supplier_name ?? "Unknown",
        currentAmount:    parseFloat(r.current_amount),
        days1to30:        parseFloat(r.days_1_30),
        days31to60:       parseFloat(r.days_31_60),
        days61to90:       parseFloat(r.days_61_90),
        over90:           parseFloat(r.over_90),
        totalOutstanding: parseFloat(r.total_outstanding),
      }));

      res.json({ rows: result, asAt: new Date().toISOString() });
    } catch (err) { logger?.error("finance_ap_aging_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ar/receipts ──────────────────────────────────────────
  // AR receipts = payment_entry WHERE payment_direction = 'INBOUND'
  router.get("/finance/ar/receipts", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;

      let q = db
        .selectFrom("document.payment_entry as pe")
        .select([
          "pe.id", "pe.payment_number as paymentNumber",
          "pe.payment_type as paymentType", "pe.payment_direction as paymentDirection",
          "pe.supplier_name as counterpartyName",
          "pe.payment_amount as paymentAmount", "pe.currency_code as currencyCode",
          "pe.base_amount as baseAmount", "pe.base_currency_code as baseCurrencyCode",
          "pe.document_date as documentDate", "pe.posting_date as postingDate",
          "pe.value_date as valueDate", "pe.fiscal_year as fiscalYear",
          "pe.payment_reference as paymentReference",
          "pe.bank_reference as bankReference",
          "pe.is_posted as isPosted", "pe.status",
        ])
        .where("pe.tenant_id", "=", tenantId)
        .where("pe.company_code_id", "in", companyIds)
        .where("pe.payment_direction", "=", "INBOUND")
        .where("pe.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("pe.period_number", "=", parsed.period) as typeof q;
      if (status) q = q.where("pe.status", "=", status) as typeof q;

      const [items, countRow] = await Promise.all([
        q.orderBy("pe.posting_date", "desc").orderBy("pe.payment_number", "desc")
          .limit(limit).offset(offset).execute(),
        (q as typeof q).clearSelect().select(db.fn.countAll().as("total")).executeTakeFirst(),
      ]);

      res.json({ items, total: Number((countRow as Record<string, unknown> | undefined)?.["total"] ?? 0) });
    } catch (err) { logger?.error("finance_ar_receipts_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ar/aging ─────────────────────────────────────────────
  // AR aging: outstanding sales invoices bucketed by days overdue, grouped by customer.
  // Returns empty rows gracefully when document.sales_invoice does not yet exist.
  router.get("/finance/ar/aging", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const { rows } = await sql<{
        customer_id:       string | null;
        customer_code:     string | null;
        customer_name:     string | null;
        current_amount:    string;
        days_1_30:         string;
        days_31_60:        string;
        days_61_90:        string;
        over_90:           string;
        total_outstanding: string;
      }>`
        SELECT
          si.customer_id,
          c.code  AS customer_code,
          c.name  AS customer_name,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date IS NULL OR si.due_date >= CURRENT_DATE), 0) AS current_amount,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE
              AND si.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)  AS days_1_30,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE - INTERVAL '30 days'
              AND si.due_date >= CURRENT_DATE - INTERVAL '60 days'), 0)  AS days_31_60,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE - INTERVAL '60 days'
              AND si.due_date >= CURRENT_DATE - INTERVAL '90 days'), 0)  AS days_61_90,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE - INTERVAL '90 days'), 0)   AS over_90,
          SUM(si.outstanding_amount)                                      AS total_outstanding
        FROM document.sales_invoice si
        LEFT JOIN master.customer c
               ON c.id = si.customer_id AND c.tenant_id = si.tenant_id
        WHERE si.tenant_id       = ${tenantId}::uuid
          AND si.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          AND si.outstanding_amount > 0
          AND si.status NOT IN ('cancelled', 'reversed', 'rejected', 'draft')
        GROUP  BY si.customer_id, c.code, c.name
        ORDER  BY total_outstanding DESC
      `.execute(db);

      res.json({
        rows: rows.map((r) => ({
          customerId:   r.customer_id,
          customerCode: r.customer_code,
          customerName: r.customer_name ?? "Unknown",
          current:      parseFloat(r.current_amount),
          days1to30:    parseFloat(r.days_1_30),
          days31to60:   parseFloat(r.days_31_60),
          days61to90:   parseFloat(r.days_61_90),
          over90:       parseFloat(r.over_90),
          total:        parseFloat(r.total_outstanding),
        })),
        asAt: new Date().toISOString(),
      });
    } catch (err) {
      // Graceful fallback: if sales_invoice table doesn't exist yet, return empty.
      // Check PG error code 42P01 (undefined_table) or the error message — but
      // avoid swallowing real data errors (FK violations etc contain "relation" too).
      const code = (err as Record<string, unknown>)?.["code"];
      const msg  = String(err);
      if (code === "42P01" || msg.includes("does not exist")) {
        res.json({ rows: [], asAt: new Date().toISOString() });
        return;
      }
      logger?.error("finance_ar_aging_error", { err: msg });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ar/invoices ─────────────────────────────────────────
  // Returns AR (sales) invoices. Gracefully returns empty when the sales
  // module / document.sales_invoice table is not yet activated for the tenant.
  router.get("/finance/ar/invoices", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;

      const { rows: items } = await sql<Record<string, unknown>>`
        SELECT
          si.id,
          si.invoice_number                   AS "invoiceNumber",
          si.customer_id                      AS "customerId",
          c.name                              AS "customerName",
          si.invoice_date                     AS "invoiceDate",
          si.due_date                         AS "dueDate",
          si.currency_code                    AS "currencyCode",
          si.total_amount                     AS "totalAmount",
          si.receivable_amount                AS "receivableAmount",
          si.received_amount                  AS "receivedAmount",
          si.outstanding_amount               AS "outstandingAmount",
          si.status,
          si.fiscal_year                      AS "fiscalYear",
          si.period_number                    AS "periodNumber",
          si.posting_date                     AS "postingDate",
          si.is_posted                        AS "isPosted",
          si.is_voided                        AS "isVoided"
        FROM document.sales_invoice si
        LEFT JOIN master.customer c
               ON c.id = si.customer_id AND c.tenant_id = si.tenant_id
        WHERE si.tenant_id       = ${tenantId}::uuid
          AND si.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          AND si.fiscal_year     = ${parsed.fiscalYear}
          ${status ? sql`AND si.status = ${status}` : sql``}
        ORDER BY si.posting_date DESC, si.invoice_number DESC
        LIMIT  ${limit}
        OFFSET ${offset}
      `.execute(db);

      const { rows: countRows } = await sql<{ cnt: string }>`
        SELECT COUNT(*) AS cnt
        FROM document.sales_invoice si
        WHERE si.tenant_id       = ${tenantId}::uuid
          AND si.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          AND si.fiscal_year     = ${parsed.fiscalYear}
          ${status ? sql`AND si.status = ${status}` : sql``}
      `.execute(db);

      res.json({ items, total: parseInt(String(countRows[0]?.["cnt"] ?? "0"), 10) });
    } catch (err) {
      // Graceful fallback — sales_invoice table may not exist yet
      const code = (err as Record<string, unknown>)?.["code"];
      const msg  = String(err);
      if (code === "42P01" || msg.includes("does not exist")) {
        res.json({ items: [], total: 0, _inactive: true });
        return;
      }
      logger?.error("finance_ar_invoices_error", { err: msg });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/finance/ar/receipts ─────────────────────────────────────────
  // Create a standalone draft receipt (INBOUND payment entry) for a cash receipt
  // from a customer. Not linked to an invoice (no allocation row needed).
  //
  // Body:
  //   payment_method_id  — master.payment_method.id (UUID)
  //   payment_amount     — receipt amount (number > 0)
  //   currency_code      — ISO 4217 (e.g. "USD")
  //   counterparty_name  — customer or payer name
  //   value_date?        — receipt value date (ISO date, defaults to today)
  //   payment_reference? — customer reference / invoice number cited
  //   notes?             — optional memo
  //
  // Returns 201 { payment_entry_id, payment_number, status }.
  router.post("/finance/ar/receipts", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "TENANT_NOT_FOUND" }); return; }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const body            = req.body as Record<string, unknown>;
      const paymentMethodId = String(body["payment_method_id"] ?? "").trim();
      const amountRaw       = parseFloat(String(body["payment_amount"] ?? "0"));
      const currencyCode    = String(body["currency_code"] ?? "").trim().toUpperCase();
      const counterpartyName = String(body["counterparty_name"] ?? "Unknown").trim();

      if (!paymentMethodId || !isUuid(paymentMethodId))
        { res.status(400).json({ error: "INVALID_PAYMENT_METHOD_ID" }); return; }
      if (isNaN(amountRaw) || amountRaw <= 0)
        { res.status(400).json({ error: "INVALID_AMOUNT" }); return; }
      if (!currencyCode)
        { res.status(400).json({ error: "INVALID_CURRENCY_CODE" }); return; }

      const today     = new Date().toISOString().slice(0, 10);
      const valueDate = body["value_date"]        ? String(body["value_date"])        : today;
      const payRef    = body["payment_reference"] ? String(body["payment_reference"]) : null;
      const notes     = body["notes"]             ? String(body["notes"])             : null;

      // Determine company code from scope params
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0)
        { res.status(400).json({ error: "COMPANY_NOT_FOUND" }); return; }
      const companyCodeId = companies[0]!.company_code_id;

      // Validate payment method (must be INBOUND or BOTH)
      const paymentMethod = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id"])
        .where("pm.id",        "=", paymentMethodId)
        .where("pm.tenant_id", "=", tenantId)
        .where((eb) => eb.or([eb("pm.direction", "=", "INBOUND"), eb("pm.direction", "=", "BOTH")]))
        .executeTakeFirst() as { id: string } | undefined;

      if (!paymentMethod) { res.status(400).json({ error: "PAYMENT_METHOD_NOT_FOUND" }); return; }

      // Auto-generate receipt number: REC-{YYYY}-{seq}
      const fiscalYear = parsed.fiscalYear;
      const countRow = await db
        .selectFrom("document.payment_entry as pe")
        .select(db.fn.countAll().as("cnt"))
        .where("pe.tenant_id",          "=", tenantId)
        .where("pe.fiscal_year",        "=", fiscalYear)
        .where("pe.payment_direction",  "=", "INBOUND")
        .executeTakeFirst() as { cnt: string | number } | undefined;
      const seq = parseInt(String(countRow?.cnt ?? "0"), 10) + 1;
      const paymentNumber = `REC-${fiscalYear}-${String(seq).padStart(5, "0")}`;

      const paymentEntryId = randomUUID();

      await db
        .insertInto("document.payment_entry" as never)
        .values({
          id:                 paymentEntryId,
          tenant_id:          tenantId,
          company_code_id:    companyCodeId,
          payment_number:     paymentNumber,
          payment_type:       "STANDARD",
          payment_direction:  "INBOUND",
          supplier_name:      counterpartyName,          // stores customer name
          payment_method_id:  paymentMethodId,
          value_date:         valueDate,
          document_date:      today,
          posting_date:       today,
          currency_code:      currencyCode,
          base_currency_code: currencyCode,
          payment_amount:     amountRaw.toFixed(4),
          base_amount:        amountRaw.toFixed(4),
          fiscal_year:        fiscalYear,
          period_number:      parsed.period ?? 1,
          payment_reference:  payRef,
          status:             "draft",
          is_batch_payment:   false,
          is_posted:          false,
          is_printed:         false,
          is_transmitted:     false,
          is_voided:          false,
          is_reversal:        false,
          line_count:         0,
          notes:              notes,
          tags:               sql`'[]'::jsonb`,
          metadata:           sql`'{}'::jsonb`,
          created_at:         sql`now()`,
          created_by:         principalId,
        } as never)
        .execute();

      logger?.info?.("finance_ar_receipt_created", { paymentEntryId, paymentNumber, tenantId });

      res.status(201).json({ payment_entry_id: paymentEntryId, payment_number: paymentNumber, status: "draft" });
    } catch (err) {
      logger?.error("finance_ar_receipt_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ar/payment-methods ──────────────────────────────────────
  // List active payment methods for the tenant, scoped to INBOUND direction.
  router.get("/finance/ar/payment-methods", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const methods = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id", "pm.code", "pm.name", "pm.direction"])
        .where("pm.tenant_id", "=", tenantId)
        .where("pm.is_active", "=", true)
        .where((eb) => eb.or([
          eb("pm.direction", "=", "INBOUND"),
          eb("pm.direction", "=", "BOTH"),
        ]))
        .orderBy("pm.name", "asc")
        .execute() as Array<{ id: string; code: string; name: string; direction: string }>;

      res.json({ items: methods });
    } catch (err) {
      logger?.error("finance_ar_payment_methods_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}
