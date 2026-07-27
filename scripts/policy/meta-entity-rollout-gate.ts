export const META_ENTITY_ROLLOUT_SEQUENCE = [
  "shadow",
  "internal_company_code",
  "internal_complex_document",
  "canary",
  "10",
  "25",
  "50",
  "100",
] as const;

export interface MetaEntityRolloutObservation {
  entityCode: string;
  tenantId: string | null;
  stage: typeof META_ENTITY_ROLLOUT_SEQUENCE[number];
  crossTenantAccess: number;
  partialPublication: number;
  hashMismatch: number;
  unexplainedDescriptorDrift: number;
  cacheInvalidationFailure: number;
  routeErrorRate: number;
  baselineRouteErrorRate: number;
  descriptorP95Ms: number;
  descriptorBudgetMs: number;
  bootstrapP95Ms: number;
  bootstrapBudgetMs: number;
  listP95Ms: number;
  listBudgetMs: number;
  detailP95Ms: number;
  detailBudgetMs: number;
}

export interface MetaEntityRolloutSnapshot {
  schemaVersion: 1;
  releaseWindowsStable: number;
  observations: MetaEntityRolloutObservation[];
}

export interface MetaEntityRolloutDecision {
  decision: "PROCEED" | "STOP";
  stopReasons: Array<{
    entityCode: string;
    tenantId: string | null;
    code: string;
    message: string;
  }>;
  fallbackRetirementAllowed: boolean;
  rollback: {
    disableV2ReadsForAffectedCohort: true;
    repointPreviousImmutableVersion: true;
    invalidateCaches: true;
    preserveFailedArtifactAndAudit: true;
    reverseAdditiveDdl: false;
  };
}

export function evaluateMetaEntityRollout(
  snapshot: MetaEntityRolloutSnapshot,
): MetaEntityRolloutDecision {
  const reasons: MetaEntityRolloutDecision["stopReasons"] = [];
  for (const item of snapshot.observations) {
    const stop = (condition: boolean, code: string, message: string) => {
      if (condition) reasons.push({
        entityCode: item.entityCode,
        tenantId: item.tenantId,
        code,
        message,
      });
    };
    stop(item.crossTenantAccess > 0, "CROSS_TENANT_ACCESS", "Any cross-tenant access stops rollout.");
    stop(item.partialPublication > 0, "PARTIAL_PUBLICATION", "Any partial publication stops rollout.");
    stop(item.hashMismatch > 0, "HASH_MISMATCH", "Any Contract/materialized/compiled hash mismatch stops rollout.");
    stop(
      item.unexplainedDescriptorDrift > 0,
      "DESCRIPTOR_DRIFT",
      "Unexplained legacy/v2 descriptor drift stops rollout.",
    );
    stop(
      item.cacheInvalidationFailure > 0,
      "CACHE_INVALIDATION_FAILURE",
      "Any committed publication cache-invalidation failure stops rollout.",
    );
    stop(
      item.routeErrorRate > Math.max(item.baselineRouteErrorRate * 1.25, item.baselineRouteErrorRate + 0.001),
      "ROUTE_ERROR_REGRESSION",
      "Route error rate exceeded the baseline regression ceiling.",
    );
    for (const [name, actual, budget] of [
      ["descriptor", item.descriptorP95Ms, item.descriptorBudgetMs],
      ["bootstrap", item.bootstrapP95Ms, item.bootstrapBudgetMs],
      ["list", item.listP95Ms, item.listBudgetMs],
      ["detail", item.detailP95Ms, item.detailBudgetMs],
    ] as const) {
      stop(actual > budget, "SLO_REGRESSION", `${name} p95 ${actual}ms exceeds ${budget}ms budget.`);
    }
  }
  return {
    decision: reasons.length === 0 ? "PROCEED" : "STOP",
    stopReasons: reasons,
    fallbackRetirementAllowed: reasons.length === 0
      && snapshot.releaseWindowsStable >= 2
      && snapshot.observations.some((item) => item.stage === "100"),
    rollback: {
      disableV2ReadsForAffectedCohort: true,
      repointPreviousImmutableVersion: true,
      invalidateCaches: true,
      preserveFailedArtifactAndAudit: true,
      reverseAdditiveDdl: false,
    },
  };
}
