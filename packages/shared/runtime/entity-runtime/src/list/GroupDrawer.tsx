"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Search, Layers, Check } from "lucide-react";
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

export interface GroupDrawerProps {
  open: boolean;
  onClose: () => void;
  entity: CompiledEntity;
  appliedGroup: string | null | undefined;
  onApply: (group: string | null | undefined) => void;
  width?: number;
  onWidthChange?: (w: number) => void;
}

const MIN_WIDTH       = 260;
const MAX_WIDTH_RATIO = 0.7;

// ─── Component ────────────────────────────────────────────────────────────────

export function GroupDrawer({
  open,
  onClose,
  entity,
  appliedGroup,
  onApply,
  width: controlledWidth,
  onWidthChange,
}: GroupDrawerProps) {
  const [draft, setDraft]         = useState<string | null | undefined>(undefined);
  const [fieldSearch, setFieldSearch] = useState("");
  const [width, setWidth]         = useState(controlledWidth ?? Math.round(window.innerWidth * 0.30));

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging   = useRef(false);

  useEffect(() => {
    if (open) {
      setDraft(appliedGroup);
      setFieldSearch("");
    }
  }, [open, appliedGroup]);

  useEffect(() => {
    if (controlledWidth !== undefined) setWidth(controlledWidth);
  }, [controlledWidth]);

  const isDirty = draft !== appliedGroup;

  const groupableFields = useMemo(
    () => entity.fields.filter((f) => f.is_groupable),
    [entity.fields],
  );

  const filteredFields = useMemo(() => {
    if (!fieldSearch.trim()) return groupableFields;
    const q = fieldSearch.toLowerCase();
    return groupableFields.filter(
      (f) => (f.label ?? f.name).toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
    );
  }, [groupableFields, fieldSearch]);

  const apply = useCallback(() => {
    onApply(draft);
  }, [draft, onApply]);

  const discard = useCallback(() => {
    setDraft(appliedGroup);
    onClose();
  }, [appliedGroup, onClose]);

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
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Group</span>
            {(draft !== null && draft !== undefined) && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-2xs font-bold">
                1
              </span>
            )}
          </div>
          <button onClick={discard} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Level 1 — active */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Level 1</span>
              {(draft !== null && draft !== undefined) && (
                <button
                  onClick={() => setDraft(null)}
                  className="text-2xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Search groupable fields…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-md bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {groupableFields.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No groupable fields for this entity.
              </p>
            ) : filteredFields.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No fields match.</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                {filteredFields.map((f) => {
                  const active = draft === f.name;
                  return (
                    <button
                      key={f.name}
                      onClick={() => setDraft(active ? null : f.name)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors border-b last:border-b-0",
                        active
                          ? "bg-primary/8 text-primary font-medium"
                          : "hover:bg-muted/50 text-foreground",
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                      <Highlight text={f.label ?? f.name} query={fieldSearch} />
                      {fieldSearch && (
                        <span className="text-2xs text-muted-foreground ml-auto font-mono">
                          <Highlight text={f.name} query={fieldSearch} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Levels 2-3 — v2 scaffold */}
          {[2, 3].map((level) => (
            <div key={level} className="opacity-40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Level {level}</span>
                <span className="text-2xs text-muted-foreground border rounded px-1.5 py-0.5">Coming in v2</span>
              </div>
              <div className="h-8 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center text-2xs text-muted-foreground">
                Multi-level grouping
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-4 py-3 flex items-center gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={apply} disabled={!isDirty}>
            Apply
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDraft(undefined)} title="Clear grouping">
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
