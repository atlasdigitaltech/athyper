import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineItemsSelectionBar } from "../line-items-selection-bar";

describe("line-items-selection-bar", () => {
  it("offers View details for one selected line outside edit mode", () => {
    const onViewSelected = vi.fn();
    render(
      <LineItemsSelectionBar
        selectionCount={1}
        editMode={false}
        onClearSelection={() => {}}
        onViewSelected={onViewSelected}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]!);
    expect(onViewSelected).toHaveBeenCalledTimes(1);
  });

  it("offers View accounting for one selected line outside edit mode", () => {
    const onViewAccountingSelected = vi.fn();
    render(
      <LineItemsSelectionBar
        selectionCount={1}
        editMode={false}
        onClearSelection={() => {}}
        onViewAccountingSelected={onViewAccountingSelected}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "View accounting" })[0]!);
    expect(onViewAccountingSelected).toHaveBeenCalledTimes(1);
  });

  it("offers Edit Accounting for one editable selected line", () => {
    const onEditAccountingSelected = vi.fn();
    render(
      <LineItemsSelectionBar
        selectionCount={1}
        editMode
        onClearSelection={() => {}}
        onEditSelected={() => {}}
        onEditAccountingSelected={onEditAccountingSelected}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit Accounting" })[0]!);
    expect(onEditAccountingSelected).toHaveBeenCalledTimes(1);
  });

  it("does not expose Edit Accounting outside edit mode", () => {
    render(
      <LineItemsSelectionBar
        selectionCount={1}
        editMode={false}
        onClearSelection={() => {}}
        onEditAccountingSelected={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit Accounting" })).not.toBeInTheDocument();
  });

  it("launches the requested pricing component from the Add component menu", async () => {
    const onAddComponentSelected = vi.fn();
    render(
      <LineItemsSelectionBar
        selectionCount={1}
        editMode
        onClearSelection={() => {}}
        onAddComponentSelected={onAddComponentSelected}
        onManageComponentsSelected={() => {}}
      />,
    );

    // jsdom renders the responsive mobile sheet alongside the desktop pill;
    // its flattened child action exercises the same callback contract.
    fireEvent.click(screen.getByRole("button", { name: "Add withholding tax" }));
    expect(onAddComponentSelected).toHaveBeenCalledWith("withholding");
  });
});
