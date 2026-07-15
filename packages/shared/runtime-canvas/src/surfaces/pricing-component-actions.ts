"use client";

import {
  flattenRuntimeRecord,
  type RuntimeRecordRow,
} from "@athyper/runtime-shared/core";
import { csrfFetch } from "@athyper/runtime-shared/client";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type {
  ConditionTypeOption,
  PcDraft,
  PurchaseInvoiceLine,
  TaxGroupOption,
  WhtGroupOption,
} from "@athyper/content-ui";

// Document-neutral defaults for the shared pricing component UI. The lookup
// providers are still seeded with AP-oriented codes today, but the surface
// config can override each value per document family as Service Sheet,
// Receipt, Sales, etc. come online.
export const DEFAULT_PRICING_DISCOUNT_CONDITION_LOOKUP_CODE = "pi_discount_condition_types";
export const DEFAULT_PRICING_CHARGE_CONDITION_LOOKUP_CODE = "pi_charge_condition_types";
export const DEFAULT_PRICING_TAX_CONDITION_LOOKUP_CODE = "pi_tax_condition_types";
export const DEFAULT_PRICING_TAX_GROUP_LOOKUP_CODE = "pi_tax_groups";
export const DEFAULT_DISCOUNT_CONDITION_LOOKUP_CODE = DEFAULT_PRICING_DISCOUNT_CONDITION_LOOKUP_CODE;
export const DEFAULT_CHARGE_CONDITION_LOOKUP_CODE = DEFAULT_PRICING_CHARGE_CONDITION_LOOKUP_CODE;
export const DEFAULT_TAX_CONDITION_LOOKUP_CODE = DEFAULT_PRICING_TAX_CONDITION_LOOKUP_CODE;
export const DEFAULT_TAX_GROUP_LOOKUP_CODE = DEFAULT_PRICING_TAX_GROUP_LOOKUP_CODE;
// WS-D: WHT-specific condition-type + tax-group lookups. The WHT condition
// type list filters master.condition_type for term_type='withholding'; the
// WHT group lookup filters control.tax_group to those whose components
// reference rate schedules with non-null wht_basis. Lookup adapters are
// expected to surface jurisdiction + wht_basis + section-required hints.
export const DEFAULT_PRICING_WHT_CONDITION_LOOKUP_CODE = "pi_wht_condition_types";
export const DEFAULT_PRICING_WHT_GROUP_LOOKUP_CODE = "pi_wht_groups";
export const DEFAULT_WHT_CONDITION_LOOKUP_CODE = DEFAULT_PRICING_WHT_CONDITION_LOOKUP_CODE;
export const DEFAULT_WHT_GROUP_LOOKUP_CODE = DEFAULT_PRICING_WHT_GROUP_LOOKUP_CODE;

// Default source_doc_type for legacy purchase invoice surfaces. Other docs
// pass their own value via surface config so the same action helpers can serve
// every document type.
export const DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE = "PURCHASE_INVOICE_LINE";
export const DEFAULT_PI_SOURCE_DOC_TYPE = DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE;

export interface PiPricingComponentContext {
  piCode: string;
  supplierLabel: string;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  invoiceNetAmount: number;
}

export type DocumentPricingComponentContext = PiPricingComponentContext;

