import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import type { MasterRecord } from "@athyper/api-contracts/records";
import { EmbeddedEntityList } from "../embedded-entity-list";

// ─────────────────────────────────────────────────────────────────────────────
// EmbeddedEntityList smoke test
//
// Pins the wiring contract:
//   - Toolbar slots render where promised (header, primaryAction, footer).
//   - Columns come from the descriptor (resolveListConfig).
//   - Row data flattens MasterRecord.data into the row shape passed to cells.
//   - onRowClick fires with the flattened row.
//   - useEntityList is called with scope.parent_id.
//   - dataOverride bypasses useEntityList AND disables the server query.
//   - columnsOverride replaces descriptor-driven columns wholesale.
//   - Controlled selection delegates to onRowSelectionChange.
// ─────────────────────────────────────────────────────────────────────────────

const { useCompiledEntityMock, useEntityListMock } = vi.hoisted(() => ({
  useCompiledEntityMock: vi.fn(),
  useEntityListMock: vi.fn(),
}));

vi.mock("@athyper/query", async () => {
  const actual = await vi.importActual<typeof import("@athyper/query")>("@athyper/query");
  return {
    ...actual,
    useCompiledEntity: useCompiledEntityMock,
    useEntityList: useEntityListMock,
  };
});

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeField(over: Partial<EntityField> & Pick<EntityField, "name" | "data_type">): EntityField {
  return {
    id: `00000000-0000-0000-0000-${over.name.padEnd(12, "0").slice(0, 12)}`,
    column_name: over.name,
    label: null,
    description: null,
    ui_type: null,
    format: null,
    unit: null,
    cardinality: "scalar",
    origin: "user",
    is_required: false,
    is_readonly: false,
    is_unique: false,
    is_searchable: false,
    is_filterable: true,
    is_sortable: true,
    is_groupable: false,
    is_aggregatable: false,
    is_pii: false,
    is_computed: false,
    default_value: null,
    compute_expr: null,
    validation_rules: null,
    enum_domain_code: null,
    reference_config: null,
    sort_order: 0,
    group_key: null,
    i18n_key: null,
    ...over,
  } as unknown as EntityField;
}

// Three filterable+sortable fields → resolveListConfig picks them all.
const PROCURE_LINE_ENTITY: CompiledEntity = {
  entity_code: "purchase_invoice_line",
  display_config: {} as unknown as CompiledEntity["display_config"],
  fields: [
    makeField({ name: "line_number", label: "#",           data_type: "integer", sort_order: 1 }),
    makeField({ name: "description", label: "Description", data_type: "text",    sort_order: 2 }),
    makeField({ name: "net_amount",  label: "Net Amount",  data_type: "money",   sort_order: 3 }),
  ],
} as unknown as CompiledEntity;

const SAMPLE_RECORDS: MasterRecord[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    tenant_id: "tenant",
    entity_code: "purchase_invoice_line",
    data: { line_number: 1, description: "Consulting Services", net_amount: 600 },
  } as unknown as MasterRecord,
  {
    id: "22222222-2222-2222-2222-222222222222",
    tenant_id: "tenant",
    entity_code: "purchase_invoice_line",
    data: { line_number: 2, description: "Technical Documentation", net_amount: 300 },
  } as unknown as MasterRecord,
];

// ─────────────────────────────────────────────────────────────────────────────

