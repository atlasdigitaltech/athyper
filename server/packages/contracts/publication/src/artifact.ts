import { PublicationContractError } from "./errors.js";
import { parseCapabilityBinding, parseCapabilityDeclaration, validateEntityCapabilities } from "./entity-capabilities.js";
import type { BusinessPartnerDefinitionProjection, CompiledEntityRuntimeProjectionV2, EntityRuntimeProjection, PublicationCompatibilityLevel, PublicationPlane } from "./projection.js";
import {compiledPublicationTenant} from './compiled-publication-scope.js';

export const PUBLICATION_ARTIFACT_SCHEMA_V1 = "athyper.publication-artifact.v1" as const;
export const PUBLICATION_ARTIFACT_MEDIA_TYPE_V1 = "application/vnd.athyper.publication-artifact.v1+json" as const;

export type PublicationArtifactKind = "entity_runtime" | "compiled_entity_runtime" | "business_partner_definition_bundle";

/**
 * Content artifact contract for the split compiled-entity runtime. This is separate
 * from PublicationArtifactEnvelopeV1 so existing v1 publication consumers retain
 * their wire compatibility while the compiler grows a new, typed payload.
 */
export const COMPILED_ENTITY_ARTIFACT_SCHEMA_V2_DRAFT =
  "athyper.compiled-entity-artifact/2.0-draft" as const;
export type CompiledEntityArtifactType =
  | "core"
  | "runtime_contract"
  | "operation"
  | "presentation_surface"
  | "presentation_section"
  | "flow";
export type CompiledEntityArtifactStatus =
  | "draft_for_review"
  | "unsigned_review_only"
  | "published";

export interface CompiledEntityArtifactV2 {
  readonly schema: typeof COMPILED_ENTITY_ARTIFACT_SCHEMA_V2_DRAFT;
  readonly schemaVersion: 2;
  readonly contractStatus: CompiledEntityArtifactStatus;
  readonly artifactType: CompiledEntityArtifactType;
  readonly artifactKey: string;
  readonly entityCode: string;
  readonly plane: PublicationPlane;
  readonly dependencies: readonly string[];
  readonly artifactHash: string;
  /** Typed content is intentionally preserved as JSON until its artifact parser runs. */
  readonly content: Readonly<Record<string, unknown>>;
}

export interface CompiledEntityReleaseArtifactV2 {
  readonly artifactKey: string;
  readonly artifactType: CompiledEntityArtifactType;
  readonly entityCode: string;
  readonly ref: string;
  readonly hash: string;
}
export interface CompiledEntityReleaseEnvelopeV2 {
  readonly schema: string;
  readonly contractStatus: "unsigned_review_only" | "published";
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly targetPlanes: readonly PublicationPlane[];
  readonly artifacts: readonly CompiledEntityReleaseArtifactV2[];
  readonly externalDependencies: readonly Readonly<{
    serviceKey: string;
    required: boolean;
    resolution: string;
  }>[];
  readonly releaseHash: string;
  readonly signature: Readonly<{ algorithm: string; keyId: string; value: string }>;
}

export interface CompiledEntityRegistry {
  /** Authoritative final schema catalog, when validating persisted source bindings. */
  readonly sourceObjects?: ReadonlySet<string>;
  readonly permissions?: ReadonlySet<string>;
  readonly handlers: ReadonlySet<string>;
  readonly renderers: ReadonlySet<string>;
  readonly resolvers: ReadonlySet<string>;
  readonly evaluators: ReadonlySet<string>;
}

interface PublicationArtifactEnvelopeBaseV1 {
  readonly schema: typeof PUBLICATION_ARTIFACT_SCHEMA_V1;
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly releaseKind: "publish" | "rollback";
  readonly targetPlane: PublicationPlane;
  readonly artifactKind: PublicationArtifactKind;
  readonly generatedAt: string;
  readonly minimumRuntimeVersion?: string;
  readonly compatibilityLevel: PublicationCompatibilityLevel;
}

