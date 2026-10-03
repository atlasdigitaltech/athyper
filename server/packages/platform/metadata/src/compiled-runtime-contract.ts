import { parseEntityDirectoryScope } from "@athyper/server-contract-metadata";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";
import type { PinnedCompiledEntityReader } from "./compiled-entity-reader.js";
import type { CompiledEntityResolvedRelease } from "./artifact-resolution.js";
import { validateRequiredParentContracts } from "./required-parent-contract.js";
import { parseEntityRelationships } from "@athyper/contract-platform-entity-runtime";

/** Server-only lowering output, signed as a member of the same release as the UI.
 * The descriptor DTO is retained for existing consumers, not as a second store,
 * activation head, preview fallback or publication lifecycle. */
export function parseCompiledRuntimeContract(
  artifact: CompiledEntityArtifactV2,
  publication: { readonly releaseId: string; readonly releaseNo: number },
): EntityRuntimeDescriptor {
  if (
    artifact.artifactType !== "runtime_contract" ||
    artifact.artifactKey !== `${artifact.entityCode}/runtime`
  )
    throw new Error("COMPILED_ENTITY_RUNTIME_CONTRACT_INVALID");
  const descriptor = parseEntityRuntimeDescriptor({
    entity_code: artifact.entityCode,
    plane_code: artifact.plane,
    release_id: publication.releaseId,
    release_no: publication.releaseNo,
    entity_contract_hash: artifact.artifactHash.replace(/^sha256:/, ""),
    compiled_hash: artifact.artifactHash.replace(/^sha256:/, ""),
    compiled_json: artifact.content.descriptor,
  });
  // Document collections own their read authorization through immutable
  // operation-scope bindings. They deliberately have no handler runtime to
  // qualify: inventing one would weaken the relationship resolver contract.
  if (
    !descriptor.authorization ||
    (!descriptor.collectionRelationship && !descriptor.authorizationRuntime) ||
    (descriptor.collectionRelationship && descriptor.authorizationRuntime)
  )
    throw new Error("COMPILED_ENTITY_RUNTIME_AUTHORIZATION_REQUIRED");
  return descriptor;
}

