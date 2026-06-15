"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, ShoppingBag } from "lucide-react";
import {
  useOptionalSourceAdapterRegistry,
  type SourceAdapter,
} from "@athyper/runtime-add-item";

// ─────────────────────────────────────────────────────────────────────────────
// AddItemDropdown — registry-driven primary "Add Item" button + dropdown.
//
// Registry-driven when a SourceAdapterRegistry is mounted via context: the
// primary button stays as the direct-fill (manual) path; the dropdown lists
// every picker-having adapter the user has permission for. When no registry
// is mounted (legacy consumer), falls back to the original "Add Item +
// Add Catalog Item (disabled)" shape so consumers that haven't migrated to
// the registry provider see the old UI.
//
// `onPickAdapter` is intentionally optional. When omitted, picker-adapter
// buttons render but are disabled with a hint tooltip — this is the state
// during the rollout window between the dropdown shipping and the
// AddItemController + picker shells being mounted at the page level.
// ─────────────────────────────────────────────────────────────────────────────

export interface AddItemDropdownProps {
  /** Direct-fill / manual path. Always wired. */
  onAddManual: () => void;
  /**
   * Optional handler for picker-having adapters. Called with the adapter
   * the user picked from the dropdown. When omitted, picker-having adapters
   * still render but are disabled.
   */
  onPickAdapter?: (adapter: SourceAdapter) => void;
  /** Hide the dropdown chevron when only the manual path is exposed. */
  hideMoreToggle?: boolean;
  disabled?: boolean;
}

export function AddItemDropdown({
  onAddManual,
  onPickAdapter,
  hideMoreToggle = false,
  disabled,
}: AddItemDropdownProps) {
  const registry = useOptionalSourceAdapterRegistry();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Registry-driven listing — picker adapters only. Direct-fill adapters
  // are surfaced via the primary "Add Item" button so the dropdown is
  // exclusively for source-of-truth picks.
  const pickerAdapters = useMemo(() => {
    if (!registry) return [];
    return registry.list().filter((a) => a.manifest.entry === "picker");
  }, [registry]);

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(false); onAddManual(); }}
        className="flex h-7 items-center gap-1.5 rounded-l-lg bg-foreground pl-3 pr-2.5 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add Item
      </button>
      {!hideMoreToggle && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-label="More add options"
          className="flex h-7 items-center rounded-r-lg border-l border-background/20 bg-foreground px-1.5 text-background transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}

      {open && !hideMoreToggle && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md">
          <button
            type="button"
            onClick={() => { setOpen(false); onAddManual(); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Add Item
          </button>
          {registry ? (
            pickerAdapters.length === 0 ? null : (
              pickerAdapters.map((adapter) => (
                <button
                  key={adapter.manifest.id}
                  type="button"
                  disabled={!onPickAdapter}
                  onClick={() => {
                    setOpen(false);
                    onPickAdapter?.(adapter);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/50"
                  title={onPickAdapter ? undefined : "Picker wiring not available in this view"}
                >
                  <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {adapter.manifest.label}
                </button>
              ))
            )
          ) : (
            // Legacy fallback when no registry is mounted — preserved so
            // consumers that haven't migrated to the registry provider see
            // the original UI.
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground/40"
            >
              <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Add Catalog Item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
