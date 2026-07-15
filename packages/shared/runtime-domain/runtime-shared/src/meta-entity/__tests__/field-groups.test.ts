import { describe, expect, it } from "vitest";
import type { MetaEntityField, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { buildMetaEntityFieldGroups } from "../field-groups";

describe("buildMetaEntityFieldGroups", () => {
  it("filters only statically hidden fields for the requested surface", () => {
    const descriptor = descriptorWithFields([
      field("name", "Name", "general"),
      field("internal_note", "Internal Note", "general", { visibility: { hideIn: ["edit"] } }),
      field("tax_id", "Tax ID", "security", { visibility: { when: { field: "type", eq: "vendor" } } }),
    ]);

    const groups = buildMetaEntityFieldGroups(descriptor, "edit");

    expect(groups.map((group) => group.key)).toEqual(["general", "security"]);
    expect(groups.find((group) => group.key === "general")?.fields.map((item) => item.name)).toEqual(["name"]);
    expect(groups.find((group) => group.key === "security")?.fields.map((item) => item.name)).toEqual(["tax_id"]);
  });

  it("creates stable fallback groups for fields whose group metadata is missing", () => {
    const descriptor = descriptorWithFields([
      field("name", "Name", "identity"),
      field("description", "Description", undefined, { dataType: "text" }),
    ], []);

    const groups = buildMetaEntityFieldGroups(descriptor, "detail");

    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ["identity", "Identity"],
      ["general", "General"],
    ]);
  });

  it("merges ungrouped fields into an existing general group", () => {
    const descriptor = descriptorWithFields([
      field("document_no", "Document No", "general", { order: 10 }),
      field("description", "Description", undefined, { order: 20 }),
    ], [
      {
        key: "general",
        label: "General",
        order: 10,
        columns: 2,
        pageSpan: "full",
        surface: "all",
        initiallyCollapsed: false,
      },
    ]);

    const groups = buildMetaEntityFieldGroups(descriptor, "create");

    expect(groups.map((group) => group.key)).toEqual(["general"]);
    expect(groups[0]?.fields.map((item) => item.name)).toEqual(["document_no", "description"]);
  });

  it("deduplicates matching group definitions by key", () => {
    const descriptor = descriptorWithFields([
      field("name", "Name", "general"),
    ], [
      {
        key: "general",
        label: "General",
        order: 10,
        columns: 2,
        pageSpan: "full",
        surface: "all",
        initiallyCollapsed: false,
      },
      {
        key: "general",
        label: "Create General",
        order: 5,
        columns: 1,
        pageSpan: "full",
        surface: "create",
        initiallyCollapsed: false,
      },
    ]);

    const groups = buildMetaEntityFieldGroups(descriptor, "create");

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "general",
      label: "Create General",
      columns: 1,
    });
    expect(groups[0]?.fields.map((item) => item.name)).toEqual(["name"]);
  });
});

function descriptorWithFields(
  fields: MetaEntityField[],
  fieldGroups: MetaEntityRuntimeDescriptor["fieldGroups"] = [
    {
      key: "general",
      label: "General",
      order: 10,
      columns: 2,
      pageSpan: "full",
      surface: "all",
      initiallyCollapsed: false,
    },
    {
      key: "security",
      label: "Security",
      order: 20,
      columns: 2,
      pageSpan: "full",
      surface: "all",
      initiallyCollapsed: false,
    },
  ],
): MetaEntityRuntimeDescriptor {
  return {
    fields,
    fieldGroups,
  } as MetaEntityRuntimeDescriptor;
}

function field(
  name: string,
  label: string,
  groupKey?: string,
  overrides: Partial<MetaEntityField> = {},
): MetaEntityField {
  return {
    key: name,
    name,
    columnName: name,
    label,
    dataType: overrides.dataType ?? "text",
    uiType: "text",
    groupKey,
    order: 10,
    isRequired: false,
    isUnique: false,
    isSearchable: false,
    isFilterable: false,
    isSortable: false,
    isGroupable: false,
    isAggregatable: false,
    isReadOnly: false,
    isComputed: false,
    isWriteOnce: false,
    ...overrides,
  } as MetaEntityField;
}
