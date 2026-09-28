import {
  PUBLICATION_ARTIFACT_SCHEMA_V1, PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
  assertCompiledEntityRuntimePublication, compiledPublicationTenant, validateCompiledEntityRelease,
  parseEntitySuccessorTargetPin, type EntitySuccessorTargetPin,
  type CompiledEntityRegistry, type CompiledEntityRuntimeProjectionV2,
  type PublicationArtifactDocumentV1, type PublicationCanonicalizer, type PublicationPlane,
} from "@athyper/server-contract-publication";
import { parseCompiledRuntimeContract, validateCompiledRuntimeContracts } from "@athyper/server-platform-metadata";
import { compileCompiledEntityArtifacts, compiledEntityRuntimeProjection, type CompiledEntityArtifactCompilationInputV2 } from "../compiled-entity-artifact-compiler.js";
import { assertOperationProjection } from "../shared/authorization/operation-projection.js";

export interface CompiledRuntimeSource {
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly publicationKey: string;
  readonly plane: PublicationPlane;
  readonly tenantId: string | null;
  readonly entityCode: string;
  readonly revisionId: string;
  readonly sourceEntityId: string;
  readonly sourceReleaseHash: string;
  readonly sourceContractHash: string;
  readonly sourceDescriptorHash: string;
  readonly generatedAt: string;
  readonly native: Readonly<Record<string, unknown>>;
  readonly contract: Readonly<Record<string, unknown>>;
  readonly expectedPredecessor?: EntitySuccessorTargetPin;
}
export interface CompiledRuntimePublication {
  /** Trusted lowering of an immutable approved source. Never HTTP authoring input. */
  lower(source: CompiledRuntimeSource): Promise<Omit<CompiledEntityArtifactCompilationInputV2, "registry" | "canonicalizer">>;
  registry(plane: PublicationPlane): Promise<CompiledEntityRegistry>;
  /** Must verify persisted approval/evidence, runtime handlers, permissions and
   * capability dependencies. Repeated at compile, sign and dispatch. */
  qualify(input: {
    phase: "compile" | "sign" | "dispatch";
    releaseId: string;
    publicationKey: string;
    plane: PublicationPlane;
    projection: CompiledEntityRuntimeProjectionV2;
    sourceRevisionId: string;
    sourceContractHash: string;
    sourceDescriptorHash: string;
    expectedPredecessor?: EntitySuccessorTargetPin;
  }): Promise<{ receiptSha256: string }>;
}
export type UnsignedPublication = Omit<PublicationArtifactDocumentV1, "signature">;

/** Split-artifact compiler integration, with no entity-name dispatch or authority
 * inferred from compilation. Existing wire schemas remain unchanged. */
export async function compileRuntimePublication(source: CompiledRuntimeSource, dependencies: CompiledRuntimePublication, canonical: PublicationCanonicalizer, signingKeyId: string): Promise<UnsignedPublication> {
  const pinned = structuredClone(source);
  const predecessor = successorPin(pinned.releaseNo, pinned.plane, pinned.publicationKey, pinned.expectedPredecessor);
  const input = await dependencies.lower(structuredClone(pinned));
  if (input.release.content.releaseId !== pinned.releaseId || input.release.content.releaseNo !== pinned.releaseNo
    || !Array.isArray(input.release.content.targetPlanes) || input.release.content.targetPlanes.length !== 1 || input.release.content.targetPlanes[0] !== pinned.plane)
    throw Error("COMPILED_PUBLICATION_SOURCE_COORDINATES_CHANGED");
  const registry = await dependencies.registry(pinned.plane);
  const compilation = compileCompiledEntityArtifacts({ ...input, registry, canonicalizer: {
    canonicalBytes: value => canonical.canonicalBytes(value),
    sha256: bytes => { const hash = canonical.sha256(bytes); return hash.startsWith("sha256:") ? hash : `sha256:${hash}`; },
  } });
  const payload = compiledEntityRuntimeProjection(compilation, pinned.generatedAt, pinned.entityCode, pinned.tenantId ?? undefined);
  const document: UnsignedPublication = {
    envelope: { schema: PUBLICATION_ARTIFACT_SCHEMA_V1, publicationKey: pinned.publicationKey, releaseId: pinned.releaseId, releaseNo: pinned.releaseNo,
      releaseKind: "publish", targetPlane: pinned.plane, artifactKind: "compiled_entity_runtime", generatedAt: pinned.generatedAt, compatibilityLevel: "backward_compatible", payload },
    manifest: { artifactSchema: PUBLICATION_ARTIFACT_SCHEMA_V1, mediaType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1, publicationKey: pinned.publicationKey,
      releaseId: pinned.releaseId, releaseNo: pinned.releaseNo, targetPlane: pinned.plane, artifactKind: "compiled_entity_runtime",
      payloadSha256: canonical.sha256(canonical.canonicalBytes(payload)), compiler: { name: "athyper.compiled-entity-artifact", version: "1.1.0" },
      contractSchemaVersion: "2.0.0", descriptorSchemaVersion: "2.0.0", signatureAlgorithm: "Ed25519", signingKeyId, createdAt: pinned.generatedAt,
      evidence: { sourceRevisionId: pinned.revisionId, sourceEntityId: pinned.sourceEntityId, sourceReleaseHash: pinned.sourceReleaseHash, sourceContractHash: pinned.sourceContractHash, sourceDescriptorHash: pinned.sourceDescriptorHash,
        ...(predecessor ? { expectedPredecessor: JSON.stringify(predecessor) } : {}) } },
  };
  const receiptSha256 = await qualifyRuntimePublication(document, dependencies, canonical, "compile");
  return { ...document, manifest: { ...document.manifest, evidence: { ...document.manifest.evidence, qualificationReceiptSha256: receiptSha256 } } };
}

