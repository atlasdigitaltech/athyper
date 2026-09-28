import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";
import type { EntityBackendPermissionTransition } from "@athyper/server-service-records";

/** Trusted composition input, never resource hints, URL parameters or user data.
 * This validates mapping consistency, not publication trust. The backend authority
 * still verifies its release and requires both source and target authorization. */
export function requireEntityPermissionTransitions(
  profile: EntityAuthorizationProfileV1,
  input: readonly EntityBackendPermissionTransition[] | undefined,
): readonly EntityBackendPermissionTransition[] {
  if (!Array.isArray(input)) throw new Error("ENTITY_PERMISSION_TRANSITIONS_REQUIRED");
  const seen = new Set<string>();
  const token = /^[a-z][a-z0-9_.-]{0,159}$/;
  return Object.freeze(input.map((transition: EntityBackendPermissionTransition) => {
    if (!transition || typeof transition.operationKey !== "string" ||
        typeof transition.sourcePermissionCode !== "string" || typeof transition.targetPermissionCode !== "string" ||
        !token.test(transition.operationKey) ||
        !token.test(transition.sourcePermissionCode) || !token.test(transition.targetPermissionCode))
      throw new Error("ENTITY_PERMISSION_TRANSITION_INVALID");
    const operation = profile.operations.find(item => item.key === transition.operationKey);
    const key = `${transition.operationKey}:${transition.sourcePermissionCode}`;
    if (!operation || profile.deferredOperations?.includes(operation.key) ||
        operation.permissionCode !== transition.targetPermissionCode ||
        transition.sourcePermissionCode === transition.targetPermissionCode || seen.has(key))
      throw new Error("ENTITY_PERMISSION_TRANSITION_MISMATCH");
    seen.add(key);
    return Object.freeze({
      operationKey: transition.operationKey,
      sourcePermissionCode: transition.sourcePermissionCode,
      targetPermissionCode: transition.targetPermissionCode,
    });
  }));
}
