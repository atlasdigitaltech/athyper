import {
  MATRIX_BLOCK_LIMIT,
  MATRIX_COLUMNS_PER_PAGE,
  MATRIX_MAX_MEASURES,
  MATRIX_MAX_PIVOT_DIMENSIONS,
  MATRIX_ROWS_PER_PAGE,
} from "@athyper/contract-platform-entity-list";
import {
  entityFieldFilterOperators,
  type EntityFieldDescriptor,
  type EntityListMatrixDescriptor,
  type EntityListViewMode,
} from "@athyper/server-contract-metadata";
import { fail, list, only as layoutOnly, record, text } from "./list-date-range-descriptor.js";

// The published Matrix declaration of a list surface (Entity list Matrix
// blueprint sections 5.1, 5.4 and 6). Structure is parsed here; this Entity's
// field references are checked by validatePublishedListMatrix; the row and
// column Entities' fields are resolved per viewer by the list service, which
// can read their descriptors.

const MEASURE_TYPES = new Set(["integer", "decimal", "money", "date", "datetime", "string", "text"]);

function only(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  layoutOnly(value, keys, path, "Matrix");
}
const states = (raw: unknown, at: string) => {
  const value = record(raw, at);
  only(value, ["field", "values"], at);
  const values = list(value.values, `${at}.values`).map((item, index) => text(item, `${at}.values[${index}]`));
  if (!values.length || values.length > 20) fail(`${at}.values`, "must hold 1 to 20 values");
  return Object.freeze({ field: text(value.field, `${at}.field`), values: Object.freeze([...new Set(values)]) });
};
const pageSize = (raw: unknown, at: string, fixed: number): number => {
  if (raw === undefined) return fixed;
  if (raw !== fixed) fail(at, `must be ${fixed} in this revision`);
  return fixed;
};

