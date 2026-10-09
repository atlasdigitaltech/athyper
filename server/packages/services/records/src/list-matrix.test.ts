import { describe, expect, it } from "vitest";
import { parseListMatrix, type ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityFieldDescriptor, EntityListMatrixDescriptor } from "@athyper/server-contract-metadata";
import {
  LIST_MATRIX_KEY_UNAVAILABLE,
  LIST_MATRIX_MEASURE_UNAVAILABLE,
  LIST_MATRIX_SCOPE_UNBOUND,
  resolveListMatrix,
  type MatrixAxisList,
} from "./list-matrix.js";

const listField = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({
  key,
  label: key.replace(/_/g, " "),
  valueKind,
  defaultVisible: true,
  defaultOrder: 0,
  filterOperators: ["eq", "in"],
  sortable: true,
  groupable: false,
  aggregations: [],
  ...options,
});
const entityField = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}): EntityFieldDescriptor => ({
  key,
  storagePath: key,
  type,
  required: true,
  writableOn: [],
  ...extra,
});
const matrix: EntityListMatrixDescriptor = {
  parentField: "event",
  rows: { field: "item", parentField: "event" },
  columns: { field: "bid", parentField: "event", headerFields: ["total", "row_id"], declined: { field: "status", values: ["declined"] } },
  measures: [
    { field: "evaluated", rank: true, better: "lower", evaluation: true },
    { field: "unit_price", unitField: "unit" },
    { field: "lead_days" },
  ],
  absentLabel: "Not quoted",
  rankEligibility: { field: "status", values: ["submitted"] },
  columnOrder: [{ field: "total", direction: "asc" }],
};
const factFields = [
  listField("event", "reference"),
  listField("item", "reference"),
  listField("bid", "reference"),
  listField("evaluated", "money"),
  listField("currency", "string"),
  listField("unit_price", "money"),
  listField("unit", "string"),
  listField("lead_days", "integer"),
];
const entityFields = [
  entityField("evaluated", "money", { list: { currencyField: "currency" } }),
  entityField("unit_price", "money", { list: { currencyField: "currency" } }),
];
const axis = (entity: string, fields: readonly ListFieldDescriptorV1[], masked: readonly string[] = []): MatrixAxisList => ({
  entity,
  fields,
  identityField: "code",
  searchable: true,
  technical: new Set(["row_id"]),
  masked: (key) => masked.includes(key),
});
const rows = axis("event_item", [listField("code", "string"), listField("name", "string", { semanticRole: "title" }), listField("event", "reference")]);
const columns = axis("event_bid", [listField("code", "string"), listField("event", "reference"), listField("total", "money"), listField("status", "enum"), listField("row_id", "uuid")]);
const resolve = (patch: Partial<Parameters<typeof resolveListMatrix>[0]> = {}) =>
  resolveListMatrix({ matrix, fields: factFields, entityFields, masked: () => false, technical: new Set(), exactCounts: true, axes: { rows, columns }, ...patch });

describe("per-viewer Matrix", () => {
  it("projects readable keys, measures and column states, and the browser contract accepts it", () => {
    const resolution = resolve();
    if (!("matrix" in resolution)) throw new Error(JSON.stringify(resolution));
    const projected = resolution.matrix;
    expect(projected.rows).toMatchObject({ entity: "event_item", identityField: "code", titleField: "name", searchable: true });
    expect(projected.columns.headerFields.map((field) => field.key)).toEqual(["total"]);
    expect(projected.columns).toMatchObject({ declined: { field: "status" }, eligibility: { field: "status", values: ["submitted"] }, order: [{ field: "total", direction: "asc" }] });
    expect(projected.measures[0]).toMatchObject({ key: "evaluated", rank: true, evaluation: true, currencyField: "currency" });
    // A technical identity requested as a header field is dropped, with the one statement.
    expect(projected.fieldsRestricted).toBe(true);
    expect(parseListMatrix(projected, new Map(factFields.map((field) => [field.key, field])))).toEqual(projected);
  });

  it("fails closed when a key or an axis Entity is unreadable", () => {
    expect(resolve({ masked: (key) => key === "bid" })).toEqual({ unavailable: LIST_MATRIX_KEY_UNAVAILABLE });
    expect(resolve({ fields: factFields.filter((field) => field.key !== "event") })).toEqual({ unavailable: LIST_MATRIX_KEY_UNAVAILABLE });
    expect(resolve({ axes: { rows } })).toEqual({ unavailable: LIST_MATRIX_KEY_UNAVAILABLE });
    expect(resolve({ axes: { rows: axis("event_item", rows.fields, ["event"]), columns } })).toEqual({ unavailable: LIST_MATRIX_KEY_UNAVAILABLE });
  });

  it("drops an amount whose currency is unreadable, and is unavailable without a measure", () => {
    const noCurrency = resolve({ masked: (key) => key === "currency" });
    if (!("matrix" in noCurrency)) throw new Error("expected a Matrix");
    expect(noCurrency.matrix.measures.map((measure) => measure.key)).toEqual(["lead_days"]);
    expect(resolve({ masked: (key) => ["evaluated", "unit_price", "lead_days"].includes(key) })).toEqual({ unavailable: LIST_MATRIX_MEASURE_UNAVAILABLE });
  });

  it("needs the parent fixed in a record section", () => {
    expect(resolve({ locked: { recordScoped: true, fields: new Set(["other"]) } })).toEqual({ unavailable: LIST_MATRIX_SCOPE_UNBOUND });
    const locked = resolve({ locked: { recordScoped: true, fields: new Set(["event"]) } });
    expect("matrix" in locked && locked.matrix.parentLocked).toBe(true);
  });
});
