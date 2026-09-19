import { createHash } from "node:crypto";
import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
} from "node:fs";
import { isAbsolute } from "node:path";
import { sql, type Kysely } from "kysely";
import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
  createEntityAuthorizationRuntimeRegistry,
} from "@athyper/server-contract-metadata";
import {
  entityAuthorizationProfileHash,
  parseEntityAuthorizationRollout,
  sameEntityAuthorizationRelease,
  entityAuthorizationCoverage,
  type EntityAuthorizationQualification,
} from "@athyper/server-service-records";
import { VerifiedPublicationArtifactLoader } from "@athyper/server-service-publication";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import { businessPartnerPermissionTransitions } from "./business-partner-permission-transitions.js";
import type { Container } from "./create-container.js";
import type { HostConfig } from "../config/index.js";
import type { ServiceRegistrationDependencies } from "./register-services.js";
import { createBusinessPartnerStoredScopes } from "./business-partner-stored-scopes.js";
import { createEntityCasePreflight } from "./entity-case-preflight.js";
import {
  createBusinessPartnerCaseRuntimeRegistrations,
  assertBusinessPartnerCaseRuntimeSemantics,
} from "./business-partner-case-runtime.js";
import { createBusinessPartnerReadRuntimeRegistrations } from "./business-partner-read-runtime.js";
import { createBusinessPartnerRevealRuntimeRegistrations } from "./business-partner-reveal-runtime.js";
import { createBusinessPartnerQualificationRuntimeRegistrations } from "./business-partner-qualification-runtime.js";
import { createBusinessPartnerActionRuntimeRegistrations } from "./business-partner-action-runtime.js";
import { createBusinessPartnerImportRegistration } from "./business-partner-bound-import.js";
import { createBusinessPartnerExportRegistration } from "./business-partner-export-runtime.js";

