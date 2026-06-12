"use client";

/**
 * ProcureLineComposerSheet
 *
 * Accordion-based composer for procurement line entities.
 * Layout is 100% META-driven via display_config.procure_line.composer_sections
 * or group_key conventions.  Falls back to MetaLineForm when neither is set.
 *
 * CSS/UX is intentionally identical to LineComposerSheet — same DrawerShell
 * props, same button classes, same error display, same field inputs.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import { fmtAmount } from "@athyper/runtime-shared/core";
import { cn } from "@athyper/theme/utils";
import { useEditSessionContext } from "@athyper/content-ui";
import {
  type LineRecord,
  MetaFieldInput,
  MetaLineForm,
  buildCreatePayload,
  buildLinePatch,
  fieldOptions,
  fieldLabel,
  formatFieldValue,
  initialDraft,
  isUomLikeField,
  recordId,
  recordValue,
  resolveTitleField,
  useCompiledEntityMetadata,
} from "./metaLineRuntime";
import {
  type ItemTabConfig,
  type ProcureAmountConfig,
  type ProcureComposerSection,
  fieldsForGroups,
  resolveItemTabConfig,
  resolveProcureAmountConfig,
  resolveProcureComposerSections,
} from "./procureLineRuntime";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS (identical to LineComposerSheet — kept local to avoid cross-coupling)
// ─────────────────────────────────────────────────────────────────────────────

function collectionUrl(entityCode: string, parentId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines`;
}

function itemUrl(entityCode: string, parentId: string, lineId: string): string {
  return `${collectionUrl(entityCode, parentId)}/${encodeURIComponent(lineId)}`;
}

type SaveErrorBody = {
  error?:   string;
  message?: string;
  detail?:  string;
  details?: unknown;
};

function saveErrorMessage(body: SaveErrorBody, status: number): string {
  const main = body.message ?? body.detail ?? body.error;
  if (main) return body.error && body.error !== main ? `${main} (${body.error})` : main;
  if (body.details) return typeof body.details === "string" ? body.details : JSON.stringify(body.details);
  return `Save failed (${status})`;
}

const PROCURE_FIELD_LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";
const PROCURE_SECTION_LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";
const PROCURE_FIELD_BOX_CLASS = "rounded-lg border bg-card px-5 py-5 text-card-foreground shadow-sm";
const DEFAULT_PROCUREMENT_TYPE_PARAMETER_CODE = "finance.ap.default_procurement_line_type";
const DEFAULT_PROCUREMENT_UOM_PARAMETER_CODE = "finance.ap.default_procurement_line_uom";
const DEFAULT_PROCUREMENT_TYPE_NAMESPACE = "finance.ap";
const PROCURE_LINE_DEFAULT_TYPE_FALLBACK = "goods";
const PROCURE_LINE_DEFAULT_UOM_FALLBACK = "EA";
const PROCUREMENT_TYPE_CODES = new Set(["goods", "services", "mixed", "freight", "misc"]);
const HEADER_DOCUMENT_REFERENCE_FIELDS = [
  "commitment_id",
  "purchase_order_id",
  "po_id",
  "goods_receipt_id",
  "service_entry_sheet_id",
  "ses_id",
  "source_document_id",
  "source_doc_id",
  "reference_document_id",
  "ref_doc_id",
];
const SOURCE_DOCUMENT_REFERENCE_TOKENS = [
  "commitment",
  "purchase_order",
  "purchase order",
  "po line",
  "goods_receipt",
  "goods receipt",
  "gr line",
  "service_entry",
  "service entry",
  "ses",
];
const DIMENSION_COMPOSER_FIELD_ORDER = [
  "cost_center_id",
  "project_id",
  "profit_center_id",
  "site_id",
];

export type ProcureLineComposerMode = "manual" | "catalog";

function displayProcureLabel(value: string | null | undefined): string {
  const text = String(value ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function procureSheetBadge(label: string) {
  return (
    <span
      className="inline-flex h-8 max-w-[12rem] items-center overflow-hidden rounded-lg bg-foreground text-background shadow-sm ring-1 ring-border/20"
      title={label}
    >
      <span className="min-w-0 px-3 text-xs font-medium leading-none">
        <span className="block truncate">{label}</span>
      </span>
    </span>
  );
}

function compactHeaderTitle(value: string, limit = 50): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

function nonEmptyText(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function normalizedProcurementType(value: unknown): string {
  const text = nonEmptyText(value)?.toLowerCase();
  return text && PROCUREMENT_TYPE_CODES.has(text) ? text : PROCURE_LINE_DEFAULT_TYPE_FALLBACK;
}

function normalizedProcurementUom(value: unknown): string {
  const text = nonEmptyText(value);
  if (!text) return PROCURE_LINE_DEFAULT_UOM_FALLBACK;
  if (text.toLowerCase() === "each") return PROCURE_LINE_DEFAULT_UOM_FALLBACK;
  return text.toUpperCase();
}

type DefaultProcurementLineSettings = {
  procurementType: string;
  uomCode: string;
};

function useDefaultProcurementLineSettings(enabled: boolean): DefaultProcurementLineSettings {
  const [settings, setSettings] = useState<DefaultProcurementLineSettings>({
    procurementType: PROCURE_LINE_DEFAULT_TYPE_FALLBACK,
    uomCode: PROCURE_LINE_DEFAULT_UOM_FALLBACK,
  });

  useEffect(() => {
    if (!enabled) {
      setSettings({
        procurementType: PROCURE_LINE_DEFAULT_TYPE_FALLBACK,
        uomCode: PROCURE_LINE_DEFAULT_UOM_FALLBACK,
      });
      return;
    }

    let cancelled = false;
    void fetch(`/api/iam/parameters/effective?namespace=${encodeURIComponent(DEFAULT_PROCUREMENT_TYPE_NAMESPACE)}`, {
      cache: "no-store",
    })
      .then((response) => response.ok ? response.json() as Promise<{ values?: Record<string, unknown> }> : null)
      .then((body) => {
        if (cancelled) return;
        setSettings({
          procurementType: normalizedProcurementType(body?.values?.[DEFAULT_PROCUREMENT_TYPE_PARAMETER_CODE]),
          uomCode: normalizedProcurementUom(body?.values?.[DEFAULT_PROCUREMENT_UOM_PARAMETER_CODE]),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSettings({
            procurementType: PROCURE_LINE_DEFAULT_TYPE_FALLBACK,
            uomCode: PROCURE_LINE_DEFAULT_UOM_FALLBACK,
          });
        }
      });

    return () => { cancelled = true; };
  }, [enabled]);

  return settings;
}

function draftValue(draft: Record<string, unknown>, fieldOrName: EntityField | string): unknown {
  const name       = typeof fieldOrName === "string" ? fieldOrName : fieldOrName.name;
  const columnName = typeof fieldOrName === "string" ? undefined : fieldOrName.column_name;

  if (Object.prototype.hasOwnProperty.call(draft, name)) return draft[name];
  const columnValue = columnValueForDraftField(draft, name, columnName);
  if (columnValue !== undefined) return columnValue;

  const data = draft.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const dataRecord = data as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(dataRecord, name)) return dataRecord[name];
    const dataColumnValue = columnValueForDraftField(dataRecord, name, columnName);
    if (dataColumnValue !== undefined) return dataColumnValue;
  }

  return undefined;
}

function columnValueForDraftField(
  source: Record<string, unknown>,
  name: string,
  columnName?: string | null,
): unknown {
  if (!columnName || !Object.prototype.hasOwnProperty.call(source, columnName)) return undefined;
  const value = source[columnName];
  if (value && typeof value === "object" && !Array.isArray(value) && columnName !== name) {
    const nested = value as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(nested, name) ? nested[name] : undefined;
  }
  return value;
}

function draftOrLineValue(
  draft:       Record<string, unknown>,
  line:        DocumentLine | null | undefined,
  fieldOrName: EntityField | string,
): unknown {
  const fromDraft = draftValue(draft, fieldOrName);
  if (fromDraft !== undefined) return fromDraft;
  return line ? recordValue(line as LineRecord, fieldOrName) : undefined;
}

function titleFor(
  entity: CompiledEntity | null,
  line:   DocumentLine | null | undefined,
  draft:  Record<string, unknown>,
): string {
  const fallback = line ? `Edit ${entity?.entity_name ?? "line"}` : `Add ${entity?.entity_name ?? "line"}`;
  const tf       = resolveTitleField(entity);
  const title    = tf ? draftOrLineValue(draft, line, tf) : undefined;
  return nonEmptyText(title) ?? fallback;
}

function subtitleFor(
  entity:       CompiledEntity | null,
  line:         DocumentLine | null | undefined,
  draft:        Record<string, unknown>,
  currencyCode?: string,
): string | undefined {
  const parts: string[] = [];

  const qty = Number(draftOrLineValue(draft, line, "quantity"));
  if (Number.isFinite(qty) && qty > 0) {
    const uom =
      nonEmptyText(draftOrLineValue(draft, line, "unit_code")) ??
      nonEmptyText(draftOrLineValue(draft, line, "uom_code"));
    parts.push(uom ? `${qty} ${uom}` : String(qty));
  }

  const price = Number(draftOrLineValue(draft, line, "unit_price"));
  if (Number.isFinite(price) && price > 0) parts.push(`${fmtAmount(price, currencyCode)}/unit`);

  if (parts.length > 0) return parts.join(" · ");
  if (!line || !entity) return entity?.entity_name;
  const fields = entity.fields.filter((f) => f.origin !== "system").slice(0, 3);
  const fallbackParts = fields.flatMap((f) => {
    const text = formatFieldValue(recordValue(line as LineRecord, f), f, currencyCode);
    return text === "-" ? [] : [`${f.label ?? f.name}: ${text}`];
  });
  return fallbackParts.length > 0 ? fallbackParts.join(" · ") : entity.entity_name;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCURE ITEM CONTROLS
// ─────────────────────────────────────────────────────────────────────────────

type LineAmountPreview = {
  baseAmount: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  chargesAmount: number;
  grossAmount: number;
};

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lineDraftValue(
  line: DocumentLine | null | undefined,
  draft: Record<string, unknown>,
  fieldName: string | undefined,
): unknown {
  if (!fieldName) return undefined;
  return draftOrLineValue(draft, line, fieldName);
}

function firstAmount(
  line: DocumentLine | null | undefined,
  draft: Record<string, unknown>,
  fieldNames: Array<string | undefined>,
): number {
  for (const name of fieldNames) {
    const value = finiteNumber(lineDraftValue(line, draft, name));
    if (value != null) return value;
  }
  return 0;
}

function formulaAmount(draft: Record<string, unknown>): number {
  const quantity = finiteNumber(draft["quantity"]) ?? 0;
  const unitPrice = finiteNumber(draft["unit_price"]) ?? 0;
  const priceUnit = finiteNumber(draft["price_unit"]) ?? 1;
  if (quantity <= 0 || unitPrice <= 0 || priceUnit <= 0) return 0;
  return roundMoney((quantity * unitPrice) / priceUnit);
}

function calculateLineAmountPreview({
  line,
  draft,
  amountConfig,
}: {
  line?: DocumentLine | null;
  draft: Record<string, unknown>;
  amountConfig: ProcureAmountConfig | null | undefined;
}): LineAmountPreview {
  const storedBaseAmount = firstAmount(line, draft, [
    "net_amount",
    amountConfig?.amountField,
    "line_amount",
    "gross_amount",
  ]);
  const baseAmount = storedBaseAmount || formulaAmount(draft);
  const rawPct = finiteNumber(lineDraftValue(line, draft, "discount_pct"));
  const discountPct = rawPct == null ? 0 : clampNumber(rawPct, 0, 100);
  const manualDiscount = finiteNumber(lineDraftValue(line, draft, "discount_amount"));
  const discountFromPct = baseAmount > 0 && discountPct > 0
    ? roundMoney((baseAmount * discountPct) / 100)
    : 0;
  const discountAmount = clampNumber(
    discountFromPct > 0 ? discountFromPct : roundMoney(manualDiscount ?? 0),
    0,
    Math.max(baseAmount, 0),
  );
  const taxAmount = firstAmount(line, draft, ["tax_amount"]);
  const chargesAmount = firstAmount(line, draft, ["charges_amount", "charge_amount", "misc_charges_amount"]);
  const grossAmount = roundMoney(baseAmount - discountAmount + taxAmount + chargesAmount);
  return {
    baseAmount,
    discountPct,
    discountAmount,
    taxAmount,
    chargesAmount,
    grossAmount,
  };
}

function FooterAmount({
  line,
  draft,
  amountConfig,
  currencyCode,
}: {
  line?:          DocumentLine | null;
  draft:         Record<string, unknown>;
  amountConfig:  ProcureAmountConfig;
  currencyCode?: string;
}) {
  const preview = calculateLineAmountPreview({ line, draft, amountConfig });
  const currency = (amountConfig.currencyField
    ? String(lineDraftValue(line, draft, amountConfig.currencyField) ?? "")
    : currencyCode) || "";

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const barParts: { label: string; value: number }[] = [];
  for (const f of amountConfig.financialBar) {
    const raw = f.name === "discount_amount"
      ? preview.discountAmount
      : f.name === "net_amount" || f.name === amountConfig.amountField
        ? preview.baseAmount
        : f.name === "tax_amount"
          ? preview.taxAmount
          : f.name === "charges_amount" || f.name === "charge_amount"
            ? preview.chargesAmount
            : f.name === "gross_amount" || f.name === "line_amount"
              ? preview.grossAmount
              : lineDraftValue(line, draft, f.name);
    const n = Number(raw ?? 0);
    if (Number.isFinite(n) && Math.abs(n) > 0.0001) {
      barParts.push({ label: f.label, value: n });
    }
  }

  const primaryAmt = Number(lineDraftValue(line, draft, amountConfig.amountField) ?? preview.grossAmount);
  if (barParts.length === 0 && primaryAmt === 0) return null;

  const segments = barParts.length > 0 ? barParts : [{ label: "", value: preview.grossAmount || primaryAmt }];

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      {segments.map(({ label, value }, i) => (
        <span key={label || i} className="flex items-baseline gap-1 tabular-nums">
          {label && <span className="text-muted-foreground">{label}</span>}
          <span className="font-medium text-foreground">
            {fmt(value)}
            {currency && <span className="ml-0.5 font-normal text-muted-foreground">{currency}</span>}
          </span>
          {i < segments.length - 1 && <span className="text-border">Â·</span>}
        </span>
      ))}
      <span className="ml-1 text-muted-foreground">unallocated</span>
    </span>
  );
}

type LookupOption = { value: string; label: string };
type LookupResponse = {
  data?: Array<{ code: string; name: string }>;
  values?: Array<{ code: string; name: string }>;
};

type QtyMode = "qty_price" | "amount_only";

const lookupCache = new Map<string, LookupOption[]>();
const AMOUNT_ONLY_TYPES = new Set(["mixed", "freight", "misc"]);
const HOW_MUCH_DATA_TYPES = new Set(["decimal", "integer", "money", "numeric", "bigint"]);
const PRICE_NAME_RE = /price|rate|cost|value/i;

function unique(values: string[]): string[] {
  return values.filter((value, index, arr) => value && arr.indexOf(value) === index);
}

function useLookupOptions(domainCode: string | null | undefined): LookupOption[] {
  const [opts, setOpts] = useState<LookupOption[]>(
    () => (domainCode ? (lookupCache.get(domainCode) ?? []) : []),
  );

  useEffect(() => {
    if (!domainCode) return;
    if (lookupCache.has(domainCode)) { setOpts(lookupCache.get(domainCode)!); return; }

    let cancelled = false;
    void fetch(`/api/relay/api/metadata/lookups/${encodeURIComponent(domainCode)}`)
      .then((r) => (r.ok ? (r.json() as Promise<LookupResponse>) : null))
      .then((body) => {
        if (cancelled) return;
        const rows = body?.data ?? body?.values ?? [];
        const mapped = rows.map((r) => ({ value: r.code, label: r.name }));
        lookupCache.set(domainCode, mapped);
        setOpts(mapped);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [domainCode]);

  return opts;
}

function isMoneyField(field: EntityField): boolean {
  return field.data_type === "money" || (field.data_type === "decimal" && PRICE_NAME_RE.test(field.name));
}

function isPriceUnitField(field: EntityField): boolean {
  const name = field.name.toLowerCase();
  return name === "price_unit" || name === "price_per";
}

function typeFieldFirst(fields: EntityField[]): EntityField[] {
  const typeIndex = fields.findIndex(
    (field) =>
      field.name === "procurement_type" ||
      field.label?.trim().toLowerCase() === "type",
  );
  if (typeIndex <= 0) return fields;
  const typeField = fields[typeIndex]!;
  return [typeField, ...fields.filter((_, index) => index !== typeIndex)];
}

function isBusinessIntentField(field: EntityField): boolean {
  return /business[_-]?intent/i.test(field.name);
}

function isCommodityCategoryField(field: EntityField): boolean {
  return /(commodity|spend)[_-]?category/i.test(field.name);
}

function isItemReferenceField(field: EntityField): boolean {
  const ref = field.reference_config as Record<string, unknown> | null | undefined;
  const refEntity = ref?.["target_entity"];
  return field.name === "item_id" || refEntity === "item";
}

function assetFieldsForEntity(entity: CompiledEntity): EntityField[] {
  return fieldsForNames(entity, ["is_asset", "asset_category_id"]);
}

function isTruthyDraftValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function procurementTypeField(entity: CompiledEntity | null | undefined): EntityField | undefined {
  return entity?.fields.find(
    (field) =>
      field.name === "procurement_type" ||
      field.label?.trim().toLowerCase() === "type",
  );
}

function isTaxonomyCodeField(field: EntityField): boolean {
  const text = `${field.name} ${field.column_name ?? ""} ${field.label ?? ""}`.toLowerCase();
  return (
    text.includes("unspsc") ||
    text.includes("commodity code") ||
    text.includes("commodity_code") ||
    /\bhs\b/.test(text) ||
    text.includes("trade code") ||
    text.includes("tariff")
  );
}

function isOptionalClassificationDraftField(field: EntityField): boolean {
  return isCommodityCategoryField(field) || isBusinessIntentField(field) || isTaxonomyCodeField(field);
}

function emptyDraftValueForField(field: EntityField): unknown {
  if (field.name === "price_unit") return 1;
  return field.data_type === "boolean" ? false : "";
}

function uniqueEntityFields(fields: EntityField[]): EntityField[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.name)) return false;
    seen.add(field.name);
    return true;
  });
}

function fieldsForNames(
  entity:       CompiledEntity,
  names:        string[],
  editableOnly = true,
): EntityField[] {
  if (names.length === 0) return [];
  const byName = new Map(entity.fields.map((field) => [field.name, field]));
  const seen   = new Set<string>();
  const fields: EntityField[] = [];

  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const field = byName.get(name);
    if (!field) continue;
    if (editableOnly && (field.is_readonly || field.origin === "system" || field.is_computed)) continue;
    fields.push(field);
  }

  return fields;
}

function orderDimensionComposerFields(fields: EntityField[]): EntityField[] {
  const rank = new Map(DIMENSION_COMPOSER_FIELD_ORDER.map((name, index) => [name, index]));
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => {
      const ar = rank.get(a.field.name) ?? Number.MAX_SAFE_INTEGER;
      const br = rank.get(b.field.name) ?? Number.MAX_SAFE_INTEGER;
      return ar === br ? a.index - b.index : ar - br;
    })
    .map(({ field }) => field);
}

function explicitComposerFieldOwners(sections: ProcureComposerSection[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const section of sections) {
    for (const fieldName of section.fields) {
      if (!owners.has(fieldName)) owners.set(fieldName, section.key);
    }
  }
  return owners;
}

function clearDraftFields(
  draft:  Record<string, unknown>,
  fields: EntityField[],
): Record<string, unknown> {
  if (fields.length === 0) return draft;
  const next = { ...draft };
  for (const field of fields) {
    next[field.name] = emptyDraftValueForField(field);
  }
  return next;
}

function isMissingRequiredValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function withNewProcureLineDefaults(draft: Record<string, unknown>): Record<string, unknown> {
  if (draft["price_unit"] != null && draft["price_unit"] !== "") return draft;
  return { ...draft, price_unit: 1 };
}

function withDefaultProcurementType(
  draft: Record<string, unknown>,
  entity: CompiledEntity | null | undefined,
  defaultType: string,
  options: { replaceExisting?: boolean; replaceFallback?: boolean } = {},
): Record<string, unknown> {
  const typeField = procurementTypeField(entity);
  if (!typeField) return draft;

  const current = nonEmptyText(draft[typeField.name])?.toLowerCase();
  const nextType = normalizedProcurementType(defaultType);
  const canReplace =
    !current ||
    options.replaceExisting === true ||
    (options.replaceFallback === true && current === PROCURE_LINE_DEFAULT_TYPE_FALLBACK);

  if (!canReplace || current === nextType) return draft;
  return { ...draft, [typeField.name]: nextType };
}

function isUomIdLikeField(field: EntityField): boolean {
  return /(^|_)id$/i.test(field.name);
}

function itemReferenceHasValue(
  draft: Record<string, unknown>,
  entity: CompiledEntity | null | undefined,
): boolean {
  return entity?.fields
    .filter(isItemReferenceField)
    .some((field) => !isMissingRequiredValue(draftValue(draft, field))) === true;
}

function objectValueText(record: Record<string, unknown> | null | undefined, key: string): string | null {
  return record ? nonEmptyText(record[key]) : null;
}

function headerHasSourceDocumentReference(headerRecord?: Record<string, unknown> | null): boolean {
  return HEADER_DOCUMENT_REFERENCE_FIELDS.some((fieldName) => Boolean(objectValueText(headerRecord, fieldName)));
}

function isSourceDocumentReferenceField(field: EntityField): boolean {
  const ref = field.reference_config as Record<string, unknown> | null | undefined;
  const text = [
    field.name,
    field.column_name,
    field.label,
    ref?.["target_entity"],
    field.group_key,
  ]
    .filter((value) => value != null)
    .join(" ")
    .replace(/-/g, "_")
    .toLowerCase();
  return SOURCE_DOCUMENT_REFERENCE_TOKENS.some((token) => text.includes(token));
}

function draftHasSourceDocumentReference(
  draft: Record<string, unknown>,
  entity: CompiledEntity | null | undefined,
): boolean {
  return entity?.fields
    .filter(isSourceDocumentReferenceField)
    .some((field) => !isMissingRequiredValue(draftValue(draft, field))) === true;
}

function withStandaloneDefaultUom(
  draft: Record<string, unknown>,
  entity: CompiledEntity | null | undefined,
  defaultUomCode: string,
  options: {
    headerRecord?: Record<string, unknown> | null;
    replaceExisting?: boolean;
    replaceFallback?: boolean;
  } = {},
): Record<string, unknown> {
  if (!entity) return draft;
  if (itemReferenceHasValue(draft, entity)) return draft;
  if (headerHasSourceDocumentReference(options.headerRecord)) return draft;
  if (draftHasSourceDocumentReference(draft, entity)) return draft;

  const nextUom = normalizedProcurementUom(defaultUomCode);
  const uomFields = entity.fields.filter((field) => isUomLikeField(field) && !isUomIdLikeField(field));
  if (uomFields.length === 0) return draft;

  let next = draft;
  for (const field of uomFields) {
    const current = nonEmptyText(draftValue(next, field));
    const canReplace =
      !current ||
      options.replaceExisting === true ||
      (options.replaceFallback === true && normalizedProcurementUom(current) === PROCURE_LINE_DEFAULT_UOM_FALLBACK);
    if (!canReplace || (current && normalizedProcurementUom(current) === nextUom)) continue;
    next = next === draft ? { ...draft } : next;
    next[field.name] = nextUom;
  }
  return next;
}

function withHeaderCompanyCodeContext(
  draft: Record<string, unknown>,
  headerRecord?: Record<string, unknown> | null,
  companyCodeId?: string,
): Record<string, unknown> {
  const headerCompanyCodeId = nonEmptyText(companyCodeId) ?? nonEmptyText(headerRecord?.["company_code_id"]);
  const context = { ...(headerRecord ?? {}), ...draft };
  if (headerCompanyCodeId) context["company_code_id"] = headerCompanyCodeId;
  return context;
}

function procureValidationMessage(
  entity:       CompiledEntity,
  config:       ItemTabConfig,
  amountConfig: ProcureAmountConfig | null,
  draft:        Record<string, unknown>,
  composerMode: ProcureLineComposerMode,
): string | null {
  const descriptionField = config.primaryFields.find((f) => f.name === "item_description")
    ?? config.primaryFields.find((f) => f.data_type === "text")
    ?? config.primaryFields[0];
  const itemField = [...config.primaryFields, ...config.classifyFields].find(isItemReferenceField);
  const typeField = config.classifyFields.find(
    (f) => f.data_type === "enum" || f.data_type === "lifecycle_state",
  );
  const amountField = amountConfig
    ? entity.fields.find((f) => f.name === amountConfig.amountField)
    : undefined;
  const typeValue = typeField ? String(draft[typeField.name] ?? "") : "";
  const forceAmountOnly = AMOUNT_ONLY_TYPES.has(typeValue.toLowerCase());
  const hasAmountValue = amountField ? !isMissingRequiredValue(draft[amountField.name]) : false;
  const hasQuantityValue = config.quantityRow.some((f) => !isMissingRequiredValue(draft[f.name]));
  const amountMode = forceAmountOnly || (hasAmountValue && !hasQuantityValue);

  const requiredFields = [
    typeField,
    descriptionField,
    ...(composerMode === "catalog" ? [itemField] : []),
    ...(amountMode ? [amountField] : config.quantityRow),
  ];
  const seen = new Set<string>();
  const missing = requiredFields.flatMap((field): string[] => {
    if (!field || seen.has(field.name)) return [];
    seen.add(field.name);
    return isMissingRequiredValue(draft[field.name]) ? [fieldLabel(field)] : [];
  });
  const assetCategoryField = entity.fields.find((field) => field.name === "asset_category_id");
  if (
    isTruthyDraftValue(draft["is_asset"]) &&
    assetCategoryField &&
    isMissingRequiredValue(draft[assetCategoryField.name])
  ) {
    missing.push(fieldLabel(assetCategoryField));
  }

  return missing.length > 0 ? `Complete required fields: ${missing.join(", ")}.` : null;
}

function DescriptionTextArea({
  field,
  draft,
  onDraftChange,
  disabled,
}: {
  field:         EntityField;
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
}) {
  const raw = draft[field.name];
  const value = raw == null ? "" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={PROCURE_FIELD_LABEL_CLASS}>
        {fieldLabel(field)}
        {field.is_required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      <textarea
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(event) => onDraftChange({ ...draft, [field.name]: event.target.value })}
        className="min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-ring/50 focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
      />
    </label>
  );
}

function TypePillsField({
  field,
  value,
  onChange,
  disabled,
}: {
  field:     EntityField;
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
}) {
  const staticOpts = fieldOptions(field);
  const domainOpts = useLookupOptions(staticOpts.length === 0 ? field.enum_domain_code : null);
  const opts        = staticOpts.length > 0 ? staticOpts : domainOpts;

  return (
    <div className="flex w-full overflow-hidden rounded-lg border border-input bg-background p-0.5">
      {opts.map((opt) => {
        const active = String(value ?? "") === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : opt.value)}
            className={cn(
              "min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CurrencyInput({
  value,
  onChange,
  disabled,
  currencyCode,
}: {
  value:         unknown;
  onChange:      (v: unknown) => void;
  disabled?:     boolean;
  currencyCode?: string;
}) {
  const n      = Number(value ?? 0);
  const isZero = !Number.isFinite(n) || n === 0;
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30">
      <span className="flex shrink-0 items-center border-r border-border/40 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground">
        {currencyCode ?? "-"}
      </span>
      <input
        type="number"
        step="any"
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-3 text-right text-sm tabular-nums outline-none disabled:opacity-50",
          isZero ? "text-amber-500/80" : "text-foreground",
        )}
      />
    </div>
  );
}

function QtyUomInput({
  value,
  onChange,
  disabled,
  uomCode,
}: {
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
  uomCode?:  string;
}) {
  const n      = Number(value ?? 0);
  const isZero = !Number.isFinite(n) || n === 0;
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30">
      <input
        type="number"
        step="any"
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent pl-3 text-sm tabular-nums outline-none disabled:opacity-50",
          isZero ? "text-amber-500/80" : "text-foreground",
        )}
      />
      {uomCode && (
        <span className="flex shrink-0 items-center border-l border-border/40 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground">
          {uomCode}
        </span>
      )}
    </div>
  );
}

function QuantityRowCell({
  field,
  quantityRow,
  draft,
  onDraftChange,
  disabled,
  currencyCode,
  formData,
}: {
  field:         EntityField;
  quantityRow:   EntityField[];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  currencyCode?: string;
  formData?:     Record<string, unknown>;
}) {
  const uomField = quantityRow.find(isUomLikeField);
  const uomCode  = uomField ? String(draft[uomField.name] ?? "") : "";

  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={PROCURE_FIELD_LABEL_CLASS}>
        {fieldLabel(field)}
        {field.is_required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {isMoneyField(field) || isPriceUnitField(field) ? (
        <CurrencyInput
          value={draft[field.name]}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
          disabled={disabled}
          currencyCode={currencyCode}
        />
      ) : isUomLikeField(field) ? (
        <MetaFieldInput
          field={field}
          value={draft[field.name]}
          disabled={disabled}
          formData={formData ?? draft}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
        />
      ) : field.data_type === "decimal" || field.data_type === "integer" ? (
        <QtyUomInput
          value={draft[field.name]}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
          disabled={disabled}
          uomCode={uomCode || undefined}
        />
      ) : (
        <MetaFieldInput
          field={field}
          value={draft[field.name]}
          disabled={disabled}
          formData={formData ?? draft}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
        />
      )}
    </label>
  );
}

function resolveHowMuchOverflow(entity: CompiledEntity, config?: ItemTabConfig, amountConfig?: ProcureAmountConfig | null): EntityField[] {
  if (!config) return [];

  const layoutNames = new Set([
    ...config.primaryFields.map((f) => f.name),
    ...config.classifyFields.map((f) => f.name),
    ...config.quantityRow.map((f) => f.name),
  ]);
  const amountNames = new Set([
    amountConfig?.amountField,
    ...(amountConfig?.financialBar.map((f) => f.name) ?? []),
  ].filter((name): name is string => Boolean(name)));

  return fieldsForGroups(entity, ["item", "financial"])
    .filter((f) => !layoutNames.has(f.name))
    .filter((f) => !amountNames.has(f.name))
    .filter((f) => HOW_MUCH_DATA_TYPES.has(f.data_type));
}

function ComposerHowMuchPanel({
  entity,
  config,
  amountConfig,
  overflowFields,
  draft,
  onDraftChange,
  disabled,
  currencyCode,
  formData,
  variant = "default",
}: {
  entity:         CompiledEntity;
  config?:        ItemTabConfig;
  amountConfig?:  ProcureAmountConfig | null;
  overflowFields: EntityField[];
  draft:          Record<string, unknown>;
  onDraftChange:  (next: Record<string, unknown>) => void;
  disabled?:      boolean;
  currencyCode?:  string;
  formData?:      Record<string, unknown>;
  variant?:       "default" | "simple";
}) {
  const [qtyMode, setQtyMode] = useState<QtyMode>("qty_price");
  const simpleVariant = variant === "simple";
  const typeField = config?.classifyFields.find(
    (f) => f.data_type === "enum" || f.data_type === "lifecycle_state",
  );
  const typeValue       = typeField ? String(draft[typeField.name] ?? "") : "";
  const forceAmountOnly = AMOUNT_ONLY_TYPES.has(typeValue.toLowerCase());
  const effectiveMode: QtyMode = forceAmountOnly ? "amount_only" : qtyMode;
  const amountOnlyField = amountConfig
    ? fieldsForGroups(entity, ["item", "financial"]).find((f) => f.name === amountConfig.amountField)
      ?? entity.fields.find((f) => f.name === amountConfig.amountField)
    : null;
  const quantityRow = config?.quantityRow ?? [];
  const hasQtyToggle = quantityRow.length > 0 && !!amountOnlyField;
  const formulaFields = useMemo(
    () => uniqueEntityFields([...quantityRow, ...overflowFields]),
    [quantityRow, overflowFields],
  );

  function changeQtyMode(mode: QtyMode) {
    setQtyMode(mode);
    if (mode === "amount_only") {
      onDraftChange(clearDraftFields(draft, formulaFields));
      return;
    }
    onDraftChange(amountOnlyField ? clearDraftFields(draft, [amountOnlyField]) : draft);
  }

  if (!hasQtyToggle && quantityRow.length === 0 && !amountOnlyField && overflowFields.length === 0) return null;

  return (
    <div className={cn(simpleVariant ? "space-y-5" : "space-y-3.5")}>
      {hasQtyToggle && !forceAmountOnly && (
        <div
          className={cn(
            "inline-flex w-[220px] max-w-full overflow-hidden rounded-lg border border-input bg-background p-0.5",
          )}
        >
          {(["qty_price", "amount_only"] as QtyMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => changeQtyMode(mode)}
              className={cn(
                "h-8 w-[108px] shrink-0 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-40",
                effectiveMode === mode
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "qty_price" ? "Qty × Price" : "Amount only"}
            </button>
          ))}
        </div>
      )}

      {effectiveMode === "qty_price" && quantityRow.length > 0 && (
        <div className={cn("grid gap-3", simpleVariant ? "md:grid-cols-3" : "grid-cols-3")}>
          {quantityRow.map((field) => (
            <QuantityRowCell
              key={field.name}
              field={field}
              quantityRow={quantityRow}
              draft={draft}
              onDraftChange={onDraftChange}
              disabled={disabled}
              currencyCode={currencyCode}
              formData={formData}
            />
          ))}
        </div>
      )}

      {effectiveMode === "amount_only" && amountOnlyField && (
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={PROCURE_FIELD_LABEL_CLASS}>
            {fieldLabel(amountOnlyField)}
            {amountOnlyField.is_required && <span className="ml-0.5 text-destructive">*</span>}
          </span>
          <CurrencyInput
            value={draft[amountOnlyField.name]}
            onChange={(v) => onDraftChange({ ...draft, [amountOnlyField.name]: v })}
            disabled={disabled}
            currencyCode={currencyCode}
          />
        </label>
      )}

      {effectiveMode === "qty_price" && overflowFields.length > 0 && (
        <div className={cn("grid gap-3", simpleVariant ? "md:grid-cols-2" : "sm:grid-cols-2")}>
          {overflowFields.map((field) => (
            <QuantityRowCell
              key={field.name}
              field={field}
              quantityRow={quantityRow}
              draft={draft}
              onDraftChange={onDraftChange}
              disabled={disabled}
              currencyCode={currencyCode}
              formData={formData}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCORDION SECTION
// ─────────────────────────────────────────────────────────────────────────────

function ItemFieldsLayout({
  fields,
  draft,
  onDraftChange,
  disabled,
  formulaFields,
  amountField,
  formData,
  composerMode,
}: {
  fields:        EntityField[];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  formulaFields?: EntityField[];
  amountField?:   EntityField | null;
  formData?:      Record<string, unknown>;
  composerMode:   ProcureLineComposerMode;
}) {
  const typeField = fields.find(
    (field) =>
      field.name === "procurement_type" ||
      field.label?.trim().toLowerCase() === "type" ||
      field.data_type === "lifecycle_state",
  );
  const descriptionField = fields.find(
    (field) => field.name === "item_description" || field.data_type === "text",
  );
  const itemField = fields.find(isItemReferenceField);
  const commodityCategoryField = fields.find(isCommodityCategoryField);
  const businessIntentField = fields.find(isBusinessIntentField);
  const usedNames = new Set([
    typeField?.name,
    descriptionField?.name,
    itemField?.name,
    commodityCategoryField?.name,
    businessIntentField?.name,
  ].filter((name): name is string => Boolean(name)));
  const remainingFields = fields.filter((field) => !usedNames.has(field.name) && !isTaxonomyCodeField(field));

  function changeTypeValue(value: unknown) {
    if (!typeField) return;
    const previousType = String(draft[typeField.name] ?? "");
    const previousForceAmountOnly = AMOUNT_ONLY_TYPES.has(previousType.toLowerCase());
    const nextType = String(value ?? "");
    const nextForceAmountOnly = AMOUNT_ONLY_TYPES.has(nextType.toLowerCase());
    const nextDraft = { ...draft, [typeField.name]: value };

    if (nextForceAmountOnly) {
      onDraftChange(clearDraftFields(nextDraft, formulaFields ?? []));
      return;
    }

    if (previousForceAmountOnly) {
      onDraftChange(amountField ? clearDraftFields(nextDraft, [amountField]) : nextDraft);
      return;
    }

    onDraftChange(nextDraft);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
        <div className="space-y-3.5">
          {typeField && (
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={PROCURE_FIELD_LABEL_CLASS}>
                {fieldLabel(typeField)}
                {typeField.is_required && <span className="ml-0.5 text-destructive">*</span>}
              </span>
              <TypePillsField
                field={typeField}
                value={draft[typeField.name]}
                disabled={disabled}
                onChange={changeTypeValue}
              />
            </label>
          )}
          {descriptionField && (
            <DescriptionTextArea
              field={descriptionField}
              draft={draft}
              onDraftChange={onDraftChange}
              disabled={disabled}
            />
          )}
        </div>
        <div className="space-y-3.5">
          {itemField && (
            <FieldCell
              field={itemField}
              draft={draft}
              onDraftChange={onDraftChange}
              disabled={disabled}
              formData={formData}
              requiredOverride={composerMode === "catalog"}
            />
          )}
        </div>
      </div>

      {remainingFields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {remainingFields.map((field) => (
            <FieldCell
              key={field.name}
              field={field}
              draft={draft}
              onDraftChange={onDraftChange}
              disabled={disabled}
              suppressRequired={isOptionalClassificationDraftField(field)}
              formData={formData}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function normalizedEntityCode(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/-/g, "_").toLowerCase();
}

function isPurchaseInvoiceLineComposer(
  parentEntityCode: string,
  lineEntityCode: string | null | undefined,
  lineEntity: CompiledEntity | null | undefined,
): boolean {
  const parentCode = normalizedEntityCode(parentEntityCode);
  const lineCode = normalizedEntityCode(lineEntityCode || lineEntity?.entity_code || lineEntity?.table_name);
  return parentCode === "purchase_invoice" || lineCode === "purchase_invoice_line";
}

function AdvancedViewToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn(PROCURE_SECTION_LABEL_CLASS, "whitespace-nowrap")}>Advanced view</span>
      <div className="inline-flex h-8 overflow-hidden rounded-lg border border-input bg-background p-0.5">
        {[
          { label: "No", value: false },
          { label: "Yes", value: true },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-14 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-40",
              value === option.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SimplePurchaseLineFields({
  entity,
  config,
  amountConfig,
  draft,
  onDraftChange,
  disabled,
  currencyCode,
  formData,
  composerMode,
}: {
  entity: CompiledEntity;
  config: ItemTabConfig;
  amountConfig: ProcureAmountConfig | null;
  draft: Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  currencyCode?: string;
  formData?: Record<string, unknown>;
  composerMode: ProcureLineComposerMode;
}) {
  const typeField = config.classifyFields.find(
    (field) =>
      field.name === "procurement_type" ||
      field.label?.trim().toLowerCase() === "type" ||
      field.data_type === "lifecycle_state",
  ) ?? fieldsForNames(entity, ["procurement_type"])[0];
  const descriptionField = config.primaryFields.find((field) => field.name === "item_description")
    ?? config.primaryFields.find((field) => field.data_type === "text")
    ?? fieldsForNames(entity, ["item_description"])[0];
  const itemField = config.primaryFields.find(isItemReferenceField)
    ?? fieldsForNames(entity, ["item_id"])[0];
  const assetFields = useMemo(() => assetFieldsForEntity(entity), [entity]);
  const overflowFields = useMemo(
    () => resolveHowMuchOverflow(entity, config, amountConfig).filter(isPriceUnitField),
    [amountConfig, config, entity],
  );

  return (
    <div className="px-5 py-5">
      <div className={cn(PROCURE_FIELD_BOX_CLASS, "space-y-4")}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
          {typeField && (
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={PROCURE_FIELD_LABEL_CLASS}>
                {fieldLabel(typeField)}
                {typeField.is_required && <span className="ml-0.5 text-destructive">*</span>}
              </span>
              <TypePillsField
                field={typeField}
                value={draft[typeField.name]}
                disabled={disabled}
                onChange={(value) => onDraftChange({ ...draft, [typeField.name]: value })}
              />
            </label>
          )}

          {itemField && (
            <FieldCell
              field={itemField}
              draft={draft}
              onDraftChange={onDraftChange}
              disabled={disabled}
              formData={formData}
              requiredOverride={composerMode === "catalog"}
            />
          )}
        </div>

        {descriptionField && (
          <DescriptionTextArea
            field={descriptionField}
            draft={draft}
            onDraftChange={onDraftChange}
            disabled={disabled}
          />
        )}

        <ComposerHowMuchPanel
          entity={entity}
          config={config}
          amountConfig={amountConfig}
          overflowFields={overflowFields}
          draft={draft}
          onDraftChange={onDraftChange}
          disabled={disabled}
          currencyCode={currencyCode}
          formData={formData}
          variant="simple"
        />

        {assetFields.length > 0 && (
          <>
            <div className="border-t border-border/30" />
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              {assetFields.map((field) => (
                <FieldCell
                  key={field.name}
                  field={field}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  disabled={disabled}
                  formData={formData}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AccordionSection({
  section,
  entity,
  draft,
  onDraftChange,
  disabled,
  itemConfig,
  amountConfig,
  explicitFieldOwners,
  currencyCode,
  formData,
  composerMode,
}: {
  section:        ProcureComposerSection;
  entity:         CompiledEntity;
  draft:          Record<string, unknown>;
  onDraftChange:  (next: Record<string, unknown>) => void;
  disabled?:      boolean;
  itemConfig?:    ItemTabConfig;
  amountConfig?:  ProcureAmountConfig | null;
  explicitFieldOwners: Map<string, string>;
  currencyCode?:  string;
  formData?:      Record<string, unknown>;
  composerMode:   ProcureLineComposerMode;
}) {
  const [open, setOpen] = useState(section.defaultOpen);
  const isItemSection    = section.key === "item" || section.groups.includes("item");
  const isHowMuchSection = section.key === "financial" || section.groups.includes("financial") || section.label.toLowerCase() === "how much";
  const isDimensionsSection = section.key === "dimensions" || section.groups.includes("dimensions");
  const overflowFields   = useMemo(
    () => resolveHowMuchOverflow(entity, itemConfig, amountConfig),
    [amountConfig, entity, itemConfig],
  );
  const amountOnlyField = useMemo(
    () => amountConfig ? entity.fields.find((field) => field.name === amountConfig.amountField) ?? null : null,
    [amountConfig, entity.fields],
  );
  const formulaFields = useMemo(
    () => uniqueEntityFields([...(itemConfig?.quantityRow ?? []), ...overflowFields]),
    [itemConfig, overflowFields],
  );
  const howMuchFieldNames = useMemo(
    () => new Set([
      ...(itemConfig?.quantityRow.map((field) => field.name) ?? []),
      ...overflowFields.map((field) => field.name),
    ]),
    [itemConfig, overflowFields],
  );
  const computedAmountFieldNames = useMemo(
    () => new Set([
      amountConfig?.amountField,
      ...(amountConfig?.summaryFields.map((field) => field.name) ?? []),
      ...(amountConfig?.financialBar.map((field) => field.name) ?? []),
    ].filter((name): name is string => Boolean(name))),
    [amountConfig],
  );
  const fields = useMemo(
    () => {
      const groupKeys = isItemSection ? unique([...section.groups, "classification"]) : section.groups;
      const sectionFieldNames = new Set(section.fields);
      const explicitFields = fieldsForNames(entity, section.fields);
      const raw = fieldsForGroups(entity, groupKeys)
        .filter((field) => {
          const owner = explicitFieldOwners.get(field.name);
          return !owner || owner === section.key;
        })
        .filter((field) => !sectionFieldNames.has(field.name));
      const merged = uniqueEntityFields([
        ...explicitFields,
        ...raw,
        ...(isItemSection ? assetFieldsForEntity(entity) : []),
      ]);
      const ordered = isDimensionsSection ? orderDimensionComposerFields(merged) : merged;
      if (isItemSection) return typeFieldFirst(ordered.filter((field) => !howMuchFieldNames.has(field.name)));
      if (isHowMuchSection) {
        return ordered.filter((field) => !computedAmountFieldNames.has(field.name));
      }
      return ordered;
    },
    [
      computedAmountFieldNames,
      entity,
      explicitFieldOwners,
      howMuchFieldNames,
      isDimensionsSection,
      isHowMuchSection,
      isItemSection,
      section.fields,
      section.groups,
      section.key,
    ],
  );
  const hasHowMuchPanel =
    isHowMuchSection &&
    ((itemConfig?.quantityRow.length ?? 0) > 0 || overflowFields.length > 0 || Boolean(amountConfig?.amountField));

  return (
    <div className="border-b border-border/40 last:border-b-0">
      {/* ── Header ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-muted/20 transition-colors"
      >
        <span className={PROCURE_SECTION_LABEL_CLASS}>
          {displayProcureLabel(section.label)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* ── Body ── */}
      {open && (
        <div className="px-5 pb-5">
          {section.type === "classification" ? (
            fields.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <FieldCell
                    key={field.name}
                    field={field}
                    draft={draft}
                    onDraftChange={onDraftChange}
                    disabled={disabled}
                    suppressRequired={isOptionalClassificationDraftField(field)}
                    formData={formData}
                  />
                ))}
              </div>
            ) : null
          ) : hasHowMuchPanel || fields.length > 0 ? (
            <div className="space-y-4">
              {isHowMuchSection && (
                <ComposerHowMuchPanel
                  entity={entity}
                  config={itemConfig}
                  amountConfig={amountConfig}
                  overflowFields={overflowFields}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  disabled={disabled}
                  currencyCode={currencyCode}
                  formData={formData}
                />
              )}
              {isItemSection && fields.length > 0 ? (
                <ItemFieldsLayout
                  fields={fields}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  disabled={disabled}
                  formulaFields={formulaFields}
                  amountField={amountOnlyField}
                  formData={formData}
                  composerMode={composerMode}
                />
              ) : fields.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.map((field) => (
                    <FieldCell
                      key={field.name}
                      field={field}
                      draft={draft}
                      onDraftChange={onDraftChange}
                      disabled={disabled}
                      formData={formData}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 py-1">No configurable fields.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Shared field cell — same style as MetaLineForm
function FieldCell({
  field,
  draft,
  onDraftChange,
  disabled,
  requiredOverride,
  suppressRequired,
  formData,
}: {
  field:         ReturnType<typeof fieldsForGroups>[number];
  draft:         Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?:     boolean;
  requiredOverride?: boolean;
  suppressRequired?: boolean;
  formData?:     Record<string, unknown>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={PROCURE_FIELD_LABEL_CLASS}>
        {fieldLabel(field)}
        {!suppressRequired && (field.is_required || requiredOverride) && (
          <span className="ml-0.5 text-destructive">*</span>
        )}
      </span>
      {field.data_type === "enum" || field.data_type === "lifecycle_state" ? (
        <TypePillsField
          field={field}
          value={draft[field.name]}
          disabled={disabled}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
        />
      ) : (
        <MetaFieldInput
          field={field}
          value={draft[field.name]}
          disabled={disabled}
          formData={formData ?? draft}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
        />
      )}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPS — intentionally mirrors LineComposerSheetProps
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcureLineComposerSheetProps {
  open:              boolean;
  onOpenChange:      (open: boolean) => void;
  line?:             DocumentLine | null;
  entityCode:        string;
  recordId:          string;
  currencyCode?:     string;
  companyCodeId?:    string;
  record?:           Record<string, unknown>;
  lineEntity?:       CompiledEntity | null;
  lineEntityCode?:   string | null;
  suggestBaseUrl?:   string;
  classifyBaseUrl?:  string;
  composerMode?:     ProcureLineComposerMode;
  onMutated?:        () => void;
  /** Draft mode: skip server call, hand payload to caller instead. */
  onDraftSubmit?:    (payload: Record<string, unknown>) => void | Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function ProcureLineComposerSheet({
  open,
  onOpenChange,
  line,
  entityCode,
  recordId: parentRecordId,
  currencyCode,
  companyCodeId,
  record,
  lineEntity,
  lineEntityCode,
  composerMode = "manual",
  onMutated,
  onDraftSubmit,
}: ProcureLineComposerSheetProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedEntity;

  // Phase 6d: same fork as LineComposerSheet — when an Edit Session is active,
  // Save queues the line into the bundle for atomic commit.
  const editSession = useEditSessionContext();

  const sections = useMemo(
    () => resolveProcureComposerSections(resolvedEntity),
    [resolvedEntity],
  );
  const explicitFieldOwners = useMemo(
    () => explicitComposerFieldOwners(sections),
    [sections],
  );
  const itemSectionGroups = useMemo(
    () => sections.find((section) => section.key === "item")?.groups ?? ["item"],
    [sections],
  );
  const itemTabConfig = useMemo(
    () => resolveItemTabConfig(resolvedEntity, unique([...itemSectionGroups, "financial", "classification"])),
    [itemSectionGroups, resolvedEntity],
  );
  const amountConfig = useMemo(
    () => resolveProcureAmountConfig(resolvedEntity),
    [resolvedEntity],
  );

  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [advancedView, setAdvancedView] = useState(false);
  const fieldFormData = useMemo(
    () => withHeaderCompanyCodeContext(draft, record, companyCodeId),
    [companyCodeId, draft, record],
  );

  const isNew   = !line;
  const lineKey = recordId(line as LineRecord | null | undefined);
  const hasPurchaseInvoiceSimpleView = isPurchaseInvoiceLineComposer(entityCode, lineEntityCode, resolvedEntity);
  const defaultProcurementSettings = useDefaultProcurementLineSettings(hasPurchaseInvoiceSimpleView);

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    const nextDraft = initialDraft(resolvedEntity, line as LineRecord | null | undefined);
    const withDefaults = isNew ? withNewProcureLineDefaults(nextDraft) : nextDraft;
    const purchaseInvoiceDefaults = isNew && hasPurchaseInvoiceSimpleView
      ? withStandaloneDefaultUom(
          withDefaultProcurementType(
            withDefaults,
            resolvedEntity,
            defaultProcurementSettings.procurementType,
            { replaceExisting: true },
          ),
          resolvedEntity,
          defaultProcurementSettings.uomCode,
          { headerRecord: record, replaceExisting: true },
        )
      : withDefaults;
    setDraft(purchaseInvoiceDefaults);
    setSaveError(null);
  }, [hasPurchaseInvoiceSimpleView, isNew, lineKey, line, open, resolvedEntity]);

  useEffect(() => {
    if (!open || !isNew || !hasPurchaseInvoiceSimpleView || !resolvedEntity) return;
    setDraft((prev) => withStandaloneDefaultUom(
      withDefaultProcurementType(
        prev,
        resolvedEntity,
        defaultProcurementSettings.procurementType,
        { replaceFallback: true },
      ),
      resolvedEntity,
      defaultProcurementSettings.uomCode,
      { headerRecord: record, replaceFallback: true },
    ));
  }, [
    defaultProcurementSettings.procurementType,
    defaultProcurementSettings.uomCode,
    hasPurchaseInvoiceSimpleView,
    isNew,
    open,
    record,
    resolvedEntity,
  ]);

  useEffect(() => {
    if (open && hasPurchaseInvoiceSimpleView) setAdvancedView(false);
  }, [composerMode, hasPurchaseInvoiceSimpleView, lineKey, open]);

  const title    = useMemo(() => {
    const currentTitle = titleFor(resolvedEntity, line, draft);
    if (!isNew || !resolvedEntity) return currentTitle;
    const titleField = resolveTitleField(resolvedEntity);
    const titleValue = titleField ? draftOrLineValue(draft, line, titleField) : undefined;
    if (nonEmptyText(titleValue)) return currentTitle;
    return composerMode === "catalog" ? "Add Catalog Item" : "Add Item";
  }, [composerMode, draft, isNew, line, resolvedEntity]);
  const subtitle = useMemo(
    () => subtitleFor(resolvedEntity, line, draft, currencyCode),
    [currencyCode, draft, line, resolvedEntity],
  );

  async function save() {
    if (!resolvedEntity) return;

    const payload = isNew
      ? buildCreatePayload(resolvedEntity, draft)
      : buildLinePatch(resolvedEntity, draft, line as LineRecord);

    if (!isNew && Object.keys(payload).length === 0) { onOpenChange(false); return; }

    const validationError = procureValidationMessage(resolvedEntity, itemTabConfig, amountConfig, draft, composerMode);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    // Draft mode (intake wizard) — skip network, hand full payload to caller.
    if (onDraftSubmit) {
      setSaving(true);
      setSaveError(null);
      try {
        await onDraftSubmit(payload);
        onOpenChange(false);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to update draft line");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Edit Session route: queue the change for atomic save. Same pattern as
    // LineComposerSheet — onDraftSubmit takes precedence (intake wizard).
    if (editSession?.isEditing) {
      if (isNew) {
        editSession.addLine(payload);
      } else if (lineKey) {
        editSession.updateLine(lineKey, payload as Record<string, unknown>);
      }
      onMutated?.();
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await relayMutate(
        isNew
          ? collectionUrl(entityCode, parentRecordId)
          : itemUrl(entityCode, parentRecordId, lineKey),
        { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as SaveErrorBody;
        setSaveError(saveErrorMessage(body, res.status));
        return;
      }
      onMutated?.();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={`${entityCode}:procure-line-composer`}
      defaultWidth={560}
      expandedWidth={880}
      minWidth={380}
      maxWidth="92vw"
      resizable
      expandable
      badgeDetail={procureSheetBadge(
        isNew
          ? (composerMode === "catalog" ? "Add Catalog Item" : "Add Item")
          : displayProcureLabel(resolvedEntity?.entity_name ?? "Line"),
      )}
      title={<span title={title}>{compactHeaderTitle(title)}</span>}
      subtitle={subtitle}
      headerRight={
        hasPurchaseInvoiceSimpleView ? (
          <AdvancedViewToggle
            value={advancedView}
            onChange={setAdvancedView}
            disabled={saving}
          />
        ) : undefined
      }
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {saveError}
          </span>
        ) : amountConfig ? (
          <FooterAmount
            line={line}
            draft={draft}
            amountConfig={amountConfig}
            currencyCode={currencyCode}
          />
        ) : undefined
      }
      footerEnd={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !resolvedEntity}
            className="h-8 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {saving
              ? "Saving..."
              : onDraftSubmit
                ? (isNew ? (composerMode === "catalog" ? "Add catalog item" : "Add item") : "Update")
                : isNew
                  ? (composerMode === "catalog" ? "Add catalog item" : "Add item")
                  : "Save"}
          </button>
        </>
      }
    >
      {resolvedEntity ? (
        sections.length > 0 ? (
          <div>
            {hasPurchaseInvoiceSimpleView && !advancedView ? (
              <SimplePurchaseLineFields
                entity={resolvedEntity}
                config={itemTabConfig}
                amountConfig={amountConfig}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving}
                currencyCode={currencyCode}
                formData={fieldFormData}
                composerMode={composerMode}
              />
            ) : (
              sections.map((section) => (
                <AccordionSection
                  key={section.key}
                  section={section}
                  entity={resolvedEntity}
                  draft={draft}
                  onDraftChange={setDraft}
                  disabled={saving}
                  itemConfig={itemTabConfig}
                  amountConfig={amountConfig}
                  explicitFieldOwners={explicitFieldOwners}
                  currencyCode={currencyCode}
                  formData={fieldFormData}
                  composerMode={composerMode}
                />
              ))
            )}
          </div>
        ) : (
          /* Fallback: generic flat form — identical to LineComposerSheet */
          <MetaLineForm
            entity={resolvedEntity}
            draft={draft}
            onDraftChange={setDraft}
            disabled={saving}
          />
        )
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Line metadata is not configured for this document.
        </div>
      )}
    </DrawerShell>
  );
}
