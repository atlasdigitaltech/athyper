import {
  ENTITY_LIST_MAX_GROUP_LEVELS,
  LIST_AGGREGATE_MAX_DIMENSIONS,
  LIST_AGGREGATE_MAX_MEASURES,
  LIST_AGGREGATE_REQUEST_MEASURES,
} from "@athyper/contract-platform-entity-list";
import {
  entityFieldFilterOperators,
  type EntityFieldAdditivity,
  type EntityFieldDescriptor,
  type EntityListAggregateDescriptor,
  type EntityListViewMode,
} from "@athyper/server-contract-metadata";
import { fail, list, only as layoutOnly, record, text } from "./list-date-range-descriptor.js";

// The published Aggregate (Summary) declaration of a list surface (Entity
// list Aggregate blueprint sections 5.1, 5.2 and 6). Structure is parsed
// here; this Entity's field references, measure types and additivity are
// checked by validatePublishedListAggregate.

type Aggregate = EntityListAggregateDescriptor["measures"][number]["aggregates"][number];
const AGGREGATES: readonly Aggregate[] = ["count", "countDistinct", "sum", "average", "minimum", "maximum"];
const NUMERIC = new Set(["integer", "decimal", "money"]);
const DISTINCT = new Set(["reference", "enum", "string", "boolean"]);
const DIMENSIONS = new Set(["reference", "enum", "string", "boolean", "date", "datetime"]);

function only(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  layoutOnly(value, keys, path, "Summary");
}

/** The measure entry keys a declaration offers: `count`, `field:aggregate`. */
export function aggregateMeasureKeys(aggregate: Pick<EntityListAggregateDescriptor, "measures">): readonly string[] {
  return aggregate.measures.flatMap((measure) =>
    measure.aggregates.map((item) => (item === "count" ? "count" : `${measure.field}:${item}`)),
  );
}

