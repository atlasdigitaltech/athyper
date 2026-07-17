import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedColumn } from "../../core/types";
import { RuntimeExcelTableIsland } from "../runtime-excel-table-island";
import { OrganizePaletteProvider } from "../organize/organize-state";

const { setLocalMatchCountMock } = vi.hoisted(() => ({
  setLocalMatchCountMock: vi.fn(),
}));

vi.mock("../runtime-list-context", () => ({
  useRuntimeListSearch: () => ({
    lazyList: {
      enabled: false,
      loadedRows: [],
      pagination: undefined,
    },
    query: "",
    runSearchAll: vi.fn(),
    search: {
      enabled: false,
      fields: [],
      isFullyLoaded: true,
      controls: {
        autoSearchAllOnEmpty: false,
        minQueryLength: 2,
        autoSearchAllDebounceMs: 0,
        queryStabilityMs: 0,
      },
    },
    serverPagination: undefined,
    serverRows: null,
    serverSearch: { state: "idle", query: "" },
    setLocalMatchCount: setLocalMatchCountMock,
  }),
}));

vi.mock("../runtime-bookmark-toggle", () => ({
  useRuntimeBookmarkState: () => ({
    bookmarkedIds: new Set<string>(),
    isPending: false,
    toggle: vi.fn(),
    markRowsAsFavourite: vi.fn(),
    removeRowsFromFavourite: vi.fn(),
  }),
}));

vi.mock("@athyper/query", () => ({
  useCommentCounts: () => ({ counts: {} }),
}));

const STATUS_COLUMN: ResolvedColumn = {
  name: "status",
  label: "Status with a long spreadsheet heading",
  dataType: "text",
  isSortable: true,
  isFilterable: true,
};

describe("RuntimeExcelTableIsland header", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocalMatchCountMock.mockClear();
  });

  it("keeps sort and filter controls adjacent while preserving resize-safe truncation", () => {
    render(
      <OrganizePaletteProvider>
        <RuntimeExcelTableIsland
          entityCode="journal_entry"
          columns={[STATUS_COLUMN]}
          rows={[]}
          density="compact"
          activeSort={[{ key: "status", dir: "asc" }]}
          selectable={false}
          listBaseHref="/app/journal_entry"
          page={1}
          pageSize={20}
          total={324}
          rawSearchParams={{}}
        />
      </OrganizePaletteProvider>,
    );

    const sortLink = screen.getByRole("link", { name: STATUS_COLUMN.label });
    const filterButton = screen.getByRole("button", { name: `Filter by ${STATUS_COLUMN.label}` });
    const headerControls = sortLink.parentElement;

    expect(headerControls).toBe(filterButton.parentElement);
    expect(headerControls).toHaveClass("pr-3", "gap-0.5");
    expect(sortLink).not.toHaveClass("flex-1");
    expect(sortLink.querySelector("span")).toHaveClass("truncate");
    expect(screen.getByRole("button", { name: `Resize ${STATUS_COLUMN.label} column` })).toBeInTheDocument();
  });
});