type Database = Kysely<Record<string, never>>;
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function file(path: string, expected?: string): Buffer {
  if (!isAbsolute(path)) throw Error("BP_DEPLOYMENT_ABSOLUTE_PATH_REQUIRED");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.mode & 0o022 || stat.size > 16 * 1024 * 1024)
      throw Error("BP_DEPLOYMENT_UNTRUSTED_FILE");
    const bytes = readFileSync(fd);
    if (expected && hash(bytes) !== expected)
      throw Error("BP_DEPLOYMENT_FILE_CHANGED");
    return bytes;
  } finally {
    closeSync(fd);
  }
}
interface DeploymentConfig {
  schemaVersion: 1;
  tenantId: string;
  publicationKey: string;
  artifactPath: string;
  artifactHash: string;
  runtimeImage: string;
  artifactReference: Parameters<VerifiedPublicationArtifactLoader["load"]>[0];
  rollout: ReturnType<typeof parseEntityAuthorizationRollout>;
  approval?: { path: string; sha256: string };
}
export function parseBusinessPartnerDeployment(raw: unknown): DeploymentConfig {
  const c = raw as Record<string, any>;
  if (
    !c ||
    Array.isArray(c) ||
    c.schemaVersion !== 1 ||
    Object.keys(c).some(
      (k) =>
        ![
          "schemaVersion",
          "tenantId",
          "publicationKey",
          "artifactPath",
          "artifactHash",
          "artifactReference",
          "rollout",
          "runtimeImage",
          "approval",
        ].includes(k),
    ) ||
    !uuid.test(c.tenantId) ||
    typeof c.publicationKey !== "string" ||
    !c.publicationKey ||
    typeof c.artifactPath !== "string" ||
    !isAbsolute(c.artifactPath) ||
    !/^[a-f0-9]{64}$/.test(c.artifactHash) ||
    !/^sha256:[a-f0-9]{64}$/.test(c.runtimeImage)
  )
    throw Error("BP_DEPLOYMENT_CONFIG_INVALID");
  const rollout = parseEntityAuthorizationRollout(c.rollout);
  const r = c.artifactReference;
  if (
    rollout.release.entityCode !== "business_partner" ||
    rollout.release.planeKey !== "neon" ||
    !r ||
    Array.isArray(r) ||
    Object.keys(r).some(
      (k) =>
        ![
          "artifactUri",
          "artifactHash",
          "targetPlane",
          "publicationKey",
          "sourceReleaseId",
          "sourceReleaseNo",
          "signatureAlgorithm",
          "signingKeyId",
          "signature",
        ].includes(k),
    ) ||
    r.artifactHash !== c.artifactHash ||
    r.publicationKey !== c.publicationKey ||
    r.targetPlane !== "neon" ||
    !uuid.test(r.sourceReleaseId) ||
    !Number.isSafeInteger(r.sourceReleaseNo) ||
    r.sourceReleaseNo < 1 ||
    r.signatureAlgorithm !== "Ed25519" ||
    typeof r.signature !== "string" ||
    !r.signature ||
    typeof r.signingKeyId !== "string" ||
    !r.signingKeyId ||
    typeof r.artifactUri !== "string" ||
    !r.artifactUri
  )
    throw Error("BP_DEPLOYMENT_ARTIFACT_INVALID");
  if (
    c.approval !== undefined &&
    (!c.approval ||
      Object.keys(c.approval).some((k) => !["path", "sha256"].includes(k)) ||
      typeof c.approval.path !== "string" ||
      !isAbsolute(c.approval.path) ||
      !/^[a-f0-9]{64}$/.test(c.approval.sha256))
  )
    throw Error("BP_DEPLOYMENT_APPROVAL_INVALID");
  if (rollout.mode === "enforce" && !c.approval)
    throw Error("BP_DEPLOYMENT_APPROVAL_REQUIRED");
  return { ...c, rollout } as DeploymentConfig;
}
/** No receipt is created here. A trusted signer must attest the exact deployment after qualification. */
export function validDeploymentApproval(
  payload: any,
  config: ReturnType<typeof parseBusinessPartnerDeployment>,
  now: number,
): payload is { qualification: EntityAuthorizationQualification } {
  const q = payload?.qualification;
  return (
    Number.isFinite(now) &&
    payload?.schemaVersion === 1 &&
    payload.kind === "entity_authorization_enforcement_approval" &&
    payload.tenantId === config.tenantId &&
    payload.publicationKey === config.publicationKey &&
    payload.releaseId === config.artifactReference.sourceReleaseId &&
    payload.artifactHash === config.artifactHash &&
    payload.runtimeImage === config.runtimeImage &&
    payload.reference === config.rollout.qualificationRef &&
    payload.enforcementApproved === true &&
    typeof payload.approvalReference === "string" &&
    payload.approvalReference.length > 0 &&
    Date.parse(payload.effectiveFrom) <= now &&
    now < Date.parse(payload.effectiveUntil) &&
    !!q &&
    sameEntityAuthorizationRelease(q.release ?? {}, config.rollout.release) &&
    Array.isArray(q.coverage) &&
    entityAuthorizationCoverage.every((k) => q.coverage.includes(k)) &&
    q.coverage.every((k: any) => entityAuthorizationCoverage.includes(k)) &&
    q.unresolvedDifferences === 0 &&
    typeof q.grantReviewRef === "string" &&
    !!q.grantReviewRef &&
    typeof q.rollbackRef === "string" &&
    !!q.rollbackRef &&
    typeof q.revocationWatermark === "string" &&
    !!q.revocationWatermark &&
    q.companyEntityQualified === true &&
    q.independentChildQualified === true
  );
}

