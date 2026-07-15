/**
 * @athyper/entity-runtime — Default Field Renderers
 *
 * Built-in renderers for all standard data types.
 * Call registerDefaults() at app startup to populate the registry.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { Input, Switch, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@athyper/ui/primitives";
// Select primitives kept for EnumRenderer (LookupSelect).
import { DatePicker, AsyncCombobox } from "@athyper/ui/composites";
import {
  EntityPicker,
  entityRowToPickerOption,
  hasLookupDependency,
  readLookupFilters,
  resolveEntityPickerOptionConfig,
  searchLookupOptions,
  searchParamsForLookupFilters,
  type EntityPickerSearchContext,
  type EntityPickerSearchResponse,
  type EntityPickerOption,
  type EntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
import { appEntityDetailHref } from "@athyper/runtime-shared/core";
import { formatUserDateValue, useRuntimeUserPreferences } from "@athyper/runtime-shared/preferences";
import { MoneySummary, QuantityUnit } from "@athyper/domain-widgets";
import { useLookupDomain } from "@athyper/query";
import { cn } from "@athyper/theme/utils";
import { registerFieldRenderer, type FieldRendererProps } from "./registry";

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function viewTextClass(density?: FieldRendererProps["density"]): string {
  if (density === "table") return "text-sm leading-5";
  return density === "compact" || density === "sheet" ? "text-xs" : "text-sm";
}

function viewEmptyClass(density?: FieldRendererProps["density"]): string {
  return cn(viewTextClass(density), "text-muted-foreground");
}

function viewIdClass(density?: FieldRendererProps["density"]): string {
  return cn(density === "compact" || density === "sheet" ? "text-xs" : viewTextClass(density), "text-muted-foreground");
}

function badgeSize(density?: FieldRendererProps["density"]): "sm" | "md" {
  return density === "compact" || density === "sheet" ? "sm" : "md";
}

function viewBadgeClass(density?: FieldRendererProps["density"]): string | undefined {
  return density === "table" ? "text-xs leading-normal" : undefined;
}

// ── Text / String ───────────────────────────────────────────────

function TextRenderer({ value, field, mode, density, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    return <span className={viewTextClass(density)}>{String(value ?? "—")}</span>;
  }
  return (
    <Input
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={field.label ?? field.name}
      error={error}
    />
  );
}

// ── Number / Integer / Decimal ──────────────────────────────────

function NumberRenderer({ value, field, mode, density, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    if (field.unit) {
      return <QuantityUnit quantity={Number(value ?? 0)} unit={field.unit} />;
    }
    return <span className={cn(viewTextClass(density), "tabular-nums")}>{value != null ? String(value) : "—"}</span>;
  }
  return (
    <Input
      type="number"
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.valueAsNumber)}
      placeholder={field.label ?? field.name}
      error={error}
    />
  );
}

// ── Boolean UI type sets (exported for EntityForm layout decisions) ──

/** All ui_types that embed their label — EntityForm must skip its own Label */
export const BOOLEAN_UI_TYPES = new Set([
  "boolean",
  "boolean_switch_card",
  "boolean_chip",
]);

/** Subset that need full-width (md:col-span-2) in the form grid */
export const BOOLEAN_FULL_WIDTH_UI_TYPES = new Set([
  "boolean",
  "boolean_switch_card",
]);

// ── Boolean — Pattern A: Switch Card ────────────────────────────
// Best for governance / settings sections. Full-width card, label on left, toggle on right.

