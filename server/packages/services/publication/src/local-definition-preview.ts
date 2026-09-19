/** Local BP preview. Never creates a publication release or approval. */
import { createHash, randomUUID, sign, verify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  PUBLICATION_ARTIFACT_SCHEMA_V1,
  PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
  type BusinessPartnerDefinitionProjection,
  type PublicationArtifactDocumentV1,
  type PublicationDeploymentBundle,
  type PublicationArtifactStore,
} from "@athyper/server-contract-publication";
import {
  compileBusinessPartnerDefinition,
  BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION,
} from "./business-partner-definition-compiler.js";
import { VerifiedPublicationArtifactLoader } from "./publication-artifact-loader.js";
import { assessLocalDefinitionChange } from "./local-definition-preview-policy.js";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
const canonicalizer = {
  canonicalBytes: (value: unknown) => Buffer.from(canonical(value)),
  sha256: (value: Uint8Array) =>
    createHash("sha256").update(value).digest("hex"),
};
const hash = (value: unknown) =>
  canonicalizer.sha256(canonicalizer.canonicalBytes(value));
export function localPreviewRoot(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!env.ATHYPER_LOCAL_PREVIEW_ROOT) return;
  if (
    env.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test" ||
    env.ATHYPER_LOCAL_WORKSPACE !== "1" ||
    env.ATHYPER_ENV !== "local"
  )
    throw new Error("LOCAL_PREVIEW_ENVIRONMENT_REJECTED");
  return env.ATHYPER_LOCAL_PREVIEW_ROOT;
}
/** v1 intentionally permits text edits only; policy/layout/binding edits need the broader coordinator. */
export function assertCosmeticDefinitionChange(
  before: unknown,
  after: unknown,
  path: string[] = [],
): void {
  if (canonical(before) === canonical(after)) return;
  if (path.length === 1 && path[0] === "semanticVersion") return;
  const textKey = path.at(-1);
  if (
    ["formDescriptors", "viewDescriptors"].includes(path[0] ?? "") &&
    ["label", "title", "description", "helpText", "placeholder"].includes(
      textKey ?? "",
    ) &&
    typeof before === "string" &&
    typeof after === "string"
  )
    return;
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) !== Array.isArray(after)
  )
    throw new Error(`LOCAL_PREVIEW_REQUIRES_QUALIFICATION:${path.join(".")}`);
  const a = before as Record<string, unknown>,
    b = after as Record<string, unknown>;
  if (Object.keys(a).sort().join("\0") !== Object.keys(b).sort().join("\0"))
    throw new Error(`LOCAL_PREVIEW_REQUIRES_QUALIFICATION:${path.join(".")}`);
  for (const key of Object.keys(a))
    assertCosmeticDefinitionChange(a[key], b[key], [...path, key]);
}
interface Revision {
  id: string;
  tenantId: string;
  bundleCode: string;
  bundle: unknown;
  createdAt: string;
}
interface RecordSet {
  schema: "athyper.local-definition-preview/1";
  developmentEvidence: true;
  revisionId: string;
  tenantId: string;
  baselineHash: string;
  document: PublicationArtifactDocumentV1;
  deployment: PublicationDeploymentBundle;
}
const filename = (root: string, tenant: string, code: string, suffix: string) =>
  join(root, `${hash({ tenant, code })}.${suffix}.json`);
