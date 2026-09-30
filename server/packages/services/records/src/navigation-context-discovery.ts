import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { entityScopeResolvers } from "@athyper/server-contract-metadata";
import { usesEntityBackendAuthorization } from "./entity-backend-authorizer.js";

/** Admit a navigation link to a context-gated destination, never its rows or a
 * command. Each candidate is reauthorized through the active authorizer. */
export async function canDiscoverScopedNavigation(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  operationKey: string,
  permissionCode: string,
): Promise<boolean> {
  // Validate the selected backend profile when present. Scoped navigation also
  // applies to ordinary IAM and signed local previews; neither selects a work
  // context until the destination asks the user for one.
  usesEntityBackendAuthorization(authorizer, context, descriptor);
  const p = context.permissions;
  if (
    p.tenantId !== context.tenantId ||
    p.principalId !== context.principalId ||
    p.planeKey !== context.planeKey
  )
    return false;
  const operation = descriptor.authorization?.operations.find(
    (o) => o.key === operationKey,
  );
  if (
    !operation ||
    operation.permissionCode !== permissionCode ||
    operation.effect !== "read" ||
    operation.target !== "collection" ||
    operation.requiresPreflight
  )
    return false;
  const required = entityScopeResolvers[operation.scope];
  if (required.length !== 1) return false;
  const coordinate = required[0]!;
  const scopes = p.authorizationScopes?.find(
    (s) => s.permissionCode === permissionCode,
  );
  const candidates =
    coordinate === "operatingOrganizationId"
      ? scopes?.operatingOrganizationIds
      : coordinate === "companyCodeId"
        ? scopes?.companyCodeIds
        : undefined;
  if (!candidates?.length || candidates.length > 100) return false;
  for (const value of candidates) {
    const decision = await authorizer.authorize({
      context,
      permissionCode,
      resource: {
        tenantId: context.tenantId,
        entityCode: descriptor.entityCode,
        resourceCode: descriptor.entityCode,
        operationKey,
        [coordinate]: value,
      },
    });
    if (decision.allowed) return true;
    if (decision.reason === "entity_authorization_unavailable") return false;
  }
  return false;
}
