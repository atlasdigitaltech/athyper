"use client";

import { type ChangeEvent } from "react";
import type { DraftLine } from "@athyper/runtime-contracts";
import { ModalSelectShell } from "@athyper/ui/surfaces/shells";
import { useSourceAdapterPicker } from "./use-source-adapter-picker";
import { SourceAdapterPickerGrid } from "./source-adapter-picker-grid";
import type { SourceAdapterPickerProps } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// ModalSelectPicker — centered-modal picker for adapters with
// `picker.kind === "modal-select"`. Used by open_po_line, open_receipt_line,
// open_service_sheet_line.
// ─────────────────────────────────────────────────────────────────────────────

export function ModalSelectPicker<
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
    <ModalSelectShell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      width="grid"
      title={bindingLabel ?? adapter.manifest.label}
      description={picker.loading ? "Loading…" : picker.error ? `Error: ${picker.error}` : undefined}
      filters={
        adapter.manifest.picker?.search.enabled !== false ? (
          <input
            type="search"
            value={typeof picker.query.q === "string" ? picker.query.q : ""}
            onChange={(e: ChangeEvent<HTMLInputElement>) => picker.setSearch(e.target.value)}
            placeholder={adapter.manifest.picker?.search.placeholder ?? "Search…"}
            className="w-full max-w-md rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            aria-label="Search items"
          />
        ) : undefined
      }
      grid={
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
      }
      summary={`${picker.selectionCount} of ${items.length} selected`}
      cancel={
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      }
      confirm={
        <button
          type="button"
          onClick={() => void handleCommit()}
          disabled={!picker.hasSelection || !picker.validation.ok}
          className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"
        >
          Add {picker.selectionCount > 0 ? `(${picker.selectionCount})` : ""}
        </button>
      }
    />
  );
}
