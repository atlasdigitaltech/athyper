"use client";

/**
 * FieldFilterControl — per-field filter control dispatcher.
 *
 * Extracted from FilterDrawer so both FilterDrawer and ColumnFilterPopover
 * can share the same per-type controls without duplication.
 *
 * Exports:
 *   NullToggle        — "is empty / has value" pill pair
 *   FieldFilterControl — routes to the correct sub-control by data_type
 */

import { useState, useEffect, useMemo } from "react";
import { X, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { EntityField } from "@athyper/api-contracts/metadata";
import {
  type FilterEntry,
  type RelativeRangeToken,
  getFilterStringValues,
} from "@athyper/api-contracts/entity-list";

// ── Date quick-pick constants ─────────────────────────────────────────────────

const RELATIVE_LABEL: Record<RelativeRangeToken, string> = {
  today: "Today", yesterday: "Yesterday",
  this_week: "This Week", last_week: "Last Week",
  this_month: "This Month", last_month: "Last Month",
  this_quarter: "This Quarter", last_quarter: "Last Quarter",
  this_year: "This Year", last_year: "Last Year",
  ytd: "YTD", qtd: "QTD", mtd: "MTD",
  this_period: "This Period", last_period: "Last Period",
};

const DATE_QUICK_TOKENS: RelativeRangeToken[] = [
  "today", "this_week", "this_month", "this_quarter", "this_year",
  "yesterday", "last_week", "last_month", "last_quarter", "last_year",
  "ytd", "mtd",
];

// ── Null toggle ───────────────────────────────────────────────────────────────

export function NullToggle({
  entry,
  onChange,
}: {
  entry:    FilterEntry | undefined;
  onChange: (next: FilterEntry | undefined) => void;
}) {
  const isNull    = !Array.isArray(entry) && entry?.op === "is_null";
  const isNotNull = !Array.isArray(entry) && entry?.op === "is_not_null";

  return (
    <div className="flex gap-1">
      <button
        onClick={() => onChange(isNull ? undefined : { op: "is_null" })}
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
          isNull
            ? "border-primary bg-primary/8 text-primary font-medium"
            : "border-input text-muted-foreground hover:border-muted-foreground/60 hover:bg-muted/50 hover:text-foreground",
        )}
      >
        is empty
      </button>
      <button
        onClick={() => onChange(isNotNull ? undefined : { op: "is_not_null" })}
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
          isNotNull
            ? "border-primary bg-primary/8 text-primary font-medium"
            : "border-input text-muted-foreground hover:border-muted-foreground/60 hover:bg-muted/50 hover:text-foreground",
        )}
      >
        has value
      </button>
    </div>
  );
}

// ── Enum / lifecycle_state control ────────────────────────────────────────────

