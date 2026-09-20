import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
  validateCompiledEntityRelease,
  type CompiledEntityArtifactV2,
  type CompiledEntityRegistry,
  type CompiledEntityReleaseEnvelopeV2,
  type CompiledEntityRuntimeProjectionV2,
  type PublicationCanonicalizer,
} from "@athyper/server-contract-publication";

export const COMPILED_ENTITY_ARTIFACT_COMPILER_VERSION = "1.0.0";

export interface CompiledEntityArtifactAuthoringInputV2 {
  readonly ref: string;
  /** Authoring content omits artifactHash; compilation is its only source. */
  readonly content: Readonly<Record<string, unknown>>;
}
export interface CompiledEntityReleaseAuthoringInputV2 {
  readonly content: Readonly<Record<string, unknown>>;
}
export interface CompiledEntityArtifactCompilationInputV2 {
  readonly artifacts: readonly CompiledEntityArtifactAuthoringInputV2[];
  readonly release: CompiledEntityReleaseAuthoringInputV2;
  readonly registry: CompiledEntityRegistry;
  readonly canonicalizer: PublicationCanonicalizer;
}
export interface CompiledEntityArtifactCompileReportV2 {
  readonly schema: "athyper.compiled-entity-artifact-compile-report/1";
  readonly compilerVersion: typeof COMPILED_ENTITY_ARTIFACT_COMPILER_VERSION;
  readonly artifactCount: number;
  readonly artifactKeys: readonly string[];
  readonly deterministic: true;
}
export interface CompiledEntityArtifactCompilationV2 {
  readonly artifacts: readonly Readonly<{ ref: string; artifact: CompiledEntityArtifactV2 }>[];
  readonly release: CompiledEntityReleaseEnvelopeV2;
  readonly releaseDocument: Readonly<Record<string, unknown>>;
  readonly report: CompiledEntityArtifactCompileReportV2;
}

/**
 * Converts approved authoring content into an immutable split-artifact set. It
 * never persists, activates or previews content: publication orchestration remains
 * responsible for those state transitions.
 */
export function compileCompiledEntityArtifacts(
  input: CompiledEntityArtifactCompilationInputV2,
): CompiledEntityArtifactCompilationV2 {
  const seenRefs = new Set<string>();
  const compiled = input.artifacts.map((source) => {
    if (!source.ref.endsWith(".json") || seenRefs.has(source.ref))
      throw new TypeError("COMPILED_ENTITY_AUTHORING_REF_INVALID");
    seenRefs.add(source.ref);
    if (Object.hasOwn(source.content, "artifactHash"))
      throw new TypeError("COMPILED_ENTITY_AUTHORING_HASH_FORBIDDEN");
    const artifact = parseCompiledEntityArtifact({
      ...source.content,
      artifactHash: hash(input.canonicalizer, source.content),
    });
    return Object.freeze({ ref: source.ref, artifact });
  });
  const artifactEntries = compiled
    .map(({ ref, artifact }) => ({
      artifactKey: artifact.artifactKey,
      artifactType: artifact.artifactType,
      entityCode: artifact.entityCode,
      ref,
      hash: artifact.artifactHash,
    }))
    .sort((left, right) => left.artifactKey.localeCompare(right.artifactKey));
  if (Object.hasOwn(input.release.content, "artifacts") || Object.hasOwn(input.release.content, "releaseHash"))
    throw new TypeError("COMPILED_ENTITY_RELEASE_AUTHORING_HASH_FORBIDDEN");
  const unsignedRelease = {
    ...input.release.content,
    artifacts: artifactEntries,
    signature: input.release.content.signature ?? {},
  };
  const { signature: _signature, ...releaseHashContent } = unsignedRelease;
  const releaseDocument = Object.freeze({
    ...unsignedRelease,
    releaseHash: hash(input.canonicalizer, releaseHashContent),
  });
  const release = parseCompiledEntityReleaseEnvelope(releaseDocument);
  validateCompiledEntityRelease(
    release,
    compiled.map((item) => item.artifact),
    input.registry,
  );
  const report = Object.freeze({
    schema: "athyper.compiled-entity-artifact-compile-report/1" as const,
    compilerVersion: COMPILED_ENTITY_ARTIFACT_COMPILER_VERSION,
    artifactCount: compiled.length,
    artifactKeys: Object.freeze(artifactEntries.map((entry) => entry.artifactKey)),
    deterministic: true as const,
  });
  return Object.freeze({ artifacts: Object.freeze(compiled), release, releaseDocument, report });
}

/**
 * Canonical projection persisted by the generic runtime publication path. It has
 * no entity-specific wrapper and contains only the validated immutable release set.
 */
export function compiledEntityRuntimeProjection(
  compilation: CompiledEntityArtifactCompilationV2,
  generatedAt: string,
  entityCode: string,
): CompiledEntityRuntimeProjectionV2 {
  if (Number.isNaN(Date.parse(generatedAt)))
    throw new TypeError("COMPILED_ENTITY_RUNTIME_GENERATED_AT_INVALID");
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(entityCode))
    throw new TypeError("COMPILED_ENTITY_RUNTIME_ENTITY_CODE_INVALID");
  if (!compilation.release.artifacts.some((artifact) => artifact.entityCode === entityCode))
    throw new TypeError("COMPILED_ENTITY_RUNTIME_ENTITY_NOT_IN_RELEASE");
  return Object.freeze({
    entityCode,
    release: compilation.release,
    artifacts: Object.freeze(compilation.artifacts.map((item) => item.artifact)),
    generatedAt,
  });
}

function hash(canonicalizer: PublicationCanonicalizer, value: unknown): string {
  return canonicalizer.sha256(canonicalizer.canonicalBytes(value));
}
