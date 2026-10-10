import { ENTITY_LIST_MAX_GROUP_LEVELS } from "./types";
import { LIST_GROUP_LIMIT } from "./tree";
import { allowKeys, fail, list, record, text } from "./layout-parse";

// Entity list Aggregate Layout, shown as "Summary" (blueprint
// docs/blueprints/entity-list-aggregate): the per-viewer projection of the
// declared dimensions and measures, the saved state, and the bounds that keep
// one Summary response finite.

/** Dimensions a surface may declare (section 5.1). */
export const LIST_AGGREGATE_MAX_DIMENSIONS = 12;
/** Measure entries (field × aggregate, and the record count) a surface may declare. */
export const LIST_AGGREGATE_MAX_MEASURES = 8;
/** Measures one request may carry: the list operation's `aggregate` limit. */
export const LIST_AGGREGATE_REQUEST_MEASURES = 5;
/** Column values one Summary response may carry (section 7.2; decision 3). */
export const LIST_AGGREGATE_MAX_COLUMNS = 12;
/** Measure values one Summary response may carry (section 7.2). A Summary
 * request reads no record page, so the record page limit does not bound it;
 * this does, checked by the contract test over the caps it multiplies. */
export const LIST_AGGREGATE_MAX_CELLS = 3_600;
/** The largest Summary response the caps allow: 50 groups, No value, Unmapped
 * values, the parent row and the column totals, by 12 column values and the
 * row total, by the measures of one request. Rows and columns multiply. */
export const LIST_AGGREGATE_RESPONSE_CELLS =
  (LIST_GROUP_LIMIT + 4) *
  (LIST_AGGREGATE_MAX_COLUMNS + 1) *
  LIST_AGGREGATE_REQUEST_MEASURES;

export type ListAggregateFunction =
  | "count"
  | "countDistinct"
  | "sum"
  | "average"
  | "minimum"
  | "maximum";
export type ListAggregateBucket = "month" | "quarter";
/** Why a cell shows no value (sections 8.2 and 9.3); always rendered as text. */
export type ListAggregateCellState = "notSummable" | "suppressed";

export const LIST_AGGREGATE_FUNCTIONS: readonly ListAggregateFunction[] =
  Object.freeze(["count", "countDistinct", "sum", "average", "minimum", "maximum"]);

export interface ListAggregateDimensionV1 {
  readonly field: string;
  readonly label: string;
  /** Required for a date field, never on another type. */
  readonly buckets?: readonly ListAggregateBucket[];
  /** May be the column dimension (A2). */
  readonly column?: true;
}

export interface ListAggregateMeasureV1 {
  /** `count` for the record count, otherwise `field:aggregate`. */
  readonly key: string;
  readonly aggregate: ListAggregateFunction;
  /** Absent for the record count. */
  readonly field?: string;
  /** The field's label; absent for the record count. */
  readonly label?: string;
  readonly valueKind?: string;
  /** A money measure's readable currency field. */
  readonly currencyField?: string;
  /** A semi-additive sum: the time fields it is never summed across. */
  readonly timeFields?: readonly { readonly key: string; readonly label: string }[];
  /** Cells over fewer records read "Too few records" (a floor, section 9.3). */
  readonly minimumGroupSize?: number;
}

/** `surface.aggregate`: present only when Summary is supported for this viewer. */
export interface ListAggregateV1 {
  readonly dimensions: readonly ListAggregateDimensionV1[];
  readonly measures: readonly ListAggregateMeasureV1[];
  readonly defaults: {
    readonly rows: readonly string[];
    readonly column?: string;
    readonly measures: readonly string[];
  };
  /** Some declared dimensions or measures are not readable (one statement, no names). */
  readonly fieldsRestricted?: true;
}

/** The chart types a Summary chart may save (the shared chart's types; Chart
 * blueprint 13.3). */
export type ListAggregateChartType = "column" | "bar" | "line" | "groupedColumn" | "stackedColumn" | "pie" | "donut";
export const LIST_AGGREGATE_CHART_TYPES: readonly ListAggregateChartType[] = Object.freeze(["column", "bar", "line", "groupedColumn", "stackedColumn", "pie", "donut"]);
export type ListAggregateChartLabel = "value" | "percentage" | "none";
export const LIST_AGGREGATE_CHART_LABELS: readonly ListAggregateChartLabel[] = Object.freeze(["value", "percentage", "none"]);

/** The Summary's chart (section 13.6): its type, the one measure charted (one
 * of the shown measures) and its data labels. */
export interface ListAggregateChartStateV1 {
  readonly type: ListAggregateChartType;
  readonly measure: string;
  readonly label: ListAggregateChartLabel;
}

