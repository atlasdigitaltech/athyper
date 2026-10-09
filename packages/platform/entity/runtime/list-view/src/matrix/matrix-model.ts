import { entityListScopeQuery } from "@athyper/platform-api-client";
import {
  MATRIX_COLUMNS_PER_PAGE,
  MATRIX_ROWS_PER_PAGE,
  type EntityListRowV1,
  type EntityListScopeCoordinateV1,
  type JsonValue,
  type ListFilterV1,
  type ListMatrixMeasureV1,
  type ListMatrixRankV1,
  type ListMatrixV1,
} from "@athyper/contract-platform-entity-list";

// Matrix Layout (Entity list Matrix blueprint sections 5.4, 7 and 8): request
// shapes and the grid model. Every screen costs the rows page, the columns
// page and one cell request carrying its ranks, plus one coverage count. A
// block that is short or holds two facts for one cell is never drawn, and the
// absence label is claimed only from a complete block with no fact filter and
// fact access following the parent's.

type Query = Readonly<Record<string, unknown>>;

/** The parent the Matrix is drawn for: fixed by the record section's locked
 * scope, or exactly one `eq` filter on the parent field (section 5.4 point 1). */
export type MatrixParent =
  | { readonly kind: "locked" }
  | { readonly kind: "chosen"; readonly id: string }
  | { readonly kind: "missing" };

export function matrixParent(matrix: ListMatrixV1, filters: readonly ListFilterV1[]): MatrixParent {
  if (matrix.parentLocked) return { kind: "locked" };
  const own = filters.filter((filter) => filter.field === matrix.parentField);
  return own.length === 1 && own[0]!.operator === "eq" && typeof own[0]!.value === "string" && own[0]!.value
    ? { kind: "chosen", id: own[0]!.value }
    : { kind: "missing" };
}

/** Filters on the fact Entity other than the parent: with one applied, an
 * empty cell may hold a fact the filter excluded (section 5.3, "a cell filter"). */
export function factFilters(matrix: ListMatrixV1, filters: readonly ListFilterV1[]): readonly ListFilterV1[] {
  return filters.filter((filter) => filter.field !== matrix.parentField);
}

const parentFilter = (field: string, parent: MatrixParent) =>
  parent.kind === "chosen" ? [JSON.stringify({ field, operator: "eq", value: parent.id })] : [];

/** One page of the row Entity under the same parent, in its identity order. */
export function matrixRowsQuery(input: {
  readonly matrix: ListMatrixV1;
  readonly parent: MatrixParent;
  /** The parent record's id when the scope is locked: the row Entity is
   * filtered by it, since the fact's locked scope does not reach it. */
  readonly parentId?: string;
  readonly search?: string;
  readonly cursor?: string;
}): Query {
  const { rows } = input.matrix;
  const parent: MatrixParent = input.parent.kind === "locked" && input.parentId ? { kind: "chosen", id: input.parentId } : input.parent;
  return Object.freeze({
    limit: MATRIX_ROWS_PER_PAGE,
    ...(input.cursor ? { cursor: input.cursor } : {}),
    fields: [rows.identityField, ...(rows.titleField ? [rows.titleField] : [])],
    filter: parentFilter(rows.parentField, parent),
    ...(input.search && rows.searchable ? { search: input.search } : {}),
    sort: [`${rows.identityField}:asc`],
    countMode: "exact",
  });
}

/** One page of the column Entity: the participant filter as record ids, the
 * authored column order, then identity (section 5.3, partial bids). */
export function matrixColumnsQuery(input: {
  readonly matrix: ListMatrixV1;
  readonly parent: MatrixParent;
  readonly parentId?: string;
  readonly pinned: readonly string[];
  readonly cursor?: string;
}): Query {
  const { columns } = input.matrix;
  const parent: MatrixParent = input.parent.kind === "locked" && input.parentId ? { kind: "chosen", id: input.parentId } : input.parent;
  const fields = new Set<string>([columns.identityField]);
  if (columns.titleField) fields.add(columns.titleField);
  for (const field of columns.headerFields) fields.add(field.key);
  if (columns.declined) fields.add(columns.declined.field);
  if (columns.eligibility) fields.add(columns.eligibility.field);
  const order = [...columns.order.map((entry) => `${entry.field}:${entry.direction}`), `${columns.identityField}:asc`];
  return Object.freeze({
    limit: MATRIX_COLUMNS_PER_PAGE,
    ...(input.cursor ? { cursor: input.cursor } : {}),
    fields: [...fields],
    filter: parentFilter(columns.parentField, parent),
    ...(input.pinned.length ? { recordIds: [...input.pinned] } : {}),
    sort: [...new Set(order)].slice(0, 3),
    countMode: "exact",
  });
}

