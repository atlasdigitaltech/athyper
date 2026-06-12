/**
 * Invoice Intake Routes — Phase 6
 *
 * Machine-to-machine endpoints for structured invoice ingestion.
 * Auth: Bearer token (service account) — same verifyBearer as all other routes.
 *
 * POST /api/intake/ap/invoice         — cXML InvoiceDetailRequest
 * POST /api/intake/ap/invoice/edifact — EDIFACT INVOIC D96A
 *
 * Design constraints:
 *   - invoice_source is the business-origin field (non_po / po_based);
 *     NOT the intake channel. Use metadata.intake_channel for AI/EDI signals.
 *   - metadata.intake_channel is set to 'edi_cxml' or 'edi_edifact'.
 *   - Duplicate prevention: checks for existing invoice with
 *     (tenant_id, company_code_id, supplier_id, supplier_invoice_number)
 *     and returns 409 Conflict if found.
 *   - po_based invoices need an explicit company_code_id in query params
 *     since the body carries the PO ref but no company code.
 *   - Field name: line_no (DDL canonical), not line_number.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { verifyBearer, resolveTenantId, isUuid, resolvePrincipalIdOrNull, extractOrgHeaders } from "@athyper/svc-shared";
import { type FinanceRouteDeps } from "./finance.route.js";
import { parseCxmlInvoice, parseEdifactInvoice, type IntakeInvoiceBody, handleCreateApInvoice } from "@athyper/svc-business";

// ── Route factory ─────────────────────────────────────────────────────────────

export function createIntakeRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── POST /api/intake/ap/invoice — cXML ─────────────────────────────────────
  // Content-Type: application/xml or text/xml
  // Query params: company_code_id (required), supplier_id (optional — resolved from tax ID)
  router.post("/intake/ap/invoice", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const principalId = await resolvePrincipalIdOrNull(db, String(claims.sub ?? ""), tenantId, xRealm);

      const companyCodeId = String(req.query["company_code_id"] ?? "");
      if (!isUuid(companyCodeId)) {
        res.status(400).json({ error: "MISSING_PARAM", message: "company_code_id query parameter (UUID) is required" });
        return;
      }

      // Read raw body — express should have populated req.body with text/xml
      const rawXml = typeof req.body === "string"
        ? req.body
        : req.body instanceof Buffer
        ? req.body.toString("utf8")
        : JSON.stringify(req.body);

      if (!rawXml?.trim()) {
        res.status(400).json({ error: "MISSING_BODY", message: "Request body must be a cXML document" });
        return;
      }

      let parsed: IntakeInvoiceBody;
      try {
        parsed = parseCxmlInvoice(rawXml);
      } catch (parseErr) {
        res.status(422).json({ error: "PARSE_ERROR", message: String(parseErr) }); return;
      }

      // Resolve supplier_id from tax ID if not provided
      let supplierId: string | undefined = req.query["supplier_id"] as string | undefined;
      if (!supplierId && parsed._supplier_tax_id) {
        supplierId = await resolveSupplierByTaxId(db, tenantId, parsed._supplier_tax_id) ?? undefined;
      }
      if (!supplierId && parsed._supplier_name) {
        supplierId = await resolveSupplierByName(db, tenantId, parsed._supplier_name) ?? undefined;
      }

      // Duplicate prevention
      if (supplierId && parsed.supplier_invoice_number) {
        const dup = await checkDuplicate(db, tenantId, companyCodeId, supplierId, parsed.supplier_invoice_number);
        if (dup) { res.status(409).json({ error: "DUPLICATE_INVOICE", invoiceId: dup }); return; }
      }

      const createBody = {
        ...parsed,
        company_code_id:  companyCodeId,
        supplier_id:      supplierId,
        idempotency_key:  parsed.supplier_invoice_number
          ? `cxml:${tenantId}:${companyCodeId}:${supplierId ?? ""}:${parsed.supplier_invoice_number}`
          : undefined,
      };

      const result = await handleCreateApInvoice(db, tenantId, principalId, createBody, logger);

      // Stamp metadata.intake_channel on the created invoice
      if (result.status === 201 && result.body["invoiceId"]) {
        await stampIntakeChannel(db, result.body["invoiceId"] as string, "edi_cxml");
      }

      // Lines are created by the caller via the AP line API; returned in draft for client wiring
      res.status(result.status).json({ ...result.body, _lines: parsed.lines });
    } catch (err) { logger?.error("intake_ap_cxml_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/intake/ap/invoice/edifact — EDIFACT ──────────────────────────
  // Content-Type: text/plain (raw EDIFACT message)
  router.post("/intake/ap/invoice/edifact", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const principalId = await resolvePrincipalIdOrNull(db, String(claims.sub ?? ""), tenantId, xRealm);

      const companyCodeId = String(req.query["company_code_id"] ?? "");
      if (!isUuid(companyCodeId)) {
        res.status(400).json({ error: "MISSING_PARAM", message: "company_code_id query parameter (UUID) is required" });
        return;
      }

      const rawMsg = typeof req.body === "string"
        ? req.body
        : req.body instanceof Buffer
        ? req.body.toString("utf8")
        : "";

      if (!rawMsg?.trim()) {
        res.status(400).json({ error: "MISSING_BODY", message: "Request body must be an EDIFACT INVOIC message" });
        return;
      }

      let parsed: IntakeInvoiceBody;
      try {
        parsed = parseEdifactInvoice(rawMsg);
      } catch (parseErr) {
        res.status(422).json({ error: "PARSE_ERROR", message: String(parseErr) }); return;
      }

      let supplierId: string | undefined = req.query["supplier_id"] as string | undefined;
      if (!supplierId && parsed._supplier_tax_id) {
        supplierId = await resolveSupplierByTaxId(db, tenantId, parsed._supplier_tax_id) ?? undefined;
      }
      if (!supplierId && parsed._supplier_name) {
        supplierId = await resolveSupplierByName(db, tenantId, parsed._supplier_name) ?? undefined;
      }

      if (supplierId && parsed.supplier_invoice_number) {
        const dup = await checkDuplicate(db, tenantId, companyCodeId, supplierId, parsed.supplier_invoice_number);
        if (dup) { res.status(409).json({ error: "DUPLICATE_INVOICE", invoiceId: dup }); return; }
      }

      const createBody = {
        ...parsed,
        company_code_id:  companyCodeId,
        supplier_id:      supplierId,
        idempotency_key:  parsed.supplier_invoice_number
          ? `edifact:${tenantId}:${companyCodeId}:${supplierId ?? ""}:${parsed.supplier_invoice_number}`
          : undefined,
      };

      const result = await handleCreateApInvoice(db, tenantId, principalId, createBody, logger);

      if (result.status === 201 && result.body["invoiceId"]) {
        await stampIntakeChannel(db, result.body["invoiceId"] as string, "edi_edifact");
      }

      res.status(result.status).json({ ...result.body, _lines: parsed.lines });
    } catch (err) { logger?.error("intake_ap_edifact_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  return router;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveSupplierByTaxId(db: Kysely<any>, tenantId: string, taxId: string): Promise<string | null> {
  const row = await db
    .selectFrom("master.supplier as s")
    .select("s.id")
    .where("s.tenant_id", "=", tenantId)
    .where((eb) => eb.or([
      eb("s.tax_id", "=", taxId),
      eb("s.registration_number", "=", taxId),
    ]))
    .where("s.is_active", "=", true)
    .limit(1)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveSupplierByName(db: Kysely<any>, tenantId: string, name: string): Promise<string | null> {
  const row = await db
    .selectFrom("master.supplier as s")
    .select("s.id")
    .where("s.tenant_id", "=", tenantId)
    .where("s.name",      "ilike", name.trim())
    .where("s.is_active", "=", true)
    .limit(1)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkDuplicate(db: Kysely<any>, tenantId: string, companyCodeId: string, supplierId: string, invoiceNumber: string): Promise<string | null> {
  const row = await db
    .selectFrom("document.purchase_invoice as pi")
    .select("pi.id")
    .where("pi.tenant_id",              "=", tenantId)
    .where("pi.company_code_id",        "=", companyCodeId)
    .where("pi.supplier_id",            "=", supplierId)
    .where("pi.supplier_invoice_number","=", invoiceNumber)
    .where("pi.status",                 "not in", ["cancelled", "voided"])
    .limit(1)
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stampIntakeChannel(db: Kysely<any>, invoiceId: string, channel: string): Promise<void> {
  await sql`
    UPDATE document.purchase_invoice
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'),
             '{intake_channel}',
             ${JSON.stringify(channel)}::jsonb
           ),
           updated_at = now()
     WHERE id = ${invoiceId}::uuid
  `.execute(db);
}