/** Check overlaps instead of letting a server contract silently reinterpret UI IR. */
export function validateCompiledRuntimeContracts(
  artifacts: readonly CompiledEntityArtifactV2[],
): void {
  const byKey = new Map(
    artifacts.map((artifact) => [artifact.artifactKey, artifact]),
  );
  const descriptors: EntityRuntimeDescriptor[] = [];
  for (const core of artifacts.filter(
    (artifact) => artifact.artifactType === "core",
  )) {
    const scope =
      core.content.directoryScope === undefined
        ? undefined
        : parseEntityDirectoryScope(core.content.directoryScope);
    const relationships =
      core.content.entityRelationships === undefined
        ? undefined
        : parseEntityRelationships(core.content.entityRelationships);
    if (
      (scope?.parent !== undefined || relationships !== undefined) &&
      !byKey.has(`${core.entityCode}/runtime`)
    )
      throw new Error("COMPILED_ENTITY_PARENT_RUNTIME_REQUIRED");
  }
  for (const artifact of artifacts.filter(
    (artifact) => artifact.artifactType === "runtime_contract",
  )) {
    const descriptor = parseCompiledRuntimeContract(artifact, {
      releaseId: "00000000-0000-4000-8000-000000000001",
      releaseNo: 1,
    });
    descriptors.push(descriptor);
    const core = byKey.get(`${artifact.entityCode}/core`);
    const operation = byKey.get(`${artifact.entityCode}/operation`);
    if (!core || !operation)
      throw new Error("COMPILED_ENTITY_RUNTIME_DEPENDENCY_MISSING");
    if (
      core.content.entityRelationships !== undefined &&
      JSON.stringify(
        parseEntityRelationships(core.content.entityRelationships),
      ) !== JSON.stringify(descriptor.recordPresentation?.entityRelationships)
    )
      throw new Error("COMPILED_ENTITY_PARENT_RELATIONSHIP_MISMATCH");
    const coreScope =
      core.content.directoryScope === undefined
        ? undefined
        : parseEntityDirectoryScope(core.content.directoryScope);
    if (
      JSON.stringify(coreScope?.parent ?? null) !==
        JSON.stringify(descriptor.directoryScope?.parent ?? null) ||
      (coreScope?.parent !== undefined &&
        coreScope.mode !== descriptor.directoryScope?.mode)
    )
      throw new Error("COMPILED_ENTITY_PARENT_SCOPE_MISMATCH");
    const storage = core.content.storage as Record<string, unknown> | undefined;
    if (
      !storage ||
      (storage.readObject ?? storage.primaryObject) !==
        `${descriptor.storage.schema}.${descriptor.storage.object}` ||
      storage.idField !== descriptor.storage.idField ||
      storage.tenantField !== descriptor.storage.tenantField
    )
      throw new Error("COMPILED_ENTITY_RUNTIME_STORAGE_MISMATCH");
    const fields = core.content.fields as
      readonly Record<string, unknown>[] | undefined;
    for (const field of descriptor.fields) {
      const compiled = fields?.find((value) => value.key === field.key);
      const binding = compiled?.binding as Record<string, unknown> | undefined;
      if (
        !compiled ||
        !Array.isArray(storage.sourceObjects) ||
        !storage.sourceObjects.includes(binding?.sourceObject) ||
        binding?.column !== field.storagePath ||
        compiled.dataType !== field.type
      )
        throw new Error(`COMPILED_ENTITY_RUNTIME_FIELD_MISMATCH:${field.key}`);
    }
    if (descriptor.collectionRelationship) {
      const bindings = (artifact.content.descriptor as Record<string, unknown>)[
        "operation_scope_bindings"
      ];
      const source = (artifact.content.descriptor as Record<string, unknown>)[
        "source"
      ] as Record<string, unknown> | undefined;
      if (
        !Array.isArray(bindings) ||
        bindings.length === 0 ||
        typeof source?.["entity_id"] !== "string" ||
        typeof source?.["release_hash"] !== "string"
      )
        throw new Error("COMPILED_ENTITY_COLLECTION_BINDINGS_REQUIRED");
    }
    for (const op of (operation.content.operations ?? []) as readonly Record<
      string,
      unknown
    >[]) {
      const shared = descriptor.operations[String(op.key)];
      if (shared && op.permissionCode !== shared.permissionCode)
        throw new Error(
          `COMPILED_ENTITY_RUNTIME_PERMISSION_MISMATCH:${String(op.key)}`,
        );
    }
  }
  validateRequiredParentContracts(descriptors);
}

export async function readCompiledRuntimeContract(
  reader: PinnedCompiledEntityReader,
  release: CompiledEntityResolvedRelease,
) {
  const [artifact, publication] = await Promise.all([
    reader.artifactByKey(
      release,
      `${release.coordinate.entityCode}/runtime`,
      "runtime_contract",
    ),
    reader.publicationCoordinate(release),
  ]);
  return parseCompiledRuntimeContract(artifact, publication);
}

/** Compiled-only MetadataReader. No entity-specific branches or legacy fallback.
 * Mutable heads are re-resolved; immutable artifact caching belongs to the reader. */
export function createCompiledMetadataReader(
  reader: PinnedCompiledEntityReader,
): MetadataReader {
  return {
    async getEntityDescriptor(context, entityCode) {
      const code = entityCode.trim().toLowerCase();
      if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(code))
        throw new TypeError("Invalid entity code");
      const release = await reader.resolve({
        tenantId: context.tenantId,
        principalId: context.principalId,
        planeKey: context.planeKey,
        entityCode: code,
      });
      return release ? readCompiledRuntimeContract(reader, release) : null;
    },
  };
}
