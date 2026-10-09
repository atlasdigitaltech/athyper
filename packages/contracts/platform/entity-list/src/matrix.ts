import { allowKeys, fail, list, record, text } from "./layout-parse";

// Entity list Matrix Layout (blueprint docs/blueprints/entity-list-matrix):
// the per-viewer projection of a pivot over a fact Entity, rows × columns ×
// measures, and its fixed page sizes.

/** Rows per page (section 14, decision 2). */
export const MATRIX_ROWS_PER_PAGE = 20;
/** Columns per page (section 14, decision 2). rows × columns ≤ the 100-row page. */
export const MATRIX_COLUMNS_PER_PAGE = 5;
/** The list operation's page maximum (`MAX_LIST_PAGE_SIZE`): one cell block
 * is one page, so rows × columns may not exceed it (section 7). */
export const MATRIX_BLOCK_LIMIT = 100;
/** Measures per Matrix (section 5.1). */
export const MATRIX_MAX_MEASURES = 6;
/** Extra key dimensions a Matrix may declare (section 5.1). */
export const MATRIX_MAX_PIVOT_DIMENSIONS = 4;

export interface ListMatrixAxisV1 {
  /** The fact field referencing this axis' master Entity. */
  readonly field: string;
  readonly label: string;
  readonly entity: string;
  /** The master Entity's reference to the common parent. */
  readonly parentField: string;
  readonly identityField: string;
  readonly titleField?: string;
}

export interface ListMatrixMeasureV1 {
  readonly key: string;
  readonly label: string;
  readonly valueKind: string;
  readonly rank?: true;
  readonly better?: "lower" | "higher";
  readonly evaluation?: true;
  readonly unitField?: string;
  readonly currencyField?: string;
}

/** `surface.matrix`: present only when Matrix is supported for this viewer. */
export interface ListMatrixV1 {
  /** The fact's reference to the common parent; one value is required (section 5.4). */
  readonly parentField: string;
  readonly parentLabel: string;
  /** The list's locked record scope fixes the parent. */
  readonly parentLocked?: true;
  readonly rows: ListMatrixAxisV1 & { readonly searchable: boolean };
  readonly columns: ListMatrixAxisV1 & {
    readonly headerFields: readonly { readonly key: string; readonly label: string; readonly valueKind: string }[];
    readonly declined?: { readonly field: string; readonly values: readonly string[] };
    readonly eligibility?: { readonly field: string; readonly values: readonly string[] };
    readonly order: readonly { readonly field: string; readonly direction: "asc" | "desc" }[];
  };
  readonly measures: readonly ListMatrixMeasureV1[];
  readonly absentLabel?: string;
  readonly basisLabel?: string;
  /** Rank and coverage need exact counts (foundation section 5). */
  readonly exactCounts?: true;
  /** Some declared measures or header fields are not readable (one statement, no names). */
  readonly fieldsRestricted?: true;
}

const axis = (raw: unknown, at: string, extra: readonly string[]) => {
  const value = record(raw, at);
  allowKeys(value, ["field", "label", "entity", "parentField", "identityField", "titleField", ...extra], at, "Matrix axis");
  return {
    value,
    axis: {
      field: text(value.field, `${at}.field`),
      label: text(value.label, `${at}.label`),
      entity: text(value.entity, `${at}.entity`),
      parentField: text(value.parentField, `${at}.parentField`),
      identityField: text(value.identityField, `${at}.identityField`),
      ...(value.titleField === undefined ? {} : { titleField: text(value.titleField, `${at}.titleField`) }),
    },
  };
};
const states = (raw: unknown, at: string) => {
  const value = record(raw, at);
  allowKeys(value, ["field", "values"], at, "Matrix state");
  return Object.freeze({ field: text(value.field, `${at}.field`), values: Object.freeze(list(value.values, `${at}.values`).map((item, index) => text(item, `${at}.values[${index}]`))) });
};

/** One fact's rank in its row partition, computed by the server over every
 * record the viewer can read (section 8). `best` and `difference` are exact
 * decimals; `difference` is a percentage, absent at the best value and when
 * the best value is zero. */
export interface ListMatrixRankV1 {
  readonly rank: number;
  readonly count: number;
  readonly best: string;
  readonly difference?: string;
}

const DECIMAL = /^-?\d{1,30}(\.\d{1,12})?$/;

