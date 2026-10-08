import type {
  RecordRepository,
  RecordRepositoryListInput,
} from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

// Aggregate authorization must inspect the complete matching identity set, but
// individual record decisions are independent. Keep the number of concurrent
// policy evaluations bounded so a directory-sized exact count does not spend
// its entire execution budget waiting on serial authorization round trips.
const AUTHORIZATION_CONCURRENCY = 25;

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
  // Identity enumeration reads rows, so it never runs groups-only.
  const { cursor: _cursor, group: _group, groupsOnly: _groupsOnly, ...base } = query;
  const deadline = Date.now() + 5000;
  const withinBudget = () => {
    if (Date.now() > deadline)
      throw new RecordServiceError(
        503,
        "ENTITY_AGGREGATE_AUTHORIZATION_UNAVAILABLE",
        "Aggregate authorization could not complete within its execution budget",
      );
  };
  const authorizeBatch = async (recordIds: readonly string[]) => {
    const decisions = await Promise.all(
      recordIds.map((recordId) => authorize(recordId)),
    );
    withinBudget();
    return decisions;
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
    const pageIds: string[] = [];
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
      pageIds.push(id);
    }
    for (
      let offset = 0;
      offset < pageIds.length;
      offset += AUTHORIZATION_CONCURRENCY
    ) {
      const batch = pageIds.slice(offset, offset + AUTHORIZATION_CONCURRENCY);
      const decisions = await authorizeBatch(batch);
      for (const [index, allowed] of decisions.entries()) {
        if (allowed) ids.push(batch[index]!);
      }
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
  for (
    let offset = 0;
    offset < ids.length;
    offset += AUTHORIZATION_CONCURRENCY
  ) {
    const decisions = await authorizeBatch(
      ids.slice(offset, offset + AUTHORIZATION_CONCURRENCY),
    );
    if (decisions.some((allowed) => !allowed))
      throw new RecordServiceError(
        403,
        "ENTITY_AGGREGATE_AUTHORIZATION_CHANGED",
        "Aggregate authorization changed during execution",
      );
  }
  withinBudget();
  return result;
}
