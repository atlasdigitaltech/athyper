import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizePaletteProvider } from "../organize-state";
import { SavedViewsControl } from "../saved-views-control";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SavedViewsControl ownership and visibility", () => {
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

  it("shows shared views but leaves destructive actions controlled by server ownership flags", async () => {
    const column = {
      name: "code",
      label: "Code",
      dataType: "text",
      isSortable: true,
      isFilterable: true,
    };
    render(
      <OrganizePaletteProvider>
        <SavedViewsControl
          entityCode="invoice"
          savedViews={[
            { id: "mine", name: "My invoices", scope: "private", can_delete: true },
            { id: "team", name: "Team invoices", scope: "shared", is_shared: true, can_delete: false },
          ]}
          activeSavedViewId={null}
          savedViewsApiHref="/api/platform/saved-views/invoice"
          activeSort={[]}
          filterableFields={[]}
          columns={[column]}
          allColumns={[column]}
          defaultColumns={[column]}
          viewMode="list"
          density="compact"
          listBaseHref="/app/invoice"
          rawSearchParams={{}}
          enabled
        />
      </OrganizePaletteProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Saved views" }));
    await screen.findByRole("dialog", { name: "Saved Views" });

    expect(screen.getByText("My invoices")).toBeVisible();
    expect(screen.getByText("Team invoices")).toBeVisible();
    expect(screen.getByText("Shared view")).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete My invoices" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "This view cannot be deleted" })).toBeDisabled();
  });
});
