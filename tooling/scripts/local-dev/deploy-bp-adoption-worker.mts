/** Scoped DEV compiled-only adoption. Historical pairs are check-only. */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
} from "../../../server/packages/contracts/publication/src/artifact.js";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import { verifyDevPublicationCredential } from "../../../server/apps/platform-host/src/composition/dev-publication.js";
import { loadConfig } from "../../../server/apps/platform-host/src/config/index.js";
import { createContainer } from "../../../server/apps/platform-host/src/composition/create-container.js";
import { registerAdapters } from "../../../server/apps/platform-host/src/composition/register-adapters.js";
import { registerPlatform } from "../../../server/apps/platform-host/src/composition/register-platform.js";
import { registerServices } from "../../../server/apps/platform-host/src/composition/register-services.js";
import { registerRuntimes } from "../../../server/apps/platform-host/src/composition/register-runtimes.js";
import { businessPartnerReadOperationContracts } from "../../../server/apps/platform-host/src/composition/business-partner-read-runtime.js";
import { createLifecycle } from "../../../server/packages/foundation/src/lifecycle/index.js";
import { PublicationOrchestrator } from "../../../server/packages/services/publication/src/publication-orchestrator.js";
import { KyselyPublicationAuthorityRepository } from "../../../server/packages/services/publication/src/kysely-authority-repository.js";
import { KyselyLocalProjectionRepository } from "../../../server/packages/services/publication/src/kysely-local-projection-repository.js";
import { readCompiledRuntimeContract } from "../../../server/packages/platform/metadata/src/compiled-runtime-contract.js";
const require = createRequire(
  new URL(
    "../../../server/packages/services/publication/package.json",
    import.meta.url,
  ),
);
const { Client, Pool } = require("pg"),
  { Kysely, PostgresDialect } = require("kysely");
