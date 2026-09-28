import {
  createEntityListService,
  createRecordListExecutor,
  createRecordQueryService,
} from "@athyper/server-service-records";

type Presentation = Omit<Parameters<typeof createEntityListService>[0],
  "metadata" | "authorizer" | "listExecutor" | "queries" | "collectionScopes">;

/** Shared read composition. Policy/scope resolvers remain explicit dependencies. */
export function createEntityReadRuntime<Transaction>(
  options: Parameters<typeof createRecordListExecutor<Transaction>>[0],
  presentation: Presentation = {},
) {
  const listExecutor = createRecordListExecutor(options);
  const queries = createRecordQueryService(options, listExecutor);
  const lists = createEntityListService({
    ...presentation,
    metadata: options.metadata,
    authorizer: options.authorizer,
    listExecutor,
    queries,
    ...(options.collectionScopes ? { collectionScopes: options.collectionScopes } : {}),
  });
  return { listExecutor, queries, lists };
}
