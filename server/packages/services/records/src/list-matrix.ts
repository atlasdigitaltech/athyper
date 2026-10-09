import type { ListFieldDescriptorV1, ListMatrixV1 } from "@athyper/contract-platform-entity-list";
import { technicalFieldKeys, type EntityFieldDescriptor, type EntityListMatrixDescriptor, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";

export const LIST_MATRIX_KEY_UNAVAILABLE = "LIST_MATRIX_KEY_UNAVAILABLE";
export const LIST_MATRIX_MEASURE_UNAVAILABLE = "LIST_MATRIX_MEASURE_UNAVAILABLE";
export const LIST_MATRIX_SCOPE_UNBOUND = "LIST_MATRIX_SCOPE_UNBOUND";

/** A master Entity's per-viewer list view, as the list descriptor compiles it. */
export interface MatrixAxisList {
  readonly entity: string;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly identityField: string;
  readonly searchable: boolean;
  readonly technical: ReadonlySet<string>;
  readonly masked: (key: string) => boolean;
}

/** The row and column Entities' list views for one viewer; absent when the
 * Entity cannot be read (Matrix blueprint 5.2). */
export interface MatrixAxes {
  readonly rows?: MatrixAxisList;
  readonly columns?: MatrixAxisList;
}

export type ListMatrixResolution =
  | { readonly matrix: ListMatrixV1 }
  | { readonly unavailable: typeof LIST_MATRIX_KEY_UNAVAILABLE | typeof LIST_MATRIX_MEASURE_UNAVAILABLE | typeof LIST_MATRIX_SCOPE_UNBOUND };

/** Loads the row and column Entities' per-viewer list views. A failure to
 * read either leaves it absent, so Matrix fails closed for this viewer. */
export async function resolveMatrixAxes(input: {
  readonly matrix: EntityListMatrixDescriptor;
  readonly fields: readonly EntityFieldDescriptor[];
  readonly load: (entityCode: string) => Promise<EntityRuntimeDescriptor | undefined>;
  readonly listFor: (descriptor: EntityRuntimeDescriptor) => Promise<Omit<MatrixAxisList, "entity" | "technical" | "masked"> | undefined>;
  readonly masked: (descriptor: EntityRuntimeDescriptor, key: string) => boolean;
}): Promise<MatrixAxes> {
  const axis = async (key: string): Promise<MatrixAxisList | undefined> => {
    const entity = input.fields.find((field) => field.key === key)?.referenceTargetEntity;
    const target = entity ? await input.load(entity).catch(() => undefined) : undefined;
    const list = target ? await input.listFor(target).catch(() => undefined) : undefined;
    return target && list
      ? Object.freeze({ ...list, entity: target.entityCode, technical: technicalFieldKeys(target), masked: (field: string) => input.masked(target, field) })
      : undefined;
  };
  const [rows, columns] = await Promise.all([axis(input.matrix.rows.field), axis(input.matrix.columns.field)]);
  return { ...(rows ? { rows } : {}), ...(columns ? { columns } : {}) };
}

const presentable = (axis: MatrixAxisList, key: string) => {
  const field = axis.fields.find((candidate) => candidate.key === key);
  return field && field.valueKind !== "uuid" && !axis.technical.has(key) && !axis.masked(key) ? field : undefined;
};
const filterable = (field: ListFieldDescriptorV1 | undefined, operators: readonly string[]) =>
  Boolean(field && operators.every((operator) => field.filterOperators.includes(operator as never)));

/** Resolves the published Matrix for one viewer (Matrix blueprint 5.2, 5.4).
 * Matrix is unavailable when a key the pivot needs is unreadable: the parent,
 * row or column field on this Entity, or the row or column Entity and its
 * reference to the same parent. A record section whose locked scope does not
 * fix the parent cannot draw one parent's Matrix. Unreadable measures, header
 * fields and column order are dropped with the list's single restricted
 * statement; without a readable measure Matrix is unavailable. */
export function resolveListMatrix(input: {
  readonly matrix: EntityListMatrixDescriptor;
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
  readonly technical: ReadonlySet<string>;
  readonly locked?: { readonly recordScoped: boolean; readonly fields: ReadonlySet<string> };
  readonly exactCounts: boolean;
  readonly axes?: MatrixAxes;
}): ListMatrixResolution {
  const { matrix } = input;
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const readable = (key: string) => {
    const field = listed.get(key);
    return field && !input.masked(key) ? field : undefined;
  };
  const parent = readable(matrix.parentField);
  const rowKey = readable(matrix.rows.field);
  const columnKey = readable(matrix.columns.field);
  const rows = input.axes?.rows, columns = input.axes?.columns;
  const rowParent = rows ? rows.fields.find((field) => field.key === matrix.rows.parentField) : undefined;
  const columnParent = columns ? columns.fields.find((field) => field.key === matrix.columns.parentField) : undefined;
  if (
    !filterable(parent, ["eq"]) ||
    !filterable(rowKey, ["eq", "in"]) ||
    !filterable(columnKey, ["eq", "in"]) ||
    !rows ||
    !columns ||
    !filterable(rowParent, ["eq"]) ||
    !filterable(columnParent, ["eq"]) ||
    rows.masked(matrix.rows.parentField) ||
    columns.masked(matrix.columns.parentField)
  )
    return { unavailable: LIST_MATRIX_KEY_UNAVAILABLE };
  const parentLocked = input.locked?.fields.has(matrix.parentField) === true;
  if (input.locked?.recordScoped && !parentLocked) return { unavailable: LIST_MATRIX_SCOPE_UNBOUND };
  let restricted = false;
  const declared = new Map(input.entityFields.map((field) => [field.key, field]));
  const measures = matrix.measures.flatMap((measure) => {
    const field = readable(measure.field);
    if (!field || field.valueKind === "uuid" || input.technical.has(measure.field)) {
      restricted = true;
      return [];
    }
    const currencyKey = field.valueKind === "money" ? declared.get(measure.field)?.list?.currencyField : undefined;
    const currency = currencyKey && readable(currencyKey) ? currencyKey : undefined;
    // A money amount without its readable currency is not shown: the
    // browser never presents an amount in an unknown currency.
    if (field.valueKind === "money" && !currency) {
      restricted = true;
      return [];
    }
    const unit = measure.unitField && readable(measure.unitField) ? measure.unitField : undefined;
    if (measure.unitField && !unit) restricted = true;
    return [
      Object.freeze({
        key: field.key,
        label: field.label,
        valueKind: field.valueKind,
        ...(measure.rank ? { rank: true as const } : {}),
        ...(measure.better ? { better: measure.better } : {}),
        ...(measure.evaluation ? { evaluation: true as const } : {}),
        ...(unit ? { unitField: unit } : {}),
        ...(currency ? { currencyField: currency } : {}),
      }),
    ];
  });
  if (!measures.length) return { unavailable: LIST_MATRIX_MEASURE_UNAVAILABLE };
  const title = (axis: MatrixAxisList) => axis.fields.find((field) => field.semanticRole === "title" && field.key !== axis.identityField && presentable(axis, field.key));
  const headerFields = (matrix.columns.headerFields ?? []).flatMap((key) => {
    const field = presentable(columns, key);
    if (!field) restricted = true;
    return field ? [Object.freeze({ key: field.key, label: field.label, valueKind: field.valueKind })] : [];
  });
  const states = (declaration: { readonly field: string; readonly values: readonly string[] } | undefined) =>
    declaration && presentable(columns, declaration.field) ? Object.freeze({ field: declaration.field, values: declaration.values }) : undefined;
  const declined = states(matrix.columns.declined);
  const eligibility = states(matrix.rankEligibility);
  if ((matrix.columns.declined && !declined) || (matrix.rankEligibility && !eligibility)) restricted = true;
  const order = (matrix.columnOrder ?? []).filter((entry) => presentable(columns, entry.field)?.sortable);
  const rowTitle = title(rows), columnTitle = title(columns);
  return {
    matrix: Object.freeze({
      parentField: parent!.key,
      parentLabel: parent!.label,
      ...(parentLocked ? { parentLocked: true as const } : {}),
      rows: Object.freeze({
        field: rowKey!.key,
        label: rowKey!.label,
        entity: rows.entity,
        parentField: matrix.rows.parentField,
        identityField: rows.identityField,
        ...(rowTitle ? { titleField: rowTitle.key } : {}),
        searchable: rows.searchable,
      }),
      columns: Object.freeze({
        field: columnKey!.key,
        label: columnKey!.label,
        entity: columns.entity,
        parentField: matrix.columns.parentField,
        identityField: columns.identityField,
        ...(columnTitle ? { titleField: columnTitle.key } : {}),
        headerFields: Object.freeze(headerFields),
        ...(declined ? { declined } : {}),
        ...(eligibility ? { eligibility } : {}),
        order: Object.freeze(order.map((entry) => Object.freeze({ ...entry }))),
      }),
      measures: Object.freeze(measures),
      ...(matrix.absentLabel ? { absentLabel: matrix.absentLabel } : {}),
      ...(matrix.basisLabel ? { basisLabel: matrix.basisLabel } : {}),
      ...(input.exactCounts ? { exactCounts: true as const } : {}),
      ...(restricted ? { fieldsRestricted: true as const } : {}),
    }),
  };
}
