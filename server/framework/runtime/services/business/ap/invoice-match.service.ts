/**
 * Invoice Matching Service
 *
 * Three-way match: purchase_invoice_line ↔ commitment_line ↔ goods_receipt_line
 * Two-way match:   purchase_invoice_line ↔ commitment_line (no GR required)
 * No-match:        unverified (non_po / one_time_vendor invoices)
 *
 * Writes results to document.invoice_match_case and document.match_exception.
 * Updates purchase_invoice_line.match_status and purchase_invoice.match_status.
 *
 * Tolerance resolution (most specific wins):
 *   company-specific → tenant-wide → global default
 *
 * Called from invoice-posting.service.ts pre-flight (approved status gate).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface MatchResult {
  invoiceStatus:  "fully_matched" | "partially_matched" | "unmatched" | "match_exception" | "no_match";
  lineResults:    LineMatchResult[];
  exceptions:     MatchException[];
}

export interface LineMatchResult {
  lineId:        string;
  lineNo:        number;
  matchStatus:   string;
  matchedQty:    number;
  invoicedQty:   number;
  priceVariance: number | null;
  qtyVariance:   number | null;
}

export interface MatchException {
  lineId:        string;
  exceptionType: string;
  description:   string;
}

interface Tolerance {
  quantity_pct: number;
  price_pct:    number;
  amount_abs:   number;
}

const DEFAULT_TOLERANCE: Tolerance = { quantity_pct: 3, price_pct: 2, amount_abs: 5 };

async function resolveCatalogTolerance(db: AnyDb, tenantId: string): Promise<Tolerance> {
  const tol: Tolerance = { ...DEFAULT_TOLERANCE };
  try {
    const rows = await sql<{ code: string; value_text: string | null }>`
      SELECT
        d.code,
        COALESCE(
          CASE
            WHEN tv.override_enabled IS TRUE THEN tv.value
            ELSE COALESCE(d.product_value, d.default_value)
          END,
          d.default_value
        ) #>> '{}' AS value_text
      FROM control.parameter_definition d
      LEFT JOIN master.tenant_parameter_value tv
        ON tv.tenant_id = ${tenantId}::uuid
       AND tv.parameter_code = d.code
       AND tv.status = 'active'
       AND now() >= tv.effective_from
       AND (tv.effective_to IS NULL OR now() < tv.effective_to)
      WHERE d.code IN ('finance.ap.tolerance_amount', 'finance.ap.tolerance_percent')
        AND d.status = 'active'
        AND d.is_enabled = true
    `.execute(db);

    for (const row of rows.rows) {
      const n = Number(row.value_text);
      if (!Number.isFinite(n)) continue;
      if (row.code === "finance.ap.tolerance_amount") tol.amount_abs = n;
      if (row.code === "finance.ap.tolerance_percent") tol.price_pct = n;
    }
  } catch {
    return tol;
  }
  return tol;
}

async function resolveTolerance(
  db:          AnyDb,
  tenantId:    string,
  companyId:   string,
  matchType:   string,
): Promise<Tolerance> {
  const rows = await sql<{ tolerance_type: string; tolerance_value: number; tenant_id: string | null; company_code_id: string | null }>`
    SELECT tolerance_type, tolerance_value, tenant_id, company_code_id
    FROM   control.match_tolerance_config
    WHERE  entity_name = 'purchase_invoice'
      AND  match_type  = ${matchType}
      AND  is_active   = true
      AND (tenant_id = ${tenantId} OR tenant_id IS NULL)
      AND (company_code_id = ${companyId} OR company_code_id IS NULL)
    ORDER BY
      CASE WHEN company_code_id IS NOT NULL THEN 0
           WHEN tenant_id IS NOT NULL       THEN 1
           ELSE 2 END
  `.execute(db);

  const tol: Tolerance = await resolveCatalogTolerance(db, tenantId);
  for (const row of rows.rows) {
    if (row.tolerance_type === "quantity_pct") tol.quantity_pct = Number(row.tolerance_value);
    if (row.tolerance_type === "price_pct")    tol.price_pct    = Number(row.tolerance_value);
    if (row.tolerance_type === "amount_abs")   tol.amount_abs   = Number(row.tolerance_value);
  }
  return tol;
}

export async function matchInvoice(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string | null,
  logger?:     { info(e: string, f?: Record<string, unknown>): void; warn(e: string, f?: Record<string, unknown>): void },
): Promise<MatchResult> {

  // Load invoice header
  const invResult = await sql<Record<string, unknown>>`
    SELECT * FROM document.purchase_invoice
    WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
    LIMIT 1
  `.execute(db);

  const invoice = invResult.rows[0];
  if (!invoice) {
    return { invoiceStatus: "no_match", lineResults: [], exceptions: [] };
  }

  const matchType    = String(invoice["match_type"]    ?? "no_match");
  const companyId    = String(invoice["company_code_id"] ?? "");
  const invoiceSource = String(invoice["invoice_source"] ?? "non_po");

  // Non-PO invoices have no commitment to match against
  if (matchType === "no_match" || invoiceSource === "non_po" || invoiceSource === "one_time_vendor") {
    await sql`
      UPDATE document.purchase_invoice
         SET match_status = 'unmatched', updated_at = now()
       WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
    `.execute(db);
    return { invoiceStatus: "no_match", lineResults: [], exceptions: [] };
  }

  const tolerance = await resolveTolerance(db, tenantId, companyId, matchType);

  // Load all lines
  const linesResult = await sql<{
    id: string; line_no: number; quantity: number; unit_price: number; net_amount: number;
    commitment_line_id: string | null; goods_receipt_line_id: string | null;
  }>`
    SELECT id, line_no, quantity, unit_price, net_amount, commitment_line_id, goods_receipt_line_id
    FROM   document.purchase_invoice_line
    WHERE  purchase_invoice_id = ${invoiceId} AND tenant_id = ${tenantId}
    ORDER  BY line_no
  `.execute(db);

  const lines = linesResult.rows;
  const lineResults: LineMatchResult[]  = [];
  const exceptions:  MatchException[]   = [];

  // Create or update invoice_match_case
  const commitmentId = invoice["commitment_id"] as string | null;
  const matchCaseResult = await sql<{ id: string }>`
    INSERT INTO document.invoice_match_case (
      tenant_id, company_code_id, purchase_invoice_id, commitment_id,
      match_type, status, created_by, created_at
    ) VALUES (
      ${tenantId}, ${companyId}, ${invoiceId}, ${commitmentId ?? null},
      ${matchType}, 'in_progress',
      ${principalId ?? "00000000-0000-0000-0000-000000000000"}, now()
    )
    ON CONFLICT (tenant_id, purchase_invoice_id)
      DO UPDATE SET status = 'in_progress', updated_at = now()
    RETURNING id
  `.execute(db);

  const matchCaseId = matchCaseResult.rows[0]?.id;

  let allFullyMatched     = true;
  let anyException        = false;
  let anyPartiallyMatched = false;

  for (const line of lines) {
    const result: LineMatchResult = {
      lineId:        line.id,
      lineNo:        line.line_no,
      matchStatus:   "unmatched",
      matchedQty:    0,
      invoicedQty:   Number(line.quantity),
      priceVariance: null,
      qtyVariance:   null,
    };

    // ── Two-way match: commitment line ────────────────────────────────────
    if (line.commitment_line_id) {
      const clResult = await sql<{ ordered_qty: number; invoiced_qty: number; unit_price: number }>`
        SELECT
          COALESCE(quantity, 0)         AS ordered_qty,
          COALESCE(invoiced_quantity, 0) AS invoiced_qty,
          COALESCE(unit_price, 0)       AS unit_price
        FROM document.commitment_line
        WHERE id = ${line.commitment_line_id} AND tenant_id = ${tenantId}
        LIMIT 1
      `.execute(db);

      const cl = clResult.rows[0];
      if (cl) {
        const remainingCommitQty = Number(cl.ordered_qty) - Number(cl.invoiced_qty);
        const invoicedQty        = Number(line.quantity);
        const commitPrice        = Number(cl.unit_price);
        const invoicePrice       = Number(line.unit_price);

        // Price variance check
        const priceDiff = commitPrice > 0
          ? Math.abs(invoicePrice - commitPrice) / commitPrice * 100
          : 0;

        result.priceVariance = priceDiff;

        // Quantity check (against remaining)
        const qtyDiff = remainingCommitQty > 0
          ? Math.abs(invoicedQty - remainingCommitQty) / remainingCommitQty * 100
          : 0;
        result.qtyVariance = qtyDiff;

        const priceOk = priceDiff <= tolerance.price_pct;
        const qtyOk   = invoicedQty <= remainingCommitQty + (remainingCommitQty * tolerance.quantity_pct / 100);

        if (!priceOk) {
          exceptions.push({
            lineId: line.id,
            exceptionType: "price_variance",
            description: `Invoice price ${invoicePrice} differs from PO price ${commitPrice} by ${priceDiff.toFixed(2)}% (tolerance: ${tolerance.price_pct}%)`,
          });
          anyException = true;
        }

        if (!qtyOk) {
          exceptions.push({
            lineId: line.id,
            exceptionType: "quantity_over",
            description: `Invoiced qty ${invoicedQty} exceeds remaining PO qty ${remainingCommitQty} beyond tolerance`,
          });
          anyException = true;
        }

        // ── Three-way: also check GR ──────────────────────────────────────
        if (matchType === "three_way" && line.goods_receipt_line_id) {
          const grResult = await sql<{ received_qty: number }>`
            SELECT COALESCE(received_quantity, 0) AS received_qty
            FROM   document.goods_receipt_line
            WHERE  id = ${line.goods_receipt_line_id} AND tenant_id = ${tenantId}
            LIMIT  1
          `.execute(db);

          const gr = grResult.rows[0];
          if (gr) {
            const receivedQty    = Number(gr.received_qty);
            result.matchedQty    = Math.min(invoicedQty, receivedQty);
            const grQtyOk        = invoicedQty <= receivedQty + (receivedQty * tolerance.quantity_pct / 100);

            if (!grQtyOk) {
              exceptions.push({
                lineId: line.id,
                exceptionType: "gr_quantity_shortage",
                description: `Invoiced qty ${invoicedQty} exceeds goods received qty ${receivedQty}`,
              });
              anyException = true;
            }
          } else {
            exceptions.push({
              lineId: line.id,
              exceptionType: "gr_not_found",
              description: "Linked goods receipt line not found",
            });
            anyException = true;
          }
        } else {
          result.matchedQty = invoicedQty;
        }

        const hasExceptionOnLine = exceptions.some(e => e.lineId === line.id);
        if (hasExceptionOnLine) {
          result.matchStatus = "match_exception";
        } else if (result.matchedQty >= invoicedQty) {
          result.matchStatus = "fully_matched";
        } else if (result.matchedQty > 0) {
          result.matchStatus = "partially_matched";
          anyPartiallyMatched = true;
        } else {
          result.matchStatus = "unmatched";
          allFullyMatched = false;
        }
      } else {
        result.matchStatus = "unmatched";
        allFullyMatched    = false;
      }
    } else if (matchType === "three_way" || matchType === "two_way") {
      // PO-based line with no commitment_line_id linked
      exceptions.push({
        lineId:        line.id,
        exceptionType: "no_commitment_link",
        description:   "PO-based invoice line has no linked commitment line",
      });
      anyException    = true;
      result.matchStatus = "match_exception";
    }

    lineResults.push(result);

    // Update line match_status
    await sql`
      UPDATE document.purchase_invoice_line
         SET match_status = ${result.matchStatus}, matched_quantity = ${result.matchedQty}, updated_at = now()
       WHERE id = ${line.id} AND tenant_id = ${tenantId}
    `.execute(db);
  }

  // Write exceptions to match_exception table
  if (matchCaseId) {
    for (const exc of exceptions) {
      await sql`
        INSERT INTO document.match_exception (
          tenant_id, invoice_match_case_id, invoice_line_id,
          exception_type, description, status, created_by, created_at
        ) VALUES (
          ${tenantId}, ${matchCaseId}, ${exc.lineId},
          ${exc.exceptionType}, ${exc.description}, 'open',
          ${principalId ?? "00000000-0000-0000-0000-000000000000"}, now()
        )
        ON CONFLICT DO NOTHING
      `.execute(db);
    }
  }

  // Compute overall match status
  let invoiceMatchStatus: MatchResult["invoiceStatus"];
  if (anyException) {
    invoiceMatchStatus = "match_exception";
  } else if (allFullyMatched && lineResults.every(l => l.matchStatus === "fully_matched")) {
    invoiceMatchStatus = "fully_matched";
  } else if (anyPartiallyMatched || lineResults.some(l => l.matchStatus === "fully_matched")) {
    invoiceMatchStatus = "partially_matched";
  } else {
    invoiceMatchStatus = "unmatched";
  }

  // Update invoice.match_status
  await sql`
    UPDATE document.purchase_invoice
       SET match_status = ${invoiceMatchStatus}, updated_at = now()
     WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `.execute(db);

  // Close the match case
  if (matchCaseId) {
    await sql`
      UPDATE document.invoice_match_case
         SET status = ${anyException ? "exception" : "complete"}, updated_at = now()
       WHERE id = ${matchCaseId}
    `.execute(db);
  }

  logger?.info("ap_invoice_matched", { tenantId, invoiceId, matchStatus: invoiceMatchStatus, exceptions: exceptions.length });
  return { invoiceStatus: invoiceMatchStatus, lineResults, exceptions };
}
