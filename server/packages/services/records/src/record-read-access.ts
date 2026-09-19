import { usesEntityBackendAuthorization } from "./entity-backend-authorizer.js";
import type { AuthorizationDecision, Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityFieldDescriptor, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { RecordServiceError } from "./errors.js";

export async function authorizeRecordListRead(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  scopeResource?: Readonly<Record<string, string>>,
): Promise<Extract<AuthorizationDecision, { readonly allowed: true }>> {
  const profile = usesEntityBackendAuthorization(authorizer,context,descriptor) ? descriptor.authorization : undefined;
  const operationKey = profile && !scopeResource?.["recordId"] ? profile.directory.operation : "read";
  const permissionCode = profile?.operations.find(operation => operation.key === operationKey)?.permissionCode ?? descriptor.operations["read"]?.permissionCode;
  if (!permissionCode) throw new RecordServiceError(409, "ENTITY_OPERATION_UNAVAILABLE", "Entity read operation is not published");
  const permissionOnly = descriptor.operations["read"]?.authorizationMode === "permission_only";
  const observation = { entityCode: descriptor.entityCode, operationKey: scopeResource?.["recordId"] ? "read" : "discover", ...(scopeResource?.["recordId"] ? { recordId: scopeResource["recordId"] } : {}), surface: scopeResource?.["recordId"] ? "record" as const : "list" as const, phase: "discover" as const };
  const effective = await authorizer.authorize({
    observation,
    context,
    permissionCode,
    resource: permissionOnly ? {
      tenantId: context.tenantId,
      ...scopeResource,
    } : {
      tenantId: context.tenantId,
      entityCode: descriptor.entityCode,
      operationKey,
      resourceCode: descriptor.entityCode,
      ...scopeResource,
    },
  });
  if (effective.allowed) return effective;
  // Published directory contracts own row scope; coarse permission admission
  // still enforces denials, entitlements, and policy gates. Never retry a deny.
  if (descriptor.directoryScope && effective.reason === "scope_not_contained") {
    const base = await authorizer.authorize({ context, permissionCode, observation });
    if (base.allowed) return base;
  }
  if (!permissionOnly && effective.reason === "scope_coordinate_missing") {
    const base = await authorizer.authorize({ context, permissionCode, observation });
    if (base.allowed && base.scope && !base.scope.tenantWide) return base;
  }
  throw new RecordServiceError(403, "FORBIDDEN", "Record operation is not permitted");
}

/**
 * Field-level read admission. Every decision receives the same tenant/entity
 * coordinates as the parent record authorization, preventing policy drift
 * between list descriptors and repository projections.
 */
export async function readableRecordFields(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
): Promise<readonly EntityFieldDescriptor[]> {
  const profile=usesEntityBackendAuthorization(authorizer,context,descriptor)?descriptor.authorization:undefined;
  const decisions = await Promise.all(descriptor.fields.map(async (field) => {
    const policy = profile?.fieldPolicies.find(group => group.fields.includes(field.key));
    const operationKey = profile && policy?.readOperation === profile.recordReadOperation && profile.ownership === "tenant.record.v1" && profile.directory.population === "tenant" ? profile.directory.operation : policy?.readOperation ?? "read";
    const permissionCode = profile?.operations.find(operation => operation.key === operationKey)?.permissionCode ?? field.readPermissionCode;
    if (!permissionCode) return !profile;
    const decision = await authorizer.authorize({
      context,
      permissionCode,
      observation: { entityCode: descriptor.entityCode, surface: "field", phase: "discover" },
      resource: {
        tenantId: context.tenantId,
        entityCode: descriptor.entityCode,
        operationKey,
        resourceCode: descriptor.entityCode,
        field: field.key,
      },
    });
    return decision.allowed;
  }));
  return Object.freeze(descriptor.fields.filter((_field, index) => decisions[index]));
}