export type PublicationArtifactEnvelopeV1 =
  | (PublicationArtifactEnvelopeBaseV1 & { readonly artifactKind: "entity_runtime"; readonly payload: EntityRuntimeProjection })
  | (PublicationArtifactEnvelopeBaseV1 & { readonly artifactKind: "compiled_entity_runtime"; readonly payload: CompiledEntityRuntimeProjectionV2 })
  | (PublicationArtifactEnvelopeBaseV1 & { readonly artifactKind: "business_partner_definition_bundle"; readonly payload: BusinessPartnerDefinitionProjection });

export interface PublicationArtifactManifestV1 {
  readonly artifactSchema: typeof PUBLICATION_ARTIFACT_SCHEMA_V1;
  readonly mediaType: typeof PUBLICATION_ARTIFACT_MEDIA_TYPE_V1;
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly targetPlane: PublicationPlane;
  readonly artifactKind: PublicationArtifactKind;
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

const compiledKeyPattern = /^[a-z][a-z0-9_.-]{0,126}$/;
/* Artifact keys preserve existing camel-case form-surface suffixes. Entity, field
 * and operation keys still use the lower-case compiledKeyPattern. */
const compiledArtifactKeyPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,126}(?:\/[A-Za-z][A-Za-z0-9_.-]{0,126})+$/;
const compiledHashPattern = /^sha256:[a-f0-9]{64}$/;
const compiledArtifactKeys: Readonly<Record<CompiledEntityArtifactType, ReadonlySet<string>>> = {
  runtime_contract: new Set(["schema", "schemaVersion", "contractStatus", "artifactType", "artifactKey", "entityCode", "plane", "dependencies", "artifactHash", "descriptor"]),
  core: new Set(["schema","schemaVersion","contractStatus","artifactType","artifactKey","entityCode","plane","dependencies","artifactHash","businessContext","capabilities","coreKind","defaultsProfile","defaultsProfileRef","deferredRelations","editRuntimeTier","fieldAccess","fieldDefaults","fields","operationDefaults","ownerBinding","profileKey","projectionPolicy","protections","query","querySafetyLimits","readinessFacts","referencePicker","relationDefaults","relations","serverDependencies","storage","validationAuthority"]),
  operation: new Set(["schema","schemaVersion","contractStatus","artifactType","artifactKey","entityCode","plane","dependencies","artifactHash","commentBinding","attachmentBinding","browserProjection","concurrency","consumedBy","disclosureBinding","evaluationContract","handlerBindingStatus","lifecycleBinding","lifecycleOperationBindings","materialization","numberingBinding","operationDefaultsProfile","operationDefaultsProfileRef","operations","policyBindings","policyManifestProjection","printBinding","reasonCodeCatalog","snapshotBinding","transactionOrder","validationDeclarations"]),
  presentation_surface: new Set(["schema","schemaVersion","contractStatus","artifactType","artifactKey","entityCode","plane","dependencies","artifactHash","actions","columns","contextControl","dataAuthority","excludedCapabilities","fieldDiff","header","layout","navigation","pageSizes","policyManifest","queryPresentation","restrictedValues","sections","sort","summaryView","surfaceKey"]),
  presentation_section: new Set(["schema","schemaVersion","contractStatus","artifactType","artifactKey","entityCode","plane","dependencies","artifactHash","accessAuthority","additionalCoreRefs","authorization","availableOperations","childCollections","completenessEvaluation","completenessPacks","contentModel","emptyState","coreRef","dataBinding","fieldBindingNamespace","fieldBindings","form","linkFields","load","ownerBinding","pagination","relationKey","rendererKey","requiredContext","resourceStates","targetCoreRef","targetFieldBindings","validationAuthority","sectionKey"]),
  flow: new Set(["schema","schemaVersion","contractStatus","artifactType","artifactKey","entityCode","plane","dependencies","artifactHash","baseFlowRef","composition","draftEntityCode","flowKey","flowKind","flowRefs","journey","materializesEntityCode","persistence","presentationSlots","requestContract","selection","serverValidation","sourceMappingCatalog","sourceMappingKeys","steps","supportedSources","workflowDefinitions"]),
};
function compiledKey(value: unknown, name: string): string {
  if (typeof value !== "string" || !compiledKeyPattern.test(value))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", `${name} is invalid`);
  return value;
}
function compiledArtifactKey(value: unknown, name: string): string {
  if (typeof value !== "string" || !compiledArtifactKeyPattern.test(value))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", `${name} is invalid`);
  return value;
}
function compiledHash(value: unknown, name: string): string {
  if (typeof value !== "string" || !compiledHashPattern.test(value))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", `${name} is invalid`);
  return value;
}
function compiledArray(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", `${name} is required`);
  return value;
}
function compiledReferences(value: unknown, property: string): readonly string[] {
  const found: string[] = [];
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) return candidate.forEach(visit);
    if (!isRecord(candidate)) return;
    for (const [key, item] of Object.entries(candidate)) {
      if (key === property && typeof item === "string") found.push(item);
      if (key === property && Array.isArray(item))
        found.push(...item.filter((entry): entry is string => typeof entry === "string"));
      visit(item);
    }
  };
  visit(value);
  return found;
}

