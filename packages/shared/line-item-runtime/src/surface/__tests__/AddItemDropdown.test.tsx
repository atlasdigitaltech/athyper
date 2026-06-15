import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  SourceAdapterRegistry,
  SourceAdapterRegistryProvider,
} from "@athyper/runtime-add-item";
import { createCatalogAdapter, createOpenPoLineAdapter } from "../../adapters";
import { createManualInvoiceLineAdapter } from "../../adapters/manual-invoice-line";
import { AddItemDropdown } from "../AddItemDropdown";

// ─────────────────────────────────────────────────────────────────────────────
// AddItemDropdown — registry-driven listing + legacy fallback. Rendered
// directly (no LinesGrid wrapper) so the assertions stay focused on the
// dropdown's own contract.
// ─────────────────────────────────────────────────────────────────────────────

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

describe("AddItemDropdown — legacy fallback (no registry mounted)", () => {
  it("renders 'Add Item' primary + dropdown with disabled 'Add Catalog Item' placeholder", () => {
    const onAddManual = vi.fn();
    render(<AddItemDropdown onAddManual={onAddManual} />);

    // Primary "Add Item" button.
    const primary = screen.getAllByRole("button", { name: /Add Item/i })[0];
    expect(primary).toBeInTheDocument();

    // Open the dropdown.
    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));

    // Legacy "Add Catalog Item" placeholder, disabled.
    const catalogButton = screen.getByRole("button", { name: /Add Catalog Item/i });
    expect(catalogButton).toBeDisabled();
  });

  it("calls onAddManual when the primary button is clicked", () => {
    const onAddManual = vi.fn();
    render(<AddItemDropdown onAddManual={onAddManual} />);
    const primary = screen.getAllByRole("button", { name: /Add Item/i })[0];
    fireEvent.click(primary!);
    expect(onAddManual).toHaveBeenCalledTimes(1);
  });
});

describe("AddItemDropdown — registry-driven", () => {
  it("lists registry-discovered picker adapters in the dropdown", () => {
    const registry = new SourceAdapterRegistry();
    registry.register(
      createCatalogAdapter({ fetchItems: async () => ({ items: [] }) }),
    );
    registry.register(
      createOpenPoLineAdapter({ fetchLines: async () => ({ items: [] }) }),
    );

    render(
      <WithRegistry registry={registry}>
        <AddItemDropdown onAddManual={() => {}} onPickAdapter={() => {}} />
      </WithRegistry>,
    );
    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));

    expect(screen.getByRole("button", { name: /Add from catalog/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add from open PO lines/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Catalog Item/i })).not.toBeInTheDocument();
  });

  it("hides direct_fill adapters from the dropdown (the primary 'Add Item' button handles them)", () => {
    const registry = new SourceAdapterRegistry();
    registry.register(createManualInvoiceLineAdapter()); // entry: "direct_fill"
    registry.register(
      createCatalogAdapter({ fetchItems: async () => ({ items: [] }) }),
    );

    render(
      <WithRegistry registry={registry}>
        <AddItemDropdown onAddManual={() => {}} onPickAdapter={() => {}} />
      </WithRegistry>,
    );
    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));

    expect(screen.getByRole("button", { name: /Add from catalog/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add line manually/i })).not.toBeInTheDocument();
  });

  it("disables picker-adapter buttons when no onPickAdapter handler is wired", () => {
    const registry = new SourceAdapterRegistry();
    registry.register(
      createCatalogAdapter({ fetchItems: async () => ({ items: [] }) }),
    );

    render(
      <WithRegistry registry={registry}>
        <AddItemDropdown onAddManual={() => {}} />
      </WithRegistry>,
    );
    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));
    const catalog = screen.getByRole("button", { name: /Add from catalog/i });
    expect(catalog).toBeDisabled();
    expect(catalog.getAttribute("title") ?? "").toMatch(/Picker wiring not available/i);
  });

  it("calls onPickAdapter with the chosen adapter when wired", () => {
    const registry = new SourceAdapterRegistry();
    const catalog = createCatalogAdapter({ fetchItems: async () => ({ items: [] }) });
    registry.register(catalog);

    const onPick = vi.fn();
    render(
      <WithRegistry registry={registry}>
        <AddItemDropdown onAddManual={() => {}} onPickAdapter={onPick} />
      </WithRegistry>,
    );
    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add from catalog/i }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]?.manifest.id).toBe("catalog");
  });

  it("dropdown shows only the manual entry when registry is empty", () => {
    const registry = new SourceAdapterRegistry();
    // No adapters registered.

    render(
      <WithRegistry registry={registry}>
        <AddItemDropdown onAddManual={() => {}} onPickAdapter={() => {}} />
      </WithRegistry>,
    );
    fireEvent.click(screen.getByRole("button", { name: /More add options/i }));
    expect(screen.queryByRole("button", { name: /Add from/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Catalog Item/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add Item/i }).length).toBeGreaterThan(0);
  });
});

describe("AddItemDropdown — hideMoreToggle", () => {
  it("hides the chevron when hideMoreToggle is true", () => {
    render(<AddItemDropdown onAddManual={() => {}} hideMoreToggle />);
    expect(screen.queryByRole("button", { name: /More add options/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add Item/i }).length).toBeGreaterThan(0);
  });
});
