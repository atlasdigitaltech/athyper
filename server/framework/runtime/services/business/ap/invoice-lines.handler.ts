/**
 * AP Invoice Line CRUD Handler
 *
 * POST   /api/finance/ap/invoices/:id/lines        — add a line
 * PATCH  /api/finance/ap/invoices/:id/lines/:lid   — update a line
 * DELETE /api/finance/ap/invoices/:id/lines/:lid   — remove a line (draft only)
 *
 * Header totals are kept in sync by the trg_pil_sync_header DB trigger.
 * The trigger also enforces immutability (non-draft invoices block line changes).
 */

import type { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

interface HandlerResult {
  status: number;
  body:   Record<string, unknown>;
}

export interface AddLineBody {
  item_id?:                   string;
  item_description:           string;
  procurement_type?:          string;
  uom_code:                   string;
  quantity:                   number;
  unit_price:                 number;
  price_unit?:                number;
  discount_pct?:              number;
  tax_group_id?:              string;
  withholding_tax_group_id?:  string;
  spend_category_id?:         string;
  business_intent_id?:        string;
  cost_center_id?:            string;
  profit_center_id?:          string;
  project_id?:                string;
  site_id?:                   string;
  is_asset?:                  boolean;
  asset_category_id?:         string;
  commitment_line_id?:        string;
  goods_receipt_line_id?:     string;
  ses_line_id?:               string;
  notes?:                     string;
}

export type UpdateLineBody = Partial<AddLineBody> & { line_no?: number };

// ── Validate invoice is draft + belongs to tenant ─────────────────────────────
async function guardInvoice(
  db:        AnyDb,
  invoiceId: string,
  tenantId:  string,
): Promise<{ record: Record<string, unknown> } | { error: string; status: number }> {
  const row = await db
    .selectFrom("document.purchase_invoice as pi")
    .select(["pi.id", "pi.status", "pi.tenant_id", "pi.company_code_id", "pi.line_count"])
    .where("pi.id",        "=", invoiceId)
    .where("pi.tenant_id", "=", tenantId)
    .executeTakeFirst() as Record<string, unknown> | undefined;

  if (!row) return { error: "INVOICE_NOT_FOUND", status: 404 };
  const status = String(row["status"] ?? "");
  if (!["draft", "proforma"].includes(status)) {
    return { error: `Invoice is in '${status}' status. Lines can only be modified on draft or proforma invoices.`, status: 422 };
  }
  return { record: row };
}

// ── Compute next line_no ──────────────────────────────────────────────────────
async function nextLineNo(db: AnyDb, invoiceId: string): Promise<number> {
  const result = await db
    .selectFrom("document.purchase_invoice_line as pil")
    .select(db.fn.max("pil.line_no").as("max_line"))
    .where("pil.purchase_invoice_id", "=", invoiceId)
    .executeTakeFirst() as { max_line: number | null } | undefined;
  return (result?.max_line ?? 0) + 10;
}

// ── POST: add line ────────────────────────────────────────────────────────────

export async function handleAddInvoiceLine(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  principalId: string | null,
  body:        AddLineBody,
  logger?:     { info?(e: string, f?: Record<string, unknown>): void; error?(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  // Input validation
  if (!body.item_description?.trim()) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "item_description is required" } };
  }
  if (!body.uom_code?.trim()) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "uom_code is required" } };
  }
  if (typeof body.quantity !== "number" || body.quantity === 0) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "quantity must be a non-zero number" } };
  }
  if (typeof body.unit_price !== "number" || body.unit_price < 0) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "unit_price must be >= 0" } };
  }
  if (body.is_asset && !body.asset_category_id) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "asset_category_id is required when is_asset is true" } };
  }

  const guard = await guardInvoice(db, invoiceId, tenantId);
  if ("error" in guard) return { status: guard.status, body: { error: "INVOICE_GUARD", message: guard.error } };

  try {
    const lineNo = await nextLineNo(db, invoiceId);
    const now    = new Date();

    const inserted = await db
      .insertInto("document.purchase_invoice_line")
      .values({
        tenant_id:               tenantId,
        purchase_invoice_id:     invoiceId,
        line_no:                 lineNo,
        item_id:                 body.item_id ?? null,
        item_description:        body.item_description.trim(),
        procurement_type:        body.procurement_type ?? "goods",
        uom_code:                body.uom_code.trim(),
        quantity:                body.quantity,
        unit_price:              body.unit_price,
        price_unit:              body.price_unit ?? 1,
        discount_pct:            body.discount_pct ?? null,
        discount_amount:         null,
        tax_group_id:            body.tax_group_id ?? null,
        tax_amount:              0,
        withholding_tax_group_id: body.withholding_tax_group_id ?? null,
        withholding_tax_amount:  0,
        gross_amount:            0,
        spend_category_id:       body.spend_category_id ?? null,
        business_intent_id:      body.business_intent_id ?? null,
        cost_center_id:          body.cost_center_id ?? null,
        profit_center_id:        body.profit_center_id ?? null,
        project_id:              body.project_id ?? null,
        site_id:                 body.site_id ?? null,
        is_asset:                body.is_asset ?? false,
        asset_category_id:       body.asset_category_id ?? null,
        commitment_line_id:      body.commitment_line_id ?? null,
        goods_receipt_line_id:   body.goods_receipt_line_id ?? null,
        ses_line_id:             body.ses_line_id ?? null,
        notes:                   body.notes ?? null,
        created_by:              principalId ?? "00000000-0000-0000-0000-000000000000",
        created_at:              now,
      } as never)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown>;

    logger?.info?.("ap_invoice_line_added", { tenantId, invoiceId, lineId: inserted["id"], lineNo });
    return { status: 201, body: { ok: true, line: inserted } };

  } catch (err) {
    const e = err as Record<string, unknown> & { message?: string };
    const message = typeof e["message"] === "string" ? e["message"] : "Failed to add line";
    logger?.error?.("ap_invoice_line_add_error", { tenantId, invoiceId, err: message });
    return { status: 500, body: { error: "INTERNAL_ERROR", message } };
  }
}

