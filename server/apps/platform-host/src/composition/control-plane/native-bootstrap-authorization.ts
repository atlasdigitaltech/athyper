import type {
  ExpandedNativeMetaEntityGraph,
  NormalizedCoreContext,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileNativeAuthorization,
  sha256,
  type NativeAuthorizationContext,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { ENTITY_RECORD_READ_REGISTRATION } from "../shared/entity-runtime/read-registrations.js";

/** Compose compiler semantics from the same inventory as real read callables.
 * Exact authored permission declarations survive; this neither resolves a permission
 * grant nor establishes installed F8 evidence. Unsupported scope semantics reject.
 */
export function resolveNativeBootstrapAuthorization(
  graph: ExpandedNativeMetaEntityGraph,
  identities: NormalizedCoreContext["identities"],
  maximumMembers: number,
): NativeAuthorizationContext {
  const fail = (): never => {
    throw Error("PRODUCT_NATIVE_AUTHORIZATION_BINDING_UNSUPPORTED");
  };
  const registration = ENTITY_RECORD_READ_REGISTRATION;
  const profiles = graph.referenceMembers?.members.authorizationProfile;
  if (
    !profiles ||
    profiles.length !== 1 ||
    profiles[0]!.targetPlane !== "studio" ||
    profiles[0]!.ownershipResolverKey !== registration.resolver.key ||
    profiles[0]!.ownershipResolverVersion !== registration.resolver.version ||
    !graph.ownedLabels ||
    graph.authoringSource.tenantId !== null ||
    !Number.isSafeInteger(maximumMembers) ||
    maximumMembers < 1
  )
    fail();
  const operations = graph.operations;
  if (
    operations.length !== registration.operations.length ||
    new Set(operations.map((o) => o.operationKey)).size !== operations.length
  )
    fail();
  for (const operation of operations) {
    const installed = registration.operations.find(
      (o) => o.key === operation.operationKey,
    );
    if (
      !installed ||
      operation.handlerKey !== installed.handler ||
      operation.handlerVersion !== installed.version ||
      operation.operationKind !== "read" ||
      operation.authorizationTarget !== installed.target ||
      operation.authorizationEffect !== installed.effect ||
      operation.requiresParentRead !== installed.requiresParentRead ||
      operation.requiresPreflight !== installed.requiresPreflight ||
      operation.preflightKey !== null ||
      operation.preflightVersion !== null
    )
      fail();
  }
  if (
    operations.find((o) => o.id === profiles![0]!.directoryOperationId)
      ?.operationKey !== "list" ||
    operations.find((o) => o.id === profiles![0]!.recordReadOperationId)
      ?.operationKey !== "read"
  )
    fail();
  const bindings = graph.operationScopeBindings ?? [];
  if (bindings.length !== operations.length) fail();
  const scopes = operations.map((operation) => {
    const matches = bindings.filter(
      (b) => b.entityOperationId === operation.id,
    );
    if (matches.length !== 1) fail();
    const binding = matches[0]!;
    if (
      binding.targetPlane !== "studio" ||
      binding.scopeKind !== "tenant" ||
      binding.coordinateSource !== "tenant_context" ||
      binding.coordinateKey !== undefined ||
      binding.missingValueBehavior !== "deny" ||
      (binding.status !== undefined && binding.status !== "active") ||
      (binding.resolverKey !== undefined &&
        binding.resolverKey !== registration.resolver.key) ||
      binding.decisionMode !==
        (operation.authorizationTarget === "collection"
          ? "collection"
          : "entity_resource")
    )
      fail();
    return {
      operationId: operation.id,
      plane: "studio" as const,
      resolverKey: registration.resolver.key,
      resolverVersion: registration.resolver.version,
    };
  });
  const declarations = graph.operationPermissions ?? [];
  if (
    declarations.some(
      (p) =>
        p.targetPlane !== "studio" ||
        !operations.some((o) => o.id === p.entityOperationId) ||
        (p.status !== undefined && p.status !== "active") ||
        !p.permissionCode ||
        !p.permissionKind,
    )
  )
    fail();
  const permissions = operations.map((operation) => {
    const matches = declarations.filter(
      (p) => p.entityOperationId === operation.id,
    );
    if (matches.length > 1) fail();
    return {
      operationId: operation.id,
      plane: "studio" as const,
      state: matches.length ? ("defined" as const) : ("none" as const),
      permissionCode: matches[0]?.permissionCode ?? null,
    };
  });
  const fields = graph.fields.map((field) => {
    const matches = identities.filter(
      (i) =>
        i.id === field.fieldIdentityId &&
        i.entityId === graph.authoringSource.entityId &&
        i.tenantId === null,
    );
    if (matches.length !== 1) fail();
    return { id: field.id, key: matches[0]!.fieldKey };
  });
  const resource = {
    owner: registration.owner,
    key: registration.key,
    version: registration.version,
    hash: sha256(registration),
  };
  const context: NativeAuthorizationContext = {
    entityCode: graph.entity.entityCode,
    changeSetId: graph.ownedLabels!.changeSetId,
    plane: "studio",
    maximumMembers,
    fields,
    permissions,
    scopes,
    resolvers: [
      {
        ...registration.resolver,
        runtimeKey: registration.resolver.key,
        resource,
      },
    ],
    handlers: registration.operations.map((o) => ({
      key: o.handler,
      version: o.version,
      runtimeKey: o.handler,
      requiresPreflight: o.requiresPreflight,
      targets: [o.target],
      effects: [o.effect],
      operationKinds: ["read"],
      resource,
    })),
    preflights: [],
  };
  compileNativeAuthorization(
    {
      profiles: profiles!,
      fields: graph.referenceMembers!.members.fieldAccess,
      operations,
    },
    context,
  );
  return context;
}
