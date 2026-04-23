"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X, Search, Columns3, Eye, EyeOff, GripVertical,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button } from "@athyper/ui/primitives";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";

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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ColumnDrawerProps {
  open: boolean;
  onClose: () => void;
  entity: CompiledEntity;
  /** Currently visible column names (empty = default columns) */
  appliedColumns: string[];
  defaultColumns: string[];
  onApply: (columns: string[]) => void;
  width?: number;
  onWidthChange?: (w: number) => void;
  /**
   * Full pool of fields that can be shown or hidden.
   * Defaults to entity.fields. Pass entity.fields (filtered to non-computed)
   * so users can add columns beyond the list-config defaults.
   */
  availableFields?: { name: string; label?: string | null }[];
  /** Label for which view these columns apply to — shown in the drawer header. */
  viewLabel?: string;
}

const MIN_WIDTH       = 260;
const MAX_WIDTH_RATIO = 0.7;

// ─── Component ────────────────────────────────────────────────────────────────

export function ColumnDrawer({
  open,
  onClose,
  entity,
  appliedColumns,
  defaultColumns,
  onApply,
  width: controlledWidth,
  onWidthChange,
  availableFields,
  viewLabel,
}: ColumnDrawerProps) {
  const fieldSource   = availableFields ?? entity.fields;
  const allFieldNames = useMemo(() => fieldSource.map((f) => f.name), [fieldSource]);
  const fieldLabel    = useCallback((name: string) =>
    fieldSource.find((f) => f.name === name)?.label ?? name, [fieldSource]);

  // Draft = ordered list of visible fields
  const [draftVisible, setDraftVisible] = useState<string[]>([]);
  const [colSearch, setColSearch]       = useState("");
  const [width, setWidth]               = useState(controlledWidth ?? Math.round(window.innerWidth * 0.30));

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging   = useRef(false);

  // Effective applied set — empty appliedColumns means "use defaults" in URL state
  const effectiveApplied = useMemo(
    () => (appliedColumns.length > 0 ? appliedColumns : defaultColumns),
    [appliedColumns, defaultColumns],
  );

  useEffect(() => {
    if (open) {
      setDraftVisible([...effectiveApplied]);
      setColSearch("");
    }
  }, [open, effectiveApplied]);

  useEffect(() => {
    if (controlledWidth !== undefined) setWidth(controlledWidth);
  }, [controlledWidth]);

  const isDirty = useMemo(
    () => JSON.stringify(effectiveApplied) !== JSON.stringify(draftVisible),
    [effectiveApplied, draftVisible],
  );

  const hiddenFields = useMemo(
    () => allFieldNames.filter((n) => !draftVisible.includes(n)),
    [allFieldNames, draftVisible],
  );

  const filteredVisible = useMemo(() => {
    if (!colSearch.trim()) return draftVisible;
    const q = colSearch.toLowerCase();
    return draftVisible.filter((n) => fieldLabel(n).toLowerCase().includes(q) || n.toLowerCase().includes(q));
  }, [draftVisible, colSearch, fieldLabel]);

  const filteredHidden = useMemo(() => {
    if (!colSearch.trim()) return hiddenFields;
    const q = colSearch.toLowerCase();
    return hiddenFields.filter((n) => fieldLabel(n).toLowerCase().includes(q) || n.toLowerCase().includes(q));
  }, [hiddenFields, colSearch, fieldLabel]);

  const showField = useCallback((name: string) => {
    setDraftVisible((prev) => [...prev, name]);
  }, []);

  const hideField = useCallback((name: string) => {
    setDraftVisible((prev) => prev.filter((n) => n !== name));
  }, []);

  // Drag-to-reorder state
  const [dragIdx,     setDragIdx]     = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => setDragIdx(idx), []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (idx !== dragIdx) setDragOverIdx(idx);
  }, [dragIdx]);

  const handleDrop = useCallback((targetIdx: number) => {
    setDraftVisible((prev) => {
      if (dragIdx === null || dragIdx === targetIdx) return prev;
      const next = [...prev];
      const [removed] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, removed!);
      return next;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  const apply = useCallback(() => {
    // Compare against defaultColumns — sending [] produces a clean URL (no ?cols= param)
    const isDefault =
      draftVisible.length === defaultColumns.length &&
      draftVisible.every((n, i) => n === defaultColumns[i]);
    onApply(isDefault ? [] : draftVisible);
  }, [draftVisible, defaultColumns, onApply]);

  const discard = useCallback(() => {
    setDraftVisible([...effectiveApplied]);
    onClose();
  }, [effectiveApplied, onClose]);

  const resetToDefault = useCallback(() => {
    setDraftVisible([...defaultColumns]);
  }, [defaultColumns]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); discard(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); apply(); }
    };
    containerRef.current?.addEventListener("keydown", handler);
    return () => containerRef.current?.removeEventListener("keydown", handler);
  }, [open, apply, discard]);

  // Resize
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
    const onUp = () => { isDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width, onWidthChange]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]" onClick={discard} />
      )}

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
            <Columns3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              {viewLabel ? `${viewLabel} Columns` : "Columns"}
            </span>
            <span className="text-xs text-muted-foreground">
              {draftVisible.length}/{allFieldNames.length}
            </span>
          </div>
          <button onClick={discard} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={colSearch}
              onChange={(e) => setColSearch(e.target.value)}
              placeholder="Search columns…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-md bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Visible columns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Visible <span className="normal-case font-normal">({filteredVisible.length})</span>
              </span>
              {draftVisible.length < allFieldNames.length && (
                <button
                  onClick={() => setDraftVisible([...allFieldNames])}
                  className="text-2xs text-primary hover:text-primary/80 transition-colors"
                >
                  Show all
                </button>
              )}
            </div>

            {filteredVisible.length === 0 && colSearch ? (
              <p className="text-xs text-muted-foreground text-center py-3">No visible columns match.</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                {filteredVisible.map((name) => {
                  const realIdx    = draftVisible.indexOf(name);
                  const isDragging = dragIdx === realIdx;
                  const isTarget   = dragOverIdx === realIdx && !isDragging;
                  return (
                    <div
                      key={name}
                      draggable
                      onDragStart={() => handleDragStart(realIdx)}
                      onDragOver={(e) => handleDragOver(e, realIdx)}
                      onDrop={() => handleDrop(realIdx)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 border-b last:border-b-0 transition-colors",
                        isDragging ? "opacity-40 bg-muted/20" : "hover:bg-muted/30",
                        isTarget   && "border-t-2 border-t-primary",
                      )}
                    >
                      {/* Drag handle */}
                      <div className="shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <span className="flex-1 text-xs select-none">
                        <Highlight text={fieldLabel(name)} query={colSearch} />
                      </span>
                      <button
                        onClick={() => hideField(name)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                        title="Hide column"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hidden columns — always rendered; empty state shown when all are visible */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Hidden <span className="normal-case font-normal">({filteredHidden.length})</span>
              </span>
              {hiddenFields.length > 0 && (
                <button
                  onClick={() => setDraftVisible([])}
                  className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Hide all
                </button>
              )}
            </div>

            {hiddenFields.length === 0 ? (
              <div className="flex items-center justify-center gap-1.5 rounded-md border border-dashed py-4 text-xs text-muted-foreground">
                All columns visible — click
                <Eye className="h-3 w-3 inline-block" />
                to hide one
              </div>
            ) : filteredHidden.length === 0 && colSearch ? (
              <p className="text-xs text-muted-foreground text-center py-3">No hidden columns match.</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                {filteredHidden.map((name) => (
                  <div key={name} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <span className="flex-1 text-xs text-muted-foreground">
                      <Highlight text={fieldLabel(name)} query={colSearch} />
                    </span>
                    <button
                      onClick={() => showField(name)}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                      title="Show column"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-4 py-3 flex items-center gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={apply} disabled={!isDirty}>
            Apply
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetToDefault} title="Reset to default columns">
            Reset
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={discard}>
            Discard
          </Button>
        </div>
      </div>
    </>
  );
}
