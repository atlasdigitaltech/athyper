import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { HealthCheck } from "@athyper/server-foundation/observability";

/** Reassesses the active inventory on every startup/readiness probe. Request
 * admission independently checks the descriptor it actually resolved. */
export function createEntityReadinessHealth(options: {
  readonly inventory: () => Promise<readonly EntityRuntimeDescriptor[]>;
  readonly assertDescriptors: (
    descriptors: readonly EntityRuntimeDescriptor[],
  ) => Promise<void>;
}): HealthCheck {
  return async () => {
    try {
      await options.assertDescriptors(await options.inventory());
      return { status: "healthy" };
    } catch {
      return {
        status: "unhealthy",
        message: "Entity deployment support or active inventory is unavailable",
      };
    }
  };
}
