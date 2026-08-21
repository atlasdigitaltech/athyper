/**
 * Invoice from Service Sheet — transactional create service.
 *
 * Service invoices use a two-way match: posted service_sheet_line + supplier
 * invoice. The service writes a draft PI header + PI lines in one transaction
 * and delegates all user-visible PIL defaults to the shared Meta Entity-backed
 * PI line default resolver.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { emitOutboxEvent, resolvePurchaseInvoiceHeaderDefaults } from "@athyper/svc-shared";
import { applyPurchaseInvoiceLineDefaults } from "./pi-line-defaults.service.js";
import { inheritProcurementLineAccounting } from "../procurement-line-accounting-inheritance.service.js";
import { refreshDistributionCostBasis } from "../../pricing_component/component-accounting-loader.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface InvoiceFromServiceSheetLineInput {
  serviceSheetLineId: string;
  quantity:           number;
  unitPrice?:         number;
  notes?:             string;
}

export interface InvoiceFromServiceSheetInput {
  tenantId:              string;
  principalId:           string;
  serviceSheetId:        string;
  companyCodeId?:        string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate:   string;
  documentDate?:         string;
  notes?:                string;
  invoiceNumber:         string;
  fiscalYear:            number;
  periodNumber:          number;
  baseCurrencyCode:      string;
  lineSelections:        InvoiceFromServiceSheetLineInput[];
}

export type InvoiceFromServiceSheetOutcome =
  | { ok: true; invoiceId: string; invoiceNumber: string; linesWritten: number }
  | {
      ok:           false;
      status:       number;
      error:        string;
      message:      string;
      fieldErrors?: Record<string, string>;
    };

interface ServiceSheetHeaderRow {
  id:                   string;
  tenant_id:            string;
  company_code_id:      string;
  service_sheet_number: string;
  commitment_id:        string;
  supplier_id:          string;
  currency_code:        string;
  status:               string;
  terminal_status:      string | null;
}

interface ServiceSheetLineRow {
  id:                   string;
  service_sheet_id:     string;
  line_no:              number;
  commitment_line_id:   string;
  item_id:              string | null;
  item_description:     string;
  uom_code:             string;
  unit_price:           number;
  quantity:             number;
  already_invoiced:     number;
}

export async function createInvoiceFromServiceSheet(
  db: AnyDb,
  input: InvoiceFromServiceSheetInput,
): Promise<InvoiceFromServiceSheetOutcome> {
  const validation = await preflightInvoiceFromServiceSheet(input).catch(() => null);
  if (validation) return validation;
  try {
    return await db.transaction().execute((trx) => createInvoiceFromServiceSheetInTransaction(trx, input));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return err instanceof Error && /violates|constraint/i.test(err.message)
      ? fail(422, "INVOICE_INSERT_REJECTED", message)
      : fail(500, "INVOICE_FROM_SERVICE_SHEET_FAILED", message);
  }
}

const SERVICE_INVOICE_PREFLIGHT_BOUNDARY = Symbol("service-invoice-preflight-boundary");
const SERVICE_INVOICE_PREFLIGHT_DB = { executeQuery: () => { throw SERVICE_INVOICE_PREFLIGHT_BOUNDARY; } } as unknown as AnyDb;
async function preflightInvoiceFromServiceSheet(input: InvoiceFromServiceSheetInput): Promise<InvoiceFromServiceSheetOutcome | null> {
  try { return await createInvoiceFromServiceSheetInTransaction(SERVICE_INVOICE_PREFLIGHT_DB, input); }
  catch (err) { if (err === SERVICE_INVOICE_PREFLIGHT_BOUNDARY) return null; throw err; }
}

/** Performs the conversion on the caller-owned transaction. */
export async function createInvoiceFromServiceSheetInTransaction(
  db: AnyDb,
  input: InvoiceFromServiceSheetInput,
): Promise<InvoiceFromServiceSheetOutcome> {
  const trimmedSupplierInvNo = (input.supplierInvoiceNumber ?? "").trim();
  if (!trimmedSupplierInvNo) {
    return fail(400, "SUPPLIER_INVOICE_NUMBER_REQUIRED", "supplierInvoiceNumber is required.");
  }
  if (!input.supplierInvoiceDate) {
    return fail(400, "SUPPLIER_INVOICE_DATE_REQUIRED", "supplierInvoiceDate is required.");
  }
  if (input.lineSelections.length === 0) {
    return fail(400, "NO_LINE_SELECTIONS", "At least one line selection is required.");
  }

  const fieldErrors: Record<string, string> = {};
  const seenLineIds = new Set<string>();
  for (const [idx, line] of input.lineSelections.entries()) {
    const qty = Number(line.quantity ?? 0);
    const path = `lineSelections[${idx}]`;
    if (!line.serviceSheetLineId) {
      fieldErrors[`${path}.serviceSheetLineId`] = "required";
    } else if (seenLineIds.has(line.serviceSheetLineId)) {
      fieldErrors[`${path}.serviceSheetLineId`] = "duplicate";
    } else {
      seenLineIds.add(line.serviceSheetLineId);
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

    const result = await (async (trx: AnyDb) => {
      const header = await sql<ServiceSheetHeaderRow>`
        SELECT id, tenant_id, company_code_id, service_sheet_number,
               commitment_id, supplier_id, currency_code,
               status, terminal_status
          FROM document.service_sheet
         WHERE id = ${input.serviceSheetId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
         LIMIT 1
      `.execute(trx);
      const ssh = header.rows[0];
      if (!ssh) {
        return fail(404, "SERVICE_SHEET_NOT_FOUND", `Service sheet ${input.serviceSheetId} not found for tenant.`);
      }
      if (ssh.status !== "posted") {
        return fail(422, "SERVICE_SHEET_NOT_POSTED",
          `Service sheet ${ssh.service_sheet_number} is in status '${ssh.status}'; only posted service sheets can be invoiced.`);
      }
      if (ssh.terminal_status) {
        return fail(422, "SERVICE_SHEET_TERMINAL",
          `Service sheet ${ssh.service_sheet_number} is in terminal status '${ssh.terminal_status}' and cannot be invoiced.`);
      }
      if (input.companyCodeId && input.companyCodeId !== ssh.company_code_id) {
        return fail(422, "COMPANY_CODE_MISMATCH",
          `Service sheet ${ssh.service_sheet_number} belongs to company_code_id ${ssh.company_code_id}; invoice creation cannot override it.`);
      }

      const chosenIds = input.lineSelections.map((line) => line.serviceSheetLineId);
      const lineRows = await sql<ServiceSheetLineRow>`
        SELECT
            sshl.id,
            sshl.service_sheet_id,
            sshl.line_no,
            sshl.commitment_line_id,
            sshl.item_id,
            sshl.item_description,
            sshl.uom_code,
            sshl.unit_price,
            sshl.quantity,
            COALESCE((
              SELECT SUM(pil.quantity)::numeric
                FROM document.purchase_invoice_line pil
                JOIN document.purchase_invoice pi
                  ON pi.id = pil.purchase_invoice_id
                 AND pi.tenant_id = pil.tenant_id
               WHERE pil.tenant_id = sshl.tenant_id
                 AND pil.service_sheet_line_id = sshl.id
                 AND pi.status NOT IN ('cancelled', 'reversed', 'rejected')
            ), 0) AS already_invoiced
          FROM document.service_sheet_line sshl
         WHERE sshl.tenant_id = ${input.tenantId}::uuid
           AND sshl.service_sheet_id = ${input.serviceSheetId}::uuid
           AND sshl.id = ANY(${chosenIds}::uuid[])
           FOR UPDATE OF sshl
      `.execute(trx);

      if (lineRows.rows.length !== chosenIds.length) {
        const found = new Set(lineRows.rows.map((row) => row.id));
        const missing = chosenIds.filter((id) => !found.has(id));
        return fail(422, "SERVICE_SHEET_LINES_NOT_FOUND",
          "One or more selected service_sheet_line ids do not belong to this service sheet / tenant.",
          Object.fromEntries(missing.map((id) => [id, "not found on service sheet"])));
      }

      const lineById = new Map(lineRows.rows.map((row) => [row.id, row]));
      const perLineErrors: Record<string, string> = {};
      for (const sel of input.lineSelections) {
        const sshl = lineById.get(sel.serviceSheetLineId);
        if (!sshl) continue;
        const qty = Number(sel.quantity);
        const remaining = Number(sshl.quantity) - Number(sshl.already_invoiced);
        if (qty > remaining) {
          perLineErrors[sel.serviceSheetLineId] =
            `quantity (${qty}) exceeds remaining (${remaining}) on service sheet line ${sshl.line_no} ` +
            `(certified=${sshl.quantity}, already invoiced=${sshl.already_invoiced})`;
        }
      }
      if (Object.keys(perLineErrors).length > 0) {
        return fail(422, "QUANTITY_OVER_REMAINING",
          "One or more invoice lines exceed the service sheet line's remaining-to-invoice quantity.",
          perLineErrors);
      }

      const documentDate = input.documentDate ?? new Date().toISOString().slice(0, 10);
      const resolvedCompanyCodeId = ssh.company_code_id;
      const headerDefaults = await resolvePurchaseInvoiceHeaderDefaults(
        {
          company_code_id: resolvedCompanyCodeId,
          supplier_id:     ssh.supplier_id,
          commitment_id:   ssh.commitment_id,
          currency_code:   ssh.currency_code,
          invoice_source:  "po_based",
          invoice_type:    "standard",
          match_type:      "two_way",
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
          ${ssh.supplier_id}::uuid,
          ${ssh.commitment_id}::uuid,
          ${documentDate}::date,
          ${documentDate}::date,
          ${ssh.currency_code}::char(3),
          ${input.baseCurrencyCode}::char(3),
          ${input.fiscalYear}::smallint,
          ${input.periodNumber}::smallint,
          ${headerDefaults["payment_term_id"] ?? null}::uuid,
          'po_based'::text,
          'standard'::text,
          'two_way'::text,
          'draft'::text,
          ${input.principalId}::uuid,
          ${input.principalId}::uuid
        )
        RETURNING id
      `.execute(trx);

      const invoiceId = headerInsert.rows[0]?.id;
      if (!invoiceId) throw new Error("PI header insert did not return id.");

      let lineNo = 1;
      let linesWritten = 0;
      for (const sel of input.lineSelections) {
        const sshl = lineById.get(sel.serviceSheetLineId)!;
        const qty = Number(sel.quantity);
        const unitPrice = sel.unitPrice !== undefined ? Number(sel.unitPrice) : Number(sshl.unit_price);
        const insertedLine = await sql<{ id: string }>`
          INSERT INTO document.purchase_invoice_line (
            tenant_id, company_code_id, purchase_invoice_id, line_no,
            service_sheet_line_id, commitment_line_id,
            item_id, item_description, uom_code,
            quantity, unit_price, price_unit, currency_code,
            created_by
          ) VALUES (
            ${input.tenantId}::uuid,
            ${resolvedCompanyCodeId}::uuid,
            ${invoiceId}::uuid,
            ${lineNo}::smallint,
            ${sshl.id}::uuid,
            ${sshl.commitment_line_id}::uuid,
            ${sshl.item_id ?? null}::uuid,
            ${sshl.item_description}::text,
            ${sshl.uom_code}::text,
            ${qty}::numeric,
            ${unitPrice}::numeric,
            1::numeric,
            ${ssh.currency_code}::char(3),
            ${input.principalId}::uuid
          )
          RETURNING id
        `.execute(trx);
        const lineId = insertedLine.rows[0]?.id;
        if (!lineId) throw new Error("PI line insert did not return id.");
        await inheritProcurementLineAccounting(trx, {
          tenantId: input.tenantId,
          sourceDocType: "service_sheet_line", sourceDocId: input.serviceSheetId, sourceLineId: sshl.id,
          targetDocType: "purchase_invoice_line", targetDocId: invoiceId, targetLineId: lineId,
          principalId: input.principalId,
        });
        await applyPurchaseInvoiceLineDefaults(trx, {
          tenantId: input.tenantId,
          invoiceId,
          lineId,
          principalId: input.principalId,
        });
        lineNo += 1;
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
        eventType:     "p2p.invoice.created_from_service_sheet",
        entityType:    "purchase_invoice",
        entityId:      invoiceId,
        aggregateType: "service_sheet",
        aggregateId:   input.serviceSheetId,
        actorId:       input.principalId,
        payload: {
          code:                    input.invoiceNumber,
          service_sheet_id:        input.serviceSheetId,
          supplier_invoice_number: trimmedSupplierInvNo,
          lines_written:           linesWritten,
          document_date:           documentDate,
        },
      });

      return ok(invoiceId, input.invoiceNumber, linesWritten);
    })(db);

    return result;
}

function ok(invoiceId: string, invoiceNumber: string, linesWritten: number): InvoiceFromServiceSheetOutcome {
  return { ok: true, invoiceId, invoiceNumber, linesWritten };
}

function fail(
  status: number,
  error: string,
  message: string,
  fieldErrors?: Record<string, string>,
): InvoiceFromServiceSheetOutcome {
  return { ok: false, status, error, message, ...(fieldErrors ? { fieldErrors } : {}) };
}
