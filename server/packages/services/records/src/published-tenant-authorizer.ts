import type {
  Authorizer,
  AuthorizationRequest,
  AuthorizationDecision,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import { entityAuthorizationProfileHash } from "./entity-authorization-rollout.js";
import { readEvidence } from "@athyper/server-foundation/context";

/** Closed registry of the read handlers and ownership semantics implemented here.
 * Qualification admits a binding, never a principal. Every call still reloads
 * the published descriptor and current IAM evidence. */
export function tenantRecordProfileSupported(value: unknown): boolean {
  return recordProfileSupported(value, false);
}

/** Owner profiles also require an installed transactional owner adapter. */
export function ownerRecordProfileSupported(value: unknown): boolean {
  return recordProfileSupported(value, true);
}

function recordProfileSupported(value: unknown, owned: boolean): boolean {
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
    Boolean(d.ownerAccess) !== owned ||
    runtime.bindings.length !== p.operations.length ||
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
  const keys = owned
    ? [
        "list",
        "read",
        ...["create", "patch"].filter((key) => d.operations[key]),
      ]
    : ["list", "read"];
  if (d.operations.export) keys.push("export");
  if (p.operations.length !== keys.length) return false;
  if (owned) {
    const owner = d.ownerAccess!;
    const field = d.fields.find((f) => f.key === owner.ownerField);
    if (
      owner.schemaVersion !== 1 ||
      !d.storage.tenantField ||
      !field ||
      field.writableOn.length ||
      !owner.administerPermission ||
      keys.some(
        (key) =>
          d.operations[key]?.permissionCode === owner.administerPermission,
      ) ||
      (keys.includes("patch") && !d.storage.versionField)
    )
      return false;
  }
  for (const key of keys) {
    const operation = p.operations.find((o) => o.key === key);
    const binding = runtime.bindings.find((b) => b.operation === key);
    if (
      !operation ||
      !d.operations[key] ||
      operation.scope !== "tenant.record.v1" ||
      operation.effect !==
        (["create", "patch"].includes(key) ? "write" : "read") ||
      operation.target !==
        (["list", "export"].includes(key)
          ? "collection"
          : key === "create"
            ? "proposed"
            : "existing") ||
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
      policy.writeOperations.some(
        (key) =>
          !owned || !["create", "patch"].includes(key) || !keys.includes(key),
      ) ||
      policy.queryUses.some(
        (use) => !["search", "filter", "sort", "group", ...(keys.includes("export") ? ["export"] : [])].includes(use),
      )
    )
      return false;
    for (const key of policy.fields) {
      if (covered.has(key) || !d.fields.some((f) => f.key === key))
        return false;
      const field = d.fields.find((f) => f.key === key)!;
      if (
        field.writableOn.some(
          (op: string) => !policy.writeOperations.includes(op),
        ) ||
        policy.writeOperations.some(
          (op) => !field.writableOn.includes(op as "create" | "patch"),
        )
      )
        return false;
      covered.add(key);
    }
  }
  return d.fields.every((f) => covered.has(f.key));
}

export function createPublishedTenantRecordAuthorizer(options: {
  authority: Authorizer;
  /** Host has installed owner RLS preparation for reads, writes and existence checks. */
  ownerAccess?: boolean;
  /** Dedicated IAM policy evaluator for qualified owner administration. */
  ownerAuthority?: Authorizer;
  actionAuthority?: Authorizer;
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
  const supported = (value: unknown) =>
    tenantRecordProfileSupported(value) ||
    (options.ownerAccess === true && ownerRecordProfileSupported(value));
  const descriptor = (context: VerifiedRequestContext, entityCode: string) =>
    readEvidence(options.metadata, context, entityCode, () =>
      options.metadata.getEntityDescriptor(context, entityCode),
    );
  const evaluate = async (request: Omit<AuthorizationRequest, "permissionCode"> & { readonly permissionCode?: string }): Promise<AuthorizationDecision> => {
      const entityCode = request.resource?.entityCode;
      if (typeof entityCode !== "string") return permissionDecision(authority, request);
      try {
        const published = await descriptor(request.context, entityCode);
        if (!published?.authorization) return permissionDecision(authority, request);
        const context = await readEvidence(
          options.refreshContext,
          request.context,
          "iam",
          () => options.refreshContext(request.context),
        );
        if (
          context.tenantId !== request.context.tenantId ||
          context.planeKey !== request.context.planeKey ||
          context.principalId !== request.context.principalId ||
          !context.tenantId
        )
          return { allowed: false, reason: "entity_authorization_unavailable" };
        const d = await descriptor(context, entityCode);
        if (!d?.authorization)
          return { allowed: false, reason: "entity_authorization_unavailable" };
        // Explicit qualified rollout backends retain ownership of their profiles.
        if (authority.enforcedEntityProfile?.(context.planeKey, entityCode))
          return permissionDecision(authority, { ...request, context });
        if (d.planeKey !== context.planeKey || !supported(d))
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
        if(resource.registeredActionCheck===true) {
          const action=d.actions?.find(action=>action.code===resource.actionCode);
          if(!options.actionAuthority || !action || action.permissionCode!==request.permissionCode || action.handlerKey!==resource.actionHandlerKey || resource.operationKey!==action.code || typeof resource.recordId!=='string')
            return {allowed:false,reason:'entity_authorization_unmapped'};
          return permissionDecision(options.actionAuthority, {...request,context});
        }
        // Field permissions are additional to the operation's admission. An
        // omitted operation permission cannot remove an explicit field grant.
        if (resource.entityFieldPermission === "read" || resource.entityFieldPermission === "write") {
          const field = d.fields.find(field => field.key === resource.field);
          const fieldPermission = resource.entityFieldPermission === "read"
            ? field?.readPermissionCode : field?.writePermissionCode;
          if (!field || !fieldPermission || fieldPermission !== request.permissionCode ||
              !d.operations[String(resource.operationKey)])
            return { allowed: false, reason: "entity_field_permission_unmapped" };
          return permissionDecision(authority, { ...request, context, resource: {
            tenantId: context.tenantId, resourceCode: entityCode, field: field.key,
            ...(typeof resource.recordId === "string" ? { recordId: resource.recordId } : {}),
          } });
        }
        // Separate internal owner-administration check. It never substitutes for
        // the operation permission; the record pipeline requires both boundaries.
        if (resource.ownerAccessCheck === true) {
          if (
            !d.ownerAccess ||
            request.permissionCode !== d.ownerAccess.administerPermission ||
            !d.authorization.operations.some(
              (o) => o.key === resource.operationKey,
            )
          )
            return { allowed: false, reason: "entity_authorization_unmapped" };
          const decision = await permissionDecision(
            options.ownerAuthority ?? authority, {
            ...request,
            context,
            // This capability has its own tenant grant, not an entity-operation
            // binding. The published operation is authorized independently.
            resource: {
              tenantId: context.tenantId,
              ownerEntityCode: d.entityCode,
              ownerOperationKey: resource.operationKey,
              authorizationDescriptorHash: d.compiledHash,
            },
          });
          return decision.allowed &&
            decision.scope &&
            !decision.scope.tenantWide
            ? { allowed: false, reason: "entity_scope_mismatch" }
            : decision;
        }
        const operation = d.authorization.operations.find(
          (o) => o.key === resource.operationKey,
        );
        if (!operation || operation.permissionCode !== request.permissionCode)
          return { allowed: false, reason: "entity_authorization_unmapped" };
        if (request.permissionCode === undefined) {
          // Permission omission never disables an independently published policy.
          if (d.policyBindings?.some(binding => binding.enforcement === "enforce"))
            return { allowed: false, reason: "entity_policy_evaluator_required" };
          const snapshot = context.permissions;
          if (snapshot.tenantId !== context.tenantId || snapshot.planeKey !== context.planeKey || snapshot.principalId !== context.principalId)
            return { allowed: false, reason: "entity_scope_mismatch" };
          // A stale permission projection must be reconciled, not treated as omission.
          if (snapshot.operationBindings?.some(binding => binding.entityCode === entityCode && binding.operationKey === operation.key))
            return { allowed: false, reason: "entity_permission_projection_conflict" };
        }
        const decision: AuthorizationDecision = request.permissionCode === undefined
          ? { allowed: true }
          : await permissionDecision(authority, { ...request, context });
        if (!decision.allowed) return decision;
        if (decision.scope && !decision.scope.tenantWide)
          return { allowed: false, reason: "entity_scope_mismatch" };
        const writeFields = resource.authorizationWriteFields;
        if (
          writeFields !== undefined &&
          (!Array.isArray(writeFields) ||
            writeFields.some(
              (field) =>
                typeof field !== "string" ||
                operation.effect !== "write" ||
                !d.authorization!.fieldPolicies.some(
                  (p) =>
                    p.fields.includes(field) &&
                    p.writeOperations.includes(operation.key),
                ),
            ))
        )
          return { allowed: false, reason: "entity_field_write_denied" };
        // Field admission is a separate check; record operations still require
        // their own existing-record admission and transactional owner scope.
        if (resource.field !== undefined && operation.effect === "write") {
          const policy = d.authorization.fieldPolicies.find((p) =>
            p.fields.includes(resource.field as string),
          );
          return typeof resource.field === "string" &&
            policy?.writeOperations.includes(operation.key)
            ? decision
            : { allowed: false, reason: "entity_field_write_denied" };
        }
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
  };
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
      // These qualified profiles enforce record scope through the repository:
      // tenant predicates and, for owner profiles, transaction-local owner RLS.
      // The list executor prepares owner scope before rows and aggregates.
      // Explicit rollout backends retain their own record-level enforcement.
      return (
        !authority.enforcedEntityProfile?.(
          context.planeKey,
          entity.entityCode,
        ) && supported(entity)
      );
    },
    entityDescriptorSupported: supported,
    authorize: evaluate,
    authorizeEntityOperation: evaluate,
  };
}

function permissionDecision(authority: Authorizer, request: Omit<AuthorizationRequest, "permissionCode"> & { readonly permissionCode?: string }): Promise<AuthorizationDecision> {
  return request.permissionCode === undefined
    ? Promise.resolve({ allowed: false, reason: "entity_authorization_unavailable" })
    : authority.authorize({ ...request, permissionCode: request.permissionCode });
}