/** Parses one closed-world v2 content artifact without turning draft metadata into executable behavior. */
export function parseCompiledEntityArtifact(value: unknown): CompiledEntityArtifactV2 {
  if (!isRecord(value))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", "Compiled entity artifact must be an object");
  if (value.schema !== COMPILED_ENTITY_ARTIFACT_SCHEMA_V2_DRAFT || value.schemaVersion !== 2)
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_SCHEMA_UNSUPPORTED", "Compiled entity artifact schema is unsupported");
  const artifactType = value.artifactType;
  if (!(["core", "runtime_contract", "operation", "presentation_surface", "presentation_section", "flow"] as const).includes(artifactType as never))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_TYPE_UNSUPPORTED", "Compiled entity artifact type is unsupported");
  const type = artifactType as CompiledEntityArtifactType;
  if (type === "runtime_contract" && (
    value.artifactKey !== `${String(value.entityCode)}/runtime` ||
    !isRecord(value.descriptor) ||
    value.descriptor.schema !== "athyper.entity-runtime-descriptor/1.0" ||
    value.descriptor.entityCode !== value.entityCode || value.descriptor.planeKey !== value.plane ||
    !Array.isArray(value.dependencies) || !value.dependencies.includes(`${String(value.entityCode)}/core`) ||
    !value.dependencies.includes(`${String(value.entityCode)}/operation`)
  )) throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", "Invalid compiled server-runtime contract");
  if(type === "core" && value.capabilities !== undefined) {
    if(!isRecord(value.capabilities)) throw new PublicationContractError("ENTITY_CAPABILITY_INVALID", `${String(value.artifactKey)}.capabilities must be an object`);
    const known = new Set(["comments","attachments","audit","customFields","lifecycle","numbering","print","snapshot"]);
    for(const property of Object.keys(value.capabilities)) if(!known.has(property)) throw new PublicationContractError("ENTITY_CAPABILITY_INVALID", `${String(value.artifactKey)}.capabilities.${property} is unknown`);
    for(const kind of ["comments","attachments"] as const) parseCapabilityDeclaration(value.capabilities[kind],kind,String(value.entityCode));
  }
  if(type === "operation") {
    if(value.commentBinding !== undefined) parseCapabilityBinding(value.commentBinding,"comments",String(value.entityCode));
    if(value.attachmentBinding !== undefined) parseCapabilityBinding(value.attachmentBinding,"attachments",String(value.entityCode));
  }
  for (const property of Object.keys(value))
    if (!compiledArtifactKeys[type].has(property))
      throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_UNKNOWN_PROPERTY", `Unknown normative property: ${property}`);
  const status = value.contractStatus;
  if (!(["draft_for_review", "unsigned_review_only", "published"] as const).includes(status as never))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", "Compiled entity artifact status is invalid");
  const plane = value.plane;
  if (!(["studio", "neon", "mesh"] as const).includes(plane as never))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", "Compiled entity artifact plane is invalid");
  const dependencies = compiledArray(value.dependencies, "dependencies").map((item) => compiledArtifactKey(item, "dependency"));
  if (new Set(dependencies).size !== dependencies.length)
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", "Duplicate compiled entity dependency");
  const parsed = {
    schema: COMPILED_ENTITY_ARTIFACT_SCHEMA_V2_DRAFT,
    schemaVersion: 2 as const,
    contractStatus: status as CompiledEntityArtifactStatus,
    artifactType: type,
    artifactKey: compiledArtifactKey(value.artifactKey, "artifactKey"),
    entityCode: compiledKey(value.entityCode, "entityCode"),
    plane: plane as PublicationPlane,
    dependencies: Object.freeze(dependencies),
    artifactHash: compiledHash(value.artifactHash, "artifactHash"),
    content: Object.freeze({ ...value }),
  } satisfies CompiledEntityArtifactV2;
  return Object.freeze(parsed);
}

