/** Transactional publication proof; test actors, approvals and keys are rolled back, never qualification receipts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, generateKeyPairSync, sign, verify } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { BusinessPartnerCaseContractService } from "@athyper/server-service-publication/business-partner-case-contract-service";
import { KyselyPublicationAuthorityRepository } from "@athyper/server-service-publication/kysely-authority-repository";
import { KyselyPublicationAuthorityWork } from "@athyper/server-service-publication/kysely-publication-authority-work";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing/canonical-json";
const url = process.env.DATABASE_URL;
if (!url || new URL(url).pathname !== "/athyper_studio")
  throw new Error("A protected Studio DATABASE_URL is required");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: url }) }),
});
const neonUrl = new URL(url);
neonUrl.pathname = "/athyper_neon";
const neon = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: neonUrl.href }),
  }),
});
const { KyselyLocalProjectionRepository } =
  await import("@athyper/server-service-publication/kysely-local-projection-repository");
const { VerifiedPublicationArtifactLoader } =
  await import("@athyper/server-service-publication/publication-artifact-loader");
const rollback = new Error("ROLLBACK_CASE_CONTRACT_PROOF");
try {
  await db.transaction().execute(async (tx) => {
    assert.ok(
      (
        await sql`SELECT to_regclass('snapshot.business_partner_case_contract_revision') object`.execute(
          tx,
        )
      ).rows.some((r: any) => r.object),
      "Studio canonical DDL must include the Business Partner case-contract tables",
    );
    const tenant = "44444444-4444-4444-8444-444444444444",
      maker = randomUUID(),
      checker = randomUUID();
    const seed = (
      await sql<{
        id: string;
      }>`SELECT id FROM master.principal WHERE tenant_id=${tenant}::uuid LIMIT 1`.execute(
        tx,
      )
    ).rows[0]!.id;
    for (const [id, code] of [
      [maker, "r4.contract.probe.maker"],
      [checker, "r4.contract.probe.checker"],
    ])
      await sql`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES(${id}::uuid,${tenant}::uuid,${code},'Rollback-only publication probe','service_account','active',${seed}::uuid)`.execute(
        tx,
      );
    const packet = JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../../governance/evidence/business-partner/local/2026-09-05/cirrusatlantic-r4-case-contract-review-scoped.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const native = (
      await sql<any>`SELECT * FROM runtime_meta.entity_contract WHERE tenant_id=${tenant}::uuid AND entity_code='master.business_partner' AND status='published'`.execute(
        neon,
      )
    ).rows[0];
    assert.equal(
      native.id,
      packet.previous.contractId,
      "Refresh the review packet before this proof",
    );
    const base = {
      id: packet.previous.contractId,
      tenantId: tenant,
      entityId: String(native.entity_id),
      publicationKey: packet.publicationKey,
      contractHash: packet.previous.recordedContractHash,
      releaseNo: Number(native.release_no),
      contract: {
        ...packet.candidate.contract,
        required: [...packet.candidate.contract.required, "requestedRole"],
        properties: Object.fromEntries(
          Object.entries(packet.candidate.contract.properties).filter(
            ([name]) => !packet.compatibility.addedProperties.includes(name),
          ),
        ),
      },
    };
    let current = base;
    const scoped = new Proxy(tx, {
      get(target, property) {
        if (property === "transaction")
          return () => ({ execute: (work: any) => work(tx) });
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as Kysely<Record<string, never>>;
    const service = new BusinessPartnerCaseContractService({
      database: scoped,
      canonicalizer: { canonicalBytes, sha256 },
      current: async () => current,
    });
    await sql`SET LOCAL ROLE athyper_publication_service`.execute(tx);
    const draft = {
      tenantId: tenant,
      actorId: maker,
      bundle: packet,
      targetPlanes: ["neon"],
      idempotencyKey: "r4-contract-proof-author",
    };
    const revision = await service.author(draft);
    assert.equal((await service.author(draft)).id, revision.id);
    assert.equal(
      await service.get("11111111-1111-4111-8111-111111111111", revision.id),
      null,
    );
    await assert.rejects(
      service.publish({
        tenantId: tenant,
        revisionId: revision.id,
        actorId: maker,
        idempotencyKey: "r4-contract-proof-self",
      }),
      /SELF_PUBLISH_FORBIDDEN/,
    );
    current = { ...base, id: randomUUID() };
    await assert.rejects(
      service.publish({
        tenantId: tenant,
        revisionId: revision.id,
        actorId: checker,
        idempotencyKey: "r4-contract-proof-stale",
      }),
      /SOURCE_CONFLICT/,
    );
    current = base;
    const approved = await service.publish({
      tenantId: tenant,
      revisionId: revision.id,
      actorId: checker,
      idempotencyKey: "r4-contract-proof-publish",
    });
    assert.equal(approved?.status, "approved");
    assert.equal(
      (
        await service.publish({
          tenantId: tenant,
          revisionId: revision.id,
          actorId: checker,
          idempotencyKey: "r4-contract-proof-publish",
        })
      )?.id,
      approved!.id,
    );
    const keys = generateKeyPairSync("ed25519");
    const stored: Uint8Array[] = [];
    const worker = new KyselyPublicationAuthorityWork({
      database: tx,
      authority: new KyselyPublicationAuthorityRepository(tx),
      canonicalizer: { canonicalBytes, sha256 },
      signer: {
        async sign(input) {
          return {
            signature: sign(null, input.bytes, keys.privateKey).toString(
              "base64",
            ),
            algorithm: "Ed25519",
            keyId: input.keyId,
          };
        },
      },
      store: {
        async putImmutable(input) {
          stored.push(input.bytes);
          return input.key;
        },
      } as any,
      bucket: "rollback-proof",
      signingKeyId: "rollback-proof-ed25519",
      targetEnvironment: "local",
      targetPlanes: ["neon", "mesh"],
    });
    const compiled = await worker.compile(approved!.id);
    assert.equal(compiled.compilationIds.length, 1);
    assert.deepEqual(await worker.compile(approved!.id), compiled);
    const signed = await worker.sign(compiled.compilationIds[0]!);
    assert.ok(signed.deploymentId);
    const artifact = JSON.parse(new TextDecoder().decode(stored[0]));
    assert.equal(artifact.envelope.targetPlane, "neon");
    assert.equal(artifact.envelope.payload.entityContract.tenantId, tenant);
    assert.equal(
      artifact.envelope.payload.entityDescriptor.descriptorKind,
      "entity_case_runtime",
    );
    assert.ok(
      verify(
        null,
        canonicalBytes({
          envelope: artifact.envelope,
          manifest: artifact.manifest,
        }),
        keys.publicKey,
        Buffer.from(artifact.signature, "base64"),
      ),
    );
    assert.ok(
      verify(
        null,
        canonicalBytes(artifact.envelope.payload.entityContract.contract),
        keys.publicKey,
        Buffer.from(
          artifact.envelope.payload.entityContract.signature.signature,
          "base64",
        ),
      ),
    );
    const deployment = await new KyselyPublicationAuthorityRepository(
      tx,
    ).getDeployment(signed.deploymentId);
    assert.ok(deployment);
    const loader = new VerifiedPublicationArtifactLoader({
      store: {
        async get() {
          return stored[0]!;
        },
      } as any,
      verifier: {
        async verify(input) {
          return verify(
            null,
            input.bytes,
            keys.publicKey,
            Buffer.from(input.signature, "base64"),
          );
        },
      },
      canonicalizer: { canonicalBytes, sha256 },
      runtimeVersion: "1.0.0",
    });
    const loaded = await loader.load(deployment!);
    try {
      await neon.transaction().execute(async (target) => {
        await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',(SELECT id::text FROM master.principal WHERE tenant_id=${tenant}::uuid AND code='seed.three-plane-provisioner'),true)`.execute(
          target,
        );
        await sql`SET LOCAL ROLE athyper_projection_applier`.execute(target);
        const repository = new KyselyLocalProjectionRepository(target);
        const staged = await repository.stage({
          deployment: deployment!,
          artifact: loaded.document,
        });
        await repository.verify({
          appliedReleaseId: staged.id,
          computedArtifactHash: loaded.computedArtifactHash,
          evidence: loaded.verification,
        });
        const active = await repository.activate({
          appliedReleaseId: staged.id,
          evidence: { testFixture: true },
        });
        assert.equal(active.status, "active");
        const applied = (
          await sql<any>`SELECT id,entity_contract_hash FROM runtime_meta.entity_contract WHERE tenant_id=${tenant}::uuid AND entity_code='master.business_partner' AND status='published'`.execute(
            target,
          )
        ).rows[0];
        assert.equal(applied.id, revision.id);
        assert.equal(applied.entity_contract_hash, revision.contractHash);
        assert.equal(
          (
            await repository.stage({
              deployment: deployment!,
              artifact: loaded.document,
            })
          ).id,
          staged.id,
        );
        assert.equal(
          (await repository.activate({ appliedReleaseId: staged.id })).id,
          active.id,
        );
        console.log(
          "PASS: verified signed artifact, scoped NEON stage/verify/activation, active contract hash, stage/activation replay. Target changes roll back.",
        );
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    await sql`RESET ROLE`.execute(tx);
    await sql`SAVEPOINT immutable_probe`.execute(tx);
    await assert.rejects(
      sql`UPDATE snapshot.business_partner_case_contract_revision SET contract_hash=${"0".repeat(64)} WHERE id=${revision.id}::uuid`.execute(
        tx,
      ),
      /immutable/,
    );
    await sql`ROLLBACK TO SAVEPOINT immutable_probe`.execute(tx);
    console.log(
      "PASS: native author/replay, cross-tenant denial, maker-checker, stale source denial, approval/replay, NEON-only compilation, Ed25519 schema/artifact signatures, immutable revision. All fixtures roll back.",
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.destroy();
  await neon.destroy();
}
