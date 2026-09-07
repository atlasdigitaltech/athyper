import { createHash } from "node:crypto";

/** Stable FNV-1a percentage bucket. Do not change this algorithm during a rollout. */
export function stablePercentageCohort(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0) % 100;
}

export type FeatureCohortStrategy = "tenant_sha256_v1" | "principal_fnv1a_v2";

/** Versioned feature assignment. Inputs and hash details are compatibility contracts. */
export function featurePercentageCohort(
  strategy: FeatureCohortStrategy,
  tenantId: string,
  principalId: string,
  featureCode: string,
): number {
  switch (strategy) {
    case "tenant_sha256_v1":
      return (
        Number.parseInt(
          createHash("sha256")
            .update(`${tenantId}:${featureCode}`)
            .digest("hex")
            .slice(0, 8),
          16,
        ) % 100
      );
    case "principal_fnv1a_v2":
      return stablePercentageCohort(
        `${tenantId}:${principalId}:${featureCode}`,
      );
    default:
      throw new Error(
        `Unsupported feature cohort strategy: ${String(strategy)}`,
      );
  }
}