function atomic(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}
export function previewStatus(root: string, revision: Revision) {
  const path = filename(root, revision.tenantId, revision.bundleCode, "status");
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
    : { state: "inactive", savedRevision: revision.id };
}
async function load(root: string, set: RecordSet) {
  const bytes = canonicalizer.canonicalBytes(set.document);
  const loader = new VerifiedPublicationArtifactLoader({
    store: {
      get: async () => bytes,
      putImmutable: async () => {
        throw new Error("Read-only preview loader");
      },
    },
    canonicalizer,
    runtimeVersion: "1.0.0",
    verifier: {
      verify: async (input) =>
        input.keyId === "local-bp-preview-v1" &&
        input.algorithm === "Ed25519" &&
        verify(
          null,
          input.bytes,
          readFileSync(join(root, "public.pem")),
          Buffer.from(input.signature, "base64"),
        ),
    },
  });
  return loader.load(set.deployment);
}
export async function saveLocalDefinitionPreview(
  root: string,
  revision: Revision,
  baselineInput:
    | BusinessPartnerDefinitionProjection
    | null
    | (() => Promise<BusinessPartnerDefinitionProjection | null>),
) {
  const epoch = () =>
    existsSync(join(root, "epoch"))
      ? readFileSync(join(root, "epoch"), "utf8")
      : "initial";
  const startingEpoch = epoch();
  const statusPath = filename(
    root,
    revision.tenantId,
    revision.bundleCode,
    "status",
  );
  const prior = previewStatus(root, revision);
  if (typeof prior.savedAt === "string" && prior.savedAt > revision.createdAt)
    return { state: "superseded", savedRevision: revision.id };
  const status: Record<string, unknown> = {
    state: "compiling",
    savedRevision: revision.id,
    savedAt: revision.createdAt,
    activeRevision: prior.activeRevision ?? null,
    developmentEvidence: true,
  };
  atomic(statusPath, status);
  try {
    const baseline =
      typeof baselineInput === "function"
        ? await baselineInput()
        : baselineInput;
    if (
      !baseline ||
      baseline.tenantId !== revision.tenantId ||
      baseline.bundleCode !== revision.bundleCode ||
      baseline.plane !== "neon"
    )
      throw new Error("LOCAL_PREVIEW_BASELINE_REQUIRED");
    const compiled = compileBusinessPartnerDefinition({
      bundle: revision.bundle,
      plane: "neon",
      canonicalizer,
      expectedSourceContractHashes: baseline.bundle.sourceContractHashes,
    });
    const changes = assessLocalDefinitionChange(
      baseline.bundle,
      compiled.bundle,
    );
    const generatedAt = new Date().toISOString(),
      releaseId = randomUUID();
    const payload = {
      ...baseline,
      id: randomUUID(),
      revisionId: revision.id,
      releaseId,
      bundle: compiled.bundle,
      bundleHash: compiled.compiledBundleHash,
      sourceBundleHash: compiled.sourceBundleHash,
      compileReport: compiled.report,
      semanticVersion: compiled.bundle.semanticVersion,
      generatedAt,
    };
    const envelope = {
      schema: PUBLICATION_ARTIFACT_SCHEMA_V1,
      publicationKey: baseline.publicationKey,
      releaseId,
      releaseNo: baseline.releaseNo,
      releaseKind: "publish" as const,
      targetPlane: "neon" as const,
      artifactKind: "business_partner_definition_bundle" as const,
      generatedAt,
      compatibilityLevel: "backward_compatible" as const,
      payload,
    };
    const manifest = {
      artifactSchema: PUBLICATION_ARTIFACT_SCHEMA_V1,
      mediaType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
      publicationKey: baseline.publicationKey,
      releaseId,
      releaseNo: baseline.releaseNo,
      targetPlane: "neon" as const,
      artifactKind: "business_partner_definition_bundle" as const,
      payloadSha256: hash(payload),
      compiler: {
        name: "business-partner-definition",
        version: BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION,
      },
      contractSchemaVersion: "1.0.0",
      descriptorSchemaVersion: "1.0.0",
      signatureAlgorithm: "Ed25519",
      signingKeyId: "local-bp-preview-v1",
      createdAt: generatedAt,
      evidence: {
        developmentEvidence: true,
        changedSections: changes.changedSections.join(","),
        operationalChange: changes.operational,
        sourceBundleHash: compiled.sourceBundleHash,
        compiledBundleHash: compiled.compiledBundleHash,
        compileReportHash: hash(compiled.report),
      },
    };
    const signature = sign(
      null,
      canonicalizer.canonicalBytes({ envelope, manifest }),
      readFileSync(
        process.env.ATHYPER_LOCAL_PREVIEW_SIGNING_KEY_FILE ??
          join(root, "private.pem"),
      ),
    ).toString("base64");
    const document = { envelope, manifest, signature };
    const deployment: PublicationDeploymentBundle = {
      deploymentId: randomUUID(),
      deploymentStatus: "dispatched",
      targetPlane: "neon",
      targetEnvironment: "local-preview",
      targetInstance: "personal-dev",
      publicationKey: baseline.publicationKey,
      sourceReleaseId: releaseId,
      sourceReleaseNo: baseline.releaseNo,
      artifactUri: "s3://local-preview/definition.json",
      artifactHash: hash(document),
      signatureAlgorithm: "Ed25519",
      signingKeyId: "local-bp-preview-v1",
      signature,
    };
    const set: RecordSet = {
      schema: "athyper.local-definition-preview/1",
      developmentEvidence: true,
      revisionId: revision.id,
      tenantId: revision.tenantId,
      baselineHash: baseline.bundleHash,
      document,
      deployment,
    };
    await load(root, set);
    // A newer saved revision wins even if an older asynchronous verification finishes later.
    if (
      epoch() !== startingEpoch ||
      previewStatus(root, revision).savedRevision !== revision.id
    )
      return { state: "superseded", savedRevision: revision.id };
    atomic(
      filename(root, revision.tenantId, revision.bundleCode, "active"),
      set,
    );
    Object.assign(status, {
      state: "active",
      activeRevision: revision.id,
      artifactHash: deployment.artifactHash,
      changedSections: changes.changedSections,
      operationalChange: changes.operational,
    });
  } catch (error) {
    if (
      epoch() !== startingEpoch ||
      previewStatus(root, revision).savedRevision !== revision.id
    )
      return { state: "superseded", savedRevision: revision.id };
    Object.assign(status, {
      state: "failed",
      error: error instanceof Error ? error.message : "LOCAL_PREVIEW_FAILED",
    });
  }
  atomic(statusPath, status);
  return status;
}
export async function overlayLocalDefinitionPreview(
  baseline: BusinessPartnerDefinitionProjection,
  consumption: "presentation" | "request" | "workflow" = "presentation",
): Promise<BusinessPartnerDefinitionProjection> {
  const root = localPreviewRoot();
  if (!root || baseline.plane !== "neon") return baseline;
  const path = filename(root, baseline.tenantId, baseline.bundleCode, "active");
  if (!existsSync(path)) return baseline;
  const set = JSON.parse(readFileSync(path, "utf8")) as RecordSet;
  if (
    set.schema !== "athyper.local-definition-preview/1" ||
    set.tenantId !== baseline.tenantId ||
    set.baselineHash !== baseline.bundleHash
  )
    throw new Error("LOCAL_PREVIEW_STALE_BASELINE");
  const loaded = await load(root, set);
  if (
    loaded.document.envelope.artifactKind !==
    "business_partner_definition_bundle"
  )
    throw new Error("LOCAL_PREVIEW_KIND_REJECTED");
  const payload = loaded.document.envelope.payload;
  if (
    payload.tenantId !== baseline.tenantId ||
    payload.publicationKey !== baseline.publicationKey ||
    payload.plane !== baseline.plane
  )
    throw new Error("LOCAL_PREVIEW_COORDINATES_REJECTED");
  const changes = assessLocalDefinitionChange(baseline.bundle, payload.bundle);
  if (consumption !== "presentation") {
    const section =
      consumption === "request" ? "requestSchemas" : "workflowDefinitions";
    if (!changes.changedSections.includes(section)) return baseline;
    // Keep the actual baseline release identity; the content hash carries the local
    // operational revision. Unrelated presentation saves cannot churn this hash.
    return {
      ...baseline,
      revisionId: payload.revisionId,
      bundleHash: hash({
        baselineHash: baseline.bundleHash,
        [section]: payload.bundle[section],
      }),
      bundle: { ...baseline.bundle, [section]: payload.bundle[section] },
    };
  }
  return { ...baseline, ...payload };
}