export function loadBusinessPartnerAuthorizationDeployment(
  path: string | undefined,
  container: Container,
  host: HostConfig,
) {
  if (!path) return undefined;
  const config = parseBusinessPartnerDeployment(
    JSON.parse(file(path).toString()),
  );
  if (
    host.businessPartnerAuthorizationShadow &&
    config.rollout.mode === "enforce"
  )
    throw Error("BP_DEPLOYMENT_SHADOW_CONFLICT");
  const database = container.adapters.neonDatabase?.database as
    Database | undefined;
  if (!database || !container.adapters.publicationVerifier)
    throw Error("BP_DEPLOYMENT_ADAPTERS_REQUIRED");
  const artifact = JSON.parse(
    file(config.artifactPath, config.artifactHash).toString(),
  );
  const descriptor = artifact?.envelope?.payload?.entityDescriptor;
  const profile = parseEntityAuthorizationProfile(
    descriptor?.descriptor?.authorization,
  );
  if (
    profile.entityCode !== "business_partner" ||
    profile.planeKey !== "neon" ||
    entityAuthorizationProfileHash(profile) !==
      config.rollout.release.profileHash ||
    descriptor.compiledHash !== config.rollout.release.descriptorHash ||
    sha256(canonicalBytes(descriptor.descriptor.authorizationRuntime)) !==
      config.rollout.release.bindingsHash
  )
    throw Error("BP_DEPLOYMENT_PROFILE_MISMATCH");
  const storedScopes = createBusinessPartnerStoredScopes(
    database,
    createEntityCasePreflight(database),
  );
  const scopes: typeof storedScopes = {
    resolve: async (input) => {
      if (!input.operationKey.startsWith("case_"))
        return storedScopes.resolve(input);
      const operation = profile.operations.find(
        (o) => o.key === input.operationKey,
      );
      if (!operation) return { state: "invalid" };
      return storedScopes.resolve({
        ...input,
        entityCode: "entity_case",
        operationKey: input.operationKey.slice(5),
        resolver: operation.scope,
        target: operation.target,
      });
    },
    preflight: (input) =>
      storedScopes.preflight(
        input.operationKey.startsWith("case_")
          ? { ...input, operationKey: input.operationKey.slice(5) }
          : input,
      ),
  };
  const transaction = <T>(work: (tx: Database) => Promise<T>) =>
    database.transaction().execute(async (tx) => {
      await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
        tx,
      );
      await sql`SET LOCAL statement_timeout='5000ms'`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true)`.execute(
        tx,
      );
      return work(tx);
    });
  async function watermark() {
    return transaction(async (tx) => {
      // Full current authority, including principal epochs. A change closes enforcement until requalified.
      const tables = [
        "authz.role",
        "authz.role_permission",
        "authz.group_member",
        "authz.group_role",
        "authz.plane_membership",
        "authz.permission",
        "authz.permission_scope_kind",
        "authz.principal_group",
        "authz.scope_target",
        "authz.deny_rule",
        "authz.delegation",
        "authz.delegation_grant",
        "authz.override",
        "authz.record_acl",
        "master.principal",
      ];
      const rows = [];
      for (const table of tables) {
        const r = await sql<{
          value: unknown;
        }>`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) value FROM ${sql.table(table)} r`.execute(
          tx,
        );
        rows.push([table, r.rows[0]?.value]);
      }
      return sha256(canonicalBytes(rows));
    });
  }
  async function qualification(reference: string) {
    if (!config.approval || reference !== config.rollout.qualificationRef)
      return null;
    const envelope = JSON.parse(
      file(config.approval.path, config.approval.sha256).toString(),
    );
    if (
      !envelope ||
      Object.keys(envelope).some(
        (k) => !["payload", "keyId", "algorithm", "signature"].includes(k),
      ) ||
      envelope.algorithm !== "Ed25519" ||
      typeof envelope.keyId !== "string" ||
      typeof envelope.signature !== "string" ||
      !validDeploymentApproval(envelope.payload, config, Date.now())
    )
      return null;
    if (
      !(await container.adapters.publicationVerifier!.verify({
        keyId: envelope.keyId,
        algorithm: envelope.algorithm,
        signature: envelope.signature,
        bytes: canonicalBytes(envelope.payload),
      }))
    )
      return null;
    return envelope.payload.qualification as EntityAuthorizationQualification;
  }
  async function verifyNative() {
    const s = container.services;
    if (
      !s.businessPartnerRequests ||
      !s.records?.surfaces ||
      !s.records.transfers ||
      !s.businessPartner360 ||
      !s.businessPartnerEligibility ||
      !s.businessPartnerGovernedImport
    )
      throw Error("BP_DEPLOYMENT_SERVICES_REQUIRED");
    const registry = createEntityAuthorizationRuntimeRegistry(
      [
        ...createBusinessPartnerCaseRuntimeRegistrations(
          s.businessPartnerRequests,
          scopes,
        ),
        ...createBusinessPartnerReadRuntimeRegistrations(
          s.records.surfaces,
          s.businessPartner360,
          scopes,
        ),
        ...createBusinessPartnerRevealRuntimeRegistrations(
          s.businessPartner360,
          scopes,
        ),
        ...createBusinessPartnerQualificationRuntimeRegistrations(
          s.businessPartnerEligibility,
          scopes,
        ),
        ...createBusinessPartnerActionRuntimeRegistrations(
          s.businessPartnerRequests,
          s.records.queries,
          scopes,
        ),
        createBusinessPartnerImportRegistration(
          s.businessPartnerGovernedImport,
          scopes,
        ),
        createBusinessPartnerExportRegistration(s.records.transfers, scopes),
      ],
      {
        sourceConstraints:
          container.platform.authorizer?.checkSourceConstraints,
      },
    );
    if (!container.adapters.publicationArtifactStore)
      throw Error("BP_DEPLOYMENT_STORE_REQUIRED");
    const loader = new VerifiedPublicationArtifactLoader({
      store: container.adapters.publicationArtifactStore,
      verifier: container.adapters.publicationVerifier!,
      canonicalizer: { canonicalBytes, sha256 },
      runtimeVersion: host.publication.runtimeVersion,
      authorizationRuntime: {
        qualify(p, b) {
          assertBusinessPartnerCaseRuntimeSemantics(p);
          registry.qualify(p, b);
        },
      },
    });
    const loaded = await loader.load(config.artifactReference);
    if (
      sha256(canonicalBytes(loaded.document)) !==
      sha256(canonicalBytes(artifact))
    )
      throw Error("BP_DEPLOYMENT_NATIVE_ARTIFACT_CHANGED");
  }
  async function currentRelease() {
    await verifyNative();
    const match = await transaction(
      async (tx) =>
        (
          await sql<{
            matches: boolean;
          }>`SELECT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE h.publication_key=${config.publicationKey} AND h.artifact_hash=${config.artifactHash} AND h.source_release_no=${config.artifactReference.sourceReleaseNo} AND a.source_release_id=${config.artifactReference.sourceReleaseId}::uuid) matches`.execute(
            tx,
          )
        ).rows[0]?.matches,
    );
    if (!match) throw Error("BP_DEPLOYMENT_ACTIVE_RELEASE_MISMATCH");
    return config.rollout.release;
  }
  const dependencies: ServiceRegistrationDependencies = {
    businessPartnerBackendAuthorizationTenantId: config.tenantId,
    businessPartnerBackendAuthorization: {
      profile,
      runtime: parseEntityAuthorizationRuntime(
        descriptor.descriptor.authorizationRuntime,
        profile,
      ),
      permissionTransitions: businessPartnerPermissionTransitions(profile),
      rollout: config.rollout,
      scopes,
      currentRelease,
      verifyQualification: qualification,
      currentRevocationWatermark: watermark,
      writeShadow: async () => {},
      diagnostic: () => {
        console.warn("BP_DEPLOYMENT_SHADOW_UNAVAILABLE");
      },
    },
  };
  return {
    dependencies,
    async verifyStartup() {
      await verifyNative();
      if (config.rollout.mode === "enforce") {
        await currentRelease();
        const q = await qualification(config.rollout.qualificationRef!);
        if (!q || q.revocationWatermark !== (await watermark()))
          throw Error("BP_DEPLOYMENT_ENFORCEMENT_NOT_QUALIFIED");
      }
      console.info(
        JSON.stringify({
          event: "bp_authorization_deployment_verified",
          mode: config.rollout.mode,
          tenantId: config.tenantId,
          releaseId: config.artifactReference.sourceReleaseId,
          artifactHash: config.artifactHash,
          runtimeImage: config.runtimeImage,
          enforcement: config.rollout.mode === "enforce",
        }),
      );
    },
  };
}