/** Top / Bottom N limits (A6): never more than the group cap, so 7.2's cell bound holds. */
export type ListAggregateOrderLimit = 5 | 10 | 20 | 50;
export const LIST_AGGREGATE_ORDER_LIMITS: readonly ListAggregateOrderLimit[] = Object.freeze([5, 10, 20, 50]);

/** Level 1 ordered by a shown measure (A6, section 7.5). */
export interface ListAggregateOrderStateV1 {
  readonly measure: string;
  readonly direction: "asc" | "desc";
  readonly limit: ListAggregateOrderLimit;
  /** Nested Top N (decisions 37–41): N for each expanded level, sent as that
   * expansion's `groupLimit`; absent, expanded levels keep their own order. */
  readonly within?: ListAggregateOrderLimit;
}

/** Saved Summary state (section 5.6): row dimensions, level 1 first, the
 * measures shown, the column dimension (A2), and the chart (A5.3). */
export interface ListAggregateStateV1 {
  readonly rows: readonly string[];
  readonly measures: readonly string[];
  /** A declared column dimension entry (`field` or `field:month|quarter`),
   * or "" for none. Present only when the Summary declares a column
   * dimension, so a chosen "none" survives a round trip. */
  readonly column?: string;
  /** Present when the chart is shown instead of the table. */
  readonly view?: "chart";
  /** The chosen chart; absent until the viewer chooses one. */
  readonly chart?: ListAggregateChartStateV1;
  /** Level 1 ordered by a measure (A6); absent for the dimension's own order. */
  readonly order?: ListAggregateOrderStateV1;
}

/** A column entry this Summary declares: a dimension marked `column`,
 * bucketed exactly as its declaration says. */
export function declaredAggregateColumn(
  aggregate: Pick<ListAggregateV1, "dimensions">,
  entry: string,
): boolean {
  const field = entry.split(":")[0];
  return declaredAggregateRow(aggregate, entry) && aggregate.dimensions.some((item) => item.field === field && item.column);
}

const BUCKETS: readonly ListAggregateBucket[] = ["month", "quarter"];
const AGGREGATE_KEY = /^[a-z][a-z0-9_]*:(countDistinct|sum|average|minimum|maximum)$/;

/** True for a `field:aggregate` key or the record count. */
export function isListAggregateKey(value: string): boolean {
  return value === "count" || AGGREGATE_KEY.test(value);
}

/** A row entry's dimension and bucket: `field` or `field:month|quarter`. */
export function aggregateRowEntry(
  entry: string,
): { readonly field: string; readonly unit?: ListAggregateBucket } {
  const [field, unit] = entry.split(":");
  return {
    field: field!,
    ...(unit === "month" || unit === "quarter" ? { unit } : {}),
  };
}

/** A row entry this Summary declares: a declared dimension, bucketed exactly
 * when its declaration has buckets, by one of them. */
export function declaredAggregateRow(
  aggregate: Pick<ListAggregateV1, "dimensions">,
  entry: string,
): boolean {
  const parts = entry.split(":");
  if (parts.length > 2) return false;
  const dimension = aggregate.dimensions.find((item) => item.field === parts[0]);
  if (!dimension) return false;
  return dimension.buckets
    ? parts.length === 2 && dimension.buckets.includes(parts[1] as ListAggregateBucket)
    : parts.length === 1;
}

/** Normalizes saved or shared Summary state against this viewer's Summary.
 * Undeclared entries are dropped; each field appears once; at most three row
 * levels and five measures; an empty choice falls back to the declared
 * defaults. Display state only, so normalizing it never widens results. */