export function readSurfaceConfigString(
  config: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = config?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function toConditionTypeOptions(
  rows: ReadonlyArray<RuntimeRecordRow>,
): ConditionTypeOption[] {
  return rows
    .map<ConditionTypeOption | null>((row) => {
      const flat = flattenRuntimeRecord(row);
      const id = readString(flat, "id");
      const code = readString(flat, "code");
      if (!id || !code) return null;
      const label =
        readString(flat, "name")
        || readString(flat, "display_name")
        || readString(flat, "label")
        || code;
      const sequence =
        readNumber(flat, "default_sequence", NaN)
        || readNumber(flat, "sort_order", NaN)
        || readNumber(flat, "sequence", 100);
      const apportionBasis = readString(flat, "default_apportion_basis");
      const option: ConditionTypeOption = {
        id,
        code,
        label,
        default_sequence: Number.isFinite(sequence) ? sequence : 100,
      };
      if (apportionBasis) option.position_hint = `default spread: ${apportionBasis}`;
      return option;
    })
    .filter((option): option is ConditionTypeOption => option !== null);
}

export function toTaxGroupOptions(
  rows: ReadonlyArray<RuntimeRecordRow>,
): TaxGroupOption[] {
  return rows
    .map<TaxGroupOption | null>((row) => {
      const flat = flattenRuntimeRecord(row);
      const id = readString(flat, "id");
      const code = readString(flat, "code");
      if (!id || !code) return null;
      const label =
        readString(flat, "name")
        || readString(flat, "display_name")
        || readString(flat, "label")
        || code;
      return {
        id,
        code,
        label,
        default_rate:
          readNumber(flat, "default_rate", NaN)
          || readNumber(flat, "rate_value", NaN)
          || readNumber(flat, "rate", 0),
        default_recoverable_pct: readNumber(flat, "default_recoverable_pct", 100),
      };
    })
    .filter((option): option is TaxGroupOption => option !== null);
}

/**
 * WS-D: WHT-specific tax-group adapter. Reads rows from the
 * `pi_wht_groups` lookup which is expected to surface only groups whose
 * components carry `wht_basis IS NOT NULL`, joined with jurisdiction
 * metadata (wht_section_required, section-code hints).
 *
 * Rows missing the required WHT-specific fields (rate_schedule_id,
 * wht_basis) are dropped — the WhtDrawer cannot capture the D8 metadata
 * snapshot without them, so surfacing them would yield a guaranteed
 * server-side validation failure.
 */
export function toWhtGroupOptions(
  rows: ReadonlyArray<RuntimeRecordRow>,
): WhtGroupOption[] {
  return rows
    .map<WhtGroupOption | null>((row) => {
      const flat = flattenRuntimeRecord(row);
      // WS-D: tax_group rows surface WHT-specific fields via metadata jsonb
      // (no dedicated columns on the table). Fall back to metadata when the
      // top-level row doesn't carry the field. The seed layer marks WHT
      // groups with `metadata.is_wht_group=true` and bakes in the
      // wht_basis + rate_schedule_id snapshot the WhtDrawer needs.
      const meta = (flat["metadata"] && typeof flat["metadata"] === "object" && flat["metadata"] !== null)
        ? (flat["metadata"] as Record<string, unknown>)
        : {};
      const readMeta = (key: string): unknown => flat[key] ?? meta[key];
      const readMetaString = (key: string): string => {
        const v = readMeta(key);
        return typeof v === "string" ? v : "";
      };
      const readMetaNumber = (key: string, fallback: number): number => {
        const v = readMeta(key);
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v !== "") {
          const n = Number(v);
          if (Number.isFinite(n)) return n;
        }
        return fallback;
      };

      const id   = readString(flat, "id");
      const code = readString(flat, "code");
      const rateScheduleId = readMetaString("rate_schedule_id")
        || readMetaString("default_rate_schedule_id");
      const whtBasisRaw = readMetaString("wht_basis");
      if (!id || !code || !rateScheduleId) return null;
      if (whtBasisRaw !== "GROSS"
          && whtBasisRaw !== "NET_OF_INDIRECT_TAX"
          && whtBasisRaw !== "PAYMENT_ONLY") return null;
      const label =
        readString(flat, "name")
        || readString(flat, "display_name")
        || readString(flat, "label")
        || code;
      const sectionHintsRaw = readMeta("section_code_hints");
      const sectionHints = Array.isArray(sectionHintsRaw)
        ? sectionHintsRaw.filter((v): v is string => typeof v === "string")
        : undefined;
      const sectionRequiredRaw = readMeta("wht_section_required")
        ?? readMeta("section_code_required");
      return {
        id,
        code,
        label,
        jurisdiction_id:        readString(flat, "jurisdiction_id") || null,
        jurisdiction_label:     readString(flat, "jurisdiction_label") || undefined,
        default_rate:
          readMetaNumber("default_rate", NaN)
          || readMetaNumber("rate_value", NaN)
          || readMetaNumber("rate", 0),
        wht_basis:              whtBasisRaw,
        rate_schedule_id:       rateScheduleId,
        default_section_code:   readMetaString("default_section_code") || undefined,
        section_code_required:  Boolean(sectionRequiredRaw),
        section_code_hints:     sectionHints,
      };
    })
    .filter((option): option is WhtGroupOption => option !== null);
}

