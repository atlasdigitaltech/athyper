import { PublicationContractError } from "./errors.js";
import type { EntityRuntimeProjection, PublicationCompatibilityLevel, PublicationPlane } from "./projection.js";

export const PUBLICATION_ARTIFACT_SCHEMA_V1 = "athyper.publication-artifact.v1" as const;
export const PUBLICATION_ARTIFACT_MEDIA_TYPE_V1 = "application/vnd.athyper.publication-artifact.v1+json" as const;

export interface PublicationArtifactEnvelopeV1 {
  readonly schema: typeof PUBLICATION_ARTIFACT_SCHEMA_V1;
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly releaseKind: "publish" | "rollback";
  readonly targetPlane: PublicationPlane;
  readonly artifactKind: "entity_runtime";
  readonly generatedAt: string;
  readonly minimumRuntimeVersion?: string;
  readonly compatibilityLevel: PublicationCompatibilityLevel;
  readonly payload: EntityRuntimeProjection;
}

export interface PublicationArtifactManifestV1 {
  readonly artifactSchema: typeof PUBLICATION_ARTIFACT_SCHEMA_V1;
  readonly mediaType: typeof PUBLICATION_ARTIFACT_MEDIA_TYPE_V1;
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly targetPlane: PublicationPlane;
  readonly artifactKind: "entity_runtime";
  readonly payloadSha256: string;
  readonly compiler: { readonly name: string; readonly version: string };
  readonly contractSchemaVersion: string;
  readonly descriptorSchemaVersion: string;
  readonly minimumRuntimeVersion?: string;
  readonly signatureAlgorithm: string;
  readonly signingKeyId: string;
  readonly createdAt: string;
  readonly evidence?: Readonly<Record<string, string | number | boolean>>;
}

export interface PublicationArtifactDocumentV1 {
  readonly envelope: PublicationArtifactEnvelopeV1;
  readonly manifest: PublicationArtifactManifestV1;
  readonly signature: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePublicationArtifactEnvelope(value: unknown): PublicationArtifactEnvelopeV1 {
  if (!isRecord(value)) throw new PublicationContractError("ARTIFACT_INVALID", "Artifact envelope must be an object");
  const schema = value.schema;
  if (typeof schema !== "string") throw new PublicationContractError("ARTIFACT_SCHEMA_REQUIRED", "Artifact schema is required");
  if (schema !== PUBLICATION_ARTIFACT_SCHEMA_V1) {
    throw new PublicationContractError("ARTIFACT_SCHEMA_UNSUPPORTED", `Unsupported artifact schema: ${schema}`);
  }
  if (!isRecord(value.payload) || !isRecord(value.payload.entityContract) || !isRecord(value.payload.entityDescriptor)) {
    throw new PublicationContractError("ARTIFACT_PAYLOAD_INVALID", "Entity runtime payload is required");
  }
  if (!(["studio", "neon", "mesh"] as const).includes(value.targetPlane as PublicationPlane)) {
    throw new PublicationContractError("ARTIFACT_PLANE_INVALID", "Artifact target plane is invalid");
  }
  if (value.artifactKind !== "entity_runtime" || typeof value.publicationKey !== "string" || typeof value.releaseId !== "string" || typeof value.releaseNo !== "number") {
    throw new PublicationContractError("ARTIFACT_COORDINATES_INVALID", "Artifact coordinates are invalid");
  }
  return value as unknown as PublicationArtifactEnvelopeV1;
}
