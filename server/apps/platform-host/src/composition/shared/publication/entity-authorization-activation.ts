import type { Authorizer } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { entityAuthorizationProfileHash, isLegacySafeEntityAuthorization } from "@athyper/server-service-records";

/** Activation must not publish a policy this host cannot enforce. A profile is
 * activatable only when the request-time authorizer has installed exactly that
 * profile (same hash), or the entity is a public read-only directory that keeps
 * its existing permission and tenant predicates. Masked fields are never
 * legacy-safe, and are refused at activation even when a hash matches. */
export function assertEntityAuthorizationEnforceable(
  descriptors: readonly EntityRuntimeDescriptor[],
  targetPlane: Parameters<NonNullable<Authorizer["enforcedEntityProfile"]>>[0],
  authorizer: Pick<Authorizer, "enforcedEntityProfile">,
): void {
  for (const descriptor of descriptors) {
    const profile = descriptor.authorization;
    if (!profile || isLegacySafeEntityAuthorization(descriptor)) continue;
    if (profile.fieldPolicies.some(policy => policy.representation === "masked") ||
      authorizer.enforcedEntityProfile?.(targetPlane, profile.entityCode) !== entityAuthorizationProfileHash(profile))
      throw new Error("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
  }
}
