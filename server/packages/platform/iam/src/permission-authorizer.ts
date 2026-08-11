import type { Authorizer, EffectiveAuthorizationScope } from "@athyper/server-contract-auth";

/** Authorizes exclusively from the verified, immutable permission snapshot. */
export function createPermissionAuthorizer(): Authorizer {
  return {
    async authorize({ context, permissionCode }) {
      const permissions = context.permissions;
      if (permissions.denied.includes(permissionCode)) {
        return { allowed: false, reason: "denied_by_grant" };
      }
      if (permissions.planLocked.includes(permissionCode)) {
        return { allowed: false, reason: "plan_locked" };
      }
      if (permissions.planeExcluded.includes(permissionCode)) {
        return { allowed: false, reason: "plane_excluded" };
      }
      if (!permissions.allowed.includes(permissionCode)) {
        return { allowed: false, reason: "missing_permission" };
      }
      const scope: EffectiveAuthorizationScope | undefined = permissions.authorizationScopes
        .find((candidate) => candidate.permissionCode === permissionCode);
      return scope ? { allowed: true, scope } : { allowed: true };
    },
  };
}
