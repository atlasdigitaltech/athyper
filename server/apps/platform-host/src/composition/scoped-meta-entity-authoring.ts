import type { Kysely } from "kysely";
import type { MetaEntityAuthoringService } from "@athyper/server-plane-studio";
type MetaEntityAuthoringRepository = ConstructorParameters<
  typeof MetaEntityAuthoringService
>[0]["repository"];
/** Every repository call uses the authenticated tenant transaction, including reads. */
export function createScopedMetaEntityAuthoringRepository(
  run: <T>(
    work: (database: Kysely<Record<string, never>>) => Promise<T>,
  ) => Promise<T>,
  factory: (
    database: Kysely<Record<string, never>>,
  ) => MetaEntityAuthoringRepository,
): MetaEntityAuthoringRepository {
  return {
    list: (tenantId) =>
      run((db) => {
        const repo = factory(db);
        if (!repo.list) throw Error("AUTHORING_LIST_UNAVAILABLE");
        return repo.list(tenantId);
      }),
    forkDraft: (input) =>
      run((db) => {
        const repo = factory(db);
        if (!repo.forkDraft) throw Error("AUTHORING_FORK_UNAVAILABLE");
        return repo.forkDraft(input);
      }),
    createDraft: (input) => run((db) => factory(db).createDraft(input)),
    get: (id) => run((db) => factory(db).get(id)),
    loadGraph: (id) => run((db) => factory(db).loadGraph(id)),
    replaceGraph: (input) => run((db) => factory(db).replaceGraph(input)),
    recordValidation: (...args) =>
      run((db) => factory(db).recordValidation(...args)),
    recordTestRun: (...args) => run((db) => factory(db).recordTestRun(...args)),
    transition: (input) => run((db) => factory(db).transition(input)),
    createRelease: (input) => run((db) => factory(db).createRelease(input)),
    getSignedRelease: (id) => run((db) => factory(db).getSignedRelease(id)),
  };
}
