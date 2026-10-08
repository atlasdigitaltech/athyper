import {
  parsePublicationArtifactEnvelope,
  PublicationContractError,
  PUBLICATION_ARTIFACT_SCHEMA_V1,
  PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
  type EntityLiveReadResource,
  type PublicationCanonicalizer,
  type PublicationVerifier,
} from "@athyper/server-contract-publication";
import {
  validateEntityResourcePinV1,
  type EntityResourcePinV1,
} from "@athyper/server-contract-metadata";
import { runtimeVersionCompatible } from "./runtime-version.js";

/** Local installation captured by a trusted database reader under its head lock.
 * Not an endpoint DTO. This verifier supplies neither the lock nor authority. */
export interface LocalLiveReadInstallation {
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly artifactHash: string;
  readonly payloadHash: string;
  readonly payload: unknown;
  readonly signedDocument: unknown;
}
/** Reverify the original signed bytes against current key trust on every use.
 * The local applied payload and immutable resource pin must independently match.
 * Deployment acknowledgements or cached signature_verified=true are insufficient. */
export async function verifyLocalLiveReadResource(options: {
  installation: LocalLiveReadInstallation;
  pin: EntityResourcePinV1;
  tenantId: string;
  plane: "studio" | "neon" | "mesh";
  runtimeVersion: string;
  verifier: PublicationVerifier;
  canonical: PublicationCanonicalizer;
}): Promise<EntityLiveReadResource> {
  const fail = (): never => {
    throw new PublicationContractError(
      "ARTIFACT_HASH_MISMATCH",
      "Local live-read installation is not qualified",
    );
  };
  const {
    installation: row,
    pin,
    tenantId,
    plane,
  } = structuredClone({
    installation: options.installation,
    pin: options.pin,
    tenantId: options.tenantId,
    plane: options.plane,
  });
  validateEntityResourcePinV1(pin);
  const hash = (value: unknown) =>
    options.canonical.sha256(options.canonical.canonicalBytes(value));
  const document = row.signedDocument;
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    Object.keys(document).sort().join() !== "envelope,manifest,signature" ||
    hash(document) !== row.artifactHash
  )
    return fail();
  const signature = Reflect.get(document, "signature"),
    manifest = Reflect.get(document, "manifest");
  const envelope = parsePublicationArtifactEnvelope(
    Reflect.get(document, "envelope"),
  );
  if (
    (envelope.artifactKind !== "entity_security_manifest" &&
      envelope.artifactKind !== "entity_storage_authority") ||
    envelope.publicationKey !== row.publicationKey ||
    envelope.releaseId !== row.releaseId ||
    envelope.releaseNo !== row.releaseNo ||
    envelope.targetPlane !== plane ||
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    manifest.artifactSchema !== PUBLICATION_ARTIFACT_SCHEMA_V1 ||
    manifest.mediaType !== PUBLICATION_ARTIFACT_MEDIA_TYPE_V1 ||
    manifest.contractSchemaVersion !== "1.0" ||
    manifest.descriptorSchemaVersion !== "1.0" ||
    manifest.publicationKey !== row.publicationKey ||
    manifest.releaseId !== row.releaseId ||
    manifest.releaseNo !== row.releaseNo ||
    manifest.targetPlane !== plane ||
    manifest.artifactKind !== envelope.artifactKind ||
    manifest.signatureAlgorithm !== "Ed25519" ||
    typeof manifest.signingKeyId !== "string" ||
    !manifest.signingKeyId ||
    typeof signature !== "string" ||
    !signature ||
    hash(envelope.payload) !== manifest.payloadSha256 ||
    manifest.payloadSha256 !== row.payloadHash ||
    hash(row.payload) !== row.payloadHash ||
    hash(envelope.payload.pin) !== hash(pin) ||
    hash(envelope.payload.content) !== pin.hash
  )
    return fail();
  if (
    !runtimeVersionCompatible(
      options.runtimeVersion,
      envelope.minimumRuntimeVersion,
    ) ||
    !runtimeVersionCompatible(
      options.runtimeVersion,
      manifest.minimumRuntimeVersion,
    )
  )
    throw new PublicationContractError(
      "RUNTIME_INCOMPATIBLE",
      "Live-read resource requires a newer runtime",
    );
  const content = envelope.payload.content;
  const scopedTenant =
    content.schema === "entity.effective-security-manifest/1"
      ? content.scope.tenantId
      : content.tenantId;
  if (
    scopedTenant !== tenantId ||
    (content.source.tenantId !== null && content.source.tenantId !== tenantId)
  )
    return fail();
  if (
    !(await options.verifier.verify({
      keyId: manifest.signingKeyId,
      algorithm: "Ed25519",
      bytes: options.canonical.canonicalBytes({ envelope, manifest }),
      signature,
    }))
  )
    throw new PublicationContractError(
      "ARTIFACT_SIGNATURE_INVALID",
      "Live-read signing key or signature is no longer trusted",
    );
  return structuredClone(envelope.payload);
}