export function parseListAggregateState(
  raw: unknown,
  aggregate: ListAggregateV1,
): ListAggregateStateV1 {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const rows: string[] = [];
  for (const entry of Array.isArray(value.rows) ? value.rows : []) {
    if (typeof entry !== "string" || !declaredAggregateRow(aggregate, entry)) continue;
    const field = aggregateRowEntry(entry).field;
    if (rows.some((item) => aggregateRowEntry(item).field === field)) continue;
    if (rows.length < ENTITY_LIST_MAX_GROUP_LEVELS) rows.push(entry);
  }
  const declared = new Set(aggregate.measures.map((measure) => measure.key));
  const measures = [
    ...new Set(
      (Array.isArray(value.measures) ? value.measures : []).filter(
        (item): item is string => typeof item === "string" && declared.has(item),
      ),
    ),
  ].slice(0, LIST_AGGREGATE_REQUEST_MEASURES);
  const fallbackRows = aggregate.defaults.rows.filter((entry) =>
    declaredAggregateRow(aggregate, entry),
  );
  const fallbackMeasures = aggregate.defaults.measures.filter((key) =>
    declared.has(key),
  );
  const shownRows = rows.length ? rows : fallbackRows;
  // The column dimension (A2): a declared column entry not used by a row
  // level; "" chooses none; absent state falls back to the declared default.
  const columnOffered = aggregate.dimensions.some((item) => item.column);
  const usable = (entry: string) =>
    declaredAggregateColumn(aggregate, entry) &&
    !shownRows.some((row) => aggregateRowEntry(row).field === aggregateRowEntry(entry).field);
  const defaultColumn = (() => {
    const fallback = aggregate.defaults.column;
    if (!fallback) return "";
    const dimension = aggregate.dimensions.find((item) => item.field === fallback);
    const entry = dimension?.buckets ? `${fallback}:${dimension.buckets[0]}` : fallback;
    return usable(entry) ? entry : "";
  })();
  const column =
    typeof value.column === "string"
      ? value.column === "" || usable(value.column)
        ? value.column
        : defaultColumn
      : defaultColumn;
  const shownMeasures = measures.length ? measures : fallbackMeasures;
  // The chart (A5.3): its measure is one of the shown measures.
  const chartRaw = value.chart && typeof value.chart === "object" && !Array.isArray(value.chart) ? (value.chart as Record<string, unknown>) : undefined;
  const chart = chartRaw
    ? Object.freeze({
        type: LIST_AGGREGATE_CHART_TYPES.includes(chartRaw.type as ListAggregateChartType) ? (chartRaw.type as ListAggregateChartType) : "column",
        measure: typeof chartRaw.measure === "string" && shownMeasures.includes(chartRaw.measure) ? chartRaw.measure : shownMeasures[0]!,
        label: LIST_AGGREGATE_CHART_LABELS.includes(chartRaw.label as ListAggregateChartLabel) ? (chartRaw.label as ListAggregateChartLabel) : "value",
      })
    : undefined;
  // Top / Bottom N (A6): a shown measure (or the record count), a direction
  // and a limit; anything else falls back to the dimension's own order.
  const orderRaw = value.order && typeof value.order === "object" && !Array.isArray(value.order) ? (value.order as Record<string, unknown>) : undefined;
  const order =
    orderRaw &&
    typeof orderRaw.measure === "string" &&
    (orderRaw.measure === "count" || shownMeasures.includes(orderRaw.measure)) &&
    (orderRaw.direction === "asc" || orderRaw.direction === "desc") &&
    LIST_AGGREGATE_ORDER_LIMITS.includes(orderRaw.limit as ListAggregateOrderLimit)
      ? Object.freeze({
          measure: orderRaw.measure,
          direction: orderRaw.direction as "asc" | "desc",
          limit: orderRaw.limit as ListAggregateOrderLimit,
          ...(LIST_AGGREGATE_ORDER_LIMITS.includes(orderRaw.within as ListAggregateOrderLimit) ? { within: orderRaw.within as ListAggregateOrderLimit } : {}),
        })
      : undefined;
  return Object.freeze({
    rows: Object.freeze(shownRows),
    measures: Object.freeze(shownMeasures),
    ...(order ? { order } : {}),
    ...(columnOffered ? { column } : {}),
    ...(value.view === "chart" ? { view: "chart" as const } : {}),
    ...(chart && shownMeasures.length ? { chart } : {}),
  });
}