export function parseCompiledEntityReleaseEnvelope(value: unknown): CompiledEntityReleaseEnvelopeV2 {
  if (!isRecord(value) || !isRecord(value.signature))
    throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity release must be an object");
  if (typeof value.schema !== "string" || typeof value.releaseId !== "string" || !Number.isInteger(value.releaseNo) || Number(value.releaseNo) < 1)
    throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity release coordinates are invalid");
  if (!(value.contractStatus === "unsigned_review_only" || value.contractStatus === "published"))
    throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity release status is invalid");
  const targetPlanes = compiledArray(value.targetPlanes, "targetPlanes").map((item) => {
    if (!(["studio", "neon", "mesh"] as const).includes(item as never))
      throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity release plane is invalid");
    return item as PublicationPlane;
  });
  const artifacts = compiledArray(value.artifacts, "artifacts").map((entry) => {
    if (!isRecord(entry)) throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity release artifact is invalid");
    const type = entry.artifactType;
    if (!(["core", "runtime_contract", "operation", "presentation_surface", "presentation_section", "flow"] as const).includes(type as never))
      throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity release artifact type is invalid");
    return Object.freeze({ artifactKey: compiledArtifactKey(entry.artifactKey, "release artifact key"), artifactType: type as CompiledEntityArtifactType, entityCode: compiledKey(entry.entityCode, "release artifact entity"), ref: typeof entry.ref === "string" && entry.ref.endsWith(".json") ? entry.ref : (() => { throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "release artifact ref is invalid"); })(), hash: compiledHash(entry.hash, "release artifact hash") });
  });
  if (new Set(artifacts.map((item) => item.artifactKey)).size !== artifacts.length)
    throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Duplicate compiled entity release artifact key");
  const externalDependencies = compiledArray(value.externalDependencies, "externalDependencies").map((entry) => {
    if (!isRecord(entry) || typeof entry.serviceKey !== "string" || typeof entry.required !== "boolean" || typeof entry.resolution !== "string")
      throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity external dependency is invalid");
    return Object.freeze({ serviceKey: entry.serviceKey, required: entry.required, resolution: entry.resolution });
  });
  return Object.freeze({ schema: value.schema, contractStatus: value.contractStatus, releaseId: value.releaseId, releaseNo: Number(value.releaseNo), targetPlanes: Object.freeze(targetPlanes), artifacts: Object.freeze(artifacts), externalDependencies: Object.freeze(externalDependencies), releaseHash: compiledHash(value.releaseHash, "releaseHash"), signature: Object.freeze({ algorithm: String(value.signature.algorithm), keyId: String(value.signature.keyId), value: String(value.signature.value) }) });
}

