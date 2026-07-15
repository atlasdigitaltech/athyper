import type { DraftLine } from "@athyper/runtime-contracts";
import type { SourceAdapter, ValidationResult } from "../adapter/types";

// ─────────────────────────────────────────────────────────────────────────────
// Picker UI shared types. The two picker components (OverlayPicker for
// `picker.kind === "overlay"`, ModalSelectPicker for `picker.kind === "modal-select"`)
// share the same per-row selection-state shape so the consumer can route
// either picker the same way.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Picker-row identifier. Adapters expose this via their selectionShape.idField.
 * The picker UI treats it as opaque.
 */
export type PickerRowKey = string;

/**
 * Per-row selection state. Carries the chosen quantity / UOM when the
 * adapter's `selectionShape` declares them, otherwise the value is `true`
 * (id_only — selection is a presence bit).
 */
export interface PickerRowSelection {
  /** True when the row is selected. */
  selected: boolean;
  /** Chosen quantity. Required for `id_qty` / `id_qty_uom` selection shapes. */
  chosenQty?: number;
  /** Chosen UOM code. Required for `id_qty_uom` selection shape. */
  chosenUomCode?: string;
}

/**
 * Consumer callback invoked when the user clicks the picker's primary "Add"
 * action. Receives the selected rows with their chosen quantities; the
 * caller is responsible for routing them through the adapter's `toDraftShape`
 * and the `AddItemController.stageLine` pipeline.
 */
export type PickerCommitHandler<Selection extends Record<string, unknown>> = (
  rows: Array<Selection>,
) => void | Promise<void>;

/**
 * Validation result aggregated from per-row `adapter.validateSelection` calls.
 * Picker UI surfaces invalid rows with their issue messages.
 */
export interface PickerValidationState {
  ok: boolean;
  /** Per-row issues keyed by row id. */
  rowIssues: Record<PickerRowKey, string[]>;
}

/**
 * Shared picker props. Both OverlayPicker and ModalSelectPicker accept this
 * shape — only the surrounding shell differs (full-viewport overlay vs.
 * centered modal).
 */
export interface SourceAdapterPickerProps<
  Selection extends Record<string, unknown> = Record<string, unknown>,
  Draft extends DraftLine = DraftLine,
  ParentCtx extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The adapter being picked. */
  adapter: SourceAdapter<Selection, Draft, ParentCtx>;
  /** Parent record context — currency, supplier, parent ids. */
  parentCtx: ParentCtx;
  /** Picker open state. */
  open: boolean;
  /** Called when the user closes the picker without committing. */
  onClose: () => void;
  /**
   * Called when the user clicks the primary "Add" action with the rows they
   * chose. Receives the raw `Selection` values (with chosenQty / chosenUomCode
   * already populated by the picker UI when the adapter's selectionShape
   * requires them).
   */
  onCommit: PickerCommitHandler<Selection>;
  /**
   * Optional binding-bar / title override. Defaults to
   * "{parentEntityCode} · {adapter.manifest.label}".
   */
  bindingLabel?: string;
}

/** Helper — extracts the id field name from an adapter's selectionShape. */
export function getIdFieldName(adapter: SourceAdapter): string {
  const shape = adapter.manifest.selectionShape;
  if (shape.kind === "composite") {
    // composite shapes use a tuple of keyFields; the picker uses the first
    // as the row key. Composite-shape adapters that want a custom row key
    // can override via `adapter.dedupeKey()`.
    return shape.keyFields[0] ?? "id";
  }
  return shape.idField;
}

/** Helper — reads the id field value from a selection row. */
export function readRowId(adapter: SourceAdapter, row: Record<string, unknown>): PickerRowKey {
  const field = getIdFieldName(adapter);
  const value = row[field];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  // Fallback: stringify (composite ids etc.). Stable enough for picker use.
  return JSON.stringify(value);
}

/** Helper — whether the adapter requires the picker UI to collect a quantity. */
export function adapterRequiresQty(adapter: SourceAdapter): boolean {
  const kind = adapter.manifest.selectionShape.kind;
  return kind === "id_qty" || kind === "id_qty_uom";
}

/** Helper — whether the adapter requires the picker UI to collect a UOM. */
export function adapterRequiresUom(adapter: SourceAdapter): boolean {
  return adapter.manifest.selectionShape.kind === "id_qty_uom";
}

/**
 * Run validation across all selected rows. Returns aggregated OK / row-issues.
 */
export function validateSelectedRows<Selection extends Record<string, unknown>>(
  adapter: SourceAdapter<Selection, never, never>,
  rows: Selection[],
  parentCtx: Record<string, unknown>,
): PickerValidationState {
  const rowIssues: Record<PickerRowKey, string[]> = {};
  let ok = true;
  for (const row of rows) {
    const id = readRowId(adapter, row);
    const result: ValidationResult = adapter.validateSelection(row, parentCtx as never);
    if (!result.ok) {
      ok = false;
      rowIssues[id] = (result.issues ?? [{ message: "Invalid selection" }]).map(
        (issue) => issue.message,
      );
    }
  }
  return { ok, rowIssues };
}
