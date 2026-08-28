import type { AuthorizationDecision, Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityFieldDescriptor, EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { RecordServiceError } from "./errors.js";

export async function authorizeRecordListRead(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: EntityRuntimeDescriptor,
  scopeResource?: Readonly<Record<string, string>>,
): Promise<Extract<AuthorizationDecision, { readonly allowed: true }>> {
  const permissionCode = descriptor.operations["read"]?.permissionCode;
  if (!permissionCode) throw new RecordServiceError(409, "ENTITY_OPERATION_UNAVAILABLE", "Entity read operation is not published");
  const effective = await authorizer.authorize({
    context,
    permissionCode,
    resource: {
      tenantId: context.tenantId,
      entityCode: descriptor.entityCode,
      operationKey: "read",
      resourceCode: descriptor.entityCode,
      ...scopeResource,
    },
  });
  if (effective.allowed) return effective;
  if (effective.reason === "scope_coordinate_missing") {
    const base = await authorizer.authorize({ context, permissionCode });
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
  const decisions = await Promise.all(descriptor.fields.map(async (field) => {
    if (!field.readPermissionCode) return true;
    const decision = await authorizer.authorize({
      context,
      permissionCode: field.readPermissionCode,
      resource: {
        tenantId: context.tenantId,
        entityCode: descriptor.entityCode,
        operationKey: "read",
        resourceCode: descriptor.entityCode,
        field: field.key,
      },
    });
    return decision.allowed;
  }));
  return Object.freeze(descriptor.fields.filter((_field, index) => decisions[index]));
}
