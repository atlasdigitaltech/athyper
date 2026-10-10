import type {
  ListAggregateFunction,
  ListAggregateMeasureV1,
  ListAggregateV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListAggregateDescriptor,
  EntityRuntimeDescriptor,
} from "@athyper/server-contract-metadata";
import type { ListRecordsQuery, RecordGroupTotals, RecordListResult } from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

// The Aggregate Layout, shown as Summary (Entity list Aggregate blueprint):
// the per-viewer projection of the published declaration (section 5.3), the
// admission of a Summary request against it (5.4), and the cell rules the
// server applies before any value leaves it: a semi-additive sum is never
// summed across its time fields (8.2), and a group below a measure's floor
// shows no value (9.3).

export const LIST_AGGREGATE_COUNTS_UNAVAILABLE = "LIST_AGGREGATE_COUNTS_UNAVAILABLE";
export const LIST_AGGREGATE_DIMENSION_UNAVAILABLE = "LIST_AGGREGATE_DIMENSION_UNAVAILABLE";
export const LIST_AGGREGATE_MEASURE_UNAVAILABLE = "LIST_AGGREGATE_MEASURE_UNAVAILABLE";

export type ListAggregateResolution =
  | { readonly aggregate: ListAggregateV1 }
  | {
      readonly unavailable:
        | typeof LIST_AGGREGATE_COUNTS_UNAVAILABLE
        | typeof LIST_AGGREGATE_DIMENSION_UNAVAILABLE
        | typeof LIST_AGGREGATE_MEASURE_UNAVAILABLE;
    };

const entryKey = (field: string | undefined, aggregate: ListAggregateFunction) =>
  aggregate === "count" || !field ? "count" : `${field}:${aggregate}`;

/** Resolves the published Summary for one viewer (section 5.3). A masked or
 * unreadable dimension or measure is dropped with the list's single
 * restricted statement, as is a money measure whose currency is unreadable.
 * Without exact counts, a usable dimension or a usable measure, Summary is
 * unavailable with its reason. */
export function resolveListAggregate(input: {
  readonly aggregate: EntityListAggregateDescriptor;
  /** The viewer's listed fields (readable, presentation-compiled). */
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
  readonly technical: ReadonlySet<string>;
  readonly exactCounts: boolean;
}): ListAggregateResolution {
  if (!input.exactCounts) return { unavailable: LIST_AGGREGATE_COUNTS_UNAVAILABLE };
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const declared = new Map(input.entityFields.map((field) => [field.key, field]));
  const usable = (key: string) => {
    const field = listed.get(key);
    return field && field.valueKind !== "uuid" && !input.masked(key) && !input.technical.has(key) ? field : undefined;
  };
  let restricted = false;
  const dimensions = input.aggregate.dimensions.flatMap((dimension) => {
    const field = usable(dimension.field);
    if (!field) {
      restricted = true;
      return [];
    }
    return [
      Object.freeze({
        field: field.key,
        label: field.label,
        ...(dimension.buckets ? { buckets: Object.freeze([...dimension.buckets]) } : {}),
        ...(dimension.column ? { column: true as const } : {}),
      }),
    ];
  });
  if (!dimensions.length) return { unavailable: LIST_AGGREGATE_DIMENSION_UNAVAILABLE };
  const measures: ListAggregateMeasureV1[] = [];
  for (const measure of input.aggregate.measures) {
    if (!measure.field) {
      measures.push(Object.freeze({ key: "count", aggregate: "count" as const }));
      continue;
    }
    const field = usable(measure.field);
    const source = declared.get(measure.field);
    const currencyKey = source?.type === "money" ? source.list?.currencyField : undefined;
    const currency = currencyKey && usable(currencyKey) ? currencyKey : undefined;
    for (const aggregate of measure.aggregates) {
      // A money amount is never shown without its readable currency.
      if (!field || (currencyKey && !currency && aggregate !== "countDistinct")) {
        restricted = true;
        continue;
      }
      const additivity = source?.list?.additivity;
      const timeFields =
        aggregate === "sum" && additivity?.kind === "semiAdditive"
          ? additivity.timeFields.map((key) => ({ key, label: listed.get(key)?.label ?? declared.get(key)?.list?.label ?? key }))
          : undefined;
      measures.push(
        Object.freeze({
          key: entryKey(field.key, aggregate),
          aggregate,
          field: field.key,
          label: field.label,
          valueKind: field.valueKind,
          ...(currency && aggregate !== "countDistinct" ? { currencyField: currency } : {}),
          ...(timeFields ? { timeFields: Object.freeze(timeFields.map((item) => Object.freeze(item))) } : {}),
          ...(measure.minimumGroupSize ? { minimumGroupSize: measure.minimumGroupSize } : {}),
        }),
      );
    }
  }
  if (!measures.length) return { unavailable: LIST_AGGREGATE_MEASURE_UNAVAILABLE };
  const keys = new Set(measures.map((measure) => measure.key));
  const rowUsable = (entry: string) => {
    const [field, unit] = entry.split(":");
    const dimension = dimensions.find((item) => item.field === field);
    return Boolean(dimension) && (dimension!.buckets ? dimension!.buckets.includes(unit as "month") : unit === undefined);
  };
  // Defaults fall back to what remains readable; never to a guessed field.
  const rows = input.aggregate.defaults.rows.filter(rowUsable);
  const shown = input.aggregate.defaults.measures.filter((key) => keys.has(key));
  const firstDimension = dimensions[0]!;
  const column = input.aggregate.defaults.column && dimensions.some((item) => item.field === input.aggregate.defaults.column && item.column) ? input.aggregate.defaults.column : undefined;
  return {
    aggregate: Object.freeze({
      dimensions: Object.freeze(dimensions),
      measures: Object.freeze(measures),
      defaults: Object.freeze({
        rows: Object.freeze(rows.length ? rows : [firstDimension.buckets ? `${firstDimension.field}:${firstDimension.buckets[0]}` : firstDimension.field]),
        ...(column ? { column } : {}),
        measures: Object.freeze(shown.length ? shown : [measures[0]!.key]),
      }),
      ...(restricted ? { fieldsRestricted: true as const } : {}),
    }),
  };
}

