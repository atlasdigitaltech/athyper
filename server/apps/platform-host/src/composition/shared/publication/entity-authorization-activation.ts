import type { Authorizer } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { entityAuthorizationProfileHash } from "@athyper/server-service-records";

/** Activation requires an installed backend that qualifies the descriptor or
 * an exact approved rollout profile. Metadata alone cannot enable enforcement. */
export function assertEntityAuthorizationEnforceable(
  descriptors: readonly EntityRuntimeDescriptor[],
  targetPlane: Parameters<NonNullable<Authorizer["enforcedEntityProfile"]>>[0],
  authorizer: Pick<
    Authorizer,
    "enforcedEntityProfile" | "entityDescriptorSupported"
  >,
): void {
  for (const descriptor of descriptors) {
    const profile = descriptor.authorization;
    if (!profile) continue;
    const expected = authorizer.enforcedEntityProfile?.(targetPlane, profile.entityCode);
    if (descriptor.planeKey !== targetPlane || profile.planeKey !== targetPlane)
      throw new Error("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
    if (
      !expected &&
      authorizer.entityDescriptorSupported?.(descriptor)
    )
      continue;
    if (
      profile.fieldPolicies.some(
        (policy) => policy.representation === "masked",
      ) ||
      expected !==
        entityAuthorizationProfileHash(profile)
    )
      throw new Error("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
  }
}
