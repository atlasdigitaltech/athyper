import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import { parseCapabilityBinding, capabilityBindingKey, validateEntityCapabilities } from "@athyper/server-contract-publication";
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

  async publicationCoordinate(release: CompiledEntityResolvedRelease) {
    const value = await this.options.source.findPublicationCoordinate?.(release);
    if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.releaseId) || !Number.isSafeInteger(value.releaseNo) || value.releaseNo < 1)
      throw new Error("COMPILED_ENTITY_PUBLICATION_COORDINATE_UNAVAILABLE");
    return value;
  }

  async operation(release: CompiledEntityResolvedRelease): Promise<CompiledEntityArtifactV2> {
    const operation = await this.artifact(release, `${release.coordinate.entityCode}/operation`, "operation");
    const bindings = (["comments", "attachments", "activity"] as const).flatMap(kind => {
      const raw = operation.content[capabilityBindingKey(kind)];
      return raw === undefined ? [] : [parseCapabilityBinding(raw, kind, operation.entityCode)];
    });
    if (bindings.some(binding => binding.profilePolicy) || operation.content.activityBinding !== undefined) {
      // Validate cached and cold reads alike against this exact release manifest.
      // Reuse the compiler's policy validation instead of a weaker runtime rule.
      const keys = new Set(bindings.flatMap(binding => [binding.profilePolicy,
        binding.retentionPolicy, "audiencePolicy" in binding ? binding.audiencePolicy : undefined]
        .filter(ref => ref !== undefined).map(ref => ref.artifactKey)));
      const dependencies = await Promise.all([...keys].map(key => this.artifactByKey(release, key)));
      validateEntityCapabilities([await this.core(release), operation, ...dependencies]);
    }
    return operation;
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
    const input = { coordinate: release.coordinate, release: release.release, entry } as const;
    const key = `${releaseKey(release.coordinate)}\0${release.release.releaseHash}\0${entry.artifactKey}\0${entry.hash}`;
    const pending = this.artifactInflight.get(key);
    if (pending) return pending;
    const load = this.loadArtifact(release, input).finally(() => this.artifactInflight.delete(key));
    this.artifactInflight.set(key, load);
    return load;
  }

  private async loadRelease(coordinate: CompiledEntityReleaseCoordinate): Promise<CompiledEntityResolvedRelease | null> {
    // An unpinned coordinate names a mutable activation head, not immutable IR.
    // Reusing its cached envelope after publication can point artifact reads at a
    // superseded (no longer admitted) release for the entire cache TTL.
    if (!coordinate.releaseHash) {
      const active = await this.options.source.findAdmittedRelease(coordinate);
      return active ? resolveCompiledEntityRelease(coordinate, active) : null;
    }
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
  // Raw immutable IR may share a cache, but in-flight admission and resolved
  // coordinates carry the requesting actor. Never give a simultaneous caller
  // another principal's admission result or artifact-source read.
  return [value.tenantId, value.principalId, value.planeKey, value.entityCode, value.previewScopeKey ?? "", value.releaseId ?? "", value.releaseHash ?? ""].join("\0");
}
function safeKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(normalized)) throw new TypeError("Compiled entity artifact key is invalid");
  return normalized;
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
