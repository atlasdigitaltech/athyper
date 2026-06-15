import { describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSourceAdapterPicker } from "../useSourceAdapterPicker";
import {
  createCatalogAdapter,
  createPoLineAdapter,
  type PoLineWorld,
} from "../../test-harness/synthetic-adapter";

// ─────────────────────────────────────────────────────────────────────────────
// useSourceAdapterPicker — hook contract:
//   • Auto-fetches on open transition
//   • setSearch / setFilters trigger a refetch
//   • toggleRow / setQty / setUom drive selection state
//   • buildSelectedRows merges chosen qty / uom into the picker rows
//   • validation aggregates adapter.validateSelection across selected rows
// ─────────────────────────────────────────────────────────────────────────────

const PARENT_CTX = {
  parentId: "invoice-1",
  currencyCode: "USD",
} as const;

describe("useSourceAdapterPicker — auto-fetch on open", () => {
  it("loads items when open transitions false → true", async () => {
    const adapter = createCatalogAdapter();
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open }),
      { initialProps: { open: false } },
    );
    expect(result.current.page).toBeNull();
    rerender({ open: true });
    await waitFor(() => {
      expect(result.current.page?.items.length).toBeGreaterThan(0);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("resets state when open transitions true → false", async () => {
    const adapter = createCatalogAdapter();
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open }),
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.page?.items.length ?? 0).toBeGreaterThan(0));
    act(() => result.current.toggleRow("item-1"));
    expect(result.current.selectionCount).toBe(1);

    rerender({ open: false });
    expect(result.current.page).toBeNull();
    expect(result.current.selectionCount).toBe(0);
  });

  it("surfaces fetch errors", async () => {
    const adapter = createCatalogAdapter({ failsOnFetch: true });
    const { result } = renderHook(() =>
      useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open: true }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/Synthetic fetch failure/);
  });
});

describe("useSourceAdapterPicker — search + filters trigger refetch", () => {
  it("setSearch re-runs adapter.fetch with the new query.q", async () => {
    const adapter = createCatalogAdapter();
    const spy = vi.spyOn(adapter, "fetch");
    const { result } = renderHook(() =>
      useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open: true }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    act(() => result.current.setSearch("pen"));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]?.[0]).toMatchObject({ q: "pen" });
  });
});

describe("useSourceAdapterPicker — selection + qty/uom", () => {
  it("toggleRow flips selection state", async () => {
    const adapter = createCatalogAdapter();
    const { result } = renderHook(() =>
      useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open: true }),
    );
    await waitFor(() => expect(result.current.page?.items.length).toBeGreaterThan(0));
    act(() => result.current.toggleRow("item-1"));
    expect(result.current.selectionCount).toBe(1);
    act(() => result.current.toggleRow("item-1"));
    expect(result.current.selectionCount).toBe(0);
  });

  it("buildSelectedRows merges chosenQty when adapter requires id_qty", async () => {
    const world: PoLineWorld = {
      remainingQty: new Map([["po-1:line-1", 50]]),
    };
    const adapter = createPoLineAdapter({ world });
    const { result } = renderHook(() =>
      useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open: true }),
    );
    await waitFor(() => expect(result.current.page?.items.length).toBeGreaterThan(0));
    act(() => {
      result.current.toggleRow("line-1");
      result.current.setQty("line-1", 15);
    });
    const rows = result.current.buildSelectedRows();
    expect(rows.length).toBe(1);
    expect(rows[0]?.chosenQty).toBe(15);
  });

  it("validation aggregates per-row adapter.validateSelection issues", async () => {
    const adapter = createCatalogAdapter({
      items: [
        { itemId: "item-bad", description: "Bad", unitPrice: -5 },
        { itemId: "item-good", description: "Good", unitPrice: 10 },
      ],
    });
    const { result } = renderHook(() =>
      useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open: true }),
    );
    await waitFor(() => expect(result.current.page?.items.length).toBe(2));
    act(() => {
      result.current.toggleRow("item-bad");
      result.current.toggleRow("item-good");
    });
    expect(result.current.validation.ok).toBe(false);
    expect(result.current.validation.rowIssues["item-bad"]?.[0]).toMatch(/non-negative/);
    expect(result.current.validation.rowIssues["item-good"]).toBeUndefined();
  });

  it("clearSelection drops all selected rows", async () => {
    const adapter = createCatalogAdapter();
    const { result } = renderHook(() =>
      useSourceAdapterPicker({ adapter, parentCtx: PARENT_CTX, open: true }),
    );
    await waitFor(() => expect(result.current.page?.items.length).toBeGreaterThan(0));
    act(() => {
      result.current.toggleRow("item-1");
      result.current.toggleRow("item-2");
    });
    expect(result.current.selectionCount).toBe(2);
    act(() => result.current.clearSelection());
    expect(result.current.selectionCount).toBe(0);
  });
});
