import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { expect, it } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { compileGraph, sha256 } from "./deterministic.js";
import { applyLearningCorrection } from "./learning-inbox.js";
import { compileTenantLearningDescriptor, prepareTenantLearningExtensionDraft, readProductLearningSource } from "./tenant-learning-extension.js";
import type { AtlasLearningHandoff } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

const connectionString = process.env.ATHYPER_TENANT_EXTENSION_TEST_DATABASE_URL;
// This is a rollback-only framework probe, with synthetic origin attestation and
// authorizer. It cannot establish independent authorship, approval or acceptance.
it.skipIf(!connectionString)("qualifies Country draft ancestry, retry, isolation and immutable/deferred guards under application RLS", async () => {
  const { Pool } = createRequire(new URL("../../../../../db/package.json", import.meta.url))("pg");
  const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }) });
  const rollback = new Error("ROLLBACK_ONLY_FRAMEWORK_PROBE");
  const state = async () => (await sql<{ state: unknown }>`SELECT jsonb_build_object(
    'ancestryTable',to_regclass('metadata.entity_learning_ancestry'),
    'changeSets',(SELECT count(*) FROM metadata.entity_change_set),
    'scopeGuard',encode(sha256(convert_to(pg_get_functiondef('metadata.trg_guard_entity_change_set()'::regprocedure),'UTF8')),'hex')) state`.execute(database)).rows[0]!.state;
  try {
    const before = await state();
    await expect(database.transaction().execute(async tx => {
      await sql`SET LOCAL lock_timeout='5s'`.execute(tx);
      await sql`SET LOCAL statement_timeout='30s'`.execute(tx);
      const present = (await sql<{ present: boolean }>`SELECT to_regclass('metadata.entity_learning_ancestry') IS NOT NULL present`.execute(tx)).rows[0]!.present;
      if (!present) await sql.raw(readFileSync(new URL("../../../../../db/ddl/planes/studio/metadata/21_entity_learning_ancestry.sql", import.meta.url), "utf8")).execute(tx);
      const actors = (await sql<{ tenant_id: string; principal_id: string }>`SELECT tenant.id tenant_id,p.id principal_id
        FROM master.tenant tenant JOIN master.principal p ON p.tenant_id=tenant.id
        WHERE tenant.code='cirrusatlantic' AND p.code='catl.admin' AND tenant.status='active' AND p.status='active'`.execute(tx)).rows;
      expect(actors).toHaveLength(1);
      const actor = actors[0]!;
      const sourceId = (await sql<{ id: string }>`SELECT link.publication_release_id id FROM metadata.entity_release r
        JOIN metadata.entity e ON e.id=r.entity_id AND e.entity_code='country' AND e.tenant_id IS NULL
        JOIN publication.entity_release_link link ON link.entity_release_id=r.id
        WHERE r.tenant_id IS NULL ORDER BY r.release_no DESC LIMIT 1`.execute(tx)).rows[0]!.id;
      await sql`SET LOCAL ROLE athyperapp`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${actor.tenant_id},true),set_config('app.current_principal_id',${actor.principal_id},true),
        set_config('app.database_plane','studio',true),set_config('app.current_plane_key','studio',true)`.execute(tx);
      const proposal: AtlasLearningHandoff = { schemaVersion: 1, candidateId: randomUUID(), feedbackId: randomUUID(), tenantId: actor.tenant_id,
        submittedBy: actor.principal_id, originPlane: "neon", locale: "en", phrase: "review the country dossier", capabilityId: "entity_read_record", entityCode: "country",
        sourceReleaseId: sourceId, sourceDescriptorHash: "a".repeat(64), sourceContractHash: "b".repeat(64), proposalHash: sha256(randomUUID()), expiresAt: "2099-01-01T00:00:00Z" };
      const source = await readProductLearningSource(tx, proposal);
      expect(source).not.toBeNull();
      const input = { database: tx, authorizer: { authorize: async () => ({ allowed: true }) } as never,
        context: { planeKey: "studio", tenantId: actor.tenant_id, principalId: actor.principal_id } as VerifiedRequestContext,
        proposal, sourceCurrent: async () => true };
      const prepared = await prepareTenantLearningExtensionDraft(input);
      expect(prepared.changeSet.tenantId).toBe(actor.tenant_id);
      expect(prepared.changeSet.entityId).toBe(source!.entityId);
      expect(prepared.reused).toBe(false);
      const retry = await prepareTenantLearningExtensionDraft(input);
      expect(retry.reused).toBe(true);
      expect(retry.changeSet.id).toBe(prepared.changeSet.id);
      const candidateGraph = applyLearningCorrection(prepared.baselineGraph, { ...proposal, sourceContractHash: compileGraph(prepared.baselineGraph).contractHash });
      const result = compileTenantLearningDescriptor({ ...prepared, candidateGraph, tenantId: actor.tenant_id });
      expect(result.tenantLearningAncestry.tenantId).toBe(actor.tenant_id);
      expect(prepared.baselineGraph.entity.ownershipModel).toBe("system");
      expect(prepared.baselineGraph.runtimeProfiles?.[0]?.storageSchema).toBe("shared");
      await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(tx);
      // A direct unanchored product-base draft must fail at the transaction fence.
      await sql`SAVEPOINT orphan_probe`.execute(tx);
      await sql`SET CONSTRAINTS metadata.entity_learning_ancestry_required DEFERRED`.execute(tx);
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      await repository.createDraft({ tenantId: actor.tenant_id, entityId: source!.entityId, entityCode: "country", actorId: actor.principal_id,
        branchCode: `orphan.${randomUUID()}`, title: "Orphan probe", productBase: { releaseId: source!.authoringReleaseId, releaseHash: source!.releaseHash } });
      await expect(sql`SET CONSTRAINTS metadata.entity_learning_ancestry_required IMMEDIATE`.execute(tx)).rejects.toMatchObject({ code: "23514" });
      await sql`ROLLBACK TO SAVEPOINT orphan_probe`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true)`.execute(tx);
      expect((await sql`SELECT * FROM metadata.entity_learning_ancestry WHERE change_set_id=${prepared.changeSet.id}::uuid`.execute(tx)).rows).toHaveLength(0);
      await sql`RESET ROLE`.execute(tx);
      await sql`SAVEPOINT immutable_probe`.execute(tx);
      await expect(sql`UPDATE metadata.entity_learning_ancestry SET product_release_no=product_release_no+1 WHERE change_set_id=${prepared.changeSet.id}::uuid`.execute(tx)).rejects.toMatchObject({ code: "23514" });
      await sql`ROLLBACK TO SAVEPOINT immutable_probe`.execute(tx);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await state()).toEqual(before);
  } finally {
    await database.destroy();
  }
}, 45_000);
