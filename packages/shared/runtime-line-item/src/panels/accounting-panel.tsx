"use client";

import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X, XCircle } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { LABEL_SM } from "@athyper/platform-ui/typography";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { appEntityDetailHref, fmtAmount } from "@athyper/runtime-shared/core";
import { getCsrfToken } from "@athyper/runtime-shared/client";
import {
  CostCenterPicker,
  DimensionPicker,
  EntityPicker,
  GlAccountPicker,
  ProjectPicker,
  ReasonCodePicker,
  entityRowToPickerOption,
  resolveEntityPickerOptionConfig,
  type EntityPickerOption,
  type EntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
import { AccountingSplitRowEditor } from "@athyper/runtime-shared/accounting-ui";
import { useCompiledEntityMetadata } from "../meta";

function asConfigRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function textConfig(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DistBasis = string;

type ViewMode = "single" | "split";

interface SplitRow {
  id: string | null;
  distributionNo: number;
  basis: DistBasis;
  splitPct: number | null;
  splitAmount: number | null;
  costCenterId: string;
  costCenterLabel: string;
  profitCenterId: string;
  profitCenterLabel: string;
  projectId: string;
  projectLabel: string;
  glAccountId: string;
  glAccountLabel: string;
  originalGlAccountId: string;
  reasonCode: string;
  assetId: string;
  assetLabel: string;
  description: string;
  distributedAmount: number;
  currencyCode: string;
  _dirty: boolean;
  _isNew: boolean;
}

export interface AccountingPanelProps {
  line: DocumentLine;
  distributions: AccountingDistribution[];
  currencyCode?: string;
  entityCode: string;
  recordId: string;
  entity?: CompiledEntity;
  /** Parent document header data — provides chart_of_account_id for GL account scoping. */
  formData?: Record<string, unknown> | null;
  accountingDistributionConfig?: Record<string, unknown> | null;
  readOnly?: boolean;
  onMutated?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onClose?: () => void;
  mode?: "procure" | "sales";
  /** Compose-mode editor: keep rows in the parent line draft instead of calling child APIs. */
  staged?: boolean;
  onStagedChange?: (rows: Record<string, unknown>[]) => void;
}

export type SplitAccountingPanelProps = AccountingPanelProps;

export interface AccountingPanelHandle {
  hasDirty: () => boolean;
  saveDirty: () => Promise<boolean>;
}

export type SplitAccountingPanelHandle = AccountingPanelHandle;

type DistributionBasisConfig = {
  value: string;
  label: string;
  symbol: string;
  calculation?: "percent" | "amount" | "full";
};

type DistributionFieldConfig = {
  distributionNo: string;
  basis: string;
  splitPct: string;
  splitAmount: string;
  distributedAmount: string;
  currencyCode: string;
  costCenterId: string;
  profitCenterId: string;
  projectId: string;
  glAccountId: string;
  reasonCode: string;
  assetId: string;
  description: string;
};

type AccountingDistributionConfig = {
  basisTypes: DistributionBasisConfig[];
  defaultBasis?: string;
  costCenterEntityCode: string;
  profitCenterEntityCode: string;
  projectEntityCode: string;
  fields: DistributionFieldConfig;
};

const ACCOUNTING_FIELD_LABEL_CLASS = LABEL_SM;
const ACCOUNTING_TABLE_HEADER_CLASS = "text-xs font-medium text-muted-foreground/60";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtAmt = fmtAmount;

function numberValue(record: Record<string, unknown>, field?: string): number | null {
  if (!field) return null;
  const value = Number(record[field]);
  return Number.isFinite(value) ? value : null;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(record: Record<string, unknown>, field?: string): string {
  if (!field) return "";
  const value = record[field];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function labelFromRecord(record: Record<string, unknown>, idField: string | undefined): string {
  if (!idField) return "";
  const stem = idField.replace(/_id$/, "");
  return (
    stringValue(record, `${idField}_label`) ||
    stringValue(record, `${stem}_label`) ||
    stringValue(record, `${stem}_name`) ||
    stringValue(record, `${stem}_code`) ||
    stringValue(record, "name") ||
    ""
  );
}

function textFromRecordValue(record: Record<string, unknown>, field: string | undefined): string | undefined {
  if (!field) return undefined;
  const value = record[field];
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return undefined;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function needsResolvedLabel(value: string, label: string): boolean {
  const nextValue = value.trim();
  const nextLabel = label.trim();
  return Boolean(nextValue) && (!nextLabel || nextLabel === nextValue || isUuidLike(nextLabel));
}

async function fetchDisplayRecord(entityCode: string, value: string): Promise<Record<string, unknown> | null> {
  const encodedEntity = encodeURIComponent(entityCode);
  const encodedValue = encodeURIComponent(value);
  const direct = await fetch(`/api/relay/api/records/${encodedEntity}/${encodedValue}`)
    .then((response) => response.ok ? response.json() as Promise<{ data?: Record<string, unknown> }> : null)
    .then((body) => body?.data ?? null)
    .catch(() => null);
  if (direct) return direct;

  const params = new URLSearchParams({ q: value, limit: "10", page_size: "10" });
  const list = await fetch(`/api/relay/api/records/${encodedEntity}?${params}`)
    .then((response) => response.ok ? response.json() as Promise<{ data?: Record<string, unknown>[] }> : null)
    .then((body) => body?.data ?? [])
    .catch(() => []);
  if (list.length === 0) return null;

  const normalizedEntityCode = entityCode.replace(/-/g, "_");
  const exact = list.find((row) => {
    const option = entityRowToPickerOption(row, entityCode, resolveEntityPickerOptionConfig(undefined));
    return (
      textFromRecordValue(row, "id") === value ||
      textFromRecordValue(row, "code") === value ||
      textFromRecordValue(row, `${normalizedEntityCode}_code`) === value ||
      option.value === value ||
      option.recordId === value ||
      option.code === value
    );
  });
  return exact ?? list[0] ?? null;
}

async function resolveDisplayLabel(
  entityCode: string,
  value: string,
  field?: CompiledEntity["fields"][number] | null,
): Promise<string | null> {
  if (!value.trim()) return null;
  const row = await fetchDisplayRecord(entityCode, value);
  if (!row) return null;
  const option = entityRowToPickerOption(row, entityCode, resolveEntityPickerOptionConfig(field?.reference_config));
  return option.label || null;
}

function readAccountingDistributionConfig(
  entity?: CompiledEntity,
  override?: Record<string, unknown> | null,
): AccountingDistributionConfig {
  const raw = override ?? asConfigRecord(entity?.display_config)?.["accounting_distribution_config"];
  const config = asConfigRecord(raw) ?? {};
  const DEFAULT_BASIS_TYPES: DistributionBasisConfig[] = [
    { value: "PERCENT",  label: "Percent",  symbol: "Percent",  calculation: "percent" },
    { value: "AMOUNT",   label: "Amount",   symbol: "Amount",   calculation: "amount"  },
    { value: "QUANTITY", label: "Quantity", symbol: "Quantity", calculation: "amount"  },
  ];
  const basisTypes = Array.isArray(config["basis_types"])
    ? config["basis_types"].flatMap((entry): DistributionBasisConfig[] => {
        const row = asConfigRecord(entry);
        if (!row) return [];
        const value = textConfig(row["value"]);
        const label = textConfig(row["label"]) ?? value;
        const symbol = textConfig(row["symbol"]) ?? label;
        const calculation = textConfig(row["calculation"]);
        if (!value || !label || !symbol) return [];
        return [{
          value,
          label,
          symbol,
          calculation: calculation === "percent" || calculation === "amount" || calculation === "full"
            ? calculation
            : undefined,
        }];
      })
    : DEFAULT_BASIS_TYPES;
  const fields = asConfigRecord(config["fields"]) ?? {};
  return {
    basisTypes,
    defaultBasis: textConfig(config["default_basis"]) ?? basisTypes[0]?.value,
    costCenterEntityCode: textConfig(config["cost_center_entity_code"]) ?? "cost_center",
    profitCenterEntityCode: textConfig(config["profit_center_entity_code"]) ?? "profit_center",
    projectEntityCode: textConfig(config["project_entity_code"]) ?? "project",
    fields: {
      distributionNo:    textConfig(fields["distribution_no"])    ?? "distribution_no",
      basis:             textConfig(fields["basis"])              ?? "distribution_basis",
      splitPct:          textConfig(fields["split_pct"])          ?? "split_pct",
      splitAmount:       textConfig(fields["split_amount"])       ?? "split_amount",
      distributedAmount: textConfig(fields["distributed_amount"]) ?? "distributed_amount",
      currencyCode:      textConfig(fields["currency_code"])      ?? "currency_code",
      costCenterId:      textConfig(fields["cost_center_id"])     ?? "cost_center_id",
      profitCenterId:    textConfig(fields["profit_center_id"])   ?? "profit_center_id",
      projectId:         textConfig(fields["project_id"])         ?? "project_id",
      glAccountId:       textConfig(fields["gl_account_id"])      ?? "gl_account_id",
      reasonCode:        textConfig(fields["reason_code"])        ?? "reason_code",
      assetId:           textConfig(fields["asset_id"])           ?? "asset_id",
      description:       textConfig(fields["description"])        ?? "description",
    },
  };
}

function basisCalculation(config: AccountingDistributionConfig, basis: DistBasis): DistributionBasisConfig["calculation"] {
  return config.basisTypes.find((item) => item.value === basis)?.calculation;
}

function distToRow(d: AccountingDistribution, config: AccountingDistributionConfig): SplitRow {
  const record = d as unknown as Record<string, unknown>;
  const fields = config.fields;
  const costCenterId = stringValue(record, fields.costCenterId);
  const profitCenterId = stringValue(record, fields.profitCenterId);
  const projectId    = stringValue(record, fields.projectId);
  const glAccountId  = stringValue(record, fields.glAccountId);
  const assetId      = stringValue(record, fields.assetId);
  return {
    id:                d.id,
    distributionNo:    numberValue(record, fields.distributionNo) ?? 0,
    basis:             stringValue(record, fields.basis) || config.defaultBasis || config.basisTypes[0]?.value || "",
    splitPct:          numberValue(record, fields.splitPct),
    splitAmount:       numberValue(record, fields.splitAmount),
    costCenterId,
    costCenterLabel:   labelFromRecord(record, fields.costCenterId),
    profitCenterId,
    profitCenterLabel: labelFromRecord(record, fields.profitCenterId),
    projectId,
    projectLabel:      labelFromRecord(record, fields.projectId),
    glAccountId,
    glAccountLabel:    labelFromRecord(record, fields.glAccountId),
    originalGlAccountId: glAccountId,
    reasonCode:        stringValue(record, fields.reasonCode) || "manual_account_override",
    assetId,
    assetLabel:        labelFromRecord(record, fields.assetId),
    description:       stringValue(record, fields.description),
    distributedAmount: numberValue(record, fields.distributedAmount) ?? 0,
    currencyCode:      stringValue(record, fields.currencyCode),
    _dirty: false,
    _isNew: false,
  };
}

function newRow(lineAmount: number, currency: string, nextNo: number, config: AccountingDistributionConfig): SplitRow {
  const basis = config.defaultBasis ?? config.basisTypes[0]?.value ?? "";
  return {
    id:                null,
    distributionNo:    nextNo,
    basis,
    splitPct:          basisCalculation(config, basis) === "percent" ? 100 : null,
    splitAmount:       null,
    costCenterId:      "",
    costCenterLabel:   "",
    profitCenterId:    "",
    profitCenterLabel: "",
    projectId:         "",
    projectLabel:      "",
    glAccountId:       "",
    glAccountLabel:    "",
    originalGlAccountId: "",
    reasonCode:        "manual_account_override",
    assetId:           "",
    assetLabel:        "",
    description:       "",
    distributedAmount: lineAmount,
    currencyCode:      currency,
    _dirty: true,
    _isNew: true,
  };
}

function deriveLineDistributionAmount(line: DocumentLine): number {
  const record = line as unknown as Record<string, unknown>;
  const data = asConfigRecord(line.data) ?? {};
  return (
    numberFromUnknown(record["line_amount"]) ??
    numberFromUnknown(record["gross_amount"]) ??
    numberFromUnknown(record["net_amount"]) ??
    numberFromUnknown(data["line_amount"]) ??
    numberFromUnknown(data["gross_amount"]) ??
    numberFromUnknown(data["net_amount"]) ??
    ((numberFromUnknown(record["quantity"]) ?? numberFromUnknown(data["quantity"]) ?? 0) *
      (numberFromUnknown(record["unit_price"]) ?? numberFromUnknown(data["unit_price"]) ?? 0))
  );
}

function hasLineAssetClass(lineFormData: Record<string, unknown> | null): boolean {
  const value = lineFormData?.["asset_class_id"];
  return typeof value === "string" && value.trim().length > 0;
}

function allocationInputTotal(rows: SplitRow[], basis: DistBasis, config: AccountingDistributionConfig): number {
  const calc = basisCalculation(config, basis);
  return rows.reduce((sum, row) => {
    if (calc === "percent") return sum + (row.splitPct ?? 0);
    if (calc === "amount") return sum + (row.splitAmount ?? 0);
    return sum + 1;
  }, 0);
}

function allocationInputTarget(
  basis: DistBasis,
  config: AccountingDistributionConfig,
  lineAmount: number,
  lineFormData: Record<string, unknown> | null,
): number {
  const calc = basisCalculation(config, basis);
  if (calc === "percent") return 100;
  if (calc === "amount") return lineAmount;
  return numberFromUnknown(lineFormData?.["quantity"]) ?? 0;
}

// ── VIEW MODE TOGGLE ──────────────────────────────────────────────────────────

function ViewModeToggle({
  value,
  onChange,
  splitDisabled,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  splitDisabled?: boolean;
}) {
  return (
    <div className="inline-flex h-9 overflow-hidden rounded-md border border-input bg-background text-sm font-medium">
      {(["single", "split"] as ViewMode[]).map((mode) => {
        const disabled = mode === "split" && splitDisabled;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            disabled={disabled}
            className={cn(
              "min-w-20 px-3 capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              value === mode
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

// ── BASIS TOGGLE ──────────────────────────────────────────────────────────────

function BasisToggle({
  value,
  options,
  onChange,
}: {
  value: DistBasis;
  options: DistributionBasisConfig[];
  onChange: (v: DistBasis) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="inline-flex h-9 overflow-hidden rounded-md border border-input bg-background text-sm font-medium">
      {options.map((b) => (
          <button
          key={b.value}
          type="button"
          onClick={() => onChange(b.value)}
          className={cn(
            "min-w-20 px-3 transition-colors",
            value === b.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          {b.symbol}
        </button>
      ))}
    </div>
  );
}

// ── INLINE INPUT ──────────────────────────────────────────────────────────────

function InlineInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:border-ring/50 focus:ring-2 focus:ring-ring/30",
        "placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

// ── SECTION LABEL ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className={ACCOUNTING_FIELD_LABEL_CLASS}>
      {children}
    </span>
  );
}

// ── SINGLE DISTRIBUTION FORM ──────────────────────────────────────────────────

interface SingleDistributionFormProps {
  row: SplitRow | null;
  costCenterField: CompiledEntity["fields"][number] | null;
  profitCenterField: CompiledEntity["fields"][number] | null;
  projectField: CompiledEntity["fields"][number] | null;
  glAccountField: CompiledEntity["fields"][number] | null;
  assetField: CompiledEntity["fields"][number] | null;
  profitCenterEntityCode: string;
  lineFormData: Record<string, unknown> | null;
  documentFormData: Record<string, unknown> | null;
  lineAllowsAsset: boolean;
  saving: boolean;
  readOnly?: boolean;
  onRowChange: (patch: Partial<SplitRow>) => void;
}

const ASSET_PICKER_DEFAULTS: EntityPickerOptionConfig = {
  variant: "advanced",
  density: "mini",
  width: 420,
  maxListHeight: 320,
  optionActionLabel: "Open asset",
  resultLabel: "asset",
  showRecentlyUsed: true,
  recentLimit: 5,
  pageSize: 20,
  defaultSearchMode: "server",
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
  ],
};

function AssetPicker({
  value,
  displayLabel,
  field,
  disabled,
  onChange,
}: {
  value?: string | null;
  displayLabel?: string | null;
  field?: CompiledEntity["fields"][number] | null;
  disabled?: boolean;
  onChange: (id: string | null, label: string | null) => void;
}) {
  const [selected, setSelected] = useState<EntityPickerOption | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const optionConfig = useMemo(() => {
    const fromField = resolveEntityPickerOptionConfig(field?.reference_config);
    return fromField?.variant === "advanced"
      ? fromField
      : { ...ASSET_PICKER_DEFAULTS, ...(fromField ?? {}) };
  }, [field?.reference_config]);

  useEffect(() => {
    setResolvedLabel(null);
    if (!value || displayLabel) return;
    const controller = new AbortController();
    void fetch(`/api/relay/api/records/asset/${encodeURIComponent(value)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ data?: Record<string, unknown> }> : null)
      .then((body) => {
        const row = body?.data;
        if (!controller.signal.aborted && row) {
          setResolvedLabel(entityRowToPickerOption(row, "asset", optionConfig).label || null);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [displayLabel, optionConfig, value]);

  const pickerLabel = selected && selected.value === value
    ? selected.label
    : displayLabel || resolvedLabel || null;

  return (
    <EntityPicker
      value={value || null}
      displayLabel={pickerLabel}
      entityCode="asset"
      optionConfig={optionConfig}
      getOptionHref={(option) => {
        const recordId = option.recordId ?? option.value;
        return appEntityDetailHref("asset", recordId);
      }}
      optionActionLabel={optionConfig.optionActionLabel ?? "Open asset"}
      loadOnOpen
      placeholder="Search asset..."
      disabled={disabled}
      clearable
      onOptionSelect={(option) => setSelected(option)}
      onChange={(next) => {
        const id = next ?? null;
        const label = id ? (selected?.value === id ? selected?.label ?? null : pickerLabel) : null;
        onChange(id, label);
      }}
    />
  );
}

function SingleDistributionForm({
  row,
  costCenterField,
  profitCenterField,
  projectField,
  glAccountField,
  assetField,
  profitCenterEntityCode,
  lineFormData,
  documentFormData,
  lineAllowsAsset,
  saving,
  readOnly = false,
  onRowChange,
}: SingleDistributionFormProps) {
  const glAccountChanged = row ? row.glAccountId !== row.originalGlAccountId : false;

  return (
    <div className="flex flex-col gap-5 px-1 py-2">

      <div className="grid gap-4 md:grid-cols-2">
      {/* COST CENTRE */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>Cost Centre</SectionLabel>
        <CostCenterPicker
          value={row?.costCenterId || null}
          displayLabel={row?.costCenterLabel || null}
          field={costCenterField}
          formData={lineFormData}
          onChange={(id, label) => onRowChange({ costCenterId: id ?? "", costCenterLabel: label ?? "" })}
          placeholder="Search cost centre…"
          disabled={saving || readOnly}
        />
      </div>

      {/* PROJECT */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>Project</SectionLabel>
        <ProjectPicker
          value={row?.projectId || null}
          displayLabel={row?.projectLabel || null}
          field={projectField}
          formData={lineFormData}
          onChange={(id, label) => onRowChange({ projectId: id ?? "", projectLabel: label ?? "" })}
          placeholder="Search project…"
          disabled={saving || readOnly}
        />
      </div>

      {/* PROFIT CENTRE */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>Profit Centre</SectionLabel>
        <DimensionPicker
          entityCode={profitCenterEntityCode}
          value={row?.profitCenterId || null}
          displayLabel={row?.profitCenterLabel || null}
          field={profitCenterField}
          formData={lineFormData}
          onChange={(id, label) => onRowChange({ profitCenterId: id ?? "", profitCenterLabel: label ?? "" })}
          placeholder="Search profit centre..."
          disabled={saving || readOnly}
        />
      </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>GL Account</SectionLabel>
        <GlAccountPicker
          valueKind="id"
          value={row?.glAccountId || null}
          displayLabel={row?.glAccountLabel || null}
          field={glAccountField}
          formData={documentFormData ?? lineFormData}
          onChange={(id, label) => onRowChange({
            glAccountId:    id ?? "",
            glAccountLabel: label ?? "",
            reasonCode:     row?.reasonCode || "manual_account_override",
          })}
          placeholder="Search GL account..."
          disabled={saving || readOnly}
        />
        <span className="text-[11px] text-muted-foreground">
          Optional manual override. Posting keeps your choice when selected.
        </span>
      </div>

      {glAccountChanged && !readOnly && (
        <ReasonCodePicker
          category="accounting"
          value={row?.reasonCode || "manual_account_override"}
          onChange={(code) => onRowChange({ reasonCode: code || "manual_account_override" })}
          required
          disabled={saving}
        />
      )}

      {/* ASSET (capex linkage) */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>Asset</SectionLabel>
        {lineAllowsAsset ? (
          <AssetPicker
            value={row?.assetId || null}
            displayLabel={row?.assetLabel || null}
            field={assetField}
            disabled={saving || readOnly}
            onChange={(id, label) => onRowChange({
              assetId:    id ?? "",
              assetLabel: label ?? "",
            })}
          />
        ) : (
          <div className="flex h-8 items-center rounded-md border border-input bg-muted/30 px-2 text-sm text-muted-foreground">
            No asset on line
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>Description</SectionLabel>
        <InlineInput
          value={row?.description || ""}
          onChange={(value) => onRowChange({ description: value })}
          placeholder="Optional distribution note"
          disabled={saving || readOnly}
        />
      </div>
    </div>
  );
}

// ── PANEL COMPONENT ───────────────────────────────────────────────────────────

function SingleDistributionFormV2({
  row,
  costCenterField,
  profitCenterField,
  projectField,
  glAccountField,
  assetField,
  profitCenterEntityCode,
  lineFormData,
  documentFormData,
  lineAllowsAsset,
  saving,
  readOnly = false,
  onRowChange,
}: SingleDistributionFormProps) {
  const glAccountChanged = row ? row.glAccountId !== row.originalGlAccountId : false;

  return (
    <div className="flex flex-col gap-4 px-1 py-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>GL Account</SectionLabel>
        <GlAccountPicker
          valueKind="id"
          value={row?.glAccountId || null}
          displayLabel={row?.glAccountLabel || null}
          field={glAccountField}
          formData={documentFormData ?? lineFormData}
          onChange={(id, label) => onRowChange({
            glAccountId:    id ?? "",
            glAccountLabel: label ?? "",
            reasonCode:     row?.reasonCode || "manual_account_override",
          })}
          placeholder="Search GL account..."
          disabled={saving || readOnly}
        />
      </div>

      {glAccountChanged && !readOnly && (
        <ReasonCodePicker
          category="accounting"
          value={row?.reasonCode || "manual_account_override"}
          onChange={(code) => onRowChange({ reasonCode: code || "manual_account_override" })}
          required
          disabled={saving}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Cost Centre</SectionLabel>
          <CostCenterPicker
            value={row?.costCenterId || null}
            displayLabel={row?.costCenterLabel || null}
            field={costCenterField}
            formData={lineFormData}
            onChange={(id, label) => onRowChange({ costCenterId: id ?? "", costCenterLabel: label ?? "" })}
            placeholder="Search cost centre..."
            disabled={saving || readOnly}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Project</SectionLabel>
          <ProjectPicker
            value={row?.projectId || null}
            displayLabel={row?.projectLabel || null}
            field={projectField}
            formData={lineFormData}
            onChange={(id, label) => onRowChange({ projectId: id ?? "", projectLabel: label ?? "" })}
            placeholder="Search project..."
            disabled={saving || readOnly}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Profit Centre</SectionLabel>
          <DimensionPicker
            entityCode={profitCenterEntityCode}
            value={row?.profitCenterId || null}
            displayLabel={row?.profitCenterLabel || null}
            field={profitCenterField}
            formData={lineFormData}
            onChange={(id, label) => onRowChange({ profitCenterId: id ?? "", profitCenterLabel: label ?? "" })}
            placeholder="Search profit centre..."
            disabled={saving || readOnly}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Asset</SectionLabel>
          {lineAllowsAsset ? (
            <AssetPicker
              value={row?.assetId || null}
              displayLabel={row?.assetLabel || null}
              field={assetField}
              disabled={saving || readOnly}
              onChange={(id, label) => onRowChange({
                assetId:    id ?? "",
                assetLabel: label ?? "",
              })}
            />
          ) : (
            <div className="flex h-8 items-center rounded-md border border-input bg-muted/30 px-2 text-sm text-muted-foreground">
              No asset on line
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>Description</SectionLabel>
        <InlineInput
          value={row?.description || ""}
          onChange={(value) => onRowChange({ description: value })}
          placeholder="Optional distribution note"
          disabled={saving || readOnly}
        />
      </div>
    </div>
  );
}

export const AccountingPanel = forwardRef<AccountingPanelHandle, AccountingPanelProps>(function AccountingPanel({
  line,
  distributions,
  currencyCode,
  entityCode,
  recordId,
  entity,
  formData: parentFormData,
  accountingDistributionConfig,
  readOnly = false,
  onMutated,
  onDirtyChange,
  onClose,
  staged = false,
  onStagedChange,
}, ref) {
  const lineAmount = deriveLineDistributionAmount(line);
  const distributionConfig = useMemo(
    () => readAccountingDistributionConfig(entity, accountingDistributionConfig),
    [entity, accountingDistributionConfig],
  );
  const distributionEntity = useCompiledEntityMetadata("accounting_distribution");
  const costCenterField = useMemo(
    () =>
      (distributionEntity ?? entity)?.fields.find((f) => f.name === "cost_center_id") ?? null,
    [distributionEntity, entity],
  );
  const profitCenterField = useMemo(
    () =>
      (distributionEntity ?? entity)?.fields.find((f) => f.name === "profit_center_id") ?? null,
    [distributionEntity, entity],
  );
  const projectField = useMemo(
    () =>
      (distributionEntity ?? entity)?.fields.find((f) => f.name === "project_id") ?? null,
    [distributionEntity, entity],
  );
  const glAccountField = useMemo(
    () =>
      (distributionEntity ?? entity)?.fields.find((f) => f.name === "gl_account_id") ?? null,
    [distributionEntity, entity],
  );
  const assetField = useMemo(
    () =>
      (distributionEntity ?? entity)?.fields.find((f) => f.name === "asset_id") ?? null,
    [distributionEntity, entity],
  );
  const lineFormData = useMemo(
    () => ({
      ...(parentFormData ?? {}),
      ...(line as unknown as Record<string, unknown>),
      ...((line.data as Record<string, unknown> | null | undefined) ?? {}),
    }),
    [line, line.data, parentFormData],
  );
  const lineAllowsAsset = hasLineAssetClass(lineFormData);
  const cc = currencyCode ?? "";

  const [rows, setRows] = useState<SplitRow[]>(() =>
    distributions.map((item) => distToRow(item, distributionConfig)),
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    distributions.length > 1 ? "split" : "single",
  );
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [activeBasis, setActiveBasis] = useState<DistBasis>(
    () => distributions[0]
      ? (distToRow(distributions[0], distributionConfig).basis || distributionConfig.defaultBasis || distributionConfig.basisTypes[0]?.value || "")
      : (distributionConfig.defaultBasis ?? distributionConfig.basisTypes[0]?.value ?? ""),
  );
  const displayLabelCache = useRef<Map<string, string>>(new Map());
  const stagedPublishedRef = useRef(distributions.length > 0);

  // Sync rows when the distributions prop changes (e.g. after parent refetch on save).
  // Preserve any rows that are currently being edited (_dirty) so in-progress changes
  // are not wiped out. New server rows that aren't in local state are merged in.
  useEffect(() => {
    // Compose-mode distributions are a projection of these same rows in the
    // parent draft. Rehydrating them would cause a child -> parent -> child
    // update loop. The state initializer restores them when the panel mounts.
    if (staged) return;
    setRows((prev) => {
      const incoming = distributions.map((d) => distToRow(d, distributionConfig));
      // Build a map of existing local rows by server id for dirty-preservation
      const localById = new Map(prev.filter((r) => r.id).map((r) => [r.id!, r]));
      const merged = incoming.map((serverRow) => {
        const local = localById.get(serverRow.id!);
        // If user is actively editing this row, keep their local version
        if (local?._dirty) return local;
        return serverRow;
      });
      // Keep any local _isNew rows the user has added but not yet saved
      const newUnsaved = prev.filter((r) => r._isNew);
      return newUnsaved.length > 0 ? [...merged, ...newUnsaved] : merged;
    });
    // Update view mode based on fresh distribution count (only if not currently mid-edit)
    setViewMode((prev) => {
      if (prev === "split") return "split"; // don't flip back if user explicitly chose split
      return distributions.length > 1 ? "split" : prev;
    });
    // Sync active basis from first distribution when it changes
    if (distributions.length > 0) {
      const firstBasis = distToRow(distributions[0]!, distributionConfig).basis;
      if (firstBasis) setActiveBasis(firstBasis);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributions, staged]);

  useEffect(() => {
    type LabelField =
      | "costCenterLabel"
      | "profitCenterLabel"
      | "projectLabel"
      | "glAccountLabel"
      | "assetLabel";
    type ValueField =
      | "costCenterId"
      | "profitCenterId"
      | "projectId"
      | "glAccountId"
      | "assetId";
    type LabelLookup = {
      entityCode: string;
      field: CompiledEntity["fields"][number] | null;
      valueField: ValueField;
      labelField: LabelField;
      value: string;
    };
    type LabelUpdate = Pick<LabelLookup, "valueField" | "labelField" | "value"> & { label: string };

    const lookups: LabelLookup[] = [];
    const cachedUpdates: LabelUpdate[] = [];

    function queueLookup(
      row: SplitRow,
      entityCode: string,
      field: CompiledEntity["fields"][number] | null,
      valueField: ValueField,
      labelField: LabelField,
    ) {
      const value = row[valueField];
      const label = row[labelField];
      if (!needsResolvedLabel(value, label)) return;

      const cacheKey = `${entityCode}:${value}`;
      const cached = displayLabelCache.current.get(cacheKey);
      if (cached) {
        cachedUpdates.push({ valueField, labelField, value, label: cached });
        return;
      }
      if (!lookups.some((lookup) => lookup.entityCode === entityCode && lookup.value === value)) {
        lookups.push({ entityCode, field, valueField, labelField, value });
      }
    }

    rows.forEach((row) => {
      queueLookup(row, distributionConfig.costCenterEntityCode, costCenterField, "costCenterId", "costCenterLabel");
      queueLookup(row, distributionConfig.profitCenterEntityCode, profitCenterField, "profitCenterId", "profitCenterLabel");
      queueLookup(row, distributionConfig.projectEntityCode, projectField, "projectId", "projectLabel");
      queueLookup(row, "gl_account", glAccountField, "glAccountId", "glAccountLabel");
      queueLookup(row, "asset", assetField, "assetId", "assetLabel");
    });

    function applyLabelUpdates(updates: LabelUpdate[]) {
      if (updates.length === 0) return;
      setRows((prev) =>
        prev.map((row) => {
          const update = updates.find((item) =>
            row[item.valueField] === item.value && needsResolvedLabel(row[item.valueField], row[item.labelField]),
          );
          return update ? { ...row, [update.labelField]: update.label } : row;
        }),
      );
    }

    applyLabelUpdates(cachedUpdates);
    if (lookups.length === 0) return;

    let cancelled = false;
    void Promise.all(
      lookups.map(async (lookup): Promise<LabelUpdate | null> => {
        const label = await resolveDisplayLabel(lookup.entityCode, lookup.value, lookup.field);
        if (!label) return null;
        displayLabelCache.current.set(`${lookup.entityCode}:${lookup.value}`, label);
        return { valueField: lookup.valueField, labelField: lookup.labelField, value: lookup.value, label };
      }),
    ).then((updates) => {
      if (!cancelled) applyLabelUpdates(updates.filter((update): update is LabelUpdate => Boolean(update)));
    });

    return () => { cancelled = true; };
  }, [
    assetField,
    costCenterField,
    distributionConfig.costCenterEntityCode,
    distributionConfig.profitCenterEntityCode,
    distributionConfig.projectEntityCode,
    glAccountField,
    profitCenterField,
    projectField,
    rows,
  ]);

  function switchViewMode(next: ViewMode) {
    if (readOnly && next === "split" && rows.length === 0) return;
    setViewMode(next);
    if (next === "split" && rows.length === 0) {
      const r = newRow(lineAmount, cc, 1, distributionConfig);
      r.distributedAmount = computeDistributed(r, r.basis);
      setRows([r]);
    }
  }

  const computeDistributed = (row: SplitRow, basis: DistBasis): number => {
    const calculation = basisCalculation(distributionConfig, basis);
    if (calculation === "percent") return lineAmount * ((row.splitPct ?? 0) / 100);
    if (calculation === "amount") return row.splitAmount ?? 0;
    if (calculation === "full") return lineAmount;
    return 0;
  };

  const hasDirtyRows = useMemo(() => rows.some((row) => row._dirty), [rows]);
  const hasSavingRows = useMemo(() => Object.keys(saving).length > 0, [saving]);

  useEffect(() => {
    onDirtyChange?.(hasDirtyRows);
  }, [hasDirtyRows, onDirtyChange]);

  useEffect(() => {
    if (!staged || !onStagedChange) return;
    // An untouched empty editor means "use the server default", not "replace
    // the default with zero rows". Once rows have been staged, publishing an
    // empty list is intentional (the parent can remove that graph node).
    if (rows.length === 0 && !stagedPublishedRef.current) return;
    if (rows.length > 0) stagedPublishedRef.current = true;
    const fields = distributionConfig.fields;
    onStagedChange(rows.map((row) => {
      const calc = basisCalculation(distributionConfig, row.basis);
      return {
        [fields.basis]: row.basis,
        [fields.splitPct]: calc === "percent" ? row.splitPct : null,
        [fields.splitAmount]: calc === "amount" ? row.splitAmount : null,
        split_quantity: null,
        [fields.distributedAmount]: computeDistributed(row, row.basis),
        [fields.currencyCode]: row.currencyCode || cc,
        [fields.glAccountId]: row.glAccountId || null,
        [fields.costCenterId]: row.costCenterId || null,
        [fields.profitCenterId]: row.profitCenterId || null,
        [fields.projectId]: row.projectId || null,
        [fields.assetId]: lineAllowsAsset ? (row.assetId || null) : null,
        [fields.reasonCode]: row.reasonCode || null,
        [fields.description]: row.description || null,
      };
    }));
  // The callback is intentionally driven by editable row state; parent draft changes
  // must not recreate the editor or erase in-flight picker labels.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, staged, distributionConfig, cc, lineAllowsAsset]);

  // ── Row mutation helpers ────────────────────────────────────────────────────

  function updateRow(idx: number, patch: Partial<SplitRow>) {
    if (readOnly) return;
    setRows((prev) => {
      const next = [...prev];
      const updated = { ...next[idx]!, ...patch, _dirty: true };
      updated.distributedAmount = computeDistributed(updated, updated.basis);
      next[idx] = updated;
      return next;
    });
  }

  function addRow() {
    if (readOnly) return;
    const nextNo = (rows[rows.length - 1]?.distributionNo ?? 0) + 1;
    const r = newRow(lineAmount, cc, nextNo, distributionConfig);
    r.distributedAmount = computeDistributed(r, r.basis);
    setRows((prev) => [...prev, r]);
  }

  // Single mode: work on rows[0], add if empty
  function updateSingleRow(patch: Partial<SplitRow>) {
    if (readOnly) return;
    if (rows.length === 0) {
      const row = { ...newRow(lineAmount, cc, 1, distributionConfig), ...patch, _dirty: true };
      row.distributedAmount = computeDistributed(row, row.basis);
      setRows([row]);
    } else {
      updateRow(0, patch);
    }
  }

  async function saveRow(idx: number, options: { notify?: boolean } = {}): Promise<boolean> {
    if (readOnly) return true;
    const notify = options.notify ?? true;
    const row = rows[idx];
    if (!row || !row._dirty) return true;
    // Capture labels before async operation — API response won't include joined label fields
    const preSaveLabels = {
      costCenterLabel:   row.costCenterLabel,
      profitCenterLabel: row.profitCenterLabel,
      projectLabel:      row.projectLabel,
      assetLabel:        row.assetLabel,
    };
    const key = row.id ?? `new-${idx}`;
    setSaving((s) => ({ ...s, [key]: true }));
    setMutationError(null);

    try {
      const fields = distributionConfig.fields;
      const calc = basisCalculation(distributionConfig, row.basis);
      const distributedAmount = computeDistributed(row, row.basis);
      const glAccountChanged = row.glAccountId !== row.originalGlAccountId;
      const payload: Record<string, unknown> = {
        [fields.basis]:             row.basis,
        [fields.splitPct]:          calc === "percent" ? row.splitPct : null,
        [fields.splitAmount]:       calc === "amount"  ? row.splitAmount : null,
        [fields.distributedAmount]: distributedAmount,
        [fields.currencyCode]:      row.currencyCode || cc,
        [fields.costCenterId]:      row.costCenterId  || null,
        [fields.profitCenterId]:    row.profitCenterId || null,
        [fields.projectId]:         row.projectId     || null,
        [fields.assetId]:           lineAllowsAsset ? (row.assetId || null) : null,
        [fields.description]:       row.description   || null,
      };
      if (glAccountChanged) {
        payload[fields.glAccountId] = row.glAccountId || null;
        payload[fields.reasonCode] = row.reasonCode || "manual_account_override";
      }

      // Determine POST vs PATCH: use PATCH whenever we have a server-assigned id,
      // regardless of _isNew flag, to prevent duplicate inserts on retry.
      const isNew = !row.id;
      const url = isNew
        ? `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}/distributions`
        : `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}/distributions/${encodeURIComponent(row.id!)}`;

      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setMutationError(errBody.error ?? `Save failed (${res.status})`);
        return false;
      }

      const body = (await res.json()) as { data: AccountingDistribution };
      setRows((prev) => {
        const next = [...prev];
        const saved = distToRow(body.data, distributionConfig);
        next[idx] = {
          ...saved,
          costCenterLabel:   saved.costCenterLabel   || preSaveLabels.costCenterLabel,
          profitCenterLabel: saved.profitCenterLabel || preSaveLabels.profitCenterLabel,
          projectLabel:      saved.projectLabel      || preSaveLabels.projectLabel,
          assetLabel:        saved.assetLabel        || preSaveLabels.assetLabel,
        };
        return next;
      });
      if (notify) onMutated?.();
      return true;
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Network error — please retry");
      return false;
    } finally {
      setSaving((s) => {
        const n = { ...s };
        delete n[key];
        return n;
      });
    }
  }

  async function saveDirtyRows(): Promise<boolean> {
    if (readOnly) return true;
    if (staged) return true;
    const dirtyIndexes = rows.flatMap((row, idx) => row._dirty ? [idx] : []);
    if (dirtyIndexes.length === 0) return true;

    for (const idx of dirtyIndexes) {
      const ok = await saveRow(idx, { notify: false });
      if (!ok) return false;
    }
    onMutated?.();
    return true;
  }

  useImperativeHandle(ref, () => ({
    hasDirty: () => rows.some((row) => row._dirty),
    saveDirty: saveDirtyRows,
  }));

  async function deleteRow(idx: number) {
    if (readOnly) return;
    const row = rows[idx];
    if (!row) return;

    if (staged || row._isNew || !row.id) {
      setRows((prev) => prev.filter((_, i) => i !== idx));
      return;
    }

    const key = row.id;
    setSaving((s) => ({ ...s, [key]: true }));
    setMutationError(null);
    try {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(line.id)}/distributions/${encodeURIComponent(row.id)}`,
        { method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() } },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setMutationError(errBody.error ?? `Delete failed (${res.status})`);
        return;
      }
      setRows((prev) => prev.filter((_, i) => i !== idx));
      onMutated?.();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Network error — please retry");
    } finally {
      setSaving((s) => {
        const n = { ...s };
        delete n[key];
        return n;
      });
    }
  }

  function rebalanceRows() {
    if (readOnly || rows.length === 0) return;
    const calc = basisCalculation(distributionConfig, activeBasis);
    const n = rows.length;
    setRows((prev) =>
      prev.map((r, i) => {
        const pct = parseFloat((100 / n).toFixed(4));
        const amt = parseFloat((lineAmount / n).toFixed(2));
        const patch: Partial<SplitRow> = { _dirty: true };
        if (calc === "percent") patch.splitPct = i < n - 1 ? pct : parseFloat((100 - pct * (n - 1)).toFixed(4));
        else if (calc === "amount") patch.splitAmount = i < n - 1 ? amt : parseFloat((lineAmount - amt * (n - 1)).toFixed(2));
        const next = { ...r, ...patch };
        next.distributedAmount = computeDistributed(next, activeBasis);
        return next;
      }),
    );
  }

  const isSingleRowSaving = !!saving[rows[0]?.id ?? "new-0"];
  const allocationTotal = allocationInputTotal(rows, activeBasis, distributionConfig);
  const allocationTarget = allocationInputTarget(activeBasis, distributionConfig, lineAmount, lineFormData);
  const allocatedPct = allocationTarget > 0 ? Math.min(100, (allocationTotal / allocationTarget) * 100) : 0;
  const isFullyAllocated = allocationTarget > 0 && Math.abs(allocationTotal - allocationTarget) < 0.005;

  return (
    <div className="flex flex-col">

      {/* ── Panel header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-2.5">
        <ViewModeToggle value={viewMode} onChange={switchViewMode} splitDisabled={readOnly && rows.length === 0} />
        {(hasDirtyRows || hasSavingRows) && (
          <span className={cn(
            "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium",
            hasSavingRows
              ? "border-input bg-background text-muted-foreground"
              : "border-warning/30 bg-warning/10 text-warning",
          )}>
            {hasSavingRows ? "Saving accounting" : "Pending accounting changes"}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {viewMode === "split" && !readOnly && (
            <>
              <BasisToggle
                value={activeBasis}
                options={distributionConfig.basisTypes}
                onChange={(b) => {
                  setActiveBasis(b);
                  setRows((prev) =>
                    prev.map((r) => {
                      const next = { ...r, basis: b, _dirty: true };
                      next.distributedAmount = computeDistributed(next, b);
                      return next;
                    }),
                  );
                }}
              />
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={rebalanceRows}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  Rebalance
                </button>
              )}
            </>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3">

        {viewMode === "single" ? (
          /* ── Single distribution form ─────────────────────────────── */
          <>
            <SingleDistributionFormV2
              row={rows[0] ?? null}
              costCenterField={costCenterField}
              profitCenterField={profitCenterField}
              projectField={projectField}
              glAccountField={glAccountField}
              assetField={assetField}
              profitCenterEntityCode={distributionConfig.profitCenterEntityCode}
              lineFormData={lineFormData}
              documentFormData={parentFormData ?? null}
              lineAllowsAsset={lineAllowsAsset}
              saving={isSingleRowSaving}
              readOnly={readOnly}
              onRowChange={updateSingleRow}
            />
            {mutationError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mt-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 min-w-0">{mutationError}</span>
                <button type="button" onClick={() => setMutationError(null)} className="shrink-0 hover:opacity-70">
                  <XCircle className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── Split distribution grid ──────────────────────────────── */
          <>
            <div className="space-y-1 mb-3">
              {rows.length === 0 && (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  {readOnly ? "No splits yet." : "No splits yet - click + Add split below."}
                </p>
              )}
              {rows.map((row, idx) => {
                const key = row.id ?? `new-${idx}`;
                const isSaving = !!saving[key];
                return (
                  <AccountingSplitRowEditor
                    key={key}
                    compact
                    title={`Split ${idx + 1}`}
                    splitLabel={activeBasis === "PERCENT" ? "Split %" : activeBasis === "QUANTITY" ? "Split Quantity" : "Split Amount"}
                    className={cn(
                      "transition-colors",
                      row._dirty && !row._isNew && "border-warning/20 bg-warning/5",
                      row._isNew && "border-dashed border-input",
                    )}
                    deleteAction={!readOnly ? (
                      <button
                        type="button"
                        onClick={() => void deleteRow(idx)}
                        disabled={isSaving}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : undefined}
                    glAccount={(
                      <GlAccountPicker
                        valueKind="id"
                        value={row.glAccountId || null}
                        displayLabel={row.glAccountLabel || null}
                        field={glAccountField}
                        formData={parentFormData ?? lineFormData}
                        onChange={(id, label) => updateRow(idx, {
                          glAccountId:    id ?? "",
                          glAccountLabel: label ?? "",
                          reasonCode:     row.reasonCode || "manual_account_override",
                        })}
                        placeholder="Search GL account..."
                        disabled={isSaving || readOnly}
                      />
                    )}
                    splitValue={activeBasis === "PERCENT" ? (
                      <div className="flex items-center gap-1">
                        <InlineInput
                          type="number"
                          value={String(row.splitPct ?? "")}
                          onChange={(v) => updateRow(idx, { splitPct: Number(v) || 0 })}
                          placeholder="0"
                          disabled={isSaving || readOnly}
                          className="text-right"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">%</span>
                      </div>
                    ) : (
                      <InlineInput
                        type="number"
                        value={String(row.splitAmount ?? "")}
                        onChange={(v) => updateRow(idx, { splitAmount: Number(v) || 0 })}
                        placeholder="0.00"
                        disabled={isSaving || readOnly}
                        className="text-right"
                      />
                    )}
                    distributed={(
                      <div className="flex h-9 items-center justify-end rounded-md border border-border bg-muted/30 px-3 text-sm font-medium tabular-nums">
                        {fmtAmt(computeDistributed(row, activeBasis), row.currencyCode || cc)}
                      </div>
                    )}
                    costCenter={(
                      <CostCenterPicker
                        value={row.costCenterId || null}
                        displayLabel={row.costCenterLabel || null}
                        field={costCenterField}
                        formData={lineFormData}
                        onChange={(id, label) => updateRow(idx, { costCenterId: id ?? "", costCenterLabel: label ?? "" })}
                        placeholder="Search cost centre..."
                        disabled={isSaving || readOnly}
                      />
                    )}
                    profitCenter={(
                      <DimensionPicker
                        entityCode={distributionConfig.profitCenterEntityCode}
                        value={row.profitCenterId || null}
                        displayLabel={row.profitCenterLabel || null}
                        field={profitCenterField}
                        formData={lineFormData}
                        onChange={(id, label) => updateRow(idx, {
                          profitCenterId: id ?? "",
                          profitCenterLabel: label ?? "",
                        })}
                        placeholder="Search profit centre..."
                        disabled={isSaving || readOnly}
                      />
                    )}
                    project={(
                      <ProjectPicker
                        value={row.projectId || null}
                        displayLabel={row.projectLabel || null}
                        field={projectField}
                        formData={lineFormData}
                        onChange={(id, label) => updateRow(idx, { projectId: id ?? "", projectLabel: label ?? "" })}
                        placeholder="Search project..."
                        disabled={isSaving || readOnly}
                      />
                    )}
                    asset={(
                      lineAllowsAsset ? (
                        <AssetPicker
                          value={row.assetId || null}
                          displayLabel={row.assetLabel || null}
                          field={assetField}
                          disabled={isSaving || readOnly}
                          onChange={(id, label) => updateRow(idx, {
                            assetId:    id ?? "",
                            assetLabel: label ?? "",
                          })}
                        />
                      ) : (
                        <div className="flex h-8 items-center rounded-md border border-input bg-muted/30 px-2 text-sm text-muted-foreground">
                          No asset on line
                        </div>
                      )
                    )}
                    reason={row.glAccountId !== row.originalGlAccountId && !readOnly ? (
                      <ReasonCodePicker
                        category="accounting"
                        value={row.reasonCode || "manual_account_override"}
                        onChange={(code) => updateRow(idx, { reasonCode: code || "manual_account_override" })}
                        required
                        disabled={isSaving}
                      />
                    ) : undefined}
                    description={(
                      <InlineInput
                        value={row.description}
                        onChange={(value) => updateRow(idx, { description: value })}
                        placeholder="Optional distribution note"
                        disabled={isSaving || readOnly}
                      />
                    )}
                  />
                );
              })}
            </div>

            {/* Mutation error */}
            {mutationError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mb-3">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 min-w-0">{mutationError}</span>
                <button type="button" onClick={() => setMutationError(null)} className="shrink-0 hover:opacity-70">
                  <XCircle className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Allocation progress bar */}
            <div className="rounded-full h-1.5 bg-muted overflow-hidden mb-1">
              <div
                className={cn("h-full rounded-full transition-all", isFullyAllocated ? "bg-success" : allocatedPct > 100 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(100, allocatedPct)}%` }}
              />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cn("text-xs font-medium", isFullyAllocated ? "text-success" : "text-muted-foreground")}>
                  {isFullyAllocated ? "Fully allocated" : "Partially allocated"}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {allocatedPct.toFixed(2)}% / 100.00%
                </span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add split
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export { AccountingPanel as SplitAccountingPanel };
