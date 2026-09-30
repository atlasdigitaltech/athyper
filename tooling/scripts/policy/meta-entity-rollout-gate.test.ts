import assert from "node:assert/strict";
import test from "node:test";
import {
  META_ENTITY_ROLLOUT_SEQUENCE,
  evaluateMetaEntityRollout,
  type MetaEntityRolloutObservation,
} from "./meta-entity-rollout-gate";

const healthy: MetaEntityRolloutObservation = {
  entityCode: "company_code",
  tenantId: null,
  stage: "100",
  crossTenantAccess: 0,
  partialPublication: 0,
  hashMismatch: 0,
  unexplainedDescriptorDrift: 0,
  cacheInvalidationFailure: 0,
  routeErrorRate: 0.001,
  baselineRouteErrorRate: 0.001,
  descriptorP95Ms: 20,
  descriptorBudgetMs: 50,
  bootstrapP95Ms: 30,
  bootstrapBudgetMs: 75,
  listP95Ms: 100,
  listBudgetMs: 250,
  detailP95Ms: 90,
  detailBudgetMs: 250,
};

test("rollout sequence is shadow, pilots, canary, then 10/25/50/100", () => {
  assert.deepEqual(META_ENTITY_ROLLOUT_SEQUENCE, [
    "shadow", "internal_company_code", "internal_complex_document",
    "canary", "10", "25", "50", "100",
  ]);
});

test("healthy 100% rollout needs two stable windows before fallback retirement", () => {
  assert.equal(evaluateMetaEntityRollout({
    schemaVersion: 1, releaseWindowsStable: 1, observations: [healthy],
  }).fallbackRetirementAllowed, false);
  const result = evaluateMetaEntityRollout({
    schemaVersion: 1, releaseWindowsStable: 2, observations: [healthy],
  });
  assert.equal(result.decision, "PROCEED");
  assert.equal(result.fallbackRetirementAllowed, true);
});

for (const [property, code] of [
  ["crossTenantAccess", "CROSS_TENANT_ACCESS"],
  ["partialPublication", "PARTIAL_PUBLICATION"],
  ["hashMismatch", "HASH_MISMATCH"],
  ["unexplainedDescriptorDrift", "DESCRIPTOR_DRIFT"],
  ["cacheInvalidationFailure", "CACHE_INVALIDATION_FAILURE"],
] as const) {
  test(`${property} automatically stops rollout`, () => {
    const result = evaluateMetaEntityRollout({
      schemaVersion: 1,
      releaseWindowsStable: 10,
      observations: [{ ...healthy, [property]: 1 }],
    });
    assert.equal(result.decision, "STOP");
    assert.ok(result.stopReasons.some((reason) => reason.code === code));
    assert.equal(result.rollback.reverseAdditiveDdl, false);
    assert.equal(result.rollback.preserveFailedArtifactAndAudit, true);
  });
}

test("route and latency regressions stop rollout", () => {
  const result = evaluateMetaEntityRollout({
    schemaVersion: 1,
    releaseWindowsStable: 2,
    observations: [{
      ...healthy,
      routeErrorRate: 0.01,
      detailP95Ms: healthy.detailBudgetMs + 1,
    }],
  });
  assert.equal(result.decision, "STOP");
  assert.ok(result.stopReasons.some((reason) => reason.code === "ROUTE_ERROR_REGRESSION"));
  assert.ok(result.stopReasons.some((reason) => reason.code === "SLO_REGRESSION"));
});
