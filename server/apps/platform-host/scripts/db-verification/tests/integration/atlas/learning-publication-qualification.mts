import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing/canonical-json";
import { KyselyPublicationAuthorityWork } from "@athyper/server-service-publication/kysely-publication-authority-work";
import { KyselyPublicationAuthorityRepository } from "@athyper/server-service-publication/kysely-authority-repository";
import { KyselyLocalProjectionRepository } from "@athyper/server-service-publication/kysely-local-projection-repository";
import { VerifiedPublicationArtifactLoader } from "@athyper/server-service-publication/publication-artifact-loader";
import { PublicationOrchestrator } from "@athyper/server-service-publication/publication-orchestrator";
import { evaluateAtlasLearningVocabulary } from "@athyper/server-platform-ai/learning-evaluation";
export async function qualifyLearningPublication(
  db: Kysely<Record<string, never>>,
  tenantId: string,
  principalId: string,
  baselineId: string,
  learnedId: string,
) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const bytesByHash = new Map<string, Uint8Array>();
  const canonicalizer = { canonicalBytes, sha256 };
  const store = {
    putImmutable: async (input: any) => {
      const old = bytesByHash.get(input.sha256);
      if (old) assert.deepEqual(old, input.bytes);
      bytesByHash.set(input.sha256, input.bytes);
    },
    get: async (input: any) => {
      const bytes = bytesByHash.get(input.expectedSha256);
      assert(bytes);
      return bytes;
    },
  };
  const signer = {
    sign: async (input: any) => ({
      signature: sign(null, input.bytes, privateKey).toString("base64"),
    }),
  };
  const verifier = {
    verify: async (input: any) =>
      verify(
        null,
        input.bytes,
        publicKey,
        Buffer.from(input.signature, "base64"),
      ),
  };
  await db.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${principalId},true),set_config('app.database_plane','studio',true)`.execute(
      tx,
    );
    const authority = new KyselyPublicationAuthorityRepository(tx),
      local = new KyselyLocalProjectionRepository(tx);
    const work = new KyselyPublicationAuthorityWork({
      database: tx,
      authority,
      store,
      signer,
      canonicalizer,
      bucket: "f4-test",
      signingKeyId: "f4-test",
      targetEnvironment: "test",
      targetPlanes: ["studio"],
    });
    const loader = new VerifiedPublicationArtifactLoader({
      store,
      verifier,
      canonicalizer,
      runtimeVersion: "1.0.0",
    });
    const orchestrator = new PublicationOrchestrator(authority, local, loader);
    const deploy = async (id: string) => {
      await sql`SELECT publication.fn_transition_release(${id}::uuid,'approved',${principalId}::uuid)`.execute(
        tx,
      );
      const compilation = await work.compile(id);
      assert.equal(compilation.compilationIds.length, 1);
      const signed = await work.sign(compilation.compilationIds[0]!);
      const again = await work.sign(compilation.compilationIds[0]!);
      assert.equal(again.deploymentId, signed.deploymentId);
      const deployment = await authority.getDeployment(signed.deploymentId);
      assert(deployment);
      const loaded = await loader.load(deployment);
      assert.equal(loaded.document.envelope.releaseId, id);
      const active = await orchestrator.deploy(signed.deploymentId);
      await orchestrator.deploy(signed.deploymentId); // terminal delivery retry is idempotent
      return active;
    };
    const before = await deploy(baselineId);
    const old = await local.findActiveEntity(
      "metadata.entity.business_partner",
    );
    assert(old);
    assert.equal(old.releaseId, baselineId);
    const fixtures = [
      { question: "Show this company snapshot", expected: "read" },
      {
        question: "Display the current company snapshot please",
        expected: "read",
      },
      { question: "Delete this company snapshot", expected: "delegate" },
    ] as const;
    assert.equal(
      evaluateAtlasLearningVocabulary(
        "business_partner",
        old.descriptor.ai as never,
        fixtures,
      ).passed,
      false,
    );
    await deploy(learnedId);
    const current = await local.findActiveEntity(
      "metadata.entity.business_partner",
    );
    assert(current);
    assert.equal(current.releaseId, learnedId);
    assert.equal(
      evaluateAtlasLearningVocabulary(
        "business_partner",
        current.descriptor.ai as never,
        fixtures,
      ).passed,
      true,
    );
    assert.equal(
      current.compiledHash,
      sha256(canonicalBytes(current.descriptor)),
    );
    await local.rollback({
      publicationKey: "metadata.entity.business_partner",
      targetAppliedReleaseId: before.id,
      evidence: { reason: "F4 disposable rollback proof" },
    });
    const rolledBack = await local.findActiveEntity(
      "metadata.entity.business_partner",
    );
    assert.equal(rolledBack?.releaseId, baselineId);
    assert.equal(
      evaluateAtlasLearningVocabulary(
        "business_partner",
        rolledBack!.descriptor.ai as never,
        fixtures,
      ).passed,
      false,
    );
  });
  console.log(
    "PASS studio: real publication compilation, Ed25519 signatures, verified loader, activation, delivery replay and rollback; unseen questions improve only on the active learned release",
  );
}
