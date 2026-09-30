import {
  DOCUMENT_RELATIONSHIP_RESOLVER,
  parseCollectionRelationship,
  parseCollectionCompilationBinding,
} from "@athyper/server-contract-metadata";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

/** Validate the same registered relationship during review and compilation. */
export function compileCollectionRelationship(graph: MetaEntityGraph) {
  compileCollectionCompilation(graph);
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

/** The binding is stored with its relationship in entity_surface.layout_config. */
export function compileCollectionCompilation(graph: MetaEntityGraph) {
  const declarations = (graph.surfaces ?? []).filter(surface => surface.status !== "deprecated" &&
    (surface.layoutConfig?.["collectionRelationship"] !== undefined ||
     surface.layoutConfig?.["collectionCompilation"] !== undefined));
  if (!declarations.length) return undefined;
  if (declarations.length !== 1) throw new TypeError("COLLECTION_BINDING_DECLARATION_AMBIGUOUS");
  const config = declarations[0]!.layoutConfig!;
  const relationship = parseCollectionRelationship(config["collectionRelationship"]);
  const binding = parseCollectionCompilationBinding(config["collectionCompilation"]);
  for (const rows of [graph.changeCaseBindings, graph.operationContextRequirements, graph.fieldReferenceBindings, graph.materializationBindings, graph.materializationFieldMappings])
    if (rows !== undefined && (!Array.isArray(rows) || rows.length))
      throw new TypeError("DOCUMENT_COLLECTION_GOVERNANCE_UNSUPPORTED");
  if (binding.entityCode !== graph.entity.entityCode || binding.subjectEntityCode !== relationship.subject.value)
    throw new TypeError("COLLECTION_BINDING_COORDINATE_MISMATCH");
  const profiles = graph.runtimeProfiles ?? [];
  if (profiles.length !== 1 || profiles[0]!.storagePlane !== binding.planeKey ||
      profiles[0]!.backingKind !== "table" || profiles[0]!.readMode !== "generic" || profiles[0]!.writeMode !== "none")
    throw new TypeError("COLLECTION_BINDING_RUNTIME_MISMATCH");
  const operations = graph.operations.filter(operation => operation.status !== "deprecated");
  if (operations.length !== 2 || new Set(operations.map(operation => operation.operationKey)).size !== 2 ||
      operations.some(operation => !["discover", "read"].includes(operation.operationKey) || operation.operationKind !== "read"))
    throw new TypeError("COLLECTION_BINDING_OPERATIONS_INVALID");
  for (const operation of operations) {
    const permissions = (graph.operationPermissions ?? []).filter(row => row.entityOperationId === operation.id && row.status !== "deprecated");
    const scopes = (graph.operationScopeBindings ?? []).filter(row => row.entityOperationId === operation.id && row.status !== "deprecated");
    if (!operation.id || permissions.length !== 1 || scopes.length !== 1 ||
        permissions[0]!.targetPlane !== binding.planeKey || permissions[0]!.permissionCode !== binding.permissionCode ||
        scopes[0]!.targetPlane !== binding.planeKey || scopes[0]!.scopeKind !== "operating_organization" ||
        scopes[0]!.coordinateSource !== "relation_resolver" || scopes[0]!.resolverKey !== DOCUMENT_RELATIONSHIP_RESOLVER ||
        scopes[0]!.decisionMode !== "collection" || scopes[0]!.coordinateKey !== undefined)
      throw new TypeError("COLLECTION_BINDING_PERMISSION_SCOPE_MISMATCH");
  }
  return binding;
}
