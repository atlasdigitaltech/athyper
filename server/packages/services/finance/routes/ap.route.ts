/**
 * AP / AR Routes
 *
 * GET    /api/finance/ap/invoices               — paginated AP invoice list
 * POST   /api/finance/ap/invoices               — create AP invoice (proforma or draft)
 * GET    /api/finance/ap/invoices/:id           — single AP invoice with lines
 * PATCH  /api/finance/ap/invoices/:id           — update AP invoice header fields (draft/proforma only)
 * POST   /api/finance/ap/invoices/:id/lines          — add a line item
 * PATCH  /api/finance/ap/invoices/:id/lines/:lid    — update a line item (auto-classifies when commodity_category_id changes)
 * DELETE /api/finance/ap/invoices/:id/lines/:lid    — remove a line item
 * POST   /api/finance/ap/invoices/:id/lines/:lid/classify — explicit classify trigger (?mode=preview|save)
 * GET    /api/finance/ap/invoices/:id/lines/suggest — commodity-category text suggestions (?q=)
 * GET    /api/finance/ap/payments               — payment_entry WHERE direction = OUTBOUND
 * POST   /api/finance/ap/payments               — create draft payment entry for an AP invoice
 * GET    /api/finance/ap/payment-methods        — list active payment methods (OUTBOUND/BOTH)
 * GET    /api/finance/ap/aging                  — AP aging buckets by supplier
 * GET    /api/finance/ar/invoices               — paginated AR invoice list (graceful when module inactive)
 * GET    /api/finance/ar/receipts               — payment_entry WHERE direction = INBOUND
 * POST   /api/finance/ar/receipts               — create draft receipt (standalone INBOUND payment entry)
 * GET    /api/finance/ar/payment-methods        — list active payment methods (INBOUND/BOTH)
 * GET    /api/finance/ar/aging                  — AR aging buckets by customer
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  type FinanceRouteDeps,
  enforceWriteRateLimit,
  parseScopeParams,
  resolveCompanyIds,
} from "./finance.route.js";
import { verifyBearer, resolveTenantId, isUuid, resolvePrincipalIdOrNull, resolvePrincipalIdWithJit, extractOrgHeaders, verifyLock, isEntityOperationAllowed } from "@athyper/svc-shared";
import {
  checkPermission,
  createStepUpBinding,
  requireAllow,
  requireStepUp,
} from "@athyper/svc-iam";
import {
  restoreFromSnapshot,
  RestoreError,
} from "@athyper/svc-business";
import { randomUUID } from "node:crypto";
import { handleCreateApInvoice } from "@athyper/svc-business";
import { handleAddInvoiceLine, handleUpdateInvoiceLine, handleDeleteInvoiceLine } from "@athyper/svc-business";
import {
  allocateDocumentNumber,
  createPaymentFromInvoice,
  handlePostPayment,
  handleSubmitPayment,
  handleVoidPayment,
  resolveCompanyAndBaseCurrency,
  resolveFiscalPeriod,
} from "@athyper/svc-business";
import type { BusinessLifecycleSyncHook } from "@athyper/svc-business";
import {
  apportionToLines,
  canPcAction,
  createComponent,
  deleteComponent,
  supersedeComponent,
  updateComponentInPlace,
  type ApportionBasis,
  type Basis,
  type CreateComponentInput,
  type EntryLevel,
  type Origin,
  type TermType,
} from "@athyper/svc-business";
import { syncLifecycleInstanceForStatus } from "@athyper/svc-workflow";
import {
  resolveDraftLineClassification,
  resolveLineClassification,
} from "@athyper/svc-business";
import { suggestSpendCategories } from "@athyper/svc-business";
import { extractInvoiceDraft } from "@athyper/svc-business";
import { appendAuditEvent } from "@athyper/svc-audit";

// ── Payment status resolution ─────────────────────────────────────────────────
// Recomputes paid_amount and status from posted non-voided allocations only.
// Draft/approved payments do not affect invoice settlement — only posted payments count.
// outstanding_amount is GENERATED ALWAYS AS STORED; not written here.
// Call this inside the same transaction that mutates payment_entry_allocation.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveInvoicePaymentStatus(trx: Kysely<any>, tenantId: string, invoiceId: string): Promise<void> {
  const invResult = await sql<{ payable_amount: string | null; total_amount: string; status: string }>`
    SELECT payable_amount, total_amount, status
    FROM   document.purchase_invoice
    WHERE  id = ${invoiceId} AND tenant_id = ${tenantId}
    LIMIT  1 FOR UPDATE
  `.execute(trx);

  const inv = invResult.rows[0];
  if (!inv) return;

  const payable = parseFloat(String(inv.payable_amount ?? inv.total_amount ?? "0"));
  if (payable <= 0) return;

  // Sum only from posted non-voided payments; draft allocations are not settled
  const sumResult = await sql<{ total: string }>`
    SELECT COALESCE(SUM(pea.allocated_amount), 0) AS total
      FROM document.payment_entry_allocation pea
      JOIN document.payment_entry            pe  ON pe.id = pea.payment_entry_id
                                               AND pe.tenant_id = pea.tenant_id
     WHERE pea.tenant_id           = ${tenantId}
       AND pea.purchase_invoice_id = ${invoiceId}
       AND pe.status               = 'posted'
       AND pe.is_voided            = false
  `.execute(trx);

  const paid = parseFloat(String(sumResult.rows[0]?.total ?? "0"));

  let newStatus = inv.status;
  if (paid >= payable) {
    newStatus = "fully_paid";
  } else if (paid > 0) {
    newStatus = "partially_paid";
  } else if (inv.status === "partially_paid" || inv.status === "fully_paid") {
    newStatus = "posted";
  }

  await sql`
    UPDATE document.purchase_invoice
       SET paid_amount = ${paid.toFixed(4)}::numeric,
           status      = ${newStatus},
           updated_at  = now()
     WHERE id = ${invoiceId} AND tenant_id = ${tenantId}
  `.execute(trx);
}

// ── Route factory ─────────────────────────────────────────────────────────────

function createBusinessLogger(logger: FinanceRouteDeps["logger"]): {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
} {
  return {
    info: (event, fields) => logger?.info?.(event, fields),
    warn: (event, fields) => (logger?.warn ?? logger?.info)?.(event, fields),
  };
}

function createFinanceLifecycleSyncHook(
  logger: FinanceRouteDeps["logger"],
): BusinessLifecycleSyncHook {
  return async (params) => {
    const sync = await syncLifecycleInstanceForStatus({
      db: params.db as never,
      tenantId: params.tenantId,
      entityName: params.entityName,
      entityId: params.entityId,
      status: params.status,
      actorId: params.actorId,
      payload: params.payload,
      logger: logger as never,
    });

    if (!sync.synced) {
      (logger?.warn ?? logger?.info)?.("finance_ap_lifecycle_instance_sync_skipped", {
        entity: params.entityName,
        tenantId: params.tenantId,
        recordId: params.entityId,
        status: params.status,
        reason: sync.reason,
      });
    }
  };
}

// PC_MUTABLE_STATUSES / PC_SUPERSEDE_STATUSES removed in v3.1 Phase 1. Use
// canPcAction(invoice.status, "canEdit" | "canDelete" | "canAdd" | "canSupersede")
// instead — the canonical matrix lives in @athyper/api-contracts/pc-affordance-matrix
// and is consumed by both the client UI hook and the verifier.
const PC_TERM_TYPES: readonly TermType[] = ["discount", "charge", "tax", "withholding", "retention", "principal_marker"];

// Apportionment breakup helpers — extracted to apportionment-helpers.ts in
// Phase 5e so the pure parsing + escaping logic can be unit-tested without
// dragging in express + kysely. Re-imported here so the route handlers
// keep their existing call sites unchanged.
import {
  APPORTIONMENT_CSV_MAX_ROWS,
  csvField,
  encodeApportionmentCursor,
  parseApportionmentCursor,
  parseApportionmentQuery,
  parseApportionmentTab,
} from "./apportionment-helpers.js";

// Apportionment breakup helpers (parse cursor / tab / q + csv field
// escape + CSV row cap) live in ./apportionment-helpers.ts — imported
// at the top of this file beside the canPcAction import. Extracted in
// v3.1 Phase 5e so the pure parsing logic can be unit-tested without
// pulling in the express + kysely surface this route file depends on.

const PC_BASIS_TYPES: readonly Basis[] = ["percent", "amount", "per_unit", "flat"];
const PC_ENTRY_LEVELS: readonly EntryLevel[] = ["header", "line"];
const PC_APPORTION_BASES: readonly ApportionBasis[] = ["value", "quantity", "weight", "equal"];
const PC_ORIGINS: readonly Origin[] = ["manual", "inherited", "vendor_default", "system_resolved"];

interface InvoiceForPricingComponent {
  id: string;
  status: string;
  currency_code: string | null;
  base_currency_code: string | null;
  exchange_rate: string | number | null;
}

interface GenericPricingComponentSource {
  id: string;
  source_doc_type: "commitment_line";
  status: string;
  currency_code: string | null;
  base_currency_code: string | null;
  exchange_rate: string | number | null;
}

interface PricingComponentSupersedeBlock {
  id: string;
  expectedVersion?: string | number;
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; message: string };

function parsePricingComponentRequest(
  value: unknown,
  invoice: InvoiceForPricingComponent,
): ParseResult<{ input: CreateComponentInput; supersede: PricingComponentSupersedeBlock | null }> {
  if (!isPlainRecord(value)) {
    return { ok: false, status: 400, error: "INVALID_REQUEST", message: "Body must be a JSON object." };
  }
  const rawCreate = isPlainRecord(value["create"]) ? value["create"] : value;
  const create = rawCreate as Record<string, unknown>;

  const requestSourceDocId = readOptionalUuid(create["source_doc_id"]);
  if (requestSourceDocId && requestSourceDocId !== invoice.id) {
    return {
      ok: false,
      status: 400,
      error: "SOURCE_DOC_ID_MISMATCH",
      message: "Pricing component source_doc_id must match the invoice id in the route.",
    };
  }

  const conditionTypeId = readOptionalUuid(create["condition_type_id"]);
  if (!conditionTypeId) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_CONDITION_TYPE",
      message: "condition_type_id must be a UUID.",
    };
  }

  const termType = readEnum(create["term_type"], PC_TERM_TYPES);
  const basis = readEnum(create["basis"], PC_BASIS_TYPES);
  if (!termType || !basis) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_COMPONENT_SHAPE",
      message: "term_type and basis are required and must be valid pricing component values.",
    };
  }

  const sourceLineId = readOptionalUuid(create["source_line_id"]);
  const entryLevel = readEnum(create["entry_level"], PC_ENTRY_LEVELS) ?? (sourceLineId ? "line" : "header");
  if (entryLevel === "line" && !sourceLineId) {
    return { ok: false, status: 400, error: "SOURCE_LINE_REQUIRED", message: "Line-scope components require source_line_id." };
  }
  if (entryLevel === "header" && sourceLineId) {
    return { ok: false, status: 400, error: "HEADER_SOURCE_LINE_FORBIDDEN", message: "Header-scope components must not include source_line_id." };
  }

  const currencyCode = readString(create["currency_code"]) || invoice.currency_code || "INR";
  const baseCurrencyCode = readString(create["base_currency_code"]) || invoice.base_currency_code || currencyCode;
  const exchangeRate = readNumber(create["exchange_rate"]) ?? readNumber(invoice.exchange_rate) ?? 1;
  const sequence = readNumber(create["sequence"]) ?? 100;

  const input: CreateComponentInput = {
    source_doc_type: "purchase_invoice_line",
    source_doc_id: invoice.id,
    source_line_id: entryLevel === "line" ? sourceLineId : null,
    term_type: termType,
    condition_type_id: conditionTypeId,
    sequence,
    basis,
    rate_value: readNumber(create["rate_value"]),
    amount_value: readNumber(create["amount_value"]),
    base_for_calculation: readNumber(create["base_for_calculation"]),
    entry_level: entryLevel,
    apportion_basis: entryLevel === "header"
      ? readEnum(create["apportion_basis"], PC_APPORTION_BASES) ?? "value"
      : null,
    origin: readEnum(create["origin"], PC_ORIGINS) ?? "manual",
    tax_group_id: readOptionalUuid(create["tax_group_id"]),
    is_inclusive: readBoolean(create["is_inclusive"]),
    recoverable_pct: readNumber(create["recoverable_pct"]),
    tax_section_code: readNullableString(create["tax_section_code"]),
    // WS-B/D8: propagate the WHT metadata snapshot through to the service.
    // The service-level validateWhtInput() enforces presence of
    // rate_schedule_id + wht_basis + resolved_rate for term_type='withholding';
    // without this read the keys were dropped at the route boundary and the
    // service rejected every WHT create.
    metadata: isPlainRecord(create["metadata"]) ? create["metadata"] : null,
    currency_code: currencyCode,
    base_currency_code: baseCurrencyCode,
    exchange_rate: exchangeRate,
  };

  return { ok: true, value: { input, supersede: parsePricingComponentSupersede(value["supersede"]) } };
}

function parseGenericPricingComponentRequest(
  value: unknown,
  source: GenericPricingComponentSource,
): ParseResult<{ input: CreateComponentInput; supersede: PricingComponentSupersedeBlock | null }> {
  if (!isPlainRecord(value)) {
    return { ok: false, status: 400, error: "INVALID_REQUEST", message: "Body must be a JSON object." };
  }
  const rawCreate = isPlainRecord(value["create"]) ? value["create"] : value;
  const create = rawCreate as Record<string, unknown>;

  const requestSourceDocId = readOptionalUuid(create["source_doc_id"]);
  if (requestSourceDocId && requestSourceDocId !== source.id) {
    return {
      ok: false,
      status: 400,
      error: "SOURCE_DOC_ID_MISMATCH",
      message: "Pricing component source_doc_id must match the source document id.",
    };
  }

  const conditionTypeId = readOptionalUuid(create["condition_type_id"]);
  if (!conditionTypeId) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_CONDITION_TYPE",
      message: "condition_type_id must be a UUID.",
    };
  }

  const termType = readEnum(create["term_type"], PC_TERM_TYPES);
  const basis = readEnum(create["basis"], PC_BASIS_TYPES);
  if (!termType || !basis) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_COMPONENT_SHAPE",
      message: "term_type and basis are required and must be valid pricing component values.",
    };
  }

  const sourceLineId = readOptionalUuid(create["source_line_id"]);
  const entryLevel = readEnum(create["entry_level"], PC_ENTRY_LEVELS) ?? (sourceLineId ? "line" : "header");
  if (entryLevel === "line" && !sourceLineId) {
    return { ok: false, status: 400, error: "SOURCE_LINE_REQUIRED", message: "Line-scope components require source_line_id." };
  }
  if (entryLevel === "header" && sourceLineId) {
    return { ok: false, status: 400, error: "HEADER_SOURCE_LINE_FORBIDDEN", message: "Header-scope components must not include source_line_id." };
  }

  const currencyCode = readString(create["currency_code"]) || source.currency_code || "INR";
  const baseCurrencyCode = readString(create["base_currency_code"]) || source.base_currency_code || currencyCode;
  const exchangeRate = readNumber(create["exchange_rate"]) ?? readNumber(source.exchange_rate) ?? 1;

  return {
    ok: true,
    value: {
      input: {
        source_doc_type: source.source_doc_type,
        source_doc_id: source.id,
        source_line_id: entryLevel === "line" ? sourceLineId : null,
        term_type: termType,
        condition_type_id: conditionTypeId,
        sequence: readNumber(create["sequence"]) ?? 100,
        basis,
        rate_value: readNumber(create["rate_value"]),
        amount_value: readNumber(create["amount_value"]),
        base_for_calculation: readNumber(create["base_for_calculation"]),
        entry_level: entryLevel,
        apportion_basis: entryLevel === "header"
          ? readEnum(create["apportion_basis"], PC_APPORTION_BASES) ?? "value"
          : null,
        origin: readEnum(create["origin"], PC_ORIGINS) ?? "manual",
        tax_group_id: readOptionalUuid(create["tax_group_id"]),
        is_inclusive: readBoolean(create["is_inclusive"]),
        recoverable_pct: readNumber(create["recoverable_pct"]),
        tax_section_code: readNullableString(create["tax_section_code"]),
        metadata: isPlainRecord(create["metadata"]) ? create["metadata"] : null,
        currency_code: currencyCode,
        base_currency_code: baseCurrencyCode,
        exchange_rate: exchangeRate,
      },
      supersede: parsePricingComponentSupersede(value["supersede"]),
    },
  };
}

function parsePricingComponentSupersede(value: unknown): PricingComponentSupersedeBlock | null {
  if (!isPlainRecord(value)) return null;
  const id = readOptionalUuid(value["id"]);
  if (!id) return null;
  const expectedVersion = value["expectedVersion"];
  if (typeof expectedVersion === "string" || typeof expectedVersion === "number") {
    return { id, expectedVersion };
  }
  return { id };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function readNullableString(value: unknown): string | null {
  return readString(value);
}

function readOptionalUuid(value: unknown): string | null {
  const text = readString(value);
  return text && isUuid(text) ? text : null;
}

async function loadGenericPricingComponentSource(
  db: Kysely<unknown>,
  tenantId: string,
  sourceDocType: string,
  sourceDocId: string,
): Promise<GenericPricingComponentSource | null> {
  if (sourceDocType !== "commitment_line") return null;
  const row = await sql<GenericPricingComponentSource>`
    SELECT
      id,
      'commitment_line'::text AS source_doc_type,
      status,
      currency_code,
      base_currency_code,
      exchange_rate
    FROM document.commitment
    WHERE id = ${sourceDocId}::uuid
      AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `.execute(db);
  return row.rows[0] ?? null;
}

function readNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value as T
    : null;
}

export function createApRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger, cache, checkPermissionBatch } = deps;
  const businessLogger = createBusinessLogger(logger);
  const lifecycleSync = createFinanceLifecycleSyncHook(logger);

  async function requirePaymentReleaseStepUp(
    claims: Record<string, unknown>,
    tenantId: string,
    res: Parameters<RequestHandler>[1],
  ): Promise<boolean> {
    if (!cache) {
      res.status(503).json({
        error: "STEP_UP_UNAVAILABLE",
        message: "Payment release verification is temporarily unavailable.",
      });
      return false;
    }
    return requireStepUp(
      cache,
      createStepUpBinding(claims, String(claims.sub ?? ""), tenantId, "payment_release"),
      res,
    );
  }

  router.post("/finance/pricing-components", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const body = isPlainRecord(req.body) ? req.body : {};
      const sourceDocType = readString(body["source_doc_type"]);
      const rawCreate = isPlainRecord(body["create"]) ? body["create"] : body;
      const sourceDocId = readOptionalUuid((rawCreate as Record<string, unknown>)["source_doc_id"]);
      if (!sourceDocType || !sourceDocId) {
        res.status(400).json({ error: "INVALID_REQUEST", message: "source_doc_type and create.source_doc_id are required." });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:pc:create:${tenantId}:${sub}`, 30, 60)) return;
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const source = await loadGenericPricingComponentSource(db as Kysely<unknown>, tenantId, sourceDocType, sourceDocId);
      if (!source) {
        res.status(404).json({ error: "SOURCE_NOT_FOUND", message: "Pricing component source is not supported or was not found." });
        return;
      }

      const parsed = parseGenericPricingComponentRequest(req.body, source);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error, message: parsed.message });
        return;
      }
      if (parsed.value.supersede) {
        res.status(422).json({ error: "CHILD_NOT_EDITABLE", message: "Pricing components must be edited while the document is draft." });
        return;
      }
      if (!canPcAction(source.status, "canAdd")) {
        res.status(422).json({
          error: "NOT_EDITABLE",
          message: `Document is in '${source.status}' and cannot accept new pricing components.`,
        });
        return;
      }
      if (parsed.value.input.source_line_id) {
        const line = await sql<{ id: string }>`
          SELECT id
            FROM document.commitment_line
           WHERE id = ${parsed.value.input.source_line_id}::uuid
             AND commitment_id = ${source.id}::uuid
             AND tenant_id = ${tenantId}::uuid
           LIMIT 1
        `.execute(db);
        if (!line.rows[0]) { res.status(404).json({ error: "LINE_NOT_FOUND" }); return; }
      }

      const id = await createComponent(db, tenantId, principalId, parsed.value.input);
      const createdInput = parsed.value.input;
      const needsApportionment = createdInput.source_doc_type === "commitment_line"
        && createdInput.entry_level === "header"
        && createdInput.apportion_basis != null
        && createdInput.apportion_basis !== "weight";
      if (needsApportionment) {
        try {
          await apportionToLines(db, { tenantId, headerPcId: id, actor: principalId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.startsWith("PC_APPORTION_DEGENERATE_BASIS")) {
            res.status(422).json({
              error: "PC_APPORTION_DEGENERATE_BASIS",
              message: message.replace(/^PC_APPORTION_DEGENERATE_BASIS:\s*/, ""),
            });
            return;
          }
          throw err;
        }
      }
      res.status(201).json({ ok: true, created: { id } });
    } catch (err) {
      logger?.error("finance_pricing_component_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.patch("/finance/pricing-components/:pcId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const pcId = String(req.params["pcId"] ?? "");
      if (!isUuid(pcId)) { res.status(400).json({ error: "INVALID_PC_ID" }); return; }
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:pc:update:${tenantId}:${sub}`, 30, 60)) return;
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const pc = await sql<{
        id: string; source_doc_type: string; source_doc_id: string; entry_level: string; origin: string; superseded_by_id: string | null;
      }>`
        SELECT id, source_doc_type, source_doc_id, entry_level, origin, superseded_by_id
          FROM document.pricing_component
         WHERE id = ${pcId}::uuid
           AND tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
      const current = pc.rows[0];
      if (!current) { res.status(404).json({ error: "PRICING_COMPONENT_NOT_FOUND" }); return; }
      if (current.superseded_by_id) { res.status(409).json({ error: "LEGACY_REPLACED_ROW" }); return; }
      if (current.origin !== "manual") {
        res.status(422).json({ error: "UPDATE_NOT_ALLOWED_FOR_ORIGIN", message: `Pricing components with origin '${current.origin}' cannot be edited directly.` });
        return;
      }

      const source = await loadGenericPricingComponentSource(db as Kysely<unknown>, tenantId, current.source_doc_type, current.source_doc_id);
      if (!source) { res.status(404).json({ error: "SOURCE_NOT_FOUND" }); return; }
      if (!canPcAction(source.status, "canEdit")) {
        res.status(422).json({ error: "NOT_EDITABLE", message: `Document is in '${source.status}' and pricing components are read-only.` });
        return;
      }

      const parsed = parseGenericPricingComponentRequest(req.body, source);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error, message: parsed.message });
        return;
      }
      if (parsed.value.supersede) {
        res.status(400).json({ error: "INVALID_REQUEST", message: "PATCH does not accept replacement-chain blocks." });
        return;
      }

      const result = await updateComponentInPlace(db, tenantId, principalId, pcId, source.id, parsed.value.input);
      if (current.entry_level === "header") {
        await sql`
          DELETE FROM document.pricing_component
           WHERE tenant_id              = ${tenantId}::uuid
             AND is_apportioned_from_id = ${pcId}::uuid
        `.execute(db);
      }
      const updatedInput = parsed.value.input;
      const needsApportionment = updatedInput.source_doc_type === "commitment_line"
        && updatedInput.entry_level === "header"
        && updatedInput.apportion_basis != null
        && updatedInput.apportion_basis !== "weight";
      if (needsApportionment) {
        try {
          await apportionToLines(db, { tenantId, headerPcId: pcId, actor: principalId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.startsWith("PC_APPORTION_DEGENERATE_BASIS")) {
            res.status(422).json({
              error: "PC_APPORTION_DEGENERATE_BASIS",
              message: message.replace(/^PC_APPORTION_DEGENERATE_BASIS:\s*/, ""),
            });
            return;
          }
          throw err;
        }
      }
      res.status(200).json({ ok: true, updated: { id: result.id } });
    } catch (err) {
      logger?.error("finance_pricing_component_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.delete("/finance/pricing-components/:pcId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const pcId = String(req.params["pcId"] ?? "");
      if (!isUuid(pcId)) { res.status(400).json({ error: "INVALID_PC_ID" }); return; }
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:pc:delete:${tenantId}:${sub}`, 30, 60)) return;
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const pc = await sql<{
        id: string; source_doc_type: string; source_doc_id: string; origin: string; superseded_by_id: string | null;
      }>`
        SELECT id, source_doc_type, source_doc_id, origin, superseded_by_id
          FROM document.pricing_component
         WHERE id = ${pcId}::uuid
           AND tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
      const current = pc.rows[0];
      if (!current) { res.status(404).json({ error: "PRICING_COMPONENT_NOT_FOUND" }); return; }
      if (current.superseded_by_id) { res.status(409).json({ error: "LEGACY_REPLACED_ROW" }); return; }
      if (current.origin !== "manual") {
        res.status(422).json({ error: "DELETE_NOT_ALLOWED_FOR_ORIGIN", message: `Pricing components with origin '${current.origin}' cannot be deleted directly.` });
        return;
      }

      const source = await loadGenericPricingComponentSource(db as Kysely<unknown>, tenantId, current.source_doc_type, current.source_doc_id);
      if (!source) { res.status(404).json({ error: "SOURCE_NOT_FOUND" }); return; }
      if (!canPcAction(source.status, "canDelete")) {
        res.status(422).json({ error: "NOT_DELETABLE", message: `Document is in '${source.status}' and pricing components are read-only.` });
        return;
      }

      await deleteComponent(db, tenantId, principalId, pcId, source.id);
      res.status(200).json({ ok: true, deleted: { id: pcId } });
    } catch (err) {
      logger?.error("finance_pricing_component_delete_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ap/invoices ──────────────────────────────────────────
  router.get("/finance/ap/invoices", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;
      const supplierId = req.query["supplierId"] as string | undefined;
      if (supplierId !== undefined && !isUuid(supplierId)) {
        res.json({ items: [], total: 0 });
        return;
      }

      let q = db
        .selectFrom("document.purchase_invoice as pi")
        .leftJoin("master.supplier as s", (jb) =>
          jb.onRef("s.id", "=", "pi.supplier_id").on("s.tenant_id", "=", tenantId),
        )
        .leftJoin("master.business_partner as bp", (jb) =>
          jb.onRef("bp.id", "=", "s.business_partner_id").on("bp.tenant_id", "=", tenantId),
        )
        .select([
          "pi.id",
          "pi.code as invoiceNumber",
          "pi.invoice_source as invoiceSource",
          "pi.supplier_invoice_number as supplierInvoiceNumber",
          "pi.supplier_invoice_date as supplierInvoiceDate",
          "pi.document_date as documentDate", "pi.posting_date as postingDate",
          "pi.due_date as dueDate", "pi.fiscal_year as fiscalYear",
          "pi.period_number as periodNumber",
          sql<string>`COALESCE(pi.supplier_invoice_date, pi.document_date)`.as("invoiceDate"),
          "pi.currency_code as currencyCode",
          "pi.total_amount as totalAmount",
          "pi.subtotal_amount as subtotalAmount",
          "pi.tax_amount as taxAmount",
          "pi.withholding_tax_amount as withholdingTaxAmount",
          "pi.payable_amount as payableAmount",
          "pi.paid_amount as paidAmount",
          "pi.outstanding_amount as outstandingAmount",
          "pi.status", "pi.match_status as matchStatus",
          "pi.is_posted as isPosted",
          // is_on_hold column was dropped (Hold Model A); status='on_hold' is authoritative.
          sql<boolean>`(pi.status = 'on_hold')`.as("isOnHold"),
          "pi.is_credit_note as isCreditNote", "pi.is_reversal as isReversal",
          "pi.line_count as lineCount",
          "pi.company_code_id as companyCodeId",
          "s.supplier_code as supplierCode",
          sql<string>`COALESCE(bp.display_name, bp.name, s.supplier_code)`.as("supplierName"),
        ])
        .where("pi.tenant_id", "=", tenantId)
        .where("pi.company_code_id", "in", companyIds)
        .where("pi.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("pi.period_number", "=", parsed.period) as typeof q;
      if (parsed.transactionCurrency) q = q.where("pi.currency_code", "=", parsed.transactionCurrency) as typeof q;
      if (status) q = q.where("pi.status", "=", status) as typeof q;
      if (supplierId) q = q.where("pi.supplier_id", "=", supplierId) as typeof q;

      const [items, countRow] = await Promise.all([
        q.orderBy("pi.posting_date", "desc").orderBy("pi.code", "desc")
          .limit(limit).offset(offset).execute(),
        db.selectFrom("document.purchase_invoice as pi")
          .select(db.fn.countAll().as("total"))
          .where("pi.tenant_id", "=", tenantId)
          .where("pi.company_code_id", "in", companyIds)
          .where("pi.fiscal_year", "=", parsed.fiscalYear)
          .$if(parsed.period !== null, (qb) => qb.where("pi.period_number", "=", parsed.period as number))
          .$if(!!parsed.transactionCurrency, (qb) => qb.where("pi.currency_code", "=", parsed.transactionCurrency as string))
          .$if(!!status, (qb) => qb.where("pi.status", "=", status as string))
          .$if(!!supplierId, (qb) => qb.where("pi.supplier_id", "=", supplierId as string))
          .executeTakeFirst(),
      ]);

      res.json({ items, total: Number(countRow?.total ?? 0) });
    } catch (err) { logger?.error("finance_ap_invoices_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ap/invoices/:id ─────────────────────────────────────
  router.get("/finance/ap/invoices/:id", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const invoiceId = req.params["id"] as string;
      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .leftJoin("master.supplier as s", (jb) =>
          jb.onRef("s.id", "=", "pi.supplier_id").on("s.tenant_id", "=", tenantId),
        )
        .leftJoin("master.business_partner as bp", (jb) =>
          jb.onRef("bp.id", "=", "s.business_partner_id").on("bp.tenant_id", "=", tenantId),
        )
        .selectAll("pi")
        .select([
          "s.supplier_code as supplierCode",
          sql<string>`COALESCE(bp.display_name, bp.name, s.supplier_code)`.as("supplierName"),
        ])
        .where("pi.tenant_id", "=", tenantId)
        .where("pi.id", "=", invoiceId)
        .executeTakeFirst();

      if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

      const lines = await db
        .selectFrom("document.purchase_invoice_line as pil")
        .selectAll()
        .where("pil.tenant_id", "=", tenantId)
        .where("pil.purchase_invoice_id", "=", invoiceId)
        .orderBy("pil.line_no", "asc")
        .execute();

      const allocations = await db
        .selectFrom("document.payment_entry_allocation as pea")
        .innerJoin("document.payment_entry as pe", "pe.id", "pea.payment_entry_id")
        .select([
          "pea.id", "pea.allocated_amount as allocatedAmount",
          "pea.discount_amount as discountAmount",
          "pea.net_payment_amount as netPaymentAmount",
          "pe.payment_number as paymentNumber",
          "pe.posting_date as postingDate", "pe.status as paymentStatus",
        ])
        .where("pea.tenant_id", "=", tenantId)
        .where("pea.purchase_invoice_id", "=", invoiceId)
        .orderBy("pe.posting_date", "desc")
        .execute();

      res.json({ ...invoice, lines, allocations });
    } catch (err) { logger?.error("finance_ap_invoice_detail_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ap/invoices/:id/party ────────────────────────────────
  // Party display resolves purchase_invoice.supplier_id through live master data.
  router.get("/finance/ap/invoices/:id/party", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

      const invoiceId = req.params["id"] as string;
      if (!isUuid(invoiceId)) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

      const piRow = await sql<{ status: string; supplier_id: string | null }>`
        SELECT status, supplier_id
          FROM document.purchase_invoice
         WHERE id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
      const pi = piRow.rows[0];
      if (!pi) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

      if (!pi.supplier_id) { res.json({ source: "live", party: null }); return; }
      const live = await sql<Record<string, unknown>>`
        SELECT s.id                                    AS supplier_id,
               s.supplier_code                         AS code,
               COALESCE(bp.legal_name, bp.display_name, bp.name) AS name,
               bp.registration_no                      AS tax_registration_no,
               COALESCE(bp.registration_country_code, bp.tax_residence_country_code) AS country_code,
               bp.legal_name                           AS legal_entity_name
          FROM master.supplier s
          JOIN master.business_partner bp
            ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
         WHERE s.id        = ${pi.supplier_id}::uuid
           AND s.tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
      res.json({ source: "live", party: live.rows[0] ?? null });

    } catch (err) {
      logger?.error("finance_ap_invoice_party_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ap/payments ─────────────────────────────────────────
  router.get("/finance/ap/payments", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;

      let q = db
        .selectFrom("document.payment_entry as pe")
        .select([
          "pe.id", "pe.payment_number as paymentNumber",
          "pe.payment_type as paymentType", "pe.payment_direction as paymentDirection",
          "pe.supplier_name as supplierName", "pe.supplier_id as supplierId",
          "pe.payment_amount as paymentAmount", "pe.currency_code as currencyCode",
          "pe.base_amount as baseAmount", "pe.base_currency_code as baseCurrencyCode",
          "pe.document_date as documentDate", "pe.posting_date as postingDate",
          "pe.value_date as valueDate", "pe.fiscal_year as fiscalYear",
          "pe.payment_reference as paymentReference",
          "pe.bank_reference as bankReference",
          "pe.is_posted as isPosted", "pe.is_transmitted as isTransmitted",
          "pe.is_voided as isVoided", "pe.status",
        ])
        .where("pe.tenant_id", "=", tenantId)
        .where("pe.company_code_id", "in", companyIds)
        .where("pe.payment_direction", "=", "OUTBOUND")
        .where("pe.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("pe.period_number", "=", parsed.period) as typeof q;
      if (parsed.transactionCurrency) q = q.where("pe.currency_code", "=", parsed.transactionCurrency) as typeof q;
      if (status) q = q.where("pe.status", "=", status) as typeof q;

      const [items, countRow] = await Promise.all([
        q.orderBy("pe.posting_date", "desc").orderBy("pe.payment_number", "desc")
          .limit(limit).offset(offset).execute(),
        (q as typeof q).clearSelect().select(db.fn.countAll().as("total")).executeTakeFirst(),
      ]);

      res.json({ items, total: Number((countRow as Record<string, unknown> | undefined)?.["total"] ?? 0) });
    } catch (err) { logger?.error("finance_ap_payments_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/ap/payments ────────────────────────────────────────────
  // Create a draft payment entry for an AP invoice.
  //
  // Body:
  //   invoice_id         — purchase_invoice.id (UUID)
  //   payment_method_id  — master.payment_method.id (UUID)
  //   value_date?        — payment value date (ISO date, defaults to today)
  //   notes?             — optional memo
  //
  // Creates:
  //   document.payment_entry (status='draft', is_batch_payment=false)
  //   document.payment_entry_allocation (line_no=1, allocated_amount=outstanding_amount)
  //
  // Returns 201 { payment_entry_id, payment_number, status }.
  router.post("/finance/ap/payments", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap_payments:create:${tenantId}:${sub}`, 20, 60)) return;
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const invoiceId       = String(body["invoice_id"]        ?? "").trim();
      const paymentMethodId = String(body["payment_method_id"] ?? "").trim();
      const bankAccountId   = String(body["bank_account_id"]   ?? "").trim();

      if (!invoiceId || !isUuid(invoiceId)) {
        res.status(400).json({ error: "INVALID_INVOICE_ID" });
        return;
      }
      if (!paymentMethodId || !isUuid(paymentMethodId)) {
        res.status(400).json({ error: "INVALID_PAYMENT_METHOD_ID" });
        return;
      }
      if (!bankAccountId || !isUuid(bankAccountId)) {
        res.status(400).json({ error: "INVALID_BANK_ACCOUNT_ID" });
        return;
      }

      const today     = new Date().toISOString().slice(0, 10);
      const valueDate = body["value_date"] ? String(body["value_date"]) : today;
      const notes     = body["notes"] ? String(body["notes"]) : null;

      // Load invoice
      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .leftJoin("master.supplier as s", (jb) =>
          jb.onRef("s.id", "=", "pi.supplier_id").on("s.tenant_id", "=", tenantId),
        )
        .leftJoin("master.business_partner as bp", (jb) =>
          jb.onRef("bp.id", "=", "s.business_partner_id").on("bp.tenant_id", "=", tenantId),
        )
        .select([
          "pi.id",
          "pi.company_code_id as companyCodeId",
          "pi.supplier_id     as supplierId",
          "pi.currency_code   as currencyCode",
          "pi.outstanding_amount as outstandingAmount",
          "pi.fiscal_year     as fiscalYear",
          "pi.period_number   as periodNumber",
          "pi.status",
          "pi.is_posted       as isPosted",
          "pi.is_credit_note  as isCreditNote",
          sql<string>`COALESCE(bp.display_name, bp.name, s.supplier_code)`.as("supplierName"),
        ])
        .where("pi.id",        "=", invoiceId)
        .where("pi.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!invoice) {
        res.status(404).json({ error: "INVOICE_NOT_FOUND" });
        return;
      }
      if (invoice["isCreditNote"]) {
        res.status(422).json({ error: "INVOICE_NOT_PAYABLE", message: "Credit/debit notes must be applied through credit settlement, not paid as cash out." });
        return;
      }
      if (!invoice["isPosted"] || !["posted", "partially_paid"].includes(String(invoice["status"]))) {
        res.status(422).json({ error: "INVOICE_NOT_PAYABLE", message: "Only AP-posted invoices can be selected for payment." });
        return;
      }

      const outstanding = parseFloat(String(invoice["outstandingAmount"] ?? "0"));
      if (outstanding <= 0) {
        res.status(409).json({ error: "NO_OUTSTANDING", message: "Invoice has no outstanding balance" });
        return;
      }

      // Validate payment method belongs to tenant
      const paymentMethod = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id"])
        .where("pm.id",        "=", paymentMethodId)
        .where("pm.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string } | undefined;

      if (!paymentMethod) {
        res.status(400).json({ error: "PAYMENT_METHOD_NOT_FOUND" });
        return;
      }

      const bankAccount = await db
        .selectFrom("master.bank_account_link as bal")
        .innerJoin("master.bank_account as ba", (jb) =>
          jb.onRef("ba.id", "=", "bal.bank_account_id").on("ba.tenant_id", "=", tenantId),
        )
        .select(["ba.id"])
        .where("bal.tenant_id", "=", tenantId)
        .where("bal.owner_type", "=", "company_code")
        .where("bal.owner_id", "=", String(invoice["companyCodeId"]))
        .where("bal.bank_account_id", "=", bankAccountId)
        .where("ba.status", "=", "active")
        .executeTakeFirst() as { id: string } | undefined;

      if (!bankAccount) {
        res.status(400).json({ error: "BANK_ACCOUNT_NOT_FOUND", message: "Bank account is not active for the invoice company code" });
        return;
      }

      const companyCodeId = String(invoice["companyCodeId"]);
      const company = await resolveCompanyAndBaseCurrency(db, {
        tenantId,
        companyCodeIdHint: companyCodeId,
      });
      if (!company.companyCodeId || !company.baseCurrencyCode) {
        res.status(422).json({
          error:   "COMPANY_CODE_REQUIRED",
          message: "Could not resolve company_code_id and base_currency_code for the invoice company.",
        });
        return;
      }

      const fp = await resolveFiscalPeriod(db, {
        tenantId,
        companyCodeId,
        documentDate: today,
        logger: logger?.warn ? { warn: logger.warn } : undefined,
      });
      if (!fp.ok) {
        res.status(422).json({
          error:   "FISCAL_PERIOD_MISSING",
          message: `No fiscal_period covers ${today} for the invoice company_code.`,
          details: { tenantId, companyCodeId, documentDate: today },
        });
        return;
      }

      const resolvedPaymentNumber = await allocateDocumentNumber(db, {
        tenantId,
        entityCode:     "payment_entry",
        numberField:    "document_no",
        companyCodeId,
        fiscalYear:     fp.fiscalYear,
        periodNumber:   fp.periodNumber,
        effectiveDate:  today,
        fallbackPrefix: "PMT",
      });

      const outcome = await createPaymentFromInvoice(db, {
        tenantId,
        principalId,
        companyCodeId,
        documentDate:     today,
        valueDate,
        paymentMethodId,
        bankAccountId,
        notes:            notes ?? undefined,
        paymentNumber:    resolvedPaymentNumber,
        fiscalYear:       fp.fiscalYear,
        periodNumber:     fp.periodNumber,
        baseCurrencyCode: company.baseCurrencyCode,
        allocations:      [{ invoiceId, allocatedAmount: outstanding }],
      });

      if (!outcome.ok) {
        res.status(outcome.status).json({
          error:   outcome.error,
          message: outcome.message,
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
        });
        return;
      }

      logger?.info?.("finance_ap_payment_created", {
        paymentEntryId: outcome.paymentId,
        paymentNumber: outcome.paymentNumber,
        invoiceId,
        tenantId,
      });

      res.status(201).json({
        payment_entry_id: outcome.paymentId,
        payment_number:   outcome.paymentNumber,
        status:           "draft",
      });
      return;

        // A draft payment allocation creates the invoice↔payment link but must not
        // change invoice status — the invoice is only marked paid after the payment
    } catch (err) {
      logger?.error("finance_ap_payment_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ap/payment-methods ──────────────────────────────────────
  // List active payment methods for the tenant, scoped to OUTBOUND direction.
  router.get("/finance/ap/payment-methods", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const methods = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id", "pm.code", "pm.name", "pm.direction", "pm.is_active as isActive"])
        .where("pm.tenant_id", "=", tenantId)
        .where("pm.is_active", "=", true)
        .where((eb) => eb.or([
          eb("pm.direction", "=", "OUTBOUND"),
          eb("pm.direction", "=", "BOTH"),
        ]))
        .orderBy("pm.name", "asc")
        .execute() as Array<{ id: string; code: string; name: string; direction: string; isActive: boolean }>;

      res.json({ items: methods });
    } catch (err) {
      logger?.error("finance_ap_payment_methods_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ap/aging ─────────────────────────────────────────────
  // AP aging: outstanding invoices bucketed by days overdue.
  router.get("/finance/ap/aging", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      // Use raw SQL for the conditional SUM aging buckets
      const { rows } = await sql<{
        supplier_id: string | null;
        supplier_code: string | null;
        supplier_name: string | null;
        current_amount: string;
        days_1_30: string;
        days_31_60: string;
        days_61_90: string;
        over_90: string;
        total_outstanding: string;
      }>`
        SELECT
          pi.supplier_id,
          s.supplier_code AS supplier_code,
          COALESCE(bp.display_name, bp.name, s.supplier_code) AS supplier_name,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date IS NULL OR pi.due_date >= CURRENT_DATE), 0) AS current_amount,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE
              AND pi.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS days_1_30,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE - INTERVAL '30 days'
              AND pi.due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) AS days_31_60,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE - INTERVAL '60 days'
              AND pi.due_date >= CURRENT_DATE - INTERVAL '90 days'), 0) AS days_61_90,
          COALESCE(SUM(pi.outstanding_amount) FILTER (
            WHERE pi.due_date < CURRENT_DATE - INTERVAL '90 days'), 0) AS over_90,
          SUM(pi.outstanding_amount) AS total_outstanding
        FROM document.purchase_invoice pi
        LEFT JOIN master.supplier s
          ON s.id = pi.supplier_id AND s.tenant_id = pi.tenant_id
        LEFT JOIN master.business_partner bp
          ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
        WHERE pi.tenant_id = ${tenantId}::uuid
          AND pi.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          ${parsed.transactionCurrency ? sql`AND pi.currency_code = ${parsed.transactionCurrency}` : sql``}
          AND pi.outstanding_amount > 0
          AND pi.status NOT IN ('cancelled', 'reversed', 'rejected', 'draft')
        GROUP BY pi.supplier_id, s.supplier_code, bp.display_name, bp.name
        ORDER BY total_outstanding DESC
      `.execute(db);

      const result = rows.map((r) => ({
        supplierId:       r.supplier_id,
        supplierCode:     r.supplier_code,
        supplierName:     r.supplier_name ?? "Unknown",
        currentAmount:    parseFloat(r.current_amount),
        days1to30:        parseFloat(r.days_1_30),
        days31to60:       parseFloat(r.days_31_60),
        days61to90:       parseFloat(r.days_61_90),
        over90:           parseFloat(r.over_90),
        totalOutstanding: parseFloat(r.total_outstanding),
      }));

      res.json({ rows: result, asAt: new Date().toISOString() });
    } catch (err) { logger?.error("finance_ap_aging_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ar/receipts ──────────────────────────────────────────
  // AR receipts = payment_entry WHERE payment_direction = 'INBOUND'
  router.get("/finance/ar/receipts", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;

      let q = db
        .selectFrom("document.payment_entry as pe")
        .select([
          "pe.id", "pe.payment_number as paymentNumber",
          "pe.payment_type as paymentType", "pe.payment_direction as paymentDirection",
          "pe.supplier_name as counterpartyName",
          "pe.payment_amount as paymentAmount", "pe.currency_code as currencyCode",
          "pe.base_amount as baseAmount", "pe.base_currency_code as baseCurrencyCode",
          "pe.document_date as documentDate", "pe.posting_date as postingDate",
          "pe.value_date as valueDate", "pe.fiscal_year as fiscalYear",
          "pe.payment_reference as paymentReference",
          "pe.bank_reference as bankReference",
          "pe.is_posted as isPosted", "pe.status",
        ])
        .where("pe.tenant_id", "=", tenantId)
        .where("pe.company_code_id", "in", companyIds)
        .where("pe.payment_direction", "=", "INBOUND")
        .where("pe.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("pe.period_number", "=", parsed.period) as typeof q;
      if (parsed.transactionCurrency) q = q.where("pe.currency_code", "=", parsed.transactionCurrency) as typeof q;
      if (status) q = q.where("pe.status", "=", status) as typeof q;

      const [items, countRow] = await Promise.all([
        q.orderBy("pe.posting_date", "desc").orderBy("pe.payment_number", "desc")
          .limit(limit).offset(offset).execute(),
        (q as typeof q).clearSelect().select(db.fn.countAll().as("total")).executeTakeFirst(),
      ]);

      res.json({ items, total: Number((countRow as Record<string, unknown> | undefined)?.["total"] ?? 0) });
    } catch (err) { logger?.error("finance_ar_receipts_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/ar/aging ─────────────────────────────────────────────
  // AR aging: outstanding sales invoices bucketed by days overdue, grouped by customer.
  // Returns empty rows gracefully when document.sales_invoice does not yet exist.
  router.get("/finance/ar/aging", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ rows: [], asAt: new Date().toISOString() }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const { rows } = await sql<{
        customer_id:       string | null;
        customer_code:     string | null;
        customer_name:     string | null;
        current_amount:    string;
        days_1_30:         string;
        days_31_60:        string;
        days_61_90:        string;
        over_90:           string;
        total_outstanding: string;
      }>`
        SELECT
          si.customer_id,
          c.code  AS customer_code,
          c.name  AS customer_name,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date IS NULL OR si.due_date >= CURRENT_DATE), 0) AS current_amount,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE
              AND si.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)  AS days_1_30,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE - INTERVAL '30 days'
              AND si.due_date >= CURRENT_DATE - INTERVAL '60 days'), 0)  AS days_31_60,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE - INTERVAL '60 days'
              AND si.due_date >= CURRENT_DATE - INTERVAL '90 days'), 0)  AS days_61_90,
          COALESCE(SUM(si.outstanding_amount) FILTER (
            WHERE si.due_date < CURRENT_DATE - INTERVAL '90 days'), 0)   AS over_90,
          SUM(si.outstanding_amount)                                      AS total_outstanding
        FROM document.sales_invoice si
        LEFT JOIN master.customer c
               ON c.id = si.customer_id AND c.tenant_id = si.tenant_id
        WHERE si.tenant_id       = ${tenantId}::uuid
          AND si.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          ${parsed.transactionCurrency ? sql`AND si.currency_code = ${parsed.transactionCurrency}` : sql``}
          AND si.outstanding_amount > 0
          AND si.status NOT IN ('cancelled', 'reversed', 'rejected', 'draft')
        GROUP  BY si.customer_id, c.code, c.name
        ORDER  BY total_outstanding DESC
      `.execute(db);

      res.json({
        rows: rows.map((r) => ({
          customerId:   r.customer_id,
          customerCode: r.customer_code,
          customerName: r.customer_name ?? "Unknown",
          current:      parseFloat(r.current_amount),
          days1to30:    parseFloat(r.days_1_30),
          days31to60:   parseFloat(r.days_31_60),
          days61to90:   parseFloat(r.days_61_90),
          over90:       parseFloat(r.over_90),
          total:        parseFloat(r.total_outstanding),
        })),
        asAt: new Date().toISOString(),
      });
    } catch (err) {
      // Graceful fallback: if sales_invoice table doesn't exist yet, return empty.
      // Check PG error code 42P01 (undefined_table) or the error message — but
      // avoid swallowing real data errors (FK violations etc contain "relation" too).
      const code = (err as Record<string, unknown>)?.["code"];
      const msg  = String(err);
      if (code === "42P01" || msg.includes("does not exist")) {
        res.json({ rows: [], asAt: new Date().toISOString() });
        return;
      }
      logger?.error("finance_ar_aging_error", { err: msg });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ar/invoices ─────────────────────────────────────────
  // Returns AR (sales) invoices. Gracefully returns empty when the sales
  // module / document.sales_invoice table is not yet activated for the tenant.
  router.get("/finance/ar/invoices", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const limit  = Math.min(200, parseInt(String(req.query["limit"]  ?? "50"), 10));
      const offset =               parseInt(String(req.query["offset"] ?? "0"),  10);
      const status = req.query["status"] as string | undefined;

      const { rows: items } = await sql<Record<string, unknown>>`
        SELECT
          si.id,
          si.invoice_number                   AS "invoiceNumber",
          si.customer_id                      AS "customerId",
          c.name                              AS "customerName",
          si.invoice_date                     AS "invoiceDate",
          si.due_date                         AS "dueDate",
          si.currency_code                    AS "currencyCode",
          si.total_amount                     AS "totalAmount",
          si.receivable_amount                AS "receivableAmount",
          si.received_amount                  AS "receivedAmount",
          si.outstanding_amount               AS "outstandingAmount",
          si.status,
          si.fiscal_year                      AS "fiscalYear",
          si.period_number                    AS "periodNumber",
          si.posting_date                     AS "postingDate",
          si.is_posted                        AS "isPosted",
          si.is_voided                        AS "isVoided"
        FROM document.sales_invoice si
        LEFT JOIN master.customer c
               ON c.id = si.customer_id AND c.tenant_id = si.tenant_id
        WHERE si.tenant_id       = ${tenantId}::uuid
          AND si.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          AND si.fiscal_year     = ${parsed.fiscalYear}
          ${parsed.transactionCurrency ? sql`AND si.currency_code = ${parsed.transactionCurrency}` : sql``}
          ${status ? sql`AND si.status = ${status}` : sql``}
        ORDER BY si.posting_date DESC, si.invoice_number DESC
        LIMIT  ${limit}
        OFFSET ${offset}
      `.execute(db);

      const { rows: countRows } = await sql<{ cnt: string }>`
        SELECT COUNT(*) AS cnt
        FROM document.sales_invoice si
        WHERE si.tenant_id       = ${tenantId}::uuid
          AND si.company_code_id = ANY(ARRAY[${sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `)}])
          AND si.fiscal_year     = ${parsed.fiscalYear}
          ${parsed.transactionCurrency ? sql`AND si.currency_code = ${parsed.transactionCurrency}` : sql``}
          ${status ? sql`AND si.status = ${status}` : sql``}
      `.execute(db);

      res.json({ items, total: parseInt(String(countRows[0]?.["cnt"] ?? "0"), 10) });
    } catch (err) {
      // Graceful fallback — sales_invoice table may not exist yet
      const code = (err as Record<string, unknown>)?.["code"];
      const msg  = String(err);
      if (code === "42P01" || msg.includes("does not exist")) {
        res.json({ items: [], total: 0, _inactive: true });
        return;
      }
      logger?.error("finance_ar_invoices_error", { err: msg });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/finance/ar/receipts ─────────────────────────────────────────
  // Create a standalone draft receipt (INBOUND payment entry) for a cash receipt
  // from a customer. Not linked to an invoice (no allocation row needed).
  //
  // Body:
  //   payment_method_id  — master.payment_method.id (UUID)
  //   payment_amount     — receipt amount (number > 0)
  //   currency_code      — ISO 4217 (e.g. "USD")
  //   counterparty_name  — customer or payer name
  //   value_date?        — receipt value date (ISO date, defaults to today)
  //   payment_reference? — customer reference / invoice number cited
  //   notes?             — optional memo
  //
  // Returns 201 { payment_entry_id, payment_number, status }.
  router.post("/finance/ar/receipts", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "TENANT_NOT_FOUND" }); return; }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const body            = req.body as Record<string, unknown>;
      const paymentMethodId = String(body["payment_method_id"] ?? "").trim();
      const amountRaw       = parseFloat(String(body["payment_amount"] ?? "0"));
      const currencyCode    = String(body["currency_code"] ?? "").trim().toUpperCase();
      const counterpartyName = String(body["counterparty_name"] ?? "Unknown").trim();

      if (!paymentMethodId || !isUuid(paymentMethodId))
        { res.status(400).json({ error: "INVALID_PAYMENT_METHOD_ID" }); return; }
      if (isNaN(amountRaw) || amountRaw <= 0)
        { res.status(400).json({ error: "INVALID_AMOUNT" }); return; }
      if (!currencyCode)
        { res.status(400).json({ error: "INVALID_CURRENCY_CODE" }); return; }

      const today     = new Date().toISOString().slice(0, 10);
      const valueDate = body["value_date"]        ? String(body["value_date"])        : today;
      const payRef    = body["payment_reference"] ? String(body["payment_reference"]) : null;
      const notes     = body["notes"]             ? String(body["notes"])             : null;

      // Determine company code from scope params
      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0)
        { res.status(400).json({ error: "COMPANY_NOT_FOUND" }); return; }
      const companyCodeId = companies[0]!.company_code_id;

      // Validate payment method (must be INBOUND or BOTH)
      const paymentMethod = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id"])
        .where("pm.id",        "=", paymentMethodId)
        .where("pm.tenant_id", "=", tenantId)
        .where((eb) => eb.or([eb("pm.direction", "=", "INBOUND"), eb("pm.direction", "=", "BOTH")]))
        .executeTakeFirst() as { id: string } | undefined;

      if (!paymentMethod) { res.status(400).json({ error: "PAYMENT_METHOD_NOT_FOUND" }); return; }

      // Auto-generate receipt number: REC-{YYYY}-{seq}
      const fiscalYear = parsed.fiscalYear;
      const countRow = await db
        .selectFrom("document.payment_entry as pe")
        .select(db.fn.countAll().as("cnt"))
        .where("pe.tenant_id",          "=", tenantId)
        .where("pe.fiscal_year",        "=", fiscalYear)
        .where("pe.payment_direction",  "=", "INBOUND")
        .executeTakeFirst() as { cnt: string | number } | undefined;
      const seq = parseInt(String(countRow?.cnt ?? "0"), 10) + 1;
      const paymentNumber = `REC-${fiscalYear}-${String(seq).padStart(5, "0")}`;

      const paymentEntryId = randomUUID();

      await db
        .insertInto("document.payment_entry" as never)
        .values({
          id:                 paymentEntryId,
          tenant_id:          tenantId,
          company_code_id:    companyCodeId,
          payment_number:     paymentNumber,
          payment_type:       "standard",
          payment_direction:  "INBOUND",
          supplier_name:      counterpartyName,          // stores customer name
          payment_method_id:  paymentMethodId,
          value_date:         valueDate,
          document_date:      today,
          posting_date:       today,
          currency_code:      currencyCode,
          base_currency_code: currencyCode,
          payment_amount:     amountRaw.toFixed(4),
          base_amount:        amountRaw.toFixed(4),
          fiscal_year:        fiscalYear,
          period_number:      parsed.period ?? 1,
          payment_reference:  payRef,
          status:             "draft",
          is_batch_payment:   false,
          is_posted:          false,
          is_printed:         false,
          is_transmitted:     false,
          is_voided:          false,
          is_reversal:        false,
          line_count:         0,
          notes:              notes,
          tags:               sql`'[]'::jsonb`,
          metadata:           sql`'{}'::jsonb`,
          created_at:         sql`now()`,
          created_by:         principalId,
        } as never)
        .execute();

      logger?.info?.("finance_ar_receipt_created", { paymentEntryId, paymentNumber, tenantId });

      res.status(201).json({ payment_entry_id: paymentEntryId, payment_number: paymentNumber, status: "draft" });
    } catch (err) {
      logger?.error("finance_ar_receipt_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/ar/payment-methods ──────────────────────────────────────
  // List active payment methods for the tenant, scoped to INBOUND direction.
  router.get("/finance/ar/payment-methods", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const methods = await db
        .selectFrom("master.payment_method as pm")
        .select(["pm.id", "pm.code", "pm.name", "pm.direction"])
        .where("pm.tenant_id", "=", tenantId)
        .where("pm.is_active", "=", true)
        .where((eb) => eb.or([
          eb("pm.direction", "=", "INBOUND"),
          eb("pm.direction", "=", "BOTH"),
        ]))
        .orderBy("pm.name", "asc")
        .execute() as Array<{ id: string; code: string; name: string; direction: string }>;

      res.json({ items: methods });
    } catch (err) {
      logger?.error("finance_ar_payment_methods_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── POST /api/finance/ap/invoices ─────────────────────────────────────────
  router.post("/finance/ap/invoices", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const { status, body: respBody } = await handleCreateApInvoice(
        db, tenantId, principalId,
        body as unknown as Parameters<typeof handleCreateApInvoice>[3],
        logger,
      );
      res.status(status).json(respBody);
    } catch (err) {
      logger?.error("finance_ap_invoice_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── PATCH /api/finance/ap/invoices/:id ────────────────────────────────────
  router.patch("/finance/ap/invoices/:id", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const invoiceId = String(req.params["id"] ?? "");
      if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;

      // Verify invoice exists + is editable
      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .select(["pi.id", "pi.status"])
        .where("pi.id",        "=", invoiceId)
        .where("pi.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string; status: string } | undefined;

      if (!invoice) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }
      if (!["draft", "proforma"].includes(invoice.status)) {
        res.status(422).json({ error: "NOT_EDITABLE", message: `Invoice is in '${invoice.status}' and cannot be edited` });
        return;
      }

      const body   = (req.body ?? {}) as Record<string, unknown>;
      const now    = new Date();

      // ── Concurrency guard: lease_plus_version (optional rollout) ─────────────
      // purchase_invoice uses optional rollout: enforced only when client sends lock_token.
      const lockToken       = typeof body["lock_token"]          === "string" ? body["lock_token"]          : null;
      const expectedVersion = typeof body["expected_row_version"] === "number" ? body["expected_row_version"] : null;

      if (lockToken && principalId) {
        const lockCheck = await verifyLock(db, { tenantId, entityName: "purchase_invoice", recordId: invoiceId, lockedBy: principalId, lockToken });
        if (!lockCheck.valid) {
          const httpStatus = lockCheck.reason === "expired" ? 410 : 423;
          res.status(httpStatus).json({ error: lockCheck.reason === "expired" ? "LOCK_EXPIRED" : "LOCK_INVALID", reason: lockCheck.reason });
          return;
        }
        if (expectedVersion !== null) {
          const vRow = await db
            .selectFrom("document.purchase_invoice as pi" as never)
            .select("pi.row_version" as never)
            .where("pi.id" as never,        "=" as never, invoiceId as never)
            .where("pi.tenant_id" as never, "=" as never, tenantId  as never)
            .executeTakeFirst() as { row_version: number } | undefined;
          if (vRow && vRow.row_version !== expectedVersion) {
            res.status(409).json({ error: "VERSION_CONFLICT", message: "Document was modified by another user. Reload and try again.", current_version: vRow.row_version });
            return;
          }
        }
      }
      // ── end concurrency guard ─────────────────────────────────────────────────

      const ALLOWED = [
        "description",
        "supplier_invoice_number", "supplier_invoice_date",
        "document_date", "posting_date", "received_date",
        "payment_term_id", "payment_method_id",
        "commitment_id", "budget_allocation_id",
        "notes", "tags", "tax_mode", "tax_mode_source",
        "freight_amount", "misc_charges_amount", "discount_amount",
        "retention_pct", "retention_amount",
        "cost_center_id", "profit_center_id", "project_id", "site_id", "dimension_set_id",
      ];
      const updates: Record<string, unknown> = { updated_at: now, updated_by: principalId };
      for (const key of ALLOWED) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          updates[key] = body[key] ?? null;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await (db.updateTable("document.purchase_invoice" as any) as any)
        .set(updates)
        .where("id",        "=", invoiceId)
        .where("tenant_id", "=", tenantId)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!updated) { res.status(409).json({ error: "CONFLICT" }); return; }
      res.json({ ok: true, record: updated });
    } catch (err) {
      logger?.error("finance_ap_invoice_patch_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── POST /api/finance/ap/invoices/:id/lines ───────────────────────────────
  router.post("/finance/ap/invoices/:id/pricing-components", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const invoiceId = String(req.params["id"] ?? "");
      if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap_invoice_pc:create:${tenantId}:${sub}`, 30, 60)) return;
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .select(["pi.id", "pi.status", "pi.currency_code", "pi.base_currency_code", "pi.exchange_rate"])
        .where("pi.id",        "=", invoiceId)
        .where("pi.tenant_id", "=", tenantId)
        .executeTakeFirst() as InvoiceForPricingComponent | undefined;
      if (!invoice) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

      const parsed = parsePricingComponentRequest(req.body, invoice);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error, message: parsed.message });
        return;
      }

      if (parsed.value.input.source_line_id) {
        const line = await db
          .selectFrom("document.purchase_invoice_line as pil")
          .select("pil.id")
          .where("pil.id", "=", parsed.value.input.source_line_id)
          .where("pil.purchase_invoice_id", "=", invoiceId)
          .where("pil.tenant_id", "=", tenantId)
          .executeTakeFirst();
        if (!line) { res.status(404).json({ error: "LINE_NOT_FOUND" }); return; }
      }

      const legacyReplaceRequest: PricingComponentSupersedeBlock | null = parsed.value.supersede;
      if (legacyReplaceRequest) {
        res.status(422).json({
          error: "CHILD_NOT_EDITABLE",
          message: `Invoice is in '${invoice.status}'. Pricing changes must be made while the invoice is draft/proforma; request revision or reopen to draft before replacing pricing components.`,
        });
        return;
      }

      // Gates derived from the canonical PC affordance matrix
      // (@athyper/api-contracts/pc-affordance-matrix). canAdd controls
      // create-new; canSupersede controls v1→v2 chain writes. Replaces
      // the legacy PC_MUTABLE_STATUSES / PC_SUPERSEDE_STATUSES set lookups
      // so client UI + server gates + DB trigger all read the same matrix.
      if (!parsed.value.supersede && !canPcAction(invoice.status, "canAdd")) {
        res.status(422).json({
          error: "NOT_EDITABLE",
          message: `Invoice is in '${invoice.status}' and cannot accept new pricing components.`,
        });
        return;
      }
      if (parsed.value.supersede && !canPcAction(invoice.status, "canSupersede")) {
        res.status(422).json({
          error: "NOT_EDITABLE",
          message: `Invoice is in '${invoice.status}' and pricing components are read-only; request revision or reopen to draft before replacing pricing components.`,
        });
        return;
      }

      if (!parsed.value.supersede) {
        const id = await createComponent(db, tenantId, principalId, parsed.value.input);

        // Auto-apportion header-scope PCs to line children (v3.1 Phase 5i).
        // Without this, a header PC sits orphaned with `is_apportioned=false`
        // and zero children, and the breakup view shows "0 lines · short
        // MYR X" for every header charge — exactly the user-visible bug.
        // Skip when:
        //   - PC is line-scope (no apportion concept)
        //   - basis is unsupported ('weight' raises in the service) or unset
        // Degenerate-basis errors (PC_APPORTION_DEGENERATE_BASIS — value/
        // quantity with sum-of-basis = 0) surface as 422 so the user can
        // pick a different basis. The orphaned header PC stays in place;
        // the user can delete it from the strip or retry by superseding.
        const input = parsed.value.input;
        const needsApportionment =
          input.entry_level === "header"
          && input.apportion_basis != null
          && input.apportion_basis !== "weight";
        if (needsApportionment) {
          try {
            await apportionToLines(db, {
              tenantId,
              headerPcId: id,
              actor:      principalId,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith("PC_APPORTION_DEGENERATE_BASIS")) {
              res.status(422).json({
                error:   "PC_APPORTION_DEGENERATE_BASIS",
                message: msg.replace(/^PC_APPORTION_DEGENERATE_BASIS:\s*/, ""),
              });
              return;
            }
            throw err;
          }
        }

        res.status(201).json({ ok: true, created: { id } });
        return;
      }

      const oldPc = await db
        .selectFrom("document.pricing_component as pc")
        .select(["pc.id", "pc.row_version", "pc.source_doc_id", "pc.superseded_by_id", "pc.entry_level"])
        .where("pc.id", "=", parsed.value.supersede.id)
        .where("pc.tenant_id", "=", tenantId)
        .executeTakeFirst() as {
          id: string;
          row_version: string | number;
          source_doc_id: string;
          superseded_by_id: string | null;
          entry_level: string;
        } | undefined;
      if (!oldPc || oldPc.source_doc_id !== invoiceId) {
        res.status(404).json({ error: "PRICING_COMPONENT_NOT_FOUND" });
        return;
      }
      if (oldPc.superseded_by_id) {
        res.status(409).json({ error: "LEGACY_REPLACED_ROW", message: "This pricing component is a legacy replaced row." });
        return;
      }
      if (
        parsed.value.supersede.expectedVersion != null
        && String(oldPc.row_version) !== String(parsed.value.supersede.expectedVersion)
      ) {
        res.status(409).json({
          error: "VERSION_CONFLICT",
          message: "Another user edited this component while you were drafting. Reload and try again.",
          current_version: oldPc.row_version,
        });
        return;
      }

      const result = await supersedeComponent(
        db,
        tenantId,
        principalId,
        parsed.value.supersede.id,
        parsed.value.input,
      );

      // Phase 5j supersede re-apportionment.
      //
      // When the superseded PC (v1) was header-scope, its line-scope
      // children (rows with is_apportioned_from_id = v1.id) are now
      // stale — v2 is the active row and needs its own children. We:
      //   1. Bulk-DELETE v1's children. DELETE bypasses the
      //      fn_pc_supersede_only_update trigger (UPDATE-only), so this
      //      works in approval-stream statuses too. v1 itself stays as
      //      the supersession audit anchor.
      //   2. Refresh PIL caches — child deletions zero out the per-line
      //      discount/tax/withholding/retention amounts that were
      //      derived from v1.
      //   3. If v2 is also header-scope with a valid basis, run
      //      apportionToLines on v2 (which adds its own internal
      //      refresh after the bulk INSERT).
      //
      // Skip when v1 was line-scope (no children to delete) — only
      // header-scope PCs apportion.
      if (oldPc.entry_level === "header") {
        await sql`
          DELETE FROM document.pricing_component
           WHERE tenant_id              = ${tenantId}::uuid
             AND is_apportioned_from_id = ${oldPc.id}::uuid
        `.execute(db);
        await sql`
          SELECT document.refresh_invoice_amounts_from_pc(
            ${tenantId}::uuid,
            ${invoiceId}::uuid
          )
        `.execute(db);
      }

      const newInput = parsed.value.input;
      const needsApportionment =
        newInput.entry_level === "header"
        && newInput.apportion_basis != null
        && newInput.apportion_basis !== "weight";
      if (needsApportionment) {
        try {
          await apportionToLines(db, {
            tenantId,
            headerPcId: result.newId,
            actor:      principalId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith("PC_APPORTION_DEGENERATE_BASIS")) {
            res.status(422).json({
              error:   "PC_APPORTION_DEGENERATE_BASIS",
              message: msg.replace(/^PC_APPORTION_DEGENERATE_BASIS:\s*/, ""),
            });
            return;
          }
          throw err;
        }
      }

      res.status(200).json({
        ok: true,
        created: { id: result.newId },
        superseded: { id: result.oldId },
      });
    } catch (err) {
      logger?.error("finance_ap_invoice_pricing_component_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── PATCH /api/finance/ap/invoices/:id/pricing-components/:pcId ──────────────
  //
  // In-place edit of a manually-added pricing component while the parent
  // invoice is in a mutable status (draft / rejected / proforma). Used by
  // the draft-mode Edit affordance instead of supersession because
  // supersession in draft creates a confusing v1 / v2 chain with no audit
  // value (the row has never been approved or posted).
  //
  // Gates mirror the create + supersede + delete siblings:
  //   - invoice exists in the tenant
  //   - invoice.status ∈ PC_MUTABLE_STATUSES (draft / rejected / proforma)
  //   - PC exists, belongs to this invoice, isn't already superseded
  //   - PC.origin === 'manual' — inherited / system rows must be replaced via supersede
  //
  // Approval-stream statuses (pending_approval / approved / on_hold)
  // continue to use the POST + supersede path; the supersede-only trigger
  // on the table prevents in-place edits in those states anyway.
  router.patch("/finance/ap/invoices/:id/pricing-components/:pcId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const invoiceId = String(req.params["id"] ?? "");
      const pcId      = String(req.params["pcId"] ?? "");
      if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      if (!isUuid(pcId))      { res.status(400).json({ error: "INVALID_PC_ID" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap_invoice_pc:update:${tenantId}:${sub}`, 30, 60)) return;
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .select(["pi.id", "pi.status", "pi.currency_code", "pi.base_currency_code", "pi.exchange_rate"])
        .where("pi.id",        "=", invoiceId)
        .where("pi.tenant_id", "=", tenantId)
        .executeTakeFirst() as InvoiceForPricingComponent | undefined;
      if (!invoice) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

      if (!canPcAction(invoice.status, "canEdit")) {
        res.status(422).json({
          error:   "NOT_EDITABLE",
          message: `Invoice is in '${invoice.status}' and pricing components are read-only. Request revision or reopen to draft before changing pricing.`,
        });
        return;
      }

      const pc = await db
        .selectFrom("document.pricing_component as pc")
        .select(["pc.id", "pc.source_doc_id", "pc.origin", "pc.superseded_by_id", "pc.entry_level"])
        .where("pc.id",        "=", pcId)
        .where("pc.tenant_id", "=", tenantId)
        .executeTakeFirst() as {
          id: string;
          source_doc_id: string;
          origin: string;
          superseded_by_id: string | null;
          entry_level: string;
        } | undefined;
      if (!pc || pc.source_doc_id !== invoiceId) {
        res.status(404).json({ error: "PRICING_COMPONENT_NOT_FOUND" });
        return;
      }
      if (pc.superseded_by_id) {
        res.status(409).json({
          error:   "LEGACY_REPLACED_ROW",
          message: "This is a legacy replaced pricing component row and cannot be edited.",
        });
        return;
      }
      if (pc.origin !== "manual") {
        res.status(422).json({
          error:   "UPDATE_NOT_ALLOWED_FOR_ORIGIN",
          message: `Pricing components with origin '${pc.origin}' cannot be edited directly. Change the source/default and recalculate pricing.`,
        });
        return;
      }

      const parsed = parsePricingComponentRequest(req.body, invoice);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error, message: parsed.message });
        return;
      }
      if (parsed.value.supersede) {
        res.status(400).json({
          error: "INVALID_REQUEST",
          message: "PATCH does not accept legacy replacement-chain blocks. Pricing edits are parent-gated draft changes.",
        });
        return;
      }

      const result = await updateComponentInPlace(
        db,
        tenantId,
        principalId,
        pcId,
        invoiceId,
        parsed.value.input,
      );

      // Phase 5j PATCH re-apportionment.
      //
      // If the row WAS header-scope, its existing children are stale —
      // basis / computed_amount / apportion_basis may have changed and
      // the old per-line splits no longer match. Wipe them. The deletes
      // automatically re-arm `apportionToLines`'s idempotency check (it
      // queries for children existence — gone now), so no separate
      // flag reset is needed.
      //
      // Trade-off: this throws away any per-line manual overrides that
      // pointed at children of this PC. Acceptable for v3.1 because:
      //   - Overrides are a separate row (origin='manual', no
      //     is_apportioned_from_id) and survive the delete
      //   - The audit story is captured in the PC's row_version + the
      //     updated_at/by columns updateComponentInPlace already wrote
      // If field-level overrides on the apportionment children become
      // important, switch to a diff-based update later.
      if (pc.entry_level === "header") {
        await sql`
          DELETE FROM document.pricing_component
           WHERE tenant_id              = ${tenantId}::uuid
             AND is_apportioned_from_id = ${pcId}::uuid
        `.execute(db);
      }

      const newInput = parsed.value.input;
      const needsApportionment =
        newInput.entry_level === "header"
        && newInput.apportion_basis != null
        && newInput.apportion_basis !== "weight";
      if (needsApportionment) {
        try {
          await apportionToLines(db, {
            tenantId,
            headerPcId: pcId,
            actor:      principalId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith("PC_APPORTION_DEGENERATE_BASIS")) {
            res.status(422).json({
              error:   "PC_APPORTION_DEGENERATE_BASIS",
              message: msg.replace(/^PC_APPORTION_DEGENERATE_BASIS:\s*/, ""),
            });
            return;
          }
          throw err;
        }
      } else if (pc.entry_level === "header") {
        // Children were deleted but no new apportionment will run (e.g.,
        // user changed entry_level to 'line' or removed the basis). The
        // updateComponentInPlace refresh already ran but the subsequent
        // DELETE invalidated PIL flat amounts again — refresh once more.
        await sql`
          SELECT document.refresh_invoice_amounts_from_pc(
            ${tenantId}::uuid,
            ${invoiceId}::uuid
          )
        `.execute(db);
      }

      res.status(200).json({ ok: true, updated: { id: result.id } });
    } catch (err) {
      logger?.error("finance_ap_invoice_pricing_component_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── DELETE /api/finance/ap/invoices/:id/pricing-components/:pcId ─────────────
  //
  // Hard-delete a manually-added pricing component on a mutable invoice.
  // The generic records API blocks delete on `pricing_component` (the table
  // is audit-tracked); this dedicated route enforces the same gates as the
  // create + supersede sibling and runs the raw DELETE via the
  // `deleteComponent` business helper.
  //
  // Gates:
  //   - invoice exists in the tenant
  //   - invoice.status is in PC_MUTABLE_STATUSES (draft / rejected / proforma)
  //   - PC exists, belongs to this invoice, isn't already superseded
  //   - PC.origin === 'manual' — inherited / vendor_default / system_resolved
  //     rows are denied; replace them via supersede instead
  router.delete("/finance/ap/invoices/:id/pricing-components/:pcId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const invoiceId = String(req.params["id"] ?? "");
      const pcId      = String(req.params["pcId"] ?? "");
      if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      if (!isUuid(pcId))      { res.status(400).json({ error: "INVALID_PC_ID" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap_invoice_pc:delete:${tenantId}:${sub}`, 30, 60)) return;
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const invoice = await db
        .selectFrom("document.purchase_invoice as pi")
        .select(["pi.id", "pi.status"])
        .where("pi.id",        "=", invoiceId)
        .where("pi.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string; status: string } | undefined;
      if (!invoice) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

      if (!canPcAction(invoice.status, "canDelete")) {
        res.status(422).json({
          error:   "NOT_DELETABLE",
          message: `Invoice is in '${invoice.status}' and pricing components are read-only. Request revision or reopen to draft before changing pricing.`,
        });
        return;
      }

      const pc = await db
        .selectFrom("document.pricing_component as pc")
        .select(["pc.id", "pc.source_doc_id", "pc.origin", "pc.superseded_by_id"])
        .where("pc.id",        "=", pcId)
        .where("pc.tenant_id", "=", tenantId)
        .executeTakeFirst() as {
          id: string;
          source_doc_id: string;
          origin: string;
          superseded_by_id: string | null;
        } | undefined;
      if (!pc || pc.source_doc_id !== invoiceId) {
        res.status(404).json({ error: "PRICING_COMPONENT_NOT_FOUND" });
        return;
      }
      if (pc.superseded_by_id) {
        res.status(409).json({
          error:   "LEGACY_REPLACED_ROW",
          message: "This is a legacy replaced pricing component row and cannot be deleted directly.",
        });
        return;
      }
      if (pc.origin !== "manual") {
        res.status(422).json({
          error:   "DELETE_NOT_ALLOWED_FOR_ORIGIN",
          message: `Pricing components with origin '${pc.origin}' cannot be deleted directly. Change the source/default and recalculate pricing.`,
        });
        return;
      }

      await deleteComponent(db, tenantId, principalId, pcId, invoiceId);
      res.status(200).json({ ok: true, deleted: { id: pcId } });
    } catch (err) {
      logger?.error("finance_ap_invoice_pricing_component_delete_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── GET /api/finance/ap/invoices/:id/pricing-components/apportionment-summary ──
  //
  // v3.1 Phase 6 — bulk aggregate hydration for the HeaderScopePcStrip.
  //
  // Returns one summary row per header-scope PC on the invoice:
  //   { header_pc_id, line_count, override_count, balance_gap,
  //     allocated_sum, computed_at }
  //
  // Replaces the client-side aggregation that re-derived these from the
  // full line-scope PC slice on every render. The strip surface fetches
  // this once on mount and indexes by header_pc_id; badges on each
  // collapsed row read from the map.
  //
  // `balance_gap` = parent.computed_amount − Σ child.computed_amount.
  // Non-zero means rounding drift (typical: ±0.01..0.02) OR genuine
  // un-apportioned remainder. Zero when the header was never apportioned
  // (no children) — caller can distinguish via `line_count = 0`.
  //
  // `computed_at` = GREATEST(parent.updated_at, MAX(child.updated_at))
  // with a COALESCE on `updated_at` → `created_at` for freshly-INSERTed
  // rows that haven't been updated yet.
  router.get(
    "/finance/ap/invoices/:id/pricing-components/apportionment-summary",
    (async (req, res, next) => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;
        const { xOrg, xRealm } = extractOrgHeaders(req);
        const tenantId = await resolveTenantId(db, xOrg, xRealm);
        if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

        const invoiceId = String(req.params["id"] ?? "");
        if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

        const invoice = await db
          .selectFrom("document.purchase_invoice as pi")
          .select(["pi.id"])
          .where("pi.id",        "=", invoiceId)
          .where("pi.tenant_id", "=", tenantId)
          .executeTakeFirst() as { id: string } | undefined;
        if (!invoice) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

        // One round-trip: header PCs LEFT JOIN their children LEFT JOIN
        // matching line-scope manual overrides. Override match = same
        // condition_type_id on the same source_line_id (matches the
        // client projection's override resolution rule).
        const result = await sql<{
          header_pc_id:    string;
          line_count:      string;
          override_count:  string;
          balance_gap:     string;
          allocated_sum:   string;
          computed_at:     string | null;
        }>`
          WITH headers AS (
            SELECT pc.id,
                   pc.computed_amount,
                   COALESCE(pc.updated_at, pc.created_at) AS ts
              FROM document.pricing_component pc
             WHERE pc.tenant_id       = ${tenantId}::uuid
               AND pc.source_doc_id   = ${invoiceId}::uuid
               AND pc.source_line_id IS NULL
               AND pc.superseded_by_id IS NULL
          ),
          children AS (
            SELECT pc.is_apportioned_from_id      AS header_id,
                   pc.source_line_id,
                   pc.condition_type_id,
                   pc.computed_amount,
                   COALESCE(pc.updated_at, pc.created_at) AS ts
              FROM document.pricing_component pc
             WHERE pc.tenant_id              = ${tenantId}::uuid
               AND pc.source_doc_id          = ${invoiceId}::uuid
               AND pc.is_apportioned_from_id IS NOT NULL
               AND pc.superseded_by_id       IS NULL
          ),
          overrides AS (
            SELECT pc.source_line_id, pc.condition_type_id
              FROM document.pricing_component pc
             WHERE pc.tenant_id              = ${tenantId}::uuid
               AND pc.source_doc_id          = ${invoiceId}::uuid
               AND pc.source_line_id IS NOT NULL
               AND pc.is_apportioned_from_id IS NULL
               AND pc.origin                 = 'manual'
               AND pc.superseded_by_id       IS NULL
          )
          SELECT h.id::text                                                                          AS header_pc_id,
                 COUNT(c.source_line_id)::text                                                       AS line_count,
                 COUNT(o.source_line_id)::text                                                       AS override_count,
                 (h.computed_amount - COALESCE(SUM(c.computed_amount), 0))::text                     AS balance_gap,
                 COALESCE(SUM(c.computed_amount), 0)::text                                           AS allocated_sum,
                 GREATEST(h.ts, MAX(c.ts))                                                           AS computed_at
            FROM headers h
            LEFT JOIN children c
              ON c.header_id = h.id
            LEFT JOIN overrides o
              ON o.source_line_id    = c.source_line_id
             AND o.condition_type_id = c.condition_type_id
           GROUP BY h.id, h.computed_amount, h.ts
           ORDER BY h.id
        `.execute(db);

        res.json({
          summaries: result.rows.map((row) => ({
            header_pc_id:    row.header_pc_id,
            line_count:      parseInt(row.line_count,     10),
            override_count:  parseInt(row.override_count, 10),
            balance_gap:     row.balance_gap,
            allocated_sum:   row.allocated_sum,
            computed_at:     row.computed_at,
          })),
        });
      } catch (err) {
        logger?.error("finance_ap_invoice_apportionment_summary_error", { err: String(err) });
        next(err);
      }
    }) as RequestHandler,
  );


  // ── GET /api/finance/ap/invoices/:id/pricing-components/line-rollup ──
  //
  // v3.1 Phase 6b — line-scope component rollup for the unified Components
  // view. Groups user-entered line-scope PCs by condition_type_id so the
  // strip can render "VAT — Zero Rated · ← from 3 lines · MYR 351.00" as
  // a single read-only summary row alongside header-scope entries.
  //
  // Filtered to:
  //   - source_line_id IS NOT NULL          (line-scope only)
  //   - is_apportioned_from_id IS NULL      (NOT header apportionment children
  //                                          — those already render via the
  //                                          header row's APPORTIONMENT cell)
  //   - origin = 'manual'                   (user-entered, not derived)
  //   - superseded_by_id IS NULL            (active rows only)
  //
  // BASIS handling: returns the common `rate_value` when uniform across all
  // contributing lines, NULL when they vary. The client renders "varies"
  // for null rates.
  router.get(
    "/finance/ap/invoices/:id/pricing-components/line-rollup",
    (async (req, res, next) => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;
        const { xOrg, xRealm } = extractOrgHeaders(req);
        const tenantId = await resolveTenantId(db, xOrg, xRealm);
        if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

        const invoiceId = String(req.params["id"] ?? "");
        if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

        const invoice = await db
          .selectFrom("document.purchase_invoice as pi")
          .select(["pi.id"])
          .where("pi.id",        "=", invoiceId)
          .where("pi.tenant_id", "=", tenantId)
          .executeTakeFirst() as { id: string } | undefined;
        if (!invoice) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

        const result = await sql<{
          condition_type_id:    string;
          condition_type_label: string | null;
          condition_type_code:  string | null;
          term_type:            string;
          line_count:           string;
          rate_value:           string | null;
          amount:               string;
          line_ids:             string[];
        }>`
          SELECT
            pc.condition_type_id::text                                AS condition_type_id,
            ct.name                                                   AS condition_type_label,
            ct.code                                                   AS condition_type_code,
            MAX(pc.term_type)                                         AS term_type,
            COUNT(*)::text                                            AS line_count,
            CASE WHEN COUNT(DISTINCT pc.rate_value) > 1 THEN NULL
                 ELSE MAX(pc.rate_value)::text END                    AS rate_value,
            COALESCE(SUM(pc.computed_amount), 0)::text                AS amount,
            ARRAY_AGG(pc.source_line_id::text ORDER BY pc.source_line_id) AS line_ids
            FROM document.pricing_component pc
            LEFT JOIN master.condition_type ct
                   ON ct.id = pc.condition_type_id
                  AND (ct.tenant_id = pc.tenant_id OR ct.tenant_id IS NULL)
           WHERE pc.tenant_id              = ${tenantId}::uuid
             AND pc.source_doc_id          = ${invoiceId}::uuid
             AND pc.source_line_id         IS NOT NULL
             AND pc.is_apportioned_from_id IS NULL
             AND pc.origin                 = 'manual'
             AND pc.superseded_by_id       IS NULL
           GROUP BY pc.condition_type_id, ct.name, ct.code
           ORDER BY MIN(pc.sequence), ct.name
        `.execute(db);

        res.json({
          rollups: result.rows.map((row) => ({
            condition_type_id:    row.condition_type_id,
            condition_type_label: row.condition_type_label,
            condition_type_code:  row.condition_type_code,
            term_type:            row.term_type,
            line_count:           parseInt(row.line_count, 10),
            rate_value:           row.rate_value,
            amount:               row.amount,
            line_ids:             row.line_ids ?? [],
          })),
        });
      } catch (err) {
        logger?.error("finance_ap_invoice_line_rollup_error", { err: String(err) });
        next(err);
      }
    }) as RequestHandler,
  );


  // ── GET /api/finance/ap/invoices/:id/pricing-components/:pcId/apportionment ──
  //
  // v3.1 Phase 4 — the breakup drawer's backing route.
  //
  // Returns the per-line apportionment of a header-scope PC: one row per
  // PIL the PC apportioned to, with the allocated amount + optional
  // override + the basis value used. The drawer is the audit view that
  // replaces the inline 500-row expansion (which collapses to summary-only
  // in Phase 2). Paginated so a 10,000-line invoice doesn't push 10k rows
  // into the BFF response.
  //
  // Pagination is cursor-based on `(line_no, pil_id)` — both immutable per
  // invoice, so no float drift, no skipped-row edge cases when concurrent
  // writes land. Cursor is opaque base64 of the last-emitted tuple.
  //
  // Filtering:
  //   - tab=all         (default) — every PIL the PC touched
  //   - tab=overrides   only PILs with a manual override
  //   - tab=top         not yet supported (Phase 4b adds "Top by basis value")
  //
  // Response shape:
  //   {
  //     header_pc: { term_type, condition_type_label, apportion_basis,
  //                  computed_amount },
  //     rows: [
  //       { pil_id, line_no, item_description, basis_value,
  //         allocated_amount, override_amount, is_overridden }
  //     ],
  //     next_cursor: string | null,
  //     summary: { total_lines, override_count, allocated_sum }
  //   }
  router.get(
    "/finance/ap/invoices/:id/pricing-components/:pcId/apportionment",
    (async (req, res, next) => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;
        const { xOrg, xRealm } = extractOrgHeaders(req);
        const tenantId = await resolveTenantId(db, xOrg, xRealm);
        if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

        const invoiceId = String(req.params["id"]   ?? "");
        const pcId      = String(req.params["pcId"] ?? "");
        if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" });    return; }
        if (!isUuid(pcId))      { res.status(400).json({ error: "INVALID_PC_ID" }); return; }

        // Validate tenant + invoice ownership in one query
        const invoice = await db
          .selectFrom("document.purchase_invoice as pi")
          .select(["pi.id"])
          .where("pi.id",        "=", invoiceId)
          .where("pi.tenant_id", "=", tenantId)
          .executeTakeFirst() as { id: string } | undefined;
        if (!invoice) { res.status(404).json({ error: "INVOICE_NOT_FOUND" }); return; }

        // Fetch parent PC for the response header. condition_type_label is
        // pulled from master.condition_type via a left join — non-fatal if
        // the label is missing, the client falls back to the code.
        const headerPc = await sql<{
          id:                       string;
          term_type:                string;
          apportion_basis:          string | null;
          computed_amount:          string;
          is_apportioned:           boolean;
          superseded_by_id:         string | null;
          condition_type_code:      string | null;
          condition_type_label:     string | null;
        }>`
          SELECT pc.id, pc.term_type, pc.apportion_basis, pc.computed_amount,
                 pc.is_apportioned, pc.superseded_by_id,
                 ct.code  AS condition_type_code,
                 ct.name  AS condition_type_label
            FROM document.pricing_component pc
            LEFT JOIN master.condition_type ct
                   ON ct.id = pc.condition_type_id
                  AND (ct.tenant_id = pc.tenant_id OR ct.tenant_id IS NULL)
           WHERE pc.id              = ${pcId}::uuid
             AND pc.tenant_id       = ${tenantId}::uuid
             AND pc.source_doc_id   = ${invoiceId}::uuid
             AND pc.source_line_id IS NULL
        `.execute(db);

        const headerRow = headerPc.rows[0];
        if (!headerRow) {
          res.status(404).json({ error: "HEADER_PC_NOT_FOUND" });
          return;
        }
        if (headerRow.superseded_by_id) {
          res.status(409).json({ error: "HEADER_PC_SUPERSEDED" });
          return;
        }

        // ── CSV export branch (v3.1 Phase 5c) ─────────────────────────
        //
        // Gated by `purchase_invoice.export` (or any permission_code
        // ending in `.export` on an enabled entity_operation row for
        // `purchase_invoice`). The check mirrors the records-export
        // gate; without `checkPermissionBatch` wired in, it fail-closes
        // to 403 — same as records.
        //
        // CSV ignores `cursor` + `limit` so the user gets a single
        // self-contained file. A hard 10k row cap protects against
        // pathological invoices. `tab=overrides` is honored so users
        // can export only the override slice when auditing exceptions.
        if (req.query["format"] === "csv") {
          const sub = typeof claims.sub === "string" ? claims.sub : "";
          const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
          if (!principalId) {
            res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" });
            return;
          }
          const allowed = await isEntityOperationAllowed(
            db,
            "purchase_invoice",
            "export",
            tenantId,
            principalId,
            checkPermissionBatch,
          );
          if (!allowed) {
            res.status(403).json({
              error:   "EXPORT_FORBIDDEN",
              message: "Your role does not include permission to export apportionment data.",
            });
            return;
          }

          const tabCsv           = parseApportionmentTab(req.query["tab"]);
          const overridesOnlyCsv = tabCsv === "overrides";
          const isTopTabCsv      = tabCsv === "top";
          // Same search semantics as the JSON branch — an auditor who
          // filters on screen + clicks CSV gets the filtered result set
          // in the file.
          const queryFilterCsv = parseApportionmentQuery(req.query["q"]);
          const qIsTextCsv     = queryFilterCsv.kind === "text";
          const qIsLineNoCsv   = queryFilterCsv.kind === "line_no";
          const qTextCsv       = qIsTextCsv   ? queryFilterCsv.value : "";
          const qLineNoCsv     = qIsLineNoCsv ? queryFilterCsv.value : -1;
          // CSV honors the active tab including 'top' so the file's row
          // order matches what the user sees on screen. No cursor — CSV
          // returns the full result set up to APPORTIONMENT_CSV_MAX_ROWS.
          const basisExprCsv = sql`
            CASE
              WHEN ${headerRow.apportion_basis} = 'quantity' THEN pil.quantity
              WHEN ${headerRow.apportion_basis} = 'equal'    THEN 1
              ELSE pil.net_amount
            END
          `;
          const orderByCsv = isTopTabCsv
            ? sql`${basisExprCsv} DESC, pil.id ASC`
            : sql`pil.line_no, pil.id`;
          const csvRowsResult = await sql<{
            line_no:           number;
            item_description:  string;
            basis_value:       string;
            allocated_amount:  string;
            override_amount:   string | null;
          }>`
            WITH apportioned AS (
              SELECT pc.id, pc.source_line_id, pc.computed_amount, pc.condition_type_id
                FROM document.pricing_component pc
               WHERE pc.tenant_id              = ${tenantId}::uuid
                 AND pc.is_apportioned_from_id = ${pcId}::uuid
                 AND pc.superseded_by_id       IS NULL
            ),
            overrides AS (
              SELECT pc.source_line_id, pc.condition_type_id,
                     pc.computed_amount AS override_amount
                FROM document.pricing_component pc
               WHERE pc.tenant_id              = ${tenantId}::uuid
                 AND pc.source_doc_id          = ${invoiceId}::uuid
                 AND pc.source_line_id IS NOT NULL
                 AND pc.is_apportioned_from_id IS NULL
                 AND pc.origin                 = 'manual'
                 AND pc.superseded_by_id       IS NULL
            )
            SELECT pil.line_no,
                   pil.item_description,
                   CASE
                     WHEN ${headerRow.apportion_basis} = 'quantity' THEN pil.quantity::text
                     WHEN ${headerRow.apportion_basis} = 'equal'    THEN '1'
                     ELSE pil.net_amount::text
                   END                                AS basis_value,
                   a.computed_amount::text            AS allocated_amount,
                   o.override_amount::text            AS override_amount
              FROM apportioned a
              JOIN document.purchase_invoice_line pil
                ON pil.id        = a.source_line_id
               AND pil.tenant_id = ${tenantId}::uuid
              LEFT JOIN overrides o
                ON o.source_line_id    = a.source_line_id
               AND o.condition_type_id = a.condition_type_id
             WHERE (${overridesOnlyCsv}::boolean = false OR o.override_amount IS NOT NULL)
               AND (
                 (${qIsTextCsv}::boolean = false AND ${qIsLineNoCsv}::boolean = false)
                 OR (${qIsTextCsv}::boolean = true
                     AND pil.item_description ILIKE '%' || ${qTextCsv} || '%' ESCAPE '\\')
                 OR (${qIsLineNoCsv}::boolean = true
                     AND pil.line_no = ${qLineNoCsv}::smallint)
               )
             ORDER BY ${orderByCsv}
             LIMIT ${APPORTIONMENT_CSV_MAX_ROWS}
          `.execute(db);

          const filenameSlug =
            (headerRow.condition_type_code ?? headerRow.term_type ?? "apportionment")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
            || "apportionment";
          const filename = `apportionment-${filenameSlug}-${pcId.slice(0, 8)}.csv`;

          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("Cache-Control", "no-store");

          const header = [
            "Line No", "Item Description", "Basis Value",
            "Allocated", "Override Amount", "Is Overridden",
          ].map(csvField).join(",");
          res.write(header + "\r\n");
          for (const r of csvRowsResult.rows) {
            const line = [
              r.line_no,
              r.item_description,
              r.basis_value,
              r.allocated_amount,
              r.override_amount ?? "",
              r.override_amount != null ? "true" : "false",
            ].map(csvField).join(",");
            res.write(line + "\r\n");
          }
          res.end();
          return;
        }

        // Parse pagination + filter params
        const limit = Math.min(
          100,
          Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10) || 50),
        );
        const tab       = parseApportionmentTab(req.query["tab"]);
        const rawCursor = parseApportionmentCursor(req.query["cursor"]);

        // Search query (v3.1 Phase 5e). Three boolean gates compose the
        // WHERE clause: exactly one filter fires (or none). Kysely binds
        // these as parameters so the LIKE pattern can never inject SQL.
        const queryFilter = parseApportionmentQuery(req.query["q"]);
        const qIsText     = queryFilter.kind === "text";
        const qIsLineNo   = queryFilter.kind === "line_no";
        const qText       = qIsText   ? queryFilter.value : "";
        const qLineNo     = qIsLineNo ? queryFilter.value : -1;

        // ── Tab → ordering + cursor composition (v3.1 Phase 5f) ──────
        //
        // Two ordering modes coexist:
        //   - all / overrides → ORDER BY line_no ASC, pil_id ASC
        //                       cursor kind: "line_no_asc"
        //   - top             → ORDER BY basis_value DESC, pil_id ASC
        //                       cursor kind: "basis_desc"
        //
        // The cursor's kind MUST match the active tab; mismatched cursors
        // are silently dropped (treated as first-page) since the client
        // already resets cursor on tab change.
        const isTopTab      = tab === "top";
        const overridesOnly = tab === "overrides";

        // Active cursor only when its kind matches the active tab.
        const activeCursor =
          rawCursor
          && ((isTopTab  && rawCursor.kind === "basis_desc") ||
              (!isTopTab && rawCursor.kind === "line_no_asc"))
            ? rawCursor : null;

        // basis_value expression — referenced from both ORDER BY and the
        // top-mode cursor predicate. Kept inline (vs. a subquery) so PG
        // can plan against pil.net_amount / pil.quantity directly.
        const basisExpr = sql`
          CASE
            WHEN ${headerRow.apportion_basis} = 'quantity' THEN pil.quantity
            WHEN ${headerRow.apportion_basis} = 'equal'    THEN 1
            ELSE pil.net_amount
          END
        `;

        const cursorPredicate = isTopTab
          ? (activeCursor && activeCursor.kind === "basis_desc"
              ? sql`AND (
                  ${basisExpr} < ${activeCursor.basis_value}::numeric
                  OR (${basisExpr} = ${activeCursor.basis_value}::numeric
                      AND pil.id > ${activeCursor.pil_id}::uuid)
                )`
              : sql``)
          : (() => {
              const cLineNo = activeCursor && activeCursor.kind === "line_no_asc"
                ? activeCursor.line_no : -1;
              const cPilId  = activeCursor && activeCursor.kind === "line_no_asc"
                ? activeCursor.pil_id  : "00000000-0000-0000-0000-000000000000";
              return sql`AND (pil.line_no, pil.id) > (${cLineNo}::smallint, ${cPilId}::uuid)`;
            })();

        const orderBy = isTopTab
          ? sql`${basisExpr} DESC, pil.id ASC`
          : sql`pil.line_no, pil.id`;
        const rowsResult = await sql<{
          pil_id:            string;
          line_no:           number;
          item_description:  string;
          basis_value:       string;
          allocated_amount:  string;
          override_amount:   string | null;
        }>`
          WITH apportioned AS (
            SELECT pc.id, pc.source_line_id, pc.computed_amount, pc.condition_type_id
              FROM document.pricing_component pc
             WHERE pc.tenant_id              = ${tenantId}::uuid
               AND pc.is_apportioned_from_id = ${pcId}::uuid
               AND pc.superseded_by_id       IS NULL
          ),
          overrides AS (
            SELECT pc.source_line_id, pc.condition_type_id,
                   pc.computed_amount AS override_amount
              FROM document.pricing_component pc
             WHERE pc.tenant_id              = ${tenantId}::uuid
               AND pc.source_doc_id          = ${invoiceId}::uuid
               AND pc.source_line_id IS NOT NULL
               AND pc.is_apportioned_from_id IS NULL
               AND pc.origin                 = 'manual'
               AND pc.superseded_by_id       IS NULL
          )
          SELECT pil.id        AS pil_id,
                 pil.line_no,
                 pil.item_description,
                 CASE
                   WHEN ${headerRow.apportion_basis} = 'quantity' THEN pil.quantity::text
                   WHEN ${headerRow.apportion_basis} = 'equal'    THEN '1'
                   ELSE pil.net_amount::text
                 END                                AS basis_value,
                 a.computed_amount::text            AS allocated_amount,
                 o.override_amount::text            AS override_amount
            FROM apportioned a
            JOIN document.purchase_invoice_line pil
              ON pil.id        = a.source_line_id
             AND pil.tenant_id = ${tenantId}::uuid
            LEFT JOIN overrides o
              ON o.source_line_id    = a.source_line_id
             AND o.condition_type_id = a.condition_type_id
           WHERE TRUE
             ${cursorPredicate}
             AND (${overridesOnly}::boolean = false OR o.override_amount IS NOT NULL)
             AND (
               (${qIsText}::boolean = false AND ${qIsLineNo}::boolean = false)
               OR (${qIsText}::boolean = true
                   AND pil.item_description ILIKE '%' || ${qText} || '%' ESCAPE '\\')
               OR (${qIsLineNo}::boolean = true
                   AND pil.line_no = ${qLineNo}::smallint)
             )
           ORDER BY ${orderBy}
           LIMIT ${limit + 1}
        `.execute(db);

        const allRows = rowsResult.rows;
        const hasMore = allRows.length > limit;
        const rows    = hasMore ? allRows.slice(0, limit) : allRows;

        const lastRow = rows[rows.length - 1];
        const next_cursor = (hasMore && lastRow)
          ? (isTopTab
              ? encodeApportionmentCursor({
                  kind:        "basis_desc",
                  basis_value: lastRow.basis_value,
                  pil_id:      lastRow.pil_id,
                })
              : encodeApportionmentCursor({
                  kind:    "line_no_asc",
                  line_no: lastRow.line_no,
                  pil_id:  lastRow.pil_id,
                }))
          : null;

        // Summary aggregate — independent of pagination + tab so the
        // drawer's tab badges can show absolute counts.
        const summary = await sql<{
          total_lines:    string;
          override_count: string;
          allocated_sum:  string;
        }>`
          WITH apportioned AS (
            SELECT pc.source_line_id, pc.computed_amount, pc.condition_type_id
              FROM document.pricing_component pc
             WHERE pc.tenant_id              = ${tenantId}::uuid
               AND pc.is_apportioned_from_id = ${pcId}::uuid
               AND pc.superseded_by_id       IS NULL
          ),
          overrides AS (
            SELECT pc.source_line_id, pc.condition_type_id
              FROM document.pricing_component pc
             WHERE pc.tenant_id              = ${tenantId}::uuid
               AND pc.source_doc_id          = ${invoiceId}::uuid
               AND pc.source_line_id IS NOT NULL
               AND pc.is_apportioned_from_id IS NULL
               AND pc.origin                 = 'manual'
               AND pc.superseded_by_id       IS NULL
          )
          SELECT COUNT(*)::text                                     AS total_lines,
                 COUNT(o.source_line_id)::text                      AS override_count,
                 COALESCE(SUM(a.computed_amount), 0)::text          AS allocated_sum
            FROM apportioned a
            LEFT JOIN overrides o
              ON o.source_line_id    = a.source_line_id
             AND o.condition_type_id = a.condition_type_id
        `.execute(db);

        const summaryRow = summary.rows[0] ?? {
          total_lines: "0", override_count: "0", allocated_sum: "0",
        };

        res.json({
          header_pc: {
            id:                   headerRow.id,
            term_type:            headerRow.term_type,
            condition_type_code:  headerRow.condition_type_code,
            condition_type_label: headerRow.condition_type_label,
            apportion_basis:      headerRow.apportion_basis,
            computed_amount:      headerRow.computed_amount,
          },
          rows: rows.map((r) => ({
            pil_id:            r.pil_id,
            line_no:           r.line_no,
            item_description:  r.item_description,
            basis_value:       r.basis_value,
            allocated_amount:  r.allocated_amount,
            override_amount:   r.override_amount,
            is_overridden:     r.override_amount != null,
          })),
          next_cursor,
          summary: {
            total_lines:    parseInt(summaryRow.total_lines,    10),
            override_count: parseInt(summaryRow.override_count, 10),
            allocated_sum:  summaryRow.allocated_sum,
          },
        });
      } catch (err) {
        logger?.error("finance_ap_invoice_apportionment_error", { err: String(err) });
        next(err);
      }
    }) as RequestHandler,
  );


  router.post("/finance/ap/invoices/:id/lines", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const invoiceId = String(req.params["id"] ?? "");
      if (!isUuid(invoiceId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const { status, body: respBody } = await handleAddInvoiceLine(
        db, tenantId, invoiceId, principalId,
        body as unknown as Parameters<typeof handleAddInvoiceLine>[4],
        logger,
      );

      const addedLine = (respBody as { line?: Record<string, unknown> }).line;
      const addedLineId = typeof addedLine?.["id"] === "string" ? addedLine["id"] : "";
      const hasSourceLine = Boolean(
        addedLine?.["commitment_line_id"]
        || addedLine?.["receipt_line_id"]
        || addedLine?.["service_sheet_line_id"],
      );
      if (status === 201 && principalId && addedLineId && !hasSourceLine) {
        try {
          const decision = await resolveLineClassification(
            { db, logger },
            { tenantId, principalId, invoiceId, lineId: addedLineId, mode: "save" },
          );
          res.status(status).json({ ...respBody, classification: decision });
          return;
        } catch (e) {
          logger?.error("auto_classify_added_line_error", { err: String(e), lineId: addedLineId });
        }
      }

      res.status(status).json(respBody);
    } catch (err) {
      logger?.error("finance_ap_invoice_line_add_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── PATCH /api/finance/ap/invoices/:id/lines/:lid ─────────────────────────
  router.patch("/finance/ap/invoices/:id/lines/:lid", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const invoiceId = String(req.params["id"]  ?? "");
      const lineId    = String(req.params["lid"] ?? "");
      if (!isUuid(invoiceId) || !isUuid(lineId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const { status, body: respBody } = await handleUpdateInvoiceLine(
        db, tenantId, invoiceId, lineId, principalId,
        body as unknown as Parameters<typeof handleUpdateInvoiceLine>[5],
        logger,
      );

      const classificationInputs = [
        "commodity_category_id", "business_intent_id",
        "item_id", "item_description", "metadata", "data",
        "quantity", "unit_price", "price_unit", "discount_pct",
        "tax_group_id", "withholding_tax_group_id",
        "asset_class_id",
      ];
      const shouldClassify = classificationInputs.some((key) =>
        Object.prototype.hasOwnProperty.call(body, key),
      );

      // Auto-classify when category inputs, commodity metadata, or amount drivers change.
      if (status === 200 && principalId && shouldClassify) {
        try {
          const decision = await resolveLineClassification(
            { db, logger },
            { tenantId, principalId, invoiceId, lineId, mode: "save" },
          );
          res.status(status).json({ ...respBody as object, classification: decision });
          return;
        } catch (e) {
          logger?.error("auto_classify_error", { err: String(e), lineId });
          // Fall through — return the update result without classification
        }
      }

      res.status(status).json(respBody);
    } catch (err) {
      logger?.error("finance_ap_invoice_line_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── DELETE /api/finance/ap/invoices/:id/lines/:lid ────────────────────────
  router.delete("/finance/ap/invoices/:id/lines/:lid", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const invoiceId = String(req.params["id"]  ?? "");
      const lineId    = String(req.params["lid"] ?? "");
      if (!isUuid(invoiceId) || !isUuid(lineId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;
      const lockToken = typeof (req.body as Record<string, unknown>)?.["lock_token"] === "string"
        ? (req.body as Record<string, unknown>)["lock_token"] as string
        : undefined;

      const { status, body: respBody } = await handleDeleteInvoiceLine(
        db, tenantId, invoiceId, lineId, principalId, lockToken, logger,
      );
      res.status(status).json(respBody);
    } catch (err) {
      logger?.error("finance_ap_invoice_line_delete_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // ── POST /api/finance/ap/invoices/:id/lines/:lid/classify ────────────────
  // Explicit classification trigger. Runs the intent resolution pipeline and
  // persists classification_decision on the line.
  // ?mode=preview  — run without persisting (default: save)
  router.post("/finance/ap/invoices/:id/lines/:lid/classify", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const invoiceId = String(req.params["id"]  ?? "");
      const lineId    = String(req.params["lid"] ?? "");
      if (!isUuid(invoiceId) || !isUuid(lineId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const modeParam = String(req.query["mode"] ?? "save");
      const mode = modeParam === "preview" ? "preview" : "save";

      let decision;
      try {
        decision = await resolveLineClassification(
          { db, logger },
          { tenantId, principalId, invoiceId, lineId, mode },
        );
      } catch (classifyErr: unknown) {
        if (/Line .+ not found on invoice/.test(String(classifyErr))) {
          res.status(404).json({ error: "LINE_NOT_FOUND" });
          return;
        }
        throw classifyErr;
      }

      // Fire-and-forget activity log — best effort, non-blocking
      if (mode === "save" && decision?.status) {
        const d = decision as Record<string, unknown>;
        const resolved = d["resolved"] as Record<string, unknown> | undefined;
        void appendAuditEvent(db, {
          event_code:  "record.line_classified",
          operation:   "execute",
          entity_type: "purchase_invoice_line",
          entity_id:   lineId,
          context: {
            domain:        "procurement",
            activity_type: "line_classified",
            invoice_id:    invoiceId,
            status:        d["status"],
            intent_code:   (d["selected"] as Record<string, unknown> | undefined)?.["business_intent_id"] ?? null,
            profile_id:    (d["selected"] as Record<string, unknown> | undefined)?.["profile_config_id"] ?? null,
            confidence:    resolved?.["confidence"] ?? null,
            pipeline_id:   d["pipeline_id"] ?? null,
          },
        });
      }

      res.json({ ok: true, classification: decision });
    } catch (err) {
      logger?.error("finance_ap_classify_line_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);


  // POST /api/finance/ap/invoices/draft-lines/classify
  // Draft intake lines do not have invoice/line UUIDs yet. Run the same
  // resolver in preview mode from the submitted header + line snapshot.
  router.post("/finance/ap/invoices/draft-lines/classify", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const record = body["record"] ?? body["header"] ?? {};
      const line = body["line"] ?? {};
      if (
        !record || typeof record !== "object" || Array.isArray(record) ||
        !line || typeof line !== "object" || Array.isArray(line)
      ) {
        res.status(400).json({ error: "INVALID_PAYLOAD", message: "record and line objects are required" });
        return;
      }

      const classification = await resolveDraftLineClassification(
        { db, logger },
        {
          tenantId,
          principalId,
          record: record as Record<string, unknown>,
          line: line as Record<string, unknown>,
          mode: "preview",
        },
      );

      res.json({ ok: true, classification });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/company_code_id/.test(message)) {
        res.status(422).json({ error: "MISSING_COMPANY_CODE", message });
        return;
      }
      logger?.error("finance_ap_classify_draft_line_error", { err: message });
      next(err);
    }
  }) as RequestHandler);


  // ── GET /api/finance/ap/invoices/:id/lines/suggest ────────────────────────
  // Returns up to 5 commodity-category suggestions based on a text query.
  // Query params: q (required), companyCodeId (optional, unused in Phase 1)
  router.get("/finance/ap/invoices/:id/lines/suggest", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ suggestions: [] }); return; }

      const commodityDomain = String(
        req.query["commodityDomain"] ?? req.query["domain"] ?? "",
      ).trim();
      const commodityCode = String(
        req.query["commodityCode"] ?? req.query["code"] ?? "",
      ).trim();
      const q = String(req.query["q"] ?? "").trim();
      if (!q && !(commodityDomain && commodityCode)) {
        res.json({ suggestions: [] });
        return;
      }

      const suggestions = await suggestSpendCategories(db, tenantId, q, 5, {
        commodityCode: commodityDomain && commodityCode
          ? { domain_code: commodityDomain, code: commodityCode }
          : null,
      });
      res.json({ suggestions });
    } catch (err) {
      logger?.error("finance_ap_lines_suggest_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/finance/ap/invoices/:id/revert-to-baseline ───────────────
  // Phase 12: thin wrapper around the snapshot-restore engine. Resolves the
  // most recent authoring_lock snapshot for the PI (the last "submitted"
  // baseline) and calls the engine. If the draft has never been submitted
  // there is no baseline → 422 NO_BASELINE_SNAPSHOT.
  //
  // Distinct from the per-snapshot Restore CTA on the Versions tab:
  //   /snapshots/:snapshotId/restore  — pick any historical snapshot
  //   /revert-to-baseline             — explicit "revert to last submission"
  //
  // Permission: PI.REVERT_TO_BASELINE (manager+). The route preflights the
  // status and baseline before invoking the audited restore engine.
  const revertInvoiceToBaselineHandler: RequestHandler = (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const sub = String(claims.sub ?? "");
      const id  = String(req.params["id"] ?? "");
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const workspaceCapability = req.header("X-Document-Edit-Workspace")?.trim();
      if (!workspaceCapability) {
        res.status(428).json({
          error: "WORKSPACE_REQUIRED",
          message: "Open an authorized purchase-invoice workspace before reverting to baseline.",
        });
        return;
      }
      if (req.body?.operation !== "revert_to_baseline") {
        res.status(422).json({
          error: "VALIDATION",
          message: "The operation must be 'revert_to_baseline'.",
        });
        return;
      }

      // Rate-limit — this is a heavy operation; 5 per minute per actor is
      // generous for any legitimate revision workflow.
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap:revert-to-baseline:${tenantId}:${sub}`, 5, 60)) return;

      // Resolve principal_id from JWT sub (audit FK target).
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      // Permission gate.
      const decision = await checkPermission(db, tenantId, principalId, "PI.REVERT_TO_BASELINE");
      if (!requireAllow(decision, res)) return;

      const currentResult = await sql<{ status: string }>`
        SELECT status
          FROM document.purchase_invoice
         WHERE tenant_id = ${tenantId}::uuid
           AND id = ${id}::uuid
         LIMIT 1
      `.execute(db);
      const currentStatus = currentResult.rows[0]?.status;
      if (!currentStatus) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: "Purchase invoice not found." });
        return;
      }
      if (!["draft", "rejected", "proforma"].includes(currentStatus)) {
        res.status(422).json({
          error: "STATUS_NOT_RESTORABLE",
          message: `Purchase invoice status '${currentStatus}' cannot be reverted to an authoring baseline.`,
        });
        return;
      }

      // Resolve the most recent authoring_lock snapshot for this PI. That's
      // the "last submitted baseline" the business operation restores.
      const baselineResult = await sql<{ id: string }>`
        SELECT id
          FROM snapshot.document_snapshot
         WHERE tenant_id       = ${tenantId}::uuid
           AND entity_type     = 'purchase_invoice'
           AND entity_id       = ${id}::uuid
           AND gate_event_kind = 'authoring_lock'
         ORDER BY chain_seq DESC
         LIMIT 1
      `.execute(db);
      const baselineSnapshotId = baselineResult.rows[0]?.id;
      if (!baselineSnapshotId) {
        res.status(422).json({
          error:   "NO_BASELINE_SNAPSHOT",
          message: "This invoice has never been submitted, so there is no committed baseline to restore.",
        });
        return;
      }

      // Look up the system 'restore_snapshot' reason code (same one the
      // per-snapshot restore route uses — the audit semantics are identical).
      const reasonResult = await sql<{ id: string }>`
        SELECT id
          FROM master.change_reason_code
         WHERE code      = 'restore_snapshot'
           AND status    = 'active'
           AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
         ORDER BY (tenant_id IS NOT NULL) DESC
         LIMIT 1
      `.execute(db);
      const reasonCodeId = reasonResult.rows[0]?.id;
      if (!reasonCodeId) {
        res.status(500).json({
          error:   "REASON_CODE_NOT_SEEDED",
          message: "Required system reason code 'restore_snapshot' is not present. Re-apply seed 005_change_reason_code.",
        });
        return;
      }

      try {
        const result = await restoreFromSnapshot(db, {
          tenantId,
          entityType:  "purchase_invoice",
          entityId:    id,
          snapshotId:  baselineSnapshotId,
          principalId,
          reasonCodeId,
        });
        res.json({
          ok: true,
          operation: "revert_to_baseline",
          baselineSnapshotId,
          result,
        });
      } catch (err) {
        if (err instanceof RestoreError) {
          const status = err.code === "ENTITY_LOCKED"         ? 409
            :          err.code === "STATUS_NOT_RESTORABLE"   ? 422
            :          err.code === "ENTITY_NOT_FOUND"        ? 404
            :          err.code === "SNAPSHOT_NOT_FOUND"      ? 404
            :          err.code === "SNAPSHOT_TAMPERED"       ? 500
            :          err.code === "UNSUPPORTED_ENTITY_TYPE" ? 400
            : 500;
          if (err.code === "SNAPSHOT_TAMPERED") {
            logger?.error("snapshot_restore_tamper_detected", {
              snapshot_id: baselineSnapshotId,
              entity:      "purchase_invoice",
              record_id:   id,
              tenant_id:   tenantId,
              source:      "revert_to_baseline",
              details:     err.details,
            });
          }
          res.status(status).json({
            error:   err.code,
            message: err.message,
            details: err.details,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      logger?.error("finance_ap_invoice_revert_to_baseline_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler;
  router.post("/finance/ap/invoices/:id/revert-to-baseline", revertInvoiceToBaselineHandler);
  // Compatibility alias during migration; semantics remain revert_to_baseline.
  router.post("/finance/ap/invoices/:id/discard-session", revertInvoiceToBaselineHandler);

  // ── POST /api/finance/ap/payments/:id/submit — draft → pending_approval | approved ──
  router.post("/finance/ap/payments/:id/submit", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const sub = String(claims.sub ?? "unknown");
      if (!await requirePaymentReleaseStepUp(claims, tenantId, res)) return;
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap_payments:submit:${tenantId}:${sub}`, 20, 60)) return;
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      const id = String(req.params["id"] ?? "");
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const result = await handleSubmitPayment(db, tenantId, id, principalId, businessLogger, lifecycleSync);
      res.status(result.status).json(result.body);
    } catch (err) { logger?.error("finance_ap_payment_submit_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/ap/payments/:id/post — approved → posted (creates GL JE) ──
  router.post("/finance/ap/payments/:id/post", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const sub = String(claims.sub ?? "unknown");
      if (!await requirePaymentReleaseStepUp(claims, tenantId, res)) return;
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap_payments:post:${tenantId}:${sub}`, 10, 60)) return;
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      const id = String(req.params["id"] ?? "");
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const result = await handlePostPayment(db, tenantId, id, principalId, businessLogger, lifecycleSync);
      res.status(result.status).json(result.body);
    } catch (err) { logger?.error("finance_ap_payment_post_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/ap/payments/:id/void — posted|approved|draft → voided ──
  router.post("/finance/ap/payments/:id/void", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const sub = String(claims.sub ?? "unknown");
      if (!await requirePaymentReleaseStepUp(claims, tenantId, res)) return;
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:ap_payments:void:${tenantId}:${sub}`, 10, 60)) return;
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      const id = String(req.params["id"] ?? "");
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const result = await handleVoidPayment(
        db, tenantId, id, principalId, req.body as Record<string, unknown>, businessLogger, lifecycleSync,
      );
      res.status(result.status).json(result.body);
    } catch (err) { logger?.error("finance_ap_payment_void_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/finance/ap/invoices/extract ─────────────────────────────────
  // AI-assisted invoice extraction: reads an already-uploaded attachment from
  // the AI inference log and maps it to a draft invoice payload.
  // ceiling=assist: NEVER creates the invoice — always returns a draft for user confirmation.
  //
  // Body (JSON): { attachment_id: string, company_code_id: string, invoice_source?: string }
  //
  // invoice_source stays a business-origin field (defaults to 'non_po').
  // The AI channel is stored in the returned payload as _intake_channel='ai_extracted',
  // which the caller should persist in purchase_invoice.metadata.intake_channel.
  router.post("/finance/ap/invoices/extract", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }
      const principalId = await resolvePrincipalIdOrNull(db, String(claims.sub ?? ""), tenantId, xRealm) ?? "";

      const body = req.body as {
        attachment_id?:  string;
        company_code_id?: string;
        invoice_source?: string;
      };

      if (!isUuid(body.attachment_id ?? "")) {
        res.status(400).json({ error: "MISSING_FIELD", message: "attachment_id (UUID) is required" }); return;
      }
      if (!isUuid(body.company_code_id ?? "")) {
        res.status(400).json({ error: "MISSING_FIELD", message: "company_code_id (UUID) is required" }); return;
      }

      const result = await extractInvoiceDraft(db, {
        tenantId,
        companyCodeId: body.company_code_id!,
        attachmentId:  body.attachment_id!,
        principalId,
        invoiceSource: body.invoice_source,
      });

      res.json(result);
    } catch (err) { logger?.error("finance_ap_extract_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  // ── POST /api/finance/tax/resolve ──────────────────────────────────────────
  // Phase 4: resolve tax_group for a given 4-jurisdiction context.
  //   Body: { doc_entity_code, billto/shipto/billfrom/shipfrom_jurisdiction_id,
  //           counterparty_tax_status, commodity_category_id, supplier_industry_code,
  //           doc_date, explain (boolean) }
  //   Returns: { winner: {ruleId,ruleCode,taxGroupId} | null, candidates: [...] | null }
  //   explain=true returns the full trace (used by the "Why this rule?" UI).
  router.post("/finance/tax/resolve", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "TENANT_RESOLUTION_FAILED" }); return; }

      const body = (req.body ?? {}) as {
        doc_entity_code?:           string;
        billto_jurisdiction_id?:    string | null;
        shipto_jurisdiction_id?:    string | null;
        billfrom_jurisdiction_id?:  string | null;
        shipfrom_jurisdiction_id?:  string | null;
        counterparty_tax_status?:   string | null;
        commodity_category_id?:     string | null;
        supplier_industry_code?:    string | null;
        doc_date?:                  string;
        explain?:                   boolean;
      };

      const { resolveTaxGroup, explainTaxGroupResolution } = await import(
        "@athyper/svc-business"
      );
      const ctx = {
        tenantId,
        docEntityCode:          body.doc_entity_code ?? "purchase_invoice",
        billToJurisdictionId:   body.billto_jurisdiction_id   ?? null,
        shipToJurisdictionId:   body.shipto_jurisdiction_id   ?? null,
        billFromJurisdictionId: body.billfrom_jurisdiction_id ?? null,
        shipFromJurisdictionId: body.shipfrom_jurisdiction_id ?? null,
        counterpartyTaxStatus:  body.counterparty_tax_status  ?? null,
        commodityCategoryId:    body.commodity_category_id    ?? null,
        supplierIndustryCode:   body.supplier_industry_code   ?? null,
        docDate:                body.doc_date ? new Date(body.doc_date) : new Date(),
      };

      if (body.explain) {
        const result = await explainTaxGroupResolution(db, ctx);
        res.json(result);
      } else {
        const result = await resolveTaxGroup(db, ctx);
        res.json({ winner: result, candidates: null });
      }
    } catch (err) { logger?.error("finance_tax_resolve_error", { err: String(err) }); next(err); }
  }) as RequestHandler);


  return router;
}
