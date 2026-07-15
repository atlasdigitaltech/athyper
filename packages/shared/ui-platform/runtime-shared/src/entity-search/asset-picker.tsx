"use client";

/**
 * AssetPicker — reusable picker for master.asset references.
 *
 * Used wherever an FK to a specific asset is captured (e.g.
 * `accounting_distribution.asset_id` on a CapEx PIL split). Auto-filters
 * by the line's `asset_class_id` so only assets within the declared
 * class surface, honoring the AP invariant matrix:
 *
 *   line.asset_class_id IS NULL → AD MUST NOT set asset_id
 *     (Invariant 4: ASSET_LINE_AD_MISSING_CAPEX)
 *   line.asset_class_id IS NOT NULL → AD may pin a specific asset
 *     belonging to that class, OR leave asset_id NULL (class-pending,
 *     posts to class-clearing until the asset is settled).
 *
 * Stored value is the asset UUID (FK reference).
 *
 * Layer boundary: Layer 2 (runtime-shared). No imports from Layer 3/4.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { appEntityDetailHref } from "../core/entity-route";
import { EntityPicker, resolveEntityPickerOptionConfig } from "./entity-picker";
import { searchLookupOptions } from "./lookup-config";
import type { EntityPickerSearchContext } from "./entity-picker";

/** Minimal structural type — avoids importing @athyper/api-contracts in Layer 2. */
interface AssetFieldMeta {
  label?: string | null;
  reference_config?: Record<string, unknown> | null;
  lookup_config?: Record<string, unknown> | null;
}

export interface AssetPickerProps {
  /** Current stored value (asset UUID). */
  value?: string | null;
  /** Display label shown when the picker is closed. */
  displayLabel?: string | null;
  /** Called on selection / clear with (uuid, label). */
  onChange: (id: string | null, label: string | null) => void;
  /**
   * EntityField metadata for the asset_id reference field. Drives variant,
   * tabs, badges via reference_config. Falls back to bare entity search
   * when omitted.
   */
  field?: AssetFieldMeta | null;
  /**
   * Document / line / form context. The picker reads `asset_class_id` and
   * `company_code_id` from this object to scope the search; pass the
   * flattened source line record (or the document header when the line
   * has no override).
   */
  formData?: Record<string, unknown> | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AssetPicker({
  value,
  displayLabel,
  onChange,
  field,
  formData,
  disabled,
  placeholder,
  className,
}: AssetPickerProps) {
  const labelCache = useRef<Map<string, string>>(new Map());
  const formDataRef = useRef<Record<string, unknown> | null | undefined>(formData);

  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const optionConfig = useMemo(
    () => resolveEntityPickerOptionConfig(field?.reference_config),
    [field?.reference_config],
  );

  // Two-axis scoping when the field metadata doesn't already declare one:
  //   1. asset_class_id — narrows to assets in the CapEx class declared
  //      on the source line; empty_behavior=none means "no class, no
  //      results" because authoring asset_id without a class violates
  //      Invariant 4 anyway.
  //   2. company_code_id — keeps cross-tenant / cross-company assets out
  //      of the result set in the same way DimensionPicker handles
  //      dimension scoping.
  //
  // Only the first dependent_filter is honoured by the search machinery,
  // so prefer asset_class_id (the tighter, line-scoped filter) and pass
  // company_code_id through as a static filter on the lookup_config.
  const effectiveLookupConfig = useMemo<Record<string, unknown> | null>(() => {
    const existing = (field?.lookup_config ?? {}) as Record<string, unknown>;
    if (existing["dependent_filter"]) {
      return existing;
    }
    return {
      ...existing,
      dependent_filter: {
        source_field: "asset_class_id",
        target_field: "asset_class_id",
        empty_behavior: "none",
      },
    };
  }, [field?.lookup_config]);

  const search = useCallback(
    async (query: string, context?: EntityPickerSearchContext) => {
      try {
        const result = await searchLookupOptions({
          entityCode: "asset",
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
    [effectiveLookupConfig, optionConfig],
  );

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
      entityCode="asset"
      search={search}
      optionConfig={optionConfig}
      getOptionHref={(opt) => {
        const id = opt.recordId ?? opt.value;
        return appEntityDetailHref("asset", id);
      }}
      optionActionLabel={optionConfig?.optionActionLabel ?? "Open asset"}
      loadOnOpen
      placeholder={placeholder ?? `Search ${field?.label ?? "asset"}…`}
      disabled={disabled}
      clearable
      className={className}
    />
  );
}
