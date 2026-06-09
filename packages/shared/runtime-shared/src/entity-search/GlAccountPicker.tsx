"use client";

/**
 * GlAccountPicker — reusable GL account search picker.
 *
 * 100 % metadata-driven: all picker configuration (variant, tabs, Dr/Cr badges,
 * CoA scoping, value field) is resolved from the GlAccountFieldMeta's reference_config,
 * which is populated by the 990_reference_picker_config.sql seed for every
 * entity field whose target_entity = 'gl_account'.
 *
 * Stored value is the account CODE (not UUID). The CoA scoping filter is
 * extracted from formData by searching common paths for chart_of_account_id.
 *
 * Layer boundary: Layer 2 (runtime-shared). No imports from Layer 3/4.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { appEntityDetailHref } from "../core/entity-route";
import { EntityPicker, resolveEntityPickerOptionConfig } from "./EntityPicker";
import { entityRowToPickerOption } from "./useEntitySearch";
import { readLookupFilters, searchLookupOptions } from "./lookupConfig";
import type { EntityPickerOption, EntityPickerSearchContext } from "./EntityPicker";
import type { LookupFilterValue } from "./lookupConfig";

/** Minimal structural type — avoids importing @athyper/api-contracts in Layer 2. */
interface GlAccountFieldMeta {
  label?: string | null;
  reference_config?: Record<string, unknown> | null;
  lookup_config?: Record<string, unknown> | null;
}

// ── Private file-level utilities ───────────────────────────────────────────────

function textFromRecord(row: Record<string, unknown>, field: string | null | undefined): string | undefined {
  if (!field) return undefined;
  const v = row[field];
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  return undefined;
}

function recordFromValue(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function lookupFilterValue(v: unknown): LookupFilterValue | null {
  if (typeof v === "string") { const t = v.trim(); return t ? t : null; }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) {
    const vals = v.filter((i): i is string | number | boolean =>
      typeof i === "string" || typeof i === "number" || typeof i === "boolean",
    );
    return vals.length > 0 ? vals : null;
  }
  return null;
}

function contextValueAtPath(data: Record<string, unknown> | null | undefined, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, seg) => {
    const r = recordFromValue(cur);
    return r ? r[seg] : undefined;
  }, data);
}

function firstLookupContextValue(
  data: Record<string, unknown> | null | undefined,
  paths: string[],
): LookupFilterValue | null {
  for (const path of paths) {
    const v = lookupFilterValue(contextValueAtPath(data, path));
    if (v !== null) return v;
  }
  return null;
}

function lookupConfigWithFilter(
  base: Record<string, unknown> | null | undefined,
  field: string,
  value: LookupFilterValue,
): Record<string, unknown> {
  const root = recordFromValue(base) ?? {};
  return {
    ...root,
    filters: { ...readLookupFilters(root), [field]: value },
  };
}

function resolveTargetEntity(field?: GlAccountFieldMeta | null): string {
  const t = field?.reference_config?.target_entity;
  return typeof t === "string" && t.trim() ? t.trim() : "gl_account";
}

function resolveValueField(
  field?: GlAccountFieldMeta | null,
  optionConfig?: ReturnType<typeof resolveEntityPickerOptionConfig>,
): string {
  const displayField = field?.reference_config?.display_field;
  const existing = typeof displayField === "string" && displayField.trim() ? displayField.trim() : undefined;
  return optionConfig?.codeField ?? existing ?? "code";
}

function glAccountOptionFromMetadata(
  row: Record<string, unknown>,
  entityCode: string,
  optionConfig: ReturnType<typeof resolveEntityPickerOptionConfig>,
  valueField: string,
): EntityPickerOption | null {
  const base = entityRowToPickerOption(row, entityCode, optionConfig);
  const value =
    textFromRecord(row, valueField) ??
    textFromRecord(row, optionConfig?.codeField) ??
    textFromRecord(row, "code") ??
    textFromRecord(row, "id");
  if (!value) return null;
  return {
    ...base,
    value,
    code: base.code ?? textFromRecord(row, optionConfig?.codeField) ?? textFromRecord(row, "code"),
    recordId: textFromRecord(row, "id") ?? base.recordId,
  };
}

// ── Public component ───────────────────────────────────────────────────────────

export interface GlAccountPickerProps {
  /** Current stored value (account code resolved via field metadata). */
  value?: string | null;
  /** Display label shown when the picker is closed. */
  displayLabel?: string | null;
  /** Called on selection / clear with (code, label). */
  onChange: (code: string | null, label: string | null) => void;
  /**
   * GlAccountFieldMeta metadata for the GL account reference field.
   * Drives variant, tabs, badges, CoA filter, and value-field resolution.
   * Falls back to bare "gl_account" entity search when omitted.
   */
  field?: GlAccountFieldMeta | null;
  /**
   * Document / form context used to extract chart_of_account_id for CoA scoping.
   * Pass the header record or any object that might carry chart_of_account_id.
   */
  formData?: Record<string, unknown> | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const COA_ID_PATHS = [
  "chart_of_account_id",
  "chartOfAccountId",
  "coa_id",
  "coaId",
  "data.chart_of_account_id",
  "metadata.chart_of_account_id",
];

export function GlAccountPicker({
  value,
  displayLabel,
  onChange,
  field,
  formData,
  disabled,
  placeholder,
  className,
}: GlAccountPickerProps) {
  const labelCache = useRef<Map<string, string>>(new Map());
  const formDataRef = useRef<Record<string, unknown> | null | undefined>(formData);

  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const targetEntity = useMemo(() => resolveTargetEntity(field), [field]);
  const optionConfig = useMemo(
    () => resolveEntityPickerOptionConfig(field?.reference_config),
    [field?.reference_config],
  );
  const valueField = useMemo(() => resolveValueField(field, optionConfig), [field, optionConfig]);

  const search = useCallback(
    async (query: string, context?: EntityPickerSearchContext) => {
      try {
        const coaId = targetEntity === "gl_account"
          ? firstLookupContextValue(formDataRef.current, COA_ID_PATHS)
          : null;
        const lookupConfig = coaId !== null
          ? lookupConfigWithFilter(field?.lookup_config, "chart_of_account_id", coaId)
          : field?.lookup_config;
        const result = await searchLookupOptions({
          entityCode: targetEntity,
          query,
          lookupConfig,
          formData: formDataRef.current,
          optionConfig,
          context,
          rowToOption: (row, ec, cfg) => glAccountOptionFromMetadata(row, ec, cfg, valueField),
        });
        result.options.forEach((opt) => labelCache.current.set(opt.value, opt.label));
        return result;
      } catch {
        return { options: [] };
      }
    },
    [field?.lookup_config, optionConfig, targetEntity, valueField],
  );

  return (
    <EntityPicker
      value={value ?? null}
      displayLabel={displayLabel ?? null}
      onChange={(next) => {
        const code = next ?? null;
        const label = code ? (labelCache.current.get(code) ?? null) : null;
        onChange(code, label);
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
      optionActionLabel={optionConfig?.optionActionLabel ?? "Open GL account"}
      loadOnOpen
      placeholder={placeholder ?? `Search ${field?.label ?? "GL account"}…`}
      disabled={disabled}
      clearable
      className={className}
    />
  );
}
