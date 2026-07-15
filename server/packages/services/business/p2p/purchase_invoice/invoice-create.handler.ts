/**
 * AP Invoice Create Handler
 *
 * Handles POST /api/finance/ap/invoices
 *
 * Creates a new purchase_invoice in the appropriate initial status:
 *   - invoice_source = 'po_based' | 'contract_based' → status = 'proforma'
 *     (supplier_invoice_number/date deferred; promoted via promote_proforma flow)
 *   - invoice_source = 'non_po' | 'one_time_supplier'  → status = 'draft'
 *     (supplier_invoice_number, supplier_invoice_date, tax_mode required)
 *
 * Effective DDL (01f_tables_invoice_streamlining.sql):
 *   - invoice_type: standard | credit_note | debit_note | advance |
 *                   retention_release | self_billed | final  (7 values; proforma/down_payment removed)
 *   - supplier_invoice_number / supplier_invoice_date: nullable but required by
 *     pi_supplier_invoice_number_req / pi_supplier_invoice_date_req CHECK for status <> 'proforma'
 *   - tax_mode: required by pi_tax_mode_req CHECK for status <> 'proforma'
 *
 * Idempotency: checks document.command_log before INSERT.
 * Number generation: uses control.next_entity_number via DB trigger.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { resolvePurchaseInvoiceHeaderDefaults } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface CreateInvoiceBody {
  [key: string]:             unknown;
  invoice_source:           string;
  invoice_type?:            string;
  company_code_id?:         string;
  supplier_id?:             string;
  commitment_id?:           string;
  // Required for non_po / one_time_supplier; null/absent for po_based / contract_based (proforma)
  supplier_invoice_number?: string;
  supplier_invoice_date?:   string;
  // Date fields
  document_date?:           string;
  posting_date?:            string;
  received_date?:           string;
  // Tax mode — required for non-proforma invoices
  tax_mode?:                string;   // inclusive | exclusive | no_tax
  tax_mode_source?:         string;   // supplier_profile | tax_group | company_default | user_override
  // Payment
  currency_code?:           string;
  payment_term_id?:         string;
  payment_method_id?:       string;
  billto_address_id?:       string;
  billfrom_address_id?:     string;
  remitto_address_id?:      string;
  match_type?:              string;
  credited_invoice_id?:     string;
  debited_invoice_id?:      string;
  retention_invoice_id?:    string;
  reversal_of_id?:          string;
  notes?:                   string;
  tags?:                    string[];
  idempotency_key?:         string;
}

interface HandlerResult {
  status:  number;
  body:    Record<string, unknown>;
}

const VALID_SOURCES = new Set(["po_based", "contract_based", "non_po", "one_time_supplier"]);

// Effective post-streamlining vocabulary — proforma and down_payment removed
const VALID_TYPES = new Set([
  "standard", "credit_note", "debit_note", "advance",
  "retention_release", "self_billed", "final",
]);

const VALID_TAX_MODES = new Set(["inclusive", "exclusive", "no_tax"]);

export async function handleCreateApInvoice(
  db:          AnyDb,
  tenantId:    string,
  principalId: string | null,
  body:        CreateInvoiceBody,
  logger?:     { info?(e: string, f?: Record<string, unknown>): void; error?(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  // ── Source / type validation ───────────────────────────────────────────────
  if (!body.invoice_source || !VALID_SOURCES.has(body.invoice_source)) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "invoice_source must be one of: po_based, contract_based, non_po, one_time_supplier" } };
  }
  const isPOBased = body.invoice_source === "po_based" || body.invoice_source === "contract_based";

  if (body.invoice_type && !VALID_TYPES.has(body.invoice_type)) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: `invoice_type '${body.invoice_type}' is not valid. Must be one of: ${[...VALID_TYPES].join(", ")}` } };
  }

  // Non-PO invoices must carry supplier invoice identity and tax mode at create time
  // (DDL CHECK constraints pi_supplier_invoice_number_req, pi_supplier_invoice_date_req, pi_tax_mode_req
  //  only exempt proforma status — draft invoices must satisfy them)
  if (!isPOBased) {
    if (!body.supplier_invoice_number?.trim()) {
      return { status: 400, body: { error: "VALIDATION_ERROR", message: "supplier_invoice_number is required for non_po and one_time_supplier invoices" } };
    }
    if (!body.supplier_invoice_date) {
      return { status: 400, body: { error: "VALIDATION_ERROR", message: "supplier_invoice_date is required for non_po and one_time_supplier invoices" } };
    }
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
    // ── Resolve fiscal period ─────────────────────────────────────────────
    const postingDate = body.posting_date
      ? new Date(body.posting_date)
      : body.document_date
      ? new Date(body.document_date)
      : new Date();

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

    const preliminaryDefaults = await resolvePurchaseInvoiceHeaderDefaults(
      body,
      {
        db,
        tenantId,
        userId: principalId ?? "00000000-0000-0000-0000-000000000000",
      },
    );
    const preliminaryBody = {
      ...preliminaryDefaults,
      ...body,
    };

    // ── Resolve company ───────────────────────────────────────────────────
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const requestedCompanyCode = readString(preliminaryBody.company_code_id);
    if (!requestedCompanyCode) {
      return { status: 400, body: { error: "VALIDATION_ERROR", message: "company_code_id is required unless it can be derived from commitment_id or original invoice" } };
    }
    const isUUID  = UUID_RE.test(requestedCompanyCode);
    const companyRow = await db
      .selectFrom("master.company_code as c")
      .select(["c.id", "c.base_currency_code"])
      .where("c.tenant_id", "=", tenantId)
      .where(isUUID ? "c.id" : "c.code", "=", requestedCompanyCode)
      .executeTakeFirst() as { id: string; base_currency_code: string } | undefined;

    if (!companyRow) {
      return { status: 404, body: { error: "COMPANY_NOT_FOUND", message: "company_code_id not found" } };
    }
    const resolvedCompanyId = companyRow.id;

    const headerDefaults = await resolvePurchaseInvoiceHeaderDefaults(
      {
        ...preliminaryBody,
        company_code_id: resolvedCompanyId,
      },
      {
        db,
        tenantId,
        userId: principalId ?? "00000000-0000-0000-0000-000000000000",
      },
    );
    const effectiveBody = {
      ...preliminaryBody,
      ...headerDefaults,
      ...body,
      company_code_id: resolvedCompanyId,
    };
    const currencyCode = typeof effectiveBody.currency_code === "string"
      ? effectiveBody.currency_code.trim().toUpperCase()
      : "";
    if (currencyCode.length !== 3) {
      return { status: 400, body: { error: "VALIDATION_ERROR", message: "currency_code must be a 3-character ISO code" } };
    }
    if (isPOBased && !readString(effectiveBody.commitment_id)) {
      return { status: 400, body: { error: "VALIDATION_ERROR", message: "commitment_id is required for po_based and contract_based invoices" } };
    }
    if (!isPOBased) {
      const taxMode = typeof effectiveBody.tax_mode === "string" ? effectiveBody.tax_mode : "";
      if (!VALID_TAX_MODES.has(taxMode)) {
        return { status: 400, body: { error: "VALIDATION_ERROR", message: "tax_mode is required for non_po and one_time_supplier invoices; must be: inclusive, exclusive, or no_tax" } };
      }
    }
    // ── Derive dates ──────────────────────────────────────────────────────
    const now          = new Date();
    const invoiceDate = body.supplier_invoice_date
      ? new Date(body.supplier_invoice_date)
      : body.document_date
      ? new Date(body.document_date)
      : now;
    const resolvedPostingDate  = body.posting_date   ? new Date(body.posting_date)  : invoiceDate;
    const resolvedReceivedDate = body.received_date  ? new Date(body.received_date) : now;
    const supplierInvoiceDate  = !isPOBased && body.supplier_invoice_date
      ? new Date(body.supplier_invoice_date)
      : null;

    // ── INSERT ────────────────────────────────────────────────────────────
    const initialStatus = isPOBased ? "proforma" : "draft";

    const insertValues: Record<string, unknown> = {
      tenant_id:               tenantId,
      company_code_id:         resolvedCompanyId,
      name:                    "Purchase Invoice",
      invoice_source:          body.invoice_source,
      invoice_type:            body.invoice_type ?? "standard",
      // In AP: both credit_note (supplier credit memo) and debit_note (buyer debit memo to
      // supplier) reduce AP liability and use inverted JE sign at posting time.
      // Non-PO invoices have no commitment to match against; set match_type immediately
      // so matchInvoice() and the posting pre-flight always find a consistent value.
      match_type:              isPOBased ? (effectiveBody.match_type ?? undefined) : "no_match",
      supplier_id:             effectiveBody.supplier_id ?? null,
      commitment_id:           effectiveBody.commitment_id ?? null,
      // code set by trg_pi_before_insert — empty string satisfies NOT NULL until trigger fires
      code:                    "",
      // Proforma defers these; non-PO must supply them (validated above)
      supplier_invoice_number: isPOBased ? null : body.supplier_invoice_number!.trim(),
      supplier_invoice_date:   supplierInvoiceDate,
      posting_date:            resolvedPostingDate,
      received_date:           resolvedReceivedDate,
      currency_code:           currencyCode,
      base_currency_code:      companyRow.base_currency_code,
      exchange_rate:           null,
      fiscal_year:             fp.fiscal_year,
      period_number:           fp.period_number,
      payment_term_id:         effectiveBody.payment_term_id  ?? null,
      // tax_mode required for non-proforma; proforma defers (status-aware CHECK allows NULL)
      tax_mode:                isPOBased ? null : effectiveBody.tax_mode,
      tags:                    JSON.stringify(body.tags ?? []),
      status:                  initialStatus,
      requested_by:            principalId ?? "00000000-0000-0000-0000-000000000000",
      created_by:              principalId ?? "00000000-0000-0000-0000-000000000000",
    };

    const inserted = await db
      .insertInto("document.purchase_invoice")
      .values(insertValues as never)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown>;

    const result = {
      ok:             true,
      id:             inserted["id"],
      code:           inserted["code"],
      status:         inserted["status"],
      record:         inserted,
    };

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

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