function EnumFilter({
  field,
  entry,
  facetValues,
  onChange,
}: {
  field:       EntityField;
  entry:       FilterEntry | undefined;
  facetValues: { value: string; count: number }[];
  onChange:    (next: FilterEntry | undefined) => void;
}) {
  const [valueSearch, setValueSearch] = useState("");

  const isExclude = !Array.isArray(entry) && entry?.op === "not_in";
  const selected  = getFilterStringValues(entry);

  const displayValues = useMemo(() => {
    if (!valueSearch.trim()) return facetValues;
    const q = valueSearch.toLowerCase();
    return facetValues.filter(({ value }) =>
      value.toLowerCase().includes(q) || value.replace(/_/g, " ").toLowerCase().includes(q),
    );
  }, [facetValues, valueSearch]);

  const toggleValue = (v: string) => {
    const next = selected.includes(v)
      ? selected.filter((s) => s !== v)
      : [...selected, v];
    onChange(next.length > 0 ? (isExclude ? { op: "not_in", value: next } : next) : undefined);
  };

  const toggleExclude = () => {
    if (selected.length === 0) return;
    onChange(isExclude ? selected : { op: "not_in", value: selected });
  };

  return (
    <div className="space-y-1">
      {facetValues.length > 10 && (
        <div className="relative mb-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={valueSearch}
            onChange={(e) => setValueSearch(e.target.value)}
            placeholder="Filter values…"
            className="h-6 w-full rounded border border-input bg-background pl-6 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {valueSearch && (
            <button
              onClick={() => setValueSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {facetValues.length > 0 && (
        <div className="flex items-center justify-between pb-0.5">
          <button
            onClick={toggleExclude}
            disabled={selected.length === 0}
            className={cn(
              "text-xs transition-colors",
              isExclude ? "text-destructive font-medium" : "text-muted-foreground hover:text-foreground",
              selected.length === 0 && "opacity-40 cursor-not-allowed",
            )}
          >
            {isExclude ? "Excluding" : "Hide these"}
          </button>
          {valueSearch && displayValues.length !== facetValues.length && (
            <span className="text-xs text-muted-foreground">
              {displayValues.length}/{facetValues.length}
            </span>
          )}
        </div>
      )}

      {displayValues.map(({ value, count }) => {
        const checked = selected.includes(value);
        return (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/50 transition-colors"
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-input accent-primary"
              checked={checked}
              onChange={() => toggleValue(value)}
            />
            <span className={cn("flex-1 capitalize text-xs", isExclude && checked && "line-through text-muted-foreground")}>
              {value.replace(/_/g, " ")}
            </span>
            <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
          </label>
        );
      })}

      {facetValues.length === 0 && (
        <p className="text-xs text-muted-foreground italic px-1">No values available</p>
      )}
      {facetValues.length > 0 && displayValues.length === 0 && valueSearch && (
        <p className="text-xs text-muted-foreground italic px-1">No values match "{valueSearch}"</p>
      )}
    </div>
  );
}

// ── Boolean control ───────────────────────────────────────────────────────────

function BooleanFilter({
  entry,
  onChange,
}: {
  entry:    FilterEntry | undefined;
  onChange: (next: FilterEntry | undefined) => void;
}) {
  const selected = getFilterStringValues(entry)[0];

  const pick = (v: "true" | "false" | undefined) => {
    onChange(v ? [v] : undefined);
  };

  return (
    <div className="flex rounded-md border overflow-hidden text-xs">
      {(["", "true", "false"] as const).map((v) => (
        <button
          key={v || "any"}
          onClick={() => pick(v as "true" | "false" | undefined || undefined)}
          className={cn(
            "flex-1 px-2 py-1.5 transition-colors",
            selected === (v || undefined)
              ? "bg-primary text-primary-foreground font-medium"
              : "bg-background hover:bg-muted text-muted-foreground",
          )}
        >
          {v === "" ? "Any" : v === "true" ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

// ── Date / datetime control ───────────────────────────────────────────────────

function DateFilter({
  entry,
  onChange,
}: {
  entry:    FilterEntry | undefined;
  onChange: (next: FilterEntry | undefined) => void;
}) {
  const isRelative = !Array.isArray(entry) && entry?.op === "relative_range";
  const isBetween  = !Array.isArray(entry) && entry?.op === "between";
  const isGte      = !Array.isArray(entry) && entry?.op === "gte";
  const isLte      = !Array.isArray(entry) && entry?.op === "lte";

  const fromVal = isBetween
    ? String((entry as { value: [unknown, unknown] }).value[0])
    : isGte ? String((entry as { value: unknown }).value) : "";
  const toVal   = isBetween
    ? String((entry as { value: [unknown, unknown] }).value[1])
    : isLte ? String((entry as { value: unknown }).value) : "";

  const activeToken = isRelative ? (entry as { value: RelativeRangeToken }).value : null;

  const applyCustom = (from: string, to: string) => {
    if (from && to)  { onChange({ op: "between", value: [from, to] }); return; }
    if (from)        { onChange({ op: "gte", value: from }); return; }
    if (to)          { onChange({ op: "lte", value: to }); return; }
    onChange(undefined);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {DATE_QUICK_TOKENS.map((token) => (
          <button
            key={token}
            onClick={() => onChange(activeToken === token ? undefined : { op: "relative_range", value: token })}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              activeToken === token
                ? "border-primary bg-primary/8 text-primary font-medium"
                : "border-input text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
            )}
          >
            {RELATIVE_LABEL[token]}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Custom range</p>
        <div className="flex items-center gap-1">
          <input
            type="date"
            defaultValue={fromVal}
            className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="From"
            onChange={(e) => applyCustom(e.target.value, toVal)}
          />
          <span className="text-muted-foreground text-xs">–</span>
          <input
            type="date"
            defaultValue={toVal}
            className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="To"
            onChange={(e) => applyCustom(fromVal, e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Numeric / money control ───────────────────────────────────────────────────

function NumericFilter({
  entry,
  onChange,
}: {
  entry:    FilterEntry | undefined;
  onChange: (next: FilterEntry | undefined) => void;
}) {
  const isBetween = !Array.isArray(entry) && entry?.op === "between";
  const isGte     = !Array.isArray(entry) && entry?.op === "gte";
  const isLte     = !Array.isArray(entry) && entry?.op === "lte";

  const minVal = isBetween ? String((entry as { value: [unknown, unknown] }).value[0]) : isGte ? String((entry as { value: unknown }).value) : "";
  const maxVal = isBetween ? String((entry as { value: [unknown, unknown] }).value[1]) : isLte ? String((entry as { value: unknown }).value) : "";

  const [min, setMin] = useState(minVal);
  const [max, setMax] = useState(maxVal);

  useEffect(() => { setMin(minVal); setMax(maxVal); }, [minVal, maxVal]);

  const commit = (lo: string, hi: string) => {
    const n = (s: string) => s.trim() === "" ? null : Number(s);
    const a = n(lo), b = n(hi);
    if (a !== null && b !== null)  { onChange({ op: "between", value: [a, b] }); return; }
    if (a !== null)                { onChange({ op: "gte",     value: a });       return; }
    if (b !== null)                { onChange({ op: "lte",     value: b });       return; }
    onChange(undefined);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={min}
        onChange={(e) => setMin(e.target.value)}
        onBlur={() => commit(min, max)}
        placeholder="Min"
        className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <span className="text-muted-foreground text-xs">–</span>
      <input
        type="number"
        value={max}
        onChange={(e) => setMax(e.target.value)}
        onBlur={() => commit(min, max)}
        placeholder="Max"
        className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

// ── Text / string control ─────────────────────────────────────────────────────

function TextFilter({
  entry,
  onChange,
}: {
  entry:    FilterEntry | undefined;
  onChange: (next: FilterEntry | undefined) => void;
}) {
  const val = !Array.isArray(entry) && entry?.op === "ilike"
    ? String((entry as { value: string }).value)
    : "";

  return (
    <input
      type="text"
      defaultValue={val}
      placeholder="contains…"
      className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v ? { op: "ilike", value: v } : undefined);
      }}
    />
  );
}

// ── Reference typeahead control ───────────────────────────────────────────────

function useDebounce<T>(value: T, ms: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDv(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return dv;
}

function ReferenceFilter({
  field,
  entry,
  onChange,
}: {
  field:    EntityField;
  entry:    FilterEntry | undefined;
  onChange: (next: FilterEntry | undefined) => void;
}) {
  const referenceConfig = field.reference_config;
  const targetEntity    = referenceConfig?.target_entity ?? "";
  const displayField    = referenceConfig?.display_field ?? referenceConfig?.label_field ?? referenceConfig?.code_field;
  const recordIdField   = referenceConfig?.record_id_field;

  const [term, setTerm]         = useState("");
  const [results, setResults]   = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const [labelMap, setLabelMap] = useState<Record<string, string>>({});

  const selected = getFilterStringValues(entry);
  const debouncedTerm = useDebounce(term, 250);

  useEffect(() => {
    if (!targetEntity || debouncedTerm.length < 1) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/relay/api/records/${targetEntity}?q=${encodeURIComponent(debouncedTerm)}&page_size=20`)
      .then((r) => r.json())
      .then((data: { data?: Record<string, unknown>[] }) => {
        if (cancelled) return;
        const rows = data.data ?? [];
        const mapped = rows.map((row) => ({
          id:    String((recordIdField ? row[recordIdField] : undefined) ?? row.id ?? ""),
          label: String((displayField ? row[displayField] : undefined) ?? ((recordIdField ? row[recordIdField] : undefined) ?? row.id ?? "")),
        }));
        setResults(mapped);
        const newMap: Record<string, string> = {};
        for (const { id, label } of mapped) newMap[id] = label;
        setLabelMap((prev) => ({ ...prev, ...newMap }));
      })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedTerm, targetEntity, displayField, recordIdField]);

  const toggle = (id: string, label: string) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    setLabelMap((prev) => ({ ...prev, [id]: label }));
    onChange(next.length > 0 ? { op: "in", value: next } : undefined);
  };

  return (
    <div className="space-y-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2 py-0.5 text-xs font-medium"
            >
              {labelMap[id] ?? id.slice(0, 8)}
              <button onClick={() => toggle(id, labelMap[id] ?? id)} className="hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${field.label ?? field.name}…`}
          className="h-7 w-full rounded border border-input bg-background pl-2 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronsUpDown className="h-3 w-3" />}
        </span>
      </div>

      {open && results.length > 0 && (
        <div className="rounded-md border bg-popover shadow-md overflow-hidden max-h-40 overflow-y-auto">
          {results.map(({ id, label }) => {
            const checked = selected.includes(id);
            return (
              <button
                key={id}
                onClick={() => { toggle(id, label); setTerm(""); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted transition-colors",
                  checked && "bg-primary/5",
                )}
              >
                <span className={cn("h-3 w-3 rounded border border-input flex items-center justify-center shrink-0", checked && "bg-primary border-primary")}>
                  {checked && <Check className="h-2 w-2 text-primary-foreground" />}
                </span>
                <span className="flex-1 truncate">{label}</span>
                <span className="font-mono text-xs text-muted-foreground/50">{id.slice(0, 6)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Per-field dispatcher ──────────────────────────────────────────────────────

export function FieldFilterControl({
  field,
  entry,
  facetValues,
  onChange,
}: {
  field:       EntityField;
  entry:       FilterEntry | undefined;
  facetValues: { value: string; count: number }[];
  onChange:    (next: FilterEntry | undefined) => void;
}) {
  const dt = field.data_type;

  if (dt === "enum" || dt === "lifecycle_state") {
    return <EnumFilter field={field} entry={entry} facetValues={facetValues} onChange={onChange} />;
  }
  if (dt === "boolean") {
    return <BooleanFilter entry={entry} onChange={onChange} />;
  }
  if (dt === "date" || dt === "datetime" || dt === "timestamptz") {
    return <DateFilter entry={entry} onChange={onChange} />;
  }
  if (dt === "integer" || dt === "bigint" || dt === "decimal" || dt === "numeric" || dt === "money") {
    return <NumericFilter entry={entry} onChange={onChange} />;
  }
  // uuid without a reference_config.target_entity has no picker — fall through to TextFilter
  if (dt === "reference" || (dt === "uuid" && field.reference_config?.target_entity)) {
    return <ReferenceFilter field={field} entry={entry} onChange={onChange} />;
  }
  return <TextFilter entry={entry} onChange={onChange} />;
}
