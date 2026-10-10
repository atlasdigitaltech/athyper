import { describe, expect, it } from "vitest";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import {
  aggregateMeasureKeys,
  parseFieldAdditivity,
  parsePublishedListAggregate,
  validateFieldAdditivity,
  validatePublishedListAggregate,
} from "./list-aggregate-descriptor.js";

const field = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}): EntityFieldDescriptor => ({
  key,
  storagePath: key,
  type,
  required: true,
  writableOn: [],
  filterable: true,
  ...extra,
});
const dimension = (key: string, type: EntityFieldDescriptor["type"], extra: Partial<EntityFieldDescriptor> = {}) =>
  field(key, type, { list: { groupable: true }, ...extra });
const fields = new Map(
  [
    dimension("gl_account", "reference", { referenceTargetEntity: "gl_account" }),
    dimension("fiscal_year", "integer" as never),
    dimension("period_number", "enum"),
    dimension("posted_on", "date"),
    field("currency_code", "string"),
    field("period_net", "money", { list: { currencyField: "currency_code", additivity: { kind: "additive" } } }),
    field("closing_net", "money", { list: { currencyField: "currency_code", additivity: { kind: "semiAdditive", timeFields: ["period_number"] } } }),
    field("rate", "decimal", { list: { additivity: { kind: "nonAdditive" } } }),
    field("quantity", "decimal"),
    field("approver", "reference", { referenceTargetEntity: "principal" }),
  ].map((entry) => [entry.key, entry]),
);
const declaration = {
  dimensions: [{ field: "gl_account" }, { field: "period_number" }, { field: "posted_on", buckets: ["month", "quarter"] }],
  measures: [
    { aggregates: ["count"] },
    { field: "period_net", aggregates: ["sum", "average"] },
    { field: "closing_net", aggregates: ["sum"], minimumGroupSize: 3 },
    { field: "approver", aggregates: ["countDistinct"] },
  ],
  defaults: { rows: ["gl_account", "period_number"], measures: ["period_net:sum", "closing_net:sum"] },
};

