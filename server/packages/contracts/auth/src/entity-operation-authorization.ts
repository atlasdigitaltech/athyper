import type { AuthorizationDecision, AuthorizationRequest, Authorizer } from "./index.js";

/** One entry point for explicit permissions and published operations without one.
 * The installed Entity authorizer must prove omission from current metadata. */
export function authorizeEntityOperation(
  authorizer: Authorizer,
  request: Omit<AuthorizationRequest, "permissionCode"> & { readonly permissionCode?: string },
): Promise<AuthorizationDecision> {
  if (request.permissionCode !== undefined) {
    if (!request.permissionCode.trim())
      return Promise.resolve({ allowed: false, reason: "entity_permission_invalid" });
    return authorizer.authorize({ ...request, permissionCode: request.permissionCode });
  }
  return authorizer.authorizeEntityOperation?.(request)
    ?? Promise.resolve({ allowed: false, reason: "entity_authorization_unavailable" });
}
