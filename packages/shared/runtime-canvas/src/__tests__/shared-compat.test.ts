import { describe, expect, it } from "vitest";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import { adaptField } from "../adapters";
import { formatFieldValue } from "../format-field-value";
import type { RuntimeRecordRow } from "../types";

const FIELD: MetaEntityField = {
  key: "550e8400-e29b-41d4-a716-446655440000",
  name: "name",
  columnName: "name",
  label: "Name",
  dataType: "text",
  order: 10,
  isRequired: false,
  isUnique: false,
  isSearchable: true,
  isFilterable: true,
  isSortable: true,
  isGroupable: false,
  isAggregatable: false,
  isReadOnly: false,
  isComputed: false,
  isWriteOnce: false,
};

describe("runtime-canvas shared compatibility barrels", () => {
  it("re-exports shared adapters, formatting, and record types", () => {
    const record: RuntimeRecordRow = { id: "record-1", data: { name: "Acme" } };

    expect(adaptField(FIELD).name).toBe("name");
    expect(formatFieldValue(record, FIELD)).toBe("Acme");
  });
});
