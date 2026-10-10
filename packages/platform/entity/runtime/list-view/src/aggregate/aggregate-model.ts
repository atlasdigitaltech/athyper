import type { EntityListQueryState } from "@athyper/platform-api-client";
import {
  aggregateRowEntry,
  parseListAggregateState,
  type EntityListDescriptorV1,
  type JsonValue,
  type ListAggregateBucket,
  type ListAggregateDimensionV1,
  type ListAggregateMeasureV1,
  type ListAggregateOrderStateV1,
  type ListAggregateStateV1,
  type ListAggregateV1,
  type ListFieldDescriptorV1,
  type ListFilterV1,
  type ListGroupTotalsV1,
  type ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { headingFilters } from "../tree/grouped-tree-model";

// The Summary model (Entity list Aggregate blueprint sections 7, 8 and 11):
// which levels and measures are shown, the one request each level sends, the
// cells the server's totals become, and the filters a drill-down applies.

/** One row level: a declared dimension, bucketed when it is a date. */
export interface SummaryLevel {
  /** The request entry: `field` or `field:month|quarter`. */
  readonly entry: string;
  readonly dimension: ListAggregateDimensionV1;
  readonly field: ListFieldDescriptorV1;
  readonly unit?: ListAggregateBucket;
}

/** The viewer's Summary state, normalized against the published Summary. */
export function summaryState(state: Pick<ListLocationStateV1, "aggregate">, aggregate: ListAggregateV1): ListAggregateStateV1 {
  return parseListAggregateState(state.aggregate, aggregate);
}

/** The levels a state shows, in order; an entry whose field the list no longer
 * lists is dropped with the levels below it, never replaced by a guess. */
export function summaryLevels(
  aggregate: ListAggregateV1,
  descriptor: Pick<EntityListDescriptorV1, "fields">,
  rows: readonly string[],
): readonly SummaryLevel[] {
  const levels: SummaryLevel[] = [];
  for (const entry of rows) {
    const { field: key, unit } = aggregateRowEntry(entry);
    const dimension = aggregate.dimensions.find((item) => item.field === key);
    const field = descriptor.fields.find((item) => item.key === key);
    if (!dimension || !field) break;
    levels.push({ entry, dimension, field, ...(unit ? { unit } : {}) });
  }
  return levels;
}

/** The column level a state shows (A2), or undefined for none. */
export function summaryColumn(
  aggregate: ListAggregateV1,
  descriptor: Pick<EntityListDescriptorV1, "fields">,
  column: string | undefined,
): SummaryLevel | undefined {
  if (!column) return undefined;
  const [level] = summaryLevels(aggregate, descriptor, [column]);
  return level?.dimension.column ? level : undefined;
}

/** The options of the column picker: declared column entries not used by a
 * row level. */
export function columnOptions(aggregate: ListAggregateV1, rows: readonly string[]): readonly { readonly entry: string; readonly dimension: ListAggregateDimensionV1; readonly unit?: ListAggregateBucket }[] {
  const taken = new Set(rows.map((entry) => aggregateRowEntry(entry).field));
  return aggregate.dimensions
    .filter((dimension) => dimension.column && !taken.has(dimension.field))
    .flatMap((dimension) =>
      dimension.buckets
        ? dimension.buckets.map((unit) => ({ entry: `${dimension.field}:${unit}`, dimension, unit }))
        : [{ entry: dimension.field, dimension }],
    );
}

/** One column of a pivoted Summary, with the filters a cell's drill-down adds. */
export interface SummaryColumnValue {
  readonly key: string;
  readonly kind: "value" | "none";
  readonly value: JsonValue;
  readonly label: string;
  readonly filters: readonly ListFilterV1[];
}

export function summaryColumns(
  columns: readonly { readonly value: JsonValue; readonly label: string }[],
  level: SummaryLevel,
  timeZone?: string,
): readonly SummaryColumnValue[] {
  return columns.map((column, index) => {
    const kind = column.value === null || column.value === "" ? ("none" as const) : ("value" as const);
    const filters = headingFilters(level.field, kind === "none" ? { key: "", kind: "none" } : { key: "", kind: "choice", value: column.value }, level.unit, timeZone) ?? [];
    return { key: `${index}`, kind, value: column.value, label: column.label, filters };
  });
}

/** The measures a state shows, in the state's order. */
export function summaryMeasures(aggregate: ListAggregateV1, keys: readonly string[]): readonly ListAggregateMeasureV1[] {
  return keys.flatMap((key) => aggregate.measures.filter((measure) => measure.key === key));
}

/** The options of one level's picker: every declared dimension entry not used
 * by another level (a date offers each declared bucket). */
export function levelOptions(aggregate: ListAggregateV1, rows: readonly string[], level: number): readonly { readonly entry: string; readonly dimension: ListAggregateDimensionV1; readonly unit?: ListAggregateBucket }[] {
  const taken = new Set(rows.filter((_, index) => index !== level).map((entry) => aggregateRowEntry(entry).field));
  return aggregate.dimensions
    .filter((dimension) => !taken.has(dimension.field))
    .flatMap((dimension) =>
      dimension.buckets
        ? dimension.buckets.map((unit) => ({ entry: `${dimension.field}:${unit}`, dimension, unit }))
        : [{ entry: dimension.field, dimension }],
    );
}

/** One level's request (section 7.1): the list's own filters, search and
 * scope, the ancestors' values as filters, this level's group, groups only
 * with the parent total, and the measures other than the record count (the
 * count is every group's own). Reads no record page. */
export function summaryQuery(input: {
  readonly state: ListLocationStateV1;
  readonly level: SummaryLevel;
  readonly filters: readonly ListFilterV1[];
  readonly measures: readonly ListAggregateMeasureV1[];
  readonly identityField: string;
  readonly timeZone?: string;
  /** The column dimension (A2) and, for an expansion, the opening's columns. */
  readonly column?: SummaryLevel;
  readonly columnValues?: readonly JsonValue[];
  /** Top / Bottom N (A6): level 1 only. */
  readonly order?: ListAggregateOrderStateV1;
}): EntityListQueryState {
  const aggregates = input.measures.filter((measure) => measure.aggregate !== "count").map((measure) => measure.key);
  return {
    ...(input.state.standardViewKey ? { standardViewKey: input.state.standardViewKey } : {}),
    ...(input.state.query ? { query: input.state.query } : {}),
    filters: [...input.state.filters, ...input.filters],
    sort: [],
    columns: [input.identityField],
    pageSize: 1,
    group: input.level.entry,
    groupsOnly: true,
    totals: true,
    ...(aggregates.length ? { aggregates } : {}),
    ...((input.level.unit || input.column?.unit) && input.timeZone ? { timeZone: input.timeZone } : {}),
    ...(input.column ? { pivot: input.column.entry } : {}),
    ...(input.column && input.columnValues ? { pivotValues: input.columnValues } : {}),
    ...(input.order ? { groupOrder: { key: input.order.measure, direction: input.order.direction, limit: input.order.limit } } : {}),
  };
}

/** Why a measure cannot order level 1 (A6, section 7.5), from what the
 * opening response already says; the server refuses the same cases.
 * - `notSummable`: a semi-additive sum whose time fields are not each pinned
 *   by an eq or is_null filter or grouped by value at this level;
 * - `mixedCurrency` / `unknownCurrency`: the parent total's currency state,
 *   for the whole level, never for some groups. */
export function orderRefusal(
  measure: ListAggregateMeasureV1,
  level: SummaryLevel,
  filters: readonly ListFilterV1[],
  parent: ListGroupTotalsV1 | undefined,
): "notSummable" | "mixedCurrency" | "unknownCurrency" | undefined {
  if (measure.aggregate === "count") return undefined;
  const pinned = new Set(filters.filter((filter) => filter.operator === "eq" || filter.operator === "is_null").map((filter) => filter.field));
  const own = level.unit ? undefined : level.field.key;
  if (measure.timeFields?.some((time) => !pinned.has(time.key) && time.key !== own)) return "notSummable";
  if (parent?.mixedCurrencies?.includes(measure.key)) return "mixedCurrency";
  if (parent?.unknownCurrencies?.includes(measure.key)) return "unknownCurrency";
  return undefined;
}

/** What a cell shows. Every state that is not a value is text (principle 5). */
export type SummaryCell =
  | { readonly kind: "value"; readonly value: number | string; readonly currency?: string }
  | { readonly kind: "empty" }
  | { readonly kind: "notSummable" }
  | { readonly kind: "suppressed" }
  | { readonly kind: "mixedCurrency" }
  | { readonly kind: "unknownCurrency" };

export function summaryCell(totals: ListGroupTotalsV1, measure: ListAggregateMeasureV1): SummaryCell {
  if (measure.aggregate === "count") return totals.count === undefined ? { kind: "empty" } : { kind: "value", value: totals.count };
  const state = totals.states?.[measure.key];
  if (state) return { kind: state };
  if (totals.mixedCurrencies?.includes(measure.key)) return { kind: "mixedCurrency" };
  if (totals.unknownCurrencies?.includes(measure.key)) return { kind: "unknownCurrency" };
  const value = totals.aggregates?.[measure.key];
  if (value === null || value === undefined) return { kind: "empty" };
  const currency = totals.aggregateCurrencies?.[measure.key];
  return { kind: "value", value, ...(currency ? { currency } : {}) };
}

/** One summary row at one level. */
export interface SummaryRow {
  /** Stable within its parent: the field and raw value, never the label. */
  readonly key: string;
  readonly kind: "value" | "none";
  readonly value: JsonValue;
  /** The server's label (a reference's authorized label). */
  readonly label: string;
  readonly totals: ListGroupTotalsV1;
  /** This row's own filters; ANDed with its ancestors' for its children and drill-down. */
  readonly filters: readonly ListFilterV1[];
}

/** A choice or boolean field's published order (true then false for a
 * boolean), or undefined for a reference or date, which keep the server's
 * order (decision 14). */
export function publishedOrder(field: ListFieldDescriptorV1): readonly JsonValue[] | undefined {
  if (field.valueKind === "boolean") return [true, false];
  return field.filterOptions?.length ? field.filterOptions.map((option) => option.value) : undefined;
}

/** A level's rows, No value last. A choice or boolean dimension follows its
 * published choice order, as grouped Table does, so the grid, its chart and
 * grouped Table agree (decision 14); values outside it follow in the server's
 * order. A reference or date bucket keeps the server's order. Every bucket is
 * a row with its server label; unlike grouped Table, no value is folded into
 * Unmapped values. */
export function summaryRows(
  groups: readonly (ListGroupTotalsV1 & { readonly value: JsonValue; readonly label: string })[],
  level: SummaryLevel,
  timeZone?: string,
  /** The server ranked these groups by a measure (A6): keep its order. */
  ranked = false,
): readonly SummaryRow[] {
  const none = (value: JsonValue) => value === null || value === "";
  const order = level.unit || ranked ? undefined : publishedOrder(level.field);
  const rank = (value: JsonValue) => {
    const index = order?.findIndex((item) => JSON.stringify(item) === JSON.stringify(value)) ?? -1;
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  // A stable sort: values outside the published order keep the server's order.
  const valued = groups.filter((group) => !none(group.value)).map((group, index) => ({ group, index }));
  if (order) valued.sort((a, b) => rank(a.group.value) - rank(b.group.value) || a.index - b.index);
  return [...valued.map((item) => item.group), ...groups.filter((group) => none(group.value))].flatMap((group) => {
    const kind = none(group.value) ? ("none" as const) : ("value" as const);
    const filters = headingFilters(level.field, kind === "none" ? { key: "", kind: "none" } : { key: "", kind: "choice", value: group.value }, level.unit, timeZone);
    if (!filters) return [];
    const { value, label, ...totals } = group;
    return [{ key: JSON.stringify([level.field.key, kind, kind === "none" ? null : value]), kind, value, label, totals, filters }];
  });
}

/** True when two totals agree on the count and every shown measure; an
 * expansion whose parent row differs means the data changed (section 7.4). */
export function sameTotals(a: ListGroupTotalsV1, b: ListGroupTotalsV1, measures: readonly ListAggregateMeasureV1[]): boolean {
  if (a.count !== b.count) return false;
  return measures.every((measure) => JSON.stringify(summaryCell(a, measure)) === JSON.stringify(summaryCell(b, measure)));
}

/** The label of a choice value from the field's published choices, when the
 * field has them; otherwise the server's label. */
export function choiceLabel(field: ListFieldDescriptorV1, value: JsonValue, fallback: string): string {
  const option = field.filterOptions?.find((item) => item.value === value);
  return option?.label ?? fallback;
}
