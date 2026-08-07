// packages/shared/platform-auth/auth-common/src/roles.ts
//
// Phase G â€” Shared role-extraction helpers.
//
// Pure traversal of the JWT `resource_access` claim shape. Used by:
//   - server runtime: AUTHORIZED check in the platform-context middleware
//   - BFF: AUTHORIZED re-check on refresh + periodic revalidation
//   - /api/auth/verify: scoped role headers (X-Client-Roles-${plane}-web)
//
// All three previously had their own copy. Consolidating here ensures a
// rename or shape change in one surface can't drift the others silently.

/**
 * Return all role names declared by `resource_access[clientId].roles`.
 * Returns an empty array when:
 *   - resourceAccess is missing or not an object
 *   - the client isn't in resourceAccess
 *   - the roles array is missing or contains non-string entries
 *
 * Non-string entries are filtered (rather than throwing) because the parse
 * boundary lives in @athyper/runtime-contracts; this helper trusts that any
 * caller upstream of it has already validated the claim shape.
 */
export function clientRolesFromAccess(
  resourceAccess: unknown,
  clientId: string,
): string[] {
  if (!resourceAccess || typeof resourceAccess !== "object") return [];
  const access = resourceAccess as Record<string, unknown>;
  const clientAccess = access[clientId];
  if (!clientAccess || typeof clientAccess !== "object") return [];
  const roles = (clientAccess as Record<string, unknown>).roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((r): r is string => typeof r === "string");
}

/**
 * True iff resource_access[clientId].roles contains `role`.
 */
export function clientHasRole(
  resourceAccess: unknown,
  clientId: string,
  role: string,
): boolean {
  return clientRolesFromAccess(resourceAccess, clientId).includes(role);
}

/**
 * Convenience: the standard AUTHORIZED check used by every plane web client.
 * Equivalent to clientHasRole(resourceAccess, `${planeKey}-web`, "AUTHORIZED")
 * but the function name documents the intent at call sites.
 */
export function hasAuthorizedRoleForPlane(
  resourceAccess: unknown,
  planeKey: string,
): boolean {
  return clientHasRole(resourceAccess, `${planeKey}-web`, "AUTHORIZED");
}

/**
 * Return all realm-level roles declared by `realm_access.roles`. Same
 * tolerance behaviour as clientRolesFromAccess.
 */
export function realmRolesFromAccess(realmAccess: unknown): string[] {
  if (!realmAccess || typeof realmAccess !== "object") return [];
  const roles = (realmAccess as Record<string, unknown>).roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((r): r is string => typeof r === "string");
}
