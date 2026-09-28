import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJson, compileGraph, validateGraph, sha256 } from "../../../../packages/planes/studio/meta-entity-authoring/src/deterministic.js";
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
function run(input: string) {
  const c = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  assert.equal(c.Config.Labels["com.docker.compose.project"], "athyper-dev"); assert.equal(c.State.Running, true);
  return execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c",
    'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
}
test("DEV successor allocator: independent fixture enrollment, stale pins, first-release separation and exact successor; rollback", {
  skip: process.env.ENTITY_SUCCESSOR_POSTGRES_TEST !== "1" || !process.env.ENTITY_SUCCESSOR_DRAFT_RECEIPT || !process.env.ENTITY_SUCCESSOR_BASELINE,
}, () => {
  const receipt = JSON.parse(readFileSync(process.env.ENTITY_SUCCESSOR_DRAFT_RECEIPT!, "utf8"));
  const baseline = JSON.parse(readFileSync(process.env.ENTITY_SUCCESSOR_BASELINE!, "utf8"));
  assert.match(receipt.changeSet.id, /^[a-f0-9-]{36}$/);
  const graph = JSON.parse(run(`SELECT graph FROM snapshot.entity_draft_save WHERE change_set_id=${literal(receipt.changeSet.id)}::uuid ORDER BY lock_version DESC LIMIT 1;`));
  const actors = JSON.parse(run(`SELECT json_build_object('maker',d.created_by,'checker',d.updated_by) FROM control.policy_definition d
    JOIN control.policy_rule r ON r.policy_definition_id=d.id WHERE d.status='active' AND d.tenant_id=${literal(receipt.authorityTenantId)}::uuid
      AND r.action_config#>>'{policy,changeSetId}'=${literal(baseline.source.authoring.changeSetId)};`));
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const artifact = compileGraph(graph), validation = validateGraph(graph);
  assert.deepEqual(validation.issues, []);
  const p = { schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev", authorityTenantId: receipt.authorityTenantId,
    policyId: "test.successor.transaction", revision: 1, entityId: receipt.entityId, changeSetId: id(701), contractHash: artifact.contractHash,
    descriptorHash: artifact.descriptorHash, authorPrincipalId: baseline.source.actors.submitter, publisherPrincipalId: baseline.source.actors.publisher,
    predecessor: receipt.predecessor, compiler: { name: "transactional.test.compiler", version: "1", buildHash: "a".repeat(64) },
    targets: baseline.targets.map((t: any) => ({ plane: t.plane, environment: "local", instance: "dev", publicationKey: t.head.publication_key,
      appliedReleaseId: t.head.applied_release_id, sourceReleaseId: t.applied.sourceReleaseId, sourceReleaseNo: Number(t.head.source_release_no), artifactHash: t.head.artifact_hash, headVersion: Number(t.head.row_version) })) };
  // Ephemeral test key, not a trusted DEV release signature. No artifact is
  // dispatched and the entire SQL fixture (including enrollment) rolls back.
  const key = generateKeyPairSync("ed25519");
  const signed = { ...artifact, signatureAlgorithm: "Ed25519", signingKeyId: "transactional-test-only",
    signature: sign(null, Buffer.from(canonicalJson(artifact)), key.privateKey).toString("base64") };
  const condition = { and: [{ "===": [{ var: "environment" }, "dev"] }, { "===": [{ var: "tenantId" }, p.authorityTenantId] }, { "===": [{ var: "policyHash" }, sha256(p)] }] };
  const config = { schema: "athyper.machine-publication-enrollment/1", environment: "dev", permissionCode: "studio.metadata.contract.publish_automated", tenantId: p.authorityTenantId, policy: p };
  const ddl = ["15_system_entity_commands.sql", "17_system_entity_successor.sql"].map(file => readFileSync(new URL(`../../../ddl/planes/studio/publication/${file}`, import.meta.url), "utf8")).join("\n");
  const ctx = (actor: string) => `SELECT set_config('app.current_tenant_id',${literal(p.authorityTenantId)},true),set_config('app.current_principal_id',${literal(actor)},true);`;
  const deny = (command: string, error: string) => `DO $$ BEGIN BEGIN ${command} RAISE EXCEPTION 'unexpected acceptance';
    EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>${literal(error)} THEN RAISE; END IF; END; END $$;`;
  const allocate = (previous: string) => `PERFORM * FROM publication.fn_create_system_entity_successor('${id(703)}','${p.changeSetId}',3,${literal(previous)},${literal(JSON.stringify(signed))}::jsonb,ARRAY['studio','neon','mesh'],${literal(p.publisherPrincipalId)});`;
  const output = run(`BEGIN; ${ddl}
    INSERT INTO metadata.entity_change_set(id,tenant_id,entity_id,change_set_code,branch_code,title,lock_version,created_by,base_release_id)
      VALUES('${p.changeSetId}',NULL,${literal(p.entityId)},'test.successor.transaction','test.successor.transaction','Rolled-back successor fixture',1,${literal(actors.maker)},${literal(p.predecessor.authoringReleaseId)});
    INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind)
      VALUES('${p.changeSetId}',1,NULL,${literal(JSON.stringify(graph))}::jsonb,${literal(p.contractHash)},${literal(actors.maker)},'saved');
    INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,version_no,status,definition_hash,created_by)
      VALUES('${id(702)}',${literal(p.authorityTenantId)},'metadata.publication','test.successor.transaction',1,'draft',repeat('a',64),${literal(actors.maker)});
    INSERT INTO control.policy_rule(policy_definition_id,condition_expr,action_code,action_config,created_by)
      VALUES('${id(702)}',${literal(JSON.stringify(condition))}::jsonb,'allow',${literal(JSON.stringify(config))}::jsonb,${literal(actors.maker)});
    UPDATE control.policy_definition SET status='active',updated_by=${literal(actors.checker)},updated_at=clock_timestamp() WHERE id='${id(702)}';
    SET LOCAL ROLE athyper_runtime; ${ctx(p.authorPrincipalId)}
    SELECT publication.fn_record_system_entity_validation('${p.changeSetId}',1,${literal(JSON.stringify(graph))}::jsonb,${literal(JSON.stringify(validation))}::jsonb,${literal(p.authorPrincipalId)});
    SELECT count(*) FROM publication.fn_transition_system_entity_change_set('${p.changeSetId}',1,'draft','in_review',${literal(p.authorPrincipalId)});
    ${deny(`PERFORM * FROM publication.fn_transition_system_entity_change_set('${p.changeSetId}',2,'in_review','approved',${literal(p.authorPrincipalId)});`, "SYSTEM_PUBLICATION_ACTOR_OR_STATE_DENIED")}
    ${ctx(p.publisherPrincipalId)}
    SELECT count(*) FROM publication.fn_transition_system_entity_change_set('${p.changeSetId}',2,'in_review','approved',${literal(p.publisherPrincipalId)});
    ${deny(allocate(id(799)), "SYSTEM_PUBLICATION_SUCCESSOR_ENROLLMENT_REQUIRED")}
    ${deny(`PERFORM * FROM publication.fn_create_system_entity_release('${id(703)}','${p.changeSetId}',3,${literal(JSON.stringify(signed))}::jsonb,ARRAY['studio','neon','mesh'],${literal(p.publisherPrincipalId)});`, "SYSTEM_PUBLICATION_FIRST_RELEASE_REQUIRED")}
    DO $$ BEGIN ${allocate(p.predecessor.authoringReleaseId)}
      IF NOT EXISTS(SELECT 1 FROM metadata.entity_release WHERE id='${id(703)}' AND supersedes_release_id=${literal(p.predecessor.authoringReleaseId)} AND release_no=${Number(p.predecessor.authoringReleaseNo) + 1}) THEN RAISE EXCEPTION 'successor coordinates incorrect'; END IF;
    END $$;
    ${deny(allocate(p.predecessor.authoringReleaseId), "SYSTEM_PUBLICATION_ACTOR_OR_STATE_DENIED")}
    ROLLBACK; SELECT 'successor fixture rollback verified';`);
  assert.match(output, /successor fixture rollback verified/);
});
