import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilterControl } from "../filter-control";
import { OrganizePaletteProvider } from "../organize-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Filter workspace scrolling", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        media: "(min-width: 768px)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it("provides independent available and selected filter scroll regions", async () => {
    render(
      <OrganizePaletteProvider>
        <FilterControl
          listBaseHref="/app/invoice"
          rawSearchParams={{}}
          filterableFields={[
            {
              name: "status",
              label: "Status",
              dataType: "text",
              isFilterable: true,
              order: 1,
            },
          ]}
        />
      </OrganizePaletteProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    await screen.findByRole("dialog", { name: "Filter" });

    const available = document.querySelector('[data-runtime-filter-pane="available"]');
    const selected = document.querySelector('[data-runtime-filter-pane="selected"]');
    expect(available).toBeVisible();
    expect(selected).toBeVisible();
    expect(available).not.toBe(selected);
  });
});
