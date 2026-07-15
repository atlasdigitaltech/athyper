"use client";

/**
 * CustomerPicker — reusable customer search picker.
 *
 * 100% metadata-driven: variant, status tabs, and status badge are resolved
 * from EntityField.reference_config, populated by 990_reference_picker_config.sql
 * for every field whose target_entity = 'customer'.
 *
 * Stored value is the customer UUID (proper FK reference).
 * Defaults to the "active" tab so prospects/inactive customers stay out of view
 * unless the user explicitly switches to All or another tab.
 *
 * Layer boundary: Layer 2 (runtime-shared). No imports from Layer 3/4.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { appEntityDetailHref } from "../core/entity-route";
import { EntityPicker, resolveEntityPickerOptionConfig } from "./entity-picker";
import { searchLookupOptions } from "./lookup-config";
import type { EntityPickerSearchContext } from "./entity-picker";

/** Minimal structural type — avoids importing @athyper/api-contracts in Layer 2. */
interface CustomerFieldMeta {
  label?: string | null;
  reference_config?: Record<string, unknown> | null;
  lookup_config?: Record<string, unknown> | null;
}

export interface CustomerPickerProps {
  /** Current stored value (customer UUID). */
  value?: string | null;
  /** Display label shown when the picker is closed. */
  displayLabel?: string | null;
  /** Called on selection / clear with (uuid, label). */
  onChange: (id: string | null, label: string | null) => void;
  /**
   * EntityField metadata for the customer reference field.
   * Drives variant, tabs, badges. Falls back to bare "customer" search when omitted.
   */
  field?: CustomerFieldMeta | null;
  /**
   * Document / form context passed through to searchLookupOptions for any
   * dependent filters declared in lookup_config (e.g. future company-code scoping).
   */
  formData?: Record<string, unknown> | null;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
}

function resolveTargetEntity(field?: CustomerFieldMeta | null): string {
  const t = field?.reference_config?.["target_entity"];
  return typeof t === "string" && t.trim() ? t.trim() : "customer";
}

export function CustomerPicker({
  value,
  displayLabel,
  onChange,
  field,
  formData,
  disabled,
  error,
  placeholder,
  className,
}: CustomerPickerProps) {
  const labelCache = useRef<Map<string, string>>(new Map());
  const formDataRef = useRef<Record<string, unknown> | null | undefined>(formData);

  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const targetEntity = useMemo(() => resolveTargetEntity(field), [field]);
  const optionConfig = useMemo(
    () => resolveEntityPickerOptionConfig(field?.reference_config),
    [field?.reference_config],
  );

  const search = useCallback(
    async (query: string, context?: EntityPickerSearchContext) => {
      try {
        const result = await searchLookupOptions({
          entityCode: targetEntity,
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
    [field?.lookup_config, optionConfig, targetEntity],
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
      entityCode={targetEntity}
      search={search}
      optionConfig={optionConfig}
      getOptionHref={(opt) => {
        const id = opt.recordId ?? opt.value;
        return appEntityDetailHref(targetEntity, id);
      }}
      optionActionLabel={optionConfig?.optionActionLabel ?? "Open customer"}
      loadOnOpen
      placeholder={placeholder ?? `Search ${field?.label ?? "customer"}…`}
      disabled={disabled}
      error={error}
      clearable
      className={className}
    />
  );
}