describe("published list Summary (Aggregate blueprint 5.1, 5.2, 6)", () => {
  it("parses the declaration and offers one measure entry per field and aggregate", () => {
    const aggregate = parsePublishedListAggregate(declaration);
    expect(aggregateMeasureKeys(aggregate)).toEqual(["count", "period_net:sum", "period_net:average", "closing_net:sum", "approver:countDistinct"]);
    expect(aggregate.measures[2]).toEqual({ field: "closing_net", aggregates: ["sum"], minimumGroupSize: 3 });
    expect(() => validatePublishedListAggregate({ aggregate, supportedModes: ["table", "aggregate"] }, fields)).not.toThrow();
  });

  it("is declared exactly when Summary is a supported mode", () => {
    expect(() => validatePublishedListAggregate({ supportedModes: ["aggregate"] }, fields)).toThrow(/required exactly when Summary/);
    expect(() => validatePublishedListAggregate({ aggregate: parsePublishedListAggregate(declaration), supportedModes: ["table"] }, fields)).toThrow(/required exactly when Summary/);
  });

  it("refuses malformed declarations and defaults", () => {
    const parse = (patch: Record<string, unknown>) => () => parsePublishedListAggregate({ ...declaration, ...patch });
    expect(parse({ measures: [{ field: "period_net", aggregates: ["count"] }] })).toThrow(/record count is a measure without a field/);
    expect(parse({ measures: [{ aggregates: ["sum"] }] })).toThrow(/record count/);
    expect(parse({ measures: [{ aggregates: ["count"] }, { field: "rate", aggregates: ["median"] }] })).toThrow(/not a Summary aggregate/);
    expect(parse({ measures: [{ aggregates: ["count"], minimumGroupSize: 1 }] })).toThrow(/AGGREGATE_GROUP_SIZE_INVALID/);
    expect(parse({ defaults: { rows: ["posted_on"], measures: ["count"] } })).toThrow(/AGGREGATE_DEFAULTS_INVALID/);
    expect(parse({ defaults: { rows: ["gl_account", "gl_account"], measures: ["count"] } })).toThrow(/AGGREGATE_DEFAULTS_INVALID/);
    expect(parse({ defaults: { rows: ["gl_account"], measures: ["rate:sum"] } })).toThrow(/AGGREGATE_DEFAULTS_INVALID/);
    expect(parse({ defaults: { rows: ["gl_account"], column: "period_number", measures: ["count"] } })).toThrow(/declared as a column/);
    expect(parse({ dimensions: [{ field: "gl_account" }, { field: "gl_account" }] })).toThrow(/each field once/);
  });

  it("reports the section 6 codes for this Entity's references", () => {
    const validate = (patch: Record<string, unknown>) => () =>
      validatePublishedListAggregate(
        { aggregate: parsePublishedListAggregate({ ...declaration, defaults: { rows: ["gl_account"], measures: ["count"] }, ...patch }), supportedModes: ["aggregate"] },
        fields,
      );
    expect(validate({ dimensions: [{ field: "posted_on" }], defaults: { rows: ["posted_on"], measures: ["count"] } })).toThrow(/AGGREGATE_DIMENSION_INELIGIBLE: posted_on/);
    expect(validate({ dimensions: [{ field: "currency_code" }], defaults: { rows: ["currency_code"], measures: ["count"] } })).toThrow(/AGGREGATE_DIMENSION_INELIGIBLE: currency_code/);
    expect(validate({ dimensions: [{ field: "gl_account", buckets: ["month"] }], defaults: { rows: ["gl_account:month"], measures: ["count"] } })).toThrow(/AGGREGATE_DIMENSION_INELIGIBLE/);
    expect(validate({ measures: [{ aggregates: ["count"] }, { field: "quantity", aggregates: ["sum"] }] })).toThrow(/AGGREGATE_ADDITIVITY_REQUIRED: quantity/);
    expect(validate({ measures: [{ aggregates: ["count"] }, { field: "rate", aggregates: ["sum"] }] })).toThrow(/AGGREGATE_SUM_NON_ADDITIVE: rate/);
    expect(validate({ measures: [{ aggregates: ["count"] }, { field: "rate", aggregates: ["average"] }] })).not.toThrow();
    expect(validate({ measures: [{ aggregates: ["count"] }, { field: "period_net", aggregates: ["countDistinct"] }] })).toThrow(/AGGREGATE_MEASURE_INELIGIBLE: period_net does not support countDistinct/);
    expect(validate({ measures: [{ aggregates: ["count"] }, { field: "approver", aggregates: ["sum"] }] })).toThrow(/AGGREGATE_MEASURE_INELIGIBLE: approver does not support sum/);
  });

  it("needs a semi-additive sum's time fields to be grouped or pinned", () => {
    const unbound = new Map(fields);
    unbound.set("period_number", field("period_number", "enum", { filterable: false }));
    const aggregate = parsePublishedListAggregate({
      dimensions: [{ field: "gl_account" }],
      measures: [{ field: "closing_net", aggregates: ["sum"] }],
      defaults: { rows: ["gl_account"], measures: ["closing_net:sum"] },
    });
    expect(() => validatePublishedListAggregate({ aggregate, supportedModes: ["aggregate"] }, unbound)).toThrow(/AGGREGATE_SEMI_ADDITIVE_TIME_UNBOUND: closing_net/);
    // Filterable with eq is enough: the time field can be pinned by a filter.
    expect(() => validatePublishedListAggregate({ aggregate, supportedModes: ["aggregate"] }, fields)).not.toThrow();
  });

  it("parses and checks field additivity", () => {
    expect(parseFieldAdditivity({ kind: "semiAdditive", timeFields: ["fiscal_year", "period_number"] }, "f")).toEqual({ kind: "semiAdditive", timeFields: ["fiscal_year", "period_number"] });
    expect(() => parseFieldAdditivity({ kind: "semiAdditive", timeFields: [] }, "f")).toThrow(/1 to 3 distinct/);
    expect(() => parseFieldAdditivity({ kind: "always" }, "f")).toThrow(/additive, semiAdditive or nonAdditive/);
    expect(() => validateFieldAdditivity([field("code", "string", { list: { additivity: { kind: "additive" } } })])).toThrow(/only for number and money/);
    expect(() => validateFieldAdditivity([field("closing", "money", { list: { additivity: { kind: "semiAdditive", timeFields: ["missing"] } } })])).toThrow(/another field/);
  });
});
