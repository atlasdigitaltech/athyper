/**
 * Promote-Proforma Handler — §O4 Runtime Contract
 *
 * Promotes a purchase_invoice from status='proforma' to status='draft'
 * by accepting the deferred supplier fields collected from the FlowModal.
 *
 * Called from action-dispatcher.route.ts when
 * handler_type='MODAL' and handler_target='flow:promote_proforma'.
 *
 * Request body fields (from promote_proforma flow step):
 *   supplier_invoice_number  — required; becomes the dedup key
 *   supplier_invoice_date    — required; ISO date string
 *   posting_date             — optional; defaults to today
 *   received_date            — optional
 *   commitment_id            — optional UUID
 *
 * Steps:
 *   1. BEGIN transaction
 *   2. SELECT FOR UPDATE the invoice row; 404 if missing
 *   3. Validate status = 'proforma'; 422 otherwise
 *   4. Dedup probe: 409 DUPLICATE_INVOICE if another active invoice
 *      (same tenant/company/supplier/supplier_invoice_number) exists
 *   5. Resolve fiscal_year + period_number via master.fiscal_period
 *   6. Resolve payment term → baseline_date + due_date
 *   7. UPDATE record with deferred fields; status → 'draft'
 *   8. COMMIT; return { ok: true, record }
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { evaluatePaymentTerm } from "./invoice-payment-term.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface PromoteBody {
  supplier_invoice_number?: string;
  supplier_invoice_date?: string;
  posting_date?: string;
  received_date?: string;
  commitment_id?: string | null;
  remarks?: string;
}

interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handlePromoteProforma(
  db: AnyDb,
  tenantId: string,
  recordId: string,
  principalId: string | null,
  body: Record<string, unknown>,
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  },
): Promise<HandlerResult> {
  const {
    supplier_invoice_number,
    supplier_invoice_date,
    posting_date,
    received_date,
    commitment_id = null,
  } = body as PromoteBody;

  if (!supplier_invoice_number?.trim()) {
    return {
      status: 400,
      body: { error: "MISSING_FIELD", message: "supplier_invoice_number is required to promote a proforma invoice" },
    };
  }
  if (!supplier_invoice_date) {
    return {
      status: 400,
      body: { error: "MISSING_FIELD", message: "supplier_invoice_date is required to promote a proforma invoice" },
    };
  }

  const now = new Date();
  const postingDate = posting_date ? new Date(posting_date) : now;
  const invoiceDate = new Date(supplier_invoice_date);

  try {
    const updatedRecord = await db.transaction().execute(async (trx) => {
      // Step 2: Lock row
      const lockResult = await sql<Record<string, unknown>>`
        SELECT * FROM document.purchase_invoice
        WHERE id = ${recordId} AND tenant_id = ${tenantId}
        LIMIT 1
        FOR UPDATE
      `.execute(trx);

      const invoice = lockResult.rows[0];
      if (!invoice) {
        const e = new Error("Record not found") as Error & { code: string; httpStatus: number };
        e.code = "RECORD_NOT_FOUND";
        e.httpStatus = 404;
        throw e;
      }

      // Step 3: Status guard
      const currentStatus = String(invoice["status"] ?? "").toLowerCase();
      if (currentStatus !== "proforma") {
        const e = new Error(
          `Invoice is in '${currentStatus}' status — only proforma invoices can be promoted`,
        ) as Error & { code: string; httpStatus: number };
        e.code = "INVALID_STATUS";
        e.httpStatus = 422;
        throw e;
      }

      // Step 4: Dedup probe
      const dupResult = await sql<{ id: string }>`
        SELECT id FROM document.purchase_invoice
        WHERE  tenant_id               = ${tenantId}
          AND  company_code_id         = ${invoice["company_code_id"] as string}
          AND  supplier_id             = ${invoice["supplier_id"] as string}
          AND  supplier_invoice_number = ${supplier_invoice_number.trim()}
          AND  id                     != ${recordId}
          AND  status NOT IN ('cancelled', 'rejected', 'proforma')
        LIMIT 1
      `.execute(trx);

      if (dupResult.rows.length > 0) {
        const e = new Error(
          `Supplier invoice '${supplier_invoice_number.trim()}' already exists for this supplier`,
        ) as Error & { code: string; httpStatus: number };
        e.code = "DUPLICATE_INVOICE";
        e.httpStatus = 409;
        throw e;
      }

      // Step 5: Fiscal period
      let fiscalYear: number | null = null;
      let periodNumber: number | null = null;

      const fpResult = await sql<{ fiscal_year: number; period_number: number }>`
        SELECT fiscal_year, period_number
        FROM   master.fiscal_period
        WHERE  tenant_id  = ${tenantId}
          AND  start_date <= ${postingDate}
          AND  end_date   >= ${postingDate}
          AND  is_closed  = false
        ORDER  BY start_date DESC
        LIMIT  1
      `.execute(trx);

      if (fpResult.rows[0]) {
        fiscalYear   = fpResult.rows[0].fiscal_year;
        periodNumber = fpResult.rows[0].period_number;
      }

      // Step 6: Payment term → full clause evaluation + PTA rows
      let baselineDate: Date | null = null;
      let dueDate: Date | null = null;
      let termSnapshot: Record<string, unknown> | null = null;

      const paymentTermId = invoice["payment_term_id"] as string | null | undefined;
      if (paymentTermId) {
        const ptaResult = await evaluatePaymentTerm(
          trx,
          tenantId,
          paymentTermId,
          recordId,
          invoiceDate,
          postingDate,
          Number(invoice["total_amount"] ?? 0),
          principalId,
          received_date ? new Date(received_date) : undefined,
        );

        if (ptaResult) {
          baselineDate  = ptaResult.baseline_date;
          dueDate       = ptaResult.due_date;
          termSnapshot  = ptaResult.term_snapshot;
        }
      }

      // Step 7: UPDATE — promote to draft
      const setClause: Record<string, unknown> = {
        supplier_invoice_number: supplier_invoice_number.trim(),
        supplier_invoice_date:   invoiceDate,
        posting_date:            postingDate,
        status:                  "draft",
        status_changed_at:       now,
        status_changed_by:       principalId,
        updated_at:              now,
        updated_by:              principalId,
      };

      if (received_date)                setClause["received_date"]  = new Date(received_date);
      if (commitment_id !== undefined)  setClause["commitment_id"]  = commitment_id;
      if (fiscalYear   !== null)        setClause["fiscal_year"]    = fiscalYear;
      if (periodNumber !== null)        setClause["period_number"]  = periodNumber;
      if (baselineDate !== null)        setClause["baseline_date"]  = baselineDate;
      if (dueDate      !== null)        setClause["due_date"]       = dueDate;
      if (termSnapshot !== null)        setClause["term_snapshot"]  = JSON.stringify(termSnapshot);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await (trx.updateTable("document.purchase_invoice" as any) as any)
        .set(setClause)
        .where("id",        "=", recordId)
        .where("tenant_id", "=", tenantId)
        .where("status",    "=", "proforma")
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!updated) {
        const e = new Error(
          "Invoice was modified concurrently — please refresh and retry",
        ) as Error & { code: string; httpStatus: number };
        e.code = "CONFLICT";
        e.httpStatus = 409;
        throw e;
      }

      return updated;
    });

    logger?.info("promote_proforma_ok", { tenantId, recordId, principalId });
    return { status: 200, body: { ok: true, record: updatedRecord } };

  } catch (err) {
    const e = err as Record<string, unknown> & { message?: string };
    const httpStatus = typeof e["httpStatus"] === "number" ? e["httpStatus"] : 500;
    const code       = typeof e["code"]       === "string" ? e["code"]       : "INTERNAL_ERROR";
    const message    = typeof e["message"]    === "string" ? e["message"]    : "Unexpected error";

    if (httpStatus >= 500) {
      logger?.warn("promote_proforma_error", { tenantId, recordId, err: message });
    }

    return { status: httpStatus, body: { error: code, message } };
  }
}
