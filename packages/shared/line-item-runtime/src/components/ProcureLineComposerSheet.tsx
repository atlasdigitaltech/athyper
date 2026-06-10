"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import { fmtAmount } from "@athyper/runtime-shared/core";
import { cn } from "@athyper/theme/utils";
import {
  buildCreatePayload,
  buildLinePatch,
  fieldLabel,
  fieldOptions,
  formatFieldValue,
  initialDraft,
  isUomLikeField,
  recordId,
  recordValue,
  resolveTitleField,
  useCompiledEntityMetadata,
} from "../meta";
import type { LineRecord, LineItemComposerProps, LineItemSection, LineItemAmountConfig } from "../types";
import {
  type ProcureItemTabConfig,
  fieldsForGroups,
  resolveProcureItemTabConfig,
  resolveProcureAmountConfig,
  resolveProcureComposerSections,
} from "../variants/procure";
import { MetaFieldInput } from "./MetaFieldInput";
import { MetaLineForm } from "./MetaLineForm";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABEL_CLASS    = "text-sm font-medium leading-normal text-muted-foreground";
const SECTION_LABEL_CLASS  = "text-sm font-medium leading-normal text-muted-foreground";
const FIELD_BOX_CLASS      = "rounded-lg border bg-card px-5 py-5 text-card-foreground shadow-sm";

const DEFAULT_PROCUREMENT_TYPE_NAMESPACE      = "finance.ap";
const DEFAULT_PROCUREMENT_TYPE_PARAMETER_CODE = "finance.ap.default_procurement_line_type";
const DEFAULT_PROCUREMENT_UOM_PARAMETER_CODE  = "finance.ap.default_procurement_line_uom";
const PROCURE_LINE_DEFAULT_TYPE_FALLBACK      = "goods";
const PROCURE_LINE_DEFAULT_UOM_FALLBACK       = "EA";
const PROCUREMENT_TYPE_CODES = new Set(["goods", "services", "mixed", "freight", "misc"]);
const AMOUNT_ONLY_TYPES      = new Set(["mixed", "freight", "misc"]);

const HEADER_DOCUMENT_REFERENCE_FIELDS = [
  "commitment_id", "purchase_order_id", "po_id",
  "goods_receipt_id", "service_entry_sheet_id", "ses_id",
  "source_document_id", "source_doc_id", "reference_document_id", "ref_doc_id",
];

const SOURCE_DOCUMENT_REFERENCE_TOKENS = [
  "commitment", "purchase_order", "purchase order", "po line",
  "goods_receipt", "goods receipt", "gr line",
  "service_entry", "service entry", "ses",
];

