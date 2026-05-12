"use client";

/**
 * CatalogPicker — generic advanced picker for tenant-level catalog and
 * classification master entities (spend_category, business_intent, item, …).
 *
 * Embedded defaults provide full advanced-mode config (tabs, badges, recently-used)
 * without requiring the 990 seed to have run first. When field.reference_config
 * is present and carries variant='advanced', it takes precedence so the DB config
 * can still override the defaults.
 *
 * Unlike DimensionPicker, catalog entities are NOT company_code-scoped — no
 * automatic depends_on injection is applied.
 *
 * SpendCategoryPicker, BusinessIntentPicker, and ItemPicker are thin named
 * wrappers exported from this file — they share all logic and just pin the
 * entityCode.
 *
 * Layer boundary: Layer 2 (runtime-shared). No imports from Layer 3/4.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  EntityPicker,
  resolveEntityPickerOptionConfig,
  type EntityPickerOptionConfig,
} from "./EntityPicker";
import { searchLookupOptions } from "./lookupConfig";
import type { EntityPickerSearchContext } from "./EntityPicker";

/** Minimal structural type — avoids importing @athyper/api-contracts in Layer 2. */
interface CatalogFieldMeta {
  label?: string | null;
  reference_config?: Record<string, unknown> | null;
  lookup_config?: Record<string, unknown> | null;
}

// ── Built-in defaults ─────────────────────────────────────────────────────────
// These mirror the 990_reference_picker_config.sql WHEN blocks exactly.
// They activate advanced mode even before the 990 seed has run on a given
// environment, and are overridden by field.reference_config when present.

const CATALOG_DEFAULT_CONFIGS: Record<string, EntityPickerOptionConfig> = {
  spend_category: {
    variant: "advanced",
    density: "mini",
    width: 400,
    maxListHeight: 900,
    optionActionLabel: "Open spend category",
    resultLabel: "spend category",
    showRecentlyUsed: true,
    recentLimit: 5,
    defaultControl: "active",
    controls: [
      { id: "all",      label: "All",      value: "all" },
      { id: "active",   label: "Active",   value: "active",   field: "status", matchValue: "active" },
      { id: "inactive", label: "Inactive", value: "inactive", field: "status", matchValue: "inactive" },
      { id: "goods",    label: "Goods",    value: "goods",    field: "procurement_type", matchValue: "goods" },
      { id: "services", label: "Services", value: "services", field: "procurement_type", matchValue: "services" },
    ],
    badges: [
      {
        field: "status",
        labelMap: { active: "Active", inactive: "Inactive" },
        toneMap:  { active: "success", inactive: "muted" },
      },
      {
        field: "procurement_type",
        labelMap: { goods: "Goods", services: "Services" },
        toneMap:  { goods: "default", services: "muted" },
      },
    ],
  },

  business_intent: {
    variant: "advanced",
    density: "mini",
    width: 420,
    maxListHeight: 900,
    optionActionLabel: "Open business intent",
    resultLabel: "business intent",
    showRecentlyUsed: true,
    recentLimit: 5,
    defaultControl: "active",
    controls: [
      { id: "all",      label: "All",      value: "all" },
      { id: "active",   label: "Active",   value: "active",   field: "status", matchValue: "active" },
      { id: "inactive", label: "Inactive", value: "inactive", field: "status", matchValue: "inactive" },
    ],
    badges: [
      {
        field: "status",
        labelMap: { active: "Active", inactive: "Inactive" },
        toneMap:  { active: "success", inactive: "muted" },
      },
      {
        field: "domain",
        labelMap: {
          OPEX: "OpEx", CAPEX: "CapEx", COST_OF_SALES: "COGS",
          ADMIN: "Admin", REGULATORY: "Reg.", TRANSFER: "Transfer",
        },
        toneMap: {
          OPEX: "default", CAPEX: "warning", COST_OF_SALES: "muted",
          ADMIN: "muted", REGULATORY: "destructive", TRANSFER: "muted",
        },
      },
    ],
  },

  item: {
    variant: "advanced",
    density: "mini",
    width: 400,
    maxListHeight: 900,
    optionActionLabel: "Open item",
    resultLabel: "item",
    showRecentlyUsed: true,
    recentLimit: 5,
    defaultControl: "active",
    controls: [
      { id: "all",      label: "All",      value: "all" },
      { id: "active",   label: "Active",   value: "active",   field: "status", matchValue: "active" },
      { id: "inactive", label: "Inactive", value: "inactive", field: "status", matchValue: "inactive" },
      { id: "archived", label: "Archived", value: "archived", field: "status", matchValue: "archived" },
    ],
    badges: [
      {
        field: "status",
        labelMap: { active: "Active", inactive: "Inactive", archived: "Archived" },
        toneMap:  { active: "success", inactive: "muted", archived: "muted" },
      },
    ],
  },

  product: {
    variant: "advanced",
    density: "mini",
    width: 400,
    maxListHeight: 900,
    optionActionLabel: "Open product",
    resultLabel: "product",
    showRecentlyUsed: true,
    recentLimit: 5,
    defaultControl: "active",
    controls: [
      { id: "all",      label: "All",      value: "all" },
      { id: "active",   label: "Active",   value: "active",   field: "status", matchValue: "active" },
      { id: "inactive", label: "Inactive", value: "inactive", field: "status", matchValue: "inactive" },
      { id: "archived", label: "Archived", value: "archived", field: "status", matchValue: "archived" },
    ],
    badges: [
      {
        field: "product_type",
        labelMap: { goods: "Goods", services: "Services", digital: "Digital", subscription: "Sub." },
        toneMap:  { goods: "default", services: "muted", digital: "info", subscription: "muted" },
      },
    ],
  },
};

