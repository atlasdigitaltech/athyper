/**
 * AP Invoice Create Handler
 *
 * Handles POST /api/finance/ap/invoices
 *
 * Creates a new purchase_invoice in the appropriate initial status:
 *   - invoice_source = 'po_based' | 'contract_based' → status = 'proforma'
 *     (supplier_invoice_number deferred; promoted via promote_proforma flow)
 *   - invoice_source = 'non_po' | 'one_time_vendor'  → status = 'draft'
 *
 * Idempotency: checks document.command_log before INSERT.
 * Number generation: uses master.fn_next_document_number via DB trigger.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface CreateInvoiceBody {
  invoice_source:       string;
  invoice_type?:        string;
  company_code_id:      string;
  supplier_id?:         string;
  commitment_id?:       string;
  document_date?:       string;
  currency_code:        string;
  payment_term_id?:     string;
  payment_method_id?:   string;
  notes?:               string;
  tags?:                string[];
  idempotency_key?:     string;
}

interface HandlerResult {
  status:  number;
  body:    Record<string, unknown>;
}

const VALID_SOURCES = new Set(["po_based", "contract_based", "non_po", "one_time_vendor"]);
const VALID_TYPES   = new Set(["standard", "credit_note", "debit_note", "advance",
                                "retention_release", "self_billed", "final", "proforma"]);

export async function handleCreateApInvoice(
  db:          AnyDb,
  tenantId:    string,
  principalId: string | null,
  body:        CreateInvoiceBody,
  logger?:     { info?(e: string, f?: Record<string, unknown>): void; error?(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  // ── Input validation ──────────────────────────────────────────────────────
  if (!body.invoice_source || !VALID_SOURCES.has(body.invoice_source)) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "invoice_source must be one of: po_based, contract_based, non_po, one_time_vendor" } };
  }
  if (!body.company_code_id) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "company_code_id is required" } };
  }
  if (!body.currency_code || body.currency_code.trim().length !== 3) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "currency_code must be a 3-character ISO code" } };
  }
  if ((body.invoice_source === "po_based" || body.invoice_source === "contract_based") && !body.commitment_id) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "commitment_id is required for po_based and contract_based invoices" } };
  }
  if ((body.invoice_source === "po_based" || body.invoice_source === "contract_based") && !body.supplier_id) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "supplier_id is required for po_based and contract_based invoices" } };
  }
  if (body.invoice_type && !VALID_TYPES.has(body.invoice_type)) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: `invoice_type '${body.invoice_type}' is not valid` } };
  }

  // ── Idempotency check ─────────────────────────────────────────────────────
  const iKey = body.idempotency_key;
  if (iKey) {
    const existing = await db
      .selectFrom("document.command_log as cl")
      .select(["cl.id", "cl.status", "cl.result"])
      .where("cl.tenant_id",       "=", tenantId)
      .where("cl.operation",       "=", "create_purchase_invoice")
      .where("cl.idempotency_key", "=", iKey)
      .executeTakeFirst() as { id: string; status: string; result: Record<string, unknown> | null } | undefined;

    if (existing) {
      if (existing.status === "done" && existing.result) {
        return { status: 200, body: { ...existing.result, _replayed: true } };
      }
      if (existing.status === "processing") {
        return { status: 409, body: { error: "DUPLICATE_REQUEST", message: "A request with this idempotency key is already processing" } };
      }
    }

    // Insert processing record
    await db.insertInto("document.command_log")
      .values({
        tenant_id:       tenantId,
        operation:       "create_purchase_invoice",
        idempotency_key: iKey,
        status:          "processing",
        principal_id:    principalId,
      })
      .onConflict((oc) => oc.columns(["tenant_id", "operation", "idempotency_key"]).doNothing())
      .execute();
  }

  try {
    // ── Resolve fiscal period for the posting date ─────────────────────────
    const postingDate = body.document_date ? new Date(body.document_date) : new Date();
    const fpResult = await sql<{ fiscal_year: number; period_number: number }>`
      SELECT fiscal_year, period_number
      FROM   master.fiscal_period
      WHERE  tenant_id  = ${tenantId}
        AND  start_date <= ${postingDate}
        AND  end_date   >= ${postingDate}
        AND  is_closed  = false
      ORDER  BY start_date DESC
      LIMIT  1
    `.execute(db);

    const fp = fpResult.rows[0];
    if (!fp) {
      return { status: 422, body: { error: "NO_OPEN_PERIOD", message: "No open fiscal period found for the document date" } };
    }

    // ── Resolve base currency from company ─────────────────────────────────
    // Accepts either a UUID (company_code.id) or a string code (company_code.code)
    // so the frontend can pass scope.scopeId directly without a separate lookup.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUUID = UUID_RE.test(body.company_code_id);
    const companyRow = await db
      .selectFrom("master.company_code as c")
      .select(["c.id", "c.base_currency_code"])
      .where("c.tenant_id", "=", tenantId)
      .where(isUUID ? "c.id" : "c.code", "=", body.company_code_id)
      .executeTakeFirst() as { id: string; base_currency_code: string } | undefined;

    if (!companyRow) {
      return { status: 404, body: { error: "COMPANY_NOT_FOUND", message: "company_code_id not found" } };
    }
    // Normalise to UUID so all downstream inserts use the PK
    const resolvedCompanyId = companyRow.id;
    const company = companyRow;

    // ── Determine initial status ───────────────────────────────────────────
    const isPOBased = body.invoice_source === "po_based" || body.invoice_source === "contract_based";
    const initialStatus = isPOBased ? "proforma" : "draft";

    // ── INSERT ─────────────────────────────────────────────────────────────
    const now = new Date();
    const insertValues: Record<string, unknown> = {
      tenant_id:          tenantId,
      company_code_id:    resolvedCompanyId,
      invoice_source:     body.invoice_source,
      invoice_type:       body.invoice_type ?? "standard",
      supplier_id:        body.supplier_id ?? null,
      commitment_id:      body.commitment_id ?? null,
      // invoice_number auto-generated by trg_pi_before_insert
      invoice_number:     "",
      // supplier_invoice_number nullable for proforma (status-aware CHECK)
      supplier_invoice_number: isPOBased ? "" : "",
      supplier_invoice_date:   isPOBased ? now : now,
      document_date:      body.document_date ? new Date(body.document_date) : now,
      posting_date:       body.document_date ? new Date(body.document_date) : now,
      received_date:      now,
      currency_code:      body.currency_code.trim().toUpperCase(),
      base_currency_code: company.base_currency_code,
      exchange_rate:      null,
      fiscal_year:        fp.fiscal_year,
      period_number:      fp.period_number,
      payment_term_id:    body.payment_term_id ?? null,
      payment_method_id:  body.payment_method_id ?? null,
      notes:              body.notes ?? null,
      tags:               JSON.stringify(body.tags ?? []),
      status:             initialStatus,
      created_by:         principalId ?? "00000000-0000-0000-0000-000000000000",
    };

    const inserted = await db
      .insertInto("document.purchase_invoice")
      .values(insertValues as never)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown>;

    const result = {
      ok:             true,
      id:             inserted["id"],
      invoice_number: inserted["invoice_number"],
      status:         inserted["status"],
      record:         inserted,
    };

    // ── Update idempotency log ────────────────────────────────────────────
    if (iKey) {
      await db.updateTable("document.command_log")
        .set({ status: "done", result: JSON.stringify(result), completed_at: now })
        .where("tenant_id",       "=", tenantId)
        .where("operation",       "=", "create_purchase_invoice")
        .where("idempotency_key", "=", iKey)
        .execute();
    }

    logger?.info?.("ap_invoice_created", { tenantId, id: inserted["id"], source: body.invoice_source, status: initialStatus });
    return { status: 201, body: result };

  } catch (err) {
    const e = err as Record<string, unknown> & { message?: string };
    const message = typeof e["message"] === "string" ? e["message"] : "Unexpected error creating invoice";

    if (iKey) {
      await db.updateTable("document.command_log")
        .set({ status: "error", error_message: message, completed_at: new Date() })
        .where("tenant_id",       "=", tenantId)
        .where("operation",       "=", "create_purchase_invoice")
        .where("idempotency_key", "=", iKey)
        .execute();
    }

    logger?.error?.("ap_invoice_create_error", { tenantId, err: message });
    return { status: 500, body: { error: "INTERNAL_ERROR", message } };
  }
}
