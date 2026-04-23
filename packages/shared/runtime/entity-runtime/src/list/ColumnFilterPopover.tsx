"use client";

/**
 * ColumnFilterPopover — compact filter popover anchored below a column header.
 *
 * Props-driven; no URL knowledge. Caller (column header builder in EntityListPage)
 * supplies the current entry and the onApply callback that writes to URL state.
 *
 * Keyboard:
 *   Escape      → close without applying
 *   ⌘+Enter     → apply and close
 *
 * Positioning: absolute right-0 top-full — anchors to the nearest relative parent
 * (the button wrapper in ColumnFilterHeader). Opens left-of-button to avoid clipping.
 */

import { useState, useEffect, useRef } from "react";
import { cn } from "@athyper/theme/utils";
import { Button } from "@athyper/ui/primitives";
import type { EntityField } from "@athyper/api-contracts/metadata";
import type { FilterEntry } from "@athyper/api-contracts/entity-list";
import { FieldFilterControl, NullToggle } from "./FieldFilterControl";

export interface ColumnFilterPopoverProps {
  field:       EntityField;
  entry:       FilterEntry | undefined;
  facetValues: { value: string; count: number }[];
  /** Called with the resolved entry when user confirms. Caller writes to URL. */
  onApply:     (entry: FilterEntry | undefined) => void;
  onClose:     () => void;
}

export function ColumnFilterPopover({
  field,
  entry,
  facetValues,
  onApply,
  onClose,
}: ColumnFilterPopoverProps) {
  const [draft, setDraft] = useState<FilterEntry | undefined>(entry);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside → close without applying
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler, { capture: true });
    return () => document.removeEventListener("mousedown", handler, { capture: true });
  }, [onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { onApply(draft); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [draft, onApply, onClose]);

  const isNullOp =
    !Array.isArray(draft) &&
    (draft?.op === "is_null" || draft?.op === "is_not_null");

  const isDirty = JSON.stringify(draft) !== JSON.stringify(entry);

  return (
    <div
      ref={ref}
      className={cn(
        "absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-input bg-popover p-3 shadow-lg",
        "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-100",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Field label + clear */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground truncate pr-2">
          {field.label ?? field.name}
        </p>
        {draft !== undefined && (
          <button
            onClick={() => setDraft(undefined)}
            className="shrink-0 text-2xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Null toggle */}
      <div className="mb-2">
        <NullToggle entry={draft} onChange={setDraft} />
      </div>

      {/* Per-type control */}
      {!isNullOp && (
        <div className="mb-3">
          <FieldFilterControl
            field={field}
            entry={draft}
            facetValues={facetValues}
            onChange={setDraft}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 border-t pt-2.5">
        <Button
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={() => { onApply(draft); onClose(); }}
        >
          Apply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
