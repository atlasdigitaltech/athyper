/** Feed to the candidate QA worker's node stdin. All database changes roll back. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
const require = createRequire(`${process.cwd()}/package.json`);
const { Kysely, PostgresDialect, sql } = require("kysely");
const dbRequire = createRequire(
  require.resolve("@athyper/server-adapter-db-neon"),
);
const { Pool } = dbRequire("pg");
const {
  compileBusinessPartnerDefinition,
  VerifiedPublicationArtifactLoader,
  KyselyLocalProjectionRepository,
  LocalBusinessPartnerDefinitionConsumer,
  LocalMeshBusinessPartnerDefinitionConsumer,
} = await import(require.resolve("@athyper/server-service-publication"));
if (
  process.env.ATHYPER_DOMAIN_SUFFIX !== "qa.athyper.test" ||
  process.env.ATHYPER_LOCAL_PREVIEW_ROOT
)
  throw new Error(
    "Normal isolated QA worker required; preview must be disabled",
  );
const authoring = JSON.parse(
  readFileSync("/tmp/qa-candidate-authoring.json", "utf8"),
);
const expected = JSON.parse(
  readFileSync("/tmp/qa-candidate-compiled.json", "utf8"),
);
const canonicalizer = {
  canonicalBytes: (value) =>
    Buffer.from(
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.keys(item)
                .sort()
                .map((key) => [key, item[key]]),
            )
          : item,
      ),
    ),
  sha256: (value) => createHash("sha256").update(value).digest("hex"),
};
const hash = (value) =>
  canonicalizer.sha256(canonicalizer.canonicalBytes(value));
const key = generateKeyPairSync("ed25519"),
  signingKeyId = "qa-rollback-probe";
const publicationKey = `studio.business_partner.definition.qa_probe_${randomUUID().replaceAll("-", "")}`;
const checks = [];
for (const plane of authoring.revision.targetPlanes) {
  const compiled = compileBusinessPartnerDefinition({
    bundle: authoring.revision.bundle,
    plane,
    canonicalizer,
  });
  assert.equal(compiled.compiledBundleHash, expected[plane].compiledBundleHash);
  const releaseId = randomUUID(),
    generatedAt = new Date().toISOString();
  const payload = {
    id: randomUUID(),
    tenantId: authoring.revision.tenantId,
    revisionId: authoring.revision.id,
    releaseId,
    releaseNo: 1,
    publicationKey,
    plane,
    bundleCode: compiled.bundle.bundleCode,
    semanticVersion: compiled.bundle.semanticVersion,
    bundleSchemaVersion: "1.0.0",
    bundleHash: compiled.compiledBundleHash,
    sourceBundleHash: compiled.sourceBundleHash,
    compileReport: compiled.report,
    bundle: compiled.bundle,
    generatedAt,
  };
  const envelope = {
    schema: "athyper.publication-artifact.v1",
    publicationKey,
    releaseId,
    releaseNo: 1,
    releaseKind: "publish",
    targetPlane: plane,
    artifactKind: "business_partner_definition_bundle",
    generatedAt,
    compatibilityLevel: "backward_compatible",
    payload,
  };
  const manifest = {
    artifactSchema: envelope.schema,
    mediaType: "application/vnd.athyper.publication-artifact.v1+json",
    publicationKey,
    releaseId,
    releaseNo: 1,
    targetPlane: plane,
    artifactKind: envelope.artifactKind,
    payloadSha256: hash(payload),
    compiler: {
      name: "business-partner-definition",
      version: compiled.report.compilerVersion,
    },
    contractSchemaVersion: "1.0.0",
    descriptorSchemaVersion: "1.0.0",
    signatureAlgorithm: "Ed25519",
    signingKeyId,
    createdAt: generatedAt,
    evidence: {
      developmentEvidence: true,
      rollbackOnly: true,
      humanApprovalPerformed: false,
      compiledBundleHash: compiled.compiledBundleHash,
      sourceBundleHash: compiled.sourceBundleHash,
      compileReportHash: hash(compiled.report),
    },
  };
  const signature = sign(
    null,
    canonicalizer.canonicalBytes({ envelope, manifest }),
    key.privateKey,
  ).toString("base64");
  const document = { envelope, manifest, signature };
  const deployment = {
    deploymentId: randomUUID(),
    deploymentStatus: "dispatched",
    targetPlane: plane,
    targetEnvironment: "qa",
    targetInstance: "qa",
    publicationKey,
    sourceReleaseId: releaseId,
    sourceReleaseNo: 1,
    artifactUri: "s3://qa-rollback-probe/artifact.json",
    artifactHash: hash(document),
    signatureAlgorithm: "Ed25519",
    signingKeyId,
    signature,
  };
  let bytes = canonicalizer.canonicalBytes(document);
  const loader = new VerifiedPublicationArtifactLoader({
    store: { get: async () => bytes },
    canonicalizer,
    runtimeVersion: "1.0.0",
    verifier: {
      verify: async (input) =>
        input.keyId === signingKeyId &&
        input.algorithm === "Ed25519" &&
        verify(
          null,
          input.bytes,
          key.publicKey,
          Buffer.from(input.signature, "base64"),
        ),
    },
  });
  const loaded = await loader.load(deployment);
  bytes = canonicalizer.canonicalBytes({ ...document, signature: "forged" });
  await assert.rejects(loader.load(deployment));
  bytes = canonicalizer.canonicalBytes(document);
  await assert.rejects(
    loader.load({
      ...deployment,
      targetPlane: plane === "neon" ? "mesh" : "neon",
    }),
  );
  const password = encodeURIComponent(
    readFileSync("/run/secrets/worker-db-password", "utf8").trim(),
  );
  const database = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: `postgresql://athyper_worker:${password}@dbpool-session:5432/athyper_${plane}`,
        max: 1,
      }),
    }),
  });
  const rollback = new Error("ROLLBACK_QA_PROBE");
  try {
    try {
      await database.transaction().execute(async (transaction) => {
        const identity = (
          await sql`SELECT session_user AS name`.execute(transaction)
        ).rows[0];
        assert.equal(identity.name, "athyper_worker");
        const repository = new KyselyLocalProjectionRepository(transaction);
        const staged = await repository.stage({
          deployment,
          artifact: loaded.document,
        });
        const verified = await repository.verify({
          appliedReleaseId: staged.id,
          computedArtifactHash: loaded.computedArtifactHash,
          evidence: loaded.verification,
        });
        assert.equal(verified.status, "verified");
        await repository.activate({
          appliedReleaseId: staged.id,
          evidence: { rollbackOnly: true, developmentEvidence: true },
        });
        const active =
          await repository.findActiveBusinessPartnerDefinition(publicationKey);
        assert.equal(active.bundleHash, compiled.compiledBundleHash);
        if (plane === "neon") {
          const consumer = new LocalBusinessPartnerDefinitionConsumer({
            local: repository,
            canonicalizer,
            publicationKey,
          });
          assert.deepEqual(
            (await consumer.descriptors()).forms,
            compiled.bundle.formDescriptors,
          );
          assert.ok(
            (
              await consumer.requestSchema({
                kind: "new_partner",
                requestedRole: "supplier",
                sourceKind: "manual",
              })
            ).hash,
          );
          assert.ok(
            (await consumer.workflow({ kind: "add_supplier" })).stages.length,
          );
        } else if (plane === "mesh") {
          assert.ok(
            (
              await new LocalMeshBusinessPartnerDefinitionConsumer({
                local: repository,
                publicationKey,
              }).organizationProfileSchema()
            ).allowedPaths.length,
          );
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    assert.equal(
      await new KyselyLocalProjectionRepository(database).findActive(
        publicationKey,
      ),
      null,
    );
    checks.push({
      plane,
      compiledBundleHash: compiled.compiledBundleHash,
      nativeSignatureVerified: true,
      tamperRejected: true,
      wrongPlaneRejected: true,
      nativeDatabaseActivationAndConsumer: true,
      rolledBack: true,
    });
  } finally {
    await database.destroy();
  }
}
console.log(
  JSON.stringify({
    schema: "athyper.qa-candidate-artifact-probe/1",
    checks,
    passed: checks.length > 0,
    databaseUser: "athyper_worker",
    previewEnabled: false,
    humanApprovalPerformed: false,
    releaseQualified: false,
  }),
);
