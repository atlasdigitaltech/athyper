/**
 * FilterDrawer — staged filter panel with per-type controls
 *
 * State flow:
 *   appliedFilters (URL state) → draftFilters (local) → onApply (URL update)
 *
 * Layout:
 *   Header (title + active count + close)
 *   Search bar ("Search filters…") — always visible
 *   Recently-used strip — persisted per entity in localStorage
 *   Body:
 *     idle → grouped sections (collapsible, count badges)
 *     searching → flat filtered list with highlighted matches
 *
 * Keyboard:
 *   /         → focus search
 *   Esc       → clear search first; second Esc → discard + close
 *   ⌘+Enter   → apply
 */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Search, ChevronDown, ChevronRight, Clock, Heart, BookmarkPlus, Bookmark } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "@athyper/ui/primitives";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import {
  type EntityListFilters,
  type FilterEntry,
  canonicalizeQueryState,
} from "@athyper/api-contracts/entity-list";
import { useFilterPresets } from "@athyper/query";
import { FieldFilterControl, NullToggle } from "./FieldFilterControl";

// ── Canonical diff ────────────────────────────────────────────────────────────

function filtersHash(filters: EntityListFilters | undefined): string {
  return canonicalizeQueryState({ _v: 1, entity: "", filters });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEntry(filters: EntityListFilters, field: string): FilterEntry | undefined {
  return filters[field] as FilterEntry | undefined;
}

function setEntry(
  filters: EntityListFilters,
  field: string,
  entry: FilterEntry | undefined,
): EntityListFilters {
  if (!entry || (Array.isArray(entry) && entry.length === 0)) {
    const next = { ...filters };
    delete next[field];
    return next;
  }
  return { ...filters, [field]: entry };
}

// ── Semantic fallback grouping ────────────────────────────────────────────────
//
// Used when entity.field_groups is empty or fields have no group_key.
// Groups by data_type + name patterns so the drawer always has meaningful
// sections rather than one giant "Other" bucket.

const SEMANTIC_GROUPS: { key: string; label: string; test: (f: EntityField) => boolean }[] = [
  {
    key: "status",
    label: "Status & Workflow",
    test: (f) =>
      f.data_type === "enum" ||
      f.data_type === "lifecycle_state" ||
      /\b(status|state|stage|phase|lifecycle)\b/.test(f.name),
  },
  {
    key: "identification",
    label: "Identification",
    test: (f) =>
      f.data_type === "string" &&
      /(_no|_number|_code|_ref|_id|^code$|^name$|^title$|^reference)/.test(f.name),
  },
  {
    key: "dates",
    label: "Dates",
    test: (f) =>
      f.data_type === "date" || f.data_type === "datetime" || f.data_type === "timestamptz",
  },
  {
    key: "amounts",
    label: "Amounts",
    test: (f) =>
      f.data_type === "money" ||
      f.data_type === "decimal" ||
      f.data_type === "numeric" ||
      ((f.data_type === "integer" || f.data_type === "bigint") &&
        /\b(amount|total|value|price|cost|sum|balance|rate)\b/.test(f.name)),
  },
  {
    key: "parties",
    label: "Parties",
    test: (f) =>
      f.data_type === "reference" &&
      /\b(vendor|supplier|customer|client|company|contact|partner|payee|payer)\b/.test(f.name),
  },
  {
    key: "dimensions",
    label: "Dimensions",
    test: (f) =>
      /\b(cost_cent(re|er)|project|department|division|site|branch|region|segment|gl_account|account)\b/.test(
        f.name,
      ),
  },
];

function semanticGroupKey(f: EntityField): string {
  for (const g of SEMANTIC_GROUPS) {
    if (g.test(f)) return g.key;
  }
  return "__general";
}

// ── Search highlight ─────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Main FilterDrawer ─────────────────────────────────────────────────────────

export interface FilterDrawerProps {
  open:            boolean;
  onClose:         () => void;
  entity:          CompiledEntity;
  /** Facet value counts from the server — used for enum/boolean checkboxes. */
  facets:          Record<string, { value: string; count: number }[]>;
  /** Currently applied filters (from URL state). */
  appliedFilters:  EntityListFilters;
  /** Called with the new filter state when Apply is pressed. */
  onApply:         (filters: EntityListFilters | undefined) => void;
  /** Informational: "complete" | "truncated" | "timeout" from server response. */
  facetStatus?:    "complete" | "truncated" | "timeout";
  /** Current facet scope — shown in banner to avoid offering "load all" when already at all scope. */
  facetScope?:     "cheap" | "all";
  /** Called when user wants to upgrade to all-scope facets (triggers ?facets=all re-fetch). */
  onRequestAllFacets?: () => void;
  /** Controlled drawer width (shared across all drawers). */
  width?:          number;
  /** Called when user drags resize handle. */
  onWidthChange?:  (w: number) => void;
}

const MIN_WIDTH = 260;
const MAX_WIDTH_RATIO = 0.7;
const DEFAULT_WIDTH_RATIO = 0.30;

export function FilterDrawer({
  open,
  onClose,
  entity,
  facets,
  appliedFilters,
  onApply,
  facetStatus,
  facetScope,
  onRequestAllFacets,
  width: controlledWidth,
  onWidthChange,
}: FilterDrawerProps) {
  const [draft, setDraft] = useState<EntityListFilters>(appliedFilters);

  // Filter presets
  const { presets, save: savePreset, remove: removePreset, isSaving } = useFilterPresets(entity.entity_code);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");

  // Width in px — use controlled prop when provided; else initialise to 30% of viewport
  const [width, setWidth] = useState(controlledWidth ?? 400);
  useEffect(() => {
    if (controlledWidth !== undefined) { setWidth(controlledWidth); return; }
    setWidth(Math.round(window.innerWidth * DEFAULT_WIDTH_RATIO));
  }, [controlledWidth]);

  // Reset draft when drawer opens or applied filters change
  useEffect(() => {
    if (open) setDraft(appliedFilters);
  }, [open, appliedFilters]);

  const isDirty = filtersHash(draft) !== filtersHash(appliedFilters);

  // ── Search & recently-used ─────────────────────────────────────────────────
  const [filterSearch, setFilterSearch] = useState("");
  const searchRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const recentKey = `athyper:filter:recent:${entity.entity_code}`;
  const [recentFields, setRecentFields] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(recentKey) ?? "[]"); }
    catch { return []; }
  });

  const apply = useCallback(() => {
    const usedNames = Object.keys(draft);
    if (usedNames.length > 0) {
      const next = [...new Set([...usedNames, ...recentFields])].slice(0, 8);
      setRecentFields(next);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* ignore */ }
    }
    onApply(Object.keys(draft).length > 0 ? draft : undefined);
  }, [draft, onApply, recentFields, recentKey]);

  const discard = useCallback(() => {
    setDraft(appliedFilters);
  }, [appliedFilters]);

  const clearAll = useCallback(() => {
    setDraft({});
  }, []);

  // Reset search when drawer closes
  useEffect(() => {
    if (!open) setFilterSearch("");
  }, [open]);

  // Keyboard: / → focus search; Esc → clear search first, then discard+close; ⌘↵ → apply
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (filterSearch) { setFilterSearch(""); return; }
        discard(); onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { apply(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, apply, discard, onClose, filterSearch]);

  // Drag-to-resize: drag the left edge to change drawer width
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = width;
    const maxWidth   = Math.round(window.innerWidth * MAX_WIDTH_RATIO);
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_WIDTH, Math.min(maxWidth, startWidth + (startX - ev.clientX)));
      setWidth(next);
      onWidthChange?.(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  // ── Field data ──────────────────────────────────────────────────────────────
  const filterableFields = useMemo(() =>
    entity.fields
      .filter((f) => f.is_filterable)
      .sort((a, b) => a.sort_order - b.sort_order),
  [entity.fields]);

  // Search: flat filtered list; idle: null (show groups)
  const searchResults = useMemo((): typeof filterableFields | null => {
    const q = filterSearch.trim().toLowerCase();
    if (!q) return null;
    return filterableFields.filter((f) =>
      (f.label ?? f.name).toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q),
    );
  }, [filterSearch, filterableFields]);

  // Groups: metadata field_groups when available; semantic fallback when not.
  // A field counts as "metadata-grouped" only when it has a group_key that
  // resolves to a known FieldGroup on the entity.
  const groups = useMemo(() => {
    const metaGroups = [...entity.field_groups].sort((a, b) => a.sort_order - b.sort_order);
    const metaGroupedFields = filterableFields.filter(
      (f) => f.group_key && metaGroups.some((g) => g.group_key === f.group_key),
    );

    // Use metadata groups when at least one field resolves to them
    if (metaGroupedFields.length > 0) {
      const result: { key: string; label: string; fields: typeof filterableFields }[] = [];
      for (const g of metaGroups) {
        const fields = filterableFields.filter((f) => f.group_key === g.group_key);
        if (fields.length > 0) result.push({ key: g.group_key, label: g.label, fields });
      }
      const ungrouped = filterableFields.filter(
        (f) => !f.group_key || !metaGroups.some((g) => g.group_key === f.group_key),
      );
      if (ungrouped.length > 0) result.push({ key: "__other", label: "Other", fields: ungrouped });
      return result;
    }

    // Semantic fallback: group by data_type + name patterns
    const buckets = new Map<string, typeof filterableFields>();
    for (const f of filterableFields) {
      const key = semanticGroupKey(f);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(f);
    }

    const result: { key: string; label: string; fields: typeof filterableFields }[] = [];
    for (const g of SEMANTIC_GROUPS) {
      const fields = buckets.get(g.key);
      if (fields && fields.length > 0) result.push({ key: g.key, label: g.label, fields });
    }
    const general = buckets.get("__general");
    if (general && general.length > 0) {
      result.push({ key: "__general", label: "General", fields: general });
    }
    return result;
  }, [entity.field_groups, filterableFields]);

  // Collapse state: all expanded by default
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Recently-used chips: field names that are filterable for this entity
  const recentFilterableNames = recentFields.filter((n) =>
    filterableFields.some((f) => f.name === n),
  ).slice(0, 6);

  const activeCount = Object.keys(appliedFilters).length;
  const draftCount  = Object.keys(draft).length;

  // ── Shared field row renderer ───────────────────────────────────────────────
  function FieldRow({ field, query }: { field: (typeof filterableFields)[0]; query?: string }) {
    const entry    = getEntry(draft, field.name);
    const onChange = (next: FilterEntry | undefined) =>
      setDraft((prev) => setEntry(prev, field.name, next));
    const isNullOp = !Array.isArray(entry) &&
      (entry?.op === "is_null" || entry?.op === "is_not_null");
    const hasValue = !!entry && (Array.isArray(entry) ? entry.length > 0 : true);
    const label    = field.label ?? field.name;

    return (
      <div className={cn("rounded-md px-2 py-2", hasValue && "bg-primary/4 ring-1 ring-primary/20")}>
        <div className="flex items-center justify-between mb-1.5">
          <p className={cn(
            "text-2xs font-semibold uppercase tracking-wide",
            hasValue ? "text-primary" : "text-muted-foreground",
          )}>
            {query ? <Highlight text={label} query={query} /> : label}
          </p>
          <NullToggle entry={entry} onChange={onChange} />
        </div>
        {!isNullOp && (
          <FieldFilterControl
            field={field}
            entry={entry}
            facetValues={facets[field.name] ?? []}
            onChange={onChange}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/25 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        ref={containerRef}
        style={{ width }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col border-l bg-card shadow-xl",
          "transition-[transform] duration-200 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Resize handle — pulsing glow to signal draggability */}
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute inset-y-0 left-0 z-10 w-3 cursor-col-resize group"
        >
          {/* Track line */}
          <div className="absolute inset-y-0 left-1 w-px bg-primary/20 group-hover:bg-primary/60 group-active:bg-primary transition-colors duration-150" />
          {/* Pulsing pill — idle pulse, solid on hover */}
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-1.5 h-10 rounded-full bg-primary/35 animate-pulse group-hover:animate-none group-hover:bg-primary/70 group-active:bg-primary transition-colors duration-150" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Filters</span>
            {activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0 text-2xs font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
            {isDirty && (
              <span className="text-2xs text-amber-600 dark:text-amber-400 font-medium">
                {draftCount > activeCount ? `+${draftCount - activeCount}` : "modified"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSaveInput((v) => !v)}
              disabled={draftCount === 0}
              title="Save as preset"
              className={cn(
                "rounded p-1 transition-colors",
                draftCount === 0
                  ? "text-muted-foreground/20 cursor-not-allowed"
                  : showSaveInput
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ── Save as preset input ── */}
        {showSaveInput && (
          <div className="border-b bg-muted/20 px-4 py-2.5 shrink-0">
            <div className="flex gap-1.5">
              <input
                autoFocus
                type="text"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && presetNameInput.trim()) {
                    savePreset({ name: presetNameInput.trim(), filters: draft });
                    setPresetNameInput("");
                    setShowSaveInput(false);
                  }
                  if (e.key === "Escape") { setShowSaveInput(false); setPresetNameInput(""); }
                }}
                placeholder="Preset name…"
                className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={!presetNameInput.trim() || isSaving}
                onClick={() => {
                  if (!presetNameInput.trim()) return;
                  savePreset({ name: presetNameInput.trim(), filters: draft });
                  setPresetNameInput("");
                  setShowSaveInput(false);
                }}
              >
                Save
              </Button>
              <button
                onClick={() => { setShowSaveInput(false); setPresetNameInput(""); }}
                className="rounded p-1 hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}

        {/* ── Search bar ── */}
        <div className="border-b px-4 py-2.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Search filters…"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-12 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {filterSearch ? (
              <button
                onClick={() => setFilterSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            ) : (
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 py-0.5 font-mono text-2xs text-muted-foreground pointer-events-none">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Facet status banner */}
        {facetStatus && facetStatus !== "complete" && (
          <div className="border-b bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 shrink-0 flex items-center gap-2">
            <span className="flex-1">
              {facetStatus === "timeout"
                ? "Counts unavailable — filter load timed out"
                : "Some counts are approximate"}
            </span>
            {facetStatus !== "timeout" && onRequestAllFacets && facetScope !== "all" && (
              <button
                onClick={onRequestAllFacets}
                className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200 transition-colors whitespace-nowrap"
              >
                Load all
              </button>
            )}
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Starred by me — virtual filter toggle (S1.A) */}
          {!filterSearch && (
            <div className="border-b px-4 py-2.5">
              <button
                onClick={() => {
                  const current = (draft as Record<string, unknown>)["__bookmarked"];
                  if (current) {
                    const next = { ...draft } as Record<string, unknown>;
                    delete next["__bookmarked"];
                    setDraft(next as EntityListFilters);
                  } else {
                    setDraft((prev) => ({ ...prev, __bookmarked: { op: "eq", value: [true] } } as EntityListFilters));
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                  (draft as Record<string, unknown>)["__bookmarked"]
                    ? "bg-primary/8 text-primary ring-1 ring-primary/20"
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <Heart
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    !!(draft as Record<string, unknown>)["__bookmarked"] && "fill-current",
                  )}
                />
                <span className="font-medium">Starred by me</span>
              </button>
            </div>
          )}

          {/* Saved presets */}
          {!filterSearch && presets.length > 0 && (
            <div className="border-b px-4 py-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Bookmark className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Saved presets
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center gap-0.5 rounded-full border border-border bg-background px-2 py-0.5 text-2xs hover:border-muted-foreground/40 transition-colors"
                  >
                    <button
                      onClick={() => setDraft(preset.filters as EntityListFilters)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {preset.name}
                    </button>
                    {preset.isOwn && (
                      <button
                        onClick={() => removePreset(preset.id)}
                        className="ml-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
                        title="Delete preset"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recently used strip */}
          {!filterSearch && recentFilterableNames.length > 0 && (
            <div className="border-b px-4 py-2.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Recently used
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentFilterableNames.map((name) => {
                  const field = filterableFields.find((f) => f.name === name);
                  if (!field) return null;
                  const isActive = !!getEntry(draft, name);
                  return (
                    <button
                      key={name}
                      onClick={() => setFilterSearch(field.label ?? field.name)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-2xs transition-colors",
                        isActive
                          ? "border-primary/40 bg-primary/8 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
                      )}
                    >
                      {field.label ?? field.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SEARCH mode: flat filtered list ── */}
          {searchResults !== null && (
            <div className="px-4 py-3 space-y-3">
              {searchResults.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No fields match "<span className="font-medium">{filterSearch}</span>"
                </p>
              ) : (
                searchResults.map((field) => (
                  <FieldRow key={field.name} field={field} query={filterSearch} />
                ))
              )}
            </div>
          )}

          {/* ── IDLE mode: grouped sections ── */}
          {searchResults === null && (
            <div className="py-2">
              {filterableFields.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No filterable fields
                </p>
              )}
              {groups.map(({ key, label, fields }) => {
                const isCollapsed = !!collapsed[key];
                const activeInGroup = fields.filter((f) => !!getEntry(draft, f.name)).length;
                return (
                  <div key={key} className="border-b last:border-b-0">
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(key)}
                      className="flex w-full items-center gap-2 px-4 py-2 hover:bg-muted/40 transition-colors"
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        : <ChevronDown  className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      }
                      <span className="flex-1 text-left text-xs font-semibold text-foreground">
                        {label}
                      </span>
                      {activeInGroup > 0 && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0 text-2xs font-semibold text-primary">
                          {activeInGroup}
                        </span>
                      )}
                      <span className="text-2xs text-muted-foreground/50 tabular-nums">
                        {fields.length}
                      </span>
                    </button>

                    {/* Group fields */}
                    {!isCollapsed && (
                      <div className="px-4 pb-3 space-y-2.5">
                        {fields.map((field) => (
                          <FieldRow key={field.name} field={field} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t px-4 py-3 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={apply} disabled={!isDirty}>
              Apply
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={clearAll}
              disabled={draftCount === 0}
              title="Clear all filters"
            >
              Reset
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={discard}>
              Discard
            </Button>
          </div>
          <p className="text-2xs text-muted-foreground/50">⌘↵ apply · Esc discard</p>
        </div>
      </div>
    </>
  );
}
