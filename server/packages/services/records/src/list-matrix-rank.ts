import { isEntityRecordId } from "@athyper/contract-platform-entity-runtime";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { ListRecordsQuery, RecordRankInput } from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

/** Admits a Matrix rank request (Matrix blueprint 5.4 point 3 and section 8)
 * and builds the repository's rank input. The ranked field must be a ranked
 * measure of the published Matrix, readable and unmasked for this viewer with
 * the row and column keys; the list must publish exact counts; the request is
 * a plain page (no grouping, hierarchy or counts). Eligibility is read from
 * the column Entity's published descriptor, never named in code. */
export async function resolveMatrixRank(input: {
  readonly descriptor: EntityRuntimeDescriptor;
  readonly query: ListRecordsQuery;
  readonly readableKeys: ReadonlySet<string>;
  readonly loadColumn: (entityCode: string) => Promise<EntityRuntimeDescriptor>;
}): Promise<RecordRankInput | undefined> {
  const { descriptor, query } = input;
  if (query.matrixColumns !== undefined && !query.rank)
    throw new RecordServiceError(400, "LIST_MATRIX_RANK_INVALID", "matrixColumns requires rank");
  if (!query.rank) return undefined;
  const matrix = descriptor.listPresentation?.matrix;
  const measure = matrix?.measures.find((item) => item.field === query.rank && item.rank);
  const masked = (key: string) =>
    descriptor.authorization?.fieldPolicies.some((policy) => policy.representation === "masked" && policy.fields.includes(key)) ?? false;
  if (!matrix || !measure?.better || [measure.field, matrix.rows.field, matrix.columns.field, ...(matrix.pivotDimensions ?? [])].some((key) => !input.readableKeys.has(key) || masked(key)))
    throw new RecordServiceError(400, "LIST_MATRIX_RANK_UNAVAILABLE", "This list has no ranked measure the viewer can use");
  // Rank is exact only (foundation section 5).
  if ((descriptor.listPresentation?.limits?.countMode ?? descriptor.listPresentation?.countMode) !== "exact")
    throw new RecordServiceError(400, "LIST_MATRIX_RANK_UNAVAILABLE", "Rank needs exact counts");
  if (query.group || query.groupsOnly || query.hierarchy || (query.countMode && query.countMode !== "none"))
    throw new RecordServiceError(400, "LIST_MATRIX_RANK_INVALID", "rank is a plain page: no group, hierarchy or count");
  const columns = query.matrixColumns;
  if (columns !== undefined && (!columns.length || columns.length > 100 || columns.some((id) => !isEntityRecordId(id))))
    throw new RecordServiceError(400, "LIST_MATRIX_RANK_INVALID", "matrixColumns must hold 1 to 100 record identities");
  let eligibility: RecordRankInput["eligibility"];
  if (matrix.rankEligibility) {
    const target = descriptor.fields.find((field) => field.key === matrix.columns.field)?.referenceTargetEntity;
    const column = target ? await input.loadColumn(target).catch(() => undefined) : undefined;
    // An eligibility rule that cannot be applied fails closed: ranking the
    // ineligible would misstate every rank.
    if (!column || !column.fields.some((field) => field.key === matrix.rankEligibility!.field))
      throw new RecordServiceError(503, "LIST_MATRIX_ELIGIBILITY_UNAVAILABLE", "The rank eligibility rule is unavailable");
    eligibility = { field: matrix.columns.field, column, columnField: matrix.rankEligibility.field, values: matrix.rankEligibility.values };
  }
  return Object.freeze({
    field: measure.field,
    better: measure.better,
    partition: Object.freeze([matrix.rows.field, ...(matrix.pivotDimensions ?? [])]),
    ...(columns ? { output: Object.freeze({ field: matrix.columns.field, values: Object.freeze([...new Set(columns)]) }) } : {}),
    ...(eligibility ? { eligibility } : {}),
  });
}