/** Parses a list result's `ranks` (keyed by row id) and `rankRevision`. */
export function parseListMatrixRanks(raw: unknown, revision: unknown): { readonly ranks: Readonly<Record<string, ListMatrixRankV1>>; readonly rankRevision: string } {
  const value = record(raw, "ranks");
  if (typeof revision !== "string" || !/^[a-f0-9]{32,64}$/.test(revision)) fail("rankRevision", "must be a digest");
  const ranks: Record<string, ListMatrixRankV1> = {};
  for (const [id, item] of Object.entries(value)) {
    const entry = record(item, `ranks.${id}`);
    allowKeys(entry, ["rank", "count", "best", "difference"], `ranks.${id}`, "rank");
    const integer = (field: "rank" | "count") => {
      const number = entry[field];
      if (typeof number !== "number" || !Number.isInteger(number) || number < 1) fail(`ranks.${id}.${field}`, "must be a positive integer");
      return number;
    };
    const rank = integer("rank"), count = integer("count");
    if (rank > count) fail(`ranks.${id}.rank`, "must not exceed count");
    if (typeof entry.best !== "string" || !DECIMAL.test(entry.best)) fail(`ranks.${id}.best`, "must be an exact decimal");
    if (entry.difference !== undefined && (typeof entry.difference !== "string" || !DECIMAL.test(entry.difference))) fail(`ranks.${id}.difference`, "must be an exact decimal");
    ranks[id] = Object.freeze({ rank, count, best: entry.best, ...(entry.difference === undefined ? {} : { difference: entry.difference as string }) });
  }
  return { ranks: Object.freeze(ranks), rankRevision: revision };
}

/** Saved Matrix state (section 5.5): the measures shown, in declared order,
 * and the participant filter (column record routing identities, never
 * displayed). */
export interface ListMatrixStateV1 {
  readonly measures: readonly string[];
  readonly columns: readonly string[];
}

/** Pinned participants are at most one list request's `recordIds`. */
export const MATRIX_MAX_PINNED_COLUMNS = 100;
const ROUTING_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Normalizes saved or shared Matrix state against this viewer's Matrix.
 * Unknown measures are dropped and an empty choice shows every measure;
 * display state only, so normalizing it never widens results. */
export function parseListMatrixState(raw: unknown, matrix: ListMatrixV1): ListMatrixStateV1 {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const wanted = new Set(Array.isArray(value.measures) ? value.measures.filter((item): item is string => typeof item === "string") : []);
  const measures = matrix.measures.map((measure) => measure.key).filter((key) => wanted.has(key));
  const columns = Array.isArray(value.columns)
    ? [...new Set(value.columns.filter((item): item is string => typeof item === "string" && ROUTING_ID.test(item)))].slice(0, MATRIX_MAX_PINNED_COLUMNS)
    : [];
  return Object.freeze({
    measures: Object.freeze(measures.length ? measures : matrix.measures.map((measure) => measure.key)),
    columns: Object.freeze(columns),
  });
}

/** A page index carried in the location (`matrix.rows`, `matrix.cols`). */
export function isListMatrixPage(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000;
}

