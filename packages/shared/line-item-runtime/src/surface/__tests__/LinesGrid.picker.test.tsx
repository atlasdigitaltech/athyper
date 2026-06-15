import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  SourceAdapterRegistry,
  SourceAdapterRegistryProvider,
} from "@athyper/runtime-add-item";
import { createCatalogAdapter } from "../../adapters";
import { LinesGrid } from "../LinesGrid";
import type { LinesGridProps } from "../../types";

// EmbeddedEntityList (mounted inside the migrated LinesGrid) calls
// useCompiledEntity + useEntityList from @athyper/query. Without the mock
// the underlying useQuery throws because there's no QueryClientProvider
// in scope. Returning empty/null is safe — LinesGrid passes dataOverride
// + columnsOverride, so neither hook's result is actually rendered.
vi.mock("@athyper/query", async () => {
  const actual = await vi.importActual<typeof import("@athyper/query")>("@athyper/query");
  return {
    ...actual,
    useCompiledEntity: vi.fn(() => ({ data: null, isLoading: false })),
    useEntityList: vi.fn(() => ({ data: undefined, isLoading: false })),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// LinesGrid picker integration — end-to-end smoke at the LinesGrid level.
// Mounts LinesGrid with a registry containing the catalog adapter, opens
// the dropdown, clicks the catalog button, asserts the OverlayPicker mounts,
// picks a row, commits, and asserts the line is staged in draftLines with
// the right sourceBinding.
// ─────────────────────────────────────────────────────────────────────────────

const SURFACE = {
  kind: "line_items",
  key: "lines",
  label: "Lines",
  order: 0,
  enabled: true,
  placement: "main",
  affectsTotals: false,
} as unknown as LinesGridProps["surface"];

function MinimalLinesGrid(over: Partial<LinesGridProps> = {}) {
  const onDraftLinesChange = vi.fn();
  const props: LinesGridProps = {
    surface: SURFACE,
    entity: null,
    entityCode: "purchase_invoice",
    recordId: "inv-1",
    lineEntityCode: "purchase_invoice_line",
    currencyCode: "USD",
    record: { id: "inv-1", supplier_id: "sup-1" },
    lines: [],
    distributions: [],
    isLoading: false,
    onRefresh: vi.fn(),
    editMode: true,
    draftMode: true,
    onDraftLinesChange,
    ...over,
  };
  return { props, onDraftLinesChange };
}

function WithRegistry({
  registry,
  children,
}: {
  registry: SourceAdapterRegistry;
  children: ReactNode;
}) {
  return (
    <SourceAdapterRegistryProvider registry={registry}>
      {children}
    </SourceAdapterRegistryProvider>
  );
}

describe("LinesGrid + picker — end-to-end stage", () => {
  it("opens the catalog picker, selects an item, commits, and appends a line carrying sourceBinding", async () => {
    const registry = new SourceAdapterRegistry();
    const catalog = createCatalogAdapter({
      fetchItems: async () => ({
        items: [
          {
            itemId: "cat-1",
            catalogCode: "MAIN",
            itemCode: "PEN",
            itemName: "Pen",
            description: "Blue pen",
            baseUomCode: "EA",
            unitPrice: 2.5,
            currencyCode: "USD",
            isActive: true,
          },
          {
            itemId: "cat-2",
            catalogCode: "MAIN",
            itemCode: "NB",
            itemName: "Notebook",
            description: "A5 notebook",
            baseUomCode: "EA",
            unitPrice: 9.95,
            currencyCode: "USD",
            isActive: true,
          },
        ],
      }),
    });
    registry.register(catalog);

    const { props, onDraftLinesChange } = MinimalLinesGrid();
    render(
      <WithRegistry registry={registry}>
        <LinesGrid {...props} />
      </WithRegistry>,
    );

    // Open the dropdown and click the catalog adapter.
    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add from catalog/i }));

    // Picker mounted; wait for the fetch to populate rows.
    await waitFor(() => {
      expect(screen.getByText("Pen")).toBeInTheDocument();
    });

    // Pick the first row.
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);

    // Set chosen qty (catalog is id_qty_uom — qty input + UOM input render).
    const qtyInputs = screen.getAllByLabelText(/^Quantity for row/i);
    fireEvent.change(qtyInputs[0]!, { target: { value: "5" } });

    // UOM input — default to base UOM "EA".
    const uomInputs = screen.getAllByLabelText(/^UOM for row/i);
    fireEvent.change(uomInputs[0]!, { target: { value: "EA" } });

    // Click Add.
    const addButton = screen.getByRole("button", { name: /^Add\s*(\(\d+\))?$/ });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(onDraftLinesChange).toHaveBeenCalled();
    });

    const lastCallArg = onDraftLinesChange.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(lastCallArg.length).toBe(1);
    const draftedLine = lastCallArg[0]!;
    expect(draftedLine.itemId).toBe("cat-1");
    expect(draftedLine.quantity).toBe(5);
    expect(draftedLine.uomCode).toBe("EA");
    expect(draftedLine.sourceBinding).toMatchObject({
      sourceType: "catalog",
      sourceDocType: "catalog",
      sourceDocId: "MAIN",
      sourceLineId: "cat-1",
    });
  });

  it("Cancel closes the picker without appending lines", async () => {
    const registry = new SourceAdapterRegistry();
    const catalog = createCatalogAdapter({
      fetchItems: async () => ({
        items: [
          {
            itemId: "cat-1",
            catalogCode: "MAIN",
            itemCode: "PEN",
            itemName: "Pen",
            description: "Blue pen",
            baseUomCode: "EA",
            unitPrice: 2.5,
            currencyCode: "USD",
            isActive: true,
          },
        ],
      }),
    });
    registry.register(catalog);

    const { props, onDraftLinesChange } = MinimalLinesGrid();
    render(
      <WithRegistry registry={registry}>
        <LinesGrid {...props} />
      </WithRegistry>,
    );

    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add from catalog/i }));
    await waitFor(() => expect(screen.getByText("Pen")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Cancel$/i })).not.toBeInTheDocument();
    });
    expect(onDraftLinesChange).not.toHaveBeenCalled();
  });
});
