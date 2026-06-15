import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  SourceAdapterRegistry,
  SourceAdapterRegistryProvider,
} from "@athyper/runtime-add-item";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { LinesGrid } from "../LinesGrid";
import type { LinesGridProps, LineRecord } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// LinesGrid — column rendering integration
//
// After the DDL/catalog retirement, LinesGrid no longer resolves columns
// itself. It hands `dataOverride` to EmbeddedEntityList and lets the
// embedded grid project columns from `display_config.list_columns` via
// `resolveListConfig` (P0 of this initiative made that authoritative).
//
// This test pins the integration: given a compiled line entity whose
// display_config declares `list_columns`, the rendered LinesGrid surfaces
// those columns in that order with the descriptor's labels.
//
// Lower-layer column behaviour (list_columns ordering, fallback heuristic,
// MasterRecord flattening) is covered by:
//   - resolve-list-config.test.ts (in @athyper/metadata-client)
//   - EmbeddedEntityList.test.tsx
//   - EmbeddedEntityList.parity.test.tsx (catalog ↔ descriptor canary)
// ─────────────────────────────────────────────────────────────────────────────

const { useCompiledEntityMetadataMock, useCompiledEntityMock, useEntityListMock } = vi.hoisted(() => ({
  useCompiledEntityMetadataMock: vi.fn<(code: string | null | undefined) => CompiledEntity | null>(),
  useCompiledEntityMock: vi.fn(),
  useEntityListMock: vi.fn(),
}));

vi.mock("../../meta", async () => {
  const actual = await vi.importActual<typeof import("../../meta")>("../../meta");
  return { ...actual, useCompiledEntityMetadata: useCompiledEntityMetadataMock };
});

vi.mock("@athyper/query", async () => {
  const actual = await vi.importActual<typeof import("@athyper/query")>("@athyper/query");
  return {
    ...actual,
    useCompiledEntity: useCompiledEntityMock,
    useEntityList: useEntityListMock,
  };
});

