import assert from "node:assert/strict";
import { test } from "node:test";
import { createScopedMetaEntityAuthoringRepository } from "../../server/apps/platform-host/src/composition/scoped-meta-entity-authoring";
test("release inspection is forwarded through the host's authenticated transaction wrapper", async () => {
  const transaction = {} as never;
  const calls: unknown[] = [];
  const repository = createScopedMetaEntityAuthoringRepository(
    async (work) => work(transaction),
    (db) => {
      assert.equal(db, transaction);
      return {
        listInspectionReleases: async (tenant) => {
          calls.push([tenant]);
          return [];
        },
        readInspectionRelease: async (tenant, id) => {
          calls.push([tenant, id]);
          return null;
        },
      } as never;
    },
  );
  assert.deepEqual(await repository.listInspectionReleases!("tenant"), []);
  assert.equal(
    await repository.readInspectionRelease!("tenant", "release"),
    null,
  );
  assert.deepEqual(calls, [["tenant"], ["tenant", "release"]]);
});