/** Parses the browser Summary projection against the list's listed fields. */
export function parseListAggregate(
  raw: unknown,
  listed: ReadonlyMap<string, { readonly valueKind: string }>,
): ListAggregateV1 {
  const root = "surface.aggregate";
  const value = record(raw, root);
  allowKeys(value, ["dimensions", "measures", "defaults", "fieldsRestricted"], root, "Summary");
  const dimensions = list(value.dimensions, `${root}.dimensions`).map((item, index) => {
    const at = `${root}.dimensions[${index}]`;
    const entry = record(item, at);
    allowKeys(entry, ["field", "label", "buckets", "column"], at, "Summary dimension");
    const field = text(entry.field, `${at}.field`);
    const kind = listed.get(field)?.valueKind;
    if (!kind) fail(`${at}.field`, "must be a listed field");
    const dated = kind === "date" || kind === "datetime";
    const buckets =
      entry.buckets === undefined
        ? undefined
        : list(entry.buckets, `${at}.buckets`).map((bucket, position) => {
            if (!BUCKETS.includes(bucket as ListAggregateBucket))
              fail(`${at}.buckets[${position}]`, "must be month or quarter");
            return bucket as ListAggregateBucket;
          });
    if (dated !== Boolean(buckets?.length))
      fail(`${at}.buckets`, "are required for a date field and allowed only there");
    if (entry.column !== undefined && entry.column !== true)
      fail(`${at}.column`, "must be true when present");
    return Object.freeze({
      field,
      label: text(entry.label, `${at}.label`),
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
    allowKeys(entry, ["key", "aggregate", "field", "label", "valueKind", "currencyField", "timeFields", "minimumGroupSize"], at, "Summary measure");
    const key = text(entry.key, `${at}.key`);
    const aggregate = entry.aggregate as ListAggregateFunction;
    if (!LIST_AGGREGATE_FUNCTIONS.includes(aggregate)) fail(`${at}.aggregate`, "is not a Summary aggregate");
    if (aggregate === "count") {
      if (key !== "count" || entry.field !== undefined) fail(at, "the record count has key count and no field");
    } else {
      const field = text(entry.field, `${at}.field`);
      if (!listed.has(field)) fail(`${at}.field`, "must be a listed field");
      if (key !== `${field}:${aggregate}`) fail(`${at}.key`, "must be field:aggregate");
    }
    const timeFields =
      entry.timeFields === undefined
        ? undefined
        : list(entry.timeFields, `${at}.timeFields`).map((time, position) => {
            const pair = record(time, `${at}.timeFields[${position}]`);
            allowKeys(pair, ["key", "label"], `${at}.timeFields[${position}]`, "time field");
            return Object.freeze({
              key: text(pair.key, `${at}.timeFields[${position}].key`),
              label: text(pair.label, `${at}.timeFields[${position}].label`),
            });
          });
    if (timeFields && aggregate !== "sum") fail(`${at}.timeFields`, "belong only to a sum");
    const floor = entry.minimumGroupSize;
    if (floor !== undefined && (typeof floor !== "number" || !Number.isInteger(floor) || floor < 2 || floor > 100))
      fail(`${at}.minimumGroupSize`, "must be an integer from 2 to 100");
    return Object.freeze({
      key,
      aggregate,
      ...(aggregate === "count" ? {} : { field: entry.field as string }),
      ...(entry.label === undefined ? {} : { label: text(entry.label, `${at}.label`) }),
      ...(entry.valueKind === undefined ? {} : { valueKind: text(entry.valueKind, `${at}.valueKind`) }),
      ...(entry.currencyField === undefined ? {} : { currencyField: text(entry.currencyField, `${at}.currencyField`) }),
      ...(timeFields?.length ? { timeFields: Object.freeze(timeFields) } : {}),
      ...(floor === undefined ? {} : { minimumGroupSize: floor as number }),
    });
  });
  if (!measures.length || measures.length > LIST_AGGREGATE_MAX_MEASURES)
    fail(`${root}.measures`, `must hold 1 to ${LIST_AGGREGATE_MAX_MEASURES} measures`);
  if (new Set(measures.map((item) => item.key)).size !== measures.length)
    fail(`${root}.measures`, "must name each measure once");
  const defaults = record(value.defaults, `${root}.defaults`);
  allowKeys(defaults, ["rows", "column", "measures"], `${root}.defaults`, "Summary defaults");
  const shape = { dimensions };
  const rows = list(defaults.rows, `${root}.defaults.rows`).map((item, index) => {
    const entry = text(item, `${root}.defaults.rows[${index}]`);
    if (!declaredAggregateRow(shape, entry)) fail(`${root}.defaults.rows[${index}]`, "must be a declared dimension entry");
    return entry;
  });
  if (!rows.length || rows.length > ENTITY_LIST_MAX_GROUP_LEVELS)
    fail(`${root}.defaults.rows`, `must hold 1 to ${ENTITY_LIST_MAX_GROUP_LEVELS} entries`);
  const keys = new Set(measures.map((item) => item.key));
  const shown = list(defaults.measures, `${root}.defaults.measures`).map((item, index) => {
    const key = text(item, `${root}.defaults.measures[${index}]`);
    if (!keys.has(key)) fail(`${root}.defaults.measures[${index}]`, "must be a declared measure");
    return key;
  });
  if (!shown.length || shown.length > LIST_AGGREGATE_REQUEST_MEASURES)
    fail(`${root}.defaults.measures`, `must hold 1 to ${LIST_AGGREGATE_REQUEST_MEASURES} measures`);
  const column =
    defaults.column === undefined ? undefined : text(defaults.column, `${root}.defaults.column`);
  if (column !== undefined && !dimensions.some((item) => item.field === column && item.column))
    fail(`${root}.defaults.column`, "must be a dimension declared as a column");
  if (value.fieldsRestricted !== undefined && value.fieldsRestricted !== true)
    fail(`${root}.fieldsRestricted`, "must be true when present");
  return Object.freeze({
    dimensions: Object.freeze(dimensions),
    measures: Object.freeze(measures),
    defaults: Object.freeze({
      rows: Object.freeze(rows),
      ...(column ? { column } : {}),
      measures: Object.freeze(shown),
    }),
    ...(value.fieldsRestricted ? { fieldsRestricted: true as const } : {}),
  });
}
