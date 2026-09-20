import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import {
  artifactEntry,
  assertResolvedArtifact,
  profileEntry,
  resolveCompiledEntityRelease,
  type CompiledEntityArtifactCache,
  type CompiledEntityArtifactReadCoordinate,
  type CompiledEntityReleaseCoordinate,
  type CompiledEntityReleaseSource,
  type CompiledEntityResolvedRelease,
} from "./artifact-resolution.js";

export interface CompiledEntityReaderOptions {
  readonly source: CompiledEntityReleaseSource;
  readonly cache?: CompiledEntityArtifactCache;
  readonly cacheTtlMs?: number;
}

export interface CompiledEntitySurfaceModel {
  readonly release: CompiledEntityResolvedRelease;
  readonly core: CompiledEntityArtifactV2;
  readonly surface: CompiledEntityArtifactV2;
}

/**
 * Shared, read-only split-artifact reader. Its resolved release is deliberately
 * passed to each later read, so a page can never combine a newer section with an
 * older Core. Browser authorization projections and record data are outside this
 * immutable-IR boundary.
 */
export class PinnedCompiledEntityReader {
  private readonly releaseInflight = new Map<string, Promise<CompiledEntityResolvedRelease | null>>();
  private readonly artifactInflight = new Map<string, Promise<CompiledEntityArtifactV2>>();
  private readonly ttlMs: number;

