"use client";

/**
 * FlowFieldBinding — renders a single field from an entity_flow_field row.
 *
 * Mode dispatch:
 *   chip         → DerivedChip (compact, inline override)
 *   readonly     → read-only text cell
 *   required /
 *   editable     → input element (type driven by data_type + ui_variant)
 *   summary_only → not rendered (summary panel handles it)
 *   hidden       → not rendered (filtered before render)
 *
 * ui_variant dispatch:
 *   money_big    → large currency input
 *   inline_search → search / picker input
 *   radio_cards  → card-style radio group
 *   segmented    → segmented control
 *   chip         → DerivedChip (used when mode=chip)
 *
 * Span: 1=half-row, 2=full-row (2-col grid), 3=full-width.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "@athyper/theme/utils";
import { AlertCircle, Search } from "lucide-react";
import type { FlowFieldBinding as FlowFieldBindingType } from "@athyper/api-contracts/documents";
import { DatePicker, AsyncCombobox } from "@athyper/ui/composites";
import {
  EntityPicker,
  applyLookupFiltersParam,
  entityRowToPickerOption,
  hasLookupDependency,
  readLookupFilters,
  resolveEntityPickerOptionConfig,
  searchLookupOptions,
  type EntityPickerSearchContext,
  type EntityPickerSearchResponse,
} from "@athyper/runtime-shared/entity-search";
import { DerivedChip } from "./DerivedChip";
import { canOverride } from "./useFlowEngine";

export interface FlowFieldBindingProps {
  binding: FlowFieldBindingType;
  value: unknown;
  /** Resolved display label for UUID reference fields (e.g. "Net 30 Days"). */
  displayLabel?: string;
  error?: string;
  userPermissions: string[];
  isOverridden: boolean;
  onChange: (value: unknown) => void;
  onOverride: (value: unknown) => void;
  onReset: () => void;
  /** Persist a resolved display label into engine state so it survives step navigation. */
  onDisplayLabel?: (label: string | null) => void;
  /** Full wizard draft — passed to pickers that need context filtering (e.g. company_code_id). */
  draftCtx?: Record<string, unknown>;
}

// ── Variant sub-components ────────────────────────────────────────────────────

function MoneyInput({
  value,
  onChange,
  disabled,
  error,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      className={cn(
        "w-full rounded-md border bg-background px-3 py-2 text-right text-lg font-semibold tabular-nums",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
        error && "border-destructive",
        disabled && "cursor-not-allowed bg-muted text-muted-foreground",
      )}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      disabled={disabled}
    />
  );
}

// ── Inline search (relay-backed entity picker) ────────────────────────────────

/** Field name → entity code for relay search. Falls back to strip-_id convention. */
const INLINE_SEARCH_ENTITY_MAP: Record<string, string> = {
  company_code_id: "company_code",
  book_id:         "ledger_book",
  ledger_book_id:  "ledger_book",
  supplier_id:     "supplier",
  vendor_id:       "supplier",
  commitment_id:   "purchase_order",
  contract_id:     "contract",
  party_id:        "supplier",
  gl_account_id:   "gl_account",
  cost_center_id:  "cost_center",
  profit_center_id:"profit_center",
  project_id:      "project",
  site_id:         "site",
  asset_class_id:  "asset_class",
  fiscal_period_id:"fiscal_period",
};

const COMPANY_CODE_SCOPED = new Set(["cost_center", "profit_center", "project", "site"]);

function resolveSearchEntity(fieldName: string): string | null {
  if (INLINE_SEARCH_ENTITY_MAP[fieldName]) return INLINE_SEARCH_ENTITY_MAP[fieldName];
  if (fieldName.endsWith("_id")) return fieldName.slice(0, -3);
  return null;
}