export function parsePublishedListAggregate(raw: unknown): EntityListAggregateDescriptor {
  const root = "listPresentation.aggregate";
  const value = record(raw, root);
  only(value, ["dimensions", "measures", "defaults"], root);
  const dimensions = list(value.dimensions, `${root}.dimensions`).map((item, index) => {
    const at = `${root}.dimensions[${index}]`;
    const entry = record(item, at);
    only(entry, ["field", "buckets", "column"], at);
    const buckets =
      entry.buckets === undefined
        ? undefined
        : list(entry.buckets, `${at}.buckets`).map((bucket, position) => {
            if (bucket !== "month" && bucket !== "quarter") fail(`${at}.buckets[${position}]`, "must be month or quarter");
            return bucket as "month" | "quarter";
          });
    if (buckets && !buckets.length) fail(`${at}.buckets`, "must hold month, quarter or both");
    if (entry.column !== undefined && entry.column !== true) fail(`${at}.column`, "must be true when present");
    return Object.freeze({
      field: text(entry.field, `${at}.field`),
      ...(buckets ? { buckets: Object.freeze([...new Set(buckets)]) } : {}),
      ...(entry.column ? { column: true as const } : {}),
    });
  });
  if (!dimensions.length || dimensions.length > LIST_AGGREGATE_MAX_DIMENSIONS)
    fail(`${root}.dimensions`, `must hold 1 to ${LIST_AGGREGATE_MAX_DIMENSIONS} dimensions`);
  if (new Set(dimensions.map((item) => item.field)).size !== dimensions.length)
    fail(`${root}.dimensions`, "must name each field once");
  const measures = list(value.measures, `${root}.measures`).map((item, index) => {
    const at = `${root}.measures[${index}]`;
    const entry = record(item, at);
    only(entry, ["field", "aggregates", "minimumGroupSize"], at);
    const aggregates = list(entry.aggregates, `${at}.aggregates`).map((aggregate, position) => {
      if (!AGGREGATES.includes(aggregate as Aggregate)) fail(`${at}.aggregates[${position}]`, "is not a Summary aggregate");
      return aggregate as Aggregate;
    });
    if (!aggregates.length || new Set(aggregates).size !== aggregates.length) fail(`${at}.aggregates`, "must hold distinct aggregates");
    const field = entry.field === undefined ? undefined : text(entry.field, `${at}.field`);
    if (field === undefined ? aggregates.join() !== "count" : aggregates.includes("count"))
      fail(at, "the record count is a measure without a field, and a field's measure has no count");
    const floor = entry.minimumGroupSize;
    if (floor !== undefined && (typeof floor !== "number" || !Number.isInteger(floor) || floor < 2 || floor > 100))
      fail(`${at}.minimumGroupSize`, "AGGREGATE_GROUP_SIZE_INVALID: must be an integer from 2 to 100");
    return Object.freeze({
      ...(field ? { field } : {}),
      aggregates: Object.freeze(aggregates),
      ...(floor === undefined ? {} : { minimumGroupSize: floor as number }),
    });
  });
  const keys = aggregateMeasureKeys({ measures });
  if (!keys.length || keys.length > LIST_AGGREGATE_MAX_MEASURES)
    fail(`${root}.measures`, `must offer 1 to ${LIST_AGGREGATE_MAX_MEASURES} measures`);
  if (new Set(keys).size !== keys.length) fail(`${root}.measures`, "must declare each field once");
  const defaults = record(value.defaults, `${root}.defaults`);
  only(defaults, ["rows", "column", "measures"], `${root}.defaults`);
  const rows = list(defaults.rows, `${root}.defaults.rows`).map((item, index) => text(item, `${root}.defaults.rows[${index}]`));
  const shown = list(defaults.measures, `${root}.defaults.measures`).map((item, index) => text(item, `${root}.defaults.measures[${index}]`));
  const declaredRow = (entry: string) => {
    const [field, unit, ...rest] = entry.split(":");
    const dimension = dimensions.find((item) => item.field === field);
    return Boolean(dimension) && !rest.length && (dimension!.buckets ? dimension!.buckets.includes(unit as "month") : unit === undefined);
  };
  if (
    !rows.length ||
    rows.length > ENTITY_LIST_MAX_GROUP_LEVELS ||
    rows.some((entry) => !declaredRow(entry)) ||
    new Set(rows.map((entry) => entry.split(":")[0])).size !== rows.length ||
    !shown.length ||
    shown.length > LIST_AGGREGATE_REQUEST_MEASURES ||
    shown.some((key) => !keys.includes(key))
  )
    fail(`${root}.defaults`, `AGGREGATE_DEFAULTS_INVALID: 1 to ${ENTITY_LIST_MAX_GROUP_LEVELS} declared row entries and 1 to ${LIST_AGGREGATE_REQUEST_MEASURES} declared measures`);
  const column = defaults.column === undefined ? undefined : text(defaults.column, `${root}.defaults.column`);
  if (column !== undefined && !dimensions.some((item) => item.field === column && item.column))
    fail(`${root}.defaults.column`, "AGGREGATE_DEFAULTS_INVALID: must be a dimension declared as a column");
  return Object.freeze({
    dimensions: Object.freeze(dimensions),
    measures: Object.freeze(measures),
    defaults: Object.freeze({ rows: Object.freeze(rows), ...(column ? { column } : {}), measures: Object.freeze(shown) }),
  });
}

/** Parses `field.list.additivity` (section 5.2). Time fields are checked
 * against the Entity's fields by validateFieldAdditivity. */
export function parseFieldAdditivity(raw: unknown, path: string): EntityFieldAdditivity {
  const value = record(raw, path);
  if (value.kind === "additive" || value.kind === "nonAdditive") {
    only(value, ["kind"], path);
    return Object.freeze({ kind: value.kind });
  }
  if (value.kind !== "semiAdditive") fail(`${path}.kind`, "must be additive, semiAdditive or nonAdditive");
  only(value, ["kind", "timeFields"], path);
  const timeFields = list(value.timeFields, `${path}.timeFields`).map((item, index) => text(item, `${path}.timeFields[${index}]`));
  if (!timeFields.length || timeFields.length > 3 || new Set(timeFields).size !== timeFields.length)
    fail(`${path}.timeFields`, "must name 1 to 3 distinct fields");
  return Object.freeze({ kind: "semiAdditive", timeFields: Object.freeze(timeFields) });
}

/** Additivity belongs to number and money fields, a semi-additive field's
 * time fields are other fields of the same Entity, and a field declared
 * non-additive never publishes a sum for grouped Table (decision 8). */
