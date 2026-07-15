/**
 * Purchase Invoice Cross-Entity Invariants Service.
 *
 * Validates invariants that span header / line / accounting_distribution
 * before key lifecycle transitions:
 *
 *   - submit  → enforces invariants 1, 3, 4, 5, 6   (financial + structural)
 *   - approve → re-runs (1), enforces audit pairing
 *   - post    → re-runs all                          (final safety net)
 *
 * Each invariant returns { ok: true } or { ok: false; code; message; details }.
 * The caller can choose to throw or aggregate violations.
 *
 * Invariants list (from project_pi_field_hardening Sprint 2):
 *   1. header.subtotal_amount = SUM(line.net_amount) within rounding tolerance
 *   2. header.total_amount    = SUM(line.gross_amount)  within rounding tolerance
 *      (lines roll up; header freight/misc/discount/tax already accounted for
 *       in line gross by the time totals refresh runs)
 *   3. AD splits per source line satisfy basis invariants:
 *        PERCENT  → SUM(split_pct) = 100 ± tolerance
 *        AMOUNT   → SUM(split_amount) = parent_line.net_amount ± tolerance
 *        QUANTITY → SUM(split_quantity) = parent_line.quantity ± tolerance
 *   4. Asset interlock: line.asset_class_id NOT NULL ⇒ every AD row for that line
 *      must either set asset_id (specific master.asset capitalised) or be NULL
 *      (class-pending: posts to class-clearing GL until settlement)
 *   5. Reversal interlock: is_reversal=true ⇒ reversal_of_id NOT NULL AND target.is_posted=true
 *   6. PO link interlock: invoice_source IN (po_based, contract_based)
 *      ⇒ commitment_id NOT NULL (defense-in-depth; DDL also enforces)
 *   7. Approval audit pair: (approved_at IS NULL) = (approved_by IS NULL)
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { validatePcInvariants } from "../../pricing_component/pricing-component.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

const ROUNDING_TOLERANCE = 0.01; // 1 cent — covers floor/round divergence at line level

export type InvariantCode =
  | "HEADER_SUBTOTAL_DRIFT"
  | "HEADER_TOTAL_DRIFT"
  | "AD_SPLIT_PERCENT_NOT_100"
  | "AD_SPLIT_AMOUNT_MISMATCH"
  | "AD_SPLIT_QUANTITY_MISMATCH"
  | "ASSET_LINE_AD_MISSING_CAPEX"
  | "REVERSAL_OF_NOT_POSTED"
  | "PO_COMMITMENT_REQUIRED"
  | "APPROVAL_AUDIT_PAIR_MISMATCH"
  // PIL site / ship-address invariants — defense-in-depth alongside the
  // line.default_shipping resolver and the runtime picker
  // filter. Fired at submit so user has full freedom in draft.
  | "PIL_SITE_SCOPE_MISMATCH"
  | "PIL_SHIPTO_NOT_LINKED_TO_SITE"
  | "PIL_SHIPFROM_NOT_LINKED_TO_SUPPLIER"
  // P4 v1.2 — Pricing Component invariants (forwarded from pricing-component.service)
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
  /** Which lifecycle event is triggering the check. Controls which subset runs. */
  phase: "submit" | "approve" | "post";
}

export interface InvariantResult {
  ok:         boolean;
  violations: InvariantViolation[];
}

/**
 * Runs the invariants matching the phase. Returns all violations rather than
 * stopping at the first — the caller surfaces them as a single 422 with a
 * `violations` array so the user can fix everything in one pass.
 */