/** Validates the cross-artifact graph and required registered implementation references. */
export function validateCompiledEntityRelease(
  release: CompiledEntityReleaseEnvelopeV2,
  artifacts: readonly CompiledEntityArtifactV2[],
  registry: CompiledEntityRegistry,
): void {
  validateEntityCapabilities(artifacts, registry);
  const byKey = new Map(artifacts.map((artifact) => [artifact.artifactKey, artifact]));
  const validateChildren = (value: unknown, ownerArtifactKey: string): void => {
    if (!Array.isArray(value)) return;
    for (const child of value) {
      if (!isRecord(child))
        throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_INVALID", "Child collection is invalid");
      const childCoreRef = child.coreRef;
      if (typeof childCoreRef === "string") {
        const core = byKey.get(childCoreRef.replace(/\.json$/, ""));
        if (!core || core.artifactType !== "core")
          throw new PublicationContractError("COMPILED_ENTITY_REFERENCE_MISSING", `Missing child Core: ${childCoreRef}`);
        const fields = Array.isArray(core.content.fields)
          ? new Set(core.content.fields.filter(isRecord).map((field) => field.key).filter((key): key is string => typeof key === "string"))
          : new Set<string>();
        for (const binding of Array.isArray(child.fieldBindings) ? child.fieldBindings : [])
          if (!isRecord(binding) || typeof binding.fieldKey !== "string" || !fields.has(binding.fieldKey))
            throw new PublicationContractError("COMPILED_ENTITY_CHILD_BINDING_INVALID", `Invalid child field binding in ${ownerArtifactKey}`);
      }
      validateChildren(child.childCollections, ownerArtifactKey);
    }
  };
  if (byKey.size !== artifacts.length)
    throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Duplicate supplied compiled entity artifact");
  for (const entry of release.artifacts) {
    const artifact = byKey.get(entry.artifactKey);
    if (!artifact || artifact.artifactType !== entry.artifactType || artifact.entityCode !== entry.entityCode || artifact.artifactHash !== entry.hash)
      throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", `Release artifact does not match: ${entry.artifactKey}`);
  }
  for (const artifact of artifacts) {
    if (registry.sourceObjects) {
      const sources = new Set([
        ...compiledReferences(artifact.content, "sourceObject"),
        ...compiledReferences(artifact.content, "primaryObject"),
        ...compiledReferences(artifact.content, "readObject"),
        ...compiledReferences(artifact.content, "sourceObjects"),
      ]);
      for (const source of sources)
        if (!registry.sourceObjects.has(source))
          throw new PublicationContractError("COMPILED_ENTITY_REFERENCE_MISSING", `Missing source object: ${source}`);
    }
    for (const permission of compiledReferences(artifact.content, "permissionCode"))
      if (!registry.permissions?.has(permission))
        throw new PublicationContractError("COMPILED_ENTITY_REGISTRATION_MISSING", `Missing permissionCode: ${permission}`);
    for (const dependency of artifact.dependencies)
      if (!byKey.has(dependency))
        throw new PublicationContractError("COMPILED_ENTITY_REFERENCE_MISSING", `Missing dependency: ${dependency}`);
    for (const [property, registryValues] of [["handlerKey", registry.handlers], ["rendererKey", registry.renderers], ["resolverKey", registry.resolvers], ["evaluatorKey", registry.evaluators]] as const)
      for (const reference of compiledReferences(artifact.content, property))
        if (!registryValues.has(reference))
          throw new PublicationContractError("COMPILED_ENTITY_REGISTRATION_MISSING", `Missing ${property}: ${reference}`);
    if (artifact.artifactType === "presentation_section") {
      const coreRef = artifact.content.coreRef;
      if (typeof coreRef === "string" && !byKey.has(coreRef.replace(/\.json$/, "")))
        throw new PublicationContractError("COMPILED_ENTITY_REFERENCE_MISSING", `Missing section Core: ${coreRef}`);
      validateChildren(artifact.content.childCollections, artifact.artifactKey);
    }
  }
}

/**
 * Activation boundary for the generic split runtime. Parsing accepts review
 * artifacts so Studio can inspect them; publication accepts only signed/published
 * content. This prevents a review package from becoming a live runtime payload.
 */
