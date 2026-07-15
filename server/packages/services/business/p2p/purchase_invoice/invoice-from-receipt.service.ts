/**
 * Invoice from Receipt — transactional create service.
 *
 * Closes the P2P 3-way match loop (PO → Receipt → Invoice). User picks
 * receipt lines they want to bill against, supplies the supplier-side
 * invoice reference (number + date), and the service writes a draft PI
 * header + N PI lines in one transaction. Backed by the
 * `pil_receipt_line_fk` so every PI line points at the originating
 * receipt_line for downstream match exception detection.
 *
 * Why a dedicated service (not the generic /records/purchase_invoice POST):
 *   - Header + lines must be atomic. A draft PI with no lines would be
 *     interpreted as a $0 invoice by downstream match logic.
 *   - "Remaining quantity to invoice" depends on what other PIs already
 *     reference the same receipt_line — that aggregation only makes
 *     sense in a single TX with FOR UPDATE on the receipt_lines.
 *   - The PI is a promoted document from a receipt; the user only
 *     decides supplier-invoice metadata + per-line qty. Everything else
 *     (commitment_id, supplier_id, currency_code, fiscal_period) is
 *     inherited from the receipt's commitment chain.
 *
 * Contract:
 *   Input:   { tenantId, principalId, receiptId, companyCodeId?,
 *              supplierInvoiceNumber, supplierInvoiceDate,
 *              documentDate?, notes?,
 *              lineSelections: [{ receiptLineId, quantity,
 *                                 unitPrice?, notes? }] }
 *   Success: { ok: true, invoiceId, invoiceNumber, linesWritten }
 *   Failure: { ok: false, status, error, message, fieldErrors? }
 *
 * Validation:
 *   - supplier invoice number + date required (PI semantics: invoice
 *     references the physical doc from the supplier).
 *   - At least one line selection required.
 *   - Each quantity must be > 0; optional unitPrice must be >= 0.
 *   - Per-line: quantity <= accepted_quantity - SUM(other non-reversed
 *     PI lines that already reference this receipt_line).
 *   - Receipt must be `posted`. Drafts/approved aren't ready to invoice
 *     because their quantities haven't been confirmed.
 *   - All receipt_lines must belong to the chosen receipt + tenant.
 *
 * Numbering / fiscal / currency:
 *   code, fiscal_year, period_number, base_currency_code are
 *   resolved upstream by the route handler via the shared
 *   resolve-document-defaults helpers, so this service and the generic
 *   records create path produce the same defaults.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { emitOutboxEvent, resolvePurchaseInvoiceHeaderDefaults } from "@athyper/svc-shared";
import { applyPurchaseInvoiceLineDefaults } from "./pi-line-defaults.service.js";
import { inheritProcurementLineAccounting } from "../procurement-line-accounting-inheritance.service.js";
import { refreshDistributionCostBasis } from "../../pricing_component/component-accounting-loader.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface InvoiceFromReceiptLineInput {
  receiptLineId: string;
  quantity:      number;
  /** Optional override; defaults to receipt_line.unit_price. */
  unitPrice?:    number;
  notes?:        string;
}

export interface InvoiceFromReceiptInput {
  tenantId:               string;
  principalId:            string;
  receiptId:              string;
  companyCodeId?:         string;
  /** Supplier's own invoice document number (e.g. 'INV-2026-12345'). */
  supplierInvoiceNumber:  string;
  /** Date the supplier issued their invoice (ISO date). */
  supplierInvoiceDate:    string;
  /** Our internal document date (ISO date) — defaults to today. */
  documentDate?:          string;
  notes?:                 string;
  /** Pre-allocated by the route handler via allocateDocumentNumber. */
  invoiceNumber:          string;
  /** Pre-resolved by the route handler via resolveFiscalPeriod. */
  fiscalYear:             number;
  periodNumber:           number;
  /** Pre-resolved by the route handler via resolveCompanyAndBaseCurrency. */
  baseCurrencyCode:       string;
  lineSelections:         InvoiceFromReceiptLineInput[];
}