function FlowInlineRefPicker({
  fieldName,
  referenceConfig,
  lookupConfig,
  value,
  onChange,
  onDisplayLabel,
  placeholder,
  disabled,
  error,
  externalDisplayLabel,
  draftCtx,
}: {
  fieldName: string;
  referenceConfig?: Record<string, unknown> | null;
  lookupConfig?: Record<string, unknown> | null;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Persist a resolved display label into engine state so it survives step navigation. */
  onDisplayLabel?: (label: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  /** Display label seeded by the engine for pre-populated UUID values. */
  externalDisplayLabel?: string | null;
  /** Current wizard draft — used to scope dimension searches by company_code_id. */
  draftCtx?: Record<string, unknown>;
}) {
  const targetEntity = typeof referenceConfig?.["target_entity"] === "string"
    ? referenceConfig["target_entity"]
    : null;
  const entityCode = targetEntity || resolveSearchEntity(fieldName);
  const optionConfig = useMemo(
    () => resolveEntityPickerOptionConfig(referenceConfig),
    [referenceConfig],
  );
  const lookupFilters = useMemo(
    () => readLookupFilters(lookupConfig),
    [lookupConfig],
  );
  const [pickerLabel, setPickerLabel] = useState<string | null>(null);
  const labelCache = useRef<Map<string, string>>(new Map());

  // Keep a stable ref so searchFn closure always reads the latest draft without
  // re-creating the function on every keypress.
  const draftCtxRef = useRef(draftCtx);
  useEffect(() => { draftCtxRef.current = draftCtx; }, [draftCtx]);

  // Auto-resolve display label when remounting with a UUID but no label in state.
  // This happens when the user navigates away from a step and returns.
  const uuid = typeof value === "string" && value ? value : null;
  const needsResolve = uuid && !externalDisplayLabel && !pickerLabel && entityCode;
  useEffect(() => {
    if (!needsResolve) return;
    let cancelled = false;
    void fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(uuid)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: Record<string, unknown> }>) : null))
      .then((body) => {
        if (cancelled || !body?.data) return;
        const label = entityRowToPickerOption(body.data, entityCode, optionConfig).label;
        labelCache.current.set(uuid, label);
        setPickerLabel(label);
        onDisplayLabel?.(label);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  // Run when the uuid changes (new selection or remount with different value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, needsResolve]);

  const searchFn = useCallback(
    async (
      query: string,
      context?: EntityPickerSearchContext,
    ): Promise<EntityPickerSearchResponse> => {
      if (!entityCode) return { options: [], totalCount: 0 };
      try {
        if (hasLookupDependency(lookupConfig)) {
          const result = await searchLookupOptions({
            entityCode,
            query,
            lookupConfig,
            formData: draftCtxRef.current,
            optionConfig,
            context,
          });
          result.options.forEach((opt) => labelCache.current.set(opt.value, opt.label));
          return result;
        }

        const pageSize = context?.pageSize ?? context?.limit ?? 20;
        const params = new URLSearchParams({
          q: query,
          limit: String(pageSize),
          page_size: String(pageSize),
          page: String(context?.page ?? 1),
        });
        Object.entries(context?.searchParams ?? {}).forEach(([key, paramValue]) => {
          params.set(key, paramValue);
        });
        const filters = { ...lookupFilters };

        if (COMPANY_CODE_SCOPED.has(entityCode)) {
          const ccId = draftCtxRef.current?.["company_code_id"];
          if (typeof ccId === "string" && ccId) {
            filters["company_code_id"] = ccId;
          }
        }
        applyLookupFiltersParam(params, filters);

        const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}?${params}`);
        if (!res.ok) return { options: [], totalCount: 0 };
        const body = await res.json() as {
          data?: Record<string, unknown>[];
          pagination?: { total?: number | string };
        };
        const results = (body.data ?? []).map((row) => entityRowToPickerOption(row, entityCode, optionConfig));
        results.forEach((opt) => labelCache.current.set(opt.value, opt.label));
        const total = body.pagination?.total;
        const parsedTotal = total === undefined ? undefined : Number(total);
        return {
          options: results,
          totalCount: parsedTotal !== undefined && Number.isFinite(parsedTotal) ? parsedTotal : undefined,
        };
      } catch {
        return { options: [], totalCount: 0 };
      }
    },
    [entityCode, lookupConfig, lookupFilters, optionConfig],
  );

  const handleChange = useCallback(
    (v: string | null) => {
      const label = v ? (labelCache.current.get(v) ?? null) : null;
      setPickerLabel(label);
      onDisplayLabel?.(label);
      onChange(v);
    },
    [onChange, onDisplayLabel],
  );

  // User-selected label takes precedence; fall back to engine-seeded label.
  const effectiveDisplayLabel = pickerLabel ?? externalDisplayLabel ?? null;

  if (!entityCode) {
    // No entity mapping — plain search input fallback
    return (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          className={cn(
            "w-full rounded-md border bg-background py-2 pl-8 pr-3 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-primary/40",
            error && "border-destructive",
            disabled && "cursor-not-allowed bg-muted text-muted-foreground",
          )}
          placeholder={placeholder ?? "Search…"}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <EntityPicker
      value={typeof value === "string" && value ? value : null}
      displayLabel={effectiveDisplayLabel}
      onChange={handleChange}
      search={searchFn}
      getOptionHref={
        optionConfig?.showViewAction === false
          ? undefined
          : (option) => {
              const recordId = option.recordId ?? option.value;
              return `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`;
            }
      }
      optionConfig={optionConfig}
      loadOnOpen
      placeholder={placeholder ?? "Search…"}
      disabled={disabled}
      error={error}
    />
  );
}

function RadioCards({
  value,
  options,
  onChange,
  disabled,
}: {
  value: unknown;
  options: FieldOption[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const primaryOpts  = useMemo(() => options.filter((o) => o.display_tier !== "advanced"), [options]);
  const advancedOpts = useMemo(() => options.filter((o) => o.display_tier === "advanced"),  [options]);

  // Only split primary/advanced when there are more than 10 options total.
  const useToggle = options.length > 10 && advancedOpts.length > 0;

  const selectedIsAdvanced = useToggle && advancedOpts.some((o) => o.code === value);
  const visibleOpts = !useToggle || showAdvanced || selectedIsAdvanced ? options : primaryOpts;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visibleOpts.map((opt) => (
          <button
            key={opt.code}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.code)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              value === opt.code
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {opt.name}
          </button>
        ))}

        {useToggle && !showAdvanced && !selectedIsAdvanced && (
          <button
            type="button"
            onClick={() => setShowAdvanced(true)}
            className="rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            More types…
          </button>
        )}
        {useToggle && (showAdvanced || selectedIsAdvanced) && !selectedIsAdvanced && (
          <button
            type="button"
            onClick={() => setShowAdvanced(false)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors self-center"
          >
            Fewer types
          </button>
        )}
      </div>
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
  disabled,
}: {
  value: unknown;
  options: FieldOption[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.code)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            value === opt.code
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {opt.name}
        </button>
      ))}
    </div>
  );
}

function TextareaInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <textarea
      rows={3}
      className={cn(
        "w-full rounded-md border bg-background px-3 py-2 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none",
        disabled && "cursor-not-allowed bg-muted text-muted-foreground",
      )}
      placeholder={placeholder}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
    />
  );
}

function BaseInput({
  value,
  onChange,
  type = "text",
  disabled,
  placeholder,
  error,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <input
      type={type}
      className={cn(
        "w-full rounded-md border bg-background px-3 py-2 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
        error && "border-destructive",
        disabled && "cursor-not-allowed bg-muted text-muted-foreground",
      )}
      placeholder={placeholder}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
    />
  );
}

// ── LOOKUP STUBS (replace with real picker components when available) ─────────
// Typed option set — code is the stored value, name is the display label.
// display_tier: "primary" = always visible, "advanced" = behind "More types…"
interface FieldOption { code: string; name: string; display_tier?: "primary" | "advanced" }

interface LookupValue {
  code: string;
  name: string;
  status?: string;
  sort_order?: number;
}

interface CountryRow {
  code: string;
  name: string;
  calling_code?: string | null;
  phone_trunk_prefix?: string | null;
  phone_national_pattern?: string | null;
  phone_example?: string | null;
  has_postal_codes?: boolean;
  postal_code_label?: string | null;
  postal_code_example?: string | null;
  region_label?: string | null;
}

interface StateRegionRow {
  code: string;
  name: string;
  country_code: string;
  category?: string | null;
}

interface CurrencyRow {
  code: string;
  name: string;
  symbol?: string | null;
  status?: string | null;
}

function formatCurrencyLabel(currency: CurrencyRow | null | undefined): string | null {
  return currency ? `${currency.code} - ${currency.name}` : null;
}

function CurrencyDisplay({ value }: { value: unknown }) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  const [currency, setCurrency] = useState<CurrencyRow | null>(null);

  useEffect(() => {
    if (!code) {
      setCurrency(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ search: code, limit: "20", status: "active" });
    void fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CurrencyRow[] }> : { data: [] }))
      .then((body) => {
        if (controller.signal.aborted) return;
        setCurrency((body.data ?? []).find((row) => row.code === code) ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCurrency(null);
      });
    return () => controller.abort();
  }, [code]);

  if (!code) return <>-</>;
  return <>{formatCurrencyLabel(currency) ?? code}</>;
}

interface CertificationTypeRow {
  id: string;
  code: string;
  name: string;
  issuing_body?: string | null;
  category?: string | null;
  status?: string | null;
}

const ENUM_DOMAIN_BY_FIELD: Record<string, string> = {
  address_type: "master.address_type",
  contact_role: "master.contact_role",
  channel_type: "master.contact_link_channel_type",
  purpose: "master.contact_link_purpose",
  supplier_type: "master.supplier_type",
  customer_type: "master.customer_type",
  legal_form: "master.legal_form",
  partner_category: "master.business_partner_category",
  employee_count_band: "master.employee_count_band",
  annual_revenue_band: "master.annual_revenue_band",
};

const PROVISIONAL_OPTIONS: Record<string, FieldOption[]> = {
  invoice_type: [
    { code: "standard",          name: "Standard",          display_tier: "primary"  },
    { code: "credit_note",       name: "Credit Note",       display_tier: "primary"  },
    { code: "debit_note",        name: "Debit Note",        display_tier: "primary"  },
    { code: "advance",           name: "Advance",           display_tier: "primary"  },
    { code: "retention_release", name: "Retention Release", display_tier: "primary"  },
    { code: "final",             name: "Final",             display_tier: "advanced" },
    { code: "self_billed",       name: "Self-Billed",       display_tier: "advanced" },
  ],
  invoice_source: [
    { code: "po_based",        name: "PO-Based"        },
    { code: "contract_based",  name: "Contract-Based"  },
    { code: "non_po",          name: "Non-PO"          },
    { code: "one_time_supplier", name: "One-Time Supplier" },
  ],
  payment_type: [
    { code: "bank_transfer",   name: "Bank Transfer",   display_tier: "primary"  },
    { code: "cheque",          name: "Cheque",           display_tier: "primary"  },
    { code: "cash",            name: "Cash",             display_tier: "primary"  },
    { code: "online_transfer", name: "Online Transfer",  display_tier: "primary"  },
    { code: "card",            name: "Card",             display_tier: "advanced" },
    { code: "direct_debit",    name: "Direct Debit",     display_tier: "advanced" },
  ],
  payment_direction: [
    { code: "OUTBOUND", name: "Outbound (Payment)" },
    { code: "INBOUND",  name: "Inbound (Receipt)"  },
  ],
  tax_mode: [
    { code: "inclusive", name: "Inclusive", display_tier: "primary" },
    { code: "exclusive", name: "Exclusive", display_tier: "primary" },
    { code: "no_tax",    name: "No Tax",    display_tier: "primary" },
  ],
  anticipated_risk_tier: [
    { code: "low",      name: "Low"      },
    { code: "medium",   name: "Medium"   },
    { code: "elevated", name: "Elevated" },
    { code: "high",     name: "High"     },
    { code: "critical", name: "Critical" },
  ],
};

const DEFAULT_FIELD_PLACEHOLDERS: Record<string, string> = {
  scheme: "Select identifier type",
  value: "Enter the identifier exactly as issued",
  issuing_authority: "e.g. Tax authority, registry, GS1, GLEIF",
  tax_number: "e.g. national tax ID or TIN",
  state_tax_number: "e.g. state tax registration number",
  sales_tax_number: "e.g. sales tax registration number",
  service_tax_number: "e.g. service tax registration number",
  regional_tax_number: "e.g. regional tax registration number",
  vat_number: "e.g. VAT, GST, or SST registration number",
  tax_clearance_number: "e.g. clearance certificate reference",
  global_location_number: "13-digit GS1 GLN",
  certification_type_id: "Select certification type",
  custom_name: "Enter custom certification name",
  certificate_number: "Enter certificate number",
  certified_by: "e.g. ISO, SIRIM, TUV, BSI",
  certified_location: "e.g. country, site, plant, or business unit",
  additional_info: "Scope, remarks, or special conditions",
  member_name: "Legal name of shareholder, UBO, director, or signatory",
  company_name: "Company represented by this member",
  business_title: "e.g. Director, CFO, Authorized Signatory",
  ownership_pct: "0 to 100",
  voting_pct: "0 to 100",
  beneficial_ownership_pct: "0 to 100",
  authority_scope: "e.g. bank signatory, contract approval, tax filing",
  authority_limit_amount: "Maximum authorized amount",
  source_of_wealth: "Brief source of wealth or funds",
  bank_name: "Enter bank name",
  account_number: "Enter IBAN or local account number",
  account_holder_name: "Name as held by the bank",
};

function placeholderForField(fieldName: string, explicit?: string | null): string | undefined {
  return explicit ?? DEFAULT_FIELD_PLACEHOLDERS[fieldName];
}

function useLookupValues(domainCode: string | null): { values: LookupValue[]; loading: boolean } {
  const [values, setValues] = useState<LookupValue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!domainCode) {
      setValues([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/relay/api/metadata/lookups/${encodeURIComponent(domainCode)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ values?: LookupValue[] }> : { values: [] }))
      .then((body) => {
        if (controller.signal.aborted) return;
        const active = (body.values ?? [])
          .filter((v) => (v.status ?? "active") === "active")
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
        setValues(active);
      })
      .catch(() => {
        if (!controller.signal.aborted) setValues([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [domainCode]);

  return { values, loading };
}

function LookupSelectInput({
  domainCode,
  value,
  onChange,
  disabled,
  error,
  excludeCodes = [],
}: {
  domainCode: string;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
  excludeCodes?: string[];
}) {
  const { values, loading } = useLookupValues(domainCode);
  const [query, setQuery] = useState("");
  const visibleValues = excludeCodes.length > 0
    ? values.filter((opt) => !excludeCodes.includes(opt.code))
    : values;
  const q = query.trim().toLowerCase();
  const filteredValues = q
    ? visibleValues.filter((opt) =>
        opt.code.toLowerCase().includes(q) || opt.name.toLowerCase().includes(q),
      )
    : visibleValues;
  const selected = values.find((opt) => opt.code === String(value ?? ""));

  return (
    <AsyncCombobox
      value={typeof value === "string" && value ? value : null}
      displayLabel={selected?.name ?? null}
      options={filteredValues.map((opt) => ({ value: opt.code, label: opt.name, description: opt.code }))}
      loading={loading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange(v)}
      placeholder="Select..."
      searchPlaceholder="Search..."
      disabled={disabled || loading || !domainCode}
      error={error}
    />
  );
}

function StaticSelectInput({
  value,
  options,
  onChange,
  disabled,
  error,
}: {
  value: unknown;
  options: FieldOption[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filteredOptions = q
    ? options.filter((opt) => opt.code.toLowerCase().includes(q) || opt.name.toLowerCase().includes(q))
    : options;
  const selected = options.find((opt) => opt.code === String(value ?? ""));

  return (
    <AsyncCombobox
      value={typeof value === "string" && value ? value : null}
      displayLabel={selected?.name ?? null}
      options={filteredOptions.map((opt) => ({ value: opt.code, label: opt.name, description: opt.code }))}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange(v)}
      placeholder="Select..."
      searchPlaceholder="Search..."
      disabled={disabled}
      error={error}
    />
  );
}

function CountrySelectInput({
  value,
  onChange,
  disabled,
  error,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch("/api/relay/api/platform/ref/countries?limit=300", {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CountryRow[] }> : { data: [] }))
      .then((body) => {
        if (!controller.signal.aborted) setCountries(body.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCountries([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const q = query.toLowerCase();
  const filtered = q
    ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    : countries;
  const options = filtered.map((c) => ({ value: c.code, label: c.name, description: c.code }));
  const displayLabel = countries.find((c) => c.code === String(value ?? ""))?.name ?? null;

  return (
    <AsyncCombobox
      value={typeof value === "string" && value ? value : null}
      displayLabel={displayLabel}
      options={options}
      loading={loading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange(v)}
      placeholder="Select country..."
      searchPlaceholder="Search countries..."
      disabled={disabled}
      error={error}
    />
  );
}

function StateRegionSelectInput({
  value,
  onChange,
  disabled,
  error,
  draftCtx,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
  draftCtx?: Record<string, unknown>;
}) {
  const countryCode = typeof draftCtx?.["country_code"] === "string"
    ? String(draftCtx["country_code"]).toUpperCase()
    : "";
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState<StateRegionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setRegions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ country: countryCode, limit: "200" });
    if (query.trim()) params.set("search", query.trim());

    setLoading(true);
    void fetch(`/api/relay/api/platform/ref/state-regions?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: StateRegionRow[] }> : { data: [] }))
      .then((body) => {
        if (!controller.signal.aborted) setRegions(body.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRegions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [countryCode, query]);

  const selected = regions.find((r) => r.code === String(value ?? "") || r.name === String(value ?? ""));
  const options = regions.map((r) => ({ value: r.code, label: r.name, description: r.code }));

  return (
    <AsyncCombobox
      value={typeof value === "string" && value ? value : null}
      displayLabel={selected?.name ?? null}
      options={options}
      loading={loading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange(v)}
      placeholder={countryCode ? "Select state/region..." : "Select country first"}
      searchPlaceholder="Search state or region..."
      disabled={disabled || !countryCode}
      error={error}
    />
  );
}

function PostalCodeInput({
  value,
  onChange,
  disabled,
  error,
  draftCtx,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
  draftCtx?: Record<string, unknown>;
}) {
  const countryCode = typeof draftCtx?.["country_code"] === "string"
    ? String(draftCtx["country_code"]).toUpperCase()
    : "";
  const [country, setCountry] = useState<CountryRow | null>(null);

  useEffect(() => {
    if (!countryCode) {
      setCountry(null);
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/relay/api/platform/ref/countries?search=${encodeURIComponent(countryCode)}&limit=20`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CountryRow[] }> : { data: [] }))
      .then((body) => {
        if (controller.signal.aborted) return;
        const exact = (body.data ?? []).find((c) => c.code === countryCode) ?? null;
        setCountry(exact);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCountry(null);
      });
    return () => controller.abort();
  }, [countryCode]);

  const label = country?.postal_code_label ?? "Postal code";
  const example = country?.postal_code_example ? `Example: ${country.postal_code_example}` : undefined;
  const countryHasNoPostalCode = country?.has_postal_codes === false;

  return (
    <BaseInput
      value={countryHasNoPostalCode ? "" : value}
      onChange={onChange}
      disabled={disabled || countryHasNoPostalCode}
      placeholder={countryHasNoPostalCode ? "Not used for selected country" : example ?? label}
      error={error}
    />
  );
}

function CountryAwarePhoneInput({
  value,
  onChange,
  disabled,
  error,
  draftCtx,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
  draftCtx?: Record<string, unknown>;
}) {
  const countryCode = [
    draftCtx?.["country_code"],
    draftCtx?.["registration_country_code"],
    draftCtx?.["tax_residence_country_code"],
  ].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const normalizedCountryCode = countryCode ? countryCode.toUpperCase() : "";
  const [country, setCountry] = useState<CountryRow | null>(null);

  useEffect(() => {
    if (!normalizedCountryCode) {
      setCountry(null);
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/relay/api/platform/ref/countries?search=${encodeURIComponent(normalizedCountryCode)}&limit=20`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CountryRow[] }> : { data: [] }))
      .then((body) => {
        if (controller.signal.aborted) return;
        const exact = (body.data ?? []).find((c) => c.code === normalizedCountryCode) ?? null;
        setCountry(exact);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCountry(null);
      });
    return () => controller.abort();
  }, [normalizedCountryCode]);

  const placeholder = country?.phone_example
    ? `Example: ${country.phone_example}`
    : country?.calling_code
      ? `+${country.calling_code} ...`
      : "+...";

  return (
    <BaseInput
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      error={error}
    />
  );
}