const DIMENSION_COMPOSER_FIELD_ORDER = [
  "cost_center_id", "project_id", "profit_center_id", "site_id",
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function collectionUrl(entityCode: string, parentId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines`;
}

function itemUrl(entityCode: string, parentId: string, lineId: string): string {
  return `${collectionUrl(entityCode, parentId)}/${encodeURIComponent(lineId)}`;
}

type SaveErrorBody = { error?: string; message?: string; detail?: string; details?: unknown };

function saveErrorMessage(body: SaveErrorBody, status: number): string {
  const main = body.message ?? body.detail ?? body.error;
  if (main) return body.error && body.error !== main ? `${main} (${body.error})` : main;
  if (body.details) return typeof body.details === "string" ? body.details : JSON.stringify(body.details);
  return `Save failed (${status})`;
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

function displayProcureLabel(value: string | null | undefined): string {
  const text = String(value ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function compactHeaderTitle(value: string, limit = 50): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

function isMissingRequiredValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isMoneyField(field: EntityField): boolean {
  return field.data_type === "money" || (field.data_type === "decimal" && /price|rate|cost|value/i.test(field.name));
}

function isPriceUnitField(field: EntityField): boolean {
  return field.name === "price_unit" || field.name === "price_per";
}

function isItemReferenceField(field: EntityField): boolean {
  const ref = field.reference_config as Record<string, unknown> | null | undefined;
  return field.name === "item_id" || ref?.["target_entity"] === "item";
}

function isCommodityCategoryField(field: EntityField): boolean {
  return /(commodity|spend)[_-]?category/i.test(field.name);
}

function isBusinessIntentField(field: EntityField): boolean {
  return /business[_-]?intent/i.test(field.name);
}

function isTaxonomyCodeField(field: EntityField): boolean {
  const text = `${field.name} ${field.column_name ?? ""} ${field.label ?? ""}`.toLowerCase();
  return text.includes("unspsc") || text.includes("commodity code") || /\bhs\b/.test(text) || text.includes("tariff");
}

function isOptionalClassificationDraftField(field: EntityField): boolean {
  return isCommodityCategoryField(field) || isBusinessIntentField(field) || isTaxonomyCodeField(field);
}

function emptyDraftValueForField(field: EntityField): unknown {
  if (field.name === "price_unit") return 1;
  return field.data_type === "boolean" ? false : "";
}

function clearDraftFields(draft: Record<string, unknown>, fields: EntityField[]): Record<string, unknown> {
  if (fields.length === 0) return draft;
  const next = { ...draft };
  for (const field of fields) next[field.name] = emptyDraftValueForField(field);
  return next;
}

function draftValue(draft: Record<string, unknown>, fieldOrName: EntityField | string): unknown {
  const name = typeof fieldOrName === "string" ? fieldOrName : fieldOrName.name;
  if (Object.prototype.hasOwnProperty.call(draft, name)) return draft[name];
  const data = draft.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const dataRecord = data as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(dataRecord, name)) return dataRecord[name];
  }
  return undefined;
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

function procurementTypeField(entity: CompiledEntity | null | undefined): EntityField | undefined {
  return entity?.fields.find(
    (f) => f.name === "procurement_type" || f.label?.trim().toLowerCase() === "type",
  );
}

function uniqueEntityFields(fields: EntityField[]): EntityField[] {
  const seen = new Set<string>();
  return fields.filter((f) => { if (seen.has(f.name)) return false; seen.add(f.name); return true; });
}

function fieldsForNames(entity: CompiledEntity, names: string[], editableOnly = true): EntityField[] {
  const byName = new Map(entity.fields.map((f) => [f.name, f]));
  return names.flatMap((name) => {
    const f = byName.get(name);
    if (!f) return [];
    if (editableOnly && (f.is_readonly || f.origin === "system" || f.is_computed)) return [];
    return [f];
  });
}

function orderDimensionFields(fields: EntityField[]): EntityField[] {
  const rank = new Map(DIMENSION_COMPOSER_FIELD_ORDER.map((name, i) => [name, i]));
  return [...fields].sort((a, b) => {
    const ar = rank.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const br = rank.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    return ar - br;
  });
}

function typeFieldFirst(fields: EntityField[]): EntityField[] {
  const idx = fields.findIndex(
    (f) => f.name === "procurement_type" || f.label?.trim().toLowerCase() === "type",
  );
  if (idx <= 0) return fields;
  return [fields[idx]!, ...fields.filter((_, i) => i !== idx)];
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
  const canReplace = !current || options.replaceExisting === true ||
    (options.replaceFallback === true && current === PROCURE_LINE_DEFAULT_TYPE_FALLBACK);
  if (!canReplace || current === nextType) return draft;
  return { ...draft, [typeField.name]: nextType };
}

function headerHasSourceDocumentReference(headerRecord?: Record<string, unknown> | null): boolean {
  return HEADER_DOCUMENT_REFERENCE_FIELDS.some((name) => Boolean(headerRecord?.[name]?.toString().trim()));
}

function isSourceDocumentReferenceField(field: EntityField): boolean {
  const ref = field.reference_config as Record<string, unknown> | null | undefined;
  const text = [field.name, field.column_name, field.label, ref?.["target_entity"], field.group_key]
    .filter(Boolean).join(" ").toLowerCase();
  return SOURCE_DOCUMENT_REFERENCE_TOKENS.some((token) => text.includes(token));
}

function itemReferenceHasValue(draft: Record<string, unknown>, entity: CompiledEntity | null | undefined): boolean {
  return entity?.fields.filter(isItemReferenceField).some((f) => !isMissingRequiredValue(draftValue(draft, f))) === true;
}

function isUomIdLikeField(field: EntityField): boolean {
  return /(^|_)id$/i.test(field.name);
}

function withStandaloneDefaultUom(
  draft:         Record<string, unknown>,
  entity:        CompiledEntity | null | undefined,
  defaultUomCode: string,
  options: { headerRecord?: Record<string, unknown> | null; replaceExisting?: boolean; replaceFallback?: boolean } = {},
): Record<string, unknown> {
  if (!entity) return draft;
  if (itemReferenceHasValue(draft, entity)) return draft;
  if (headerHasSourceDocumentReference(options.headerRecord)) return draft;
  if (entity.fields.filter(isSourceDocumentReferenceField).some((f) => !isMissingRequiredValue(draftValue(draft, f)))) return draft;

  const nextUom = normalizedProcurementUom(defaultUomCode);
  const uomFields = entity.fields.filter((f) => isUomLikeField(f) && !isUomIdLikeField(f));
  let next = draft;
  for (const field of uomFields) {
    const current = nonEmptyText(draftValue(next, field));
    const canReplace = !current || options.replaceExisting === true ||
      (options.replaceFallback === true && normalizedProcurementUom(current) === PROCURE_LINE_DEFAULT_UOM_FALLBACK);
    if (!canReplace || (current && normalizedProcurementUom(current) === nextUom)) continue;
    next = next === draft ? { ...draft } : next;
    next[field.name] = nextUom;
  }
  return next;
}

function withHeaderCompanyCodeContext(
  draft:          Record<string, unknown>,
  headerRecord?:  Record<string, unknown> | null,
  companyCodeId?: string,
): Record<string, unknown> {
  const headerCompanyCodeId = nonEmptyText(companyCodeId) ?? nonEmptyText(headerRecord?.["company_code_id"]);
  const context = { ...(headerRecord ?? {}), ...draft };
  if (headerCompanyCodeId) context["company_code_id"] = headerCompanyCodeId;
  return context;
}

function titleFor(
  entity: CompiledEntity | null,
  line:   DocumentLine | null | undefined,
  draft:  Record<string, unknown>,
): string {
  const fallback = line ? `Edit ${entity?.entity_name ?? "line"}` : `Add ${entity?.entity_name ?? "line"}`;
  const tf    = resolveTitleField(entity);
  const title = tf ? draftOrLineValue(draft, line, tf) : undefined;
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
    const uom = nonEmptyText(draftOrLineValue(draft, line, "unit_code")) ?? nonEmptyText(draftOrLineValue(draft, line, "uom_code"));
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

function normalizedEntityCode(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/-/g, "_").toLowerCase();
}

function isPurchaseInvoiceLike(
  parentEntityCode: string,
  lineEntityCode:   string | null | undefined,
  lineEntity:       CompiledEntity | null | undefined,
): boolean {
  const parentCode = normalizedEntityCode(parentEntityCode);
  const lineCode   = normalizedEntityCode(lineEntityCode || lineEntity?.entity_code || lineEntity?.table_name);
  return parentCode === "purchase_invoice" || lineCode === "purchase_invoice_line";
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOTER AMOUNT
// ─────────────────────────────────────────────────────────────────────────────

function FooterAmount({
  line,
  draft,
  amountConfig,
  currencyCode,
}: {
  line?:         DocumentLine | null;
  draft:         Record<string, unknown>;
  amountConfig:  LineItemAmountConfig;
  currencyCode?: string;
}) {
  const netAmt   = finiteNumber(draftOrLineValue(draft, line, "net_amount")) ?? 0;
  const discAmt  = finiteNumber(draftOrLineValue(draft, line, "discount_amount")) ?? 0;
  const taxAmt   = finiteNumber(draftOrLineValue(draft, line, "tax_amount")) ?? 0;
  const chgAmt   = finiteNumber(draftOrLineValue(draft, line, "charges_amount")) ?? 0;
  const grossAmt = roundMoney(netAmt - discAmt + taxAmt + chgAmt);

  const currency = currencyCode || "";
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const segments = amountConfig.financialBar
    .map(({ name, label }) => {
      const raw =
        name === "net_amount"    ? netAmt   :
        name === "discount_amount" ? discAmt :
        name === "tax_amount"    ? taxAmt   :
        name === "charges_amount"  ? chgAmt :
        name === "gross_amount"  ? grossAmt :
        finiteNumber(draftOrLineValue(draft, line, name));
      const n = Number(raw ?? 0);
      return Math.abs(n) > 0.0001 ? { label, value: n } : null;
    })
    .filter((s): s is { label: string; value: number } => s !== null);

  if (segments.length === 0) return null;

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      {segments.map(({ label, value }, i) => (
        <span key={label || i} className="flex items-baseline gap-1 tabular-nums">
          {label && <span className="text-muted-foreground">{label}</span>}
          <span className="font-medium text-foreground">
            {fmt(value)}
            {currency && <span className="ml-0.5 font-normal text-muted-foreground">{currency}</span>}
          </span>
          {i < segments.length - 1 && <span className="text-border">·</span>}
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE PILLS
// ─────────────────────────────────────────────────────────────────────────────

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
  const opts = fieldOptions(field);
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
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD CELL
// ─────────────────────────────────────────────────────────────────────────────

function FieldCell({
  field,
  draft,
  onDraftChange,
  disabled,
  requiredOverride,
  suppressRequired,
  formData,
}: {
  field:             EntityField;
  draft:             Record<string, unknown>;
  onDraftChange:     (next: Record<string, unknown>) => void;
  disabled?:         boolean;
  requiredOverride?: boolean;
  suppressRequired?: boolean;
  formData?:         Record<string, unknown>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>
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
// ACCORDION SECTION
// ─────────────────────────────────────────────────────────────────────────────

function AccordionSection({
  section,
  entity,
  draft,
  onDraftChange,
  disabled,
  itemConfig,
  amountConfig,
  currencyCode,
  formData,
  composerMode,
  explicitFieldOwners,
}: {
  section:             LineItemSection;
  entity:              CompiledEntity;
  draft:               Record<string, unknown>;
  onDraftChange:       (next: Record<string, unknown>) => void;
  disabled?:           boolean;
  itemConfig?:         ProcureItemTabConfig;
  amountConfig?:       LineItemAmountConfig | null;
  currencyCode?:       string;
  formData?:           Record<string, unknown>;
  composerMode:        "manual" | "catalog";
  explicitFieldOwners: Map<string, string>;
}) {
  const [open, setOpen] = useState(section.defaultOpen);
  const isItemSection     = section.type === "item";
  const isDimsSection     = section.type === "dimensions";

  const fields = useMemo(() => {
    const sectionFieldNames = new Set(section.fields);
    const explicitFields = fieldsForNames(entity, section.fields);
    const groupFields    = fieldsForGroups(entity, section.groups).filter((f) => {
      const owner = explicitFieldOwners.get(f.name);
      return !owner || owner === section.key;
    }).filter((f) => !sectionFieldNames.has(f.name));
    const assetFields = isItemSection ? entity.fields.filter(
      (f) => (f.name === "is_asset" || f.name === "asset_category_id") && !f.is_readonly,
    ) : [];
    const merged = uniqueEntityFields([...explicitFields, ...groupFields, ...assetFields]);
    return isDimsSection ? orderDimensionFields(merged) : isItemSection ? typeFieldFirst(merged) : merged;
  }, [entity, explicitFieldOwners, isDimsSection, isItemSection, section]);

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/20"
      >
        <span className={SECTION_LABEL_CLASS}>{displayProcureLabel(section.label)}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground/50 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
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
          ) : fields.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <FieldCell
                  key={field.name}
                  field={field}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  disabled={disabled}
                  formData={formData}
                  requiredOverride={isItemReferenceField(field) && composerMode === "catalog"}
                  suppressRequired={isOptionalClassificationDraftField(field)}
                />
              ))}
            </div>
          ) : (
            <p className="py-1 text-xs text-muted-foreground/50">No configurable fields.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT SETTINGS HOOK
// ─────────────────────────────────────────────────────────────────────────────

type DefaultProcurementLineSettings = { procurementType: string; uomCode: string };

function useDefaultProcurementLineSettings(enabled: boolean): DefaultProcurementLineSettings {
  const [settings, setSettings] = useState<DefaultProcurementLineSettings>({
    procurementType: PROCURE_LINE_DEFAULT_TYPE_FALLBACK,
    uomCode: PROCURE_LINE_DEFAULT_UOM_FALLBACK,
  });

  useEffect(() => {
    if (!enabled) { setSettings({ procurementType: PROCURE_LINE_DEFAULT_TYPE_FALLBACK, uomCode: PROCURE_LINE_DEFAULT_UOM_FALLBACK }); return; }
    let cancelled = false;
    void fetch(`/api/iam/parameters/effective?namespace=${encodeURIComponent(DEFAULT_PROCUREMENT_TYPE_NAMESPACE)}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<{ values?: Record<string, unknown> }> : null)
      .then((body) => {
        if (cancelled) return;
        setSettings({
          procurementType: normalizedProcurementType(body?.values?.[DEFAULT_PROCUREMENT_TYPE_PARAMETER_CODE]),
          uomCode: normalizedProcurementUom(body?.values?.[DEFAULT_PROCUREMENT_UOM_PARAMETER_CODE]),
        });
      })
      .catch(() => { if (!cancelled) setSettings({ procurementType: PROCURE_LINE_DEFAULT_TYPE_FALLBACK, uomCode: PROCURE_LINE_DEFAULT_UOM_FALLBACK }); });
    return () => { cancelled = true; };
  }, [enabled]);

  return settings;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCURE LINE COMPOSER SHEET