export function parsePublishedListMatrix(raw: unknown): EntityListMatrixDescriptor {
  const root = "listPresentation.matrix";
  const value = record(raw, root);
  only(value, ["parentField", "rows", "columns", "pivotDimensions", "measures", "absentLabel", "rankEligibility", "basisLabel", "columnOrder"], root);
  const rows = record(value.rows, `${root}.rows`);
  only(rows, ["field", "parentField", "pageSize"], `${root}.rows`);
  const columns = record(value.columns, `${root}.columns`);
  only(columns, ["field", "parentField", "pageSize", "headerFields", "declined"], `${root}.columns`);
  const rowPage = pageSize(rows.pageSize, `${root}.rows.pageSize`, MATRIX_ROWS_PER_PAGE);
  const columnPage = pageSize(columns.pageSize, `${root}.columns.pageSize`, MATRIX_COLUMNS_PER_PAGE);
  if (rowPage * columnPage > MATRIX_BLOCK_LIMIT)
    fail(root, `MATRIX_BLOCK_ABOVE_PAGE: rows × columns must not exceed ${MATRIX_BLOCK_LIMIT}`);
  const headerFields =
    columns.headerFields === undefined
      ? undefined
      : list(columns.headerFields, `${root}.columns.headerFields`).map((item, index) => text(item, `${root}.columns.headerFields[${index}]`));
  if (headerFields && (headerFields.length > 3 || new Set(headerFields).size !== headerFields.length))
    fail(`${root}.columns.headerFields`, "must hold at most 3 distinct fields");
  const pivotDimensions =
    value.pivotDimensions === undefined
      ? undefined
      : list(value.pivotDimensions, `${root}.pivotDimensions`).map((item, index) => text(item, `${root}.pivotDimensions[${index}]`));
  if (pivotDimensions && (pivotDimensions.length > MATRIX_MAX_PIVOT_DIMENSIONS || new Set(pivotDimensions).size !== pivotDimensions.length))
    fail(`${root}.pivotDimensions`, `must hold at most ${MATRIX_MAX_PIVOT_DIMENSIONS} distinct fields`);
  const declared = list(value.measures, `${root}.measures`);
  if (!declared.length || declared.length > MATRIX_MAX_MEASURES) fail(`${root}.measures`, `must hold 1 to ${MATRIX_MAX_MEASURES} measures`);
  const seen = new Set<string>();
  const measures = declared.map((item, index) => {
    const at = `${root}.measures[${index}]`;
    const measure = record(item, at);
    only(measure, ["field", "rank", "better", "evaluation", "unitField"], at);
    const field = text(measure.field, `${at}.field`);
    if (seen.has(field)) fail(`${at}.field`, `${field} is a measure once`);
    seen.add(field);
    for (const flag of ["rank", "evaluation"] as const)
      if (measure[flag] !== undefined && measure[flag] !== true) fail(`${at}.${flag}`, "must be true when present");
    if (measure.better !== undefined && measure.better !== "lower" && measure.better !== "higher") fail(`${at}.better`, "must be lower or higher");
    if (measure.rank && !measure.better) fail(`${at}.better`, "MATRIX_RANK_DIRECTION_REQUIRED: a ranked measure declares which value is better");
    return Object.freeze({
      field,
      ...(measure.rank ? { rank: true as const } : {}),
      ...(measure.better ? { better: measure.better as "lower" | "higher" } : {}),
      ...(measure.evaluation ? { evaluation: true as const } : {}),
      ...(measure.unitField === undefined ? {} : { unitField: text(measure.unitField, `${at}.unitField`) }),
    });
  });
  const columnOrder =
    value.columnOrder === undefined
      ? undefined
      : list(value.columnOrder, `${root}.columnOrder`).map((item, index) => {
          const at = `${root}.columnOrder[${index}]`;
          const entry = record(item, at);
          only(entry, ["field", "direction"], at);
          if (entry.direction !== "asc" && entry.direction !== "desc") fail(`${at}.direction`, "must be asc or desc");
          return Object.freeze({ field: text(entry.field, `${at}.field`), direction: entry.direction as "asc" | "desc" });
        });
  if (columnOrder && columnOrder.length > 3) fail(`${root}.columnOrder`, "must hold at most 3 levels");
  return Object.freeze({
    parentField: text(value.parentField, `${root}.parentField`),
    rows: Object.freeze({
      field: text(rows.field, `${root}.rows.field`),
      parentField: text(rows.parentField, `${root}.rows.parentField`),
      ...(rows.pageSize === undefined ? {} : { pageSize: rowPage }),
    }),
    columns: Object.freeze({
      field: text(columns.field, `${root}.columns.field`),
      parentField: text(columns.parentField, `${root}.columns.parentField`),
      ...(columns.pageSize === undefined ? {} : { pageSize: columnPage }),
      ...(headerFields ? { headerFields: Object.freeze(headerFields) } : {}),
      ...(columns.declined === undefined ? {} : { declined: states(columns.declined, `${root}.columns.declined`) }),
    }),
    ...(pivotDimensions ? { pivotDimensions: Object.freeze(pivotDimensions) } : {}),
    measures: Object.freeze(measures),
    ...(value.absentLabel === undefined ? {} : { absentLabel: text(value.absentLabel, `${root}.absentLabel`) }),
    ...(value.rankEligibility === undefined ? {} : { rankEligibility: states(value.rankEligibility, `${root}.rankEligibility`) }),
    ...(value.basisLabel === undefined ? {} : { basisLabel: text(value.basisLabel, `${root}.basisLabel`) }),
    ...(columnOrder ? { columnOrder: Object.freeze(columnOrder) } : {}),
  });
}

/** Checks this Entity's Matrix references (section 6): the parent, row and
 * column keys are required references filterable with `eq` and `in` (the row
 * key also sortable); measures are of a supported type; a ranked measure is an
 * integer, a decimal or a declared evaluation amount, never money in an
 * unknown mix of currencies. Matrix is declared exactly when a projection is
 * published. */