export function readPiPricingComponentContext(
  record: Record<string, unknown>,
  recordId: string,
  lines: ReadonlyArray<PurchaseInvoiceLine>,
): PiPricingComponentContext {
  return readDocumentPricingComponentContext(record, recordId, lines);
}

export function readDocumentPricingComponentContext(
  record: Record<string, unknown>,
  recordId: string,
  lines: ReadonlyArray<PurchaseInvoiceLine>,
): DocumentPricingComponentContext {
  const currencyCode = readString(record, "currency_code") || "INR";
  const baseCurrencyCode = readString(record, "base_currency_code") || currencyCode;
  const piCode =
    readString(record, "code")
    || recordId;
  const supplierLabel =
    readString(record, "supplier_id_label")
    || readString(record, "supplier_name")
    || readString(record, "supplier_id")
    || "Supplier";
  return {
    piCode,
    supplierLabel,
    currencyCode,
    baseCurrencyCode,
    exchangeRate: readNumber(record, "exchange_rate", 1),
    invoiceNetAmount: computeDocumentNetAmount(lines),
  };
}

export function computeInvoiceNetAmount(lines: ReadonlyArray<PurchaseInvoiceLine>): number {
  return computeDocumentNetAmount(lines);
}

export function computeDocumentNetAmount(lines: ReadonlyArray<PurchaseInvoiceLine>): number {
  return round2(lines.reduce((sum, line) => sum + safeNumber(line.net_amount), 0));
}

export async function postPricingComponentDraft(input: {
  recordId: string;
  record: Record<string, unknown>;
  lines: ReadonlyArray<PurchaseInvoiceLine>;
  draft: PcDraft;
  replace?: { id: string; expectedVersion?: string | number } | null;
  /** Defaults to purchase invoice line; other documents pass their own source_doc_type. */
  sourceDocType?: string;
}): Promise<void> {
  const { recordId, record, lines, draft, replace = null, sourceDocType = DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE } = input;
  const currencyCode = readString(record, "currency_code") || "INR";
  const baseCurrencyCode = readString(record, "base_currency_code") || currencyCode;
  const sourceLine = draft.source_line_id
    ? lines.find((line) => line.id === draft.source_line_id)
    : null;
  const fallbackBase = draft.entry_level === "header"
    ? computeDocumentNetAmount(lines)
    : sourceLine?.net_amount ?? 0;

  const res = await csrfFetch(runtimePath.componentSave(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_doc_type: sourceDocType,
      create: {
        source_doc_type: sourceDocType,
        source_doc_id: recordId,
        source_line_id: draft.entry_level === "line" ? draft.source_line_id : null,
        term_type: draft.term_type,
        condition_type_id: draft.condition_type_id,
        sequence: draft.sequence,
        basis: draft.basis,
        rate_value: draft.rate_value,
        amount_value: draft.amount_value,
        base_for_calculation: draft.base_for_calculation ?? fallbackBase,
        entry_level: draft.entry_level,
        apportion_basis: draft.entry_level === "header" ? draft.apportion_basis : null,
        origin: "manual",
        tax_group_id: draft.tax_group_id,
        is_inclusive: draft.is_inclusive,
        recoverable_pct: draft.recoverable_pct,
        tax_section_code: draft.tax_section_code,
        // WS-B/D8: pass WHT metadata snapshot through to the server. The
        // server pc_wht_metadata_snapshot_chk CHECK rejects WHT rows
        // without it; non-WHT drafts can leave it null.
        metadata: draft.metadata ?? null,
        currency_code: currencyCode,
        base_currency_code: baseCurrencyCode,
        exchange_rate: readNumber(record, "exchange_rate", 1),
      },
      replace,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `Pricing component save failed (${res.status}).`);
  }
}