// ─────────────────────────────────────────────────────────────────────────────

export function ProcureLineComposerSheet({
  open,
  onOpenChange,
  line,
  entityCode,
  recordId:       parentRecordId,
  currencyCode,
  companyCodeId,
  record,
  lineEntity,
  lineEntityCode,
  composerMode = "manual",
  onMutated,
  onDraftSubmit,
}: LineItemComposerProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedEntity;

  const sections = useMemo(() => resolveProcureComposerSections(resolvedEntity), [resolvedEntity]);
  const explicitFieldOwners = useMemo(() => {
    const owners = new Map<string, string>();
    for (const s of sections) for (const f of s.fields) if (!owners.has(f)) owners.set(f, s.key);
    return owners;
  }, [sections]);

  const itemSectionGroups = useMemo(
    () => sections.find((s) => s.key === "item")?.groups ?? ["item"],
    [sections],
  );
  const itemTabConfig = useMemo(
    () => resolveProcureItemTabConfig(resolvedEntity, [...new Set([...itemSectionGroups, "financial", "classification"])]),
    [itemSectionGroups, resolvedEntity],
  );
  const amountConfig = useMemo(() => resolveProcureAmountConfig(resolvedEntity), [resolvedEntity]);

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
  const hasPurchaseInvoiceSimpleView = isPurchaseInvoiceLike(entityCode, lineEntityCode, resolvedEntity);
  const defaultSettings = useDefaultProcurementLineSettings(hasPurchaseInvoiceSimpleView);

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    let nextDraft = initialDraft(resolvedEntity, line as LineRecord | null | undefined);
    if (isNew) {
      nextDraft = withNewProcureLineDefaults(nextDraft);
      if (hasPurchaseInvoiceSimpleView) {
        nextDraft = withStandaloneDefaultUom(
          withDefaultProcurementType(nextDraft, resolvedEntity, defaultSettings.procurementType, { replaceExisting: true }),
          resolvedEntity, defaultSettings.uomCode, { headerRecord: record, replaceExisting: true },
        );
      }
    }
    setDraft(nextDraft);
    setSaveError(null);
  }, [lineKey, open, resolvedEntity, hasPurchaseInvoiceSimpleView]);

  useEffect(() => {
    if (!open || !isNew || !hasPurchaseInvoiceSimpleView || !resolvedEntity) return;
    setDraft((prev) => withStandaloneDefaultUom(
      withDefaultProcurementType(prev, resolvedEntity, defaultSettings.procurementType, { replaceFallback: true }),
      resolvedEntity, defaultSettings.uomCode, { headerRecord: record, replaceFallback: true },
    ));
  }, [defaultSettings.procurementType, defaultSettings.uomCode, hasPurchaseInvoiceSimpleView, isNew, open, record, resolvedEntity]);

  useEffect(() => {
    if (open && hasPurchaseInvoiceSimpleView) setAdvancedView(false);
  }, [composerMode, hasPurchaseInvoiceSimpleView, lineKey, open]);

  const title    = useMemo(() => titleFor(resolvedEntity, line, draft), [draft, line, resolvedEntity]);
  const subtitle = useMemo(() => subtitleFor(resolvedEntity, line, draft, currencyCode), [currencyCode, draft, line, resolvedEntity]);

  async function save() {
    if (!resolvedEntity) return;
    const payload = isNew
      ? buildCreatePayload(resolvedEntity, draft)
      : buildLinePatch(resolvedEntity, draft, line as LineRecord);

    if (!isNew && Object.keys(payload).length === 0) { onOpenChange(false); return; }

    if (onDraftSubmit) {
      setSaving(true);
      setSaveError(null);
      try { await onDraftSubmit(payload); onOpenChange(false); }
      catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to update draft line"); }
      finally { setSaving(false); }
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await relayMutate(
        isNew ? collectionUrl(entityCode, parentRecordId) : itemUrl(entityCode, parentRecordId, lineKey),
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

  const badgeLabel = isNew
    ? (composerMode === "catalog" ? "Add Catalog Item" : "Add Item")
    : displayProcureLabel(resolvedEntity?.entity_name ?? "Line");

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
      badgeDetail={
        <span className="inline-flex h-8 max-w-[12rem] items-center overflow-hidden rounded-lg bg-foreground text-background shadow-sm ring-1 ring-border/20">
          <span className="min-w-0 px-3 text-xs font-medium leading-none">
            <span className="block truncate">{badgeLabel}</span>
          </span>
        </span>
      }
      title={<span title={title}>{compactHeaderTitle(title)}</span>}
      subtitle={subtitle}
      headerRight={
        hasPurchaseInvoiceSimpleView ? (
          <div className="flex items-center gap-3">
            <span className={cn(SECTION_LABEL_CLASS, "whitespace-nowrap")}>Advanced view</span>
            <div className="inline-flex h-8 overflow-hidden rounded-lg border border-input bg-background p-0.5">
              {[{ label: "No", v: false }, { label: "Yes", v: true }].map(({ label, v }) => (
                <button
                  key={label}
                  type="button"
                  disabled={saving}
                  onClick={() => setAdvancedView(v)}
                  className={cn(
                    "min-w-14 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-40",
                    advancedView === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : undefined
      }
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />{saveError}
          </span>
        ) : amountConfig ? (
          <FooterAmount line={line} draft={draft} amountConfig={amountConfig} currencyCode={currencyCode} />
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
            {saving ? "Saving…" : isNew ? (composerMode === "catalog" ? "Add catalog item" : "Add item") : "Save"}
          </button>
        </>
      }
    >
      {resolvedEntity ? (
        sections.length > 0 ? (
          <div>
            {sections.map((section) => (
              <AccordionSection
                key={section.key}
                section={section}
                entity={resolvedEntity}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving}
                itemConfig={itemTabConfig}
                amountConfig={amountConfig}
                currencyCode={currencyCode}
                formData={fieldFormData}
                composerMode={composerMode ?? "manual"}
                explicitFieldOwners={explicitFieldOwners}
              />
            ))}
          </div>
        ) : (
          <MetaLineForm
            entity={resolvedEntity}
            draft={draft}
            onDraftChange={setDraft}
            disabled={saving}
            formData={fieldFormData}
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