const lifecycle = createLifecycle();
let studio: any, neon: any, target: any, authorityDatabase: any;
let phase = "admission";
let activationAttempted = false;
let activationConfirmed = false;
let resumeDeployment: any;
const check = (v: unknown, code: string) => {
  if (!v) throw Error(code);
};
try {
  check(
    process.env.ATHYPER_ENV === "local" &&
      process.env.ATHYPER_DEV_PRESET === "devfull" &&
      process.env.ATHYPER_DOMAIN_SUFFIX === "dev.athyper.test",
    "DEVFULL_ONLY",
  );
  let input = "";
  for await (const part of process.stdin) {
    input += part;
    check(input.length < 16 * 1024 * 1024, "INPUT_LIMIT");
  }
  const {
    candidate: c,
    candidateHash,
    configuration: cfg,
    credentials,
    databaseUrl,
    apply,
  } = JSON.parse(input);
  const compiledOnly = c.schema === "athyper.compiled-only-entity-candidate/1";
  check(!apply || compiledOnly, "PAIRED_NATIVE_ADOPTION_RETIRED");
  check(
    (candidateHash ===
      "5e4ab67e8501f56b5b7533822d1f06302e37e0377777444fd644210925e15c6f" ||
      (!apply &&
        candidateHash ===
          "f8fbe4ccbbae56efe7de7fe9dd7f930449722584b2b41e58eb0aef5670594b0e") ||
      (compiledOnly &&
        candidateHash ===
          "b1fc1fdfae1e251e6197083cfae4631fd5b4261b7077cf7d12c25502984cef90") ||
      (compiledOnly &&
        candidateHash ===
          "77adde8e8e610196f099f776f6c121543dd8d47b571a0eb2fe99c7b8377e2492")) &&
      sha256(canonicalBytes(c)) === candidateHash,
    "CANDIDATE_CHANGED",
  );
  check(
    cfg.tenantId === "11111111-1111-4111-8111-111111111111" &&
      cfg.tenantCode === "athyper" &&
      cfg.instance === "dev" &&
      cfg.entityCode === "business_partner" &&
      cfg.targets.join() === "neon" &&
      cfg.author.principalId !== cfg.publisher.principalId,
    "WORKLOAD_SCOPE_INVALID",
  );
  for (const role of ["author", "publisher"])
    verifyDevPublicationCredential(credentials[role], cfg[role]);
  const u = new URL(databaseUrl);
  check(
    u.pathname === "/athyper_neon" && /^172\./.test(u.hostname),
    "LOCAL_DATABASE_REQUIRED",
  );
  neon = new Client({ connectionString: databaseUrl });
  u.pathname = "/athyper_studio";
  studio = new Client({ connectionString: u.toString() });
  await Promise.all([neon.connect(), studio.connect()]);
  const actors = async () => {
    for (const role of ["author", "publisher"]) {
      const a = cfg[role];
      const r = await studio.query(
        `SELECT id FROM master.principal WHERE id=$1 AND tenant_id=$2 AND code=$3 AND auth_epoch=$4 AND status='active' AND is_active AND principal_type='service_account' AND provisioning_source='internal' AND metadata->'devPublication'=$5::jsonb`,
        [
          a.principalId,
          cfg.tenantId,
          `dev.metadata.${role}`,
          a.authEpoch,
          JSON.stringify({ role, instance: "dev" }),
        ],
      );
      check(r.rowCount === 1, "WORKLOAD_REVOKED");
    }
  };
  await actors();
  phase = "catalog-reconciliation";
  const catalog = (
    await neon.query(
      `SELECT p.canonical_code,array_agg(s.scope_kind::text) scopes FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id AND s.status='active' WHERE p.status='published' GROUP BY p.canonical_code`,
    )
  ).rows;
  const byPermission = new Map<string, string[]>(
    catalog.map((r: any) => [r.canonical_code, r.scopes]),
  );
  for (const operation of businessPartnerReadOperationContracts()) {
    const scope =
      operation.scope === "tenant.record.v1"
        ? "tenant"
        : "operating_organization";
    check(
      byPermission.get(operation.permissionCode)?.includes(scope),
      "READ_PERMISSION_SCOPE_NOT_PUBLISHED",
    );
  }
  const d = compiledOnly
    ? c.compiledRuntime.artifacts.find(
        (a: any) => a.artifactKey === `${c.entityCode}/runtime`,
      )?.content.descriptor
    : c.nativeDescriptor;
  check(d, "COMPILED_RUNTIME_CONTRACT_REQUIRED");
  const unresolvedOperations = d.authorization.operations
    .filter((o: any) => {
      const expected: Record<string, string[]> = {
        "tenant.record.v1": ["tenant"],
        "organization.record.v1": ["operating_organization"],
        "company.record.v1": ["company_code"],
        "organization-company.record.v1": [
          "operating_organization",
          "company_code",
        ],
        "workspace.record.v1": ["workspace"],
        "network.relationship.v1": ["network_relationship"],
      };
      return (
        !expected[o.scope] ||
        expected[o.scope]!.some(
          (scope) => !byPermission.get(o.permissionCode)?.includes(scope),
        )
      );
    })
    .map((o: any) => o.key);
  check(
    !apply || unresolvedOperations.length === 0,
    "UNRESOLVED_OPERATION_PERMISSIONS",
  );
  const heads = async () =>
    (
      await neon.query(
        "SELECT publication_key,artifact_hash FROM runtime_meta.release_activation_head ORDER BY publication_key",
      )
    ).rows;
  const before = await heads();
  if (apply) {
    const existing = await studio.query(
      `SELECT id FROM publication.release WHERE tenant_id=$1 AND metadata->>'candidateHash'=$2 LIMIT 1`,
      [cfg.tenantId, candidateHash],
    );
    if (existing.rowCount) {
      resumeDeployment = (
        await studio.query(
          `SELECT r.id AS release_id,r.release_no,d.id AS deployment_id,d.status AS deployment_status,
                  a.artifact_uri,a.content_hash,a.signature,a.signing_key_id,a.signature_algorithm
             FROM publication.release r
             JOIN publication.artifact a ON a.publication_release_id=r.id
             JOIN publication.deployment d ON d.artifact_id=a.id
            WHERE r.id=$1 AND a.artifact_kind='compiled_entity_runtime'
            ORDER BY d.created_at DESC LIMIT 1`,
          [existing.rows[0].id],
        )
      ).rows[0];
      check(resumeDeployment, "CANDIDATE_RESUME_DEPLOYMENT_NOT_FOUND");
    }
    const tenantHead = before.find(
      (r: any) =>
        r.publication_key ===
        `metadata.compiled_entity.business_partner.tenant.${cfg.tenantId}`,
    );
    const expected = c.provenance.predecessorTenantArtifactHash;
    if (resumeDeployment && tenantHead) {
      const active = await neon.query(
        `SELECT source_release_id FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE h.publication_key=$1`,
        [`metadata.compiled_entity.business_partner.tenant.${cfg.tenantId}`],
      );
      check(
        active.rows[0]?.source_release_id === resumeDeployment.release_id,
        "TENANT_SUCCESSOR_HEAD_CHANGED",
      );
    } else if (expected !== undefined)
      check(
        tenantHead?.artifact_hash === expected,
        "TENANT_SUCCESSOR_HEAD_CHANGED",
      );
    else check(!tenantHead, "TENANT_HEAD_ALREADY_EXISTS");
  }
  check(
    before.find(
      (r: any) =>
        r.publication_key === "metadata.compiled_entity.business_partner",
    )?.artifact_hash === c.provenance.compiledSourceArtifactHash,
    "BASELINE_CHANGED",
  );
  phase = "host-runtime-registration";
  const config = loadConfig(),
    container = createContainer();
  registerAdapters(container, config, lifecycle);
  registerRuntimes(container, config, lifecycle);
  registerPlatform(container, config);
  registerServices(container, {}, config, lifecycle);
  const signer = container.adapters.publicationSigner,
    store = container.adapters.publicationArtifactStore;
  const loader = container.services.publication?.loaders?.neon;
  check(
    signer && store && loader && container.adapters.redisCache,
    "PUBLICATION_RUNTIME_UNAVAILABLE",
  );
  const now = new Date().toISOString(),
    keyId = config.publication.signingKeyId!;
  const tenantReleaseNo =
    Number(
      (
        await studio.query(
          `SELECT coalesce(max(release_no),0)::int AS release_no FROM publication.release WHERE tenant_id=$1 AND release_key=$2`,
          [
            cfg.tenantId,
            `metadata.compiled_entity.business_partner.tenant.${cfg.tenantId}`,
          ],
        )
      ).rows[0].release_no,
    ) + 1;
  check(
    Number.isSafeInteger(tenantReleaseNo) && tenantReleaseNo > 0,
    "RELEASE_SEQUENCE_INVALID",
  );
  const baselineReleaseId = c.provenance.compiledSourceReleaseId,
    baselineHash = candidateHash;
  const documents: any = {},
    deployments: any = {},
    members: any = {};
  // New adoption contract explicitly describes its source; it is not a forged
  // historical authoring graph or an inherited source-tenant approval.
  const contract = {
    schema: "athyper.product-entity-adoption/1",
    candidateHash,
    entityCode: c.entityCode,
    authorization: d.authorization,
    authorizationRuntime: d.authorizationRuntime,
    surfaces: d.ai ? [{ status: "active", layoutConfig: { ai: d.ai } }] : [],
  };
  const contractHash = sha256(canonicalBytes(contract));
  phase = "fresh-signing";
  const innerSignature = compiledOnly
    ? undefined
    : (
        await signer!.sign({
          algorithm: "Ed25519",
          keyId,
          bytes: canonicalBytes(contract),
        })
      ).signature;
  for (const name of compiledOnly ? ["compiled"] : ["native", "compiled"]) {
    const native = name === "native",
      kind = native ? "entity_runtime" : "compiled_entity_runtime";
    const publicationKey = `metadata.${native ? "entity" : "compiled_entity"}.business_partner.tenant.${cfg.tenantId}`;
    check(
      !apply ||
        !before.some((r: any) => r.publication_key === publicationKey) ||
        c.provenance.predecessorTenantArtifactHash !== undefined,
      "ADOPTION_ALREADY_EXISTS",
    );
    const releaseId = randomUUID();
    const payload = native
      ? {
          entityContract: {
            id: randomUUID(),
            tenantId: cfg.tenantId,
            entityId: randomUUID(),
            entityCode: c.entityCode,
            releaseId,
            revisionId: randomUUID(),
            releaseNo: 1,
            contractSchemaCode: "meta_entity",
            contractSchemaVersion: "1.0.0",
            contractHash,
            contract,
            publicationKey,
            signature: {
              algorithm: "Ed25519",
              keyId,
              signature: innerSignature,
            },
            publishedAt: now,
          },
          entityDescriptor: {
            id: randomUUID(),
            plane: "neon",
            descriptorKind: "entity_runtime",
            descriptorSchemaVersion: "1.0.0",
            sourceContractHash: contractHash,
            compiledHash: sha256(canonicalBytes(d)),
            descriptor: d,
            compilerVersion: "1.0.0",
            compatibilityLevel: "backward_compatible",
            generatedAt: now,
          },
        }
      : {
          ...(compiledOnly
            ? publishedCompiledProjection(c.compiledRuntime)
            : c.compiledRuntime),
          tenantId: cfg.tenantId,
        };
    const envelope = {
      schema: "athyper.publication-artifact.v1",
      publicationKey,
      releaseId,
      releaseNo: tenantReleaseNo,
      releaseKind: "publish",
      targetPlane: "neon",
      artifactKind: kind,
      generatedAt: now,
      minimumRuntimeVersion: "2.0.0",
      compatibilityLevel: "backward_compatible",
      payload,
    };
    const manifest = {
      artifactSchema: envelope.schema,
      mediaType: "application/vnd.athyper.publication-artifact.v1+json",
      publicationKey,
      releaseId,
      releaseNo: tenantReleaseNo,
      targetPlane: "neon",
      artifactKind: kind,
      payloadSha256: sha256(canonicalBytes(payload)),
      compiler: {
        name: compiledOnly
          ? "athyper.dev-compiled-adoption"
          : "athyper.dev-paired-adoption",
        version: "1.0.0",
      },
      contractSchemaVersion: "1.0.0",
      descriptorSchemaVersion: "1.0.0",
      signatureAlgorithm: "Ed25519",
      signingKeyId: keyId,
      createdAt: now,
      evidence: {
        baselineReleaseId,
        baselineHash,
        approvalMode: "user-authorized-dev-workload",
        humanReviewImpersonated: false,
        ...(native
          ? {
              authorizationProfileHash: sha256(canonicalBytes(d.authorization)),
              authorizationRuntimeVersion:
                d.authorizationRuntime.runtimeVersion,
            }
          : {}),
      },
    };
    const signature = (
      await signer!.sign({
        algorithm: "Ed25519",
        keyId,
        bytes: canonicalBytes({ envelope, manifest }),
      })
    ).signature;
    const document = { envelope, manifest, signature },
      bytes = canonicalBytes(document),
      artifactHash = sha256(bytes);
    const artifactKey = `adoptions/${cfg.tenantId}/${candidateHash}/${artifactHash}.json`;
    const artifactUri = `s3://${container.adapters.objectStorageArtifactsBucket}/${artifactKey}`;
    documents[name] = {
      document,
      bytes,
      artifactKey,
      artifactId: randomUUID(),
    };
    deployments[name] = {
      deploymentId: randomUUID(),
      deploymentStatus: "dispatched",
      targetPlane: "neon",
      targetEnvironment: "development",
      targetInstance: "athyper_neon",
      publicationKey,
      sourceReleaseId: releaseId,
      sourceReleaseNo: tenantReleaseNo,
      artifactUri,
      artifactHash,
      signatureAlgorithm: "Ed25519",
      signingKeyId: keyId,
      signature,
    };
    members[name] = {
      kind,
      tenantId: cfg.tenantId,
      entityCode: c.entityCode,
      plane: "neon",
      publicationKey,
      artifactHash,
      baselineReleaseId,
      baselineHash,
      expectedActiveHash: null,
    };
  }
  // The same host registry validates both freshly signed documents in check
  // mode, without writing artifacts or approval rows.
  const originalGet = store!.get.bind(store);
  if (!resumeDeployment)
    store!.get = async (request) => {
      const name = Object.keys(deployments).find(
        (n) => deployments[n].artifactUri === request.uri,
      );
      return name ? documents[name].bytes : originalGet(request);
    };
  phase = "runtime-qualification";
  if (!resumeDeployment)
    for (const dep of Object.values(deployments))
      await loader!.load(dep as any);
  if (!apply) {
    let activatedReaderVerified = false;
    const active = await neon.query(
      `SELECT a.source_release_id FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE h.publication_key=$1`,
      [`metadata.compiled_entity.business_partner.tenant.${cfg.tenantId}`],
    );
    if (compiledOnly && active.rowCount === 1) {
      const approved = await studio.query(
        `SELECT id FROM publication.release WHERE id=$1 AND tenant_id=$2 AND status='published' AND approved_by=$3 AND published_by=$3`,
        [
          active.rows[0].source_release_id,
          cfg.tenantId,
          cfg.publisher.principalId,
        ],
      );
      check(approved.rowCount === 1, "DURABLE_APPROVAL_MISMATCH");
      const reader = container.platform.compiledEntityReader!;
      const resolved = await reader.resolve({
        tenantId: cfg.tenantId,
        principalId: cfg.publisher.principalId,
        planeKey: "neon",
        entityCode: c.entityCode,
      });
      check(resolved, "ACTIVATED_COMPILED_RELEASE_NOT_RESOLVED");
      const runtime = await readCompiledRuntimeContract(reader, resolved!);
      check(
        runtime.releaseId === active.rows[0].source_release_id,
        "ACTIVATED_COMPILED_RELEASE_MISMATCH",
      );
      const requestResolved = await reader.resolve({
        tenantId: cfg.tenantId,
        principalId: cfg.publisher.principalId,
        planeKey: "neon",
        entityCode: "business_partner_request",
      });
      check(requestResolved, "ACTIVATED_REQUEST_COMPILED_RELEASE_NOT_RESOLVED");
      const requestRuntime = await readCompiledRuntimeContract(
        reader,
        requestResolved!,
      );
      check(
        requestRuntime.releaseId === active.rows[0].source_release_id &&
          requestRuntime.collectionRelationship !== undefined &&
          requestRuntime.authorizationRuntime === undefined,
        "ACTIVATED_REQUEST_COMPILED_RELEASE_MISMATCH",
      );
      activatedReaderVerified = true;
    }
    console.log(
      "BP_ADOPTION " +
        JSON.stringify({
          status: "qualified",
          candidateHash,
          activationChanged: false,
          activatedReaderVerified,
          readCatalogVerified: 21,
          unresolvedOperations,
          readyForApproval: unresolvedOperations.length === 0,
          publicationMode: compiledOnly
            ? "compiled-only"
            : "legacy-paired-check-only",
          nativeArtifactCount: compiledOnly ? 0 : 1,
        }),
    );
  } else {
    phase = "durable-approval";
    await actors();
    if (resumeDeployment) {
      deployments.compiled = {
        deploymentId: resumeDeployment.deployment_id,
        deploymentStatus: resumeDeployment.deployment_status,
        targetPlane: "neon",
        targetEnvironment: "development",
        targetInstance: "athyper_neon",
        publicationKey: `metadata.compiled_entity.business_partner.tenant.${cfg.tenantId}`,
        sourceReleaseId: resumeDeployment.release_id,
        sourceReleaseNo: Number(resumeDeployment.release_no),
        artifactUri: resumeDeployment.artifact_uri,
        artifactHash: resumeDeployment.content_hash,
        signatureAlgorithm: resumeDeployment.signature_algorithm,
        signingKeyId: resumeDeployment.signing_key_id,
        signature: resumeDeployment.signature,
      };
    }
    if (!resumeDeployment)
      for (const name of ["compiled"]) {
        const dep = deployments[name],
          doc = documents[name];
        await store!.putImmutable({
          key: doc.artifactKey,
          bytes: doc.bytes,
          contentType: doc.document.manifest.mediaType,
          sha256: dep.artifactHash,
          metadata: { candidateHash, tenantId: cfg.tenantId },
        });
      }
    if (!resumeDeployment) await studio.query("BEGIN");
    try {
      if (!resumeDeployment)
        for (const name of ["compiled"]) {
          const dep = deployments[name],
            doc = documents[name],
            m = doc.document.manifest;
          await studio.query(
            `INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata) VALUES($1,$2,$3,$8,'publish','preparing','backward_compatible',$4,$5,$6,$7)`,
            [
              dep.sourceReleaseId,
              cfg.tenantId,
              dep.publicationKey,
              candidateHash,
              sha256(canonicalBytes(m)),
              cfg.author.principalId,
              JSON.stringify({
                source: "user-authorized-dev-adoption",
                candidateHash,
                baselineReleaseId,
                authorId: cfg.author.principalId,
                publisherId: cfg.publisher.principalId,
                compiledArtifactHash: members.compiled.artifactHash,
                humanReviewImpersonated: false,
              }),
              tenantReleaseNo,
            ],
          );
          await studio.query(
            `INSERT INTO publication.artifact_compilation(id,publication_release_id,plane_code,artifact_kind,unsigned_document,unsigned_hash,compiler_name,compiler_version,created_by) VALUES($1,$2,'neon',$3,$4,$5,'athyper.dev-compiled-adoption','1.0.0',$6)`,
            [
              randomUUID(),
              dep.sourceReleaseId,
              m.artifactKind,
              JSON.stringify({ envelope: doc.document.envelope, manifest: m }),
              sha256(
                canonicalBytes({
                  envelope: doc.document.envelope,
                  manifest: m,
                }),
              ),
              cfg.author.principalId,
            ],
          );
          await studio.query(
            `INSERT INTO publication.artifact(id,publication_release_id,plane_code,artifact_kind,artifact_uri,content_hash,status,created_by) VALUES($1,$2,'neon',$3,$4,$5,'compiled',$6)`,
            [
              doc.artifactId,
              dep.sourceReleaseId,
              m.artifactKind,
              dep.artifactUri,
              dep.artifactHash,
              cfg.author.principalId,
            ],
          );
          await studio.query(
            `SELECT publication.fn_transition_artifact($1,'validated')`,
            [doc.artifactId],
          );
          await studio.query(
            `SELECT publication.fn_transition_artifact($1,'signed','Ed25519',$2,$3)`,
            [doc.artifactId, keyId, dep.signature],
          );
          for (const status of ["approved", "published"])
            await studio.query(
              `SELECT publication.fn_transition_release($1,$2,$3,NULL,$4)`,
              [
                dep.sourceReleaseId,
                status,
                cfg.publisher.principalId,
                JSON.stringify({
                  candidateHash,
                  mode: "user-authorized-dev-workload",
                  authorId: cfg.author.principalId,
                  humanReviewImpersonated: false,
                }),
              ],
            );
          const row = (
            await studio.query(
              `SELECT id FROM publication.fn_create_deployment($1,$2,'neon','development','athyper_neon',1,NULL,$3)`,
              [randomUUID(), doc.artifactId, cfg.publisher.principalId],
            )
          ).rows[0];
          dep.deploymentId = row.id;
          await studio.query(
            `SELECT publication.fn_transition_deployment($1,'dispatched',$2)`,
            [
              dep.deploymentId,
              JSON.stringify({
                dispatch: "synchronous-dev-compiled-worker",
                candidateHash,
              }),
            ],
          );
        }
      if (!resumeDeployment) await studio.query("COMMIT");
    } catch (e) {
      if (!resumeDeployment) await studio.query("ROLLBACK");
      throw e;
    }
    store!.get = originalGet; // Deployment must reload durable bytes, not memory.
    target = new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: databaseUrl }),
      }),
    });
    authorityDatabase = new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: u.toString() }),
      }),
    });
    phase = "single-release-dispatch";
    const orchestrator = new PublicationOrchestrator(
      new KyselyPublicationAuthorityRepository(authorityDatabase),
      new KyselyLocalProjectionRepository(target),
      loader!,
      async () => {
        await actors();
        for (const dep of Object.values(deployments) as any[]) {
          const r = await studio.query(
            `SELECT r.metadata FROM publication.release r JOIN publication.artifact a ON a.publication_release_id=r.id JOIN publication.deployment d ON d.artifact_id=a.id WHERE r.id=$1 AND r.tenant_id=$2 AND r.status='published' AND r.created_by=$3 AND r.approved_by=$4 AND r.published_by=$4 AND a.status='signed' AND a.content_hash=$5 AND a.signature=$6 AND d.id=$7 AND d.status IN ('verified','activated')`,
            [
              dep.sourceReleaseId,
              cfg.tenantId,
              cfg.author.principalId,
              cfg.publisher.principalId,
              dep.artifactHash,
              dep.signature,
              dep.deploymentId,
            ],
          );
          check(
            r.rowCount === 1 &&
              r.rows[0].metadata.candidateHash === candidateHash &&
              r.rows[0].metadata.compiledArtifactHash ===
                (resumeDeployment?.content_hash ??
                  members.compiled.artifactHash),
            "DURABLE_APPROVAL_MISMATCH",
          );
        }
      },
    );
    activationAttempted = true;
    const result = await orchestrator.deploy(deployments.compiled.deploymentId);
    activationConfirmed = true;
    phase = "cache-invalidation";
    {
      const cache = container.adapters.redisCache!;
      await cache.set(
        `invalidation:{metadata:neon:${cfg.tenantId}:business_partner}:generation`,
        String(Date.now()),
      );
      const coordinate = {
        tenantId: cfg.tenantId,
        planeKey: "neon",
        entityCode: "business_partner",
        previewScopeKey: null,
        releaseId: null,
        releaseHash: null,
      };
      const { createHash } = await import("node:crypto");
      await cache.delete(
        `metadata:compiled-entity:v2:release:${createHash("sha256").update(JSON.stringify(coordinate)).digest("hex")}`,
      );
    }
    const after = await heads();
    check(
      before
        .filter(
          (r: any) => r.publication_key !== deployments.compiled.publicationKey,
        )
        .every((r: any) =>
          after.some(
            (a: any) =>
              a.publication_key === r.publication_key &&
              a.artifact_hash === r.artifact_hash,
          ),
        ),
      "UNRELATED_HEAD_CHANGED",
    );
    phase = "compiled-reader-verification";
    const reader = container.platform.compiledEntityReader!;
    const resolved = await reader.resolve({
      tenantId: cfg.tenantId,
      principalId: cfg.publisher.principalId,
      planeKey: "neon",
      entityCode: c.entityCode,
    });
    check(resolved, "ACTIVATED_COMPILED_RELEASE_NOT_RESOLVED");
    const runtime = await readCompiledRuntimeContract(reader, resolved!);
    check(
      runtime.releaseId === deployments.compiled.sourceReleaseId,
      "ACTIVATED_COMPILED_RELEASE_MISMATCH",
    );
    const requestResolved = await reader.resolve({
      tenantId: cfg.tenantId,
      principalId: cfg.publisher.principalId,
      planeKey: "neon",
      entityCode: "business_partner_request",
    });
    check(requestResolved, "ACTIVATED_REQUEST_COMPILED_RELEASE_NOT_RESOLVED");
    const requestRuntime = await readCompiledRuntimeContract(
      reader,
      requestResolved!,
    );
    check(
      requestRuntime.releaseId === deployments.compiled.sourceReleaseId &&
        requestRuntime.collectionRelationship !== undefined &&
        requestRuntime.authorizationRuntime === undefined,
      "ACTIVATED_REQUEST_COMPILED_RELEASE_MISMATCH",
    );
    console.log(
      "BP_ADOPTION " +
        JSON.stringify({
          status: "activated",
          publicationMode: "compiled-only",
          nativeArtifactCount: 0,
          compiledReaderVerified: true,
          candidateHash,
          ...result,
          deploymentId: deployments.compiled.deploymentId,
          releaseId: deployments.compiled.sourceReleaseId,
          catlUnchanged: true,
        }),
    );
  }
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  console.log(
    "BP_ADOPTION " +
      JSON.stringify({
        status: "failed",
        activationAttempted,
        activationConfirmed,
        phase,
        code:
          error instanceof Error && /^[A-Z_]+$/.test(error.message)
            ? error.message
            : error instanceof Error
              ? error.name
              : "UNKNOWN",
        cause:
          cause instanceof Error &&
          /^[A-Za-z0-9_ ,:.-]{1,2000}$/.test(cause.message)
            ? cause.message
            : undefined,
        databaseCode:
          error &&
          typeof error === "object" &&
          typeof (error as any).code === "string"
            ? (error as any).code
            : undefined,
        frames:
          error instanceof Error ? error.stack?.split("\n").slice(1, 4) : [],
      }),
  );
  process.exitCode = 1;
} finally {
  await Promise.all([
    studio?.end(),
    neon?.end(),
    target?.destroy(),
    authorityDatabase?.destroy(),
  ]);
  await lifecycle.shutdown("adoption-complete");
}

/** Promotion is freshly hashed and signed; never retain review-only hashes. */
function publishedCompiledProjection(projection: any) {
  const artifacts = projection.artifacts.map((artifact: any) => {
    const { artifactHash: _hash, ...review } = artifact.content;
    const content = { ...review, contractStatus: "published" };
    return parseCompiledEntityArtifact({
      ...content,
      artifactHash: `sha256:${sha256(canonicalBytes(content))}`,
    });
  });
  const {
    releaseHash: _hash,
    signature: _signature,
    ...review
  } = projection.release;
  const release = {
    ...review,
    contractStatus: "published",
    artifacts: artifacts.map((artifact: any) => ({
      artifactKey: artifact.artifactKey,
      artifactType: artifact.artifactType,
      entityCode: artifact.entityCode,
      ref: `${artifact.artifactKey}.json`,
      hash: artifact.artifactHash,
    })),
  };
  return {
    ...projection,
    artifacts,
    release: parseCompiledEntityReleaseEnvelope({
      ...release,
      releaseHash: `sha256:${sha256(canonicalBytes(release))}`,
      signature: { algorithm: "", keyId: "", value: "" },
    }),
  };
}
