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

/** Saved Summary state (section 5.6): row dimensions, level 1 first, and
 * the measures shown. The column dimension arrives with A2. */
export interface ListAggregateStateV1 {
  readonly rows: readonly string[];
  readonly measures: readonly string[];
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
  return Object.freeze({
    rows: Object.freeze(rows.length ? rows : fallbackRows),
    measures: Object.freeze(measures.length ? measures : fallbackMeasures),
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
