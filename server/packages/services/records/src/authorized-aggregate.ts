import type {
  RecordRepository,
  RecordRepositoryListInput,
} from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

/** Materialize a bounded authorized identity set before SQL aggregation. No raw
 * caller predicate is accepted. The repository applies the same ID restriction
 * to rows, count and group queries, including FALSE for an empty set. */
export async function executeAuthorizedAggregate<Transaction>(input: {
  readonly repository: RecordRepository<Transaction>;
  readonly query: RecordRepositoryListInput;
  readonly transaction: Transaction;
  readonly authorize: (recordId: string) => Promise<boolean>;
}) {
  const { repository, query, transaction, authorize } = input;
  const ids: string[] = [],
    seen = new Set<string>(),
    cursors = new Set<string>();
  const { cursor: _cursor, group: _group, ...base } = query;
  const deadline = Date.now() + 5000;
  const withinBudget = () => {
    if (Date.now() > deadline)
      throw new RecordServiceError(
        503,
        "ENTITY_AGGREGATE_AUTHORIZATION_UNAVAILABLE",
        "Aggregate authorization could not complete within its execution budget",
      );
  };
  let cursor: string | undefined;
  for (;;) {
    const page = await repository.list(
      {
        ...base,
        limit: 100,
        countMode: "none",
        sort: [],
        projection: [query.descriptor.storage.idField],
        ...(cursor ? { cursor } : {}),
      },
      transaction,
    );
    for (const row of page.data) {
      withinBudget();
      const id = row[query.descriptor.storage.idField];
      if (
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ) ||
        seen.has(id)
      )
        throw new RecordServiceError(
          503,
          "ENTITY_AGGREGATE_IDENTITY_INVALID",
          "Aggregate identity enumeration is invalid",
        );
      seen.add(id);
      if (seen.size > 2000)
        throw new RecordServiceError(
          503,
          "ENTITY_AGGREGATE_CAPACITY",
          "Aggregate authorization exceeds its bounded capacity",
        );
      if (await authorize(id)) ids.push(id);
    }
    if (!page.pagination.hasMore) break;
    cursor = page.pagination.nextCursor;
    if (!cursor || cursors.has(cursor) || !page.data.length)
      throw new RecordServiceError(
        503,
        "ENTITY_AGGREGATE_CURSOR_INVALID",
        "Aggregate enumeration could not complete",
      );
    cursors.add(cursor);
  }
  const result = await repository.list(
    { ...query, recordIds: ids },
    transaction,
  );
  // A revocation during enumeration or SQL execution invalidates the entire result.
  for (const id of ids) {
    withinBudget();
    if (!(await authorize(id)))
      throw new RecordServiceError(
        403,
        "ENTITY_AGGREGATE_AUTHORIZATION_CHANGED",
        "Aggregate authorization changed during execution",
      );
  }
  withinBudget();
  return result;
}
