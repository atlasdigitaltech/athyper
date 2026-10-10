import type { EntityListQueryState } from "@athyper/platform-api-client";
import {
  aggregateRowEntry,
  parseListAggregateState,
  type EntityListDescriptorV1,
  type JsonValue,
  type ListAggregateBucket,
  type ListAggregateDimensionV1,
  type ListAggregateMeasureV1,
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
    ...(input.level.unit && input.timeZone ? { timeZone: input.timeZone } : {}),
  };
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

/** A level's rows, in the server's order with No value last. Every bucket is a
 * row with its server label; unlike grouped Table, no value is folded into
 * Unmapped values, because a reference dimension has no published choice list. */
export function summaryRows(
  groups: readonly (ListGroupTotalsV1 & { readonly value: JsonValue; readonly label: string })[],
  level: SummaryLevel,
  timeZone?: string,
): readonly SummaryRow[] {
  const none = (value: JsonValue) => value === null || value === "";
  return [...groups.filter((group) => !none(group.value)), ...groups.filter((group) => none(group.value))].flatMap((group) => {
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