export type InvoiceFromReceiptOutcome =
  | { ok: true;  invoiceId: string; invoiceNumber: string; linesWritten: number }
  | {
      ok:           false;
      status:       number;
      error:        string;
      message:      string;
      fieldErrors?: Record<string, string>;
    };

interface ReceiptHeaderRow {
  id:                string;
  tenant_id:         string;
  company_code_id:   string;
  receipt_number:    string;
  commitment_id:     string;
  supplier_id:       string;
  currency_code:     string;
  status:            string;
  terminal_status:   string | null;
}

interface ReceiptLineRow {
  id:                  string;
  receipt_id:          string;
  line_no:             number;
  commitment_line_id:  string | null;
  item_id:             string | null;
  item_description:    string;
  uom_code:            string;
  unit_price:          number;
  accepted_quantity:   number;
  asset_class_id:      string | null;
  commodity_category_id: string | null;
  business_intent_id: string | null;
  classification_decision: string | null;
  tax_group_id: string | null;
  withholding_tax_group_id: string | null;
  /** SUM(quantity) of existing PI lines that already reference this
   *  receipt_line and whose parent invoice is not cancelled/reversed. */
  already_invoiced:    number;
}

export async function createInvoiceFromReceipt(
  db:    AnyDb,
  input: InvoiceFromReceiptInput,
): Promise<InvoiceFromReceiptOutcome> {
  const validation = await preflightInvoiceFromReceipt(input).catch(() => null);
  if (validation) return validation;
  try {
    return await db.transaction().execute((trx) => createInvoiceFromReceiptInTransaction(trx, input));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return err instanceof Error && /violates|constraint/i.test(err.message)
      ? fail(422, "INVOICE_INSERT_REJECTED", message)
      : fail(500, "INVOICE_FROM_RECEIPT_FAILED", message);
  }
}

const RECEIPT_INVOICE_PREFLIGHT_BOUNDARY = Symbol("receipt-invoice-preflight-boundary");
const RECEIPT_INVOICE_PREFLIGHT_DB = { executeQuery: () => { throw RECEIPT_INVOICE_PREFLIGHT_BOUNDARY; } } as unknown as AnyDb;
async function preflightInvoiceFromReceipt(input: InvoiceFromReceiptInput): Promise<InvoiceFromReceiptOutcome | null> {
  try { return await createInvoiceFromReceiptInTransaction(RECEIPT_INVOICE_PREFLIGHT_DB, input); }
  catch (err) { if (err === RECEIPT_INVOICE_PREFLIGHT_BOUNDARY) return null; throw err; }
}

