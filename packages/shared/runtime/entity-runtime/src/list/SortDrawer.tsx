"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X, Search, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronUp, ChevronDown, Trash2, Plus,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button, overlayScrimVariants } from "@athyper/ui/primitives";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import type { EntityListSortEntry } from "@athyper/api-contracts/entity-list";

// ─── Highlight helper ─────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded-[2px] px-0">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Drawer props ─────────────────────────────────────────────────────────────

export interface SortDrawerProps {
  open: boolean;
  onClose: () => void;
  entity: CompiledEntity;
  appliedSort: EntityListSortEntry[] | undefined;
  defaultSort: EntityListSortEntry[] | undefined;
  onApply: (sort: EntityListSortEntry[] | undefined) => void;
  width?: number;
  onWidthChange?: (w: number) => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const MIN_WIDTH       = 260;
const MAX_WIDTH_RATIO = 0.7;

// ─── Component ────────────────────────────────────────────────────────────────

export function SortDrawer({
  open,
  onClose,
  entity,
  appliedSort,
  defaultSort,
  onApply,
  width: controlledWidth,
  onWidthChange,
}: SortDrawerProps) {
  // ── Draft state ──────────────────────────────────────────────────────────────
  const [draft, setDraft]           = useState<EntityListSortEntry[]>([]);
  const [fieldSearch, setFieldSearch] = useState("");
  const [addingField, setAddingField]  = useState(false);
  const [width, setWidth]           = useState(controlledWidth ?? Math.round(window.innerWidth * 0.30));

  const searchRef   = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging  = useRef(false);

  // Sync draft from applied when drawer opens
  useEffect(() => {
    if (open) {
      setDraft(appliedSort ? [...appliedSort] : []);
      setFieldSearch("");
      setAddingField(false);
    }
  }, [open, appliedSort]);

  // Sync controlled width
  useEffect(() => {
    if (controlledWidth !== undefined) setWidth(controlledWidth);
  }, [controlledWidth]);

  // ── Dirty detection ───────────────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    const a = JSON.stringify(appliedSort ?? []);
    const b = JSON.stringify(draft);
    return a !== b;
  }, [appliedSort, draft]);

  // ── Sortable fields ───────────────────────────────────────────────────────────
  const sortableFields = useMemo(
    () => entity.fields.filter((f) => f.is_sortable),
    [entity.fields],
  );

  // Fields not yet in draft
  const availableFields = useMemo(
    () => sortableFields.filter((f) => !draft.some((e) => e.key === f.name)),
    [sortableFields, draft],
  );

  const filteredFields = useMemo(() => {
    if (!fieldSearch.trim()) return availableFields;
    const q = fieldSearch.toLowerCase();
    return availableFields.filter(
      (f) => (f.label ?? f.name).toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
    );
  }, [availableFields, fieldSearch]);

  // ── Apply / discard ───────────────────────────────────────────────────────────
  const apply = useCallback(() => {
    onApply(draft.length > 0 ? draft : undefined);
  }, [draft, onApply]);

  const discard = useCallback(() => {
    setDraft(appliedSort ? [...appliedSort] : []);
    onClose();
  }, [appliedSort, onClose]);

  const resetToDefault = useCallback(() => {
    setDraft(defaultSort ? [...defaultSort] : []);
  }, [defaultSort]);

  // ── Draft mutations ───────────────────────────────────────────────────────────
  const addField = useCallback((field: EntityField) => {
    setDraft((prev) => [...prev, { key: field.name, dir: "asc" }]);
    setFieldSearch("");
    setAddingField(false);
  }, []);

  const removeEntry = useCallback((idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const toggleDir = useCallback((idx: number) => {
    setDraft((prev) => prev.map((e, i) => i === idx ? { ...e, dir: e.dir === "asc" ? "desc" : "asc" } : e));
  }, []);

  const toggleNulls = useCallback((idx: number) => {
    setDraft((prev) => prev.map((e, i) =>
      i === idx ? { ...e, nulls: e.nulls === "first" ? undefined : "first" } : e,
    ));
  }, []);

  const moveUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[idx - 1]!, next[idx]!] = [next[idx]!, next[idx - 1]!];
      return next;
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setDraft((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx]!, next[idx + 1]!] = [next[idx + 1]!, next[idx]!];
      return next;
    });
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        if (fieldSearch) { setFieldSearch(""); return; }
        discard();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        apply();
      }
    };
    containerRef.current?.addEventListener("keydown", handler);
    return () => containerRef.current?.removeEventListener("keydown", handler);
  }, [open, fieldSearch, apply, discard]);

  // ── Resize handle ─────────────────────────────────────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startW = width;

    const onMove = (mv: MouseEvent) => {
      if (!isDragging.current) return;
      const maxW = Math.round(window.innerWidth * MAX_WIDTH_RATIO);
      const next = Math.max(MIN_WIDTH, Math.min(maxW, startW + (startX - mv.clientX)));
      setWidth(next);
      onWidthChange?.(next);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width, onWidthChange]);

  // ── Most-used opt-in gate ─────────────────────────────────────────────────────
  // Shown when entity has opted in via view_count field (Sprint 2.D DDL).
  const hasMostUsed = entity.fields.some((f) => f.name === "view_count");
  const mostUsedActive = draft.some((e) => e.key === "__most_used");

  // ── Field label helper ────────────────────────────────────────────────────────
  const fieldLabel = (key: string) => {
    if (key === "__most_used") return "Most used";
    return sortableFields.find((f) => f.name === key)?.label ?? key;
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className={cn("fixed inset-0 z-30", overlayScrimVariants({ tone: "context" }))}
          onClick={discard}
        />
      )}

      {/* Slide-in panel */}
      <div
        ref={containerRef}
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex flex-col bg-background shadow-2xl border-l",
          "transition-transform duration-200 ease-out outline-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ width }}
      >
        {/* Resize handle — pulsing glow to signal draggability */}
        <div
          className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize group z-50"
          onMouseDown={handleResizeStart}
        >
          <div className="absolute inset-y-0 left-1 w-px bg-primary/20 group-hover:bg-primary/60 group-active:bg-primary transition-colors duration-150" />
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-1.5 h-10 rounded-full bg-primary/35 animate-pulse group-hover:animate-none group-hover:bg-primary/70 group-active:bg-primary transition-colors duration-150" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Sort</span>
            {draft.length > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-2xs font-bold">
                {draft.length}
              </span>
            )}
          </div>
          <button
            onClick={discard}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* Active sort entries */}
          {draft.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No sort applied — records are ordered by creation date.
            </p>
          )}

          {draft.map((entry, idx) => (
            <div
              key={`${entry.key}-${idx}`}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
            >
              {/* Priority reorder */}
              <div className="flex flex-col">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default p-0.5"
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === draft.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default p-0.5"
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              {/* Priority badge */}
              <span className="text-2xs font-mono text-muted-foreground w-4 text-center shrink-0">
                {idx + 1}
              </span>

              {/* Field label */}
              <span className="flex-1 text-xs font-medium truncate">
                {fieldLabel(entry.key)}
              </span>

              {/* Direction toggle — hidden for __most_used (always desc) */}
              {entry.key !== "__most_used" && (
                <button
                  onClick={() => toggleDir(idx)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-2xs font-medium transition-colors",
                    "border-primary/40 bg-primary/8 text-primary hover:bg-primary/15",
                  )}
                  title={`Currently ${entry.dir === "asc" ? "Ascending" : "Descending"} — click to toggle`}
                >
                  {entry.dir === "asc"
                    ? <><ArrowUp className="h-2.5 w-2.5" />Asc</>
                    : <><ArrowDown className="h-2.5 w-2.5" />Desc</>
                  }
                </button>
              )}

              {/* Nulls toggle — hidden for __most_used */}
              {entry.key !== "__most_used" && (
                <button
                  onClick={() => toggleNulls(idx)}
                  title={entry.nulls === "first" ? "Nulls first — click for nulls last" : "Nulls last (default) — click for nulls first"}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-2xs font-mono transition-colors border",
                    entry.nulls === "first"
                      ? "border-primary/40 bg-primary/8 text-primary"
                      : "border-transparent text-muted-foreground/50 hover:border-border hover:text-muted-foreground",
                  )}
                >
                  {entry.nulls === "first" ? "n↑" : "n↓"}
                </button>
              )}

              {/* Remove */}
              <button
                onClick={() => removeEntry(idx)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                title="Remove sort"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Most used — special sort, gated on view_count opt-in */}
          {hasMostUsed && !mostUsedActive && (
            <div className="pt-1">
              <button
                onClick={() => setDraft([{ key: "__most_used", dir: "desc" }])}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Sort by most used
              </button>
            </div>
          )}

          {/* Add field section */}
          {availableFields.length > 0 && !mostUsedActive && (
            <div className="pt-1">
              {!addingField ? (
                <button
                  onClick={() => { setAddingField(true); setTimeout(() => searchRef.current?.focus(), 50); }}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add sort field
                </button>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                      placeholder="Search fields…"
                      className="w-full pl-8 pr-3 py-2 text-xs bg-muted/30 border-b focus:outline-none focus:bg-background"
                    />
                  </div>
                  {/* Field list */}
                  <div className="max-h-48 overflow-y-auto">
                    {filteredFields.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No fields found</p>
                    ) : (
                      filteredFields.map((f) => (
                        <button
                          key={f.name}
                          onClick={() => addField(f)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 text-left transition-colors"
                        >
                          <Highlight text={f.label ?? f.name} query={fieldSearch} />
                          {fieldSearch && f.name !== (f.label ?? f.name) && (
                            <span className="text-2xs text-muted-foreground ml-auto font-mono">
                              <Highlight text={f.name} query={fieldSearch} />
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t px-3 py-1.5">
                    <button
                      onClick={() => { setAddingField(false); setFieldSearch(""); }}
                      className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-4 py-3 flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={apply}
            disabled={!isDirty}
          >
            Apply
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={resetToDefault}
            title="Reset to default sort"
          >
            Reset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={discard}
          >
            Discard
          </Button>
        </div>
      </div>
    </>
  );
}
