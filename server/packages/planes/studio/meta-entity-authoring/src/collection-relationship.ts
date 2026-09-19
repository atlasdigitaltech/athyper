import {
  DOCUMENT_RELATIONSHIP_RESOLVER,
  parseCollectionRelationship,
} from "@athyper/server-contract-metadata";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

/** Validate the same registered relationship during review and compilation. */
export function compileCollectionRelationship(graph: MetaEntityGraph) {
  const surfaces = (graph.surfaces ?? []).filter(
    (surface) =>
      surface.status !== "deprecated" &&
      surface.layoutConfig?.["collectionRelationship"] !== undefined,
  );
  if (surfaces.length > 1)
    throw new TypeError(
      "Only one collection relationship may be published per entity",
    );
  if (!surfaces.length) return undefined;
  const relationship = parseCollectionRelationship(
    surfaces[0]!.layoutConfig!["collectionRelationship"],
  );
  const read = graph.operations.find(
    (operation) =>
      operation.operationKey === "read" && operation.status !== "deprecated",
  );
  if (!read?.id)
    throw new TypeError(
      "Collection relationship requires an active read operation",
    );
  const permissions = (graph.operationPermissions ?? []).filter(
    (binding) =>
      binding.entityOperationId === read.id && binding.status !== "deprecated",
  );
  if (!permissions.length)
    throw new TypeError(
      "Collection relationship requires a read permission binding",
    );
  for (const permission of permissions) {
    const scopes = (graph.operationScopeBindings ?? []).filter(
      (binding) =>
        binding.entityOperationId === read.id &&
        binding.targetPlane === permission.targetPlane &&
        binding.status !== "deprecated",
    );
    if (
      scopes.length !== 1 ||
      scopes[0]!.scopeKind !== "operating_organization" ||
      scopes[0]!.coordinateSource !== "relation_resolver" ||
      scopes[0]!.resolverKey !== DOCUMENT_RELATIONSHIP_RESOLVER ||
      scopes[0]!.decisionMode !== "collection" ||
      scopes[0]!.coordinateKey !== undefined
    ) {
      throw new TypeError(
        "Collection read scope must use the registered document relationship resolver",
      );
    }
  }
  const profiles = (graph.runtimeProfiles ?? []).filter(
    (profile) => profile.storageObject !== undefined,
  );
  for (const profile of profiles) {
    parseCollectionRelationship(relationship, {
      schema: profile.storageSchema ?? "",
      object: profile.storageObject!,
      tenantField: profile.tenantFieldKey,
      idField: "id",
    });
  }
  return relationship;
}