/** Performs the conversion on the caller-owned transaction. */
export async function createInvoiceFromReceiptInTransaction(
  db:    AnyDb,
  input: InvoiceFromReceiptInput,
): Promise<InvoiceFromReceiptOutcome> {
  // ── Top-level validation ──────────────────────────────────────────────────
  const trimmedSupplierInvNo = (input.supplierInvoiceNumber ?? "").trim();
  if (!trimmedSupplierInvNo) {
    return fail(400, "SUPPLIER_INVOICE_NUMBER_REQUIRED",
      "supplierInvoiceNumber is required.");
  }
  if (!input.supplierInvoiceDate) {
    return fail(400, "SUPPLIER_INVOICE_DATE_REQUIRED",
      "supplierInvoiceDate is required.");
  }
  if (input.lineSelections.length === 0) {
    return fail(400, "NO_LINE_SELECTIONS",
      "At least one line selection is required.");
  }

  const fieldErrors: Record<string, string> = {};
  const seenLineIds = new Set<string>();
  for (const [idx, line] of input.lineSelections.entries()) {
    const qty  = Number(line.quantity ?? 0);
    const path = `lineSelections[${idx}]`;
    if (!line.receiptLineId) {
      fieldErrors[`${path}.receiptLineId`] = "required";
    } else if (seenLineIds.has(line.receiptLineId)) {
      fieldErrors[`${path}.receiptLineId`] = "duplicate";
    } else {
      seenLineIds.add(line.receiptLineId);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      fieldErrors[`${path}.quantity`] = "must be greater than zero";
    }
    if (line.unitPrice !== undefined) {
      const up = Number(line.unitPrice);
      if (!Number.isFinite(up) || up < 0) {
        fieldErrors[`${path}.unitPrice`] = "must be non-negative";
      }
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return fail(422, "VALIDATION_FAILED", "One or more line selections are invalid.", fieldErrors);
  }

  // ── Single transaction: load, validate against live state, insert ────────
    const result = await (async (trx: AnyDb) => {
      // Load receipt header — must belong to tenant + be posted + non-terminal.
      const header = await sql<ReceiptHeaderRow>`
        SELECT id, tenant_id, company_code_id, code AS receipt_number,
               commitment_id, supplier_id, currency_code,
               status, terminal_status
          FROM document.receipt
         WHERE id        = ${input.receiptId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
         LIMIT 1
      `.execute(trx);
      const rcp = header.rows[0];
      if (!rcp) {
        return fail(404, "RECEIPT_NOT_FOUND",
          `Receipt ${input.receiptId} not found for tenant.`);
      }
      if (rcp.status !== "posted") {
        return fail(422, "RECEIPT_NOT_POSTED",
          `Receipt ${rcp.receipt_number} is in status '${rcp.status}'; only posted receipts can be invoiced.`);
      }
      if (rcp.terminal_status) {
        return fail(422, "RECEIPT_TERMINAL",
          `Receipt ${rcp.receipt_number} is in terminal status '${rcp.terminal_status}' and cannot be invoiced.`);
      }
      if (input.companyCodeId && input.companyCodeId !== rcp.company_code_id) {
        return fail(422, "COMPANY_CODE_MISMATCH",
          `Receipt ${rcp.receipt_number} belongs to company_code_id ${rcp.company_code_id}; invoice creation cannot override it.`);
      }

      // Load + lock the chosen receipt_line rows. FOR UPDATE so concurrent
      // invoices can't both consume the same accepted_quantity. The
      // `already_invoiced` aggregation joins to existing non-cancelled /
      // non-reversed PI lines that point at this receipt_line (FK
      // pil_receipt_line_fk).
      const chosenIds = input.lineSelections.map((l) => l.receiptLineId);
      const lineRows = await sql<ReceiptLineRow>`
        SELECT
            rcpl.id,
            rcpl.receipt_id,
            rcpl.line_no,
            rcpl.commitment_line_id,
            rcpl.item_id,
            rcpl.item_description,
            rcpl.uom_code,
            rcpl.unit_price,
            rcpl.accepted_quantity,
            rcpl.asset_class_id,
            cl.commodity_category_id,
            cl.business_intent_id,
            cl.classification_decision::text AS classification_decision,
            rcpl.tax_group_id,
            rcpl.withholding_tax_group_id,
            COALESCE((
              SELECT SUM(pil.quantity)::numeric
                FROM document.purchase_invoice_line pil
                JOIN document.purchase_invoice      pi
                  ON pi.id = pil.purchase_invoice_id
                 AND pi.tenant_id = pil.tenant_id
               WHERE pil.tenant_id      = rcpl.tenant_id
                 AND pil.receipt_line_id = rcpl.id
                 AND pi.status NOT IN ('cancelled', 'reversed', 'rejected')
            ), 0) AS already_invoiced
          FROM document.receipt_line rcpl
          JOIN document.commitment_line cl
            ON cl.tenant_id = rcpl.tenant_id AND cl.id = rcpl.commitment_line_id
         WHERE rcpl.tenant_id  = ${input.tenantId}::uuid
           AND rcpl.receipt_id = ${input.receiptId}::uuid
           AND rcpl.id         = ANY(${chosenIds}::uuid[])
           FOR UPDATE OF rcpl
      `.execute(trx);

      if (lineRows.rows.length !== chosenIds.length) {
        const found = new Set(lineRows.rows.map((r) => r.id));
        const missing = chosenIds.filter((id) => !found.has(id));
        return fail(422, "RECEIPT_LINES_NOT_FOUND",
          `One or more selected receipt_line ids do not belong to this receipt / tenant.`,
          Object.fromEntries(missing.map((id) => [id, "not found on receipt"])));
      }

      // Per-line remaining-to-invoice gate.
      const lineById = new Map(lineRows.rows.map((r) => [r.id, r]));
      const perLineErrors: Record<string, string> = {};
      for (const sel of input.lineSelections) {
        const rcpl = lineById.get(sel.receiptLineId);
        if (!rcpl) continue;
        const qty       = Number(sel.quantity);
        const remaining = Number(rcpl.accepted_quantity) - Number(rcpl.already_invoiced);
        if (qty > remaining) {
          perLineErrors[sel.receiptLineId] =
            `quantity (${qty}) exceeds remaining (${remaining}) on receipt line ${rcpl.line_no} ` +
            `(accepted=${rcpl.accepted_quantity}, already invoiced=${rcpl.already_invoiced})`;
        }
      }
      if (Object.keys(perLineErrors).length > 0) {
        return fail(422, "QUANTITY_OVER_REMAINING",
          "One or more invoice lines exceed the receipt line's remaining-to-invoice quantity.",
          perLineErrors);
      }

      // ── Insert PI header ────────────────────────────────────────────
      const documentDate = input.documentDate ?? new Date().toISOString().slice(0, 10);
      const resolvedCompanyCodeId = rcp.company_code_id;
      const headerDefaults = await resolvePurchaseInvoiceHeaderDefaults(
        {
          company_code_id: resolvedCompanyCodeId,
          supplier_id:     rcp.supplier_id,
          commitment_id:   rcp.commitment_id,
          currency_code:   rcp.currency_code,
          invoice_source:  "po_based",
          invoice_type:    "standard",
          match_type:      "three_way",
          status:          "draft",
        },
        { db: trx, tenantId: input.tenantId, userId: input.principalId },
      );
      const headerInsert = await sql<{ id: string }>`
        INSERT INTO document.purchase_invoice (
          tenant_id, company_code_id,
          code, name, supplier_invoice_number, supplier_invoice_date,
          supplier_id, commitment_id,
          posting_date, received_date,
          currency_code, base_currency_code,
          fiscal_year, period_number,
          payment_term_id,
          invoice_source, invoice_type, match_type,
          status,
          requested_by,
          created_by
        ) VALUES (
          ${input.tenantId}::uuid,
          ${resolvedCompanyCodeId}::uuid,
          ${input.invoiceNumber}::text,
          ${`Purchase Invoice ${input.invoiceNumber}`}::text,
          ${trimmedSupplierInvNo}::text,
          ${input.supplierInvoiceDate}::date,
          ${rcp.supplier_id}::uuid,
          ${rcp.commitment_id}::uuid,
          ${documentDate}::date,
          ${documentDate}::date,
          ${rcp.currency_code}::char(3),
          ${input.baseCurrencyCode}::char(3),
          ${input.fiscalYear}::smallint,
          ${input.periodNumber}::smallint,
          ${headerDefaults["payment_term_id"] ?? null}::uuid,
          'po_based'::text,
          'standard'::text,
          'three_way'::text,
          'draft'::text,
          ${input.principalId}::uuid,
          ${input.principalId}::uuid
        )
        RETURNING id
      `.execute(trx);

      const invoiceId = headerInsert.rows[0]?.id;
      if (!invoiceId) {
        throw new Error("PI header insert did not return id.");
      }

      // ── Insert PI lines ─────────────────────────────────────────────
      let lineNo       = 1;
      let linesWritten = 0;
      for (const sel of input.lineSelections) {
        const rcpl = lineById.get(sel.receiptLineId)!;
        const qty       = Number(sel.quantity);
        const unitPrice = sel.unitPrice !== undefined ? Number(sel.unitPrice) : Number(rcpl.unit_price);
        const insertedLine = await sql<{ id: string }>`
          INSERT INTO document.purchase_invoice_line (
            tenant_id, company_code_id, purchase_invoice_id, line_no,
            receipt_line_id, commitment_line_id,
            item_id, item_description, uom_code,
            quantity, unit_price, price_unit, currency_code,
            asset_class_id,
            commodity_category_id, business_intent_id, classification_decision,
            tax_group_id, withholding_tax_group_id,
            created_by
          ) VALUES (
            ${input.tenantId}::uuid,
            ${resolvedCompanyCodeId}::uuid,
            ${invoiceId}::uuid,
            ${lineNo}::smallint,
            ${rcpl.id}::uuid,
            ${rcpl.commitment_line_id}::uuid,
            ${rcpl.item_id}::uuid,
            ${rcpl.item_description}::text,
            ${rcpl.uom_code}::text,
            ${qty}::numeric,
            ${unitPrice}::numeric,
            1::numeric,
            ${rcp.currency_code}::char(3),
            ${rcpl.asset_class_id ?? null}::uuid,
            ${rcpl.commodity_category_id ?? null}::uuid,
            ${rcpl.business_intent_id ?? null}::uuid,
            ${rcpl.classification_decision ?? null}::jsonb,
            ${rcpl.tax_group_id ?? null}::uuid,
            ${rcpl.withholding_tax_group_id ?? null}::uuid,
            ${input.principalId}::uuid
          )
          RETURNING id
        `.execute(trx);
        const lineId = insertedLine.rows[0]?.id;
        if (!lineId) {
          throw new Error("PI line insert did not return id.");
        }
        await inheritProcurementLineAccounting(trx, {
          tenantId: input.tenantId,
          sourceDocType: "receipt_line", sourceDocId: input.receiptId, sourceLineId: rcpl.id,
          targetDocType: "purchase_invoice_line", targetDocId: invoiceId, targetLineId: lineId,
          principalId: input.principalId,
        });
        await applyPurchaseInvoiceLineDefaults(trx, {
          tenantId:    input.tenantId,
          invoiceId,
          lineId,
          principalId: input.principalId,
        });
        lineNo       += 1;
        linesWritten += 1;
      }

      const accountingProjection = await refreshDistributionCostBasis(trx, {
        tenantId: input.tenantId, sourceDocType: "purchase_invoice_line", sourceDocId: invoiceId,
        principalId: input.principalId,
      });
      await sql`
        UPDATE document.purchase_invoice
           SET total_amount = ${accountingProjection.totals.DISTRIBUTABLE_COST + accountingProjection.totals.RECOVERABLE_TAX},
               tax_amount = ${accountingProjection.totals.RECOVERABLE_TAX + accountingProjection.totals.NONRECOVERABLE_TAX},
               withholding_tax_amount = ${accountingProjection.totals.WHT_LIABILITY},
               retention_amount = ${accountingProjection.totals.RETENTION_LIABILITY},
               updated_at = now(), updated_by = ${input.principalId}::uuid
         WHERE tenant_id = ${input.tenantId}::uuid AND id = ${invoiceId}::uuid
      `.execute(trx);

      await emitOutboxEvent(trx, {
        tenantId:      input.tenantId,
        topic:         "notification",
        eventType:     "p2p.invoice.created_from_receipt",
        entityType:    "purchase_invoice",
        entityId:      invoiceId,
        aggregateType: "receipt",
        aggregateId:   input.receiptId,
        actorId:       input.principalId,
        payload: {
          code:          input.invoiceNumber,
          receipt_id:              input.receiptId,
          supplier_invoice_number: trimmedSupplierInvNo,
          lines_written:           linesWritten,
          document_date:           documentDate,
        },
      });

      return ok(invoiceId, input.invoiceNumber, linesWritten);
    })(db);

    return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ok(invoiceId: string, invoiceNumber: string, linesWritten: number): InvoiceFromReceiptOutcome {
  return { ok: true, invoiceId, invoiceNumber, linesWritten };
}

function fail(
  status:       number,
  error:        string,
  message:      string,
  fieldErrors?: Record<string, string>,
): InvoiceFromReceiptOutcome {
  return { ok: false, status, error, message, ...(fieldErrors ? { fieldErrors } : {}) };
}
