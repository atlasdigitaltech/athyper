import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { assertEntitySuccessorSource } from "../../../../packages/planes/studio/meta-entity-authoring/src/publication/successor-source.js";
import { parseDevEntitySuccessorPolicy } from "../../../../packages/contracts/publication/src/policy/entity-successor-policy.js";
import { publicationCompilerIdentity } from "../../../../apps/platform-host/src/composition/shared/publication/compiler-build.js";

test("DEV persisted successor source is readable through runtime RLS and rejects changed pins; no enrollment", {
  skip: process.env.ENTITY_SUCCESSOR_POSTGRES_TEST !== "1" || !process.env.ENTITY_SUCCESSOR_DRAFT_RECEIPT || !process.env.ENTITY_SUCCESSOR_BASELINE,
}, async () => {
  const receipt = JSON.parse(readFileSync(process.env.ENTITY_SUCCESSOR_DRAFT_RECEIPT!, "utf8"));
  const baseline = JSON.parse(readFileSync(process.env.ENTITY_SUCCESSOR_BASELINE!, "utf8"));
  const c = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  assert.equal(c.Config.Labels["com.docker.compose.project"], "athyper-dev"); assert.equal(c.State.Running, true);
  const env = Object.fromEntries(c.Config.Env.map((s: string) => { const i = s.indexOf("="); return [s.slice(0, i), s.slice(i + 1)]; }));
  const secret = c.Mounts.find((m: { Destination: string }) => m.Destination === env.POSTGRES_PASSWORD_FILE)?.Source;
  assert.ok(typeof secret === "string" && secret.includes("/.athyper/instances/dev/secrets/"));
  const host = (Object.values(c.NetworkSettings.Networks)[0] as { IPAddress: string }).IPAddress;
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({ host, user: env.POSTGRES_USER,
    password: readFileSync(secret, "utf8").trim(), database: "athyper_studio", max: 1 }) }) });
  const policy = parseDevEntitySuccessorPolicy({ schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev",
    authorityTenantId: receipt.authorityTenantId, policyId: "diagnostic.unenrolled.successor", revision: 1,
    entityId: receipt.entityId, changeSetId: receipt.changeSet.id, contractHash: receipt.contractHash, descriptorHash: receipt.descriptorHash,
    authorPrincipalId: baseline.source.actors.submitter, publisherPrincipalId: baseline.source.actors.publisher,
    predecessor: receipt.predecessor, compiler: publicationCompilerIdentity(), targets: baseline.targets.map((t: any) => ({ plane: t.plane,
      environment: "local", instance: "dev", publicationKey: t.head.publication_key, appliedReleaseId: t.head.applied_release_id,
      sourceReleaseId: t.applied.sourceReleaseId, sourceReleaseNo: Number(t.head.source_release_no), artifactHash: t.head.artifact_hash, headVersion: Number(t.head.row_version) })) });
  const rollback = new Error("TEST_ROLLBACK");
  try {
    await db.transaction().setIsolationLevel("serializable").execute(async tx => {
      await sql.raw(readFileSync(new URL("../../../ddl/planes/studio/publication/17_system_entity_successor.sql", import.meta.url), "utf8")).execute(tx);
      await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${policy.authorityTenantId},true),set_config('app.current_principal_id',${policy.publisherPrincipalId},true),set_config('app.database_plane','studio',true)`.execute(tx);
      await assertEntitySuccessorSource(tx, policy, policy.authorityTenantId);
      await sql`RESET ROLE`.execute(tx);
      const human = (await sql<{ id: string }>`SELECT id FROM master.principal WHERE tenant_id=${policy.authorityTenantId}::uuid AND code='platform.admin' AND status='active'`.execute(tx)).rows;
      assert.equal(human.length, 1);
      await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
      await sql`SELECT set_config('app.current_principal_id',${human[0]!.id},true)`.execute(tx);
      await assertEntitySuccessorSource(tx, policy, policy.authorityTenantId);
      await assert.rejects(assertEntitySuccessorSource(tx, { ...policy, descriptorHash: "0".repeat(64) }, policy.authorityTenantId), /SOURCE_PIN_CHANGED/);
      await assert.rejects(assertEntitySuccessorSource(tx, { ...policy, predecessor: { ...policy.predecessor, publicationReleaseHash: "0".repeat(64) } }, policy.authorityTenantId), /PREDECESSOR_CHANGED/);
      await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true)`.execute(tx);
      const denied = (await sql<{ graph: unknown }>`SELECT publication.fn_entity_successor_enrollment_source(${JSON.stringify(policy)}::jsonb) graph`.execute(tx)).rows;
      assert.equal(denied[0]?.graph, null);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await db.destroy(); }
});