export async function validatePurchaseInvoiceInvariants(
  db:        AnyDb,
  tenantId:  string,
  invoiceId: string,
  ctx:       InvariantContext,
): Promise<InvariantResult> {
  const violations: InvariantViolation[] = [];

  // Load the header once — all invariants reference it.
  const header = await sql<{
    id:                 string;
    status:             string;
    invoice_source:     string;
    is_reversal:        boolean;
    reversal_of_id:     string | null;
    commitment_id:      string | null;
    company_code_id:    string;
    supplier_id:        string | null;
    subtotal_amount:    string;
    total_amount:       string;
    approved_at:        Date | null;
    approved_by:        string | null;
  }>`
    SELECT id, status, invoice_source, is_reversal, reversal_of_id, commitment_id,
           company_code_id, supplier_id,
           subtotal_amount, total_amount, approved_at, approved_by
      FROM document.purchase_invoice
     WHERE id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  const h = header.rows[0];
  if (!h) {
    return {
      ok:         false,
      violations: [{
        code:    "HEADER_SUBTOTAL_DRIFT",
        message: `Invoice ${invoiceId} not found.`,
      }],
    };
  }

  // ── Invariant 1: header.subtotal_amount = SUM(line.net_amount) ───────────
  const subtotalRow = await sql<{ sum: string | null }>`
    SELECT COALESCE(SUM(net_amount), 0)::text AS sum
      FROM document.purchase_invoice_line
     WHERE purchase_invoice_id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid
  `.execute(db);
  const lineSubtotalSum = Number(subtotalRow.rows[0]?.sum ?? 0);
  const headerSubtotal  = Number(h.subtotal_amount ?? 0);
  if (Math.abs(headerSubtotal - lineSubtotalSum) > ROUNDING_TOLERANCE) {
    violations.push({
      code:    "HEADER_SUBTOTAL_DRIFT",
      message: `Header subtotal_amount (${headerSubtotal}) does not match SUM(line.net_amount) (${lineSubtotalSum}).`,
      details: { header: headerSubtotal, lines: lineSubtotalSum, tolerance: ROUNDING_TOLERANCE },
    });
  }

  // ── Invariant 2: header.total_amount = SUM(line.gross_amount) ───────────
  const totalRow = await sql<{ sum: string | null }>`
    SELECT COALESCE(SUM(gross_amount), 0)::text AS sum
      FROM document.purchase_invoice_line
     WHERE purchase_invoice_id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid
  `.execute(db);
  const lineGrossSum = Number(totalRow.rows[0]?.sum ?? 0);
  const headerTotal  = Number(h.total_amount ?? 0);
  if (Math.abs(headerTotal - lineGrossSum) > ROUNDING_TOLERANCE) {
    violations.push({
      code:    "HEADER_TOTAL_DRIFT",
      message: `Header total_amount (${headerTotal}) does not match SUM(line.gross_amount) (${lineGrossSum}).`,
      details: { header: headerTotal, lines: lineGrossSum, tolerance: ROUNDING_TOLERANCE },
    });
  }

  // ── Invariant 3: AD split totals per source_line_id ─────────────────────
  // Per basis: PERCENT sums to 100, AMOUNT sums to line.gross_amount,
  // QUANTITY sums to line.quantity. AD balances against gross because the
  // line's tax + charges have already been accumulated into gross_amount,
  // which is what records.route.ts:loadPurchaseInvoiceLineAmount uses to
  // distribute PERCENT splits and what the AD panel UI shows as the
  // balance target.
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
           COALESCE(SUM(ad.split_pct), 0)::text      AS sum_pct,
           COALESCE(SUM(ad.split_amount), 0)::text   AS sum_amount,
           COALESCE(SUM(ad.split_quantity), 0)::text AS sum_quantity,
           ABS(COALESCE(pil.gross_amount, pil.net_amount + pil.tax_amount, pil.net_amount, 0))::text
                                                      AS line_gross,
           pil.quantity::text                         AS line_qty
      FROM document.accounting_distribution ad
      JOIN document.purchase_invoice_line pil
        ON pil.id = ad.source_line_id AND pil.tenant_id = ad.tenant_id
     WHERE ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
       AND ad.source_doc_id   = ${invoiceId}::uuid
       AND ad.tenant_id       = ${tenantId}::uuid
     GROUP BY ad.source_line_id, ad.distribution_basis, pil.gross_amount, pil.net_amount, pil.tax_amount, pil.quantity
  `.execute(db);

  for (const split of adSplits.rows) {
    if (split.distribution_basis === "PERCENT") {
      const sumPct = Number(split.sum_pct ?? 0);
      if (Math.abs(sumPct - 100) > ROUNDING_TOLERANCE) {
        violations.push({
          code:    "AD_SPLIT_PERCENT_NOT_100",
          message: `Line ${split.source_line_id}: percent splits sum to ${sumPct}, expected 100.`,
          details: { line_id: split.source_line_id, sum: sumPct },
        });
      }
    } else if (split.distribution_basis === "AMOUNT") {
      const sumAmt    = Number(split.sum_amount ?? 0);
      const lineGross = Number(split.line_gross ?? 0);
      if (Math.abs(sumAmt - lineGross) > ROUNDING_TOLERANCE) {
        violations.push({
          code:    "AD_SPLIT_AMOUNT_MISMATCH",
          message: `Line ${split.source_line_id}: amount splits sum to ${sumAmt}, line gross_amount is ${lineGross}.`,
          details: { line_id: split.source_line_id, splits_sum: sumAmt, line_gross: lineGross },
        });
      }
    } else if (split.distribution_basis === "QUANTITY") {
      const sumQty  = Number(split.sum_quantity ?? 0);
      const lineQty = Number(split.line_qty ?? 0);
      if (Math.abs(sumQty - lineQty) > ROUNDING_TOLERANCE) {
        violations.push({
          code:    "AD_SPLIT_QUANTITY_MISMATCH",
          message: `Line ${split.source_line_id}: quantity splits sum to ${sumQty}, line quantity is ${lineQty}.`,
          details: { line_id: split.source_line_id, splits_sum: sumQty, line_qty: lineQty },
        });
      }
    }
  }

  // ── Invariant 4: Asset interlock — non-asset lines can't have AD.asset_id set ──
  // A line without asset_class_id is declared non-capex; no distribution split
  // is allowed to capitalise against a specific master.asset.
  const assetCheck = await sql<{ line_id: string; line_no: number }>`
    SELECT pil.id AS line_id, pil.line_no
      FROM document.purchase_invoice_line pil
     WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
       AND pil.tenant_id           = ${tenantId}::uuid
       AND pil.asset_class_id IS NULL
       AND EXISTS (
         SELECT 1
           FROM document.accounting_distribution ad
          WHERE ad.tenant_id       = pil.tenant_id
            AND ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
            AND ad.source_line_id  = pil.id
            AND ad.asset_id IS NOT NULL
       )
  `.execute(db);

  for (const row of assetCheck.rows) {
    violations.push({
      code:    "ASSET_LINE_AD_MISSING_CAPEX",
      message: `Line ${row.line_no} has no asset_class_id but a distribution split sets asset_id. Either tag the line with an asset_class_id or clear the AD asset_id.`,
      details: { line_id: row.line_id, line_no: row.line_no },
    });
  }

  // ── Invariant 5: Reversal interlock ─────────────────────────────────────
  if (h.is_reversal) {
    if (!h.reversal_of_id) {
      violations.push({
        code:    "REVERSAL_OF_NOT_POSTED",
        message: "is_reversal=true but reversal_of_id is not set.",
      });
    } else {
      const target = await sql<{ is_posted: boolean }>`
        SELECT is_posted
          FROM document.purchase_invoice
         WHERE id        = ${h.reversal_of_id}::uuid
           AND tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
      if (!target.rows[0]?.is_posted) {
        violations.push({
          code:    "REVERSAL_OF_NOT_POSTED",
          message: `Reversal target ${h.reversal_of_id} is not posted; cannot create a reversal against it.`,
          details: { reversal_of_id: h.reversal_of_id },
        });
      }
    }
  }

  // ── Invariant 6: PO link required for PO-based sources ──────────────────
  if (["po_based", "contract_based"].includes(h.invoice_source) && !h.commitment_id) {
    violations.push({
      code:    "PO_COMMITMENT_REQUIRED",
      message: `invoice_source='${h.invoice_source}' requires a commitment_id.`,
      details: { invoice_source: h.invoice_source },
    });
  }

  // ── Invariant 8: Approval audit pair (cheap; always check) ──────────────
  if ((h.approved_at === null) !== (h.approved_by === null)) {
    violations.push({
      code:    "APPROVAL_AUDIT_PAIR_MISMATCH",
      message: "approved_at and approved_by must be set together (or both null).",
      details: { approved_at: h.approved_at, approved_by: h.approved_by },
    });
  }

  // ── Invariants 8-10 (submit): PIL site + ship-address linkage ──────────
  // Catches the case where a user manually edited site_id / shipto_address_id /
  // shipfrom_address_id to a value that violates the link contract. The
  // line.default_shipping resolver preserves explicit user
  // values, so the picker isn't the only path that can produce invalid combos.
  if (ctx.phase === "submit") {
    // Site must belong to the header's company_code (one row per offending PIL)
    const siteScope = await sql<{ line_no: number; site_id: string }>`
      SELECT pil.line_no, pil.site_id::text
        FROM document.purchase_invoice_line pil
        JOIN master.site s
          ON s.id        = pil.site_id
         AND s.tenant_id = pil.tenant_id
       WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
         AND pil.tenant_id           = ${tenantId}::uuid
         AND pil.site_id IS NOT NULL
         AND s.company_code_id IS DISTINCT FROM ${h.company_code_id}::uuid
       ORDER BY pil.line_no
    `.execute(db);
    for (const row of siteScope.rows) {
      violations.push({
        code:    "PIL_SITE_SCOPE_MISMATCH",
        message: `Line ${row.line_no}: site_id does not belong to the invoice's company code.`,
        details: { line_no: row.line_no, site_id: row.site_id, company_code_id: h.company_code_id },
      });
    }

    // Ship-to address must be reachable via v_site_address for the chosen site.
    // If site_id is NULL, the ship-to is unconstrained (user picked a free
    // address) and we let it through — the trigger jurisdiction derive still
    // works off the address itself.
    const shiptoLink = await sql<{ line_no: number; shipto_address_id: string; site_id: string }>`
      SELECT pil.line_no, pil.shipto_address_id::text, pil.site_id::text
        FROM document.purchase_invoice_line pil
       WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
         AND pil.tenant_id           = ${tenantId}::uuid
         AND pil.shipto_address_id IS NOT NULL
         AND pil.site_id           IS NOT NULL
         AND NOT EXISTS (
             SELECT 1
               FROM master.v_site_address vsa
              WHERE vsa.tenant_id  = pil.tenant_id
                AND vsa.site_id    = pil.site_id
                AND vsa.address_id = pil.shipto_address_id
                AND vsa.purpose IN ('ship_to','default')
         )
       ORDER BY pil.line_no
    `.execute(db);
    for (const row of shiptoLink.rows) {
      violations.push({
        code:    "PIL_SHIPTO_NOT_LINKED_TO_SITE",
        message: `Line ${row.line_no}: shipto_address_id is not linked to the chosen site with a ship_to/default purpose.`,
        details: { line_no: row.line_no, shipto_address_id: row.shipto_address_id, site_id: row.site_id },
      });
    }

    // Ship-from address must be reachable via v_supplier_address for the
    // header's supplier. Non-PO / one-time-supplier invoices have no supplier
    // anchor — skip the check in that case.
    if (h.supplier_id) {
      const shipfromLink = await sql<{ line_no: number; shipfrom_address_id: string }>`
        SELECT pil.line_no, pil.shipfrom_address_id::text
          FROM document.purchase_invoice_line pil
         WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
           AND pil.tenant_id           = ${tenantId}::uuid
           AND pil.shipfrom_address_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM master.v_supplier_address vsa
                WHERE vsa.tenant_id   = pil.tenant_id
                  AND vsa.supplier_id = ${h.supplier_id}::uuid
                  AND vsa.address_id  = pil.shipfrom_address_id
                  AND vsa.purpose IN ('ship_from','default')
           )
         ORDER BY pil.line_no
      `.execute(db);
      for (const row of shipfromLink.rows) {
        violations.push({
          code:    "PIL_SHIPFROM_NOT_LINKED_TO_SUPPLIER",
          message: `Line ${row.line_no}: shipfrom_address_id is not linked to the supplier with a ship_from/default purpose.`,
          details: { line_no: row.line_no, shipfrom_address_id: row.shipfrom_address_id, supplier_id: h.supplier_id },
        });
      }
    }
  }

  // ── Invariants 11-13: Pricing Component checks (P4 v1.2) ────────────────
  // PC is in shadow mode through P4 — these invariants surface PC-internal
  // drift but do not block submit unless PC rows actually exist for the
  // invoice. validatePcInvariants short-circuits on zero PC rows.
  const pcViolations = await validatePcInvariants(db, tenantId, invoiceId);
  for (const v of pcViolations) {
    violations.push({
      code:    v.code as InvariantCode,
      message: v.message,
      details: v.details,
    });
  }

  return { ok: violations.length === 0, violations };
}