function BooleanSwitchCardRenderer({ value, field, mode, density, onChange }: FieldRendererProps) {
  if (mode === "view") {
    if (density === "table") {
      return (
        <span className={cn("inline-flex items-center gap-1.5 text-sm leading-5", value ? "text-foreground" : "text-muted-foreground")}>
          <span className={cn("size-2 shrink-0 rounded-full", value ? "bg-emerald-500" : "bg-muted-foreground/30")} aria-hidden />
          {value ? "Yes" : "No"}
        </span>
      );
    }
    return (
      <Badge variant={value ? "success" : "muted"} size={badgeSize(density)} className={viewBadgeClass(density)}>
        {value ? "Yes" : "No"}
      </Badge>
    );
  }
  if (density === "compact" || density === "table" || density === "sheet") {
    return (
      <Switch
        checked={Boolean(value)}
        onCheckedChange={(checked) => onChange?.(checked)}
      />
    );
  }
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/30">
      <span className="text-sm font-medium leading-none">
        {field.label ?? field.name}
      </span>
      <Switch
        checked={Boolean(value)}
        onCheckedChange={(checked) => onChange?.(checked)}
      />
    </div>
  );
}

// ── Boolean — Pattern C: Pressable Chip ─────────────────────────
// Best for governance flag groups. Compact pill — checked = filled, unchecked = outlined.

