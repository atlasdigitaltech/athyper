/**
 * @athyper/entity-runtime — Default Field Renderers
 *
 * Built-in renderers for all standard data types.
 * Call registerDefaults() at app startup to populate the registry.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input, Checkbox, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@athyper/ui/primitives";
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
  type EntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
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
  return density === "compact" || density === "table" || density === "sheet" ? "text-xs" : "text-sm";
}

function viewEmptyClass(density?: FieldRendererProps["density"]): string {
  return cn(viewTextClass(density), "text-muted-foreground");
}

function viewIdClass(density?: FieldRendererProps["density"]): string {
  return cn(density === "compact" || density === "sheet" ? "text-doc-support" : viewTextClass(density), "text-muted-foreground");
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

// ── Boolean ─────────────────────────────────────────────────────

function BooleanRenderer({ value, mode, density, onChange }: FieldRendererProps) {
  if (mode === "view") {
    return (
      <Badge variant={value ? "success" : "muted"} size={badgeSize(density)} className={viewBadgeClass(density)}>
        {value ? "Yes" : "No"}
      </Badge>
    );
  }
  return (
    <Checkbox
      checked={Boolean(value)}
      onCheckedChange={(checked) => onChange?.(checked)}
    />
  );
}

// ── Date / DateTime ─────────────────────────────────────────────

function DateRenderer({ value, field, mode, density, onChange, error }: FieldRendererProps) {
  if (mode === "view") {
    if (!value) return <span className={viewEmptyClass(density)}>—</span>;
    const date = new Date(String(value));
    const formatted = field.data_type === "date"
      ? date.toLocaleDateString()
      : date.toLocaleString();
    return <span className={viewTextClass(density)}>{formatted}</span>;
  }
  return (
    <DatePicker
      value={value != null ? String(value) : null}
      mode={field.data_type === "date" ? "date" : "datetime"}
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
  const { data } = useLookupDomain(domainCode, { enabled: mode === "view" && !!domainCode });

  if (mode === "view") {
    if (value === null || value === undefined || value === "") {
      return <span className={viewEmptyClass(density)}>—</span>;
    }
    const code = String(value);
    const label = data?.values?.find((v) => v.code === code)?.name ?? humanizeToken(code);
    return <Badge variant="outline" size={badgeSize(density)} className={viewBadgeClass(density)}>{label}</Badge>;
  }
  return (
    <LookupSelect
      domainCode={domainCode}
      value={String(value ?? "")}
      onChange={(v) => onChange?.(v)}
      error={error}
    />
  );
}

interface LookupSelectProps {
  domainCode: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function LookupSelect({ domainCode, value, onChange, error }: LookupSelectProps) {
  const { data, isLoading } = useLookupDomain(domainCode);
  const activeValues = (data?.values ?? [])
    .filter((v) => v.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onChange} disabled={isLoading || !domainCode}>
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
  if (field.reference_config?.target_entity) return field.reference_config.target_entity;
  const v = field.validation_rules as Record<string, unknown> | null;
  if (v?.ref_entity) return String(v.ref_entity);
  return null;
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
              return `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`;
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

function ReferenceRenderer({ value, field, mode, density, formData, onChange, error, disabled }: FieldRendererProps) {
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
    return entityRowToPickerOption(refData, entityCode, optionConfig).label || null;
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

interface CountryRow { code: string; name: string }
interface CurrencyRow {
  code: string;
  name: string;
  symbol?: string | null;
  status?: string | null;
}

function CountryRenderer({ value, mode, density, onChange, error }: FieldRendererProps) {
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
    const label = country?.name;
    return <span className={viewTextClass(density)}>{label && label !== code ? `${code} - ${label}` : code}</span>;
  }

  const q = query.toLowerCase();
  const filtered = q
    ? all.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    : all;

  const options = filtered.map((c) => ({ value: c.code, label: c.name, description: c.code }));
  const displayLabel = all.find((c) => c.code === String(value ?? ""))?.name ?? null;

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

  // Boolean
  registerFieldRenderer("boolean", BooleanRenderer);

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
