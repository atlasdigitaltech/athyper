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

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "@athyper/theme/utils";
import { AlertCircle, Search } from "lucide-react";
import type { FlowFieldBinding as FlowFieldBindingType } from "@athyper/api-contracts/documents";
import { EntityRefPicker, type EntityRefOption } from "@athyper/ui/composites";
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
  supplier_id:     "vendor",        // entity name in control.entity is 'vendor' (table: master.supplier)
  vendor_id:       "vendor",
  commitment_id:   "purchase_order",
  contract_id:     "contract",
  party_id:        "vendor",
  cost_center_id:  "cost_center",
  project_id:      "project",
  asset_class_id:  "asset_class",
};

/** Entities whose records are scoped to a company_code — search must filter by it. */
const COMPANY_CODE_SCOPED = new Set(["cost_center", "profit_center", "project", "site"]);

function resolveSearchEntity(fieldName: string): string | null {
  if (INLINE_SEARCH_ENTITY_MAP[fieldName]) return INLINE_SEARCH_ENTITY_MAP[fieldName];
  if (fieldName.endsWith("_id")) return fieldName.slice(0, -3);
  return null;
}

function getRowLabel(row: Record<string, unknown>): string {
  const keys = Object.keys(row);
  const nameKey = keys.find((k) => k !== "id" && k.endsWith("_name"));
  if (nameKey && row[nameKey]) return String(row[nameKey]);
  if (row.name) return String(row.name);
  const codeKey = keys.find((k) => k !== "id" && k.endsWith("_code") && k !== "currency_code");
  if (codeKey && row[codeKey]) return String(row[codeKey]);
  if (row.code) return String(row.code);
  return String(row.id ?? "").slice(0, 8);
}

function FlowInlineRefPicker({
  fieldName,
  value,
  onChange,
  placeholder,
  disabled,
  error,
  externalDisplayLabel,
  draftCtx,
}: {
  fieldName: string;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  /** Display label seeded by the engine for pre-populated UUID values. */
  externalDisplayLabel?: string | null;
  /** Current wizard draft — used to scope dimension searches by company_code_id. */
  draftCtx?: Record<string, unknown>;
}) {
  const entityCode = resolveSearchEntity(fieldName);
  const [pickerLabel, setPickerLabel] = useState<string | null>(null);
  const labelCache = useRef<Map<string, string>>(new Map());

  // Keep a stable ref so searchFn closure always reads the latest draft without
  // re-creating the function on every keypress.
  const draftCtxRef = useRef(draftCtx);
  useEffect(() => { draftCtxRef.current = draftCtx; }, [draftCtx]);

  const searchFn = useCallback(
    async (query: string): Promise<EntityRefOption[]> => {
      if (!entityCode) return [];
      try {
        const params = new URLSearchParams({ q: query, limit: "20" });

        if (COMPANY_CODE_SCOPED.has(entityCode)) {
          const ccId = draftCtxRef.current?.["company_code_id"];
          if (typeof ccId === "string" && ccId) {
            params.set("filters", JSON.stringify({ company_code_id: ccId }));
          }
        }

        const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}?${params}`);
        if (!res.ok) return [];
        const body = await res.json() as { data?: Record<string, unknown>[] };
        const results = (body.data ?? []).map((row) => ({
          value: String(row["id"] ?? ""),
          label: getRowLabel(row),
          description: row["code"] ? String(row["code"]) : undefined,
        }));
        results.forEach((opt) => labelCache.current.set(opt.value, opt.label));
        return results;
      } catch {
        return [];
      }
    },
    [entityCode],
  );

  const handleChange = useCallback(
    (v: string | null) => {
      setPickerLabel(v ? (labelCache.current.get(v) ?? null) : null);
      onChange(v);
    },
    [onChange],
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
    <EntityRefPicker
      value={typeof value === "string" && value ? value : null}
      displayLabel={effectiveDisplayLabel}
      onChange={handleChange}
      search={searchFn}
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

  const selectedIsAdvanced = advancedOpts.some((o) => o.code === value);
  const visibleOpts = showAdvanced || selectedIsAdvanced ? options : primaryOpts;

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

        {advancedOpts.length > 0 && !showAdvanced && !selectedIsAdvanced && (
          <button
            type="button"
            onClick={() => setShowAdvanced(true)}
            className="rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            More types…
          </button>
        )}
        {advancedOpts.length > 0 && (showAdvanced || selectedIsAdvanced) && !selectedIsAdvanced && (
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

const PROVISIONAL_OPTIONS: Record<string, FieldOption[]> = {
  invoice_type: [
    // Primary tier — always visible (min 5)
    { code: "standard",          name: "Standard",          display_tier: "primary"  },
    { code: "credit_note",       name: "Credit Note",       display_tier: "primary"  },
    { code: "debit_note",        name: "Debit Note",        display_tier: "primary"  },
    { code: "advance",           name: "Advance",           display_tier: "primary"  },
    { code: "retention_release", name: "Retention Release", display_tier: "primary"  },
    // Advanced tier — behind "More types…"
    { code: "final",             name: "Final",             display_tier: "advanced" },
    { code: "self_billed",       name: "Self-Billed",       display_tier: "advanced" },
  ],
  invoice_source: [
    { code: "po_based",        name: "PO-Based"        },
    { code: "contract_based",  name: "Contract-Based"  },
    { code: "non_po",          name: "Non-PO"          },
    { code: "one_time_vendor", name: "One-Time Vendor" },
  ],
};

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
          {value !== null && value !== undefined ? String(value) : "—"}
        </div>
      </div>
    );
  }

  // hidden / summary_only — not rendered here
  if (mode === "hidden" || mode === "summary_only") return null;

  // editable / required
  const isDisabled = false;
  const options = PROVISIONAL_OPTIONS[field_name];

  return (
    <div className={colSpanClass(binding.span)}>
      <FieldLabel label={field_label} required={mode === "required"} helpText={help_text ?? undefined} />
      <div className="mt-1">
        {ui_variant === "money_big" ? (
          <MoneyInput value={value} onChange={onChange} disabled={isDisabled} error={error} />
        ) : ui_variant === "inline_search" ? (
          <FlowInlineRefPicker fieldName={field_name} value={value} onChange={onChange} externalDisplayLabel={displayLabel} draftCtx={draftCtx} placeholder={binding.placeholder ?? undefined} disabled={isDisabled} error={error} />
        ) : ui_variant === "radio_cards" && options ? (
          <RadioCards value={value} options={options} onChange={onChange} disabled={isDisabled} />
        ) : ui_variant === "segmented" && options ? (
          <SegmentedControl value={value} options={options} onChange={onChange} disabled={isDisabled} />
        ) : data_type === "text_long" || field_name === "notes" || field_name === "hold_reason" ? (
          <TextareaInput value={value} onChange={onChange} disabled={isDisabled} placeholder={binding.placeholder ?? undefined} />
        ) : data_type === "date" ? (
          <BaseInput type="date" value={value} onChange={onChange} disabled={isDisabled} error={error} />
        ) : data_type === "boolean" || field_name === "is_on_hold" ? (
          <div className="flex items-center gap-2">
            <input
              id={`field-${field_name}`}
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              disabled={isDisabled}
            />
            <label htmlFor={`field-${field_name}`} className="text-sm text-foreground">
              {field_label}
            </label>
          </div>
        ) : (
          <BaseInput value={value} onChange={onChange} disabled={isDisabled} placeholder={binding.placeholder ?? undefined} error={error} />
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