/** The fact fields a cell request names. */
export function matrixCellFields(matrix: ListMatrixV1, measures: readonly ListMatrixMeasureV1[]): readonly string[] {
  const fields = new Set<string>([matrix.rows.field, matrix.columns.field]);
  for (const measure of measures) {
    fields.add(measure.key);
    if (measure.currencyField) fields.add(measure.currencyField);
    if (measure.unitField) fields.add(measure.unitField);
  }
  return [...fields];
}

/** The ranked measure, when ranks can be shown: exact counts only (section 8). */
export function rankedMeasure(matrix: ListMatrixV1): ListMatrixMeasureV1 | undefined {
  return matrix.exactCounts ? matrix.measures.find((measure) => measure.rank) : undefined;
}

/** The one cell request of a screen (section 5.4 point 3). With a ranked
 * measure, the page's columns travel as `matrixColumns` (output only), so the
 * rank covers every participant the filters admit; without one they are a
 * plain `in` filter. The limit is the block, never the list's default. */
export function matrixCellsQuery(input: {
  readonly matrix: ListMatrixV1;
  readonly parent: MatrixParent;
  readonly measures: readonly ListMatrixMeasureV1[];
  readonly rowKeys: readonly string[];
  readonly columnKeys: readonly string[];
  readonly pinned: readonly string[];
  readonly filters: readonly ListFilterV1[];
  readonly scope?: EntityListScopeCoordinateV1;
}): Query {
  const { matrix } = input;
  const rank = rankedMeasure(matrix);
  const filter = [
    ...parentFilter(matrix.parentField, input.parent),
    JSON.stringify({ field: matrix.rows.field, operator: "in", value: [...input.rowKeys] }),
    ...(rank
      ? input.pinned.length
        ? [JSON.stringify({ field: matrix.columns.field, operator: "in", value: [...input.pinned] })]
        : []
      : [JSON.stringify({ field: matrix.columns.field, operator: "in", value: [...input.columnKeys] })]),
    ...factFilters(matrix, input.filters).map((item) => JSON.stringify(item)),
  ];
  return Object.freeze({
    limit: Math.min(100, Math.max(1, input.rowKeys.length * input.columnKeys.length)),
    fields: matrixCellFields(matrix, input.measures),
    filter,
    countMode: "none",
    ...(rank ? { rank: rank.key, matrixColumns: [...input.columnKeys] } : {}),
    ...entityListScopeQuery(input.scope),
  });
}

/** Coverage per column (section 5.4 point 4): a group count of facts by
 * column under the parent, exact counts only. */
export function matrixCoverageQuery(input: {
  readonly matrix: ListMatrixV1;
  readonly parent: MatrixParent;
  readonly scope?: EntityListScopeCoordinateV1;
}): Query {
  return Object.freeze({
    limit: 1,
    fields: [input.matrix.columns.field],
    filter: parentFilter(input.matrix.parentField, input.parent),
    group: input.matrix.columns.field,
    groupsOnly: "true",
    countMode: "exact",
    ...entityListScopeQuery(input.scope),
  });
}

export type MatrixCellState =
  | { readonly kind: "value"; readonly row: EntityListRowV1; readonly rank?: ListMatrixRankV1 }
  /** No fact, and the block proves there is none. */
  | { readonly kind: "absent" }
  /** No fact returned, but a filter or access rule may hide one. */
  | { readonly kind: "unknown" }
  | { readonly kind: "declined" };

export interface MatrixColumnModel {
  readonly id: string;
  readonly row: EntityListRowV1;
  readonly declined: boolean;
  /** The column record is not in an eligible state; its cells are not ranked. */
  readonly ineligible: boolean;
}

export type MatrixBlock =
  | { readonly status: "ready"; readonly cells: ReadonlyMap<string, MatrixCellState> }
  | { readonly status: "incomplete" };

export const cellKey = (rowId: string, columnId: string) => `${rowId}\u0000${columnId}`;

const textValue = (value: JsonValue | undefined) => (typeof value === "string" || typeof value === "number" ? String(value) : undefined);