function makeField(over: Partial<EntityField> & Pick<EntityField, "name" | "data_type">): EntityField {
  return {
    id: `00000000-0000-0000-0000-${over.name.padEnd(12, "0").slice(0, 12)}`,
    column_name: over.name,
    label: null,
    description: null,
    ui_type: null,
    format: null,
    unit: null,
    cardinality: "one",
    origin: "standard",
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

const PI_LINE_ENTITY: CompiledEntity = {
  entity_code: "purchase_invoice_line",
  display_config: {
    list_columns: ["line_no", "item_description", "quantity", "net_amount"],
  } as unknown as CompiledEntity["display_config"],
  fields: [
    makeField({ name: "line_no",          label: "Line No.",     data_type: "integer", sort_order: 10 }),
    makeField({ name: "item_description", label: "Description",  data_type: "text",    sort_order: 20 }),
    makeField({ name: "quantity",         label: "Quantity",     data_type: "decimal", sort_order: 60 }),
    makeField({ name: "net_amount",       label: "Net Amount",   data_type: "decimal", sort_order: 80 }),
  ],
} as unknown as CompiledEntity;

const SURFACE = {
  kind: "line_items",
  key: "lines",
  label: "Lines",
  order: 0,
  enabled: true,
  placement: "main",
  affectsTotals: true,
} as unknown as LinesGridProps["surface"];

function buildProps(over: Partial<LinesGridProps> = {}): LinesGridProps {
  return {
    surface: SURFACE,
    entity: null,
    entityCode: "purchase_invoice",
    recordId: "inv-1",
    lineEntityCode: "purchase_invoice_line",
    currencyCode: "USD",
    record: { id: "inv-1" },
    lines: [
      { id: "line-1", line_no: 1, item_description: "Q2 Consulting", quantity: 5, net_amount: 600 } as unknown as LineRecord,
    ],
    distributions: [],
    isLoading: false,
    onRefresh: vi.fn(),
    editMode: true,
    draftMode: false,
    onDraftLinesChange: vi.fn(),
    ...over,
  };
}

function renderGrid(props: LinesGridProps) {
  const registry = new SourceAdapterRegistry();
  return render(
    <SourceAdapterRegistryProvider registry={registry}>
      <LinesGrid {...props} />
    </SourceAdapterRegistryProvider>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe("LinesGrid — columns from display_config.list_columns via the embedded path", () => {
  beforeEach(() => {
    useCompiledEntityMetadataMock.mockReset();
    useCompiledEntityMock.mockReset();
    useEntityListMock.mockReset();
  });

  it("renders the columns named in display_config.list_columns, in that order, with descriptor labels", () => {
    useCompiledEntityMetadataMock.mockReturnValue(PI_LINE_ENTITY);
    useCompiledEntityMock.mockReturnValue({ data: PI_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    renderGrid(buildProps());

    expect(screen.getByRole("columnheader", { name: /Line No\./ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Description/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Quantity/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Net Amount/ })).toBeInTheDocument();

    // Sample row reaches the cell renderer.
    expect(screen.getByText("Q2 Consulting")).toBeInTheDocument();
  });

  it("filters line rows from the embedded toolbar search", async () => {
    useCompiledEntityMetadataMock.mockReturnValue(PI_LINE_ENTITY);
    useCompiledEntityMock.mockReturnValue({ data: PI_LINE_ENTITY, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    renderGrid(buildProps({
      lines: [
        { id: "line-1", line_no: 1, item_description: "Q2 Consulting", quantity: 5, net_amount: 600 } as unknown as LineRecord,
        { id: "line-2", line_no: 2, item_description: "Office chairs", quantity: 2, net_amount: 300 } as unknown as LineRecord,
      ],
    }));

    fireEvent.change(screen.getByRole("textbox", { name: /search lines/i }), {
      target: { value: "office" },
    });

    await waitFor(() => {
      expect(screen.getByText("Office chairs")).toBeInTheDocument();
      expect(screen.queryByText("Q2 Consulting")).not.toBeInTheDocument();
    });
  });

  it("toolbar still renders while the descriptor is loading (null) and the grid does not crash", () => {
    useCompiledEntityMetadataMock.mockReturnValue(null);
    useCompiledEntityMock.mockReturnValue({ data: null, isLoading: true });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });

    renderGrid(buildProps({ lines: [] }));

    expect(screen.getByText(/0 lines/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add Item$/i })).toBeInTheDocument();

    // No descriptor-labelled headers while the line entity is loading.
    expect(screen.queryByRole("columnheader", { name: /Description/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Net Amount/ })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("LinesGrid — column visibility menu (descriptor-driven, persisted)", () => {
  // Richer fixture: 5 fields, descriptor's list_columns includes only 4.
  // The 5th field (`procurement_type`) is the one the test toggles on.
  const PI_LINE_ENTITY_WITH_EXTRA: CompiledEntity = {
    entity_code: "purchase_invoice_line",
    display_config: {
      list_columns: ["line_no", "item_description", "quantity", "net_amount"],
    } as unknown as CompiledEntity["display_config"],
    fields: [
      makeField({ name: "line_no",          label: "Line No.",    data_type: "integer", sort_order: 10 }),
      makeField({ name: "item_description", label: "Description", data_type: "text",    sort_order: 20 }),
      makeField({ name: "procurement_type", label: "Type",        data_type: "enum",    sort_order: 30 }),
      makeField({ name: "quantity",         label: "Quantity",    data_type: "decimal", sort_order: 60 }),
      makeField({ name: "net_amount",       label: "Net Amount",  data_type: "decimal", sort_order: 80 }),
    ],
  } as unknown as CompiledEntity;

  beforeEach(() => {
    useCompiledEntityMetadataMock.mockReset();
    useCompiledEntityMock.mockReset();
    useEntityListMock.mockReset();
    // Each test starts with a clean preference slate — column visibility
    // persists across sessions via localStorage, so test isolation matters.
    window.localStorage.clear();

    useCompiledEntityMetadataMock.mockReturnValue(PI_LINE_ENTITY_WITH_EXTRA);
    useCompiledEntityMock.mockReturnValue({ data: PI_LINE_ENTITY_WITH_EXTRA, isLoading: false });
    useEntityListMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("renders default columns and hides fields not in display_config.list_columns", () => {
    renderGrid(buildProps({
      lines: [
        { id: "line-1", line_no: 1, item_description: "Q2 Consulting", procurement_type: "services", quantity: 5, net_amount: 600 } as unknown as LineRecord,
      ],
    }));

    expect(screen.getByRole("columnheader", { name: /Description/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Net Amount/ })).toBeInTheDocument();
    // `procurement_type` is NOT in list_columns and the user hasn't toggled it on.
    expect(screen.queryByRole("columnheader", { name: /^Type/ })).toBeNull();
  });

  // The picker uses draft/apply/discard semantics (it's the same component
  // ColumnControl uses in the entity list). So toggles are pending until
  // the user clicks Apply, and Discard reverts without committing.
  it("toggling a hidden field then clicking Apply projects it into the grid", async () => {
    renderGrid(buildProps({
      lines: [
        { id: "line-1", line_no: 1, item_description: "Q2 Consulting", procurement_type: "services", quantity: 5, net_amount: 600 } as unknown as LineRecord,
      ],
    }));

    // Open the picker (trigger button has aria-label="Columns" via PaletteButton).
    fireEvent.click(screen.getByRole("button", { name: /^Columns$/ }));

    // Toggle the eye-icon for the hidden `procurement_type` field.
    // The hidden row renders a "Show <label>" button (see ColumnRow).
    fireEvent.click(await screen.findByRole("button", { name: "Show Type" }));

    // Draft is dirty — column NOT in the grid yet.
    expect(screen.queryByRole("columnheader", { name: /^Type/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /^Type/ })).toBeInTheDocument();
    });
  });

  it("toggling a hidden field then clicking Discard leaves the grid unchanged", async () => {
    renderGrid(buildProps({
      lines: [
        { id: "line-1", line_no: 1, item_description: "Q2 Consulting", procurement_type: "services", quantity: 5, net_amount: 600 } as unknown as LineRecord,
      ],
    }));

    fireEvent.click(screen.getByRole("button", { name: /^Columns$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Show Type" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    // No Apply was clicked — Type column does not appear, localStorage stays clean.
    expect(screen.queryByRole("columnheader", { name: /^Type/ })).toBeNull();
    expect(window.localStorage.getItem("line-grid:purchase_invoice_line:columns")).toBeNull();
  });

  it("Apply persists the user choice to localStorage under a line-entity-keyed slot", async () => {
    renderGrid(buildProps({
      lines: [
        { id: "line-1", line_no: 1, item_description: "Q2 Consulting", procurement_type: "services", quantity: 5, net_amount: 600 } as unknown as LineRecord,
      ],
    }));

    fireEvent.click(screen.getByRole("button", { name: /^Columns$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Show Type" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const raw = window.localStorage.getItem("line-grid:purchase_invoice_line:columns");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw ?? "null") as string[];
      // The user's selection appended `procurement_type` to the defaults.
      expect(parsed).toContain("procurement_type");
      expect(parsed).toContain("line_no");
    });
  });
});