/** The server's plan for one admitted Summary request. */
export interface AggregatePlan {
  /** Semi-additive sums by aggregate key: the time fields each must share. */
  readonly semiAdditive: ReadonlyMap<string, readonly string[]>;
  /** Floors by aggregate key (section 9.3). */
  readonly floors: ReadonlyMap<string, number>;
}

const masked = (descriptor: EntityRuntimeDescriptor, key: string) =>
  descriptor.authorization?.fieldPolicies.some((policy) => policy.representation === "masked" && policy.fields.includes(key)) ?? false;

/** Admits a Summary request (`groupTotals`) against the published
 * declaration (section 5.4): the group is a declared dimension at a declared
 * bucket, every aggregate a declared measure, each readable and unmasked for
 * this viewer, and the list publishes exact counts. Anything else is refused,
 * never served from the field-level aggregations a grouped Table uses. */
export function admitAggregateRequest(input: {
  readonly descriptor: EntityRuntimeDescriptor;
  readonly query: ListRecordsQuery;
  readonly readableKeys: ReadonlySet<string>;
}): AggregatePlan | undefined {
  const { descriptor, query } = input;
  if (!query.groupTotals) {
    if (query.groupAggregates?.some((item) => item.aggregate === "countDistinct"))
      throw new RecordServiceError(400, "LIST_GROUP_AGGREGATE_INVALID", "countDistinct belongs to a Summary request");
    return undefined;
  }
  const aggregate = descriptor.listPresentation?.aggregate;
  if (!aggregate || !descriptor.listPresentation?.supportedModes?.includes("aggregate"))
    throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "This list declares no Summary");
  if ((descriptor.listPresentation.limits?.countMode ?? descriptor.listPresentation.countMode) !== "exact")
    throw new RecordServiceError(400, LIST_AGGREGATE_COUNTS_UNAVAILABLE, "A Summary needs exact counts");
  if (!query.groupsOnly || !query.group || query.hierarchy || query.rank)
    throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "A Summary request is groups only, with a group and no hierarchy or rank");
  const usable = (key: string) => input.readableKeys.has(key) && !masked(descriptor, key);
  const dimension = aggregate.dimensions.find((item) => item.field === query.group);
  const unit = query.groupBucket?.unit;
  if (!dimension || (dimension.buckets ? !unit || !dimension.buckets.includes(unit) : unit !== undefined))
    throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", `Not a declared Summary dimension: ${query.group}${unit ? `:${unit}` : ""}`);
  if (!usable(dimension.field))
    throw new RecordServiceError(400, LIST_AGGREGATE_DIMENSION_UNAVAILABLE, "This Summary dimension is not available to the viewer");
  const semiAdditive = new Map<string, readonly string[]>();
  const floors = new Map<string, number>();
  for (const item of query.groupAggregates ?? []) {
    const measure = aggregate.measures.find((entry) => entry.field === item.field && entry.aggregates.includes(item.aggregate));
    if (!measure) throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", `Not a declared Summary measure: ${item.field}:${item.aggregate}`);
    const field = descriptor.fields.find((entry) => entry.key === item.field);
    const currency = field?.type === "money" && item.aggregate !== "countDistinct" ? field.list?.currencyField : undefined;
    if (!usable(item.field) || (currency && !usable(currency)))
      throw new RecordServiceError(400, LIST_AGGREGATE_MEASURE_UNAVAILABLE, "This Summary measure is not available to the viewer");
    const key = `${item.field}:${item.aggregate}`;
    const additivity = field?.list?.additivity;
    if (item.aggregate === "sum") {
      // Publication refuses these; a descriptor that slipped through still
      // never sums a field whose additivity is undeclared or denied.
      if (!additivity || additivity.kind === "nonAdditive")
        throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", `This field is never summed: ${item.field}`);
      if (additivity.kind === "semiAdditive") semiAdditive.set(key, additivity.timeFields);
    }
    if (measure.minimumGroupSize) floors.set(key, measure.minimumGroupSize);
  }
  return Object.freeze({ semiAdditive, floors });
}