export async function qualifyRuntimePublication(document: UnsignedPublication, dependencies: CompiledRuntimePublication, canonical: PublicationCanonicalizer, phase: "compile" | "sign" | "dispatch") {
  const { envelope: e, manifest: m } = structuredClone(document);
  if (e.artifactKind !== "compiled_entity_runtime" || m.artifactKind !== e.artifactKind || e.schema !== PUBLICATION_ARTIFACT_SCHEMA_V1
    || e.releaseKind !== "publish" || e.releaseId !== m.releaseId || e.releaseNo !== m.releaseNo || e.publicationKey !== m.publicationKey
    || e.targetPlane !== m.targetPlane || e.payload.release.releaseId !== e.releaseId || e.payload.release.releaseNo !== e.releaseNo
    || e.payload.release.targetPlanes.length !== 1 || e.payload.release.targetPlanes[0] !== e.targetPlane
    || e.payload.artifacts.some(a => a.plane !== e.targetPlane) || canonical.sha256(canonical.canonicalBytes(e.payload)) !== m.payloadSha256)
    throw Error("COMPILED_PUBLICATION_COORDINATES_INVALID");
  assertCompiledEntityRuntimePublication(e.payload);
  for (const artifact of e.payload.artifacts) {
    const { artifactHash: _stored, ...content } = artifact.content;
    const digest = canonical.sha256(canonical.canonicalBytes(content)).replace(/^sha256:/, "");
    if (artifact.artifactHash !== `sha256:${digest}`) throw Error("COMPILED_PUBLICATION_MEMBER_HASH_MISMATCH");
  }
  compiledPublicationTenant(e.publicationKey, e.payload);
  validateCompiledEntityRelease(e.payload.release, e.payload.artifacts, await dependencies.registry(e.targetPlane));
  validateCompiledRuntimeContracts(e.payload.artifacts);
  const runtimes = e.payload.artifacts.filter(a => a.artifactType === "runtime_contract");
  if (!runtimes.length) throw Error("COMPILED_PUBLICATION_RUNTIME_REQUIRED");
  for (const artifact of runtimes) {
    parseCompiledRuntimeContract(artifact, { releaseId: e.releaseId, releaseNo: e.releaseNo });
    assertOperationProjection(artifact.content.descriptor as Record<string, unknown>);
    const source = (artifact.content.descriptor as Record<string, unknown>).source as Record<string, unknown> | undefined;
    if (source && (source.entity_id !== m.evidence?.sourceEntityId || source.release_hash !== m.evidence?.sourceReleaseHash))
      throw Error("COMPILED_PUBLICATION_OPERATION_SOURCE_MISMATCH");
  }
  const evidence = m.evidence;
  const rawPredecessor = evidence?.expectedPredecessor;
  if (rawPredecessor !== undefined && typeof rawPredecessor !== "string") throw Error("COMPILED_PUBLICATION_PREDECESSOR_INVALID");
  const expectedPredecessor = successorPin(e.releaseNo, e.targetPlane, e.publicationKey,
    rawPredecessor === undefined ? undefined : JSON.parse(rawPredecessor));
  const revision = evidence?.sourceRevisionId, contract = evidence?.sourceContractHash, descriptor = evidence?.sourceDescriptorHash;
  if (typeof revision !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(revision)
    || typeof contract !== "string" || !/^(sha256:)?[a-f0-9]{64}$/.test(contract)
    || typeof descriptor !== "string" || !/^(sha256:)?[a-f0-9]{64}$/.test(descriptor)) throw Error("COMPILED_PUBLICATION_SOURCE_PIN_REQUIRED");
  const receipt = await dependencies.qualify({ phase, releaseId: e.releaseId, publicationKey: e.publicationKey, plane: e.targetPlane,
    projection: e.payload, sourceRevisionId: revision, sourceContractHash: contract, sourceDescriptorHash: descriptor,
    ...(expectedPredecessor ? { expectedPredecessor } : {}) });
  if (!/^(sha256:)?[a-f0-9]{64}$/.test(receipt.receiptSha256)) throw Error("COMPILED_PUBLICATION_RECEIPT_REQUIRED");
  if (phase !== "compile" && evidence?.qualificationReceiptSha256 !== receipt.receiptSha256) throw Error("COMPILED_PUBLICATION_QUALIFICATION_CHANGED");
  return receipt.receiptSha256;
}

function successorPin(releaseNo: number, plane: PublicationPlane, publicationKey: string, input: unknown): EntitySuccessorTargetPin | undefined {
  if (releaseNo === 1 && input === undefined) return undefined;
  if (releaseNo <= 1 || input === undefined) throw Error("COMPILED_PUBLICATION_PREDECESSOR_REQUIRED");
  const pin = parseEntitySuccessorTargetPin(input);
  if (pin.sourceReleaseNo !== releaseNo - 1 || pin.plane !== plane || pin.publicationKey !== publicationKey)
    throw Error("COMPILED_PUBLICATION_PREDECESSOR_MISMATCH");
  return pin;
}
