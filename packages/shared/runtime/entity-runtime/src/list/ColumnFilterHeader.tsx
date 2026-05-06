"use client";

/**
 * ColumnFilterHeader — column header with an inline filter affordance.
 *
 * Layout: [label text ···] [funnel icon]
 *
 * Sort zone:   clicking the label (or anywhere outside the funnel) bubbles up
 *              to DataTable's sort button — no interference with sort.
 * Filter zone: clicking the funnel stopPropagation, opens ColumnFilterPopover.
 *
 * Active state:
 *   - funnel icon is always visible (primary color) when a filter is active
 *   - funnel icon appears on row hover (muted) when no filter is active
 *   - blue dot on the icon when active (belt-and-suspenders signal)
 *
 * Props are fully lifted — no URL access here.
 */

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Filter } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { EntityField } from "@athyper/api-contracts/metadata";
import type { FilterEntry } from "@athyper/api-contracts/entity-list";
import { ColumnFilterPopover } from "./ColumnFilterPopover";

export interface ColumnFilterHeaderProps {
  label:       string;
  field:       EntityField;
  entry:       FilterEntry | undefined;
  facetValues: { value: string; count: number }[];
  /** Called when user confirms a filter change. Caller writes to URL. */
  onApply:     (entry: FilterEntry | undefined) => void;
}

export function ColumnFilterHeader({
  label,
  field,
  entry,
  facetValues,
  onApply,
}: ColumnFilterHeaderProps) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasFilter = entry !== undefined;

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!open && wrapperRef.current) {
      setAnchorRect(wrapperRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  };

  return (
    <div className="flex w-full items-center gap-0.5 group/colhdr">
      {/* Label — clicks bubble to DataTable's sort handler */}
      <span className="flex-1 truncate">{label}</span>

      {/* Filter affordance — click is isolated from sort.
          Uses div[role=button] because this is already inside DataTable's sort <button>.
          Popover is portaled to document.body to avoid button-in-button invalid HTML. */}
      <div className="relative shrink-0" ref={wrapperRef}>
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(e); } }}
          className={cn(
            "rounded p-0.5 transition-colors cursor-pointer",
            hasFilter
              ? "text-primary"
              : "text-transparent group-hover/colhdr:text-muted-foreground/60 hover:!text-muted-foreground",
          )}
          aria-label={`Filter by ${label}`}
          aria-pressed={open}
        >
          <Filter className="h-3 w-3" />
          {/* Active dot */}
          {hasFilter && (
            <span className="absolute -right-px -top-px h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </div>

        {open && anchorRect && createPortal(
          <ColumnFilterPopover
            field={field}
            entry={entry}
            facetValues={facetValues}
            anchorStyle={{
              position: "fixed",
              top: anchorRect.bottom + 4,
              left: anchorRect.left,
            }}
            onApply={(next) => { onApply(next); setOpen(false); }}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
      </div>
    </div>
  );
}