export function matrixColumns(matrix: ListMatrixV1, rows: readonly EntityListRowV1[]): readonly MatrixColumnModel[] {
  const { declined, eligibility } = matrix.columns;
  return rows.map((row) => {
    const state = (field: string) => textValue(row.values[field]);
    return Object.freeze({
      id: row.id,
      row,
      declined: Boolean(declined && declined.values.includes(state(declined.field) ?? "")),
      ineligible: Boolean(eligibility && !eligibility.values.includes(state(eligibility.field) ?? "")),
    });
  });
}

/** Places the cell response into the block. A response with more pages, or
 * two facts for one cell, fails closed (section 7). */
export function buildMatrixBlock(input: {
  readonly matrix: ListMatrixV1;
  readonly rowIds: readonly string[];
  readonly columns: readonly MatrixColumnModel[];
  readonly facts: readonly EntityListRowV1[];
  readonly ranks?: Readonly<Record<string, ListMatrixRankV1>>;
  readonly hasNext: boolean;
  /** A fact filter is applied: an empty cell may hold an excluded fact. */
  readonly filtered: boolean;
}): MatrixBlock {
  if (input.hasNext) return { status: "incomplete" };
  const { matrix } = input;
  const placed = new Map<string, EntityListRowV1>();
  for (const fact of input.facts) {
    const row = textValue(fact.values[matrix.rows.field]);
    const column = textValue(fact.values[matrix.columns.field]);
    if (!row || !column) return { status: "incomplete" };
    const key = cellKey(row, column);
    if (placed.has(key)) return { status: "incomplete" };
    placed.set(key, fact);
  }
  const provable = !input.filtered && !matrix.accessIndependent;
  const cells = new Map<string, MatrixCellState>();
  for (const rowId of input.rowIds)
    for (const column of input.columns) {
      const key = cellKey(rowId, column.id);
      const fact = placed.get(key);
      const rank = fact && !column.ineligible ? input.ranks?.[fact.id] : undefined;
      cells.set(
        key,
        column.declined
          ? { kind: "declined" }
          : fact
            ? { kind: "value", row: fact, ...(rank ? { rank } : {}) }
            : provable
              ? { kind: "absent" }
              : { kind: "unknown" },
      );
    }
  return { status: "ready", cells };
}

/** Per row, whether the ranked measure's unit differs across the loaded
 * cells: the rank is then shown as "Units differ" (section 8). */
export function unitsDiffer(block: MatrixBlock, rowId: string, columns: readonly MatrixColumnModel[], measure: ListMatrixMeasureV1 | undefined): boolean {
  if (block.status !== "ready" || !measure?.unitField) return false;
  const units = new Set<string>();
  for (const column of columns) {
    const cell = block.cells.get(cellKey(rowId, column.id));
    const unit = cell?.kind === "value" ? textValue(cell.row.values[measure.unitField]) : undefined;
    if (unit) units.add(unit);
  }
  return units.size > 1;
}

/** The evaluation basis currency (section 5.3): one currency across the
 * loaded evaluation amounts, or none when they differ or are missing. */
export function basisCurrency(block: MatrixBlock, measure: ListMatrixMeasureV1 | undefined): string | undefined {
  if (block.status !== "ready" || !measure?.evaluation || !measure.currencyField) return undefined;
  const currencies = new Set<string>();
  for (const cell of block.cells.values())
    if (cell.kind === "value") {
      const currency = textValue(cell.row.values[measure.currencyField]);
      if (currency) currencies.add(currency);
    }
  return currencies.size === 1 ? [...currencies][0] : undefined;
}

/** Display presets derived from the declaration (section 5.3): the primary
 * measure with its rank, or every measure. */
export function matrixPresets(matrix: ListMatrixV1): { readonly primary: readonly string[]; readonly everything: readonly string[] } {
  return { primary: [matrix.measures[0]!.key], everything: matrix.measures.map((measure) => measure.key) };
}

/** The measures to show, in declared order, with the primary measure first. */
export function shownMeasures(matrix: ListMatrixV1, chosen: readonly string[] | undefined): readonly ListMatrixMeasureV1[] {
  const wanted = new Set(chosen?.length ? chosen : matrixPresets(matrix).everything);
  wanted.add(matrix.measures[0]!.key);
  return matrix.measures.filter((measure) => wanted.has(measure.key));
}
