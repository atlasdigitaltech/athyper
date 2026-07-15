/**
 * PurchaseOrderFacade — create-side facade for document.purchase_order.
 *
 * The view is a thin projection of document.commitment filtered to
 * commitment_type='purchase_order', with INSTEAD OF INSERT/UPDATE/DELETE
 * triggers that own the physical write. This facade wraps the view INSERT
 * with:
 *
 *   - System-field guardrails (numbering, status, workflow) so the client
 *     can't fabricate lifecycle state.
 *   - Numbering via control.next_entity_number('purchase_order','code',…),
 *     with a PO-YYYYMM-XXXXXX fallback when the numbering_series row is not
 *     yet seeded for a tenant.
 *   - Company_code default resolution + base_currency lookup.
 *   - View-back-read so the response echoes the same shape the read side
 *     of /records/purchase_order returns.
 *
 * Contract for v1:
 *   - create only (PATCH/DELETE/action returns 403 from the guard).
 *   - Header-only. `lines[]` is rejected with UNSUPPORTED_NESTED_LINES.
 *   - `code` is allocated by control.next_entity_number; caller-supplied
 *     values are rejected with DOCUMENT_NUMBER_MANAGED.
 *   - status is forced to 'draft'. Caller-supplied lifecycle/system fields
 *     are rejected with SYSTEM_FIELD_NOT_WRITABLE.
 *
 * Field surface (all native — matches document.purchase_order columns):
 *   name, order_type, party_id (supplier), requested_by,
 *   responsible_person_id, document_date, effective_date, expiry_date,
 *   currency_code, payment_term_id, exchange_rate, fx_policy.
 *
 * fiscal_year / period_number are derived by the trg_commitment_derive_period
 * BEFORE INSERT trigger; the facade does not compute or accept them.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  assertNoSystemFields,
  getWriteDescriptor,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface PurchaseOrderFacadeCtx {
  tenantId:    string;
  principalId: string;
  input:       Record<string, unknown>;
}

export type PurchaseOrderFacadeOutcome =
  | { ok: true;  record: Record<string, unknown> }
  | { ok: false; status: number; error: string; message: string };

// Process-lifetime cache of active lookup_value codes per domain. Populated
// lazily on first use, holds until process restart. Lookup values are
// platform-canonical seed data — safe to cache in-memory.
const LOOKUP_DOMAIN_CACHE = new Map<string, Set<string>>();

async function loadLookupDomain(db: AnyDb, domainCode: string): Promise<Set<string>> {
  const cached = LOOKUP_DOMAIN_CACHE.get(domainCode);
  if (cached) return cached;
  const rows = await sql<{ code: string }>`
    SELECT code
      FROM control.lookup_value
     WHERE domain_code = ${domainCode}::text
       AND status = 'active'
       AND tenant_id IS NULL
  `.execute(db);
  const codes = new Set(rows.rows.map((r) => r.code));
  LOOKUP_DOMAIN_CACHE.set(domainCode, codes);
  return codes;
}

export async function createPurchaseOrderViaFacade(
  db:  AnyDb,
  ctx: PurchaseOrderFacadeCtx,
): Promise<PurchaseOrderFacadeOutcome> {
  const { tenantId, principalId, input } = ctx;

  // ── Reject caller-supplied system-managed / unsupported fields ─────────
  // The system-managed field set is derived from control.entity_field
  // (is_read_only / is_computed / origin='system') so this list is not
  // maintained by hand. See @athyper/svc-shared WriteDescriptor.
  if (Array.isArray(input["lines"])) {
    return fail(400, "UNSUPPORTED_NESTED_LINES",
      "PurchaseOrderFacade.create() accepts header fields only. Submit lines via the line endpoint after the header is created.");
  }
  if (input["code"] !== undefined && input["code"] !== null && input["code"] !== "") {
    return fail(400, "DOCUMENT_NUMBER_MANAGED",
      "code is allocated by the numbering series and cannot be supplied by the caller.");
  }
  if (typeof input["status"] === "string" && input["status"] !== "draft") {
    return fail(400, "STATUS_NOT_WRITABLE",
      "status is system-managed on create — only 'draft' is permitted.");
  }

  const descriptor = await getWriteDescriptor(db, "purchase_order");
  // `code` (numbering) and `status` (lifecycle) are system-managed but were
  // already handled with more specific error codes above. Strip them before
  // the generic guard so a legitimate `status='draft'` input doesn't collide
  // with the "system field not writable" rule.
  const inputForDescriptorCheck: Record<string, unknown> = { ...input };
  delete inputForDescriptorCheck["code"];
  delete inputForDescriptorCheck["status"];
  const systemFieldsViolation = assertNoSystemFields(descriptor, inputForDescriptorCheck, "create");
  if (systemFieldsViolation) {
    return fail(400, systemFieldsViolation.code,
      systemFieldsViolation.message);
  }

  // ── Validate required fields ────────────────────────────────────────────
  const orderType = String(input["order_type"] ?? "").trim().toLowerCase();
  const allowedOrderTypes = await loadLookupDomain(db, "document.purchase_order_type");
  if (!allowedOrderTypes.has(orderType)) {
    return fail(400, "INVALID_ORDER_TYPE",
      `order_type must be one of ${Array.from(allowedOrderTypes).sort().join(", ")} (got '${orderType}').`);
  }

  const partyId = typeof input["party_id"] === "string" ? input["party_id"].trim() : "";
  if (!partyId) {
    return fail(400, "SUPPLIER_REQUIRED", "party_id is required (supplier).");
  }

  const name = typeof input["name"] === "string" ? input["name"].trim() : "";
  if (!name) {
    return fail(400, "NAME_REQUIRED", "name is required.");
  }

  const documentDate = typeof input["document_date"] === "string"
    ? input["document_date"].trim()
    : new Date().toISOString().slice(0, 10);

  const effectiveDate = typeof input["effective_date"] === "string"
    ? input["effective_date"].trim()
    : documentDate;

  const currencyCode = String(input["currency_code"] ?? "").trim().toUpperCase();
  if (!currencyCode || currencyCode.length !== 3) {
    return fail(400, "INVALID_CURRENCY", "currency_code is required (3-char ISO code).");
  }

  const expiryDate           = stringOrNull(input["expiry_date"]);
  const requestedBy          = stringOrNull(input["requested_by"]) ?? principalId;
  const responsiblePersonId  = stringOrNull(input["responsible_person_id"]);
  const paymentTermId        = stringOrNull(input["payment_term_id"]);
  const fxPolicy             = typeof input["fx_policy"] === "string" ? input["fx_policy"].trim() : "spot_on_event";
  const exchangeRate         = input["exchange_rate"] !== undefined && input["exchange_rate"] !== null
    ? Number(input["exchange_rate"])
    : null;

  // ── Resolve company_code + base_currency ────────────────────────────────
  let companyCodeId   = stringOrNull(input["company_code_id"]);
  let baseCurrencyCode: string | null = null;

  if (companyCodeId) {
    const cc = await sql<{ functional_currency: string }>`
      SELECT functional_currency
        FROM master.company_code
       WHERE id = ${companyCodeId}::uuid
         AND tenant_id = ${tenantId}::uuid
       LIMIT 1
    `.execute(db);
    baseCurrencyCode = cc.rows[0]?.functional_currency ?? null;
  } else {
    const cc = await sql<{ id: string; functional_currency: string }>`
      SELECT id, functional_currency
        FROM master.company_code
       WHERE tenant_id = ${tenantId}::uuid
         AND status    = 'active'
       ORDER BY created_at ASC
       LIMIT 1
    `.execute(db);
    if (!cc.rows[0]) {
      return fail(400, "COMPANY_CODE_REQUIRED",
        "No active company_code found for tenant; supply company_code_id explicitly.");
    }
    companyCodeId    = cc.rows[0].id;
    baseCurrencyCode = cc.rows[0].functional_currency;
  }

  if (!baseCurrencyCode) {
    baseCurrencyCode = currencyCode;
  }

  // Commitment CHECK constraint requires exchange_rate=1.0 when curr=base.
  const resolvedExchangeRate: number =
    currencyCode === baseCurrencyCode
      ? 1
      : (exchangeRate !== null && Number.isFinite(exchangeRate) && exchangeRate > 0
          ? exchangeRate
          : 1);

  // ── Allocate code via control.next_entity_number ────────────────────────
  const numberResult = await sql<{ value: string | null }>`
    SELECT control.next_entity_number(
      ${tenantId}::uuid,
      'purchase_order'::text,
      'code'::text,
      ${companyCodeId}::uuid,
      NULL::smallint,
      NULL::smallint,
      NULL,
      ${documentDate}::date
    ) AS value
  `.execute(db).catch(() => ({ rows: [{ value: null }] as Array<{ value: string | null }> }));

  let purchaseOrderCode = numberResult.rows[0]?.value;
  if (!purchaseOrderCode) {
    // Fallback: PO-YYYYMM-XXXXXX. Keeps the create path working in environments
    // that have not yet seeded a purchase_order numbering_series row.
    const now    = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rand   = Math.random().toString(36).substring(2, 8).toUpperCase();
    purchaseOrderCode = `PO-${yyyymm}-${rand}`;
  }

  // ── INSERT via document.purchase_order view (trigger writes commitment) ─
  try {
    const insertResult = await sql<{ id: string }>`
      INSERT INTO document.purchase_order (
        tenant_id, company_code_id,
        code, name,
        order_type,
        party_type, party_id,
        requested_by, responsible_person_id,
        document_date, effective_date, expiry_date,
        currency_code, base_currency_code, exchange_rate,
        fx_policy,
        payment_term_id,
        status, created_by
      ) VALUES (
        ${tenantId}::uuid,
        ${companyCodeId}::uuid,
        ${purchaseOrderCode}::text,
        ${name}::text,
        ${orderType}::text,
        'SUPPLIER'::text, ${partyId}::uuid,
        ${requestedBy}::uuid, ${responsiblePersonId}::uuid,
        ${documentDate}::date, ${effectiveDate}::date, ${expiryDate}::date,
        ${currencyCode}::char(3), ${baseCurrencyCode}::char(3),
        ${resolvedExchangeRate}::numeric,
        ${fxPolicy}::text,
        ${paymentTermId}::uuid,
        'draft'::text, ${principalId}::uuid
      )
      RETURNING id::text AS id
    `.execute(db);

    const commitmentId = insertResult.rows[0]?.id;
    if (!commitmentId) {
      return fail(500, "PURCHASE_ORDER_INSERT_FAILED",
        "Purchase order insert did not return an id.");
    }

    const viewRow = await sql<Record<string, unknown>>`
      SELECT *
        FROM document.purchase_order
       WHERE id        = ${commitmentId}::uuid
         AND tenant_id = ${tenantId}::uuid
       LIMIT 1
    `.execute(db);

    const record = viewRow.rows[0];
    if (!record) {
      return fail(500, "PURCHASE_ORDER_NOT_FOUND_POST_INSERT",
        "Purchase order was inserted but could not be read back from document.purchase_order.");
    }

    return { ok: true, record };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // FK / NOT NULL / CHECK constraint failures land here. Surface as 400 so
    // the client sees a validation-style error, not a 500.
    if (err instanceof Error && /violates|constraint/i.test(err.message)) {
      return fail(400, "PURCHASE_ORDER_INSERT_REJECTED", message);
    }
    return fail(500, "PURCHASE_ORDER_INSERT_FAILED", message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function fail(status: number, error: string, message: string): PurchaseOrderFacadeOutcome {
  return { ok: false, status, error, message };
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
