import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata";
import { createHash } from "node:crypto";
import {
  entityScopeResolvers,
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
} from "@athyper/server-contract-metadata";
import {
  PUBLICATION_ARTIFACT_SCHEMA_V1,
  PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
  type EntityRuntimeProjection,
  type PublicationCanonicalizer,
  type PublicationSigner,
  type PublicationArtifactDocumentV1,
} from "@athyper/server-contract-publication";

export interface EntityAuthorizationPermission {
  readonly id: string;
  readonly code: string;
  readonly kind: "entity_operation" | "capability";
  readonly scopeKinds: readonly string[];
}
export interface EntityAuthorizationPublicationInput {
  /** Complete authored release. A review packet/descriptor fragment is not accepted. */
  readonly projection: EntityRuntimeProjection;
  readonly operationIds: Readonly<Record<string, string>>;
  readonly catalog: readonly EntityAuthorizationPermission[];
  /** Trusted runtime composition, never a boolean supplied by the publication caller. */
  readonly runtime: { qualify(profile: unknown, bindings: unknown): void };
  /** Trusted governance adapter. It must verify exact release/operation decisions,
   * reviewer authority and evidence; author-supplied allow booleans are not accepted. */
  readonly review?: {
    qualify(input: {readonly releaseId:string;readonly releaseNo:number;readonly tenantId:string|null;readonly plane:string;readonly entityCode:string;readonly contractHash:string;readonly profileHash:string;readonly runtimeHash:string;readonly catalogHash:string;readonly operationKeys:readonly string[]}): Promise<{readonly receiptSha256:string}>;
  };
  readonly canonicalizer: PublicationCanonicalizer;
  readonly signer: PublicationSigner;
  readonly signingKeyId: string;
  readonly minimumRuntimeVersion: string;
}

