import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { canonicalJson, compileGraph, validateGraph, KyselyMetaEntityAuthoringRepository, prepareSystemReferenceRelease, sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { assertHumanReviewedEnrollmentSource } from "./human-publication-admission.js";
import { publicationCompilerIdentity } from "./compiler-build.js";

// Qualification only: every policy, snapshot, release and DDL change is rolled
// back. Test enrollment is not a human approval or deployable policy receipt.
it.skipIf(process.env.HUMAN_PUBLICATION_POSTGRES !== "1")("allocates all approved sources with real role checks, preserving human review, then rolls back", async () => {
  const c = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  if (!c.State.Running || c.Config.Labels["com.docker.compose.project"] !== "athyper-dev") throw Error("DEV required");
  const env = Object.fromEntries(c.Config.Env.map((v: string) => [v.slice(0,v.indexOf("=")),v.slice(v.indexOf("=")+1)]));
  const secret = c.Mounts.find((m: { Destination: string }) => m.Destination === env.POSTGRES_PASSWORD_FILE)?.Source;
  if (!secret?.includes("/.athyper/instances/dev/secrets/")) throw Error("DEV secret required");
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({
    host: (Object.values(c.NetworkSettings.Networks)[0] as { IPAddress: string }).IPAddress,
    user: env.POSTGRES_USER, password: readFileSync(secret,"utf8").trim(), database: "athyper_studio", max: 1,
  }) }) });
  const root = new URL("../../../../../../../", import.meta.url);
  const draft = JSON.parse(readFileSync(new URL("docs/reports/coordinated-release-execution-policy-draft-20261003.json",root),"utf8"));
  draft.compiler = publicationCompilerIdentity();
  for (const p of draft.predecessors) p.compiler = draft.compiler;
  const policy = parseHumanReviewedExecutionPolicy(draft), first = policy.plan.members[0]!;
  const rollback = Error("qualification rollback"), policyId = randomUUID(), policyHash = "d".repeat(64);
  try {
    await expect(db.transaction().execute(async tx => {
      await sql`SET LOCAL lock_timeout='5s'`.execute(tx);
      for (const file of ["20261003_human_reviewed_publication.sql","20261003_product_publication_tenant_reads.sql"]) {
        const migration = readFileSync(new URL(`server/db/migrations/${file}`,root),"utf8");
        await sql.raw(migration.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")).execute(tx);
      }
      const stamp = async (actor: string) => { await sql`SELECT set_config('app.current_tenant_id',${policy.authorityTenantId},true),
        set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','studio',true)`.execute(tx); };
      await stamp(first.authorId);
      await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
      await assertHumanReviewedEnrollmentSource(tx,policy,policy.authorityTenantId);
      const changed = structuredClone(policy); (changed.plan.members[0] as {contractHash: string}).contractHash = "0".repeat(64);
      await expect(assertHumanReviewedEnrollmentSource(tx,changed,policy.authorityTenantId)).rejects.toThrow();
      await sql`RESET ROLE`.execute(tx);
      const existing = (await sql<{id:string; policy:unknown}>`SELECT d.id,r.action_config->'policy' policy
        FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
        WHERE d.status='active' AND d.tenant_id=${policy.authorityTenantId}::uuid
          AND r.action_config#>>'{policy,policyId}'=${policy.policyId}`.execute(tx)).rows[0];
      if (existing) expect(existing.policy).toEqual(policy);
      await stamp(policy.publisherPrincipalId);
      await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
      async function denied(work: () => Promise<unknown>, code: string) {
        await sql`SAVEPOINT denied_probe`.execute(tx);
        await expect(work()).rejects.toThrow(code);
        await sql`ROLLBACK TO SAVEPOINT denied_probe`.execute(tx);
        await sql`RELEASE SAVEPOINT denied_probe`.execute(tx);
      }
      if (!existing) await denied(() => sql`SELECT publication.fn_human_publication_review_evidence(${first.changeSetId}::uuid)`.execute(tx), "ENROLLMENT_REQUIRED");
      await denied(() => sql`SELECT publication.fn_human_reviewed_entity_policy(${JSON.stringify(policy)}::jsonb,${first.changeSetId}::uuid,'release')`.execute(tx), "permission denied");
      await sql`RESET ROLE`.execute(tx);
      await stamp(first.authorId);
      if (!existing) {
      const config = { schema: "athyper.machine-publication-enrollment/1", environment: "dev",
        tenantId: policy.authorityTenantId, permissionCode: "studio.metadata.contract.publish_automated", policy };
      const condition = { and: Object.entries({ environment: "dev", tenantId: policy.authorityTenantId, policyHash: sha256(policy) })
        .map(([key,value]) => ({ "===": [{ var: key },value] })) };
      await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,status,created_by,definition_hash)
        VALUES(${policyId}::uuid,${policy.authorityTenantId}::uuid,'metadata.publication',${`rollback-only.${policyId}`},'draft',${first.authorId}::uuid,${policyHash})`.execute(tx);
      await sql`INSERT INTO control.policy_rule(policy_definition_id,condition_expr,action_code,action_config,created_by)
        VALUES(${policyId}::uuid,${JSON.stringify(condition)}::jsonb,'allow',${JSON.stringify(config)}::jsonb,${first.authorId}::uuid)`.execute(tx);
      await stamp(first.reviewerId);
      await sql`UPDATE control.policy_definition SET status='active',updated_by=${first.reviewerId}::uuid WHERE id=${policyId}::uuid`.execute(tx);
      }
      await stamp(policy.publisherPrincipalId);
      await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
      expect((await sql<{ safe: boolean }>`SELECT NOT rolsuper AND NOT rolbypassrls safe FROM pg_roles WHERE rolname=current_user`.execute(tx)).rows[0]?.safe).toBe(true);
      await stamp(first.reviewerId);
      await denied(() => sql`SELECT publication.fn_human_publication_review_evidence(${first.changeSetId}::uuid)`.execute(tx), "CONTEXT_DENIED");
      await stamp(policy.publisherPrincipalId);
      const repository = new KyselyMetaEntityAuthoringRepository(tx, async (db, input) => { await prepareSystemReferenceRelease(db, input); });
      const { privateKey } = generateKeyPairSync("ed25519");
      const releases: string[] = [];
      for (const member of policy.plan.members) {
        const graph = await repository.loadGraph(member.changeSetId), compiled = compileGraph(graph);
        expect(compiled.contractHash).toBe(member.contractHash);
        const report = validateGraph(graph); expect(report.issues).toEqual([]);
        await repository.recordValidation(member.changeSetId,member.revision,report,policy.publisherPrincipalId);
        const artifact = { ...compiled, signatureAlgorithm: "Ed25519", signingKeyId: "rollback-only-ephemeral",
          signature: sign(null,Buffer.from(canonicalJson(compiled)),privateKey).toString("base64") };
        const release = await repository.createRelease({ changeSetId: member.changeSetId, expectedRevision: member.revision,
          expectedContractHash: member.contractHash, expectedSourceReleaseId: member.sourceReleaseId, actorId: policy.publisherPrincipalId,
          artifact, targetPlanes: member.targets.map(t => t.plane), releaseKind: "publish" });
        releases.push(release.id);
        expect(await repository.getSignedRelease(release.id)).toEqual(artifact);
        expect(await repository.get(member.changeSetId)).toMatchObject({ status: "published", submittedBy: member.authorId,
          approvedBy: member.reviewerId, revision: member.revision+1 });
      }
      for (const release of releases) {
        const context = (await sql<{ value: any }>`SELECT publication.fn_human_execution_context(${release}::uuid) value`.execute(tx)).rows[0]!.value;
        expect(context.coordinationHash).toBe(sha256(policy.plan));
        expect(context.sources).toHaveLength(policy.plan.members.length);
      }
      await sql`SAVEPOINT revoked_probe`.execute(tx);
      await sql`RESET ROLE`.execute(tx);
      await sql`UPDATE master.principal SET status='suspended' WHERE id=${policy.publisherPrincipalId}::uuid AND tenant_id=${policy.authorityTenantId}::uuid`.execute(tx);
      await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
      await denied(() => sql`SELECT publication.fn_human_execution_context(${releases[0]}::uuid)`.execute(tx), "EXECUTION_POLICY_REVOKED");
      await sql`ROLLBACK TO SAVEPOINT revoked_probe`.execute(tx);
      throw rollback;
    })).rejects.toBe(rollback);
    expect((await sql`SELECT id FROM control.policy_definition WHERE id=${policyId}::uuid`.execute(db)).rows).toHaveLength(0);
  } finally { await db.destroy(); }
},60000);