  constructor(private readonly options: CompiledEntityReaderOptions) {
    this.ttlMs = options.cacheTtlMs ?? 60_000;
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 1)
      throw new TypeError("Compiled entity cache TTL must be a positive integer");
  }

  async resolve(coordinate: CompiledEntityReleaseCoordinate): Promise<CompiledEntityResolvedRelease | null> {
    const key = releaseKey(coordinate);
    const pending = this.releaseInflight.get(key);
    if (pending) return pending;
    const load = this.loadRelease(coordinate).finally(() => this.releaseInflight.delete(key));
    this.releaseInflight.set(key, load);
    return load;
  }

  async core(release: CompiledEntityResolvedRelease): Promise<CompiledEntityArtifactV2> {
    return this.artifact(release, `${release.coordinate.entityCode}/core`, "core");
  }

  async operation(release: CompiledEntityResolvedRelease): Promise<CompiledEntityArtifactV2> {
    return this.artifact(release, `${release.coordinate.entityCode}/operation`, "operation");
  }

  async surface(release: CompiledEntityResolvedRelease, surfaceKey: string): Promise<CompiledEntityArtifactV2> {
    return this.artifact(release, `${release.coordinate.entityCode}/presentation.${safeKey(surfaceKey)}`, "presentation_surface");
  }

  async section(release: CompiledEntityResolvedRelease, sectionKey: string): Promise<CompiledEntityArtifactV2> {
    return this.artifact(release, `${release.coordinate.entityCode}/presentation.section.${safeKey(sectionKey)}`, "presentation_section");
  }

  async flow(release: CompiledEntityResolvedRelease, flowKey: string): Promise<CompiledEntityArtifactV2> {
    return this.artifact(release, `${release.coordinate.entityCode}/flow.${safeKey(flowKey)}`, "flow");
  }

  /** Read a release-manifest artifact by its declared key. Cross-entity flow
   * variants are allowed only when the pinned release explicitly declares them. */
  async artifactByKey(
    release: CompiledEntityResolvedRelease,
    artifactKey: string,
    expectedType?: CompiledEntityArtifactV2["artifactType"],
  ): Promise<CompiledEntityArtifactV2> {
    const entry = artifactEntry(release, artifactKey);
    if (expectedType && entry.artifactType !== expectedType)
      throw new Error("COMPILED_ENTITY_ARTIFACT_TYPE_MISMATCH");
    return this.read(release, entry);
  }

  async surfaceModel(
    coordinate: CompiledEntityReleaseCoordinate,
    surfaceKey: string,
  ): Promise<CompiledEntitySurfaceModel | null> {
    const release = await this.resolve(coordinate);
    if (!release) return null;
    const [core, surface] = await Promise.all([this.core(release), this.surface(release, surfaceKey)]);
    return Object.freeze({ release, core: await this.withDefaultsProfile(release, core), surface });
  }

  /** Resolve only a profile named by the requested Core/Operation; no release-wide scan. */
  async withDefaultsProfile(
    release: CompiledEntityResolvedRelease,
    artifact: CompiledEntityArtifactV2,
  ): Promise<CompiledEntityArtifactV2> {
    const profileRef = artifact.artifactType === "core"
      ? artifact.content.defaultsProfileRef
      : artifact.artifactType === "operation"
        ? artifact.content.operationDefaultsProfileRef
        : undefined;
    const profileKey = artifact.artifactType === "core"
      ? artifact.content.defaultsProfile
      : artifact.artifactType === "operation"
        ? artifact.content.operationDefaultsProfile
        : undefined;
    if (typeof profileRef !== "string" || typeof profileKey !== "string") return artifact;
    const profile = await this.read(release, profileEntry(release, profileRef));
    if (profile.artifactType !== "core" || profile.content.profileKey !== profileKey)
      throw new Error("COMPILED_ENTITY_DEFAULTS_PROFILE_MISMATCH");
    const property = artifact.artifactType === "core" ? "fieldDefaults" : "operationDefaults";
    const profileDefaults = record(profile.content[property]) ? profile.content[property] : {};
    const localDefaults = record(artifact.content[property]) ? artifact.content[property] : {};
    // Only defaults are inherited. Policy, fields, operations and arrays stay local;
    // a profile cannot relax an entity's required policy or replace its declarations.
    return Object.freeze({
      ...artifact,
      content: Object.freeze({ ...artifact.content, [property]: Object.freeze({ ...profileDefaults, ...localDefaults }) }),
    });
  }

  private async artifact(
    release: CompiledEntityResolvedRelease,
    key: string,
    type: CompiledEntityArtifactV2["artifactType"],
  ): Promise<CompiledEntityArtifactV2> {
    const entry = artifactEntry(release, key);
    if (entry.artifactType !== type) throw new Error("COMPILED_ENTITY_ARTIFACT_TYPE_MISMATCH");
    return this.read(release, entry);
  }

  private async read(
    release: CompiledEntityResolvedRelease,
    entry: CompiledEntityArtifactReadCoordinate["entry"],
  ): Promise<CompiledEntityArtifactV2> {
    const input = { release: release.release, entry } as const;
    const key = `${release.release.releaseHash}\0${entry.artifactKey}\0${entry.hash}`;
    const pending = this.artifactInflight.get(key);
    if (pending) return pending;
    const load = this.loadArtifact(release, input).finally(() => this.artifactInflight.delete(key));
    this.artifactInflight.set(key, load);
    return load;
  }

  private async loadRelease(coordinate: CompiledEntityReleaseCoordinate): Promise<CompiledEntityResolvedRelease | null> {
    let release;
    try {
      release = await this.options.cache?.getRelease(coordinate);
    } catch {
      // Cache faults are advisory. The verified source remains authoritative.
    }
    if (!release) {
      release = await this.options.source.findAdmittedRelease(coordinate);
      if (!release) return null;
      await this.options.cache?.setRelease(coordinate, release, this.ttlMs).catch(() => undefined);
    }
    return resolveCompiledEntityRelease(coordinate, release);
  }

  private async loadArtifact(
    release: CompiledEntityResolvedRelease,
    input: CompiledEntityArtifactReadCoordinate,
  ): Promise<CompiledEntityArtifactV2> {
    let artifact;
    try {
      artifact = await this.options.cache?.getArtifact(input);
      if (artifact) return assertResolvedArtifact(artifact, input.entry, release);
    } catch {
      // A corrupt/cache-mismatched artifact must be fetched again from the verified source.
    }
    artifact = await this.options.source.findArtifact(input);
    if (!artifact) throw new Error(`COMPILED_ENTITY_ARTIFACT_UNAVAILABLE:${input.entry.artifactKey}`);
    const verified = assertResolvedArtifact(artifact, input.entry, release);
    await this.options.cache?.setArtifact(input, verified, this.ttlMs).catch(() => undefined);
    return verified;
  }
}

function releaseKey(value: CompiledEntityReleaseCoordinate): string {
  // Immutable IR is tenant/plane/preview scoped, never principal-scoped. Principal,
  // epoch, context and locale belong exclusively to the authorized browser/data
  // projection key built after this reader returns.
  return [value.tenantId, value.planeKey, value.entityCode, value.previewScopeKey ?? "", value.releaseId ?? "", value.releaseHash ?? ""].join("\0");
}
function safeKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(normalized)) throw new TypeError("Compiled entity artifact key is invalid");
  return normalized;
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
