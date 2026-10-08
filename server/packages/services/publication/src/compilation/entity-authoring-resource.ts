import {
  parseEntityAuthoringResource,
  parsePublicationArtifactEnvelope,
  PublicationContractError,
  PUBLICATION_ARTIFACT_SCHEMA_V1,
  PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
  type EntityAuthoringResourceKind,
  type PublicationCanonicalizer,
  type PublicationArtifactDocumentV1,
} from "@athyper/server-contract-publication";
import type { EntityAuthoringResourceSource } from "@athyper/server-contract-publication";
export type { EntityAuthoringResourceSource } from "@athyper/server-contract-publication";
export interface EntityAuthoringResourcePublication {
  /** Read the exact independently approved immutable source. No runtime DTO or
   * mutable authoring fallback. Resource hashes must bind the review decision. */
  load(releaseId: string): Promise<EntityAuthoringResourceSource>;
  qualify(
    source: EntityAuthoringResourceSource,
    phase: "compile" | "sign" | "dispatch",
  ): Promise<void>;
}
export type UnsignedAuthoringResource = Omit<
  PublicationArtifactDocumentV1,
  "signature"
>;
export async function compileEntityAuthoringResource(
  source: EntityAuthoringResourceSource,
  policy: EntityAuthoringResourcePublication,
  canonical: PublicationCanonicalizer,
  signingKeyId: string,
): Promise<UnsignedAuthoringResource> {
  const captured = structuredClone(source),
    payload = parseEntityAuthoringResource(captured.kind, captured.payload);
  if (
    !signingKeyId ||
    !Number.isSafeInteger(captured.releaseNo) ||
    captured.releaseNo < 1 ||
    !captured.publicationKey ||
    !captured.releaseId ||
    !Number.isFinite(Date.parse(captured.generatedAt))
  )
    throw new PublicationContractError(
      "ARTIFACT_COORDINATES_INVALID",
      "Invalid resource publication coordinates",
    );
  if (
    payload.schema === "entity.installed-authoring-descriptor/1" &&
    canonical.sha256(canonical.canonicalBytes(payload.descriptor)) !==
      payload.descriptorHash
  )
    throw new PublicationContractError(
      "ARTIFACT_HASH_MISMATCH",
      "Descriptor hash mismatch",
    );
  await policy.qualify(structuredClone(captured), "compile");
  const envelope = parsePublicationArtifactEnvelope({
    schema: PUBLICATION_ARTIFACT_SCHEMA_V1,
    publicationKey: captured.publicationKey,
    releaseId: captured.releaseId,
    releaseNo: captured.releaseNo,
    releaseKind: "publish",
    targetPlane: "studio",
    artifactKind: captured.kind,
    generatedAt: captured.generatedAt,
    compatibilityLevel: "breaking",
    payload,
  });
  return {
    envelope,
    manifest: {
      artifactSchema: PUBLICATION_ARTIFACT_SCHEMA_V1,
      mediaType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
      publicationKey: captured.publicationKey,
      releaseId: captured.releaseId,
      releaseNo: captured.releaseNo,
      targetPlane: "studio",
      artifactKind: captured.kind,
      payloadSha256: canonical.sha256(canonical.canonicalBytes(payload)),
      compiler: { name: "entity-authoring-resource", version: "1.0.0" },
      contractSchemaVersion: "1.0",
      descriptorSchemaVersion: "1.0",
      signatureAlgorithm: "Ed25519",
      signingKeyId,
      createdAt: captured.generatedAt,
    },
  };
}
export async function qualifyEntityAuthoringResource(
  document: UnsignedAuthoringResource,
  policy: EntityAuthoringResourcePublication,
  canonical: PublicationCanonicalizer,
  phase: "sign" | "dispatch",
) {
  const envelope = parsePublicationArtifactEnvelope(document.envelope);
  if (
    envelope.artifactKind !== "entity_authoring_descriptor" &&
    envelope.artifactKind !== "entity_identity_review"
  )
    throw new PublicationContractError(
      "ARTIFACT_KIND_UNSUPPORTED",
      "Not an authoring resource",
    );
  const m = document.manifest;
  if (
    m.artifactKind !== envelope.artifactKind ||
    m.releaseId !== envelope.releaseId ||
    m.releaseNo !== envelope.releaseNo ||
    m.publicationKey !== envelope.publicationKey ||
    m.targetPlane !== "studio" ||
    m.payloadSha256 !==
      canonical.sha256(canonical.canonicalBytes(envelope.payload))
  )
    throw new PublicationContractError(
      "ARTIFACT_MANIFEST_INVALID",
      "Resource manifest mismatch",
    );
  const source = await policy.load(envelope.releaseId);
  if (
    source.kind !== envelope.artifactKind ||
    source.releaseId !== envelope.releaseId ||
    source.publicationKey !== envelope.publicationKey ||
    source.releaseNo !== envelope.releaseNo ||
    source.generatedAt !== envelope.generatedAt ||
    canonical.sha256(canonical.canonicalBytes(source.payload)) !==
      m.payloadSha256
  )
    throw new PublicationContractError(
      "ARTIFACT_HASH_MISMATCH",
      "Approved resource changed",
    );
  await policy.qualify(structuredClone(source), phase);
}
