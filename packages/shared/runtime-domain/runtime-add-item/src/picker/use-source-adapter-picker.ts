"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { DraftLine } from "@athyper/runtime-contracts";
import type { Page, SourceAdapter, SourceQuery } from "../adapter/types";
import {
  adapterRequiresQty,
  adapterRequiresUom,
  readRowId,
  validateSelectedRows,
  type PickerRowKey,
  type PickerValidationState,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// useSourceAdapterPicker — orchestration hook for the picker UI.
//
// Owns:
//   • Query state (search + filters + cursor)
//   • Page data (latest fetch result, in-flight indicator, error)
//   • Per-row selection (Set<rowKey> + per-row qty / uom maps)
//   • Validation aggregated across selected rows
//   • Commit handler that returns the full Selection rows with chosen qty/uom
//     merged in
//
// Does NOT own:
//   • Picker chrome (shells live in @athyper/ui/surfaces)
//   • Column / filter rendering (each picker variant owns its grid + filters)
//   • The actual fetch — the adapter's `fetch` is called via `refetch()`
// ─────────────────────────────────────────────────────────────────────────────

interface State<Selection extends Record<string, unknown>> {
  query: SourceQuery;
  page: Page<Selection> | null;
  loading: boolean;
  error: string | null;
  selectedIds: Set<PickerRowKey>;
  qtyById: Map<PickerRowKey, number>;
  uomById: Map<PickerRowKey, string>;
}

type Action<Selection extends Record<string, unknown>> =
  | { type: "set-query"; query: SourceQuery }
  | { type: "loading-start" }
  | { type: "loading-ok"; page: Page<Selection> }
  | { type: "loading-fail"; error: string }
  | { type: "toggle"; rowId: PickerRowKey }
  | { type: "set-qty"; rowId: PickerRowKey; qty: number }
  | { type: "set-uom"; rowId: PickerRowKey; uom: string }
  | { type: "clear-selection" }
  | { type: "reset" };

function initialState<Selection extends Record<string, unknown>>(): State<Selection> {
  return {
    query: {},
    page: null,
    loading: false,
    error: null,
    selectedIds: new Set(),
    qtyById: new Map(),
    uomById: new Map(),
  };
}

function reducer<Selection extends Record<string, unknown>>(
  state: State<Selection>,
  action: Action<Selection>,
): State<Selection> {
  switch (action.type) {
    case "set-query":
      return { ...state, query: action.query };
    case "loading-start":
      return { ...state, loading: true, error: null };
    case "loading-ok":
      return { ...state, loading: false, page: action.page };
    case "loading-fail":
      return { ...state, loading: false, error: action.error };
    case "toggle": {
      const next = new Set(state.selectedIds);
      if (next.has(action.rowId)) next.delete(action.rowId);
      else next.add(action.rowId);
      return { ...state, selectedIds: next };
    }
    case "set-qty": {
      const next = new Map(state.qtyById);
      next.set(action.rowId, action.qty);
      return { ...state, qtyById: next };
    }
    case "set-uom": {
      const next = new Map(state.uomById);
      next.set(action.rowId, action.uom);
      return { ...state, uomById: next };
    }
    case "clear-selection":
      return {
        ...state,
        selectedIds: new Set(),
        qtyById: new Map(),
        uomById: new Map(),
      };
    case "reset":
      return initialState();
  }
}

export interface UseSourceAdapterPickerOptions<
  Selection extends Record<string, unknown>,
  ParentCtx extends Record<string, unknown>,
> {
  adapter: SourceAdapter<Selection, DraftLine, ParentCtx>;
  parentCtx: ParentCtx;
  /**
   * Auto-fetch on open. When true (default), the hook runs an initial fetch
   * with an empty query as soon as the picker opens. When false, the
   * consumer drives all fetches explicitly.
   */
  open: boolean;
}

export interface UseSourceAdapterPickerResult<
  Selection extends Record<string, unknown>,
> {
  query: SourceQuery;
  /** Update the search string. Debounces internally via React batching. */
  setSearch(q: string): void;
  /** Replace the filter object. */
  setFilters(filters: Record<string, unknown>): void;
  /** Refetch the current query. */
  refetch(): Promise<void>;

  page: Page<Selection> | null;
  loading: boolean;
  error: string | null;

  /** Set of currently-selected row ids. */
  selectedIds: ReadonlySet<PickerRowKey>;
  toggleRow(rowId: PickerRowKey): void;
  clearSelection(): void;
  /** True when at least one row is selected. */
  hasSelection: boolean;
  /** Selection count for the footer "Add (N)" affordance. */
  selectionCount: number;

  /** Per-row qty getter / setter — used when adapter requires id_qty selection. */
  getQty(rowId: PickerRowKey): number | undefined;
  setQty(rowId: PickerRowKey, qty: number): void;

  /** Per-row UOM getter / setter — used when adapter requires id_qty_uom. */
  getUom(rowId: PickerRowKey): string | undefined;
  setUom(rowId: PickerRowKey, uom: string): void;

  /**
   * Build the full Selection rows from the current page + per-row state.
   * Each row gets `chosenQty` / `chosenUomCode` merged in when the
   * selectionShape requires them.
   */
  buildSelectedRows(): Selection[];

  /** Validation result across all currently-selected rows. */
  validation: PickerValidationState;
}

export function useSourceAdapterPicker<
  Selection extends Record<string, unknown>,
  ParentCtx extends Record<string, unknown>,
>(
  opts: UseSourceAdapterPickerOptions<Selection, ParentCtx>,
): UseSourceAdapterPickerResult<Selection> {
  const { adapter, parentCtx, open } = opts;
  const [state, dispatch] = useReducer(
    reducer as React.Reducer<State<Selection>, Action<Selection>>,
    undefined,
    initialState<Selection>,
  );
  const [renderTick, setRenderTick] = useState(0);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const ctxRef = useRef(parentCtx);
  ctxRef.current = parentCtx;
  const queryRef = useRef(state.query);
  queryRef.current = state.query;

  // Auto-fetch on open transition. Subsequent fetches are explicit via
  // setSearch / setFilters / refetch.
  useEffect(() => {
    if (!open) {
      dispatch({ type: "reset" });
      return;
    }
    dispatch({ type: "loading-start" });
    void (async () => {
      try {
        const page = await adapterRef.current.fetch(
          queryRef.current,
          ctxRef.current,
        );
        dispatch({ type: "loading-ok", page });
      } catch (err) {
        dispatch({
          type: "loading-fail",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    // Intentional: re-run only on open transitions, not on adapter / ctx changes
    // (those flow via refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const refetch = useCallback(async () => {
    dispatch({ type: "loading-start" });
    try {
      const page = await adapterRef.current.fetch(queryRef.current, ctxRef.current);
      dispatch({ type: "loading-ok", page });
    } catch (err) {
      dispatch({
        type: "loading-fail",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const setSearch = useCallback((q: string) => {
    dispatch({ type: "set-query", query: { ...queryRef.current, q } });
    setRenderTick((t) => t + 1);
  }, []);

  const setFilters = useCallback((filters: Record<string, unknown>) => {
    dispatch({ type: "set-query", query: { ...queryRef.current, filters } });
    setRenderTick((t) => t + 1);
  }, []);

  // Trigger a fetch whenever the query changes (after setSearch / setFilters).
  // The renderTick avoids running the effect on initial mount (handled by
  // the open transition above).
  useEffect(() => {
    if (renderTick === 0 || !open) return;
    void refetch();
  }, [renderTick, open, refetch]);

  const toggleRow = useCallback((rowId: PickerRowKey) => {
    dispatch({ type: "toggle", rowId });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: "clear-selection" });
  }, []);

  const setQty = useCallback((rowId: PickerRowKey, qty: number) => {
    dispatch({ type: "set-qty", rowId, qty });
  }, []);

  const setUom = useCallback((rowId: PickerRowKey, uom: string) => {
    dispatch({ type: "set-uom", rowId, uom });
  }, []);

  const buildSelectedRows = useCallback((): Selection[] => {
    const items = state.page?.items ?? [];
    const wantsQty = adapterRequiresQty(adapterRef.current);
    const wantsUom = adapterRequiresUom(adapterRef.current);
    const shape = adapterRef.current.manifest.selectionShape;
    const qtyField = wantsQty && shape.kind !== "id_only" && shape.kind !== "composite"
      ? shape.qtyField
      : null;
    const uomField =
      wantsUom && shape.kind === "id_qty_uom" ? shape.uomField : null;

    const rows: Selection[] = [];
    for (const row of items) {
      const id = readRowId(adapterRef.current, row);
      if (!state.selectedIds.has(id)) continue;
      let merged: Selection = row;
      if (qtyField) {
        const qty = state.qtyById.get(id);
        if (typeof qty === "number") {
          merged = { ...merged, [qtyField]: qty };
        }
      }
      if (uomField) {
        const uom = state.uomById.get(id);
        if (typeof uom === "string" && uom) {
          merged = { ...merged, [uomField]: uom };
        }
      }
      rows.push(merged);
    }
    return rows;
  }, [state.page, state.selectedIds, state.qtyById, state.uomById]);

  const validation = useMemo<PickerValidationState>(() => {
    const rows = buildSelectedRows();
    if (rows.length === 0) return { ok: true, rowIssues: {} };
    return validateSelectedRows(
      adapterRef.current as never,
      rows,
      ctxRef.current as Record<string, unknown>,
    );
  }, [buildSelectedRows]);

  return {
    query: state.query,
    setSearch,
    setFilters,
    refetch,
    page: state.page,
    loading: state.loading,
    error: state.error,
    selectedIds: state.selectedIds,
    toggleRow,
    clearSelection,
    hasSelection: state.selectedIds.size > 0,
    selectionCount: state.selectedIds.size,
    getQty: (id) => state.qtyById.get(id),
    setQty,
    getUom: (id) => state.uomById.get(id),
    setUom,
    buildSelectedRows,
    validation,
  };
}
