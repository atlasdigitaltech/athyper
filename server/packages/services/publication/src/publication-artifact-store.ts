import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import {
  PublicationContractError,
  type PublicationArtifactStore,
  type PublicationCanonicalizer,
  type PublicationPlane,
} from "@athyper/server-contract-publication";

export interface PublicationArtifactStoreOptions {
  readonly storage: ObjectStorage;
  readonly bucket: string;
  readonly canonicalizer: Pick<PublicationCanonicalizer, "sha256">;
  readonly healthProbeKey?: string;
}

export class ImmutablePublicationArtifactStore implements PublicationArtifactStore {
  constructor(private readonly options: PublicationArtifactStoreOptions) {
    if (!options.bucket.trim()) throw new TypeError("Publication artifact bucket is required");
    if (!options.storage.putIfAbsent) throw new TypeError("Publication artifact storage requires atomic putIfAbsent support");
  }

  async putImmutable(input: { readonly key: string; readonly bytes: Uint8Array; readonly contentType: string; readonly sha256: string; readonly metadata: Readonly<Record<string, string>> }): Promise<void> {
    if (this.options.canonicalizer.sha256(input.bytes) !== input.sha256) {
      throw conflict("Artifact bytes do not match the supplied checksum");
    }
    const created = await this.options.storage.putIfAbsent!(input.key, input.bytes, {
      contentType: input.contentType,
      metadata: { ...input.metadata, sha256: input.sha256 },
    });
    if (created) return;
    const existing = await this.options.storage.get(input.key);
    if (this.options.canonicalizer.sha256(existing) !== input.sha256) {
      throw conflict("Immutable artifact key already contains different bytes");
    }
  }

  async get(input: { readonly uri: string; readonly expectedSha256: string }): Promise<Uint8Array> {
    const bytes = await this.options.storage.get(parseArtifactUri(input.uri, this.options.bucket));
    if (this.options.canonicalizer.sha256(bytes) !== input.expectedSha256) {
      throw conflict("Stored artifact checksum does not match its authority record");
    }
    return bytes;
  }

  async health(): Promise<{ readonly healthy: boolean; readonly message?: string }> {
    try {
      await this.options.storage.exists(this.options.healthProbeKey ?? "publication/.health-access-probe");
      return { healthy: true };
    } catch {
      return { healthy: false, message: "Publication object storage is unavailable" };
    }
  }
}

export function publicationArtifactKey(input: {
  readonly publicationKey: string;
  readonly releaseNo: number;
  readonly releaseId: string;
  readonly targetPlane: PublicationPlane;
  readonly contentHash: string;
}): string {
  const publicationKey = requireSegment(input.publicationKey, "publication key");
  const releaseId = requireSegment(input.releaseId, "release ID");
  if (!Number.isSafeInteger(input.releaseNo) || input.releaseNo < 1) throw new TypeError("Release number must be a positive safe integer");
  if (!/^[a-f0-9]{64}$/.test(input.contentHash)) throw new TypeError("Artifact content hash must be lowercase SHA-256");
  return `publication/v1/${publicationKey}/releases/${input.releaseNo}-${releaseId}/${input.targetPlane}/entity-runtime-${input.contentHash}.json`;
}

export function publicationArtifactUri(bucket: string, key: string): string {
  return `s3://${requireSegment(bucket, "bucket")}/${key}`;
}

function parseArtifactUri(uri: string, expectedBucket: string): string {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match || match[1] !== expectedBucket || !match[2]) {
    throw new PublicationContractError("ARTIFACT_STORAGE_URI_INVALID", "Publication artifact URI is invalid");
  }
  return match[2];
}

function requireSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("/") || normalized === "." || normalized === "..") throw new TypeError(`Publication ${label} is invalid`);
  return normalized;
}

function conflict(message: string): PublicationContractError {
  return new PublicationContractError("ARTIFACT_STORAGE_IMMUTABILITY_CONFLICT", message);
}
