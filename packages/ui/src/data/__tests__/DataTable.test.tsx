// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "../DataTable";
import type { ColumnDef } from "../types";

interface TestItem {
  id: string;
  name: string;
  email: string;
}

const mockItems: TestItem[] = [
  { id: "1", name: "Alice Chen", email: "alice@example.com" },
  { id: "2", name: "Bob Wilson", email: "bob@example.com" },
  { id: "3", name: "Carol Davis", email: "carol@example.com" },
];

const mockColumns: ColumnDef<TestItem>[] = [
  { id: "name", header: "Name", accessor: (item) => item.name },
  { id: "email", header: "Email", accessor: (item) => item.email },
];

describe("DataTable", () => {
  it("renders column headers", () => {
    render(
      <DataTable items={mockItems} columns={mockColumns} getKey={(i) => i.id} />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("renders all row data", () => {
    render(
      <DataTable items={mockItems} columns={mockColumns} getKey={(i) => i.id} />,
    );
    expect(screen.getByText("Alice Chen")).toBeInTheDocument();
    expect(screen.getByText("Bob Wilson")).toBeInTheDocument();
    expect(screen.getByText("carol@example.com")).toBeInTheDocument();
  });

  it("shows empty state when items array is empty", () => {
    render(
      <DataTable items={[]} columns={mockColumns} getKey={(i) => i.id} />,
    );
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("calls onRowClick with typed item when row is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable
        items={mockItems}
        columns={mockColumns}
        getKey={(i) => i.id}
        onRowClick={onRowClick}
      />,
    );
    await user.click(screen.getByText("Alice Chen"));
    expect(onRowClick).toHaveBeenCalledWith(mockItems[0]);
  });

  it("hides columns marked as hidden", () => {
    const columnsWithHidden: ColumnDef<TestItem>[] = [
      ...mockColumns,
      { id: "secret", header: "Secret", accessor: () => "hidden", hidden: true },
    ];
    render(
      <DataTable
        items={mockItems}
        columns={columnsWithHidden}
        getKey={(i) => i.id}
      />,
    );
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });

  it("merges custom className on wrapper", () => {
    const { container } = render(
      <DataTable
        items={mockItems}
        columns={mockColumns}
        getKey={(i) => i.id}
        className="my-table"
      />,
    );
    expect(container.firstChild).toHaveClass("my-table");
  });
});
