"use client";

import { useEffect, useState } from "react";
import type { EntityField } from "@athyper/api-contracts/metadata";
import {
  CostCenterPicker,
  DimensionPicker,
  EntityPicker,
  GlAccountPicker,
  ProjectPicker,
  resolveEntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
import { DatePicker } from "@athyper/ui/composites";
import { isUomLikeField, fieldOptions } from "../meta";

type FieldOption = { value: string; label: string };

const lookupOptionsCache = new Map<string, FieldOption[]>();

function lookupRows(body: unknown): FieldOption[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const response = body as Record<string, unknown>;
  const raw = response["data"] ?? response["values"];
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item): FieldOption[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const value = row["code"] ?? row["value"];
    if (value == null || String(value) === "") return [];
    return [{
      value: String(value),
      label: String(row["name"] ?? row["label"] ?? value),
    }];
  });
}

function useLookupOptions(domainCode: string | null | undefined): FieldOption[] {
  const [options, setOptions] = useState<FieldOption[]>(
    () => domainCode ? (lookupOptionsCache.get(domainCode) ?? []) : [],
  );

  useEffect(() => {
    if (!domainCode) {
      setOptions([]);
      return;
    }
    const cached = lookupOptionsCache.get(domainCode);
    if (cached) {
      setOptions(cached);
      return;
    }

    let cancelled = false;
    void fetch(`/api/relay/api/metadata/lookups/${encodeURIComponent(domainCode)}`)
      .then((response) => response.ok ? response.json() as Promise<unknown> : null)
      .then((body) => {
        if (cancelled || body == null) return;
        const next = lookupRows(body);
        lookupOptionsCache.set(domainCode, next);
        setOptions(next);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [domainCode]);

  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// UOM FIELD INPUT
// ─────────────────────────────────────────────────────────────────────────────

export function UomFieldInput({
  field,
  value,
  onChange,
  disabled,
  formData,
}: {
  field:     EntityField;
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
  formData?: Record<string, unknown>;
}) {
  const companyCodeId = String(formData?.["company_code_id"] ?? "");
  const refConfig = (field.reference_config as Record<string, unknown> | null | undefined) ?? null;
  const baseOptionConfig = resolveEntityPickerOptionConfig(refConfig);
  const optionConfig = {
    ...baseOptionConfig,
    valueField: baseOptionConfig?.valueField ?? "code",
    labelField: baseOptionConfig?.labelField ?? "name",
    codeField: baseOptionConfig?.codeField ?? "code",
    recordIdField: baseOptionConfig?.recordIdField ?? "id",
    showCode: baseOptionConfig?.showCode ?? true,
  };
  const entityCode = readConfigString(refConfig, "target_entity")
    ?? readConfigString(refConfig, "ref_entity")
    ?? "uom";
  const scopeMode = readConfigString(refConfig, "scope_mode")
    ?? readConfigString(refConfig, "scopeMode")
    ?? "unscoped";
  const searchParams = companyCodeId && scopeMode !== "unscoped"
    ? { company_code_id: companyCodeId }
    : undefined;

  return (
    <EntityPicker
      value={String(value ?? "")}
      entityCode={entityCode}
      optionConfig={optionConfig}
      searchParams={searchParams}
      onChange={(v) => onChange(v ?? "")}
      disabled={disabled}
    />
  );
}

function readConfigString(config: Record<string, unknown> | null, key: string): string | undefined {
  const value = config?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function basicReferenceOptionConfig(refConfig: Record<string, unknown> | null) {
  const configured = resolveEntityPickerOptionConfig(refConfig);
  return {
    ...configured,
    valueField: configured?.valueField ?? readConfigString(refConfig, "target_field") ?? "id",
    labelField: configured?.labelField ?? "name",
    codeField: configured?.codeField ?? "code",
    showCode: configured?.showCode ?? true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMODITY CODE INPUT
// ─────────────────────────────────────────────────────────────────────────────

export function CommodityCodeInput({
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
  const refConfig = (field.reference_config as Record<string, unknown> | null | undefined) ?? null;
  const entityCode = String(refConfig?.["target_entity"] ?? "commodity_category");
  const optionConfig = basicReferenceOptionConfig(refConfig);

  return (
    <EntityPicker
      value={String(value ?? "")}
      entityCode={entityCode}
      optionConfig={optionConfig}
      onChange={(v) => onChange(v ?? "")}
      disabled={disabled}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE ENTITY INPUT
// ─────────────────────────────────────────────────────────────────────────────

function ReferenceEntityInput({
  field,
  value,
  onChange,
  disabled,
  formData,
}: {
  field:     EntityField;
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
  formData?: Record<string, unknown>;
}) {
  const refConfig = (field.reference_config as Record<string, unknown> | null | undefined) ?? null;
  const entityCode = String(refConfig?.["target_entity"] ?? "");
  const optionConfig = basicReferenceOptionConfig(refConfig);

  if (!entityCode) {
    return (
      <input
        type="text"
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-base font-normal text-foreground placeholder:text-muted-foreground outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
      />
    );
  }

  if (entityCode === "gl_account" || entityCode === "chart_of_accounts") {
    return (
      <GlAccountPicker
        value={String(value ?? "")}
        formData={formData}
        onChange={(v) => onChange(v ?? "")}
        disabled={disabled}
      />
    );
  }

  if (entityCode === "cost_center") {
    return (
      <CostCenterPicker
        value={String(value ?? "")}
        formData={formData}
        onChange={(v) => onChange(v ?? "")}
        disabled={disabled}
      />
    );
  }

  if (entityCode === "project") {
    return (
      <ProjectPicker
        value={String(value ?? "")}
        formData={formData}
        onChange={(v) => onChange(v ?? "")}
        disabled={disabled}
      />
    );
  }

  if (entityCode === "profit_center" || entityCode === "site" || entityCode === "department") {
    return (
      <DimensionPicker
        value={String(value ?? "")}
        entityCode={entityCode}
        formData={formData}
        onChange={(v) => onChange(v ?? "")}
        disabled={disabled}
      />
    );
  }

  const ccId = String(formData?.["company_code_id"] ?? "");
  return (
    <EntityPicker
      value={String(value ?? "")}
      entityCode={entityCode}
      optionConfig={optionConfig}
      searchParams={ccId ? { company_code_id: ccId } : undefined}
      onChange={(v) => onChange(v ?? "")}
      disabled={disabled}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// META FIELD INPUT — main dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export function MetaFieldInput({
  field,
  value,
  onChange,
  disabled,
  formData,
}: {
  field:     EntityField;
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
  formData?: Record<string, unknown>;
}) {
  const inlineOptions = fieldOptions(field);
  const lookupOptions = useLookupOptions(
    (field.data_type === "enum" || field.data_type === "lifecycle_state") && inlineOptions.length === 0
      ? field.enum_domain_code
      : null,
  );

  if (isUomLikeField(field)) {
    return (
      <UomFieldInput
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        formData={formData}
      />
    );
  }

  const isCommodityCode =
    /(commodity|spend)[_-]?category/i.test(field.name) ||
    /unspsc|commodity_code|hs_code/i.test(field.name);
  if (isCommodityCode) {
    return (
      <CommodityCodeInput
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (field.reference_config) {
    return (
      <ReferenceEntityInput
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        formData={formData}
      />
    );
  }

  switch (field.data_type) {
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-foreground"
        />
      );

    case "enum":
    case "lifecycle_state": {
      const opts = inlineOptions.length > 0 ? inlineOptions : lookupOptions;
      return (
        <select
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-base font-normal text-foreground placeholder:text-muted-foreground outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
        >
          <option value="">Select…</option>
          {opts.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    case "text":
      return (
        <textarea
          rows={2}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[4.5rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base font-normal text-foreground placeholder:text-muted-foreground outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
        />
      );

    case "integer":
    case "bigint":
    case "decimal":
    case "numeric":
    case "money":
      return (
        <input
          type="number"
          step={field.data_type === "integer" || field.data_type === "bigint" ? "1" : "any"}
          value={value == null ? "" : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-right text-base font-normal text-foreground placeholder:text-muted-foreground tabular-nums outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
        />
      );

    case "date":
      return (
        <DatePicker
          kind="businessDate"
          value={typeof value === "string" && value.length > 0 ? value : null}
          onChange={(next) => onChange(next ?? "")}
          disabled={disabled}
        />
      );

    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-base font-normal text-foreground placeholder:text-muted-foreground outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
        />
      );
  }
}
