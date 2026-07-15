import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrganizePaletteProvider } from "../organize-state";
import { ColumnControl } from "../column-control";
import type { ResolvedColumn } from "../../../core/types";

// ─────────────────────────────────────────────────────────────────────────────
// URL-mode regression — pins that the refactor (extracting ColumnPickerBase
// out of ColumnControl) does NOT change the URL-driven contract production
// list pages depend on.
//
// What this test guards:
//   - Clicking Apply on the drawer calls `router.push` with a serialised
//     URL containing the user's new visible-column set.
//   - When the user's selection matches the descriptor's default columns,
//     the URL writes `columns=null` (clears the override), so future
//     descriptor changes flow through to the user.
// ─────────────────────────────────────────────────────────────────────────────

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

function makeColumn(name: string, label: string): ResolvedColumn {
  return {
    name,
    label,
    dataType:     "text",
    isSortable:   true,
    isFilterable: true,
  } as unknown as ResolvedColumn;
}

const ALL_COLUMNS: ResolvedColumn[] = [
  makeColumn("name", "Name"),
  makeColumn("status", "Status"),
  makeColumn("created_at", "Created At"),
  makeColumn("notes", "Notes"),
];

const DEFAULT_COLUMNS: ResolvedColumn[] = ALL_COLUMNS.slice(0, 3); // name, status, created_at

function renderControl(currentVisible: ResolvedColumn[]) {
  return render(
    <OrganizePaletteProvider>
      <ColumnControl
        columns={currentVisible}
        allColumns={ALL_COLUMNS}
        defaultColumns={DEFAULT_COLUMNS}
        listBaseHref="/app/test_entity"
        rawSearchParams={{}}
        enabled
      />
    </OrganizePaletteProvider>,
  );
}

describe("ColumnControl — URL-mode regression (post-extract)", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("clicking Apply with a non-default selection serialises the visible columns into the URL", () => {
    // Start in the default state, then toggle on `Notes` (hidden by default).
    renderControl(DEFAULT_COLUMNS);

    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("button", { name: "Show Notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url.startsWith("/app/test_entity")).toBe(true);
    // serializeOrganizeState writes the columns URL param (`cols`) with
    // a comma-separated, percent-encoded list of visible names.
    expect(url).toMatch(/cols=name(%2C|,)status(%2C|,)created_at(%2C|,)notes/);
  });

  it("clicking Apply with a back-to-default selection clears the columns URL param", () => {
    // Start with `Notes` already visible, then hide it so the draft matches
    // the descriptor's default columns again.
    const withExtra: ResolvedColumn[] = [...DEFAULT_COLUMNS, makeColumn("notes", "Notes")];
    renderControl(withExtra);

    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide Notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    // The `cols` query param must not appear when the selection matches
    // the descriptor default — that's how the URL stays clean for users
    // who never customised their view.
    expect(url).not.toMatch(/[?&]cols=/);
  });
});
