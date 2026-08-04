/**
 * Line-source picker routes (P2P plan Plan E1)
 *
 * Backs the four source-adapter pickers exposed in
 *   packages/shared/runtime-domain/runtime-line-item/src/adapters/{catalog,open-po-line,
 *   open-receipt-line,open-service-sheet-line}.ts
 * with real data so the in-app "Add from â€¦" dropdowns stop returning
 * empty pages. The neon app fetches from the BFF relay; the relay forwards
 * to the routes below.
 *
 * Endpoints:
 *   GET /api/p2p/open-po-lines             â€” open commitment_line picker
 *   GET /api/p2p/open-receipt-lines        â€” open receipt_line picker (for invoicing)
 *   GET /api/p2p/open-service-sheet-lines  â€” open service_sheet_line picker (for invoicing)
 *   GET /api/p2p/catalog/items             â€” catalog item picker (empty until catalog tables land)
 *
 * Guardrails enforced at the SQL layer (NOT trusted from the client):
 *   - Tenant filter      â€” always WHERE tenant_id = :session_tenant_id
 *   - Lifecycle filter   â€” exclude terminal_status IS NOT NULL rows;
 *                          enforce parent status allowlist per consumer
 *   - Remaining-qty      â€” only show rows with remaining > 0 where applicable
 *   - Pagination         â€” default 25, max 100; cursor-less offset paging
 *
 * The response shape matches the Page<Selection> contract from
 *   packages/shared/runtime-domain/runtime-add-item/src/adapter/types.ts
 * so the source-adapter `fetchLines` callback can pass it through unchanged.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  extractOrgHeaders,
  resolvePrincipalIdWithJit,
  extractVerifiedRequestContextHints,
  resolveVerifiedRequestContext,
  getLifecycleStatesWithFlag,
} from "@athyper/svc-shared";
import {
  readEffectivePermissionContext,
  resolveCompanyCodeScope,
} from "@athyper/svc-iam";
import {
  createCommitmentFromRequisition,
  createReceiptFromCommitment,
  createServiceSheetFromCommitment,
  createInvoiceFromReceipt,
  createInvoiceFromServiceSheet,
  createPaymentFromInvoice,
  resolveCompanyAndBaseCurrency,
  resolveFiscalPeriod,
  allocateDocumentNumber,
  type CommitmentFromRequisitionLineInput,
  type ReceiptFromCommitmentLineInput,
  type ServiceSheetFromCommitmentLineInput,
  type InvoiceFromReceiptLineInput,
  type InvoiceFromServiceSheetLineInput,
  type PaymentFromInvoiceAllocationInput,
} from "@athyper/svc-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface LineSourceRouteDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

interface PageOut<T> {
  items:       T[];
  total?:      number;
  nextCursor?: string | null;
}

interface SourceCompanyRow {
  company_code_id: string;
}

type SourceCompanyOutcome =
  | { ok: true; companyCodeId: string }
  | { ok: false; status: number; error: string; message: string };

async function loadReceiptCompanyCode(
  db: AnyDb,
  tenantId: string,
  receiptId: string,
): Promise<string | null> {
  const result = await sql<SourceCompanyRow>`
    SELECT company_code_id
      FROM document.receipt
     WHERE tenant_id = ${tenantId}::uuid
       AND id        = ${receiptId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.company_code_id ?? null;
}

async function loadPaymentInvoiceCompanyCode(
  db: AnyDb,
  tenantId: string,
  allocations: PaymentFromInvoiceAllocationInput[],
): Promise<SourceCompanyOutcome> {
  const invoiceIds = [...new Set(allocations.map((allocation) => allocation.invoiceId).filter(Boolean))];
  if (invoiceIds.length === 0) {
    return { ok: false, status: 400, error: "NO_ALLOCATIONS", message: "At least one invoice allocation is required." };
  }

  const result = await sql<{ company_code_id: string; invoice_count: string | number }>`
    SELECT company_code_id, COUNT(DISTINCT id)::int AS invoice_count
      FROM document.purchase_invoice
     WHERE tenant_id = ${tenantId}::uuid
       AND id        = ANY(${invoiceIds}::uuid[])
     GROUP BY company_code_id
  `.execute(db);

  const foundCount = result.rows.reduce((sum, row) => sum + Number(row.invoice_count ?? 0), 0);
  if (foundCount !== invoiceIds.length) {
    return { ok: false, status: 404, error: "INVOICES_NOT_FOUND", message: "One or more selected invoices were not found for tenant." };
  }
  if (result.rows.length !== 1) {
    return { ok: false, status: 422, error: "MULTIPLE_COMPANIES", message: "All payment allocations must belong to one company_code_id." };
  }

  return { ok: true, companyCodeId: result.rows[0]!.company_code_id };
}

async function loadServiceSheetCompanyCode(
  db: AnyDb,
  tenantId: string,
  serviceSheetId: string,
): Promise<string | null> {
  const result = await sql<SourceCompanyRow>`
    SELECT company_code_id
      FROM document.service_sheet
     WHERE tenant_id = ${tenantId}::uuid
       AND id        = ${serviceSheetId}::uuid
     LIMIT 1
  `.execute(db);
  return result.rows[0]?.company_code_id ?? null;
}

// â”€â”€â”€ Selection-shape rows (match the adapter contracts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface OpenPoLineRow {
  poId:          string;
  poNumber:      string;
  lineId:        string;
  lineNumber:    number;
  description:   string;
  itemId:        string | null;
  itemCode:      string | null;
  baseUomCode:   string;
  remainingQty:  number;
  unitPrice:     number;
  currencyCode:  string;
  supplierId:    string | null;
  supplierCode:  string | null;
  isOpen:        boolean;
}

interface OpenReceiptLineRow {
  receiptId:     string;
  receiptNumber: string;
  receiptDate:   string;
  lineId:        string;
  lineNumber:    number;
  poId:          string | null;
  poNumber:      string | null;
  poLineId:      string | null;
  poLineNumber:  number | null;
  itemId:        string | null;
  itemCode:      string | null;
  description:   string;
  baseUomCode:   string;
  acceptedQty:   number;
  rejectedQty:   number;
  unitCost:      number;
  currencyCode:  string;
}

interface OpenRequisitionLineRow {
  prId:                string;
  prNumber:            string;
  prStatus:            string;
  lineId:              string;
  lineNumber:          number;
  itemId:              string | null;
  itemCode:            string | null;
  description:         string;
  baseUomCode:         string;
  remainingQty:        number;
  estimatedUnitPrice:  number;
  currencyCode:        string;
  requiredByDate:      string | null;
  suggestedSupplierId: string | null;
}

interface OpenServiceSheetLineRow {
  serviceSheetId:     string;
  serviceSheetNumber: string;
  certifiedDate:      string;
  servicePeriodStart: string;
  servicePeriodEnd:   string;
  lineId:             string;
  lineNumber:         number;
  poId:               string | null;
  poNumber:           string | null;
  poLineId:           string | null;
  poLineNumber:       number | null;
  itemId:             string | null;
  itemCode:           string | null;
  description:        string;
  baseUomCode:        string;
  acceptedQty:        number;
  unitPrice:          number;
  currencyCode:       string;
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;

function parsePageParams(req: { query: Record<string, unknown> }): {
  limit:  number;
  offset: number;
  q?:     string;
} {
  const raw = req.query;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(String(raw["limit"] ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, parseInt(String(raw["offset"] ?? 0), 10) || 0);
  const q      = typeof raw["q"] === "string" && raw["q"].trim() ? raw["q"].trim() : undefined;
  return { limit, offset, q };
}

async function requireTenantAuth(
  req:  Parameters<RequestHandler>[0],
  res:  Parameters<RequestHandler>[1],
  deps: LineSourceRouteDeps,
  permissionCode: string,
): Promise<{
  tenantId: string;
  principalId: string;
  companyCodeId?: string;
  legalEntityId?: string;
  /** null is an unrestricted tenant scope; [] is explicitly no access. */
  readableCompanyCodeIds: string[] | null;
} | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
  if (!claims) return null;
  const verified = await resolveVerifiedRequestContext(
    deps.db,
    claims,
    extractVerifiedRequestContextHints(req),
  );
  if (!verified.ok) {
    res.status(verified.status).json({ error: verified.error, message: verified.message });
    return null;
  }

  const context = verified.context;
  const permissions = readEffectivePermissionContext(res);
  if (!permissions) {
    res.status(403).json({
      error: "AUTHORIZATION_CONTEXT_REQUIRED",
      message: "Canonical authorization context is required.",
    });
    return null;
  }
  const scope = resolveCompanyCodeScope(permissions, permissionCode);

  // An active company is a routing selection, never an authorization grant.
  // It must also lie inside the principal's resolved company scope.
  if (context.companyCodeId && !scope.isUnrestricted && !scope.companyCodeIds.includes(context.companyCodeId)) {
    res.status(403).json({
      error: "COMPANY_SCOPE_DENIED",
      message: "The active company is outside the principal's authorized company scope.",
    });
    return null;
  }

  let readableCompanyCodeIds: string[] | null = scope.isUnrestricted
    ? null
    : [...scope.companyCodeIds];
  if (context.companyCodeId) {
    readableCompanyCodeIds = [context.companyCodeId];
  }
  if (context.legalEntityId) {
    const legalEntityCompanies = await deps.db
      .selectFrom("master.company_code as cc")
      .select("cc.id")
      .where("cc.tenant_id", "=", context.tenantId)
      .where("cc.legal_entity_id", "=", context.legalEntityId)
      .where("cc.status", "=", "active")
      .execute();
    const legalEntityIds = legalEntityCompanies.map((row) => row.id as string);
    readableCompanyCodeIds = readableCompanyCodeIds === null
      ? legalEntityIds
      : readableCompanyCodeIds.filter((id) => legalEntityIds.includes(id));
  }

  return { ...context, readableCompanyCodeIds };
}

