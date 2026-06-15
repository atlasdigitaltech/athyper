import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModalSelectShell } from "../ModalSelectShell";

describe("ModalSelectShell", () => {
  it("renders required title / grid / confirm slots when open", () => {
    render(
      <ModalSelectShell
        open
        onOpenChange={() => {}}
        title="Select PO lines"
        description="Pick lines to flip into the invoice"
        filters={<div>FILTERS</div>}
        grid={<div>GRID</div>}
        summary={<span>3 selected</span>}
        cancel={<button type="button">Cancel</button>}
        confirm={<button type="button">Add</button>}
      />,
    );
    const surface = document.querySelector('[data-interaction-surface="modal-select"]');
    expect(surface).toBeInTheDocument();
    expect(screen.getByText("Select PO lines")).toBeInTheDocument();
    expect(screen.getByText("Pick lines to flip into the invoice")).toBeInTheDocument();
    expect(surface?.querySelector('[data-surface-slot="filters"]')).toHaveTextContent("FILTERS");
    expect(surface?.querySelector('[data-surface-slot="grid"]')).toHaveTextContent("GRID");
    expect(surface?.querySelector('[data-surface-slot="summary"]')).toHaveTextContent("3 selected");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("omits the filter strip when filters prop is absent", () => {
    render(
      <ModalSelectShell
        open
        onOpenChange={() => {}}
        title="x"
        grid={<div>GRID</div>}
        confirm={<button type="button">Add</button>}
      />,
    );
    expect(document.querySelector('[data-surface-slot="filters"]')).not.toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(
      <ModalSelectShell
        open={false}
        onOpenChange={() => {}}
        title="x"
        grid={<div>GRID</div>}
        confirm={<button type="button">Add</button>}
      />,
    );
    expect(screen.queryByText("GRID")).not.toBeInTheDocument();
  });
});