/** Applies the cell rules to an admitted Summary result before it leaves the
 * server. A semi-additive sum is valid in a group only when each of its time
 * fields is pinned to one value by an `eq` or `is_null` filter (an ancestor
 * level or a list filter) or is this request's group by value; a date bucket
 * holds many values and never counts. The parent row's sum needs every time
 * field pinned. A group with fewer records than a measure's floor shows no
 * value for that measure. Withheld values are removed, not merely flagged. */
export function applyAggregateRules(
  result: RecordListResult,
  plan: AggregatePlan,
  query: Pick<ListRecordsQuery, "filters" | "group" | "groupBucket">,
): RecordListResult {
  if (!plan.semiAdditive.size && !plan.floors.size) return result;
  const pinned = new Set(
    (query.filters ?? []).filter((filter) => filter.operator === "eq" || filter.operator === "is_null").map((filter) => filter.field),
  );
  const grouped = query.group && !query.groupBucket ? query.group : undefined;
  const withhold = <T extends RecordGroupTotals>(group: T, byGroup: boolean): T => {
    const states: Record<string, "notSummable" | "suppressed"> = {};
    for (const [key, times] of plan.semiAdditive)
      if (!times.every((time) => pinned.has(time) || (byGroup && time === grouped))) states[key] = "notSummable";
    for (const [key, floor] of plan.floors) if (group.count < floor) states[key] = "suppressed";
    const keys = Object.keys(states);
    if (!keys.length) return group;
    const omit = (values: Readonly<Record<string, unknown>> | undefined) =>
      values ? Object.freeze(Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key)))) : undefined;
    const drop = (list: readonly string[] | undefined) => list?.filter((key) => !keys.includes(key));
    const aggregates = omit(group.aggregates) as RecordGroupTotals["aggregates"];
    const currencies = omit(group.aggregateCurrencies) as RecordGroupTotals["aggregateCurrencies"];
    const mixed = drop(group.mixedCurrencies);
    const unknown = drop(group.unknownCurrencies);
    const { aggregates: _a, aggregateCurrencies: _c, mixedCurrencies: _m, unknownCurrencies: _u, ...rest } = group;
    return Object.freeze({
      ...rest,
      ...(aggregates && Object.keys(aggregates).length ? { aggregates } : {}),
      ...(currencies && Object.keys(currencies).length ? { aggregateCurrencies: currencies } : {}),
      ...(mixed?.length ? { mixedCurrencies: Object.freeze(mixed) } : {}),
      ...(unknown?.length ? { unknownCurrencies: Object.freeze(unknown) } : {}),
      states: Object.freeze(states),
    }) as T;
  };
  return Object.freeze({
    ...result,
    ...(result.groups ? { groups: Object.freeze(result.groups.map((group) => withhold(group, true))) } : {}),
    ...(result.parentGroup ? { parentGroup: withhold(result.parentGroup, false) } : {}),
  });
}