// ── PATCH: update line ────────────────────────────────────────────────────────

export async function handleUpdateInvoiceLine(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  lineId:      string,
  principalId: string | null,
  body:        UpdateLineBody,
  logger?:     { info?(e: string, f?: Record<string, unknown>): void; error?(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  const guard = await guardInvoice(db, invoiceId, tenantId);
  if ("error" in guard) return { status: guard.status, body: { error: "INVOICE_GUARD", message: guard.error } };

  if (body.is_asset === true && !body.asset_category_id) {
    return { status: 400, body: { error: "VALIDATION_ERROR", message: "asset_category_id is required when is_asset is true" } };
  }

  try {
    const setClause: Record<string, unknown> = { updated_at: new Date(), updated_by: principalId };

    const fields: (keyof UpdateLineBody)[] = [
      "item_id", "item_description", "procurement_type", "uom_code",
      "quantity", "unit_price", "price_unit", "discount_pct",
      "tax_group_id", "withholding_tax_group_id",
      "spend_category_id", "business_intent_id",
      "cost_center_id", "profit_center_id", "project_id", "site_id",
      "is_asset", "asset_category_id",
      "commitment_line_id", "goods_receipt_line_id", "ses_line_id",
      "notes", "line_no",
    ];

    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        setClause[f] = body[f] ?? null;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (db.updateTable("document.purchase_invoice_line" as any) as any)
      .set(setClause)
      .where("id",                 "=", lineId)
      .where("tenant_id",         "=", tenantId)
      .where("purchase_invoice_id","=", invoiceId)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!updated) {
      return { status: 404, body: { error: "LINE_NOT_FOUND", message: "Line not found on this invoice" } };
    }

    logger?.info?.("ap_invoice_line_updated", { tenantId, invoiceId, lineId });
    return { status: 200, body: { ok: true, line: updated } };

  } catch (err) {
    const e = err as Record<string, unknown> & { message?: string };
    const message = typeof e["message"] === "string" ? e["message"] : "Failed to update line";
    return { status: 500, body: { error: "INTERNAL_ERROR", message } };
  }
}

// ── DELETE: remove line ───────────────────────────────────────────────────────

export async function handleDeleteInvoiceLine(
  db:          AnyDb,
  tenantId:    string,
  invoiceId:   string,
  lineId:      string,
  logger?:     { info?(e: string, f?: Record<string, unknown>): void; error?(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  const guard = await guardInvoice(db, invoiceId, tenantId);
  if ("error" in guard) return { status: guard.status, body: { error: "INVOICE_GUARD", message: guard.error } };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deleted = await (db.deleteFrom("document.purchase_invoice_line" as any) as any)
      .where("id",                 "=", lineId)
      .where("tenant_id",         "=", tenantId)
      .where("purchase_invoice_id","=", invoiceId)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!deleted) {
      return { status: 404, body: { error: "LINE_NOT_FOUND", message: "Line not found on this invoice" } };
    }

    logger?.info?.("ap_invoice_line_deleted", { tenantId, invoiceId, lineId });
    return { status: 200, body: { ok: true } };

  } catch (err) {
    const e = err as Record<string, unknown> & { message?: string };
    const message = typeof e["message"] === "string" ? e["message"] : "Failed to delete line";
    return { status: 500, body: { error: "INTERNAL_ERROR", message } };
  }
}
