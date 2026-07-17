import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RuntimeField } from "../../../core/types";
import { RuntimeColumnFilterButton } from "../../runtime-column-filter-button";
import { FilterControl } from "../filter-control";
import { OrganizePaletteProvider } from "../organize-state";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

const DESCRIPTION_FIELD: RuntimeField = {
  name:         "description",
  label:        "Description",
  dataType:     "text",
  isFilterable: true,
  order:        0,
  filter: {
    kind:      "text",
    operators: ["contains", "eq", "empty", "not_empty"],
  },
};

const ACTIVE_FIELD: RuntimeField = {
  name:         "is_active",
  label:        "Active",
  dataType:     "boolean",
  isFilterable: true,
  order:        1,
  filter: {
    kind:      "boolean",
    operators: ["eq"],
  },
};

const DATE_RANGE_FIELD: RuntimeField = {
  name:      "updated_at",
  label:     "Updated At",
  dataType:  "date",
  isFilterable: true,
  order:     2,
  filter: {
    kind:      "date",
    operators: ["relative", "between"],
  },
};

function renderFilterSurface({
  active = false,
  field = DESCRIPTION_FIELD,
}: {
  active?: boolean;
  field?: RuntimeField;
} = {}) {
  return render(
    <OrganizePaletteProvider>
      <div className="group/header">
        <RuntimeColumnFilterButton
          fieldName={field.name}
          fieldLabel={field.label}
          active={active}
        />
      </div>
      <OrganizePaletteProvider>
        <FilterControl
          filterableFields={[field]}
          listBaseHref="/app/test_entity"
          rawSearchParams={{}}
        />
      </OrganizePaletteProvider>
    </OrganizePaletteProvider>,
  );
}

describe("RuntimeColumnFilterButton", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("opens the canonical filter drawer with the selected field staged and focused", async () => {
    renderFilterSurface();

    const trigger = screen.getByRole("button", { name: "Filter by Description" });
    expect(trigger).toHaveAttribute("data-active", "false");
    expect(trigger).toHaveClass("opacity-0");

    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Filter" })).toBeInTheDocument();
    expect(document.querySelector('[data-runtime-filter-field="description"]')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText("contains...")).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps an active field filter visible and exposes edit semantics", () => {
    renderFilterSurface({ active: true });

    const trigger = screen.getByRole("button", { name: "Edit filter for Description" });
    expect(trigger).toHaveAttribute("data-active", "true");
    expect(trigger).toHaveClass("opacity-100", "text-primary");
  });

  it("focuses a button-based filter editor when opened from its column", async () => {
    renderFilterSurface({ field: ACTIVE_FIELD });

    fireEvent.click(screen.getByRole("button", { name: "Filter by Active" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Any" })).toHaveFocus());
  });

  it("uses user-facing copy instead of metadata implementation language", () => {
    renderFilterSurface({ field: ACTIVE_FIELD });

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(screen.getByText("No filters selected")).toBeInTheDocument();
    expect(screen.getByText("Choose a filter to narrow the results.")).toBeInTheDocument();
    expect(screen.queryByText(/metadata/i)).not.toBeInTheDocument();
  });

  it("keeps the first custom date while replacing a preset on between-only fields", () => {
    renderFilterSurface({ field: DATE_RANGE_FIELD });

    fireEvent.click(screen.getByRole("button", { name: "Filter by Updated At" }));
    fireEvent.click(screen.getByRole("button", { name: "dd/mm/yyyy" }));
    fireEvent.click(screen.getByRole("option", { name: /^This year$/ }));

    fireEvent.click(screen.getByRole("button", { name: /This year/ }));
    const grid = screen.getByRole("grid");
    const selectableDates = Array.from(grid.querySelectorAll<HTMLElement>('[role="gridcell"]'))
      .filter((cell) => cell.getAttribute("aria-disabled") !== "true")
      .filter((cell) => !cell.className.includes("muted"));
    expect(selectableDates.length).toBeGreaterThan(1);
    fireEvent.click(selectableDates[0]!);
    const dateTrigger = screen.getAllByRole("button", { expanded: true })
      .find((button) => button.getAttribute("aria-haspopup") === "dialog" && button.textContent?.includes("…"));
    expect(dateTrigger).toBeTruthy();
    expect(dateTrigger).not.toHaveTextContent("This year");

    fireEvent.click(selectableDates[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(pushMock.mock.calls[0]?.[0] ?? "")).toContain("between:");
  });
});
