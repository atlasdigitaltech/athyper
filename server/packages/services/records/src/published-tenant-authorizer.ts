import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import { entityAuthorizationProfileHash } from "./entity-authorization-rollout.js";

/** Closed registry of the read handlers and ownership semantics implemented here.
 * Qualification admits a binding, never a principal. Every call still reloads
 * the published descriptor and current IAM evidence. */
export function tenantRecordProfileSupported(value: unknown): boolean {
  const d = value as EntityRuntimeDescriptor | undefined;
  const p = d?.authorization,
    runtime = d?.authorizationRuntime;
  if (!d || !p || !runtime || !d.storage || !Array.isArray(d.fields))
    return false;
  if (
    d.entityCode !== p.entityCode ||
    d.planeKey !== p.planeKey ||
    runtime.schemaVersion !== 1 ||
    runtime.runtimeVersion !== "entity-authorization.v1" ||
    p.ownership !== "tenant.record.v1" ||
    p.directory.population !== "tenant" ||
    p.directory.operation !== "list" ||
    p.recordReadOperation !== "read" ||
    p.relationships.length ||
    p.deferredOperations?.length ||
    p.operations.length !== 2 ||
    runtime.bindings.length !== 2 ||
    d.ownerAccess ||
    d.collectionRelationship ||
    (d.directoryScope && d.directoryScope.mode !== "tenant")
  )
    return false;
  // Shared reference storage is explicitly published; all other storage must
  // carry the tenant predicate implemented by the repository.
  if (
    !d.storage.tenantField &&
    !(
      d.storage.schema === "shared" &&
      d.referenceCapability === "common.platform.reference.view"
    )
  )
    return false;
  for (const key of ["list", "read"] as const) {
    const operation = p.operations.find((o) => o.key === key);
    const binding = runtime.bindings.find((b) => b.operation === key);
    if (
      !operation ||
      operation.scope !== "tenant.record.v1" ||
      operation.effect !== "read" ||
      operation.target !== (key === "list" ? "collection" : "existing") ||
      operation.requiresParentRead ||
      operation.requiresPreflight ||
      d.operations[key]?.authorizationMode === "permission_only" ||
      operation.permissionCode !== d.operations[key]?.permissionCode ||
      binding?.handler !== `entity.record.${key}.v1` ||
      binding.resolver !== "tenant.record.v1"
    )
      return false;
  }
  const covered = new Set<string>();
  for (const policy of p.fieldPolicies) {
    if (
      !["plain", "masked"].includes(policy.representation) ||
      policy.readOperation !== "read" ||
      policy.revealOperation ||
      policy.writeOperations.length ||
      policy.queryUses.some(
        (use) => !["search", "filter", "sort", "group"].includes(use),
      )
    )
      return false;
    for (const key of policy.fields) {
      if (covered.has(key) || !d.fields.some((f) => f.key === key))
        return false;
      covered.add(key);
    }
  }
  return d.fields.every((f) => !f.writableOn.length && covered.has(f.key));
}

export function createPublishedTenantRecordAuthorizer(options: {
  authority: Authorizer;
  metadata: MetadataReader;
  refreshContext(
    context: VerifiedRequestContext,
  ): Promise<VerifiedRequestContext>;
  exists(
    context: VerifiedRequestContext,
    descriptor: EntityRuntimeDescriptor,
    recordId: string,
  ): Promise<boolean>;
}): Authorizer {
  const authority = options.authority;
  return {
    ...(authority.enforcedEntityProfile
      ? {
          enforcedEntityProfile:
            authority.enforcedEntityProfile.bind(authority),
        }
      : {}),
    ...(authority.checkSourceConstraints
      ? {
          checkSourceConstraints:
            authority.checkSourceConstraints.bind(authority),
        }
      : {}),
    aggregateAuthorizationCovered(context, descriptor) {
      const entity = descriptor as EntityRuntimeDescriptor;
      // This adapter's qualified tenant-record profile has no record-level
      // policy beyond existence. Aggregate enumeration occurs in the same
      // repository that establishes existence, after collection authorization.
      // Explicit rollout backends retain their own record-level enforcement.
      return (
        !authority.enforcedEntityProfile?.(
          context.planeKey,
          entity.entityCode,
        ) && tenantRecordProfileSupported(entity)
      );
    },
    entityDescriptorSupported: tenantRecordProfileSupported,
    async authorize(request) {
      const entityCode = request.resource?.entityCode;
      if (typeof entityCode !== "string") return authority.authorize(request);
      try {
        const published = await options.metadata.getEntityDescriptor(
          request.context,
          entityCode,
        );
        if (!published?.authorization) return authority.authorize(request);
        const context = await options.refreshContext(request.context);
        if (
          context.tenantId !== request.context.tenantId ||
          context.planeKey !== request.context.planeKey ||
          context.principalId !== request.context.principalId ||
          !context.tenantId
        )
          return { allowed: false, reason: "entity_authorization_unavailable" };
        const d = await options.metadata.getEntityDescriptor(
          context,
          entityCode,
        );
        if (!d?.authorization)
          return { allowed: false, reason: "entity_authorization_unavailable" };
        // Explicit qualified rollout backends retain ownership of their profiles.
        if (authority.enforcedEntityProfile?.(context.planeKey, entityCode))
          return authority.authorize({ ...request, context });
        if (d.planeKey !== context.planeKey || !tenantRecordProfileSupported(d))
          return { allowed: false, reason: "entity_authorization_unavailable" };
        const resource = request.resource!;
        if (
          resource.authorizationDescriptorHash !== undefined &&
          resource.authorizationDescriptorHash !== d.compiledHash
        )
          return { allowed: false, reason: "entity_authorization_unavailable" };
        if (
          resource.authorizationProfileHash !== undefined &&
          resource.authorizationProfileHash !==
            entityAuthorizationProfileHash(d.authorization)
        )
          return { allowed: false, reason: "entity_authorization_unavailable" };
        if (
          resource.tenantId !== undefined &&
          resource.tenantId !== context.tenantId
        )
          return { allowed: false, reason: "entity_scope_mismatch" };
        const operation = d.authorization.operations.find(
          (o) => o.key === resource.operationKey,
        );
        if (!operation || operation.permissionCode !== request.permissionCode)
          return { allowed: false, reason: "entity_authorization_unmapped" };
        const decision = await authority.authorize({ ...request, context });
        if (!decision.allowed) return decision;
        if (decision.scope && !decision.scope.tenantWide)
          return { allowed: false, reason: "entity_scope_mismatch" };
        const uses = resource.authorizationFieldUses;
        if (uses !== undefined && !Array.isArray(uses))
          return { allowed: false, reason: "entity_field_use_denied" };
        for (const entry of [
          ...(Array.isArray(uses) ? uses : []),
          ...(resource.field !== undefined
            ? [{ field: resource.field, use: "read" }]
            : []),
        ]) {
          if (!entry || typeof entry !== "object")
            return { allowed: false, reason: "entity_field_use_denied" };
          const policy = d.authorization.fieldPolicies.find((p) =>
            p.fields.includes(entry.field),
          );
          if (
            !policy ||
            (entry.use !== "read" &&
              (policy.representation === "masked" ||
                !policy.queryUses.includes(entry.use)))
          )
            return { allowed: false, reason: "entity_field_use_denied" };
        }
        if (
          operation.target === "existing" &&
          (typeof resource.recordId !== "string" ||
            !(await options.exists(context, d, resource.recordId)))
        )
          return { allowed: false, reason: "entity_record_denied" };
        return decision;
      } catch {
        return { allowed: false, reason: "entity_authorization_unavailable" };
      }
    },
  };
}
