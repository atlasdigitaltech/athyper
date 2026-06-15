"use client";

import { type ChangeEvent } from "react";
import type { DraftLine } from "@athyper/runtime-contracts";
import { OverlayShell } from "@athyper/ui/surfaces/shells";
import { useSourceAdapterPicker } from "./useSourceAdapterPicker";
import { SourceAdapterPickerGrid } from "./SourceAdapterPickerGrid";
import type { SourceAdapterPickerProps } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// OverlayPicker — full-viewport picker for adapters with
// `picker.kind === "overlay"`. Bound to the parent record so the draft
// stays mounted underneath.
// ─────────────────────────────────────────────────────────────────────────────

export function OverlayPicker<
  Selection extends Record<string, unknown>,
  Draft extends DraftLine,
  ParentCtx extends Record<string, unknown>,
>(props: SourceAdapterPickerProps<Selection, Draft, ParentCtx>) {
  const { adapter, parentCtx, open, onClose, onCommit, bindingLabel } = props;
  const picker = useSourceAdapterPicker({ adapter, parentCtx, open });

  async function handleCommit(): Promise<void> {
    if (!picker.validation.ok) return;
    const rows = picker.buildSelectedRows();
    await onCommit(rows);
    onClose();
  }

  const items = picker.page?.items ?? [];

  return (
    <OverlayShell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      ariaLabel={adapter.manifest.label}
      bindingBar={
        <span className="text-sm text-foreground">
          {bindingLabel ?? `${adapter.manifest.label}`}
        </span>
      }
      footer={
        <>
          <div className="text-xs text-muted-foreground">
            {picker.loading ? "Loading…" :
              picker.error ? `Error: ${picker.error}` :
              `${picker.selectionCount} of ${items.length} selected`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={!picker.hasSelection || !picker.validation.ok}
              className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"
            >
              Add {picker.selectionCount > 0 ? `(${picker.selectionCount})` : ""}
            </button>
          </div>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {adapter.manifest.picker?.search.enabled !== false && (
          <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-2">
            <input
              type="search"
              value={typeof picker.query.q === "string" ? picker.query.q : ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => picker.setSearch(e.target.value)}
              placeholder={adapter.manifest.picker?.search.placeholder ?? "Search…"}
              className="w-full max-w-md rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              aria-label="Search items"
            />
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">
          <SourceAdapterPickerGrid
            adapter={adapter as never}
            rows={items}
            selectedIds={picker.selectedIds}
            validation={picker.validation}
            onToggleRow={picker.toggleRow}
            getQty={picker.getQty}
            setQty={picker.setQty}
            getUom={picker.getUom}
            setUom={picker.setUom}
          />
        </div>
      </div>
    </OverlayShell>
  );
}
