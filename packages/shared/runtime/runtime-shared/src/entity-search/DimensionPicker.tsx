"use client";

/**
 * DimensionPicker — generic picker for company_code-scoped dimensions
 * (cost_center, project, profit_center, site, …).
 *
 * 100% metadata-driven: variant, status tabs, and badges are resolved from
 * EntityField.reference_config, populated by 990_reference_picker_config.sql
 * for every field whose target_entity is a dimension entity.
 *
 * Stored value is the dimension UUID (FK reference).
 * Defaults to the "active" tab so draft/inactive items stay out of view.
 *
 * CostCenterPicker and ProjectPicker are thin named wrappers exported from
 * this file — they share all logic and just pin the entityCode.
 *
 * Layer boundary: Layer 2 (runtime-shared). No imports from Layer 3/4.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { EntityPicker, resolveEntityPickerOptionConfig } from "./EntityPicker";
import { searchLookupOptions } from "./lookupConfig";
import type { EntityPickerSearchContext } from "./EntityPicker";

/** Minimal structural type — avoids importing @athyper/api-contracts in Layer 2. */
interface DimensionFieldMeta {
  label?: string | null;
  reference_config?: Record<string, unknown> | null;
  lookup_config?: Record<string, unknown> | null;
}

export interface DimensionPickerProps {
  /** Dimension entity code — e.g. "cost_center", "project". */
  entityCode: string;
  /** Current stored value (dimension UUID). */
  value?: string | null;
  /** Display label shown when the picker is closed. */
  displayLabel?: string | null;
  /** Called on selection / clear with (uuid, label). */
  onChange: (id: string | null, label: string | null) => void;
  /**
   * EntityField metadata for the dimension reference field.
   * Drives variant, tabs, badges. Falls back to bare entity search when omitted.
   */
  field?: DimensionFieldMeta | null;
  /**
   * Document / form context passed through to searchLookupOptions for any
   * dependent filters (e.g. company_code_id scoping).
   */
  formData?: Record<string, unknown> | null;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
}

export function DimensionPicker({
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
}: DimensionPickerProps) {
  const labelCache = useRef<Map<string, string>>(new Map());
  const formDataRef = useRef<Record<string, unknown> | null | undefined>(formData);

  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const optionConfig = useMemo(
    () => resolveEntityPickerOptionConfig(field?.reference_config),
    [field?.reference_config],
  );

  // Inject a default company_code_id dependency when the field doesn't already declare one.
  // This ensures dimension pickers always scope to the transaction's company code.
  const effectiveLookupConfig = useMemo<Record<string, unknown> | null>(() => {
    const existing = (field?.lookup_config ?? {}) as Record<string, unknown>;
    if (existing["depends_on"] || existing["dependent_filter"] || existing["dependency"]) {
      return existing;
    }
    return {
      ...existing,
      depends_on: {
        source_field: "company_code_id",
        target_field: "company_code_id",
        empty_behavior: "all",
      },
    };
  }, [field?.lookup_config]);

  const search = useCallback(
    async (query: string, context?: EntityPickerSearchContext) => {
      try {
        const result = await searchLookupOptions({
          entityCode,
          query,
          lookupConfig: effectiveLookupConfig,
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
    [entityCode, effectiveLookupConfig, optionConfig],
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

export type CostCenterPickerProps = Omit<DimensionPickerProps, "entityCode">;
export type ProjectPickerProps    = Omit<DimensionPickerProps, "entityCode">;

export function CostCenterPicker(props: CostCenterPickerProps) {
  return <DimensionPicker entityCode="cost_center" {...props} />;
}

export function ProjectPicker(props: ProjectPickerProps) {
  return <DimensionPicker entityCode="project" {...props} />;
}