/**
 * In-place UPDATE of a pricing_component row. Used by the line drawer's
 * Edit affordance in draft mode where supersession would create a v1
 * history row with no audit value (the row has never been approved).
 *
 * Posts to the dedicated BFF route at
 * `/api/runtime/v1/components/update` which forwards to PATCH on
 * the AP backend. Mirrors `postPricingComponentDraft` shape so callers
 * can branch cleanly between supersession (POST) and in-place
 * (PATCH-equivalent POST to this endpoint).
 */
export async function patchPricingComponentInPlace(input: {
  parentId:    string;          // source_doc_id
  componentId: string;
  record:      Record<string, unknown>;
  lines:       ReadonlyArray<PurchaseInvoiceLine>;
  draft:       PcDraft;
  /** Defaults to purchase invoice line; other documents pass their own source_doc_type. */
  sourceDocType?: string;
}): Promise<void> {
  const { parentId, componentId, record, lines, draft, sourceDocType = DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE } = input;
  const currencyCode = readString(record, "currency_code") || "INR";
  const baseCurrencyCode = readString(record, "base_currency_code") || currencyCode;
  const sourceLine = draft.source_line_id
    ? lines.find((line) => line.id === draft.source_line_id)
    : null;
  const fallbackBase = draft.entry_level === "header"
    ? computeDocumentNetAmount(lines)
    : sourceLine?.net_amount ?? 0;

  const res = await csrfFetch(runtimePath.componentUpdate(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_doc_type: sourceDocType,
      source_doc_id:   parentId,
      component_id:    componentId,
      patch: {
        source_doc_type: sourceDocType,
        source_doc_id:   parentId,
        source_line_id:  draft.entry_level === "line" ? draft.source_line_id : null,
        term_type:       draft.term_type,
        condition_type_id: draft.condition_type_id,
        sequence:        draft.sequence,
        basis:           draft.basis,
        rate_value:      draft.rate_value,
        amount_value:    draft.amount_value,
        base_for_calculation: draft.base_for_calculation ?? fallbackBase,
        entry_level:     draft.entry_level,
        apportion_basis: draft.entry_level === "header" ? draft.apportion_basis : null,
        origin:          "manual",
        tax_group_id:    draft.tax_group_id,
        is_inclusive:    draft.is_inclusive,
        recoverable_pct: draft.recoverable_pct,
        tax_section_code: draft.tax_section_code,
        metadata:        draft.metadata ?? null,
        currency_code:   currencyCode,
        base_currency_code: baseCurrencyCode,
        exchange_rate:   readNumber(record, "exchange_rate", 1),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `Pricing component update failed (${res.status}).`);
  }
}

/**
 * Deletes a pricing_component row by id. Used by the line drawer's
 * per-row Delete affordance.
 *
 * Calls the dedicated BFF route at
 * `/api/runtime/v1/components/delete` (sibling of the supersede
 * route) which forwards to the AP backend's
 * `DELETE /api/finance/ap/invoices/:id/pricing-components/:pcId`.
 *
 * The generic records API path was tried first but blocked by the
 * `pricing_component` entity's `GENERIC_DELETE_DISABLED` guard — the
 * table is audit-tracked. The AP-side handler enforces draft-only +
 * manual-origin + not-already-superseded gates with the same shape as
 * the create + supersede siblings.
 */
export async function deletePricingComponent(input: {
  parentId:    string;  // source_doc_id
  componentId: string;
  /** Defaults to purchase invoice line; other documents pass their own source_doc_type. */
  sourceDocType?: string;
}): Promise<void> {
  const res = await csrfFetch(runtimePath.componentDelete(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_doc_type: input.sourceDocType ?? DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE,
      source_doc_id:   input.parentId,
      component_id:    input.componentId,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `Pricing component delete failed (${res.status}).`);
  }
}

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function readNumber(record: Record<string, unknown>, field: string, fallback = 0): number {
  return safeNumber(record[field], fallback);
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