/** Explicit operator initialization from an existing Studio draft; local evidence only. */
export async function initializeLocalDefinitionPreview(
  root: string,
  revision: Revision,
) {
  if (existsSync(join(root, "baseline.json")))
    throw new Error("LOCAL_PREVIEW_BASELINE_ALREADY_EXISTS");
  const compiled = compileBusinessPartnerDefinition({
    bundle: revision.bundle,
    plane: "neon",
    canonicalizer,
  });
  const baseline: BusinessPartnerDefinitionProjection = {
    id: randomUUID(),
    tenantId: revision.tenantId,
    revisionId: revision.id,
    releaseId: randomUUID(),
    releaseNo: 1,
    publicationKey: `studio.business_partner.definition.${revision.bundleCode}`,
    plane: "neon",
    bundleCode: revision.bundleCode,
    semanticVersion: compiled.bundle.semanticVersion,
    bundleSchemaVersion: "1.0.0",
    bundleHash: compiled.compiledBundleHash,
    bundle: compiled.bundle,
    generatedAt: new Date().toISOString(),
  };
  const status = await saveLocalDefinitionPreview(root, revision, baseline);
  if (status.state !== "active") throw new Error(String(status.error));
  renameSync(
    filename(root, revision.tenantId, revision.bundleCode, "active"),
    join(root, "baseline.json"),
  );
  return {
    developmentEvidence: true,
    sourceRevision: revision.id,
    humanApprovalPerformed: false,
  };
}
export async function localDefinitionPreviewBaseline(
  publicationKey: string,
): Promise<BusinessPartnerDefinitionProjection | null> {
  const root = localPreviewRoot();
  if (!root || !existsSync(join(root, "baseline.json"))) return null;
  const set = JSON.parse(
    readFileSync(join(root, "baseline.json"), "utf8"),
  ) as RecordSet;
  const loaded = await load(root, set);
  if (
    loaded.document.envelope.artifactKind !==
    "business_partner_definition_bundle"
  )
    throw new Error("LOCAL_PREVIEW_KIND_REJECTED");
  const payload = loaded.document.envelope.payload;
  if (payload.publicationKey !== publicationKey) return null;
  return payload;
}
