/**
 * Purchase Invoice Cross-Entity Invariants Service.
 *
 * Validates invariants that span header / line / accounting_distribution
 * before key lifecycle transitions:
 *
 *   - submit  → enforces invariants 1, 3, 4, 5, 6   (financial + structural)
 *   - approve → re-runs (1), enforces (7)            (snapshot existence)
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
 *   4. CapEx interlock: line.is_asset=true ⇒ every AD row for that line has
 *      is_capex=true AND asset_class_id NOT NULL
 *   5. Reversal interlock: is_reversal=true ⇒ reversal_of_id NOT NULL AND target.is_posted=true
 *   6. PO link interlock: invoice_source IN (po_based, contract_based)
 *      ⇒ commitment_id NOT NULL (defense-in-depth; DDL also enforces)
 *   7. Snapshot existence: status NOT IN (draft, rejected)
 *      ⇒ invoice_party_snapshot row exists
 *      (address + bank are softer requirements — warned, not erred)
 *   8. Approval audit pair: (approved_at IS NULL) = (approved_by IS NULL)
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

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
  | "PARTY_SNAPSHOT_MISSING"
  | "APPROVAL_AUDIT_PAIR_MISMATCH";

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
    subtotal_amount:    string;
    total_amount:       string;
    approved_at:        Date | null;
    approved_by:        string | null;
  }>`
    SELECT id, status, invoice_source, is_reversal, reversal_of_id, commitment_id,
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
  // Per basis: PERCENT sums to 100, AMOUNT sums to line.net_amount,
  // QUANTITY sums to line.quantity.
  const adSplits = await sql<{
    source_line_id:     string;
    distribution_basis: string;
    sum_pct:            string | null;
    sum_amount:         string | null;
    sum_quantity:       string | null;
    line_net:           string | null;
    line_qty:           string | null;
  }>`
    SELECT ad.source_line_id,
           ad.distribution_basis,
           COALESCE(SUM(ad.split_pct), 0)::text      AS sum_pct,
           COALESCE(SUM(ad.split_amount), 0)::text   AS sum_amount,
           COALESCE(SUM(ad.split_quantity), 0)::text AS sum_quantity,
           pil.net_amount::text                       AS line_net,
           pil.quantity::text                         AS line_qty
      FROM document.accounting_distribution ad
      JOIN document.purchase_invoice_line pil
        ON pil.id = ad.source_line_id AND pil.tenant_id = ad.tenant_id
     WHERE ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
       AND ad.source_doc_id   = ${invoiceId}::uuid
       AND ad.tenant_id       = ${tenantId}::uuid
     GROUP BY ad.source_line_id, ad.distribution_basis, pil.net_amount, pil.quantity
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
      const sumAmt  = Number(split.sum_amount ?? 0);
      const lineNet = Number(split.line_net ?? 0);
      if (Math.abs(sumAmt - lineNet) > ROUNDING_TOLERANCE) {
        violations.push({
          code:    "AD_SPLIT_AMOUNT_MISMATCH",
          message: `Line ${split.source_line_id}: amount splits sum to ${sumAmt}, line net_amount is ${lineNet}.`,
          details: { line_id: split.source_line_id, splits_sum: sumAmt, line_net: lineNet },
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

  // ── Invariant 4: CapEx interlock — is_asset lines need CapEx AD rows ────
  const capexCheck = await sql<{ line_id: string; line_no: number }>`
    SELECT pil.id AS line_id, pil.line_no
      FROM document.purchase_invoice_line pil
     WHERE pil.purchase_invoice_id = ${invoiceId}::uuid
       AND pil.tenant_id           = ${tenantId}::uuid
       AND pil.is_asset            = true
       AND EXISTS (
         SELECT 1
           FROM document.accounting_distribution ad
          WHERE ad.tenant_id       = pil.tenant_id
            AND ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
            AND ad.source_line_id  = pil.id
            AND (ad.is_capex = false OR ad.asset_class_id IS NULL)
       )
  `.execute(db);

  for (const row of capexCheck.rows) {
    violations.push({
      code:    "ASSET_LINE_AD_MISSING_CAPEX",
      message: `Line ${row.line_no} is flagged is_asset=true but has an AD row without is_capex=true or asset_class_id.`,
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

  // ── Invariant 7 (approve/post): snapshot existence past draft ───────────
  if (ctx.phase === "approve" || ctx.phase === "post") {
    const snapRow = await sql<{ id: string }>`
      SELECT id
        FROM document.invoice_party_snapshot
       WHERE purchase_invoice_id = ${invoiceId}::uuid
         AND tenant_id           = ${tenantId}::uuid
       LIMIT 1
    `.execute(db);
    if (!snapRow.rows[0]) {
      violations.push({
        code:    "PARTY_SNAPSHOT_MISSING",
        message: "Invoice past draft must have an invoice_party_snapshot row. Re-submit to populate.",
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