function BooleanChipRenderer({ value, field, mode, density, onChange }: FieldRendererProps) {
  if (mode === "view") {
    if (density === "table") {
      return (
        <span className={cn("inline-flex items-center gap-1.5 text-sm leading-5", value ? "text-foreground" : "text-muted-foreground")}>
          <span className={cn("size-2 shrink-0 rounded-full", value ? "bg-emerald-500" : "bg-muted-foreground/30")} aria-hidden />
          {value ? "Yes" : "No"}
        </span>
      );
    }
    return (
      <Badge variant={value ? "success" : "muted"} size={badgeSize(density)} className={viewBadgeClass(density)}>
        {value ? "Yes" : "No"}
      </Badge>
    );
  }
  if (density === "compact" || density === "table" || density === "sheet") {
    return (
      <Switch
        checked={Boolean(value)}
        onCheckedChange={(checked) => onChange?.(checked)}
      />
    );
  }
  const isOn = Boolean(value);
  return (
    <button
      type="button"
      onClick={() => onChange?.(!isOn)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        isOn
          ? "border-transparent bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {isOn ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {field.label ?? field.name}
    </button>
  );
}

// ── Date / DateTime ─────────────────────────────────────────────

function DateRenderer({ value, field, mode, density, onChange, error }: FieldRendererProps) {
  const datePrefs = useRuntimeUserPreferences();
  const includeTime = field.data_type !== "date";
  const formatDisplay = (nextValue: unknown) =>
    formatUserDateValue(nextValue, {
      ...datePrefs,
      includeTime,
    });

  if (mode === "view") {
    if (!value) return <span className={viewEmptyClass(density)}>—</span>;
    return <span className={viewTextClass(density)}>{formatDisplay(value)}</span>;
  }
  return (
    <DatePicker
      value={value != null ? String(value) : null}
      mode={includeTime ? "datetime" : "date"}
      formatDisplay={(nextValue) => formatDisplay(nextValue)}
      onChange={(v) => onChange?.(v)}
      error={error}
    />
  );
}

// ── Money ───────────────────────────────────────────────────────

function MoneyRenderer({ value, mode, density, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    const data = value as { amount?: number; currency_code?: string } | null;
    if (!data?.amount) return <span className={viewEmptyClass(density)}>—</span>;
    return <MoneySummary amount={data.amount} currencyCode={data.currency_code ?? "USD"} />;
  }
  return (
    <Input
      type="number"
      step="0.01"
      value={String((value as { amount?: number })?.amount ?? "")}
      onChange={(e) => onChange?.({ amount: e.target.valueAsNumber })}
      error={error}
    />
  );
}

// ── Enum / Lookup ───────────────────────────────────────────────

function EnumRenderer({ value, field, mode, density, onChange, error }: FieldRendererProps) {
  const domainCode = field.enum_domain_code ?? "";
  const valueCase = readLookupValueCase(field.lookup_config);
  const valueMap = readLookupValueMap(field.lookup_config);
  const { data } = useLookupDomain(domainCode, { enabled: mode === "view" && !!domainCode });

  if (mode === "view") {
    if (value === null || value === undefined || value === "") {
      return <span className={viewEmptyClass(density)}>—</span>;
    }
    const code = String(value);
    const codeLower = code.toLowerCase();
    const label = data?.values?.find((v) => v.code.toLowerCase() === codeLower)?.name ?? humanizeToken(code);
    // Table density: plain text — borders imply interactivity in a list cell
    if (density === "table") return <span className={viewTextClass(density)}>{label}</span>;
    return <Badge variant="outline" size={badgeSize(density)} className={viewBadgeClass(density)}>{label}</Badge>;
  }
  return (
    <LookupSelect
      domainCode={domainCode}
      value={String(value ?? "")}
      valueCase={valueCase}
      valueMap={valueMap}
      onChange={(v) => onChange?.(v)}
      error={error}
    />
  );
}

type LookupValueCase = "preserve" | "upper" | "lower";

function readLookupValueCase(lookupConfig: Record<string, unknown> | null | undefined): LookupValueCase {
  const raw = typeof lookupConfig?.["value_case"] === "string"
    ? lookupConfig["value_case"].trim().toLowerCase()
    : "";
  if (raw === "upper" || raw === "uppercase") return "upper";
  if (raw === "lower" || raw === "lowercase") return "lower";
  return "preserve";
}

function applyLookupValueCase(value: string, valueCase: LookupValueCase): string {
  if (valueCase === "upper") return value.toUpperCase();
  if (valueCase === "lower") return value.toLowerCase();
  return value;
}

function readLookupValueMap(lookupConfig: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = lookupConfig?.["value_map"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function lookupCodeForStoredValue(value: string, valueMap: Record<string, string>): string {
  const direct = Object.entries(valueMap).find(([, stored]) => stored === value)?.[0];
  return direct ?? value.toLowerCase();
}

function storedValueForLookupCode(code: string, valueCase: LookupValueCase, valueMap: Record<string, string>): string {
  return valueMap[code] ?? applyLookupValueCase(code, valueCase);
}

interface LookupSelectProps {
  domainCode: string;
  value: string;
  valueCase?: LookupValueCase;
  valueMap?: Record<string, string>;
  onChange: (value: string) => void;
  error?: string;
}

function LookupSelect({ domainCode, value, valueCase = "preserve", valueMap = {}, onChange, error }: LookupSelectProps) {
  const { data, isLoading } = useLookupDomain(domainCode);
  const activeValues = (data?.values ?? [])
    .filter((v) => v.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order);

  // Normalize to lowercase so stored values (e.g. entity_class='MASTER')
  // match the lowercase lookup codes required by the DB constraint.
  const normalizedValue = value ? lookupCodeForStoredValue(value, valueMap) : value;

  return (
    <div className="space-y-1">
      <Select
        value={normalizedValue}
        onValueChange={(next) => onChange(storedValueForLookupCode(next, valueCase, valueMap))}
        disabled={isLoading || !domainCode}
      >
        <SelectTrigger className={error ? "border-destructive" : undefined}>
          <SelectValue placeholder={isLoading ? "Loading…" : "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {activeValues.map((v) => (
            <SelectItem key={v.code} value={v.code}>
              {v.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── UUID ─────────────────────────────────────────────────────────

function UuidRenderer({ value, mode, density }: FieldRendererProps) {
  if (mode === "view") {
    const str = String(value ?? "");
    return <span className={cn(viewIdClass(density), "font-mono")}>{str.slice(0, 8)}…</span>;
  }
  return <span className={viewTextClass(density)}>{String(value ?? "")}</span>;
}

// ── Reference (entity chooser) ───────────────────────────────────

function getReferenceEntityCode(field: FieldRendererProps["field"]): string | null {
  const referenceConfig = field.reference_config as Record<string, unknown> | null | undefined;
  const rawEntity = referenceConfig?.["target_entity"]
    ?? referenceConfig?.["targetEntity"]
    ?? referenceConfig?.["ref_entity"]
    ?? referenceConfig?.["entity_code"]
    ?? referenceConfig?.["entity"];
  if (typeof rawEntity === "string" && rawEntity.trim()) {
    const parts = rawEntity.trim().split(".").filter(Boolean);
    return parts.at(-1) ?? rawEntity.trim();
  }
  return null;
}

function getReferenceValueField(field: FieldRendererProps["field"]): string {
  const referenceConfig = field.reference_config as Record<string, unknown> | null | undefined;
  const rawField = referenceConfig?.["value_field"]
    ?? referenceConfig?.["valueField"]
    ?? referenceConfig?.["target_field"]
    ?? referenceConfig?.["targetField"];
  return typeof rawField === "string" && rawField.trim() ? rawField.trim() : "id";
}

function referenceStoresRecordId(field: FieldRendererProps["field"]): boolean {
  return getReferenceValueField(field).toLowerCase() === "id";
}

function ReferencePickerField({
  entityCode,
  field,
  value,
  formData,
  displayLabel,
  optionConfig,
  disabled,
  onChange,
  error,
}: {
  entityCode: string | null;
  field: FieldRendererProps["field"];
  value: string;
  formData?: Record<string, unknown>;
  displayLabel?: string | null;
  optionConfig?: EntityPickerOptionConfig;
  disabled?: boolean;
  onChange: (v: string) => void;
  error?: string;
}) {
  const lookupFilters = useMemo(
    () => readLookupFilters(field.lookup_config),
    [field.lookup_config],
  );
  const searchParams = useMemo(
    () => searchParamsForLookupFilters(lookupFilters),
    [lookupFilters],
  );
  const hasDependentLookup = useMemo(
    () => hasLookupDependency(field.lookup_config),
    [field.lookup_config],
  );
  const metadataSearch = useCallback(
    (
      query: string,
      context?: EntityPickerSearchContext,
    ): Promise<EntityPickerSearchResponse> => {
      if (!entityCode) return Promise.resolve({ options: [], totalCount: 0 });
      return searchLookupOptions({
        entityCode,
        query,
        lookupConfig: field.lookup_config,
        formData,
        optionConfig,
        context,
      });
    },
    [entityCode, field.lookup_config, formData, optionConfig],
  );

  return (
    <EntityPicker
      entityCode={entityCode}
      value={value || null}
      displayLabel={displayLabel}
      search={hasDependentLookup ? metadataSearch : undefined}
      searchParams={hasDependentLookup ? undefined : searchParams}
      optionConfig={optionConfig}
      getOptionHref={
        entityCode
          ? (option) => {
              const recordId = option.recordId ?? option.value;
              return appEntityDetailHref(entityCode, recordId);
            }
          : undefined
      }
      onChange={(v) => onChange(v ?? "")}
      disabled={disabled || !entityCode}
      error={error}
      loadOnOpen
      placeholder="Search records…"
    />
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReferenceDisplayFormat = "label" | "code_label" | "label_code" | "code";

function referenceDisplayFormat(field: FieldRendererProps["field"]): ReferenceDisplayFormat {
  const referenceConfig = field.reference_config as Record<string, unknown> | null | undefined;
  const rawFormat = typeof referenceConfig?.["display_format"] === "string"
    ? referenceConfig["display_format"]
    : typeof referenceConfig?.["displayFormat"] === "string"
      ? referenceConfig["displayFormat"]
      : field.format;

  if (
    rawFormat === "label" ||
    rawFormat === "code_label" ||
    rawFormat === "label_code" ||
    rawFormat === "code"
  ) {
    return rawFormat;
  }

  return "label_code";
}

function formatReferenceDisplayLabel(
  label: string | null | undefined,
  code: string | null | undefined,
  field: FieldRendererProps["field"],
  density?: FieldRendererProps["density"],
): string | null {
  const labelText = typeof label === "string" ? label.trim() : "";
  const codeText = typeof code === "string" ? code.trim() : "";
  if (!labelText && !codeText) return null;

  const format = referenceDisplayFormat(field);
  if (format === "code") return codeText || labelText;
  if (!labelText) return codeText;
  // Table cells: label only — "(CODE)" suffix adds noise without a detail panel to follow up
  if (format === "label" || density === "table" || !codeText || sameReferenceText(labelText, codeText)) return labelText;
  if (format === "code_label") return `${codeText} - ${labelText}`;
  return `${labelText} (${codeText})`;
}

function referenceOptionDisplayLabel(option: EntityPickerOption, field: FieldRendererProps["field"], density?: FieldRendererProps["density"]): string | null {
  return formatReferenceDisplayLabel(option.label, option.code, field, density);
}

function ReferenceRenderer(props: FieldRendererProps) {
  if (!referenceStoresRecordId(props.field)) {
    return <CodeReferenceRenderer {...props} />;
  }
  return <UuidReferenceRenderer {...props} />;
}

function UuidReferenceRenderer({ value, field, mode, density, formData, onChange, error, disabled }: FieldRendererProps) {
  const entityCode    = getReferenceEntityCode(field);
  const optionConfig  = resolveEntityPickerOptionConfig(field.reference_config);
  const uuid          = typeof value === "string" && UUID_RE.test(value) ? value : null;

  const { data: refRecord, isLoading: refRecordLoading } = useQuery<{ data: Record<string, unknown> } | null>({
    queryKey: ["entity-ref", entityCode ?? "", uuid ?? ""],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode!)}/${encodeURIComponent(uuid!)}`,
        { signal },
      );
      if (!res.ok) return null;
      return res.json() as Promise<{ data: Record<string, unknown> }>;
    },
    enabled: !!entityCode && !!uuid,
    staleTime: 5 * 60 * 1000,
  });

  const displayLabel = (() => {
    const refData = refRecord?.data;
    if (!refData) return null;
    const option = entityRowToPickerOption(refData, entityCode, optionConfig);
    return referenceOptionDisplayLabel(option, field, density);
  })();
  const pickerDisplayLabel = displayLabel ?? (uuid && refRecordLoading ? "Loading..." : null);

  if (mode === "view") {
    if (!value) return <span className={viewEmptyClass(density)}>—</span>;
    if (displayLabel) {
      return <span className={viewTextClass(density)}>{displayLabel}</span>;
    }
    return (
      <span className={cn(viewIdClass(density), "font-mono")}>
        {String(value).slice(0, 8)}…
      </span>
    );
  }

  return (
    <ReferencePickerField
      entityCode={entityCode}
      field={field}
      value={String(value ?? "")}
      formData={formData}
      displayLabel={pickerDisplayLabel}
      optionConfig={optionConfig}
      disabled={disabled}
      onChange={(v) => onChange?.(v)}
      error={error}
    />
  );
}

// ── Country Picker ──────────────────────────────────────────────

function sameReferenceText(left: unknown, right: string): boolean {
  return typeof left === "string" && left.trim().toLowerCase() === right.trim().toLowerCase();
}

function optionReferenceValue(
  option: EntityPickerOption,
  field: FieldRendererProps["field"],
  optionConfig?: EntityPickerOptionConfig,
): string {
  const valueField = getReferenceValueField(field);
  const configuredValue = valueField ? option.raw?.[valueField] : undefined;
  const configuredCode = optionConfig?.codeField ? option.raw?.[optionConfig.codeField] : undefined;
  const rawValue = configuredValue ?? configuredCode ?? option.raw?.["code"] ?? option.raw?.["value"] ?? option.code;
  return typeof rawValue === "string" && rawValue.trim() ? rawValue.trim() : option.value;
}

interface RuntimeFieldOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

function isRuntimeFieldOption(value: unknown): value is RuntimeFieldOption {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record["value"] === "string" && typeof record["label"] === "string";
}

function runtimeOptionContextEntries(rowData?: Record<string, unknown>, formData?: Record<string, unknown>): [string, string][] {
  const source = rowData ?? formData;
  if (!source) return [];
  return Object.entries(source)
    .filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    })
    .filter(([, value]) => value !== "" && value !== false)
    .map(([key, value]) => [key, String(value)]);
}

function CodeReferenceRenderer({
  value,
  field,
  mode,
  density,
  sourceEntityCode,
  rowData,
  formData,
  onChange,
  error,
  disabled,
}: FieldRendererProps) {
  const entityCode = getReferenceEntityCode(field);
  const optionConfig = resolveEntityPickerOptionConfig(field.reference_config);
  const code = typeof value === "string" ? value.trim() : "";
  const runtimeContextEntries = useMemo(
    () => runtimeOptionContextEntries(rowData, formData),
    [formData, rowData],
  );

  const { data: runtimeOptions = [], isLoading: runtimeOptionsLoading } = useQuery<RuntimeFieldOption[]>({
    queryKey: ["runtime-field-options", sourceEntityCode ?? "", field.name, code, runtimeContextEntries],
    queryFn: async ({ signal }) => {
      if (!sourceEntityCode || !code) return [];
      const params = new URLSearchParams({ value: code, q: code });
      for (const [key, item] of runtimeContextEntries) {
        params.set(`context.${key}`, item);
      }

      const res = await fetch(
        `/api/runtime-options/${encodeURIComponent(sourceEntityCode)}/${encodeURIComponent(field.name)}?${params.toString()}`,
        { cache: "no-store", signal },
      );
      if (!res.ok) return [];
      const body = await res.json() as { options?: unknown[] };
      return (body.options ?? []).filter(isRuntimeFieldOption);
    },
    enabled: !!sourceEntityCode && !!code,
    staleTime: 5 * 60 * 1000,
  });

  const { data: options = [], isLoading } = useQuery<EntityPickerOption[]>({
    queryKey: ["code-ref", entityCode ?? "", code, field.reference_config],
    queryFn: async ({ signal }) => {
      if (!entityCode || !code) return [];
      const params = new URLSearchParams({ q: code, limit: "10", page_size: "10" });
      const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}?${params.toString()}`, { signal });
      if (!res.ok) return [];
      const body = await res.json() as { data?: Record<string, unknown>[] };
      return (body.data ?? []).map((row) => entityRowToPickerOption(row, entityCode, optionConfig));
    },
    enabled: !sourceEntityCode && !!entityCode && !!code,
    staleTime: 5 * 60 * 1000,
  });

  const runtimeSelected = runtimeOptions.find((option) => sameReferenceText(option.value, code));
  const selected = options.find((option) =>
    sameReferenceText(optionReferenceValue(option, field, optionConfig), code)
    || sameReferenceText(option.code, code)
    || sameReferenceText(option.raw?.[optionConfig?.codeField ?? "code"], code)
    || sameReferenceText(option.value, code),
  );
  const displayLabel = runtimeSelected?.label ?? (selected ? referenceOptionDisplayLabel(selected, field, density) ?? code : code);

  if (mode === "view") {
    if (!code) return <span className={viewEmptyClass(density)}>-</span>;
    const loading = runtimeOptionsLoading || isLoading;
    return <span className={viewTextClass(density)}>{loading && !runtimeSelected && !selected ? code : displayLabel}</span>;
  }

  return (
    <EntityPicker
      entityCode={entityCode}
      value={code || null}
      displayLabel={displayLabel}
      optionConfig={optionConfig}
      onOptionSelect={(option) => onChange?.(option ? optionReferenceValue(option, field, optionConfig) : "")}
      disabled={disabled || !entityCode}
      error={error}
      loadOnOpen
      placeholder={`Select ${field.label ?? field.name}`}
    />
  );
}

interface CountryRow { code: string; name: string }
interface CurrencyRow {
  code: string;
  name: string;
  symbol?: string | null;
  status?: string | null;
}

function CountryRenderer({ value, field, mode, density, onChange, error }: FieldRendererProps) {
  const [query, setQuery] = useState("");

  // Load all countries once (250 rows, rarely changes).
  const { data: countries, isLoading } = useQuery<CountryRow[]>({
    queryKey: ["ref", "countries"],
    queryFn: async () => {
      const res = await fetch("/api/relay/api/platform/ref/countries?limit=300");
      if (!res.ok) return [];
      const body = await res.json() as { data?: CountryRow[] };
      return body.data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });

  const all = countries ?? [];

  if (mode === "view") {
    const code = String(value ?? "").trim().toUpperCase();
    if (!code) return <span className={viewTextClass(density)}>-</span>;
    const country = all.find((c) => c.code.toUpperCase() === code);
    const displayLabel = country ? formatReferenceDisplayLabel(country.name, country.code, field) ?? code : code;
    return <span className={viewTextClass(density)}>{displayLabel}</span>;
  }

  const q = query.toLowerCase();
  const filtered = q
    ? all.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    : all;

  const options = filtered.map((c) => ({
    value: c.code,
    label: formatReferenceDisplayLabel(c.name, c.code, field) ?? c.name,
    description: c.code,
  }));
  const selectedCode = String(value ?? "").trim().toUpperCase();
  const selectedCountry = all.find((c) => c.code.toUpperCase() === selectedCode);
  const displayLabel = selectedCountry
    ? formatReferenceDisplayLabel(selectedCountry.name, selectedCountry.code, field)
    : null;

  return (
    <AsyncCombobox
      value={typeof value === "string" && value ? value : null}
      displayLabel={displayLabel}
      options={options}
      loading={isLoading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange?.(v)}
      placeholder="Select country…"
      searchPlaceholder="Search countries…"
      error={error}
    />
  );
}

// Currency picker (ui_type="currency") backed by shared.currency.
function CurrencyRenderer({ value, mode, density, onChange, error, disabled }: FieldRendererProps) {
  const [query, setQuery] = useState("");
  const currentCode = typeof value === "string" ? value.trim().toUpperCase() : "";

  const { data: currencies, isLoading } = useQuery<CurrencyRow[]>({
    queryKey: ["ref", "currencies", query],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ limit: "50", status: "active" });
      if (query.trim()) params.set("search", query.trim());

      const res = await fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, {
        signal,
      });
      if (!res.ok) return [];
      const body = await res.json() as { data?: CurrencyRow[] };
      return body.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const all = currencies ?? [];
  const selectedFromPage = all.find((currency) => currency.code === currentCode);
  const shouldHydrateSelected = Boolean(currentCode) && !selectedFromPage;
  const { data: hydratedSelected } = useQuery<CurrencyRow | null>({
    queryKey: ["ref", "currencies", "selected", currentCode],
    enabled: shouldHydrateSelected,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ search: currentCode, limit: "20", status: "active" });
      const res = await fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, {
        signal,
      });
      if (!res.ok) return null;
      const body = await res.json() as { data?: CurrencyRow[] };
      return (body.data ?? []).find((currency) => currency.code === currentCode) ?? null;
    },
    staleTime: 60 * 60 * 1000,
  });
  const selected = selectedFromPage ?? hydratedSelected ?? null;
  const displayLabel = selected
    ? `${selected.code} - ${selected.name}`
    : (currentCode || null);

  if (mode === "view") {
    if (!currentCode) return <span className={viewEmptyClass(density)}>-</span>;
    return <span className={viewTextClass(density)}>{displayLabel ?? currentCode}</span>;
  }

  const options = all.map((currency) => ({
    value: currency.code,
    label: `${currency.code} - ${currency.name}`,
    description: currency.symbol ?? undefined,
  }));

  return (
    <AsyncCombobox
      value={currentCode || null}
      displayLabel={displayLabel}
      options={options}
      loading={isLoading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange?.(v ? v.toUpperCase() : null)}
      placeholder="Select currency..."
      searchPlaceholder="Search currencies..."
      disabled={disabled}
      error={error}
    />
  );
}

// JSON
function JsonRenderer({ value, mode }: FieldRendererProps) {
  if (mode === "view") {
    return (
      <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs font-mono">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <pre className="text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

// Array values render as compact chips in read mode, with a simple comma editor fallback.
function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined) return "";
        return typeof item === "object" ? JSON.stringify(item) : String(item);
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch {
      // Fall back to comma splitting below.
    }
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function ArrayRenderer({ value, field, mode, density, onChange, error }: FieldRendererProps) {
  const values = normalizeArray(value);

  if (mode === "view") {
    if (values.length === 0) {
      return <span className={viewEmptyClass(density)}>-</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((item, index) => (
          <Badge key={`${item}-${index}`} variant="secondary" size={badgeSize(density)} className={viewBadgeClass(density)}>
            {field.data_type === "text_array" ? humanizeToken(item) : item}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Input
      value={values.join(", ")}
      onChange={(e) => onChange?.(e.target.value.split(",").map((item) => item.trim()).filter(Boolean))}
      placeholder={field.label ?? field.name}
      error={error}
    />
  );
}

// ── Registration ────────────────────────────────────────────────

/**
 * Register all default field renderers.
 * Call once at app startup (e.g. in apps/web providers).
 */
export function registerDefaults(): void {
  // Text family
  registerFieldRenderer("string", TextRenderer);
  registerFieldRenderer("text", TextRenderer);

  // Number family
  registerFieldRenderer("integer", NumberRenderer);
  registerFieldRenderer("bigint", NumberRenderer);
  registerFieldRenderer("decimal", NumberRenderer);
  registerFieldRenderer("numeric", NumberRenderer);

  // Boolean — data_type default → Pattern A (switch card)
  registerFieldRenderer("boolean", BooleanSwitchCardRenderer);
  registerFieldRenderer("boolean_switch_card", BooleanSwitchCardRenderer);
  // Boolean — Pattern C (pressable chip)
  registerFieldRenderer("boolean_chip", BooleanChipRenderer);

  // Date family
  registerFieldRenderer("date", DateRenderer);
  registerFieldRenderer("datetime", DateRenderer);
  registerFieldRenderer("timestamptz", DateRenderer);

  // Money
  registerFieldRenderer("money", MoneyRenderer);

  // Enum / Lookup
  registerFieldRenderer("enum", EnumRenderer);

  // Country picker (ui_type="country" — backed by shared.country lookup domain)
  registerFieldRenderer("country", CountryRenderer);
  registerFieldRenderer("currency", CurrencyRenderer);
  registerFieldRenderer("language", CodeReferenceRenderer);
  registerFieldRenderer("timezone", CodeReferenceRenderer);
  registerFieldRenderer("uom", CodeReferenceRenderer);

  // UUID
  registerFieldRenderer("uuid", UuidRenderer);
  // Reference — entity chooser dropdown in edit mode
  registerFieldRenderer("reference", ReferenceRenderer);

  // JSON
  registerFieldRenderer("json", JsonRenderer);
  registerFieldRenderer("jsonb", JsonRenderer);

  // Arrays
  registerFieldRenderer("text_array", ArrayRenderer);
  registerFieldRenderer("uuid_array", ArrayRenderer);
  registerFieldRenderer("int_array", ArrayRenderer);
  registerFieldRenderer("jsonb_array", ArrayRenderer);
}