function resolveOptionConfig(
  entityCode: string,
  fieldRefConfig: Record<string, unknown> | null | undefined,
): EntityPickerOptionConfig {
  const fromField = resolveEntityPickerOptionConfig(fieldRefConfig);
  // DB-driven config takes full precedence when it already carries advanced variant.
  if (fromField?.variant === "advanced") return fromField;
  // Otherwise merge: defaults as base, field config overlaid for any non-undefined keys.
  const defaults = CATALOG_DEFAULT_CONFIGS[entityCode];
  if (!defaults) return fromField ?? { variant: "advanced" };
  if (!fromField) return defaults;
  return { ...defaults, ...Object.fromEntries(Object.entries(fromField).filter(([, v]) => v !== undefined)) };
}

// ── Public component ───────────────────────────────────────────────────────────

export interface CatalogPickerProps {
  /** Catalog entity code — e.g. "spend_category", "business_intent", "item". */
  entityCode: string;
  /** Current stored value (record UUID). */
  value?: string | null;
  /** Display label shown when the picker is closed. */
  displayLabel?: string | null;
  /** Called on selection / clear with (uuid, label). */
  onChange: (id: string | null, label: string | null) => void;
  /**
   * EntityField metadata for the reference field.
   * When present and carries variant='advanced', it overrides the built-in defaults.
   * When omitted, built-in defaults activate full advanced mode automatically.
   */
  field?: CatalogFieldMeta | null;
  /** Document / form context passed through to searchLookupOptions. */
  formData?: Record<string, unknown> | null;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
}

export function CatalogPicker({
  entityCode,
  value,
  displayLabel,
  onChange,
  field,
  formData,
  disabled,
  error,
  placeholder,
  className,
}: CatalogPickerProps) {
  const labelCache = useRef<Map<string, string>>(new Map());
  const formDataRef = useRef<Record<string, unknown> | null | undefined>(formData);

  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const optionConfig = useMemo(
    () => resolveOptionConfig(entityCode, field?.reference_config),
    [entityCode, field?.reference_config],
  );

  const search = useCallback(
    async (query: string, context?: EntityPickerSearchContext) => {
      try {
        const result = await searchLookupOptions({
          entityCode,
          query,
          lookupConfig: field?.lookup_config,
          formData: formDataRef.current,
          optionConfig,
          context,
        });
        result.options.forEach((opt) => labelCache.current.set(opt.value, opt.label));
        return result;
      } catch {
        return { options: [] };
      }
    },
    [entityCode, field?.lookup_config, optionConfig],
  );

  const humanEntityCode = entityCode.replace(/_/g, " ");

  return (
    <EntityPicker
      value={value ?? null}
      displayLabel={displayLabel ?? null}
      onChange={(next) => {
        const id = next ?? null;
        const label = id ? (labelCache.current.get(id) ?? null) : null;
        onChange(id, label);
      }}
      onOptionSelect={(opt) => {
        if (opt) labelCache.current.set(opt.value, opt.label);
      }}
      entityCode={entityCode}
      search={search}
      optionConfig={optionConfig}
      getOptionHref={(opt) => {
        const id = opt.recordId ?? opt.value;
        return `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(id)}`;
      }}
      optionActionLabel={optionConfig?.optionActionLabel ?? `Open ${humanEntityCode}`}
      loadOnOpen
      placeholder={placeholder ?? `Search ${field?.label ?? humanEntityCode}…`}
      disabled={disabled}
      error={error}
      clearable
      className={className}
    />
  );
}

// ── Named thin wrappers ───────────────────────────────────────────────────────

export type SpendCategoryPickerProps   = Omit<CatalogPickerProps, "entityCode">;
export type BusinessIntentPickerProps  = Omit<CatalogPickerProps, "entityCode">;
export type ItemPickerProps            = Omit<CatalogPickerProps, "entityCode">;
export type ProductPickerProps         = Omit<CatalogPickerProps, "entityCode">;

export function SpendCategoryPicker(props: SpendCategoryPickerProps) {
  return <CatalogPicker entityCode="spend_category" {...props} />;
}

export function BusinessIntentPicker(props: BusinessIntentPickerProps) {
  return <CatalogPicker entityCode="business_intent" {...props} />;
}

export function ItemPicker(props: ItemPickerProps) {
  return <CatalogPicker entityCode="item" {...props} />;
}

export function ProductPicker(props: ProductPickerProps) {
  return <CatalogPicker entityCode="product" {...props} />;
}
