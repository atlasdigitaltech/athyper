import assert from "node:assert/strict";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { KyselyLocalProjectionRepository } from "../../../src/kysely-local-projection-repository.ts";

const planes = ["studio", "neon", "mesh"];
const databaseNames = { studio: process.env.PUBLICATION_STUDIO_DATABASE ?? "athyper_studio", neon: process.env.PUBLICATION_NEON_DATABASE ?? "athyper_neon", mesh: process.env.PUBLICATION_MESH_DATABASE ?? "athyper_mesh" };
const databaseHost=process.env.PUBLICATION_DATABASE_HOST ?? "athyper-publication-e-gate";
const databasePort=process.env.PUBLICATION_DATABASE_PORT ?? "5432";
const databaseUser=process.env.PUBLICATION_DATABASE_USER ?? "postgres";
const databasePassword=process.env.PUBLICATION_DATABASE_PASSWORD ?? "publication_gate";
const planeNumber = { studio: "1", neon: "2", mesh: "3" };
const results = [];

for (const plane of planes) {
  const pool = new pg.Pool({
    host:databaseHost,port:Number(databasePort),user:databaseUser,password:databasePassword,database:databaseNames[plane],
    max: 4,
  });
  const database = new Kysely({ dialect: new PostgresDialect({ pool }) });
  const repository = new KyselyLocalProjectionRepository(database);
  try {
    const first = fixture(plane, 1);
    const staged = await repository.stage(first);
    assert.equal(staged.status, "staged");
    assert.deepEqual(await repository.stage(first), staged, `${plane}: staging must resume idempotently`);

    const verified = await repository.verify(verification(first, staged.id));
    assert.equal(verified.status, "verified");
    assert.equal((await repository.verify(verification(first, staged.id))).status, "verified");

    const activated = await repository.activate({ appliedReleaseId: staged.id });
    assert.equal(activated.status, "active");
    assert.equal((await repository.activate({ appliedReleaseId: staged.id })).id, activated.id);

    const active = await repository.findActive(first.deployment.publicationKey);
    const entity = await repository.findActiveEntity(first.deployment.publicationKey);
    assert.equal(active?.id, staged.id);
    assert.equal(entity?.releaseNo, 1);
    assert.equal(entity?.plane, plane);
    assert.deepEqual(entity?.descriptor, { operation_scope_bindings: [], runtime: "same-behavior" });

    const rejectedFixture = fixture(plane, 2);
    const rejectedStage = await repository.stage(rejectedFixture);
    const rejected = await repository.verify({
      ...verification(rejectedFixture, rejectedStage.id),
      computedArtifactHash: "f".repeat(64),
    });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.failureCode, "ARTIFACT_HASH_MISMATCH");

    const activeAfterRejection = await repository.findActive(first.deployment.publicationKey);
    const entityAfterRejection = await repository.findActiveEntity(first.deployment.publicationKey);
    assert.equal(activeAfterRejection?.id, staged.id, `${plane}: rejected release moved local head`);
    assert.equal(entityAfterRejection?.releaseNo, 1, `${plane}: active entity did not use local head`);

    results.push({
      stage: staged.status,
      verify: verified.status,
      activate: activated.status,
      activeReleaseNo: active?.sourceReleaseNo,
      activeEntityReleaseNo: entity?.releaseNo,
      rejected: rejected.failureCode,
      headPreserved: activeAfterRejection?.id === staged.id,
    });
  } finally {
    await database.destroy();
  }
}

assert.deepEqual(results[1], results[0], "Neon behavior differs from Studio");
assert.deepEqual(results[2], results[0], "Mesh behavior differs from Studio");
process.stdout.write(`PUBLICATION_THREE_PLANE_PROJECTION_OK ${JSON.stringify(results[0])}\n`);

function fixture(plane, releaseNo) {
  const p = planeNumber[plane];
  const suffix = `${p}${releaseNo}`.padStart(12, "0");
  const releaseId = `10000000-0000-4000-8000-${suffix}`;
  const publicationKey = `metadata.entity.increment-e-${plane}`;
  const contractHash = releaseNo === 1 ? "a".repeat(64) : "b".repeat(64);
  const artifactHash = releaseNo === 1 ? "c".repeat(64) : "d".repeat(64);
  const generatedAt = "2026-01-01T00:00:00.000Z";
  const entityContract = {
    id: `20000000-0000-4000-8000-${suffix}`,
    entityId: `30000000-0000-4000-8000-00000000000${p}`,
    entityCode: `increment_e_${plane}`,
    releaseId,
    revisionId: `40000000-0000-4000-8000-${suffix}`,
    releaseNo,
    contractSchemaCode: "metadata.entity",
    contractSchemaVersion: "1.0.0",
    contractHash,
    contract: { behavior: "same-behavior", releaseNo },
    publicationKey,
    signature: { algorithm: "Ed25519", keyId: "gate-key", signature: "gate-signature" },
    publishedAt: generatedAt,
  };
  const entityDescriptor = {
    id: `50000000-0000-4000-8000-${suffix}`,
    plane,
    descriptorKind: "entity_runtime",
    descriptorSchemaVersion: "1.0.0",
    sourceContractHash: contractHash,
    compiledHash: "e".repeat(64),
    descriptor: { operation_scope_bindings: [], runtime: "same-behavior" },
    compilerVersion: "increment-e-gate",
    compatibilityLevel: "fully_compatible",
    generatedAt,
  };
  const envelope = {
    schema: "athyper.publication-artifact.v1",
    publicationKey,
    releaseId,
    releaseNo,
    releaseKind: "publish",
    targetPlane: plane,
    artifactKind: "entity_runtime",
    generatedAt,
    compatibilityLevel: "fully_compatible",
    payload: { entityContract, entityDescriptor },
  };
  const manifest = {
    artifactSchema: envelope.schema,
    mediaType: "application/vnd.athyper.publication-artifact.v1+json",
    publicationKey,
    releaseId,
    releaseNo,
    targetPlane: plane,
    artifactKind: "entity_runtime",
    payloadSha256: contractHash,
    compiler: { name: "increment-e", version: "1.0.0" },
    contractSchemaVersion: "1.0.0",
    descriptorSchemaVersion: "1.0.0",
    signatureAlgorithm: "Ed25519",
    signingKeyId: "gate-key",
    createdAt: generatedAt,
  };
  return {
    deployment: {
      deploymentId: `60000000-0000-4000-8000-${suffix}`,
      deploymentStatus: "received",
      targetPlane: plane,
      targetEnvironment: "integration",
      targetInstance: `${plane}-gate`,
      publicationKey,
      sourceReleaseId: releaseId,
      sourceReleaseNo: releaseNo,
      artifactUri: `s3://gate/${plane}/${releaseNo}`,
      artifactHash,
      signatureAlgorithm: "Ed25519",
      signingKeyId: "gate-key",
      signature: "gate-signature",
    },
    artifact: { envelope, manifest, signature: "gate-signature" },
  };
}

function verification(input, appliedReleaseId) {
  return {
    appliedReleaseId,
    computedArtifactHash: input.deployment.artifactHash,
    evidence: {
      signatureVerified: true,
      manifestValid: true,
      runtimeCompatible: true,
      targetPlane: input.deployment.targetPlane,
      contractHash: input.artifact.envelope.payload.entityContract.contractHash,
      descriptorSourceHash: input.artifact.envelope.payload.entityDescriptor.sourceContractHash,
      contractSchemaVersion: "1.0.0",
      descriptorSchemaVersion: "1.0.0",
      signatureAlgorithm: "Ed25519",
      signingKeyId: "gate-key",
    },
  };
}