// â”€â”€â”€ Route factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function createLineSourceRoute(router: Router, deps: LineSourceRouteDeps): Router {
  const { db, logger } = deps;

  // â”€â”€ GET /api/p2p/open-po-lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Open commitment_line rows (PO â€” standard or blanket) the user can add to
  // a downstream document (Receipt / SES / Invoice). Filters to commitments
  // in transactable states; excludes terminal lines; only returns lines
  // with remaining_quantity > 0.
  //
  // Query: ?supplierId=<uuid>&q=<search>&limit=&offset=
  const openPoLinesHandler: RequestHandler = async (req, res, next) => {
    try {
      const auth = await requireTenantAuth(
        req, res, deps, "neon.catalog.receipt.receipt_from_commitment",
      );
      if (!auth) return;
      const { tenantId, readableCompanyCodeIds } = auth;
      const { limit, offset, q } = parsePageParams(req);
      const supplierId    = typeof req.query["supplierId"]   === "string" ? req.query["supplierId"]   : null;
      const commitmentId  = typeof req.query["commitmentId"] === "string" ? req.query["commitmentId"] : null;

      // Lifecycle gate: commitment.status must carry is_transactable_source
      // in the 'commitment' lifecycle state_flags (seeded on approved / active
      // / partially_fulfilled). Excludes draft, pending_approval,
      // fully_fulfilled, closed, cancelled. Supplier is c.party_id when
      // c.party_type='SUPPLIER' (polymorphic party on the commitment header;
      // the INSTEAD-OF trigger on the purchase_order view guarantees
      // party_type='SUPPLIER' for PO-typed commitments).
      const transactableStates = [...await getLifecycleStatesWithFlag(
        db, "commitment", "is_transactable_source")];
      const result = await sql<OpenPoLineRow>`
        SELECT
            c.id                              AS "poId",
            c.code                            AS "poNumber",
            cl.id                             AS "lineId",
            cl.line_no                        AS "lineNumber",
            cl.item_description               AS "description",
            cl.item_id                        AS "itemId",
            NULL::text                        AS "itemCode",
            cl.uom_code                       AS "baseUomCode",
            cl.remaining_quantity::float8     AS "remainingQty",
            cl.unit_price::float8             AS "unitPrice",
            cl.currency_code                  AS "currencyCode",
            c.party_id                        AS "supplierId",
            s.supplier_code                   AS "supplierCode",
            (cl.terminal_status IS NULL)      AS "isOpen"
          FROM document.commitment_line cl
          JOIN document.commitment        c  ON c.id  = cl.commitment_id AND c.tenant_id = cl.tenant_id
          LEFT JOIN master.supplier_app_index s ON s.supplier_id = c.party_id AND s.tenant_id = c.tenant_id
         WHERE cl.tenant_id = ${tenantId}::uuid
           AND (${readableCompanyCodeIds}::uuid[] IS NULL OR c.company_code_id = ANY(${readableCompanyCodeIds}::uuid[]))
           AND c.commitment_type = 'purchase_order'
           AND c.party_type      = 'SUPPLIER'
           AND c.status = ANY(${transactableStates}::text[])
           AND cl.terminal_status IS NULL
           AND cl.remaining_quantity > 0
           AND (${supplierId}::uuid   IS NULL OR c.party_id = ${supplierId}::uuid)
           AND (${commitmentId}::uuid IS NULL OR c.id       = ${commitmentId}::uuid)
           AND (${q ?? null}::text IS NULL
                OR c.code              ILIKE '%' || ${q ?? null}::text || '%'
                OR cl.item_description ILIKE '%' || ${q ?? null}::text || '%')
         ORDER BY c.code DESC, cl.line_no ASC
         LIMIT ${limit} OFFSET ${offset}
      `.execute(db);

      const body: PageOut<OpenPoLineRow> = { items: result.rows };
      res.json(body);
    } catch (err) {
      logger?.error("line_source_open_po_lines_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /api/p2p/open-receipt-lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // receipt_line rows from POSTED receipts where accepted_quantity > 0.
  // Used by the open-receipt-line picker during invoice creation for
  // three-way matching (PO + GR + Invoice).
  //
  // Query: ?supplierId=<uuid>&commitmentId=<uuid>&q=&limit=&offset=
  const openReceiptLinesHandler: RequestHandler = async (req, res, next) => {
    try {
      const auth = await requireTenantAuth(
        req, res, deps, "neon.catalog.purchase_invoice.invoice_from_receipt",
      );
      if (!auth) return;
      const { tenantId, readableCompanyCodeIds } = auth;
      const { limit, offset, q } = parsePageParams(req);
      const supplierId    = typeof req.query["supplierId"]    === "string" ? req.query["supplierId"]    : null;
      const commitmentId  = typeof req.query["commitmentId"]  === "string" ? req.query["commitmentId"]  : null;
      const receiptId     = typeof req.query["receiptId"]     === "string" ? req.query["receiptId"]     : null;

      // Lifecycle gate: receipt.status must be 'posted' (only posted GRNs
      // are eligible for invoicing). terminal_status filter excludes
      // reversed receipts. accepted_quantity > 0 excludes rejected lines.
      const result = await sql<OpenReceiptLineRow>`
        SELECT
            r.id                              AS "receiptId",
            r.code                            AS "receiptNumber",
            r.received_date::text             AS "receiptDate",
            rcpl.id                           AS "lineId",
            rcpl.line_no                      AS "lineNumber",
            r.commitment_id                   AS "poId",
            c.code                            AS "poNumber",
            rcpl.commitment_line_id           AS "poLineId",
            cl.line_no                        AS "poLineNumber",
            rcpl.item_id                      AS "itemId",
            NULL::text                        AS "itemCode",
            rcpl.item_description             AS "description",
            rcpl.uom_code                     AS "baseUomCode",
            rcpl.accepted_quantity::float8    AS "acceptedQty",
            rcpl.rejected_quantity::float8    AS "rejectedQty",
            COALESCE(cl.unit_price, 0)::float8 AS "unitCost",
            COALESCE(cl.currency_code, r.currency_code) AS "currencyCode"
          FROM document.receipt_line rcpl
          JOIN document.receipt      r  ON r.id  = rcpl.receipt_id AND r.tenant_id = rcpl.tenant_id
          JOIN document.commitment   c  ON c.id  = r.commitment_id AND c.tenant_id = r.tenant_id
          LEFT JOIN document.commitment_line cl ON cl.id = rcpl.commitment_line_id AND cl.tenant_id = rcpl.tenant_id
         WHERE rcpl.tenant_id = ${tenantId}::uuid
           AND (${readableCompanyCodeIds}::uuid[] IS NULL OR r.company_code_id = ANY(${readableCompanyCodeIds}::uuid[]))
           AND r.status = 'posted'
           AND r.terminal_status IS NULL
           AND rcpl.accepted_quantity > 0
           AND (${supplierId}::uuid   IS NULL OR (c.party_id = ${supplierId}::uuid AND c.party_type = 'SUPPLIER'))
           AND (${commitmentId}::uuid IS NULL OR r.commitment_id = ${commitmentId}::uuid)
           AND (${receiptId}::uuid    IS NULL OR rcpl.receipt_id = ${receiptId}::uuid)
           AND (${q ?? null}::text IS NULL
                OR r.code              ILIKE '%' || ${q ?? null}::text || '%'
                OR c.code              ILIKE '%' || ${q ?? null}::text || '%'
                OR rcpl.item_description ILIKE '%' || ${q ?? null}::text || '%')
         ORDER BY r.received_date DESC, r.code DESC, rcpl.line_no ASC
         LIMIT ${limit} OFFSET ${offset}
      `.execute(db);

      const body: PageOut<OpenReceiptLineRow> = { items: result.rows };
      res.json(body);
    } catch (err) {
      logger?.error("line_source_open_receipt_lines_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /api/p2p/open-service-sheet-lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // service_sheet_line rows from posted SES headers. Used during invoice
  // creation for services (SES + Invoice two-way match, no GRN equivalent).
  //
  // Query: ?supplierId=<uuid>&commitmentId=<uuid>&q=&limit=&offset=
  const openServiceSheetLinesHandler: RequestHandler = async (req, res, next) => {
    try {
      const auth = await requireTenantAuth(
        req, res, deps,
        "neon.catalog.purchase_invoice.invoice_from_service_sheet",
      );
      if (!auth) return;
      const { tenantId, readableCompanyCodeIds } = auth;
      const { limit, offset, q } = parsePageParams(req);
      const supplierId    = typeof req.query["supplierId"]    === "string" ? req.query["supplierId"]    : null;
      const commitmentId  = typeof req.query["commitmentId"]  === "string" ? req.query["commitmentId"]  : null;

      const result = await sql<OpenServiceSheetLineRow>`
        SELECT
            ssh.id                            AS "serviceSheetId",
            ssh.service_sheet_number          AS "serviceSheetNumber",
            ssh.accepted_at::text             AS "certifiedDate",
            ssh.service_period_from::text     AS "servicePeriodStart",
            ssh.service_period_to::text       AS "servicePeriodEnd",
            sshl.id                           AS "lineId",
            sshl.line_no                      AS "lineNumber",
            ssh.commitment_id                 AS "poId",
            c.code                            AS "poNumber",
            sshl.commitment_line_id           AS "poLineId",
            cl.line_no                        AS "poLineNumber",
            sshl.item_id                      AS "itemId",
            NULL::text                        AS "itemCode",
            COALESCE(cl.item_description, '') AS "description",
            sshl.uom_code                     AS "baseUomCode",
            sshl.quantity::float8             AS "acceptedQty",
            sshl.unit_price::float8           AS "unitPrice",
            ssh.currency_code                 AS "currencyCode"
          FROM document.service_sheet_line sshl
          JOIN document.service_sheet      ssh ON ssh.id = sshl.service_sheet_id AND ssh.tenant_id = sshl.tenant_id
          JOIN document.commitment         c   ON c.id   = ssh.commitment_id     AND c.tenant_id   = ssh.tenant_id
          LEFT JOIN document.commitment_line cl ON cl.id = sshl.commitment_line_id AND cl.tenant_id = sshl.tenant_id
         WHERE sshl.tenant_id = ${tenantId}::uuid
           AND (${readableCompanyCodeIds}::uuid[] IS NULL OR ssh.company_code_id = ANY(${readableCompanyCodeIds}::uuid[]))
           AND ssh.status = 'posted'
           AND ssh.terminal_status IS NULL
           AND sshl.quantity > 0
           AND (${supplierId}::uuid   IS NULL OR (c.party_id = ${supplierId}::uuid AND c.party_type = 'SUPPLIER'))
           AND (${commitmentId}::uuid IS NULL OR ssh.commitment_id = ${commitmentId}::uuid)
           AND (${q ?? null}::text IS NULL
                OR ssh.service_sheet_number ILIKE '%' || ${q ?? null}::text || '%'
                OR c.code                   ILIKE '%' || ${q ?? null}::text || '%')
         ORDER BY ssh.service_date DESC, ssh.service_sheet_number DESC, sshl.line_no ASC
         LIMIT ${limit} OFFSET ${offset}
      `.execute(db);

      const body: PageOut<OpenServiceSheetLineRow> = { items: result.rows };
      res.json(body);
    } catch (err) {
      logger?.error("line_source_open_ses_lines_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /api/p2p/open-invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Posted / partially_paid AP-posted purchase_invoices grouped by
  // supplier. Used by the payment-from-invoice prefill grid to let users
  // multi-select invoices to pay in one payment_entry. Each row carries:
  //   - payable_amount (from PI)
  //   - already_allocated (SUM of allocations from non-voided payments)
  //   - remainingAmount = payable - already
  //
  // Query: ?supplierId=<uuid>&seedInvoiceId=<uuid>&q=&limit=&offset=
  //   - supplierId   â€” narrow to this supplier (recommended; single
  //                    payment can only target one supplier)
  //   - seedInvoiceId â€” when set without supplierId, the query resolves
  //                     the seed invoice's supplier_id and narrows by it
  //                     automatically (page entry point convenience).
  interface OpenInvoiceRow {
    invoiceId:             string;
    invoiceNumber:         string;
    supplierId:            string;
    supplierCode:          string | null;
    supplierInvoiceNumber: string | null;
    documentDate:          string;
    status:                string;
    currencyCode:          string;
    totalAmount:           number;
    payableAmount:         number;
    alreadyAllocated:      number;
    remainingAmount:       number;
  }

  const openInvoicesHandler: RequestHandler = async (req, res, next) => {
    try {
      const auth = await requireTenantAuth(
        req, res, deps, "neon.catalog.purchase_invoice.create_payment",
      );
      if (!auth) return;
      const { tenantId, readableCompanyCodeIds } = auth;
      const { limit, offset, q } = parsePageParams(req);
      let supplierId      = typeof req.query["supplierId"]      === "string" ? req.query["supplierId"]      : null;
      const seedInvoiceId = typeof req.query["seedInvoiceId"]   === "string" ? req.query["seedInvoiceId"]   : null;

      if (!supplierId && seedInvoiceId) {
        const seed = await sql<{ supplier_id: string }>`
          SELECT supplier_id FROM document.purchase_invoice
           WHERE id = ${seedInvoiceId}::uuid
             AND tenant_id = ${tenantId}::uuid
             AND (${readableCompanyCodeIds}::uuid[] IS NULL OR company_code_id = ANY(${readableCompanyCodeIds}::uuid[]))
           LIMIT 1
        `.execute(db);
        supplierId = seed.rows[0]?.supplier_id ?? null;
      }

      // pi.status must carry is_payable_source in the purchase_invoice
      // lifecycle state_flags (seeded on posted / partially_paid). Excludes
      // draft, pending_approval, approved, fully_paid, on_hold, terminals.
      const payableStates = [...await getLifecycleStatesWithFlag(
        db, "purchase_invoice", "is_payable_source")];
      const result = await sql<OpenInvoiceRow>`
        SELECT
            pi.id                             AS "invoiceId",
            pi.code                 AS "invoiceNumber",
            pi.supplier_id                    AS "supplierId",
            s.supplier_code                   AS "supplierCode",
            pi.supplier_invoice_number        AS "supplierInvoiceNumber",
            pi.supplier_invoice_date::text    AS "documentDate",
            pi.status,
            pi.currency_code                  AS "currencyCode",
            pi.total_amount::float8           AS "totalAmount",
            pi.payable_amount::float8         AS "payableAmount",
            COALESCE((
              SELECT SUM(pea.allocated_amount)::float8
                FROM document.payment_entry_allocation pea
                JOIN document.payment_entry            pe
                  ON pe.id = pea.payment_entry_id
                 AND pe.tenant_id = pea.tenant_id
               WHERE pea.tenant_id          = pi.tenant_id
                 AND pea.purchase_invoice_id = pi.id
                 AND pe.status NOT IN ('voided', 'reversed', 'cancelled')
            ), 0) AS "alreadyAllocated",
            (pi.payable_amount::float8 - COALESCE((
              SELECT SUM(pea.allocated_amount)::float8
                FROM document.payment_entry_allocation pea
                JOIN document.payment_entry            pe
                  ON pe.id = pea.payment_entry_id
                 AND pe.tenant_id = pea.tenant_id
               WHERE pea.tenant_id          = pi.tenant_id
                 AND pea.purchase_invoice_id = pi.id
                 AND pe.status NOT IN ('voided', 'reversed', 'cancelled')
            ), 0)) AS "remainingAmount"
          FROM document.purchase_invoice pi
          LEFT JOIN master.supplier_app_index s
            ON s.tenant_id = pi.tenant_id AND s.supplier_id = pi.supplier_id
         WHERE pi.tenant_id = ${tenantId}::uuid
           AND (${readableCompanyCodeIds}::uuid[] IS NULL OR pi.company_code_id = ANY(${readableCompanyCodeIds}::uuid[]))
           AND pi.terminal_status IS NULL
           AND pi.status = ANY(${payableStates}::text[])
           AND pi.invoice_type NOT IN ('credit_note','debit_note')
           AND (${supplierId}::uuid IS NULL OR pi.supplier_id = ${supplierId}::uuid)
           AND (${q ?? null}::text  IS NULL
                OR pi.code          ILIKE '%' || ${q ?? null}::text || '%'
                OR pi.supplier_invoice_number ILIKE '%' || ${q ?? null}::text || '%')
         ORDER BY pi.supplier_invoice_date DESC, pi.code ASC
         LIMIT ${limit} OFFSET ${offset}
      `.execute(db);

      // Filter out fully-allocated invoices (remaining <= 0) so the picker
      // never offers something the service would reject.
      const items = result.rows.filter((r) => Number(r.remainingAmount) > 0);
      const body: PageOut<OpenInvoiceRow> = { items };
      res.json(body);
    } catch (err) {
      logger?.error("line_source_open_invoices_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /api/p2p/open-requisition-lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Open purchase_requisition_line rows the user can convert into a PO.
  // Filters to PRs in convertible status (approved | partially_converted),
  // excludes lines that are 'converted' or 'cancelled', and only returns
  // lines with remaining_quantity > 0.
  //
  // Query: ?requisitionId=<uuid>&q=<search>&limit=&offset=
  const openRequisitionLinesHandler: RequestHandler = async (req, res, next) => {
    try {
      const auth = await requireTenantAuth(
        req, res, deps,
        "neon.catalog.purchase_requisition.create_commitment",
      );
      if (!auth) return;
      const { tenantId, readableCompanyCodeIds } = auth;
      const { limit, offset, q } = parsePageParams(req);
      const requisitionId = typeof req.query["requisitionId"] === "string" ? req.query["requisitionId"] : null;

      const result = await sql<OpenRequisitionLineRow>`
        SELECT
            pr.id                                  AS "prId",
            pr.requisition_number                  AS "prNumber",
            pr.status                              AS "prStatus",
            prl.id                                 AS "lineId",
            prl.line_no                            AS "lineNumber",
            prl.item_id                            AS "itemId",
            NULL::text                             AS "itemCode",
            prl.item_description                   AS "description",
            prl.uom_code                           AS "baseUomCode",
            prl.remaining_quantity::float8         AS "remainingQty",
            prl.estimated_unit_price::float8       AS "estimatedUnitPrice",
            prl.currency_code                      AS "currencyCode",
            prl.required_by_date::text             AS "requiredByDate",
            COALESCE(prl.suggested_supplier_id, pr.suggested_supplier_id) AS "suggestedSupplierId"
          FROM document.purchase_requisition_line prl
          JOIN document.purchase_requisition      pr
            ON pr.id = prl.purchase_requisition_id AND pr.tenant_id = prl.tenant_id
         WHERE prl.tenant_id = ${tenantId}::uuid
           AND (${readableCompanyCodeIds}::uuid[] IS NULL OR pr.company_code_id = ANY(${readableCompanyCodeIds}::uuid[]))
           AND pr.status     IN ('approved','partially_converted')
           AND prl.status    IN ('open','partially_converted')
           AND prl.remaining_quantity > 0
           AND (${requisitionId}::uuid IS NULL OR pr.id = ${requisitionId}::uuid)
           AND (${q ?? null}::text IS NULL
                OR pr.requisition_number ILIKE '%' || ${q ?? null}::text || '%'
                OR prl.item_description  ILIKE '%' || ${q ?? null}::text || '%')
         ORDER BY pr.requisition_number DESC, prl.line_no ASC
         LIMIT ${limit} OFFSET ${offset}
      `.execute(db);

      const body: PageOut<OpenRequisitionLineRow> = { items: result.rows };
      res.json(body);
    } catch (err) {
      logger?.error("line_source_open_requisition_lines_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ GET /api/p2p/catalog/items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Stub until master.catalog_item lands. Returns a tenant-scoped empty
  // page so the picker UI mounts cleanly. When the catalog table ships,
  // swap this handler for a real query against master.catalog_item +
  // master.catalog_price.
  const catalogItemsHandler: RequestHandler = async (req, res) => {
    const auth = await requireTenantAuth(
      req, res, deps, "neon.catalog.commitment.create",
    );
    if (!auth) return;
    const body: PageOut<Record<string, unknown>> = { items: [], total: 0 };
    res.json(body);
  };

  // â”€â”€ POST /api/p2p/receipts/from-commitment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Single-TX create of a receipt header + N receipt_line rows from a
  // chosen commitment + line-acceptance grid. Allocates receipt_number
  // through control.next_entity_number, resolves fiscal_year/period_number
  // from document_date (Gregorian fallback when no fiscal_period covers
  // the date â€” see records.route.ts AUDIT NOTE), then delegates to
  // createReceiptFromCommitment which does the validation + atomic write.
  //
  // Body shape:
  //   { commitmentId, documentDate?, deliveryNoteId?, notes?,
  //     receivingSiteId?, receivingWarehouseId?,
  //     lineAcceptances: [{ commitmentLineId, acceptedQty, rejectedQty?, notes? }] }
  const receiptFromCommitmentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }
      const sub = claims["sub"];
      if (typeof sub !== "string" || sub.length === 0) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
        return;
      }
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = (req.body ?? {}) as {
        commitmentId?:         string;
        documentDate?:         string;
        deliveryNoteId?:       string;
        notes?:                string;
        receivingSiteId?:      string;
        receivingWarehouseId?: string;
        companyCodeId?:        string;
        lineAcceptances?:      ReceiptFromCommitmentLineInput[];
      };

      if (!body.commitmentId || typeof body.commitmentId !== "string") {
        res.status(400).json({ error: "COMMITMENT_REQUIRED", message: "commitmentId is required." });
        return;
      }
      if (!Array.isArray(body.lineAcceptances)) {
        res.status(400).json({ error: "LINE_ACCEPTANCES_REQUIRED", message: "lineAcceptances must be an array." });
        return;
      }

      // Resolve company_code + base_currency + fiscal_period + receipt_number
      // via the shared helpers in business/p2p/resolve-document-defaults.ts,
      // so this from-commitment path and the generic records create handler
      // always produce the same defaults from the same inputs.
      const docDate = body.documentDate ?? new Date().toISOString().slice(0, 10);

      const company = await resolveCompanyAndBaseCurrency(db, {
        tenantId,
        companyCodeIdHint: body.companyCodeId ?? null,
      });
      if (!company.companyCodeId || !company.baseCurrencyCode) {
        res.status(422).json({
          error:   "COMPANY_CODE_REQUIRED",
          message: "Could not resolve company_code_id and base_currency_code; supply company_code_id explicitly.",
        });
        return;
      }
      const companyCodeId    = company.companyCodeId;
      const baseCurrencyCode = company.baseCurrencyCode;

      const fp = await resolveFiscalPeriod(db, {
        tenantId,
        companyCodeId,
        documentDate: docDate,
        logger,
      });
      if (!fp.ok) {
        res.status(422).json({
          error:   "FISCAL_PERIOD_MISSING",
          message: `No fiscal_period covers ${docDate} for the resolved company_code. Seed master.fiscal_period for this date before creating receipts.`,
          details: { tenantId, companyCodeId, documentDate: docDate },
        });
        return;
      }
      const fiscalYear   = fp.fiscalYear;
      const periodNumber = fp.periodNumber;

      const receiptNumber = await allocateDocumentNumber(db, {
        tenantId,
        entityCode:     "receipt",
        numberField:    "document_no",
        companyCodeId,
        fiscalYear,
        periodNumber,
        effectiveDate:  docDate,
        fallbackPrefix: "RCP",
      });

      const outcome = await createReceiptFromCommitment(db, {
        tenantId,
        principalId,
        commitmentId:         body.commitmentId,
        companyCodeId,
        documentDate:         docDate,
        deliveryNoteId:       body.deliveryNoteId,
        notes:                body.notes,
        receivingSiteId:      body.receivingSiteId,
        receivingWarehouseId: body.receivingWarehouseId,
        receiptNumber,
        fiscalYear,
        periodNumber,
        baseCurrencyCode,
        lineAcceptances:      body.lineAcceptances,
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({
          error:        outcome.error,
          message:      outcome.message,
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
        });
        return;
      }

      logger?.warn?.("receipt_from_commitment_created", {
        tenantId, commitmentId: body.commitmentId,
        receiptId: outcome.receiptId, receiptNumber: outcome.receiptNumber,
        linesWritten: outcome.linesWritten,
      });

      res.status(201).json({
        ok:           true,
        receiptId:    outcome.receiptId,
        receiptNumber: outcome.receiptNumber,
        linesWritten: outcome.linesWritten,
      });
    } catch (err) {
      logger?.error("receipt_from_commitment_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /api/p2p/service-sheets/from-commitment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Mirror of receiptFromCommitmentHandler for the SES document. Same
  // company-code / fiscal-period (strict) / document-number resolution
  // through the shared helpers; same atomic header + lines write through
  // createServiceSheetFromCommitment.
  //
  // Body shape:
  //   { commitmentId, servicePeriodFrom, servicePeriodTo, documentDate?,
  //     siteId?, notes?, companyCodeId?,
  //     lineEntries: [{ commitmentLineId, quantity,
  //                     serviceDescription?, milestoneName?,
  //                     completionPct?, notes? }] }
  const serviceSheetFromCommitmentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }
      const sub = claims["sub"];
      if (typeof sub !== "string" || sub.length === 0) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
        return;
      }
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = (req.body ?? {}) as {
        commitmentId?:      string;
        servicePeriodFrom?: string;
        servicePeriodTo?:   string;
        documentDate?:      string;
        siteId?:            string;
        notes?:             string;
        companyCodeId?:     string;
        lineEntries?:       ServiceSheetFromCommitmentLineInput[];
      };

      if (!body.commitmentId || typeof body.commitmentId !== "string") {
        res.status(400).json({ error: "COMMITMENT_REQUIRED", message: "commitmentId is required." });
        return;
      }
      if (!body.servicePeriodFrom || !body.servicePeriodTo) {
        res.status(400).json({
          error:   "SERVICE_PERIOD_REQUIRED",
          message: "servicePeriodFrom and servicePeriodTo are both required.",
        });
        return;
      }
      if (!Array.isArray(body.lineEntries)) {
        res.status(400).json({ error: "LINE_ENTRIES_REQUIRED", message: "lineEntries must be an array." });
        return;
      }

      const docDate = body.documentDate ?? new Date().toISOString().slice(0, 10);

      const company = await resolveCompanyAndBaseCurrency(db, {
        tenantId,
        companyCodeIdHint: body.companyCodeId ?? null,
      });
      if (!company.companyCodeId || !company.baseCurrencyCode) {
        res.status(422).json({
          error:   "COMPANY_CODE_REQUIRED",
          message: "Could not resolve company_code_id and base_currency_code; supply company_code_id explicitly.",
        });
        return;
      }
      const companyCodeId    = company.companyCodeId;
      const baseCurrencyCode = company.baseCurrencyCode;

      const fp = await resolveFiscalPeriod(db, {
        tenantId,
        companyCodeId,
        documentDate: docDate,
        logger,
      });
      if (!fp.ok) {
        res.status(422).json({
          error:   "FISCAL_PERIOD_MISSING",
          message: `No fiscal_period covers ${docDate} for the resolved company_code. Seed master.fiscal_period for this date before creating service sheets.`,
          details: { tenantId, companyCodeId, documentDate: docDate },
        });
        return;
      }
      const fiscalYear   = fp.fiscalYear;
      const periodNumber = fp.periodNumber;

      const serviceSheetNumber = await allocateDocumentNumber(db, {
        tenantId,
        entityCode:     "service_sheet",
        numberField:    "document_no",
        companyCodeId,
        fiscalYear,
        periodNumber,
        effectiveDate:  docDate,
        fallbackPrefix: "SES",
      });

      const outcome = await createServiceSheetFromCommitment(db, {
        tenantId,
        principalId,
        commitmentId:       body.commitmentId,
        companyCodeId,
        documentDate:       docDate,
        servicePeriodFrom:  body.servicePeriodFrom,
        servicePeriodTo:    body.servicePeriodTo,
        siteId:             body.siteId,
        notes:              body.notes,
        serviceSheetNumber,
        fiscalYear,
        periodNumber,
        baseCurrencyCode,
        lineEntries:        body.lineEntries,
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({
          error:   outcome.error,
          message: outcome.message,
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
        });
        return;
      }

      res.status(201).json({
        ok:                 true,
        serviceSheetId:     outcome.serviceSheetId,
        serviceSheetNumber: outcome.serviceSheetNumber,
        linesWritten:       outcome.linesWritten,
      });
    } catch (err) {
      logger?.error("service_sheet_from_commitment_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /api/p2p/invoices/from-receipt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Closes the 3-way match loop: user picks receipt_lines + supplies the
  // supplier's invoice metadata, and the service writes a draft PI header
  // + N PI lines back-referenced to the receipt_lines (for downstream
  // match exception detection). Shared defaults helper resolves
  // company_code, fiscal_period (strict), and code; the service
  // does the per-line "remaining to invoice" gate inside the TX.
  //
  // Body shape:
  //   { receiptId, supplierInvoiceNumber, supplierInvoiceDate,
  //     documentDate?, notes?, companyCodeId?,
  //     lineSelections: [{ receiptLineId, quantity, unitPrice?, notes? }] }
  const invoiceFromReceiptHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }
      const sub = claims["sub"];
      if (typeof sub !== "string" || sub.length === 0) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
        return;
      }
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = (req.body ?? {}) as {
        receiptId?:             string;
        supplierInvoiceNumber?: string;
        supplierInvoiceDate?:   string;
        documentDate?:          string;
        notes?:                 string;
        companyCodeId?:         string;
        lineSelections?:        InvoiceFromReceiptLineInput[];
      };

      if (!body.receiptId || typeof body.receiptId !== "string") {
        res.status(400).json({ error: "RECEIPT_REQUIRED", message: "receiptId is required." });
        return;
      }
      if (!body.supplierInvoiceNumber || !body.supplierInvoiceDate) {
        res.status(400).json({
          error:   "SUPPLIER_INVOICE_METADATA_REQUIRED",
          message: "supplierInvoiceNumber and supplierInvoiceDate are both required.",
        });
        return;
      }
      if (!Array.isArray(body.lineSelections)) {
        res.status(400).json({ error: "LINE_SELECTIONS_REQUIRED", message: "lineSelections must be an array." });
        return;
      }

      const docDate = body.documentDate ?? new Date().toISOString().slice(0, 10);
      const sourceCompanyCodeId = await loadReceiptCompanyCode(db, tenantId, body.receiptId);
      if (!sourceCompanyCodeId) {
        res.status(404).json({ error: "RECEIPT_NOT_FOUND", message: `Receipt ${body.receiptId} not found for tenant.` });
        return;
      }
      if (body.companyCodeId && body.companyCodeId !== sourceCompanyCodeId) {
        res.status(422).json({
          error:   "COMPANY_CODE_MISMATCH",
          message: "Invoice-from-receipt must use the receipt's company_code_id.",
          details: { receiptId: body.receiptId, requestedCompanyCodeId: body.companyCodeId, sourceCompanyCodeId },
        });
        return;
      }

      const company = await resolveCompanyAndBaseCurrency(db, {
        tenantId,
        companyCodeIdHint: sourceCompanyCodeId,
      });
      if (!company.companyCodeId || !company.baseCurrencyCode) {
        res.status(422).json({
          error:   "COMPANY_CODE_REQUIRED",
          message: "Could not resolve company_code_id and base_currency_code; supply company_code_id explicitly.",
        });
        return;
      }
      const companyCodeId    = company.companyCodeId;
      const baseCurrencyCode = company.baseCurrencyCode;

      const fp = await resolveFiscalPeriod(db, {
        tenantId,
        companyCodeId,
        documentDate: docDate,
        logger,
      });
      if (!fp.ok) {
        res.status(422).json({
          error:   "FISCAL_PERIOD_MISSING",
          message: `No fiscal_period covers ${docDate} for the resolved company_code. Seed master.fiscal_period for this date before creating invoices.`,
          details: { tenantId, companyCodeId, documentDate: docDate },
        });
        return;
      }
      const fiscalYear   = fp.fiscalYear;
      const periodNumber = fp.periodNumber;

      const invoiceNumber = await allocateDocumentNumber(db, {
        tenantId,
        entityCode:     "purchase_invoice",
        numberField:    "code",
        companyCodeId,
        fiscalYear,
        periodNumber,
        effectiveDate:  docDate,
        fallbackPrefix: "PI",
      });

      const outcome = await createInvoiceFromReceipt(db, {
        tenantId,
        principalId,
        receiptId:             body.receiptId,
        companyCodeId,
        supplierInvoiceNumber: body.supplierInvoiceNumber,
        supplierInvoiceDate:   body.supplierInvoiceDate,
        documentDate:          docDate,
        notes:                 body.notes,
        invoiceNumber,
        fiscalYear,
        periodNumber,
        baseCurrencyCode,
        lineSelections:        body.lineSelections,
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({
          error:   outcome.error,
          message: outcome.message,
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
        });
        return;
      }

      res.status(201).json({
        ok:            true,
        invoiceId:     outcome.invoiceId,
        invoiceNumber: outcome.invoiceNumber,
        linesWritten:  outcome.linesWritten,
      });
    } catch (err) {
      logger?.error("invoice_from_receipt_error", { err: String(err) });
      next(err);
    }
  };
  const invoiceFromServiceSheetHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }
      const sub = claims["sub"];
      if (typeof sub !== "string" || sub.length === 0) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
        return;
      }
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = (req.body ?? {}) as {
        serviceSheetId?:        string;
        supplierInvoiceNumber?: string;
        supplierInvoiceDate?:   string;
        documentDate?:          string;
        notes?:                 string;
        companyCodeId?:         string;
        lineSelections?:        InvoiceFromServiceSheetLineInput[];
      };

      if (!body.serviceSheetId || typeof body.serviceSheetId !== "string") {
        res.status(400).json({ error: "SERVICE_SHEET_REQUIRED", message: "serviceSheetId is required." });
        return;
      }
      if (!body.supplierInvoiceNumber || !body.supplierInvoiceDate) {
        res.status(400).json({
          error:   "SUPPLIER_INVOICE_METADATA_REQUIRED",
          message: "supplierInvoiceNumber and supplierInvoiceDate are both required.",
        });
        return;
      }
      if (!Array.isArray(body.lineSelections)) {
        res.status(400).json({ error: "LINE_SELECTIONS_REQUIRED", message: "lineSelections must be an array." });
        return;
      }

      const docDate = body.documentDate ?? new Date().toISOString().slice(0, 10);
      const sourceCompanyCodeId = await loadServiceSheetCompanyCode(db, tenantId, body.serviceSheetId);
      if (!sourceCompanyCodeId) {
        res.status(404).json({ error: "SERVICE_SHEET_NOT_FOUND", message: `Service sheet ${body.serviceSheetId} not found for tenant.` });
        return;
      }
      if (body.companyCodeId && body.companyCodeId !== sourceCompanyCodeId) {
        res.status(422).json({
          error:   "COMPANY_CODE_MISMATCH",
          message: "Invoice-from-service-sheet must use the service sheet's company_code_id.",
          details: { serviceSheetId: body.serviceSheetId, requestedCompanyCodeId: body.companyCodeId, sourceCompanyCodeId },
        });
        return;
      }

      const company = await resolveCompanyAndBaseCurrency(db, {
        tenantId,
        companyCodeIdHint: sourceCompanyCodeId,
      });
      if (!company.companyCodeId || !company.baseCurrencyCode) {
        res.status(422).json({
          error:   "COMPANY_CODE_REQUIRED",
          message: "Could not resolve company_code_id and base_currency_code; supply company_code_id explicitly.",
        });
        return;
      }
      const companyCodeId = company.companyCodeId;
      const baseCurrencyCode = company.baseCurrencyCode;

      const fp = await resolveFiscalPeriod(db, {
        tenantId,
        companyCodeId,
        documentDate: docDate,
        logger,
      });
      if (!fp.ok) {
        res.status(422).json({
          error:   "FISCAL_PERIOD_MISSING",
          message: `No fiscal_period covers ${docDate} for the resolved company_code. Seed master.fiscal_period for this date before creating invoices.`,
          details: { tenantId, companyCodeId, documentDate: docDate },
        });
        return;
      }

      const invoiceNumber = await allocateDocumentNumber(db, {
        tenantId,
        entityCode:     "purchase_invoice",
        numberField:    "code",
        companyCodeId,
        fiscalYear:     fp.fiscalYear,
        periodNumber:   fp.periodNumber,
        effectiveDate:  docDate,
        fallbackPrefix: "PI",
      });

      const outcome = await createInvoiceFromServiceSheet(db, {
        tenantId,
        principalId,
        serviceSheetId:        body.serviceSheetId,
        companyCodeId,
        supplierInvoiceNumber: body.supplierInvoiceNumber,
        supplierInvoiceDate:   body.supplierInvoiceDate,
        documentDate:          docDate,
        notes:                 body.notes,
        invoiceNumber,
        fiscalYear:            fp.fiscalYear,
        periodNumber:          fp.periodNumber,
        baseCurrencyCode,
        lineSelections:        body.lineSelections,
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({
          error:   outcome.error,
          message: outcome.message,
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
        });
        return;
      }

      res.status(201).json({
        ok:            true,
        invoiceId:     outcome.invoiceId,
        invoiceNumber: outcome.invoiceNumber,
        linesWritten:  outcome.linesWritten,
      });
    } catch (err) {
      logger?.error("invoice_from_service_sheet_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /api/p2p/payments/from-invoice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Closes the P2P chain: user picks one or more invoices + supplies per-
  // allocation amounts, and the service writes a draft payment_entry +
  // payment_entry_allocation rows atomically. Cross-row supplier +
  // currency invariants are enforced inside the TX with FOR UPDATE on the
  // chosen invoices; the per-invoice remaining-to-pay gate aggregates
  // SUM(allocated_amount) from prior non-voided payments.
  //
  // Body shape:
  //   { documentDate?, paymentMethodId?, notes?, companyCodeId?,
  //     allocations: [{ invoiceId, allocatedAmount,
  //                     discountAmount?, withholdingTaxAmount?,
  //                     advanceRecoveryAmount?, retentionAmount?, notes? }] }
  const paymentFromInvoiceHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }
      const sub = claims["sub"];
      if (typeof sub !== "string" || sub.length === 0) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
        return;
      }
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = (req.body ?? {}) as {
        documentDate?:    string;
        paymentMethodId?: string;
        notes?:           string;
        companyCodeId?:   string;
        allocations?:     PaymentFromInvoiceAllocationInput[];
      };

      if (!Array.isArray(body.allocations)) {
        res.status(400).json({ error: "ALLOCATIONS_REQUIRED", message: "allocations must be an array." });
        return;
      }

      const docDate = body.documentDate ?? new Date().toISOString().slice(0, 10);
      const sourceCompany = await loadPaymentInvoiceCompanyCode(db, tenantId, body.allocations);
      if (!sourceCompany.ok) {
        res.status(sourceCompany.status).json({ error: sourceCompany.error, message: sourceCompany.message });
        return;
      }
      if (body.companyCodeId && body.companyCodeId !== sourceCompany.companyCodeId) {
        res.status(422).json({
          error:   "COMPANY_CODE_MISMATCH",
          message: "Payment-from-invoice must use the selected invoice company_code_id.",
          details: { requestedCompanyCodeId: body.companyCodeId, sourceCompanyCodeId: sourceCompany.companyCodeId },
        });
        return;
      }

      const company = await resolveCompanyAndBaseCurrency(db, {
        tenantId,
        companyCodeIdHint: sourceCompany.companyCodeId,
      });
      if (!company.companyCodeId || !company.baseCurrencyCode) {
        res.status(422).json({
          error:   "COMPANY_CODE_REQUIRED",
          message: "Could not resolve company_code_id and base_currency_code; supply company_code_id explicitly.",
        });
        return;
      }
      const companyCodeId    = company.companyCodeId;
      const baseCurrencyCode = company.baseCurrencyCode;

      const fp = await resolveFiscalPeriod(db, {
        tenantId,
        companyCodeId,
        documentDate: docDate,
        logger,
      });
      if (!fp.ok) {
        res.status(422).json({
          error:   "FISCAL_PERIOD_MISSING",
          message: `No fiscal_period covers ${docDate} for the resolved company_code. Seed master.fiscal_period for this date before creating payments.`,
          details: { tenantId, companyCodeId, documentDate: docDate },
        });
        return;
      }
      const fiscalYear   = fp.fiscalYear;
      const periodNumber = fp.periodNumber;

      const paymentNumber = await allocateDocumentNumber(db, {
        tenantId,
        entityCode:     "payment_entry",
        numberField:    "document_no",
        companyCodeId,
        fiscalYear,
        periodNumber,
        effectiveDate:  docDate,
        fallbackPrefix: "PMT",
      });

      const outcome = await createPaymentFromInvoice(db, {
        tenantId,
        principalId,
        companyCodeId,
        documentDate:    docDate,
        paymentMethodId: body.paymentMethodId,
        notes:           body.notes,
        paymentNumber,
        fiscalYear,
        periodNumber,
        baseCurrencyCode,
        allocations:     body.allocations,
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({
          error:   outcome.error,
          message: outcome.message,
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
        });
        return;
      }

      res.status(201).json({
        ok:                 true,
        paymentId:          outcome.paymentId,
        paymentNumber:      outcome.paymentNumber,
        allocationsWritten: outcome.allocationsWritten,
        totalAmount:        outcome.totalAmount,
      });
    } catch (err) {
      logger?.error("payment_from_invoice_error", { err: String(err) });
      next(err);
    }
  };

  // â”€â”€ POST /api/p2p/commitments/from-requisition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Single-TX create of a commitment (PO) + commitment_procurement +
  // commitment_line rows from an approved purchase_requisition + a per-line
  // quantity grid + supplier choice. Allocates commitment_number through
  // control.next_entity_number, resolves fiscal_year/period_number from
  // document_date (same strict resolver as receipt-from-commitment), then
  // delegates to createCommitmentFromRequisition which does the validation,
  // atomic write, and PR-line converted_quantity bookkeeping.
  //
  // Body shape:
  //   { requisitionId, supplierId, documentDate?, effectiveDate?,
  //     paymentTermId?, notes?, companyCodeId?,
  //     lineSelections: [{ requisitionLineId, quantity, unitPrice?, requiredByDate?, notes? }] }
  const commitmentFromRequisitionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }
      const sub = claims["sub"];
      if (typeof sub !== "string" || sub.length === 0) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
        return;
      }
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const body = (req.body ?? {}) as {
        requisitionId?:  string;
        supplierId?:     string;
        documentDate?:   string;
        effectiveDate?:  string;
        paymentTermId?:  string;
        notes?:          string;
        companyCodeId?:  string;
        lineSelections?: CommitmentFromRequisitionLineInput[];
      };

      if (!body.requisitionId || typeof body.requisitionId !== "string") {
        res.status(400).json({ error: "REQUISITION_REQUIRED", message: "requisitionId is required." });
        return;
      }
      if (!body.supplierId || typeof body.supplierId !== "string") {
        res.status(400).json({ error: "SUPPLIER_REQUIRED", message: "supplierId is required." });
        return;
      }
      if (!Array.isArray(body.lineSelections)) {
        res.status(400).json({ error: "LINE_SELECTIONS_REQUIRED", message: "lineSelections must be an array." });
        return;
      }

      const docDate = body.documentDate ?? new Date().toISOString().slice(0, 10);

      const company = await resolveCompanyAndBaseCurrency(db, {
        tenantId,
        companyCodeIdHint: body.companyCodeId ?? null,
      });
      if (!company.companyCodeId || !company.baseCurrencyCode) {
        res.status(422).json({
          error:   "COMPANY_CODE_REQUIRED",
          message: "Could not resolve company_code_id and base_currency_code; supply company_code_id explicitly.",
        });
        return;
      }
      const companyCodeId    = company.companyCodeId;
      const baseCurrencyCode = company.baseCurrencyCode;

      const fp = await resolveFiscalPeriod(db, {
        tenantId,
        companyCodeId,
        documentDate: docDate,
        logger,
      });
      if (!fp.ok) {
        res.status(422).json({
          error:   "FISCAL_PERIOD_MISSING",
          message: `No fiscal_period covers ${docDate} for the resolved company_code. Seed master.fiscal_period for this date before creating commitments.`,
          details: { tenantId, companyCodeId, documentDate: docDate },
        });
        return;
      }
      const fiscalYear   = fp.fiscalYear;
      const periodNumber = fp.periodNumber;

      const commitmentNumber = await allocateDocumentNumber(db, {
        tenantId,
        entityCode:     "commitment",
        numberField:    "document_no",
        companyCodeId,
        fiscalYear,
        periodNumber,
        effectiveDate:  docDate,
        fallbackPrefix: "PO",
      });

      const outcome = await createCommitmentFromRequisition(db, {
        tenantId,
        principalId,
        requisitionId:   body.requisitionId,
        supplierId:      body.supplierId,
        companyCodeId,
        documentDate:    docDate,
        effectiveDate:   body.effectiveDate,
        paymentTermId:   body.paymentTermId,
        notes:           body.notes,
        commitmentNumber,
        fiscalYear,
        periodNumber,
        baseCurrencyCode,
        lineSelections:  body.lineSelections,
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({
          error:        outcome.error,
          message:      outcome.message,
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
        });
        return;
      }

      logger?.warn?.("commitment_from_requisition_created", {
        tenantId, requisitionId: body.requisitionId,
        commitmentId: outcome.commitmentId, commitmentNumber: outcome.commitmentNumber,
        linesWritten: outcome.linesWritten,
      });

      res.status(201).json({
        ok:                true,
        commitmentId:      outcome.commitmentId,
        commitmentNumber:  outcome.commitmentNumber,
        linesWritten:      outcome.linesWritten,
      });
    } catch (err) {
      logger?.error("commitment_from_requisition_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/p2p/open-po-lines",                  openPoLinesHandler);
  router.get("/p2p/open-receipt-lines",             openReceiptLinesHandler);
  router.get("/p2p/open-service-sheet-lines",       openServiceSheetLinesHandler);
  router.get("/p2p/open-requisition-lines",         openRequisitionLinesHandler);
  router.get("/p2p/open-invoices",                  openInvoicesHandler);
  router.get("/p2p/catalog/items",                  catalogItemsHandler);
  // â”€â”€â”€ P2P chain-transition POST endpoints (deprecated â€” see P6) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Replaced by generic op dispatcher:
  //   POST /records/purchase_order/op/commitment_from_requisition
  //   POST /records/receipt/op/receipt_from_commitment
  //   POST /records/service_sheet/op/service_sheet_from_commitment
  //   POST /records/purchase_invoice/op/invoice_from_receipt
  //   POST /records/purchase_invoice/op/invoice_from_service_sheet
  //   POST /records/payment_entry/op/payment_from_invoice
  //
  // The handlers below are preserved for backward compatibility. Migrate
  // clients to /records/:entity/op/:code and remove these mounts in P6b.
  // See server/packages/services/records/routes/entity-op.registry.ts.
  // P2P conversion writes are intentionally not mounted here. They are served
  // only by POST /runtime/v1/entities/:entity/op/:operation, which applies
  // verified context, source/target authorization, company scope, workspace
  // capability, and idempotency before invoking the registered handler.

  return router;
}
