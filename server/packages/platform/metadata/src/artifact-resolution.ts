import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
  type CompiledEntityArtifactV2,
  type CompiledEntityReleaseArtifactV2,
  type CompiledEntityReleaseEnvelopeV2,
} from "@athyper/server-contract-publication";
import type { PlaneKey } from "@athyper/server-foundation/context";

/**
 * Verified, plane-local source for a compiled release. Implementations may use a
 * database projection and immutable object storage, but must never compile on a
 * read miss or silently substitute a newer release.
 */
export interface CompiledEntityReleaseSource {
  findAdmittedRelease(input: CompiledEntityReleaseCoordinate): Promise<CompiledEntityReleaseEnvelopeV2 | null>;
  findArtifact(input: CompiledEntityArtifactReadCoordinate): Promise<CompiledEntityArtifactV2 | null>;
}

export interface CompiledEntityReleaseCoordinate {
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  readonly entityCode: string;
  /** IAM/preview admission may pin a release. It is part of the cache identity. */
  readonly previewScopeKey?: string;
  readonly releaseId?: string;
  readonly releaseHash?: string;
}

export interface CompiledEntityArtifactReadCoordinate {
  readonly release: CompiledEntityReleaseEnvelopeV2;
  readonly entry: CompiledEntityReleaseArtifactV2;
}

/** Cache stores immutable raw IR only. It never stores principal-specific output. */
export interface CompiledEntityArtifactCache {
  getRelease(coordinate: CompiledEntityReleaseCoordinate): Promise<CompiledEntityReleaseEnvelopeV2 | undefined>;
  setRelease(coordinate: CompiledEntityReleaseCoordinate, release: CompiledEntityReleaseEnvelopeV2, ttlMs: number): Promise<void>;
  getArtifact(input: CompiledEntityArtifactReadCoordinate): Promise<CompiledEntityArtifactV2 | undefined>;
  setArtifact(input: CompiledEntityArtifactReadCoordinate, artifact: CompiledEntityArtifactV2, ttlMs: number): Promise<void>;
}

export interface CompiledEntityResolvedRelease {
  readonly coordinate: CompiledEntityReleaseCoordinate;
  readonly release: CompiledEntityReleaseEnvelopeV2;
  readonly artifactIndex: ReadonlyMap<string, CompiledEntityReleaseArtifactV2>;
  readonly refIndex: ReadonlyMap<string, CompiledEntityReleaseArtifactV2>;
}

export function resolveCompiledEntityRelease(
  coordinate: CompiledEntityReleaseCoordinate,
  release: CompiledEntityReleaseEnvelopeV2,
): CompiledEntityResolvedRelease {
  if (!release.targetPlanes.includes(coordinate.planeKey))
    throw new Error("COMPILED_ENTITY_RELEASE_PLANE_NOT_ADMITTED");
  if (coordinate.releaseId && coordinate.releaseId !== release.releaseId)
    throw new Error("COMPILED_ENTITY_RELEASE_PIN_MISMATCH");
  if (coordinate.releaseHash && coordinate.releaseHash !== release.releaseHash)
    throw new Error("COMPILED_ENTITY_RELEASE_PIN_MISMATCH");
  const artifactIndex = new Map<string, CompiledEntityReleaseArtifactV2>();
  const refIndex = new Map<string, CompiledEntityReleaseArtifactV2>();
  for (const entry of release.artifacts) {
    if (artifactIndex.has(entry.artifactKey) || refIndex.has(entry.ref))
      throw new Error("COMPILED_ENTITY_RELEASE_INDEX_DUPLICATE");
    artifactIndex.set(entry.artifactKey, entry);
    refIndex.set(entry.ref, entry);
  }
  if (![...artifactIndex.values()].some((entry) => entry.entityCode === coordinate.entityCode))
    throw new Error("COMPILED_ENTITY_RELEASE_ENTITY_NOT_ADMITTED");
  return Object.freeze({
    coordinate: Object.freeze({ ...coordinate }),
    release,
    artifactIndex,
    refIndex,
  });
}

export function artifactEntry(
  release: CompiledEntityResolvedRelease,
  artifactKey: string,
): CompiledEntityReleaseArtifactV2 {
  const entry = release.artifactIndex.get(artifactKey);
  if (!entry) throw new Error(`COMPILED_ENTITY_ARTIFACT_NOT_IN_RELEASE:${artifactKey}`);
  return entry;
}

export function profileEntry(
  release: CompiledEntityResolvedRelease,
  ref: string,
): CompiledEntityReleaseArtifactV2 {
  const entry = release.refIndex.get(ref);
  if (!entry) throw new Error(`COMPILED_ENTITY_PROFILE_NOT_IN_RELEASE:${ref}`);
  return entry;
}

export function assertResolvedArtifact(
  artifact: CompiledEntityArtifactV2,
  expected: CompiledEntityReleaseArtifactV2,
  release: CompiledEntityResolvedRelease,
): CompiledEntityArtifactV2 {
  const parsed = parseCompiledEntityArtifact(artifact.content);
  if (
    parsed.artifactKey !== expected.artifactKey ||
    parsed.artifactType !== expected.artifactType ||
    parsed.entityCode !== expected.entityCode ||
    parsed.artifactHash !== expected.hash ||
    parsed.plane !== release.coordinate.planeKey
  ) throw new Error("COMPILED_ENTITY_ARTIFACT_RELEASE_MISMATCH");
  return parsed;
}

/** Validates an untrusted cached release before it can create a request pin. */
export function parseCachedCompiledEntityRelease(value: unknown): CompiledEntityReleaseEnvelopeV2 {
  return parseCompiledEntityReleaseEnvelope(value);
}
