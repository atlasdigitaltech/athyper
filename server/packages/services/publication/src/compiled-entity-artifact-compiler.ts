import {
  parseCompiledEntityArtifact,
  capabilityArtifactMembers,
  type EntityCapabilityAuthoringMember,
  parseCompiledEntityReleaseEnvelope,
  validateCompiledEntityRelease,
  type CompiledEntityArtifactV2,
  type CompiledEntityRegistry,
  type CompiledEntityReleaseEnvelopeV2,
  type CompiledEntityRuntimeProjectionV2,
  type PublicationCanonicalizer,
} from "@athyper/server-contract-publication";
import { validateCompiledRuntimeContracts } from "@athyper/server-platform-metadata";

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
  /** Server lowering output from the same reviewed MetaEntity source. It becomes
   * a signed compiled member, never a separately activated native descriptor. */
  readonly runtimeContracts?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Canonical saved Studio members, indexed by entity; absent for direct artifact authoring. */
  readonly capabilityMembers?: Readonly<Record<string, readonly EntityCapabilityAuthoringMember[]>>;
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
  const sources = [...input.artifacts];
  for (const [entityCode, descriptor] of Object.entries(input.runtimeContracts ?? {})) {
    const core = sources.find(source => source.content.artifactKey === `${entityCode}/core`);
    if (!core) throw new TypeError("COMPILED_ENTITY_RUNTIME_CORE_REQUIRED");
    sources.push({ref: `${entityCode}/runtime.json`, content: {
      schema: core.content.schema, schemaVersion: core.content.schemaVersion,
      contractStatus: core.content.contractStatus, artifactType: "runtime_contract",
      artifactKey: `${entityCode}/runtime`, entityCode, plane: core.content.plane,
      dependencies: [`${entityCode}/core`, `${entityCode}/operation`], descriptor,
    }});
  }
  const compiled = sources.map((source) => {
    const members=input.capabilityMembers?.[String(source.content.entityCode)];
    if(members && ["core","operation"].includes(String(source.content.artifactType))) {
      const mapped=capabilityArtifactMembers(String(source.content.entityCode),members);
      if(source.content.artifactType==="core") {
        const existing=source.content.capabilities as Record<string,unknown>|undefined;
        if(existing && (existing.comments!==undefined || existing.attachments!==undefined)) throw new TypeError("CAPABILITY_POLICY_DUPLICATE_SOURCE");
        source={...source,content:{...source.content,capabilities:{...existing,...mapped.capabilities}}};
      } else {
        if(source.content.commentBinding!==undefined||source.content.attachmentBinding!==undefined) throw new TypeError("CAPABILITY_POLICY_DUPLICATE_SOURCE");
        source={...source,content:{...source.content,...mapped.operationBindings}};
      }
    }
    if (source.content.artifactType === "operation") {
      let content = { ...source.content };
      for (const profile of sources.filter(item => item.content.artifactType === "capability_profile"
          && item.content.entityCode === source.content.entityCode)) {
        const definition = profile.content.profile as { capabilityKey?: string } | undefined;
        const key = definition?.capabilityKey === "comments" ? "commentBinding" : definition?.capabilityKey === "attachments" ? "attachmentBinding" : undefined;
        if (!key || !content[key]) throw new TypeError("CAPABILITY_PROFILE_BINDING_REQUIRED");
        const binding = content[key] as Record<string, unknown>;
        if (binding.profilePolicy !== undefined) throw new TypeError("CAPABILITY_PROFILE_PIN_AUTHORING_FORBIDDEN");
        content = { ...content,
          [key]: { ...binding, profilePolicy: { artifactKey: profile.content.artifactKey,
            hash: hash(input.canonicalizer, profile.content), plane: profile.content.plane } },
          dependencies: [...new Set([...(content.dependencies as string[]), String(profile.content.artifactKey)])],
        };
      }
      source = { ...source, content };
    }
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
  // Content identity is independent of publication authentication. Only the
  // outer publication document is signed; never emit a synthetic inner signature.
  const { signature: _legacySignature, ...releaseContent } = input.release.content;
  const unsignedRelease = {
    ...releaseContent,
    artifacts: artifactEntries,
  };
  const releaseDocument = Object.freeze({
    ...unsignedRelease,
    releaseHash: hash(input.canonicalizer, unsignedRelease),
  });
  const release = parseCompiledEntityReleaseEnvelope(releaseDocument);
  validateCompiledEntityRelease(
    release,
    compiled.map((item) => item.artifact),
    input.registry,
  );
  validateCompiledRuntimeContracts(compiled.map(item => item.artifact));
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
  tenantId?: string,
): CompiledEntityRuntimeProjectionV2 {
  if (tenantId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(tenantId))
    throw new TypeError("COMPILED_ENTITY_RUNTIME_TENANT_INVALID");
  if (Number.isNaN(Date.parse(generatedAt)))
    throw new TypeError("COMPILED_ENTITY_RUNTIME_GENERATED_AT_INVALID");
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(entityCode))
    throw new TypeError("COMPILED_ENTITY_RUNTIME_ENTITY_CODE_INVALID");
  if (!compilation.release.artifacts.some((artifact) => artifact.entityCode === entityCode))
    throw new TypeError("COMPILED_ENTITY_RUNTIME_ENTITY_NOT_IN_RELEASE");
  return Object.freeze({
    entityCode,
    ...(tenantId === undefined ? {} : {tenantId}),
    release: compilation.release,
    artifacts: Object.freeze(compilation.artifacts.map((item) => item.artifact)),
    generatedAt,
  });
}

function hash(canonicalizer: PublicationCanonicalizer, value: unknown): string {
  return canonicalizer.sha256(canonicalizer.canonicalBytes(value));
}
