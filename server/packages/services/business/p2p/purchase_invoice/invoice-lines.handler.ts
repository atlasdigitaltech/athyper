/**
 * AP Invoice Line CRUD Handler
 *
 * POST   /api/finance/ap/invoices/:id/lines        — add a line
 * PATCH  /api/finance/ap/invoices/:id/lines/:lid   — update a line
 * DELETE /api/finance/ap/invoices/:id/lines/:lid   — remove a line (draft only)
 *
 * Header totals are kept in sync by the trg_pil_sync_header DB trigger.
 * The trigger also enforces immutability (non-draft invoices block line changes).
 *
 * Concurrency:
 *   - All three mutations run inside a transaction that SELECT … FOR UPDATE on
 *     the parent invoice row, serializing concurrent line edits and fixing the
 *     max(line_no)+10 race that could produce duplicate line numbers.
 *   - When the caller holds a document edit lock (lock_token present), the lock
 *     is verified before entering the transaction.
 *   - trg_pil_sync_header fires after each mutation and updates the header totals.
 *     That UPDATE also fires trg_pi_row_version, incrementing parent.row_version.
 *     The new parent_row_version is returned in every response so the client can
 *     stay current without a separate fetch.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { verifyLock } from "@athyper/svc-shared";
import { computeLineTax } from "../../ap/purchase_invoice/tax-calculation.service.js";
import { refreshInvoiceCaches } from "../../pricing_component/pricing-component.service.js";
import { applyPurchaseInvoiceLineDefaults } from "./pi-line-defaults.service.js";

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
  line_type?:                string;
  uom_code:                   string;
  quantity:                   number;
  unit_price:                 number;
  price_unit?:                number;
  discount_pct?:              number;
  tax_group_id?:              string;
  withholding_tax_group_id?:  string;
  commodity_category_id?:         string;
  business_intent_id?:        string;
  // Accounting dimensions (cost_center, profit_center, project, budget_allocation)
  // live on document.accounting_distribution. The default 1:1 AD row is created
  // by accounting.default_distribution in the service resolver.
  site_id?:                   string | null;
  // Line-level ship-address overrides. NULL = inherit header / cascade
  // from source line (PO/receipt/service_sheet) through line.default_shipping.
  shipto_address_id?:         string | null;
  shipfrom_address_id?:       string | null;
  asset_class_id?:            string | null;
  commitment_line_id?:        string;
  receipt_line_id?:     string;
  service_sheet_line_id?:               string;
  notes?:                     string;
  // Retention — from payment term clause or manual override
  retention_pct?:             number;
  retention_amount?:          number;
  metadata?:                  Record<string, unknown> | null;
  data?:                      Record<string, unknown> | null;
  // Concurrency — optional; enforced when present
  lock_token?:                string;
}

export type UpdateLineBody = Partial<AddLineBody> & { line_no?: number };

// ── Validate invoice + acquire row lock (inside transaction) ──────────────────
// Returns the locked invoice row, or an error shape.
// The FOR UPDATE lock serializes concurrent line mutations and prevents the
// max(line_no)+10 race that produces duplicate line numbers.
async function lockAndGuardInvoice(
  trx:       AnyDb,
  invoiceId: string,
  tenantId:  string,
): Promise<{ record: Record<string, unknown> } | { error: string; status: number }> {
  const rows = await sql<{
    id: string; status: string; tenant_id: string; company_code_id: string;
    currency_code: string; row_version: number;
    tax_mode: string | null; invoice_date: string;
  }>`
    SELECT id, status, tenant_id, company_code_id, currency_code, row_version,
           tax_mode, COALESCE(supplier_invoice_date, received_date, CURRENT_DATE)::text AS invoice_date
      FROM document.purchase_invoice
     WHERE id        = ${invoiceId}::uuid
       AND tenant_id = ${tenantId}::uuid
    FOR UPDATE
  `.execute(trx);

  const row = rows.rows[0];
  if (!row) return { error: "INVOICE_NOT_FOUND", status: 404 };
  if (!["draft", "proforma"].includes(row.status)) {
    return { error: `Invoice is in '${row.status}' status. Lines can only be modified on draft or proforma invoices.`, status: 422 };
  }
  return { record: row as unknown as Record<string, unknown> };
}

// ── Compute next line_no (must run inside the FOR UPDATE transaction) ─────────
async function nextLineNo(trx: AnyDb, invoiceId: string): Promise<number> {
  const result = await trx
    .selectFrom("document.purchase_invoice_line as pil")
    .select(trx.fn.max("pil.line_no").as("max_line"))
    .where("pil.purchase_invoice_id", "=", invoiceId)
    .executeTakeFirst() as { max_line: number | null } | undefined;
  return (result?.max_line ?? 0) + 10;
}

// ── Fetch parent row_version after a line mutation ────────────────────────────
// trg_pil_sync_header fires after each line change and updates the header.
// trg_pi_row_version fires on that UPDATE and increments row_version.
// We read it back so the client can stay current without a separate fetch.
async function fetchParentRowVersion(trx: AnyDb, invoiceId: string): Promise<number | null> {
  const row = await sql<{ row_version: number }>`
    SELECT row_version FROM document.purchase_invoice WHERE id = ${invoiceId}::uuid
  `.execute(trx);
  return row.rows[0]?.row_version ?? null;
}

// ── Optional lock verification (before entering transaction) ──────────────────
async function verifyOptionalLock(
  db:          AnyDb,
  lockToken:   string | undefined,
  principalId: string | null,
  tenantId:    string,
  invoiceId:   string,
): Promise<{ ok: true } | { ok: false; status: number; error: string; reason?: string }> {
  if (!lockToken || !principalId) return { ok: true };

  const result = await verifyLock(db, {
    tenantId,
    entityName: "purchase_invoice",
    recordId:   invoiceId,
    lockedBy:   principalId,
    lockToken,
  });

  if (result.valid) return { ok: true };

  const httpStatus = result.reason === "expired" ? 410 : 423;
  const error      = result.reason === "expired" ? "LOCK_EXPIRED" : "LOCK_INVALID";
  return { ok: false, status: httpStatus, error, reason: result.reason };
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
  // Verify lock before entering transaction (avoids holding FOR UPDATE during network round-trip)
  const lockCheck = await verifyOptionalLock(db, body.lock_token, principalId, tenantId, invoiceId);
  if (!lockCheck.ok) {
    return { status: lockCheck.status, body: { error: lockCheck.error, reason: lockCheck.reason } };
  }

  try {
    const result = await (db as unknown as { transaction(): { execute<T>(fn: (trx: AnyDb) => Promise<T>): Promise<T> } })
      .transaction()
      .execute(async (trx) => {
        const guard = await lockAndGuardInvoice(trx, invoiceId, tenantId);
        if ("error" in guard) return guard;

        const lineNo   = await nextLineNo(trx, invoiceId);
        const now      = new Date();
        const priceUnit   = body.price_unit ?? 1;
        const invoice = guard.record as { company_code_id: string; currency_code: string };

        let inserted = await trx
          .insertInto("document.purchase_invoice_line")
          .values({
            tenant_id:                tenantId,
            company_code_id:          invoice.company_code_id,
            purchase_invoice_id:      invoiceId,
            line_no:                  lineNo,
            item_id:                  body.item_id ?? null,
            item_description:         body.item_description.trim(),
            procurement_type:         body.procurement_type ?? "goods",
            line_type:               body.line_type ?? "noncatalog",
            uom_code:                 body.uom_code.trim(),
            quantity:                 body.quantity,
            unit_price:               body.unit_price,
            price_unit:               priceUnit,
            currency_code:            invoice.currency_code,
            tax_group_id:             body.tax_group_id ?? null,
            tax_amount:               0,
            withholding_tax_group_id: body.withholding_tax_group_id ?? null,
            withholding_tax_amount:   0,
            commodity_category_id:        body.commodity_category_id ?? null,
            business_intent_id:       body.business_intent_id ?? null,
            site_id:                  body.site_id ?? null,
            asset_class_id:           body.asset_class_id ?? null,
            commitment_line_id:       body.commitment_line_id ?? null,
            receipt_line_id:    body.receipt_line_id ?? null,
            service_sheet_line_id:              body.service_sheet_line_id ?? null,
            created_by:               principalId ?? "00000000-0000-0000-0000-000000000000",
            created_at:               now,
          } as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown>;

        await applyPurchaseInvoiceLineDefaults(trx, {
          tenantId,
          invoiceId,
          lineId: String(inserted["id"]),
          principalId,
        });

        inserted = await sql<Record<string, unknown>>`
          SELECT *
            FROM document.purchase_invoice_line
           WHERE id = ${String(inserted["id"])}::uuid
             AND tenant_id = ${tenantId}::uuid
        `.execute(trx).then((r) => r.rows[0] ?? inserted);

        // Compute tax amounts using the DB-generated net_amount from the inserted row.
        // Sign follows net_amount: credit-note lines have negative net_amount, so tax
        // amounts are stored negative so that fn_refresh_purchase_invoice_totals sums
        // them correctly (total_amount = subtotal + tax, all signed consistently).
        const inv = guard.record as { tax_mode: string | null; invoice_date: string };
        const taxGroupId = body.tax_group_id ?? null;
        const whtGroupId = body.withholding_tax_group_id ?? null;
        if ((taxGroupId || whtGroupId) && inv.tax_mode && inv.tax_mode !== "no_tax") {
          const rawNet  = Number(inserted["net_amount"] ?? 0);
          const taxSign = rawNet >= 0 ? 1 : -1;
          const taxResult = await computeLineTax(
            trx, tenantId, Math.abs(rawNet),
            taxGroupId, whtGroupId,
            inv.tax_mode, new Date(inv.invoice_date),
          );
          const signedTax = taxResult.taxAmount * taxSign;
          const signedWht = taxResult.whtAmount * taxSign;

          // WS-COMPAT note: legacy flat-WHT preservation lives in the
          // backfill script (server/scripts/backfill-wht-pricing-components.ts)
          // — line CREATE has no prior value to preserve. apFeatureFlags
          // remains imported because the verifier scripts read it.

          if (signedTax !== 0 || signedWht !== 0) {
            await sql`
              UPDATE document.purchase_invoice_line
                 SET tax_amount             = ${signedTax.toFixed(4)}::numeric,
                     withholding_tax_amount = ${signedWht.toFixed(4)}::numeric
               WHERE id = ${inserted["id"]} AND tenant_id = ${tenantId}
            `.execute(trx);
            inserted["tax_amount"]             = signedTax;
            inserted["withholding_tax_amount"] = signedWht;
          }
        }

        const parentRowVersion = await fetchParentRowVersion(trx, invoiceId);
        return { inserted, lineNo, parentRowVersion };
      });

    if ("error" in result) {
      return { status: (result as { status: number }).status, body: { error: "INVOICE_GUARD", message: (result as { error: string }).error } };
    }

    const { inserted, lineNo, parentRowVersion } = result as {
      inserted: Record<string, unknown>;
      lineNo: number;
      parentRowVersion: number | null;
    };

    logger?.info?.("ap_invoice_line_added", { tenantId, invoiceId, lineId: inserted["id"], lineNo });
    return { status: 201, body: { ok: true, line: inserted, parent_row_version: parentRowVersion } };

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

  const lockCheck = await verifyOptionalLock(db, body.lock_token, principalId, tenantId, invoiceId);
  if (!lockCheck.ok) {
    return { status: lockCheck.status, body: { error: lockCheck.error, reason: lockCheck.reason } };
  }

  try {
    const result = await (db as unknown as { transaction(): { execute<T>(fn: (trx: AnyDb) => Promise<T>): Promise<T> } })
      .transaction()
      .execute(async (trx) => {
        const guard = await lockAndGuardInvoice(trx, invoiceId, tenantId);
        if ("error" in guard) return guard;

        const setClause: Record<string, unknown> = { updated_at: new Date(), updated_by: principalId };
        const fields: (keyof UpdateLineBody)[] = [
          "item_id", "item_description", "procurement_type", "uom_code",
          "line_type",
          "quantity", "unit_price", "price_unit",
          "tax_group_id", "withholding_tax_group_id",
          "commodity_category_id", "business_intent_id",
          "site_id",
          "shipto_address_id", "shipfrom_address_id",
          "asset_class_id",
          "commitment_line_id", "receipt_line_id", "service_sheet_line_id",
          "line_no",
        ];

        for (const f of fields) {
          if (Object.prototype.hasOwnProperty.call(body, f)) {
            setClause[f] = body[f] ?? null;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await (trx.updateTable("document.purchase_invoice_line" as any) as any)
          .set(setClause)
          .where("id",                  "=", lineId)
          .where("tenant_id",           "=", tenantId)
          .where("purchase_invoice_id", "=", invoiceId)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;

        if (!updated) return { notFound: true as const };

        // Recompute tax whenever any price or group field changes
        const taxAffecting = [
          "quantity", "unit_price", "price_unit",
          "tax_group_id", "withholding_tax_group_id",
        ];
        const taxAffectingChanged = taxAffecting.some(f =>
          Object.prototype.hasOwnProperty.call(body, f),
        );
        if (taxAffectingChanged) {
          const inv = guard.record as { tax_mode: string | null; invoice_date: string };
          const curTaxGroupId = (updated["tax_group_id"] as string | null) ?? null;
          const curWhtGroupId = (updated["withholding_tax_group_id"] as string | null) ?? null;
          const rawNet    = Number(updated["net_amount"] ?? 0);
          const taxSign   = rawNet >= 0 ? 1 : -1;
          const taxResult = await computeLineTax(
            trx, tenantId, Math.abs(rawNet),
            curTaxGroupId, curWhtGroupId,
            inv.tax_mode ?? "exclusive", new Date(inv.invoice_date),
          );
          const signedTax = taxResult.taxAmount * taxSign;
          const signedWht = taxResult.whtAmount * taxSign;
          await sql`
            UPDATE document.purchase_invoice_line
               SET tax_amount             = ${signedTax.toFixed(4)}::numeric,
                   withholding_tax_amount = ${signedWht.toFixed(4)}::numeric
             WHERE id = ${lineId} AND tenant_id = ${tenantId}
          `.execute(trx);
          updated["tax_amount"]             = signedTax;
          updated["withholding_tax_amount"] = signedWht;
        }

        const parentRowVersion = await fetchParentRowVersion(trx, invoiceId);
        return { updated, parentRowVersion };
      });

    if ("error" in result) {
      return { status: (result as { status: number }).status, body: { error: "INVOICE_GUARD", message: (result as { error: string }).error } };
    }
    if ("notFound" in result) {
      return { status: 404, body: { error: "LINE_NOT_FOUND", message: "Line not found on this invoice" } };
    }

    const { updated, parentRowVersion } = result as {
      updated: Record<string, unknown>;
      parentRowVersion: number | null;
    };

    logger?.info?.("ap_invoice_line_updated", { tenantId, invoiceId, lineId });
    return { status: 200, body: { ok: true, line: updated, parent_row_version: parentRowVersion } };

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
  principalId: string | null,
  lockToken:   string | undefined,
  logger?:     { info?(e: string, f?: Record<string, unknown>): void; error?(e: string, f?: Record<string, unknown>): void },
): Promise<HandlerResult> {

  const lockCheck = await verifyOptionalLock(db, lockToken, principalId, tenantId, invoiceId);
  if (!lockCheck.ok) {
    return { status: lockCheck.status, body: { error: lockCheck.error, reason: lockCheck.reason } };
  }

  try {
    const result = await (db as unknown as { transaction(): { execute<T>(fn: (trx: AnyDb) => Promise<T>): Promise<T> } })
      .transaction()
      .execute(async (trx) => {
        const guard = await lockAndGuardInvoice(trx, invoiceId, tenantId);
        if ("error" in guard) return guard;

        // P1.1 — Block delete when active line-scope PC children reference this
        // PIL. Polymorphic source_line_id is not a real FK, so a raw DELETE would
        // orphan PC rows (the PC_APPORTION_SUM_DRIFT check cannot catch orphans
        // whose sums still equal the header). Belt to the AFTER DELETE DB trigger
        // in 06u_pricing_component_triggers.sql — failing here returns a typed
        // 409 the BFF/UI can present, instead of bubbling a raw PG exception.
        const activePcRows = await sql<{ id: string; term_type: string }>`
          SELECT id, term_type
            FROM document.pricing_component
           WHERE tenant_id        = ${tenantId}::uuid
             AND source_doc_type  = 'purchase_invoice_line'
             AND source_line_id   = ${lineId}::uuid
             AND superseded_by_id IS NULL
        `.execute(trx);

        if (activePcRows.rows.length > 0) {
          return {
            pcGuard: {
              count:      activePcRows.rows.length,
              sample_ids: activePcRows.rows.slice(0, 10).map((r) => r.id),
              term_types: Array.from(new Set(activePcRows.rows.map((r) => r.term_type))),
            },
          } as const;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deleted = await (trx.deleteFrom("document.purchase_invoice_line" as any) as any)
          .where("id",                  "=", lineId)
          .where("tenant_id",           "=", tenantId)
          .where("purchase_invoice_id", "=", invoiceId)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;

        if (!deleted) return { notFound: true as const };

        // P1.2 — Refresh PC-driven flat caches on the parent invoice. A deleted
        // line may have been the sole carrier of a header PC's base_for_calculation
        // basis amount; without this call, posting (which still reads flat columns
        // in shadow mode) would see stale aggregates.
        await refreshInvoiceCaches(trx, tenantId, invoiceId);

        const parentRowVersion = await fetchParentRowVersion(trx, invoiceId);
        return { deleted, parentRowVersion };
      });

    if ("error" in result) {
      return { status: (result as { status: number }).status, body: { error: "INVOICE_GUARD", message: (result as { error: string }).error } };
    }
    if ("notFound" in result) {
      return { status: 404, body: { error: "LINE_NOT_FOUND", message: "Line not found on this invoice" } };
    }
    if ("pcGuard" in result) {
      const g = (result as { pcGuard: { count: number; sample_ids: string[]; term_types: string[] } }).pcGuard;
      return {
        status: 409,
        body: {
          error:   "LINE_HAS_ACTIVE_PRICING_COMPONENTS",
          message: `Cannot delete line: ${g.count} active pricing-component row(s) reference it. Remove or supersede them first.`,
          pricing_component_count:      g.count,
          pricing_component_sample_ids: g.sample_ids,
          pricing_component_term_types: g.term_types,
        },
      };
    }

    const { parentRowVersion } = result as { deleted: Record<string, unknown>; parentRowVersion: number | null };

    logger?.info?.("ap_invoice_line_deleted", { tenantId, invoiceId, lineId });
    return { status: 200, body: { ok: true, parent_row_version: parentRowVersion } };

  } catch (err) {
    const e = err as Record<string, unknown> & { message?: string };
    const message = typeof e["message"] === "string" ? e["message"] : "Failed to delete line";
    return { status: 500, body: { error: "INTERNAL_ERROR", message } };
  }
}
