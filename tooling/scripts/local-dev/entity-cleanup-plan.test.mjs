import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCleanupPlan,
  validateCleanupScope,
  candidateTable,
} from "./entity-cleanup-plan.mjs";
const scope = {
  database: "athyper_studio",
  entityIds: ["00000000-0000-4000-8000-000000000001"],
  purpose: "approved local Entity reset",
};
const edge = (schema, table, target = "entity_change_set") => ({
  sourceSchema: schema,
  sourceTable: table,
  targetSchema: "metadata",
  targetTable: target,
  name: `${schema}_${table}_fk`,
});
function port(edges, children) {
  return {
    edges: async () => edges,
    roots: async (table) => (table === "entity_change_set" ? [["draft"]] : []),
    children,
  };
}
test("finite explicit product scope rejects missing, duplicate, malformed and foreign database inputs", () => {
  assert.deepEqual(validateCleanupScope(scope), scope);
  for (const bad of [
    { ...scope, database: "qa" },
    { ...scope, entityIds: [] },
    { ...scope, entityIds: [...scope.entityIds, ...scope.entityIds] },
    { ...scope, entityIds: ["'; DELETE"] },
    { ...scope, approve: true },
  ])
    assert.throws(() => validateCleanupScope(bad));
});
test("follows scoped evidence, preserves roots and reports outside-scope dependent ownership", async () => {
  const plan = await buildCleanupPlan(
    scope,
    port(
      [edge("metadata", "entity_field"), edge("snapshot", "entity_draft_save")],
      async (e) =>
        e.sourceSchema === "metadata"
          ? [
              { key: ["field"], scoped: true },
              { key: ["foreign"], scoped: false },
            ]
          : [{ key: ["snapshot"], scoped: true }],
    ),
  );
  assert.equal(plan.candidateRows, 3);
  assert.equal(plan.blockers[0].code, "DEPENDENT_OUTSIDE_RESET_SCOPE");
  assert.equal(plan.executable, false);
  assert.equal(
    plan.tables.some((t) => t.table === "entity"),
    false,
  );
});
test("AI or onboarding data blocks removing its parents and is never enrolled for deletion", async () => {
  const plan = await buildCleanupPlan(
    scope,
    port([edge("ai", "atlas_learning_inbox")], async () => [
      { key: ["learning"], scoped: true },
    ]),
  );
  assert.equal(
    plan.blockers[0].code,
    "PRESERVED_DEPENDENT_REFERENCES_RESET_ROW",
  );
  assert.equal(plan.candidateRows, 1);
  assert.equal(candidateTable("onboarding", "onboarding_case"), false);
  assert.equal(candidateTable("publication", "release"), false);
  assert.equal(candidateTable("metadata", "entity_field_identity_adoption"), false);
});
test("cycles terminate and composite key tuples are preserved", async () => {
  const cyclic = edge("metadata", "entity_change_set");
  const plan = await buildCleanupPlan(
    scope,
    port([cyclic], async () => [{ key: ["draft"], scoped: true }]),
  );
  assert.equal(plan.candidateRows, 1);
  const p = await buildCleanupPlan(
    scope,
    port([edge("snapshot", "entity_draft_save")], async () => [
      { key: ["draft", 4], scoped: true },
    ]),
  );
  assert.deepEqual(p.tables.find((t) => t.table === "entity_draft_save").keys, [
    ["draft", 4],
  ]);
});
test("invalid/unbounded primary-key discovery never produces an executable plan", async () => {
  await assert.rejects(
    () =>
      buildCleanupPlan(
        scope,
        port([edge("metadata", "entity_field")], async () => [
          { key: [null], scoped: true },
        ]),
      ),
    /PRIMARY_KEY/,
  );
});