/** Compile into the existing signed entity_runtime envelope, without publishing or changing grants. */
export async function compileEntityAuthorizationPublication(
  input: EntityAuthorizationPublicationInput,
): Promise<PublicationArtifactDocumentV1> {
  const { canonicalizer: canonical, projection } = input;
  const capturedCatalog=structuredClone(input.catalog), operationIds=structuredClone(input.operationIds);
  // Snapshot authoring inputs before awaiting signing; callers cannot mutate signed content in flight.
  const c = structuredClone(projection.entityContract),
    d = structuredClone(projection.entityDescriptor);
  const hash = (value: unknown) =>
    canonical.sha256(canonical.canonicalBytes(value));
  for (const id of [
    c.id,
    c.entityId,
    c.releaseId,
    c.revisionId,
    d.id,
    ...(c.tenantId ? [c.tenantId] : []),
  ])
    uuid(id);
  if (
    !Number.isSafeInteger(c.releaseNo) ||
    c.releaseNo < 1 ||
    !c.publicationKey ||
    !/^\d+\.\d+\.\d+$/.test(input.minimumRuntimeVersion) ||
    d.descriptorKind !== "entity_runtime" ||
    d.descriptor["schema"] !== "athyper.entity-runtime-descriptor/1.0" ||
    d.descriptor["entityCode"] !== c.entityCode ||
    d.descriptor["planeKey"] !== d.plane ||
    !Number.isFinite(Date.parse(d.generatedAt)) ||
    !Number.isFinite(Date.parse(c.publishedAt))
  )
    throw new TypeError("Invalid native authorization release coordinates");
  const fields = d.descriptor["fields"],
    operations = d.descriptor["operations"];
  if (
    !Array.isArray(fields) ||
    !operations ||
    typeof operations !== "object" ||
    Array.isArray(operations)
  )
    throw new TypeError("Complete native descriptor required");
  const profile = parseEntityAuthorizationProfile(
    d.descriptor["authorization"],
    {
      entityCode: c.entityCode,
      planeKey: d.plane,
      fields: fields.map((field) => {
        if (!field || typeof field.key !== "string")
          throw new TypeError("Invalid field");
        return field.key as string;
      }),
      operations: operations as Record<string, { permissionCode: string }>,
    },
  );
  const runtime = parseEntityAuthorizationRuntime(
    d.descriptor["authorizationRuntime"],
    profile,
  );
  if (!input.review) throw new TypeError("Entity authorization publication review adapter required");
  const review = await input.review.qualify({releaseId:c.releaseId,releaseNo:c.releaseNo,tenantId:c.tenantId??null,plane:d.plane,entityCode:c.entityCode,contractHash:hash(c.contract),profileHash:hash(profile),runtimeHash:hash(runtime),catalogHash:hash(capturedCatalog),operationKeys:profile.operations.map(o=>o.key).sort()});
  if (!review || !/^[a-f0-9]{64}$/.test(review.receiptSha256)) throw new TypeError("Invalid entity authorization publication review receipt");
  const authored = authoredAuthorization(c.contract);
  if (
    hash(authored["authorization"]) !== hash(profile) ||
    hash(parseEntityAuthorizationRuntime(authored["authorizationRuntime"], profile)) !== hash(runtime)
  )
    throw new TypeError("Authoring contract/runtime authorization mismatch");
  const authoredOperations = c.contract["operations"];
  if (!Array.isArray(authoredOperations))
    throw new TypeError("Authored operation identities required");
  const activeOperations = authoredOperations.filter(
    (operation) => operation?.status !== "deprecated",
  );
  if (
    activeOperations.length !== profile.operations.length ||
    new Set(activeOperations.map((operation) => operation?.operationKey))
      .size !== activeOperations.length ||
    activeOperations.some(
      (operation) =>
        !operation ||
        operationIds[operation.operationKey] !== operation.id,
    )
  )
    throw new TypeError(
      "Exact operation coverage required for authored identities",
    );
  input.runtime.qualify(profile, runtime);
  const catalog = new Map(
    capturedCatalog.map((permission) => [permission.code, permission]),
  );
  if (
    catalog.size !== capturedCatalog.length ||
    new Set(capturedCatalog.map((p) => p.id)).size !== capturedCatalog.length
  )
    throw new TypeError("Ambiguous permission catalog");
  const keys = profile.operations.map((operation) => operation.key).sort();
  if (
    Object.keys(operationIds).sort().join() !== keys.join() ||
    Object.keys(operations).sort().join() !== keys.join() ||
    new Set(Object.values(operationIds)).size !== keys.length
  )
    throw new TypeError("Exact operation coverage required");
  const rows = profile.operations
    .flatMap((operation) => {
      const permission = catalog.get(operation.permissionCode);
      if (
        !permission ||
        !new RegExp(
          `^${d.plane}\\.[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$`,
        ).test(permission.code) ||
        permission.code.split(".").slice(1, 3).includes("action") ||
        !["entity_operation", "capability"].includes(permission.kind)
      )
        throw new TypeError(
          `Canonical permission unresolved: ${operation.key}`,
        );
      uuid(permission.id);
      const sourceEntityOperationId = operationIds[operation.key]!;
      uuid(sourceEntityOperationId);
      const kinds = entityScopeResolvers[operation.scope].map(
        (coordinate) =>
          ({
            operatingOrganizationId: "operating_organization",
            companyCodeId: "company_code",
            workspaceId: "workspace",
            networkRelationshipId: "network_relationship",
          })[coordinate],
      );
      const expected = kinds.length ? kinds.sort() : ["tenant"];
      // The authenticated review pins both the catalog and selected profile.
      // Catalog compatibility can support additional scopes; only the reviewed
      // resolver's scopes are emitted below. Never infer tenant compatibility.
      if (!Array.isArray(permission.scopeKinds) ||
        new Set(permission.scopeKinds).size !== permission.scopeKinds.length ||
        expected.some(scope => !permission.scopeKinds.includes(scope)))
        throw new TypeError(
          `Permission scope review required: ${operation.key}`,
        );
      const bindingId = stableId([
        c.tenantId ?? "global",
        d.plane,
        c.releaseId,
        sourceEntityOperationId,
      ]);
      return expected.map((scopeKind) => ({
        bindingId,
        scopeBindingId: stableId([bindingId, scopeKind]),
        sourceEntityOperationId,
        entityCode: c.entityCode,
        operationKey: operation.key,
        permissionId: permission.id,
        permissionCode: permission.code,
        permissionKind: permission.kind,
        decisionMode:
          operation.target === "collection" ? "collection" : "entity_resource",
        scopeKind,
        coordinateSource:
          scopeKind === "tenant" ? "tenant_context" : "relation_resolver",
        coordinateKey: null,
        resolverKey: scopeKind === "tenant" ? null : operation.scope,
      }));
    })
    .sort(
      (a, b) =>
        a.operationKey.localeCompare(b.operationKey) ||
        a.scopeKind.localeCompare(b.scopeKind),
    );
  const contractHash = hash(c.contract);
  const descriptor = {
    ...d.descriptor,
    authorization: profile,
    authorizationRuntime: runtime,
    source: {
      entity_id: c.entityId,
      release_id: c.releaseId,
      release_hash: contractHash,
    },
    operation_scope_bindings: rows,
  };
  parseEntityRuntimeDescriptor({entity_code:c.entityCode,release_id:c.releaseId,release_no:c.releaseNo,entity_contract_hash:contractHash,plane_code:d.plane,compiled_hash:hash(descriptor),compiled_json:descriptor});
  const contractSignature = await input.signer.sign({
    keyId: input.signingKeyId,
    algorithm: "Ed25519",
    bytes: canonical.canonicalBytes(c.contract),
  });
  const payload: EntityRuntimeProjection = {
    entityContract: {
      ...c,
      contractHash,
      signature: {
        algorithm: "Ed25519",
        keyId: input.signingKeyId,
        signature: contractSignature.signature,
      },
    },
    entityDescriptor: {
      ...d,
      sourceContractHash: contractHash,
      compiledHash: hash(descriptor),
      descriptor,
      compilerVersion: "entity-authorization.v1",
    },
  };
  const envelope = {
    schema: PUBLICATION_ARTIFACT_SCHEMA_V1,
    artifactKind: "entity_runtime" as const,
    publicationKey: c.publicationKey,
    releaseId: c.releaseId,
    releaseNo: c.releaseNo,
    releaseKind: "publish" as const,
    targetPlane: d.plane,
    generatedAt: d.generatedAt,
    minimumRuntimeVersion: input.minimumRuntimeVersion,
    compatibilityLevel: d.compatibilityLevel,
    payload,
  };
  const manifest = {
    artifactSchema: PUBLICATION_ARTIFACT_SCHEMA_V1,
    mediaType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
    publicationKey: c.publicationKey,
    releaseId: c.releaseId,
    releaseNo: c.releaseNo,
    targetPlane: d.plane,
    artifactKind: "entity_runtime" as const,
    payloadSha256: hash(payload),
    compiler: {
      name: "@athyper/entity-authorization-publication",
      version: "1.0.0",
    },
    contractSchemaVersion: c.contractSchemaVersion,
    descriptorSchemaVersion: d.descriptorSchemaVersion,
    minimumRuntimeVersion: input.minimumRuntimeVersion,
    signatureAlgorithm: "Ed25519",
    signingKeyId: input.signingKeyId,
    createdAt: d.generatedAt,
    evidence: {
      authorizationReviewReceiptSha256: review.receiptSha256,
      authorizationRuntimeVersion: runtime.runtimeVersion,
      authorizationProfileHash: hash(profile),
    },
  };
  const signed = await input.signer.sign({
    keyId: input.signingKeyId,
    algorithm: "Ed25519",
    bytes: canonical.canonicalBytes({ envelope, manifest }),
  });
  return { envelope, manifest, signature: signed.signature };
}
function uuid(value: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new TypeError("Native release UUID required");
}
function stableId(parts: readonly string[]) {
  const bytes = createHash("sha256")
    .update(JSON.stringify(parts))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function authoredAuthorization(
  contract: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const surfaces = contract["surfaces"];
  const candidates: Readonly<Record<string, unknown>>[] =
    contract["authorization"] === undefined ? [] : [contract];
  if (Array.isArray(surfaces))
    for (const surface of surfaces) {
      if (
        surface?.status !== "deprecated" &&
        surface?.layoutConfig?.authorization !== undefined
      )
        candidates.push(surface.layoutConfig);
    }
  if (candidates.length !== 1)
    throw new TypeError("Exactly one authored authorization profile required");
  return candidates[0]!;
}
