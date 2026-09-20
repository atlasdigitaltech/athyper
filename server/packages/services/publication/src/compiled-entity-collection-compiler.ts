import {
  DOCUMENT_RELATIONSHIP_RESOLVER,
  parseCollectionRelationship,
  parseEntityAuthorizationProfile,
} from "@athyper/server-contract-metadata";
import type { EntityAuthorizationPermission } from "./entity-authorization-compiler.js";

const summaryFields = new Map([
  ["id", "uuid"],
  ["case_code", "string"],
  ["operation_code", "string"],
  ["status", "string"],
  ["created_at", "datetime"],
  ["updated_at", "datetime"],
  ["tenant_id", "uuid"],
]);
const fail = (): never => {
  throw new TypeError("DOCUMENT_COLLECTION_COMPILATION_INVALID");
};
const object = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : fail();
const rows = (v: unknown): Record<string, any>[] =>
  Array.isArray(v) ? v.map(object) : fail();

/** Registered case summary only. Native graph hashes remain provenance; this
 * consumer descriptor receives its own hash before native artifact signing. */
export function compileDocumentCollection(
  native: Record<string, unknown>,
  plane: string,
  catalog: readonly EntityAuthorizationPermission[],
) {
  const entity = object(native.entity);
  if (plane !== "neon" || entity.entityCode !== "business_partner_request")
    fail();
  const relationship = parseCollectionRelationship(
    native.collectionRelationship,
  );
  if (relationship.subject.value !== "master.business_partner") fail();
  const profiles = rows(native.runtimeProfiles);
  if (profiles.length !== 1) fail();
  const profile = profiles[0]!;
  if (
    profile.backingKind !== "table" ||
    profile.storagePlane !== plane ||
    profile.writeMode !== "none" ||
    profile.readMode !== "generic"
  )
    fail();
  const storage = {
    schema: profile.storageSchema,
    object: profile.storageObject,
    idField: "id",
    tenantField: profile.tenantFieldKey,
    statusField: "status",
  };
  parseCollectionRelationship(relationship, storage);
  const fields = rows(native.fields).filter((f) => f.status !== "deprecated");
  if (
    fields.length !== summaryFields.size ||
    new Set(fields.map((f) => f.fieldKey)).size !== fields.length
  )
    fail();
  const operations: Record<string, { code: string; permissionCode: string }> =
    {};
  const bindings: Record<string, unknown>[] = [];
  const permissions = rows(native.operationPermissions),
    scopes = rows(native.operationScopeBindings);
  for (const operation of rows(native.operations).filter(
    (o) => o.status !== "deprecated",
  )) {
    if (
      !["discover", "read"].includes(operation.operationKey) ||
      operation.operationKind !== "read" ||
      operations[operation.operationKey]
    )
      fail();
    const links = permissions.filter(
      (p) =>
        p.entityOperationId === operation.id &&
        p.targetPlane === plane &&
        p.status !== "deprecated",
    );
    const targets = scopes.filter(
      (s) =>
        s.entityOperationId === operation.id &&
        s.targetPlane === plane &&
        s.status !== "deprecated",
    );
    if (links.length !== 1 || targets.length !== 1) fail();
    const link = links[0]!,
      target = targets[0]!;
    const current = catalog.filter((p) => p.code === link.permissionCode);
    if (
      link.permissionCode !== "neon.relationship.entity_case.read" ||
      current.length !== 1 ||
      current[0]!.kind !== "entity_operation" ||
      !current[0]!.scopeKinds.includes("operating_organization")
    )
      fail();
    if (
      target.scopeKind !== "operating_organization" ||
      target.coordinateSource !== "relation_resolver" ||
      target.resolverKey !== DOCUMENT_RELATIONSHIP_RESOLVER ||
      target.decisionMode !== "collection" ||
      target.coordinateKey !== undefined
    )
      fail();
    if (
      ![operation.id, link.id, target.id, current[0]!.id].every(
        (id) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id),
      )
    )
      fail();
    operations[operation.operationKey] = {
      code: operation.operationKey,
      permissionCode: link.permissionCode,
    };
    bindings.push({
      bindingId: link.id,
      scopeBindingId: target.id,
      sourceEntityOperationId: operation.id,
      entityCode: entity.entityCode,
      operationKey: operation.operationKey,
      permissionId: current[0]!.id,
      permissionCode: link.permissionCode,
      permissionKind: current[0]!.kind,
      decisionMode: "collection",
      scopeKind: "operating_organization",
      coordinateSource: "relation_resolver",
      coordinateKey: null,
      resolverKey: DOCUMENT_RELATIONSHIP_RESOLVER,
    });
  }
  if (Object.keys(operations).sort().join(",") !== "discover,read") fail();
  const authorization = parseEntityAuthorizationProfile(native.authorization, {
    entityCode: entity.entityCode,
    planeKey: plane,
    fields: fields.map((f) => f.fieldKey),
    operations,
  });
  if (
    authorization.ownership !== "organization.record.v1" ||
    authorization.directory.population !== "ownership" ||
    authorization.operations.some(
      (o) =>
        o.effect !== "read" ||
        o.requiresParentRead ||
        o.requiresPreflight ||
        o.scope !== "organization.record.v1",
    ) ||
    authorization.fieldPolicies.some(
      (p) =>
        p.representation !== "plain" ||
        p.writeOperations.length ||
        p.revealOperation,
    )
  )
    fail();
  // This adapter does not manufacture runtime registrations or discard them.
  if (native.authorizationRuntime !== undefined || native.ai !== undefined)
    fail();
  const presentation = object(native.listPresentation);
  const columns = rows(native.surfaceFieldBindings);
  return {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: entity.entityCode,
    planeKey: plane,
    storage,
    collectionRelationship: relationship,
    authorization,
    operations,
    operation_scope_bindings: bindings,
    detailRouteTemplate: "/mdg/business-partner/requests/:recordId",
    listPresentation: presentation,
    fields: fields.map((field) => {
      if (
        summaryFields.get(field.fieldKey) !== field.dataType ||
        field.storagePath !== field.fieldKey ||
        field.writeMode !== "read_only" ||
        field.valueOrigin !== "stored"
      )
        fail();
      const policy = authorization.fieldPolicies.find((p) =>
        p.fields.includes(field.fieldKey),
      );
      if (!policy) fail();
      const column = columns.find((c) => c.entityFieldId === field.id);
      return {
        key: field.fieldKey,
        storagePath: field.storagePath,
        type: field.dataType,
        required: false,
        writableOn: [],
        sortable: policy!.queryUses.includes("sort"),
        filterable: policy!.queryUses.includes("filter"),
        searchable:
          field.dataType === "string" && policy!.queryUses.includes("search"),
        list: {
          label: column?.labelOverride ?? field.fieldKey,
          defaultOrder: column?.position ?? 99,
          defaultVisible:
            field.fieldKey !== "tenant_id" &&
            column?.displayConfig?.defaultVisible !== false,
        },
      };
    }),
  };
}

/** Publication coordinates come from the signed native release, never UI input. */
export function withDocumentCollectionSource(
  descriptor: ReturnType<typeof compileDocumentCollection>,
  source: { entityId: string; releaseHash: string },
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      source.entityId,
    ) ||
    !/^[0-9a-f]{64}$/.test(source.releaseHash)
  )
    throw new TypeError("DOCUMENT_COLLECTION_SOURCE_REQUIRED");
  return {
    ...descriptor,
    source: { entity_id: source.entityId, release_hash: source.releaseHash },
  };
}
