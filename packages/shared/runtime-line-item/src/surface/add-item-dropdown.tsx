"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Portal target — `document` is undefined during SSR; we read it once
  // mounted so the panel only renders client-side.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  // Panel position. Recomputed from the trigger's bounding rect each time
  // the dropdown opens, and on scroll/resize while open, so the panel
  // tracks the trigger even when ancestors scroll.
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalTarget(document.body);
  }, []);

  // Click-outside guard. Now considers both the trigger group and the
  // portaled panel so clicking inside the panel doesn't close it.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Position the portaled panel right-aligned just below the trigger
  // group. useLayoutEffect avoids the one-frame flash of a stale rect.
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = ref.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 4,                          // 4px = mt-1
        right: window.innerWidth - rect.right,
      });
    }
    reposition();
    window.addEventListener("scroll", reposition, true); // capture: catch nested scrollers
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
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
        className="flex h-7 items-center gap-1.5 rounded-l-md bg-foreground pl-3 pr-2.5 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add
      </button>
      {!hideMoreToggle && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-label="More add options"
          className="flex h-7 items-center rounded-r-md border-l border-background/20 bg-foreground px-1.5 text-background transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}

      {open && !hideMoreToggle && portalTarget && panelPos
        ? createPortal(
            // Panel is portaled to document.body so it escapes any
            // `overflow-hidden` ancestor (the lines card uses it to clip
            // rounded corners). `max-h-[60vh] overflow-y-auto` keeps the
            // panel usable when the registry grows or the viewport is
            // short.
            <div
              ref={panelRef}
              style={{ position: "fixed", top: panelPos.top, right: panelPos.right }}
              className="z-50 w-56 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md"
            >
              <button
                type="button"
                onClick={() => { setOpen(false); onAddManual(); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Add manually
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
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/50"
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
                  className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2 text-left text-sm text-muted-foreground/40"
                >
                  <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Add Catalog Item
                </button>
              )}
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
