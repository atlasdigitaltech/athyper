import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";

/** Business-policy admission only, after IAM grant/deny/scope/MFA checks.
 * The backend separately retains source-domain and target authorization. This
 * does not translate grants or satisfy separation of duties for protected reads. */
export function isPublishedBusinessPartnerTargetRead(
  input: AuthorizationRequest,
  profile: EntityAuthorizationProfileV1 | undefined,
  selectedTenantId: string | undefined,
): boolean {
  if (
    !profile ||
    !selectedTenantId ||
    input.context.tenantId !== selectedTenantId ||
    input.context.planeKey !== "neon" ||
    profile.planeKey !== "neon" ||
    profile.entityCode !== "business_partner" ||
    input.resource?.["entityCode"] !== profile.entityCode ||
    !input.permissionCode.startsWith("neon.relationship.bp_target.")
  )
    return false;
  const operationKey = input.resource?.["operationKey"];
  if (
    typeof operationKey !== "string" ||
    profile.deferredOperations?.includes(operationKey)
  )
    return false;
  return profile.operations.some(
    (operation) =>
      operation.key === operationKey &&
      operation.permissionCode === input.permissionCode &&
      operation.effect === "read",
  );
}

/** Narrow business-policy admission for published, preflighted reveal operations.
 * IAM still checks each source and target grant, deny, scope, MFA and SoD;
 * the backend enforces parent admission/preflight and the service claims/audits use.
 */
export function isPublishedBusinessPartnerTargetReveal(
  input: AuthorizationRequest,
  profile: EntityAuthorizationProfileV1 | undefined,
  selectedTenantId: string | undefined,
): boolean {
  if (
    !profile ||
    !selectedTenantId ||
    input.context.tenantId !== selectedTenantId ||
    input.context.planeKey !== "neon" ||
    input.context.assurance !== "elevated" ||
    profile.planeKey !== "neon" ||
    profile.entityCode !== "business_partner" ||
    input.resource?.["entityCode"] !== profile.entityCode
  )
    return false;
  const key = input.resource?.["operationKey"];
  if (
    (key !== "bank_reveal" && key !== "tax_reveal") ||
    profile.deferredOperations?.includes(key)
  )
    return false;
  return profile.operations.some(
    (operation) =>
      operation.key === key &&
      operation.permissionCode === input.permissionCode &&
      input.permissionCode === `neon.relationship.bp_target.${key}` &&
      operation.effect === "reveal" &&
      operation.target === "existing" &&
      operation.requiresParentRead &&
      operation.requiresPreflight,
  );
}
