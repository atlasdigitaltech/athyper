import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RuntimeDescriptor } from "../../core/types";
import { MetaEntityListSkeleton } from "../meta-entity-list-skeleton";

const descriptor: RuntimeDescriptor = {
  entityCode: "journal_entry",
  entityName: "Journal Entry",
  routeSlug: "journal_entry",
  source: { tableSchema: "finance", tableName: "journal_entry" },
  capabilities: { canCreate: false },
  operations: [],
  extensions: {
    displayConfig: {
      list_columns: ["code", "name", "status", "total_debit", "total_credit", "secret_note"],
    },
  },
  fields: [
    field("code", "Code", "string", 1),
    field("name", "Name", "string", 2),
    field("status", "Status", "enum", 3),
    field("total_debit", "Total Debit", "decimal", 4),
    field("total_credit", "Total Credit", "decimal", 5),
    { ...field("secret_note", "Secret note", "string", 6), isPii: true },
  ],
};

describe("MetaEntityListSkeleton", () => {
  it("renders a universal table shape without metadata", () => {
    render(<MetaEntityListSkeleton rowCount={2} />);

    const skeleton = screen.getByLabelText("Loading records");
    expect(skeleton).toHaveAttribute("data-skeleton-level", "universal");
    expect(skeleton).toHaveAttribute("data-skeleton-columns", "5");
  });

  it("uses safe compiled descriptor columns and type-specific geometry", () => {
    render(<MetaEntityListSkeleton descriptor={descriptor} rowCount={2} />);

    const skeleton = screen.getByLabelText("Loading Journal Entry records");
    expect(skeleton).toHaveAttribute("data-skeleton-level", "descriptor");
    expect(skeleton).toHaveAttribute("data-skeleton-columns", "5");
    expect(skeleton.querySelectorAll('[data-skeleton-column-type="numeric"]')).toHaveLength(2);
    expect(skeleton.querySelectorAll('[data-skeleton-column-type="status"]')).toHaveLength(1);
    expect(skeleton).not.toHaveTextContent("Secret note");
  });
});

function field(name: string, label: string, dataType: string, order: number) {
  return {
    name,
    label,
    dataType,
    order,
    isVisible: true,
    isSortable: true,
    isFilterable: true,
  };
}
