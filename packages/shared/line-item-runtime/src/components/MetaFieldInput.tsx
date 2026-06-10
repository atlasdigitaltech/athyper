"use client";

import { useEffect, useMemo, useState } from "react";
import type { EntityField } from "@athyper/api-contracts/metadata";
import { cn } from "@athyper/theme/utils";
import {
  CostCenterPicker,
  DimensionPicker,
  EntityPicker,
  GlAccountPicker,
  ProjectPicker,
  resolveEntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
import { isUomLikeField, fieldOptions } from "../meta";

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
  const optionConfig = resolveEntityPickerOptionConfig(refConfig);
  const entityCode = String(refConfig?.["target_entity"] ?? "unit_of_measure");

  return (
    <EntityPicker
      value={String(value ?? "")}
      entityCode={entityCode}
      optionConfig={optionConfig}
      searchParams={companyCodeId ? { company_code_id: companyCodeId } : undefined}
      onChange={(v) => onChange(v ?? "")}
      disabled={disabled}
    />
  );
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
  const optionConfig = resolveEntityPickerOptionConfig(refConfig);

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
  const optionConfig = resolveEntityPickerOptionConfig(refConfig);

  if (!entityCode) {
    return (
      <input
        type="text"
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
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
      const opts = fieldOptions(field);
      return (
        <select
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
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
          className="min-h-[4.5rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
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
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-right text-sm tabular-nums outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
        />
      );

    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/30"
        />
      );
  }
}