describe("EmbeddedEntityList — smoke", () => {
  beforeEach(() => {
    useCompiledEntityMock.mockReset();
    useEntityListMock.mockReset();
  });

  it("renders toolbar slots, descriptor-driven columns, and flattened row data", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({
      data: { data: SAMPLE_RECORDS, pagination: { total: 2 } },
      isLoading: false,
    });

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        scope={{ parent_id: "inv-42" }}
        slots={{
          header: <span>2 lines</span>,
          primaryAction: <button type="button">Add Item</button>,
          footer: <div>Total: 900</div>,
        }}
      />,
    );

    expect(screen.getByText("2 lines")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Item" })).toBeInTheDocument();
    expect(screen.getByText("Total: 900")).toBeInTheDocument();

    // Descriptor labels become column headers.
    expect(screen.getByRole("columnheader", { name: /Description/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Net Amount/ })).toBeInTheDocument();

    // formatFieldValue stringifies text cleanly — assert by visible text.
    expect(screen.getByText("Consulting Services")).toBeInTheDocument();
    expect(screen.getByText("Technical Documentation")).toBeInTheDocument();
  });

  it("passes scope.parent_id through to useEntityList", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: { data: [], pagination: {} }, isLoading: false });

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        scope={{ parent_id: "inv-42" }}
      />,
    );

    const lastCall = useEntityListMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("purchase_invoice_line");
    expect(lastCall?.[1]).toMatchObject({ parent_id: "inv-42" });
  });

  it("fires onRowClick with the flattened row when a row is clicked", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({
      data: { data: SAMPLE_RECORDS, pagination: { total: 2 } },
      isLoading: false,
    });

    const onRowClick = vi.fn();
    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        onRowClick={onRowClick}
      />,
    );

    const cell = screen.getByText("Consulting Services");
    fireEvent.click(cell);

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]?.[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      line_number: 1,
      description: "Consulting Services",
      net_amount: 600,
    });
  });

  it("dataOverride bypasses useEntityList and renders the provided rows", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        dataOverride={[
          { id: "draft-1", line_number: 99, description: "Local draft row", net_amount: 42 },
        ]}
      />,
    );

    expect(screen.getByText("Local draft row")).toBeInTheDocument();

    const lastCall = useEntityListMock.mock.calls.at(-1);
    expect(lastCall?.[2]).toMatchObject({ enabled: false });
  });

  it("filters rendered rows with the client-side search query", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        clientSearchQuery="svc-100"
        clientSearchKeys={["description", "item_code"]}
        dataOverride={[
          { id: "r1", description: "Consulting Services",       item_code: "SVC-100", net_amount: 600 },
          { id: "r2", description: "Technical Documentation",   item_code: "DOC-200", net_amount: 300 },
          { id: "r3", description: "Office Supplies",           item_code: "SUP-300", net_amount: 100 },
        ]}
      />,
    );

    expect(screen.getByText("Consulting Services")).toBeInTheDocument();
    expect(screen.queryByText("Technical Documentation")).not.toBeInTheDocument();
    expect(screen.queryByText("Office Supplies")).not.toBeInTheDocument();
  });

  it("visibleColumnKeys projects descriptor fields in the caller's order, dropping unknown names", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        // Order intentionally reversed vs descriptor and "ghost" is unknown.
        visibleColumnKeys={["net_amount", "ghost", "description"]}
        dataOverride={[
          { id: "r1", line_number: 1, description: "Consulting Services", net_amount: 600 },
        ]}
      />,
    );

    const headers = screen.getAllByRole("columnheader").slice(1); // drop select-checkbox col
    const headerText = headers.map((h) => h.textContent?.trim() ?? "");
    expect(headerText).toEqual(["Net Amount", "Description"]);
    // "#" (line_number) is omitted from the projection.
    expect(headerText).not.toContain("#");
  });

  it("columnsOverride replaces descriptor-driven columns wholesale", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({
      data: { data: SAMPLE_RECORDS, pagination: { total: 2 } },
      isLoading: false,
    });

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        columnsOverride={[
          {
            accessorKey: "description",
            header: "Item Description",
            enableSorting: false,
            cell: ({ getValue }) => <span>OVERRIDE:{String(getValue() ?? "")}</span>,
          },
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /Item Description/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Net Amount/ })).not.toBeInTheDocument();
    expect(screen.getByText("OVERRIDE:Consulting Services")).toBeInTheDocument();
  });

  it("sorts dataOverride rows client-side when a sortable column header is clicked", () => {
    // Regression for the bug where dataOverride rows ignored sort state.
    // DataTable runs in manualSorting mode (because EmbeddedEntityList passes
    // sortingState + onSortingChange), so without explicit client-side sort
    // here the rows stay in their original order.
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        dataOverride={[
          { id: "r1", description: "Zebra",  net_amount: 100 },
          { id: "r2", description: "Apple",  net_amount: 50  },
          { id: "r3", description: "Mango",  net_amount: 75  },
        ]}
      />,
    );

    function readDescriptions(): string[] {
      const tbody = container.querySelector("tbody");
      if (!tbody) return [];
      return Array.from(tbody.querySelectorAll("tr")).map((tr) =>
        tr.querySelectorAll("td")[2]?.textContent?.trim() ?? "",
      );
    }

    // Initial order = dataOverride order.
    expect(readDescriptions()).toEqual(["Zebra", "Apple", "Mango"]);

    // DataTable wraps sortable headers in a <button>; the <th> itself does
    // not own the click handler. Selecting by role: "button" with the
    // header label finds the actual click target.
    fireEvent.click(screen.getByRole("button", { name: /Description/ }));
    expect(readDescriptions()).toEqual(["Apple", "Mango", "Zebra"]);

    fireEvent.click(screen.getByRole("button", { name: /Description/ }));
    expect(readDescriptions()).toEqual(["Zebra", "Mango", "Apple"]);
  });

  it("sorts numeric fields numerically (not lexicographically)", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    // Use initialSort so we exercise the rows useMemo directly rather than
    // routing through DataTable's header-click handler. The click-driven
    // path is covered by the test above.
    const { container } = render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        initialSort={[{ key: "net_amount", dir: "asc" }]}
        dataOverride={[
          { id: "r1", description: "A", net_amount: 100 },
          { id: "r2", description: "B", net_amount: 25  },
          { id: "r3", description: "C", net_amount: 9   },
        ]}
      />,
    );

    const tbody = container.querySelector("tbody")!;
    const rowOrder = Array.from(tbody.querySelectorAll("tr")).map(
      (tr) => tr.getAttribute("data-row-id") ?? tr.querySelectorAll("td")[2]?.textContent?.trim(),
    );
    // r3 (9), r2 (25), r1 (100) — numeric ascending, NOT lexicographic
    // ("100", "25", "9" would otherwise sort to 100, 25, 9).
    expect(rowOrder).toEqual(["C", "B", "A"]);
  });

  it("nulls sort to the bottom regardless of direction", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    const data = [
      { id: "r1", description: "Apple",  net_amount: 100 },
      { id: "r2", description: null,     net_amount: 50  },
      { id: "r3", description: "Mango",  net_amount: 75  },
    ];

    function readDescriptions(container: HTMLElement): Array<string | null> {
      const tbody = container.querySelector("tbody")!;
      return Array.from(tbody.querySelectorAll("tr")).map(
        (tr) => tr.querySelectorAll("td")[2]?.textContent?.trim() ?? null,
      );
    }

    const ascRender = render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        initialSort={[{ key: "description", dir: "asc" }]}
        dataOverride={data}
      />,
    );
    // Apple, Mango, then the null (rendered as "-")
    expect(readDescriptions(ascRender.container)).toEqual(["Apple", "Mango", "-"]);
    ascRender.unmount();

    const descRender = render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        initialSort={[{ key: "description", dir: "desc" }]}
        dataOverride={data}
      />,
    );
    // Mango, Apple, then null still at the bottom (not at the top).
    expect(readDescriptions(descRender.container)).toEqual(["Mango", "Apple", "-"]);
  });

  it("mobileRows: renders the card branch alongside the table when configured", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    const renderRow = vi.fn(({ row }: { row: Record<string, unknown> }) => (
      <div data-testid="mobile-row">{String(row.description ?? "")}</div>
    ));

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        dataOverride={[
          { id: "r1", description: "Mobile A", net_amount: 100 },
          { id: "r2", description: "Mobile B", net_amount: 200 },
        ]}
        mobileRows={{ renderRow }}
      />,
    );

    // Both branches present in the DOM — Tailwind responsive classes gate
    // visibility at the CSS layer, not in jsdom. Two render targets means
    // both card and table receive the same row set from one source.
    const cards = screen.getAllByTestId("mobile-row");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toBe("Mobile A");

    // renderRow received the full context shape — selection + openRow live.
    const ctx = renderRow.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(ctx).toMatchObject({
      row: { id: "r1", description: "Mobile A", net_amount: 100 },
      selected: false,
    });
    expect(typeof ctx?.setSelected).toBe("function");
    expect(typeof ctx?.openRow).toBe("function");
  });

  it("mobileRows: openRow forwards to onRowClick", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    const onRowClick = vi.fn();
    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        onRowClick={onRowClick}
        dataOverride={[{ id: "r1", description: "Tap me", net_amount: 100 }]}
        mobileRows={{
          renderRow: ({ openRow }) => (
            <button type="button" data-testid="open" onClick={openRow}>
              open
            </button>
          ),
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("open"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]?.[0]).toMatchObject({ id: "r1", description: "Tap me" });
  });

  it("mobileRows: setSelected mutates the controlled selection by stable id", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    const onSelChange = vi.fn();
    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        rowSelection={{}}
        onRowSelectionChange={onSelChange}
        getRowId={(row) => String(row.id)}
        dataOverride={[{ id: "stable-1", description: "X", net_amount: 100 }]}
        mobileRows={{
          renderRow: ({ setSelected }) => (
            <button type="button" data-testid="check" onClick={() => setSelected(true)}>
              check
            </button>
          ),
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("check"));

    expect(onSelChange).toHaveBeenCalled();
    // Functional updater shape — apply against the controlled `{}` value to
    // get the next selection. Stable id from getRowId is the key, not index.
    const updater = onSelChange.mock.calls[0]?.[0] as (s: Record<string, boolean>) => Record<string, boolean>;
    expect(updater({})).toEqual({ "stable-1": true });
  });

  it("mobileRows: empty branch shows a friendly message", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        dataOverride={[]}
        mobileRows={{
          renderRow: () => <div data-testid="mobile-row">should not render</div>,
          emptyMessage: "No lines yet",
        }}
      />,
    );

    expect(screen.queryByTestId("mobile-row")).not.toBeInTheDocument();
    expect(screen.getByText("No lines yet")).toBeInTheDocument();
  });

  it("controlled selection: onRowSelectionChange fires when a row checkbox is clicked", () => {
    useCompiledEntityMock.mockReturnValue({ data: PROCURE_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({
      data: { data: SAMPLE_RECORDS, pagination: { total: 2 } },
      isLoading: false,
    });

    const onSelChange = vi.fn();
    render(
      <EmbeddedEntityList
        entityCode="purchase_invoice_line"
        rowSelection={{}}
        onRowSelectionChange={onSelChange}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(checkboxes[1]!);

    expect(onSelChange).toHaveBeenCalled();
  });
});