export function validatePublishedListMatrix(
  presentation: {
    readonly matrix?: EntityListMatrixDescriptor;
    readonly supportedModes?: readonly EntityListViewMode[];
  },
  byKey: ReadonlyMap<string, EntityFieldDescriptor>,
): void {
  if ((presentation.supportedModes?.includes("matrix") === true) !== Boolean(presentation.matrix))
    throw new Error("listPresentation.matrix is required exactly when Matrix is a supported mode");
  const matrix = presentation.matrix;
  if (!matrix) return;
  const root = "listPresentation.matrix";
  const key = (field: string, code: string, sortable: boolean): EntityFieldDescriptor => {
    const descriptor = byKey.get(field);
    const operators = descriptor ? (descriptor.list?.filterOperators ?? entityFieldFilterOperators(descriptor.type)) : [];
    if (
      !descriptor ||
      descriptor.type !== "reference" ||
      !descriptor.referenceTargetEntity ||
      !descriptor.required ||
      !descriptor.filterable ||
      !operators.includes("eq") ||
      !operators.includes("in") ||
      (sortable && !descriptor.sortable)
    )
      throw new Error(`${root} ${code}: ${field} must be a required reference filterable with eq and in${sortable ? " and sortable" : ""}`);
    return descriptor;
  };
  const parent = key(matrix.parentField, "MATRIX_PARENT_FIELD_INELIGIBLE", false);
  const rows = key(matrix.rows.field, "MATRIX_ROW_FIELD_INELIGIBLE", true);
  const columns = key(matrix.columns.field, "MATRIX_COLUMN_FIELD_INELIGIBLE", false);
  if (new Set([parent.key, rows.key, columns.key]).size !== 3)
    throw new Error(`${root} parent, row and column fields must differ`);
  if (rows.referenceTargetEntity === columns.referenceTargetEntity)
    throw new Error(`${root} rows and columns must reference different Entities`);
  for (const dimension of matrix.pivotDimensions ?? [])
    if (!byKey.has(dimension) || [parent.key, rows.key, columns.key].includes(dimension))
      throw new Error(`${root}.pivotDimensions ${dimension} must be another field of this Entity`);
  let evaluations = 0;
  for (const measure of matrix.measures) {
    const field = byKey.get(measure.field);
    if (!field || !MEASURE_TYPES.has(field.type))
      throw new Error(`${root} MATRIX_MEASURE_INELIGIBLE: ${measure.field} must be a number, money, date or text field`);
    if (measure.evaluation) {
      evaluations += 1;
      if (field.type !== "money" && field.type !== "decimal" && field.type !== "integer")
        throw new Error(`${root} MATRIX_MEASURE_INELIGIBLE: evaluation amount ${measure.field} must be a number or money field`);
    }
    if (measure.rank && field.type !== "integer" && field.type !== "decimal" && !(field.type === "money" && measure.evaluation))
      throw new Error(`${root} MATRIX_RANK_WITHOUT_EVALUATION: ${measure.field} ranks only as a number or a declared evaluation amount`);
    if (measure.unitField && !byKey.has(measure.unitField))
      throw new Error(`${root} unit field ${measure.unitField} is not a field of this Entity`);
  }
  if (evaluations > 1) throw new Error(`${root} declares one evaluation amount`);
}

/** Key coverage at publication (section 2.1): given the database unique keys
 * of the fact table, is (row, column) unique once the declared pivot
 * dimensions and the dimensions the read operation's scope binds are fixed?
 * Dimension-agnostic: the extra dimensions come from the key itself. Wired
 * into the onboarding DDL rehearsal in M3. */
export function matrixKeyFinding(input: {
  /** Storage columns. */
  readonly rowKey: string;
  readonly columnKey: string;
  readonly pivotDimensions: readonly string[];
  readonly boundDimensions: readonly string[];
  readonly uniqueKeys: readonly (readonly string[])[];
  readonly tenantColumn?: string;
}):
  | undefined
  | { readonly code: "MATRIX_KEY_NOT_UNIQUE" }
  | { readonly code: "MATRIX_KEY_DIMENSION_UNCOVERED"; readonly fields: readonly string[] } {
  const candidates = input.uniqueKeys.filter((key) => key.includes(input.rowKey) && key.includes(input.columnKey));
  if (!candidates.length) return { code: "MATRIX_KEY_NOT_UNIQUE" };
  const covered = new Set([input.rowKey, input.columnKey, ...input.pivotDimensions, ...input.boundDimensions, ...(input.tenantColumn ? [input.tenantColumn] : [])]);
  // Any one fully covered key proves (row, column) unique; otherwise report
  // the smallest set of uncovered dimensions.
  const gaps = candidates.map((key) => key.filter((column) => !covered.has(column))).sort((a, b) => a.length - b.length);
  return gaps[0]!.length ? { code: "MATRIX_KEY_DIMENSION_UNCOVERED", fields: Object.freeze(gaps[0]!) } : undefined;
}
