/**
 * Purchase Invoice Cross-Entity Invariants Service - Phase 1 reset model.
 *
 * Validates current canonical fields only. Removed PI header caches such as
 * subtotal_amount, is_posted, is_reversal and reversal_of_id are intentionally
 * not referenced here.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { validatePcInvariants } from "../../pricing_component/pricing-component.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const ROUNDING_TOLERANCE = 0.01;

export type InvariantCode =
  | "HEADER_TOTAL_DRIFT"
  | "AD_SPLIT_PERCENT_NOT_100"
  | "AD_SPLIT_AMOUNT_MISMATCH"
  | "AD_SPLIT_QUANTITY_MISMATCH"
  | "ASSET_LINE_AD_MISSING_CAPEX"
  | "PO_COMMITMENT_REQUIRED"
  | "APPROVAL_AUDIT_PAIR_MISMATCH"
  | "PIL_SITE_SCOPE_MISMATCH"
  | "PIL_SHIPTO_NOT_LINKED_TO_SITE"
  | "PIL_SHIPFROM_NOT_LINKED_TO_SUPPLIER"
  | "PC_BASIS_VALUE_DRIFT"
  | "PC_APPORTION_SUM_DRIFT"
  | "PC_SUPERSEDE_CHAIN_BROKEN"
  | "PC_BASE_REQUIRED_FOR_BASIS";

export interface InvariantViolation {
  code:    InvariantCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface InvariantContext {
  phase: "submit" | "approve" | "post";
}

export interface InvariantResult {
  ok:         boolean;
  violations: InvariantViolation[];
}

export async function validatePurchaseInvoiceInvariants(
  db:        AnyDb,
  tenantId:  string,
  invoiceId: string,
  ctx:       InvariantContext,
): Promise<InvariantResult> {
  const violations: InvariantViolation[] = [];

  const header = await sql<{
    id:              string;
    status:          string;
    invoice_source:  string;
    commitment_id:   string | null;
    company_code_id: string;
    supplier_id:     string | null;
    total_amount:    string;
    approved_at:     Date | null;
    approved_by:     string | null;
  }>`
    SELECT id, status, invoice_source, commitment_id,
           company_code_id, supplier_id,
           total_amount, approved_at, approved_by
      FROM document.purchase_invoice
     WHERE id = ${invoiceId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);

  const h = header.rows[0];
  if (!h) {
    return {
      ok: false,
      violations: [{ code: "HEADER_TOTAL_DRIFT", message: `Invoice ${invoiceId} not found.` }],
    };
  }

  const totalRow = await sql<{ sum: string | null }>`
    SELECT COALESCE(SUM(gross_amount), 0)::text AS sum
      FROM document.purchase_invoice_line
     WHERE purchase_invoice_id = ${invoiceId}::uuid
       AND tenant_id = ${tenantId}::uuid
  `.execute(db);
  const lineGrossSum = Number(totalRow.rows[0]?.sum ?? 0);
  const headerTotal = Number(h.total_amount ?? 0);
  if (Math.abs(headerTotal - lineGrossSum) > ROUNDING_TOLERANCE) {
    violations.push({
      code: "HEADER_TOTAL_DRIFT",
      message: `Header total_amount (${headerTotal}) does not match SUM(line.gross_amount) (${lineGrossSum}).`,
      details: { header: headerTotal, lines: lineGrossSum, tolerance: ROUNDING_TOLERANCE },
    });
  }

  const adSplits = await sql<{
    source_line_id:     string;
    distribution_basis: string;
    sum_pct:            string | null;
    sum_amount:         string | null;
    sum_quantity:       string | null;
    line_gross:         string | null;
    line_qty:           string | null;
  }>`
    SELECT ad.source_line_id,
           ad.distribution_basis,
           COALESCE(SUM(ad.split_pct), 0)::text AS sum_pct,
           COALESCE(SUM(ad.split_amount), 0)::text AS sum_amount,
           COALESCE(SUM(ad.split_quantity), 0)::text AS sum_quantity,
           ABS(COALESCE(pil.gross_amount, pil.net_amount + pil.tax_amount, pil.net_amount, 0))::text AS line_gross,
           pil.quantity::text AS line_qty
      FROM document.accounting_distribution ad
      JOIN document.purchase_invoice_line pil
        ON pil.id = ad.source_line_id
       AND pil.tenant_id = ad.tenant_id
     WHERE ad.source_doc_type = 'purchase_invoice_line'
       AND ad.source_doc_id = ${invoiceId}::uuid
       AND ad.tenant_id = ${tenantId}::uuid
     GROUP BY ad.source_line_id, ad.distribution_basis,
              pil.gross_amount, pil.net_amount, pil.tax_amount, pil.quantity
  `.execute(db);

  for (const split of adSplits.rows) {
    if (split.distribution_basis === "PERCENT") {
      const sumPct = Number(split.sum_pct ?? 0);
      if (Math.abs(sumPct - 100) > ROUNDING_TOLERANCE) {
        violations.push({
          code: "AD_SPLIT_PERCENT_NOT_100",
          message: `Line ${split.source_line_id}: percent splits sum to ${sumPct}, expected 100.`,
          details: { line_id: split.source_line_id, sum: sumPct },
        });
      }
    } else if (split.distribution_basis === "AMOUNT") {
      const sumAmt = Number(split.sum_amount ?? 0);
      const lineGross = Number(split.line_gross ?? 0);
      if (Math.abs(sumAmt - lineGross) > ROUNDING_TOLERANCE) {
        violations.push({
          code: "AD_SPLIT_AMOUNT_MISMATCH",
          message: `Line ${split.source_line_id}: amount splits sum to ${sumAmt}, line gross_amount is ${lineGross}.`,
          details: { line_id: split.source_line_id, splits_sum: sumAmt, line_gross: lineGross },
        });
      }
    } else if (split.distribution_basis === "QUANTITY") {
      const sumQty = Number(split.sum_quantity ?? 0);
      const lineQty = Number(split.line_qty ?? 0);
      if (Math.abs(sumQty - lineQty) > ROUNDING_TOLERANCE) {
        violations.push({
          code: "AD_SPLIT_QUANTITY_MISMATCH",
          message: `Line ${split.source_line_id}: quantity splits sum to ${sumQty}, line quantity is ${lineQty}.`,
          details: { line_id: split.source_line_id, splits_sum: sumQty, line_qty: lineQty },
        });
      }
    }
  }

  const assetCheck = await sql<{ line_id: string; line_no: number }>`
    SELECT pil.id AS line_id, pil.line_no
      FROM document.purchase_invoice_line pil
     WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
       AND pil.tenant_id = ${tenantId}::uuid
       AND pil.asset_class_id IS NULL
       AND EXISTS (
         SELECT 1
           FROM document.accounting_distribution ad
          WHERE ad.tenant_id = pil.tenant_id
            AND ad.source_doc_type = 'purchase_invoice_line'
            AND ad.source_line_id = pil.id
            AND ad.asset_id IS NOT NULL
       )
  `.execute(db);

  for (const row of assetCheck.rows) {
    violations.push({
      code: "ASSET_LINE_AD_MISSING_CAPEX",
      message: `Line ${row.line_no} has no asset_class_id but a distribution split sets asset_id.`,
      details: { line_id: row.line_id, line_no: row.line_no },
    });
  }

  if (["po_based", "contract_based"].includes(h.invoice_source) && !h.commitment_id) {
    violations.push({
      code: "PO_COMMITMENT_REQUIRED",
      message: `invoice_source='${h.invoice_source}' requires a commitment_id.`,
      details: { invoice_source: h.invoice_source },
    });
  }

  if ((h.approved_at === null) !== (h.approved_by === null)) {
    violations.push({
      code: "APPROVAL_AUDIT_PAIR_MISMATCH",
      message: "approved_at and approved_by must be set together (or both null).",
      details: { approved_at: h.approved_at, approved_by: h.approved_by },
    });
  }

  if (ctx.phase === "submit") {
    const siteScope = await sql<{ line_no: number; site_id: string }>`
      SELECT pil.line_no, pil.site_id::text
        FROM document.purchase_invoice_line pil
        JOIN master.site s
          ON s.id = pil.site_id
         AND s.tenant_id = pil.tenant_id
       WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
         AND pil.tenant_id = ${tenantId}::uuid
         AND pil.site_id IS NOT NULL
         AND s.company_code_id IS DISTINCT FROM ${h.company_code_id}::uuid
       ORDER BY pil.line_no
    `.execute(db);
    for (const row of siteScope.rows) {
      violations.push({
        code: "PIL_SITE_SCOPE_MISMATCH",
        message: `Line ${row.line_no}: site_id does not belong to the invoice company code.`,
        details: { line_no: row.line_no, site_id: row.site_id, company_code_id: h.company_code_id },
      });
    }

    const shiptoLink = await sql<{ line_no: number; shipto_address_id: string; site_id: string }>`
      SELECT pil.line_no, pil.shipto_address_id::text, pil.site_id::text
        FROM document.purchase_invoice_line pil
       WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
         AND pil.tenant_id = ${tenantId}::uuid
         AND pil.shipto_address_id IS NOT NULL
         AND pil.site_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM master.v_site_address vsa
            WHERE vsa.tenant_id = pil.tenant_id
              AND vsa.site_id = pil.site_id
              AND vsa.address_id = pil.shipto_address_id
              AND vsa.purpose IN ('ship_to','default')
         )
       ORDER BY pil.line_no
    `.execute(db);
    for (const row of shiptoLink.rows) {
      violations.push({
        code: "PIL_SHIPTO_NOT_LINKED_TO_SITE",
        message: `Line ${row.line_no}: shipto_address_id is not linked to the chosen site.`,
        details: { line_no: row.line_no, shipto_address_id: row.shipto_address_id, site_id: row.site_id },
      });
    }

    if (h.supplier_id) {
      const shipfromLink = await sql<{ line_no: number; shipfrom_address_id: string }>`
        SELECT pil.line_no, pil.shipfrom_address_id::text
          FROM document.purchase_invoice_line pil
         WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
           AND pil.tenant_id = ${tenantId}::uuid
           AND pil.shipfrom_address_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
               FROM master.v_supplier_address vsa
              WHERE vsa.tenant_id = pil.tenant_id
                AND vsa.supplier_id = ${h.supplier_id}::uuid
                AND vsa.address_id = pil.shipfrom_address_id
                AND vsa.purpose IN ('ship_from','default')
           )
         ORDER BY pil.line_no
      `.execute(db);
      for (const row of shipfromLink.rows) {
        violations.push({
          code: "PIL_SHIPFROM_NOT_LINKED_TO_SUPPLIER",
          message: `Line ${row.line_no}: shipfrom_address_id is not linked to the supplier.`,
          details: { line_no: row.line_no, shipfrom_address_id: row.shipfrom_address_id, supplier_id: h.supplier_id },
        });
      }
    }
  }

  const pcViolations = await validatePcInvariants(db, tenantId, invoiceId);
  for (const v of pcViolations) {
    violations.push({ code: v.code as InvariantCode, message: v.message, details: v.details });
  }

  return { ok: violations.length === 0, violations };
}