/** Parses the browser Matrix projection against the list's listed fields. */
export function parseListMatrix(raw: unknown, listed: ReadonlyMap<string, { readonly valueKind: string }>): ListMatrixV1 {
  const root = "surface.matrix";
  const value = record(raw, root);
  allowKeys(value, ["parentField", "parentLabel", "parentLocked", "rows", "columns", "measures", "absentLabel", "basisLabel", "exactCounts", "fieldsRestricted"], root, "Matrix");
  const parentField = text(value.parentField, `${root}.parentField`);
  if (listed.get(parentField)?.valueKind !== "reference") fail(`${root}.parentField`, "must be a listed reference field");
  const rows = axis(value.rows, `${root}.rows`, ["searchable"]);
  if (typeof rows.value.searchable !== "boolean") fail(`${root}.rows.searchable`, "must be a boolean");
  const columns = axis(value.columns, `${root}.columns`, ["headerFields", "declined", "eligibility", "order"]);
  for (const key of [rows.axis.field, columns.axis.field])
    if (listed.get(key)?.valueKind !== "reference") fail(`${root}`, `${key} must be a listed reference field`);
  if (rows.axis.field === columns.axis.field) fail(root, "rows and columns must differ");
  const headerFields = list(columns.value.headerFields, `${root}.columns.headerFields`).map((item, index) => {
    const entry = record(item, `${root}.columns.headerFields[${index}]`);
    allowKeys(entry, ["key", "label", "valueKind"], `${root}.columns.headerFields[${index}]`, "header field");
    return Object.freeze({ key: text(entry.key, `${root}.columns.headerFields[${index}].key`), label: text(entry.label, `${root}.columns.headerFields[${index}].label`), valueKind: text(entry.valueKind, `${root}.columns.headerFields[${index}].valueKind`) });
  });
  if (headerFields.length > 3) fail(`${root}.columns.headerFields`, "must hold at most 3 fields");
  const order = list(columns.value.order, `${root}.columns.order`).map((item, index) => {
    const entry = record(item, `${root}.columns.order[${index}]`);
    allowKeys(entry, ["field", "direction"], `${root}.columns.order[${index}]`, "column order");
    if (entry.direction !== "asc" && entry.direction !== "desc") fail(`${root}.columns.order[${index}].direction`, "must be asc or desc");
    return Object.freeze({ field: text(entry.field, `${root}.columns.order[${index}].field`), direction: entry.direction as "asc" | "desc" });
  });
  const measures = list(value.measures, `${root}.measures`).map((item, index) => {
    const at = `${root}.measures[${index}]`;
    const entry = record(item, at);
    allowKeys(entry, ["key", "label", "valueKind", "rank", "better", "evaluation", "unitField", "currencyField"], at, "Matrix measure");
    const key = text(entry.key, `${at}.key`);
    if (!listed.has(key)) fail(`${at}.key`, "must be a listed field");
    for (const flag of ["rank", "evaluation"] as const) if (entry[flag] !== undefined && entry[flag] !== true) fail(`${at}.${flag}`, "must be true when present");
    if (entry.better !== undefined && entry.better !== "lower" && entry.better !== "higher") fail(`${at}.better`, "must be lower or higher");
    if (entry.rank && !entry.better) fail(`${at}.rank`, "needs better");
    const valueKind = text(entry.valueKind, `${at}.valueKind`);
    if (entry.rank && !(valueKind === "integer" || valueKind === "decimal" || (valueKind === "money" && entry.evaluation)))
      fail(`${at}.rank`, "ranks only an integer, a decimal or an evaluation amount");
    return Object.freeze({
      key,
      label: text(entry.label, `${at}.label`),
      valueKind,
      ...(entry.rank ? { rank: true as const } : {}),
      ...(entry.better ? { better: entry.better as "lower" | "higher" } : {}),
      ...(entry.evaluation ? { evaluation: true as const } : {}),
      ...(entry.unitField === undefined ? {} : { unitField: text(entry.unitField, `${at}.unitField`) }),
      ...(entry.currencyField === undefined ? {} : { currencyField: text(entry.currencyField, `${at}.currencyField`) }),
    });
  });
  if (!measures.length || measures.length > MATRIX_MAX_MEASURES) fail(`${root}.measures`, "must hold 1 to 6 measures");
  if (value.parentLocked !== undefined && value.parentLocked !== true) fail(`${root}.parentLocked`, "must be true when present");
  for (const flag of ["exactCounts", "fieldsRestricted"] as const)
    if (value[flag] !== undefined && value[flag] !== true) fail(`${root}.${flag}`, "must be true when present");
  return Object.freeze({
    parentField,
    parentLabel: text(value.parentLabel, `${root}.parentLabel`),
    ...(value.parentLocked ? { parentLocked: true as const } : {}),
    rows: Object.freeze({ ...rows.axis, searchable: rows.value.searchable as boolean }),
    columns: Object.freeze({
      ...columns.axis,
      headerFields: Object.freeze(headerFields),
      ...(columns.value.declined === undefined ? {} : { declined: states(columns.value.declined, `${root}.columns.declined`) }),
      ...(columns.value.eligibility === undefined ? {} : { eligibility: states(columns.value.eligibility, `${root}.columns.eligibility`) }),
      order: Object.freeze(order),
    }),
    measures: Object.freeze(measures),
    ...(value.absentLabel === undefined ? {} : { absentLabel: text(value.absentLabel, `${root}.absentLabel`) }),
    ...(value.basisLabel === undefined ? {} : { basisLabel: text(value.basisLabel, `${root}.basisLabel`) }),
    ...(value.exactCounts ? { exactCounts: true as const } : {}),
    ...(value.fieldsRestricted ? { fieldsRestricted: true as const } : {}),
  });
}