export function validateFieldAdditivity(fields: readonly EntityFieldDescriptor[]): void {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  for (const field of fields) {
    const additivity = field.list?.additivity;
    if (!additivity) continue;
    if (!NUMERIC.has(field.type)) throw new Error(`field.list.additivity is only for number and money fields: ${field.key}`);
    if (additivity.kind === "nonAdditive" && field.list?.aggregations?.includes("sum"))
      throw new Error(`AGGREGATE_SUM_NON_ADDITIVE: field.list.aggregations offers a sum of non-additive ${field.key}`);
    if (additivity.kind === "semiAdditive")
      for (const time of additivity.timeFields)
        if (!byKey.has(time) || time === field.key)
          throw new Error(`field.list.additivity time field must be another field of this Entity: ${field.key}.${time}`);
  }
}

/** Checks this Entity's Summary references (section 6). Summary is declared
 * exactly when it is a supported mode. Dimensions are groupable and
 * filterable so every cell can drill down to its records; measures are of a
 * type their aggregates support; a sum needs declared additivity, never on a
 * non-additive field, and a semi-additive sum's time fields can be grouped or
 * pinned. */
export function validatePublishedListAggregate(
  presentation: {
    readonly aggregate?: EntityListAggregateDescriptor;
    readonly supportedModes?: readonly EntityListViewMode[];
  },
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
): void {
  if ((presentation.supportedModes?.includes("aggregate") === true) !== Boolean(presentation.aggregate))
    throw new Error("listPresentation.aggregate is required exactly when Summary is a supported mode");
  const aggregate = presentation.aggregate;
  if (!aggregate) return;
  const root = "listPresentation.aggregate";
  const operators = (field: EntityFieldDescriptor) => field.list?.filterOperators ?? entityFieldFilterOperators(field.type);
  for (const dimension of aggregate.dimensions) {
    const field = byKey.get(dimension.field);
    const dated = field?.type === "date" || field?.type === "datetime";
    const allowed = field ? operators(field) : [];
    const selectable = dated
      ? allowed.includes("gte") && allowed.includes("lt")
      : allowed.includes("eq");
    if (
      !field ||
      !DIMENSIONS.has(field.type) ||
      field.list?.groupable !== true ||
      !field.filterable ||
      !selectable ||
      (!field.required && !allowed.includes("is_null")) ||
      dated !== Boolean(dimension.buckets) ||
      (field.type === "reference" && !field.referenceTargetEntity)
    )
      throw new Error(
        `${root} AGGREGATE_DIMENSION_INELIGIBLE: ${dimension.field} must be a groupable, filterable reference, choice, boolean or text field, or a date field with buckets`,
      );
  }
  for (const measure of aggregate.measures) {
    if (!measure.field) continue;
    const field = byKey.get(measure.field);
    if (!field) throw new Error(`${root} AGGREGATE_MEASURE_INELIGIBLE: ${measure.field} is not a field of this Entity`);
    for (const item of measure.aggregates) {
      const supported = item === "countDistinct" ? DISTINCT.has(field.type) : NUMERIC.has(field.type);
      if (!supported)
        throw new Error(`${root} AGGREGATE_MEASURE_INELIGIBLE: ${measure.field} does not support ${item}`);
    }
    if (field.type === "money" && !field.list?.currencyField && measure.aggregates.some((item) => item !== "countDistinct"))
      throw new Error(`${root} AGGREGATE_MEASURE_INELIGIBLE: money measure ${measure.field} needs field.list.currencyField`);
    if (!measure.aggregates.includes("sum")) continue;
    const additivity = field.list?.additivity;
    if (!additivity) throw new Error(`${root} AGGREGATE_ADDITIVITY_REQUIRED: ${measure.field} declares no additivity, so it is never summed`);
    if (additivity.kind === "nonAdditive") throw new Error(`${root} AGGREGATE_SUM_NON_ADDITIVE: ${measure.field} is not additive`);
    if (additivity.kind === "semiAdditive")
      for (const time of additivity.timeFields) {
        const timeField = byKey.get(time);
        const declared = aggregate.dimensions.some((item) => item.field === time && !item.buckets);
        if (!declared && !(timeField?.filterable && operators(timeField).includes("eq")))
          throw new Error(`${root} AGGREGATE_SEMI_ADDITIVE_TIME_UNBOUND: ${measure.field} is summed only within one ${time}, which must be a dimension or filterable with eq`);
      }
  }
}