function CurrencySelectInput({
  value,
  onChange,
  disabled,
  error,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyRow | null>(null);
  const [loading, setLoading] = useState(false);
  const currentCode = typeof value === "string" ? value.trim().toUpperCase() : "";

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50", status: "active" });
    if (query.trim()) params.set("search", query.trim());

    setLoading(true);
    void fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CurrencyRow[] }> : { data: [] }))
      .then((body) => {
        if (!controller.signal.aborted) setCurrencies(body.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCurrencies([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  const selected = currencies.find((c) => c.code === currentCode) ?? selectedCurrency;

  useEffect(() => {
    if (!currentCode || currencies.some((c) => c.code === currentCode)) {
      setSelectedCurrency(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ search: currentCode, limit: "20", status: "active" });
    void fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CurrencyRow[] }> : { data: [] }))
      .then((body) => {
        if (controller.signal.aborted) return;
        setSelectedCurrency((body.data ?? []).find((row) => row.code === currentCode) ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSelectedCurrency(null);
      });
    return () => controller.abort();
  }, [currentCode, currencies]);

  const options = currencies.map((c) => ({
    value: c.code,
    label: `${c.code} - ${c.name}`,
    description: c.symbol ?? undefined,
  }));

  return (
    <AsyncCombobox
      value={currentCode || null}
      displayLabel={formatCurrencyLabel(selected) ?? (currentCode || null)}
      options={options}
      loading={loading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange(v ? v.toUpperCase() : null)}
      placeholder="Select currency..."
      searchPlaceholder="Search currencies..."
      disabled={disabled}
      error={error}
    />
  );
}

function CertificationTypeSelectInput({
  value,
  onChange,
  disabled,
  error,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<CertificationTypeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50", active: "true" });
    if (query.trim()) params.set("search", query.trim());

    setLoading(true);
    void fetch(`/api/relay/api/platform/ref/certification-types?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CertificationTypeRow[] }> : { data: [] }))
      .then((body) => {
        if (!controller.signal.aborted) setTypes(body.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTypes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  const selected = types.find((type) => type.id === String(value ?? ""));
  const selectedId = typeof value === "string" && value ? value : null;

  useEffect(() => {
    if (!selectedId || selected) return;
    const controller = new AbortController();
    void fetch(`/api/relay/api/platform/ref/certification-types?id=${encodeURIComponent(selectedId)}&limit=1`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<{ data?: CertificationTypeRow[] }> : { data: [] }))
      .then((body) => {
        if (controller.signal.aborted) return;
        const row = body.data?.[0];
        if (row) setTypes((prev) => prev.some((type) => type.id === row.id) ? prev : [row, ...prev]);
      })
      .catch(() => null);
    return () => controller.abort();
  }, [selectedId, selected]);

  const options = types.map((type) => ({
    value: type.id,
    label: type.name,
    description: [type.code, type.issuing_body, type.category].filter(Boolean).join(" - ") || undefined,
  }));

  return (
    <AsyncCombobox
      value={typeof value === "string" && value ? value : null}
      displayLabel={selected?.name ?? null}
      options={options}
      loading={loading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(v) => onChange(v)}
      placeholder="Select certification type..."
      searchPlaceholder="Search certification types..."
      disabled={disabled}
      error={error}
    />
  );
}

function isCountryField(fieldName: string, uiVariant: string | null | undefined): boolean {
  return uiVariant === "country" || fieldName === "country_code" || fieldName.endsWith("_country_code");
}

function isStateRegionField(fieldName: string): boolean {
  return fieldName === "region" || fieldName === "state_region" || fieldName === "state_region_code";
}

function isPhoneField(fieldName: string, uiVariant: string | null | undefined): boolean {
  return uiVariant === "phone" || fieldName.endsWith("_phone") || fieldName.endsWith("_fax");
}

function isEmailField(fieldName: string, uiVariant: string | null | undefined): boolean {
  return uiVariant === "email" || fieldName.endsWith("_email") || fieldName === "email";
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FlowFieldBinding({
  binding,
  value,
  displayLabel,
  error,
  userPermissions,
  isOverridden,
  onChange,
  onOverride,
  onReset,
  onDisplayLabel,
  draftCtx,
}: FlowFieldBindingProps) {
  const { mode, ui_variant, data_type, field_label, field_name, help_text, derivation_mode } = binding;

  // chip mode → DerivedChip
  if (mode === "chip") {
    const canOvr = canOverride(binding.override_permission, userPermissions);
    return (
      <div className={colSpanClass(binding.span)}>
        <DerivedChip
          label={field_label}
          value={value}
          displayLabel={displayLabel}
          derivationHint={binding.derive_expression ?? undefined}
          isOverrideable={derivation_mode === "derived_overrideable"}
          canOverride={canOvr}
          isOverridden={isOverridden}
          onOverride={canOvr ? onOverride : undefined}
          onReset={isOverridden ? onReset : undefined}
        />
      </div>
    );
  }

  // readonly mode → display cell
  if (mode === "readonly") {
    return (
      <div className={colSpanClass(binding.span)}>
        <FieldLabel label={field_label} />
        <div className="mt-1 rounded-md border border-transparent bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {ui_variant === "currency" ? (
            <CurrencyDisplay value={value} />
          ) : value !== null && value !== undefined ? (
            String(value)
          ) : (
            "—"
          )}
        </div>
      </div>
    );
  }

  // hidden / summary_only — not rendered here
  if (mode === "hidden" || mode === "summary_only") return null;

  // editable / required
  const isDisabled = false;
  const options = PROVISIONAL_OPTIONS[field_name];
  const enumDomainCode = binding.enum_domain_code ?? ENUM_DOMAIN_BY_FIELD[field_name] ?? null;
  const enumExcludeCodes = field_name === "contact_role" ? ["primary"] : [];
  const handleValueChange = derivation_mode === "derived_overrideable" ? onOverride : onChange;
  const placeholder = placeholderForField(field_name, binding.placeholder);

  return (
    <div className={colSpanClass(binding.span)}>
      <FieldLabel label={field_label} required={mode === "required"} helpText={help_text ?? undefined} />
      <div className="mt-1">
        {ui_variant === "money_big" ? (
          <MoneyInput value={value} onChange={handleValueChange} disabled={isDisabled} error={error} />
        ) : field_name === "certification_type_id" ? (
          <CertificationTypeSelectInput value={value} onChange={handleValueChange} disabled={isDisabled} error={error} />
        ) : ui_variant === "inline_search" ? (
          <FlowInlineRefPicker
            fieldName={field_name}
            referenceConfig={binding.reference_config ?? null}
            lookupConfig={binding.lookup_config ?? null}
            value={value}
            onChange={handleValueChange}
            onDisplayLabel={onDisplayLabel}
            externalDisplayLabel={displayLabel}
            draftCtx={draftCtx}
            placeholder={placeholder}
            disabled={isDisabled}
            error={error}
          />
        ) : isCountryField(field_name, ui_variant) ? (
          <CountrySelectInput value={value} onChange={handleValueChange} disabled={isDisabled} error={error} />
        ) : isStateRegionField(field_name) ? (
          <StateRegionSelectInput value={value} onChange={handleValueChange} disabled={isDisabled} error={error} draftCtx={draftCtx} />
        ) : ui_variant === "currency" ? (
          <CurrencySelectInput value={value} onChange={handleValueChange} disabled={isDisabled} error={error} />
        ) : enumDomainCode && (ui_variant === "select" || data_type === "enum") ? (
          <LookupSelectInput domainCode={enumDomainCode} value={value} onChange={handleValueChange} disabled={isDisabled} error={error} excludeCodes={enumExcludeCodes} />
        ) : ui_variant === "radio_cards" && options ? (
          <RadioCards value={value} options={options} onChange={handleValueChange} disabled={isDisabled} />
        ) : ui_variant === "segmented" && options ? (
          <SegmentedControl value={value} options={options} onChange={handleValueChange} disabled={isDisabled} />
        ) : ui_variant === "select" && options ? (
          <StaticSelectInput value={value} options={options} onChange={handleValueChange} disabled={isDisabled} error={error} />
        ) : ui_variant === "textarea" || data_type === "text_long" || field_name === "notes" || field_name === "hold_reason" ? (
          <TextareaInput value={value} onChange={handleValueChange} disabled={isDisabled} placeholder={placeholder} />
        ) : data_type === "date" ? (
          <DatePicker
            value={value != null ? String(value) : null}
            onChange={(v) => handleValueChange(v)}
            disabled={isDisabled}
            error={error}
          />
        ) : field_name === "postal_code" ? (
          <PostalCodeInput value={value} onChange={handleValueChange} disabled={isDisabled} error={error} draftCtx={draftCtx} />
        ) : isPhoneField(field_name, ui_variant) ? (
          <CountryAwarePhoneInput value={value} onChange={handleValueChange} disabled={isDisabled} error={error} draftCtx={draftCtx} />
        ) : isEmailField(field_name, ui_variant) ? (
          <BaseInput value={value} onChange={handleValueChange} type="email" disabled={isDisabled} placeholder={placeholder} error={error} />
        ) : data_type === "boolean" || field_name === "is_on_hold" ? (
          <div className="flex items-center gap-2">
            <input
              id={`field-${field_name}`}
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
              checked={Boolean(value)}
              onChange={(e) => handleValueChange(e.target.checked)}
              disabled={isDisabled}
            />
            <label htmlFor={`field-${field_name}`} className="text-sm text-foreground">
              {field_label}
            </label>
          </div>
        ) : (
          <BaseInput value={value} onChange={handleValueChange} disabled={isDisabled} placeholder={placeholder} error={error} />
        )}
      </div>
      {error && (
        <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function colSpanClass(span: number): string {
  if (span === 2) return "col-span-2";
  if (span === 3) return "col-span-full";
  return "col-span-1";
}

function FieldLabel({
  label,
  required,
  helpText,
}: {
  label: string;
  required?: boolean;
  helpText?: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {helpText && (
        <span className="text-2xs text-muted-foreground/60 truncate" title={helpText}>
          {helpText}
        </span>
      )}
    </div>
  );
}