export function assertCompiledEntityRuntimePublication(
  projection: CompiledEntityRuntimeProjectionV2,
): void {
  // The projection type already carries the parsed immutable release. Do not
  // parse it again: the parser intentionally consumes the signature envelope.
  const release = projection.release;
  const artifacts = projection.artifacts.map((artifact) =>
    parseCompiledEntityArtifact(artifact.content),
  );
  if (release.contractStatus !== "published")
    throw new PublicationContractError("COMPILED_ENTITY_RELEASE_NOT_PUBLISHED", "Compiled entity release is not published");
  if (artifacts.some((artifact) => artifact.contractStatus !== "published"))
    throw new PublicationContractError("COMPILED_ENTITY_ARTIFACT_NOT_PUBLISHED", "Compiled entity artifact is not published");
  validateEntityCapabilities(artifacts);
  if (typeof projection.generatedAt !== "string" || Number.isNaN(Date.parse(projection.generatedAt)))
    throw new PublicationContractError("COMPILED_ENTITY_RUNTIME_INVALID", "Compiled entity projection generatedAt is invalid");
  if (!compiledKey(projection.entityCode, "entityCode") || !release.artifacts.some((entry) => entry.entityCode === projection.entityCode))
    throw new PublicationContractError("COMPILED_ENTITY_RUNTIME_INVALID", "Compiled entity projection root is invalid");
  if (artifacts.length !== release.artifacts.length)
    throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", "Compiled entity projection artifact set is incomplete");
  // Registry validation occurred at compilation. Re-check release membership and
  // hashes here, where an untrusted persisted payload crosses into activation.
  const byKey = new Map(artifacts.map((artifact) => [artifact.artifactKey, artifact]));
  for (const entry of release.artifacts) {
    const artifact = byKey.get(entry.artifactKey);
    if (!artifact || artifact.artifactType !== entry.artifactType || artifact.entityCode !== entry.entityCode || artifact.artifactHash !== entry.hash)
      throw new PublicationContractError("COMPILED_ENTITY_RELEASE_INVALID", `Compiled entity artifact mismatch: ${entry.artifactKey}`);
  }
}

export function parsePublicationArtifactEnvelope(value: unknown): PublicationArtifactEnvelopeV1 {
  if (!isRecord(value)) throw new PublicationContractError("ARTIFACT_INVALID", "Artifact envelope must be an object");
  const schema = value.schema;
  if (typeof schema !== "string") throw new PublicationContractError("ARTIFACT_SCHEMA_REQUIRED", "Artifact schema is required");
  if (schema !== PUBLICATION_ARTIFACT_SCHEMA_V1) {
    throw new PublicationContractError("ARTIFACT_SCHEMA_UNSUPPORTED", `Unsupported artifact schema: ${schema}`);
  }
  if (!isRecord(value.payload)) throw new PublicationContractError("ARTIFACT_PAYLOAD_INVALID", "Artifact payload is required");
  if (!(["studio", "neon", "mesh"] as const).includes(value.targetPlane as PublicationPlane)) {
    throw new PublicationContractError("ARTIFACT_PLANE_INVALID", "Artifact target plane is invalid");
  }
  if (typeof value.publicationKey !== "string" || typeof value.releaseId !== "string" || typeof value.releaseNo !== "number") {
    throw new PublicationContractError("ARTIFACT_COORDINATES_INVALID", "Artifact coordinates are invalid");
  }
  if (value.artifactKind === "entity_runtime") {
    if (!isRecord(value.payload.entityContract) || !isRecord(value.payload.entityDescriptor))
      throw new PublicationContractError("ARTIFACT_PAYLOAD_INVALID", "Entity runtime payload is required");
  } else if (value.artifactKind === "business_partner_definition_bundle") {
    if (!isRecord(value.payload.bundle) || typeof value.payload.bundleHash !== "string" || typeof value.payload.bundleSchemaVersion !== "string" || value.payload.plane !== value.targetPlane)
      throw new PublicationContractError("ARTIFACT_PAYLOAD_INVALID", "Business Partner definition bundle payload is required");
  } else if (value.artifactKind === "compiled_entity_runtime") {
    try {
      assertCompiledEntityRuntimePublication(value.payload as unknown as CompiledEntityRuntimeProjectionV2);
      compiledPublicationTenant(value.publicationKey, value.payload as unknown as CompiledEntityRuntimeProjectionV2);
    } catch (error) {
      if (error instanceof PublicationContractError) throw error;
      throw new PublicationContractError("ARTIFACT_PAYLOAD_INVALID", "Compiled entity runtime payload is required");
    }
  } else {
    throw new PublicationContractError("ARTIFACT_KIND_UNSUPPORTED", "Artifact kind is unsupported");
  }
  return value as unknown as PublicationArtifactEnvelopeV1;
}
