import { describe, expect, it } from "vitest";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import { matrixKeyFinding, parsePublishedListMatrix, validatePublishedListMatrix } from "./list-matrix-descriptor.js";

const field = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}): EntityFieldDescriptor => ({
  key,
  storagePath: key,
  type,
  required: false,
  writableOn: [],
  ...extra,
});
const reference = (key: string, target: string) => field(key, "reference", { referenceTargetEntity: target, required: true, filterable: true, sortable: true });
const fields = new Map(
  [
    reference("event", "event_header"),
    reference("item", "event_item"),
    reference("bid", "event_bid"),
    field("unit_price", "money"),
    field("evaluated", "money"),
    field("quantity", "decimal"),
    field("delivery", "date"),
    field("unit", "string"),
    field("detail", "json"),
  ].map((entry) => [entry.key, entry]),
);
const declaration = {
  parentField: "event",
  rows: { field: "item", parentField: "event" },
  columns: { field: "bid", parentField: "event", headerFields: ["total"], declined: { field: "status", values: ["declined"] } },
  measures: [
    { field: "evaluated", rank: true, better: "lower", evaluation: true },
    { field: "unit_price", unitField: "unit" },
    { field: "delivery" },
  ],
  absentLabel: "Not quoted",
  rankEligibility: { field: "status", values: ["submitted"] },
  basisLabel: "normalized for unit and quantity",
  columnOrder: [{ field: "items_quoted", direction: "desc" }],
};

describe("published list Matrix", () => {
  it("parses the section 5.1 declaration and validates this Entity's references", () => {
    const matrix = parsePublishedListMatrix(declaration);
    expect(matrix).toMatchObject({ parentField: "event", rows: { field: "item" }, columns: { field: "bid", declined: { values: ["declined"] } } });
    expect(matrix.measures[0]).toEqual({ field: "evaluated", rank: true, better: "lower", evaluation: true });
    expect(() => validatePublishedListMatrix({ matrix, supportedModes: ["table", "matrix"] }, fields)).not.toThrow();
  });

  it("is declared exactly when Matrix is a supported mode", () => {
    const matrix = parsePublishedListMatrix(declaration);
    expect(() => validatePublishedListMatrix({ matrix, supportedModes: ["table"] }, fields)).toThrow(/required exactly when Matrix/);
    expect(() => validatePublishedListMatrix({ supportedModes: ["matrix"] }, fields)).toThrow(/required exactly when Matrix/);
  });

  it("refuses page sizes other than 20 × 5 and unknown properties", () => {
    expect(() => parsePublishedListMatrix({ ...declaration, rows: { ...declaration.rows, pageSize: 50 } })).toThrow(/must be 20/);
    expect(() => parsePublishedListMatrix({ ...declaration, pivot: true })).toThrow(/not a published Matrix property/);
  });

  it("names the section 6 code for each ineligible declaration", () => {
    const check = (patch: Record<string, unknown>) => () =>
      validatePublishedListMatrix({ matrix: parsePublishedListMatrix({ ...declaration, ...patch }), supportedModes: ["matrix"] }, fields);
    expect(check({ rows: { field: "unit", parentField: "event" } })).toThrow(/MATRIX_ROW_FIELD_INELIGIBLE/);
    expect(check({ columns: { field: "quantity", parentField: "event" } })).toThrow(/MATRIX_COLUMN_FIELD_INELIGIBLE/);
    expect(check({ measures: [{ field: "detail" }] })).toThrow(/MATRIX_MEASURE_INELIGIBLE/);
    expect(check({ measures: [{ field: "unit_price", rank: true, better: "lower" }] })).toThrow(/MATRIX_RANK_WITHOUT_EVALUATION/);
    expect(() => parsePublishedListMatrix({ ...declaration, measures: [{ field: "quantity", rank: true }] })).toThrow(/MATRIX_RANK_DIRECTION_REQUIRED/);
    // A decimal ranks without an evaluation amount: it has no currency.
    expect(check({ measures: [{ field: "quantity", rank: true, better: "higher" }] })).not.toThrow();
  });

  it("finds key coverage from the key itself, with no field named in code", () => {
    const uniqueKeys = [["tenant_id", "award_id", "demand_id", "company_code_id"]];
    const base = { rowKey: "demand_id", columnKey: "award_id", pivotDimensions: [], boundDimensions: [], uniqueKeys, tenantColumn: "tenant_id" };
    expect(matrixKeyFinding(base)).toEqual({ code: "MATRIX_KEY_DIMENSION_UNCOVERED", fields: ["company_code_id"] });
    expect(matrixKeyFinding({ ...base, boundDimensions: ["company_code_id"] })).toBeUndefined();
    expect(matrixKeyFinding({ ...base, pivotDimensions: ["company_code_id"] })).toBeUndefined();
    expect(matrixKeyFinding({ ...base, columnKey: "partner_id" })).toEqual({ code: "MATRIX_KEY_NOT_UNIQUE" });
  });
});
