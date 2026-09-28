import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { validateGraph, sha256 } from "../../../../packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import type { MetaEntityGraph } from "../../../../packages/contracts/meta-entity-authoring/src/index.js";

const ddl = readFileSync(new URL("../../../ddl/planes/studio/publication/15_system_entity_commands.sql", import.meta.url), "utf8");
const q = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
function run(sql: string) {
  const c = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  assert.equal(c.Config.Labels["com.docker.compose.project"], "athyper-dev");
  assert.equal(c.State.Running, true);
  return execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c",
    'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
}
test("command boundary grants no global table writes and contains no product branches", () => {
  assert.doesNotMatch(ddl, /CREATE POLICY|GRANT (UPDATE|INSERT|ALL)|BYPASSRLS|country|currency|business_partner/i);
  assert.match(ddl, /REVOKE ALL ON FUNCTION publication.fn_system_entity_authority\(uuid,text\) FROM PUBLIC/);
  assert.doesNotMatch(ddl, /GRANT EXECUTE ON FUNCTION publication.fn_system_entity_authority/);
});
test("live DEV enrolled validation and submit/review remain scoped and transactional", {
  skip: process.env.SYSTEM_PUBLICATION_POSTGRES_TEST !== "1",
}, () => {
  const policyId = process.env.SYSTEM_PUBLICATION_POLICY_ID;
  assert.match(policyId ?? "", /^[0-9a-f-]{36}$/);
  const fixture = JSON.parse(run(`SELECT json_build_object('tenant',d.tenant_id,'maker',d.created_by,'checker',d.updated_by,'policy',r.action_config->'policy',
    'graph',(SELECT graph FROM snapshot.entity_draft_save WHERE change_set_id=(r.action_config#>>'{policy,changeSetId}')::uuid ORDER BY lock_version DESC LIMIT 1))
    FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id WHERE d.id=${q(policyId)}::uuid;`));
  const p = { ...fixture.policy, changeSetId: '00000000-0000-4000-8000-000000000091' };
  const testPolicyId = '00000000-0000-4000-8000-000000000092';
  const graph = fixture.graph as MetaEntityGraph, report = validateGraph(graph);
  assert.equal(report.contractHash, p.contractHash); assert.deepEqual(report.issues, []);
  const context = (actor: string, tenant = fixture.tenant) => `SELECT set_config('app.current_tenant_id',${q(tenant)},true),set_config('app.current_principal_id',${q(actor)},true);`;
  const validate = (actor = p.authorPrincipalId, revision = 1, source = p.changeSetId, g = graph) =>
    `PERFORM publication.fn_record_system_entity_validation(${q(source)}::uuid,${revision},${q(JSON.stringify(g))}::jsonb,${q(JSON.stringify(report))}::jsonb,${q(actor)}::uuid);`;
  const deny = (statement: string) => `DO $probe$ BEGIN BEGIN ${statement} RAISE EXCEPTION 'unexpected admission'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $probe$;`;
  const transition = (from: string, to: string, rev: number, actor: string) => `SELECT count(*) FROM publication.fn_transition_system_entity_change_set(${q(p.changeSetId)}::uuid,${rev},${q(from)},${q(to)},${q(actor)}::uuid);`;
  // Independent rolled-back fixtures keep the regression repeatable after the
  // real enrollment has progressed to published. No live history is rewound.
  const condition = { and: [
    { '===': [{ var: 'environment' }, 'dev'] }, { '===': [{ var: 'tenantId' }, fixture.tenant] },
    { '===': [{ var: 'policyHash' }, sha256(p)] },
  ] };
  const config = { schema: 'athyper.machine-publication-enrollment/1', environment: 'dev',
    permissionCode: 'studio.metadata.contract.publish_automated', tenantId: fixture.tenant, policy: p };
  const sql = `BEGIN; ${ddl}
    INSERT INTO metadata.entity_change_set(id,tenant_id,entity_id,change_set_code,branch_code,title,lock_version,created_by)
      VALUES(${q(p.changeSetId)}::uuid,NULL,${q(p.entityId)}::uuid,'test.command.rollback','test.command.rollback','Transactional command fixture',1,${q(fixture.maker)}::uuid);
    INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind)
      VALUES(${q(p.changeSetId)}::uuid,1,NULL,${q(JSON.stringify(graph))}::jsonb,${q(report.contractHash)},${q(fixture.maker)}::uuid,'saved');
    INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,version_no,status,definition_hash,created_by)
      VALUES(${q(testPolicyId)}::uuid,${q(fixture.tenant)}::uuid,'metadata.publication','test.command.rollback',1,'draft',repeat('a',64),${q(fixture.maker)}::uuid);
    INSERT INTO control.policy_rule(policy_definition_id,condition_expr,action_code,action_config,created_by)
      VALUES(${q(testPolicyId)}::uuid,${q(JSON.stringify(condition))}::jsonb,'allow',${q(JSON.stringify(config))}::jsonb,${q(fixture.maker)}::uuid);
    UPDATE control.policy_definition SET status='active',updated_by=${q(fixture.checker)}::uuid,updated_at=clock_timestamp() WHERE id=${q(testPolicyId)}::uuid;
    SET LOCAL ROLE athyper_runtime; ${context(p.authorPrincipalId)}
    ${deny(`PERFORM publication.fn_system_entity_authority(${q(p.changeSetId)}::uuid,'validate');`)}
    ${deny(validate(p.publisherPrincipalId))}
    ${deny(validate(p.authorPrincipalId,99))}
    ${deny(validate(p.authorPrincipalId,1,'00000000-0000-4000-8000-000000000099'))}
    ${deny(validate(p.authorPrincipalId,1,p.changeSetId,{ ...graph, entity: { ...graph.entity, entityCode: 'changed' } }))}
    ${context(p.publisherPrincipalId)} ${deny(validate(p.publisherPrincipalId))}
    ${context(p.authorPrincipalId,'00000000-0000-4000-8000-000000000099')} ${deny(validate())}
    ${context('00000000-0000-4000-8000-000000000099')} ${deny(validate('00000000-0000-4000-8000-000000000099'))}
    ${context(p.authorPrincipalId)}
    -- Synthetic higher-version fixture exists only in this rolled-back transaction.
    -- Published revisions are immutable; never disable that guard to test revocation.
    SAVEPOINT superseded; RESET ROLE;
    INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,version_no,status,definition_hash,created_by,updated_at,updated_by)
      SELECT '00000000-0000-4000-8000-000000000098',d.tenant_id,d.entity_type,d.name,d.version_no+1,'active',d.definition_hash,d.created_by,d.updated_at,d.updated_by
      FROM control.policy_definition d WHERE id=${q(testPolicyId)}::uuid;
    SET LOCAL ROLE athyper_runtime; ${deny(validate())} ROLLBACK TO SAVEPOINT superseded;
    DO $probe$ BEGIN IF EXISTS(SELECT id FROM metadata.entity_change_set WHERE id=${q(p.changeSetId)}::uuid FOR UPDATE) THEN RAISE EXCEPTION 'ordinary global lock privilege widened'; END IF; END $probe$;
    DO $probe$ BEGIN ${validate()} ${validate()} END $probe$;
    DO $probe$ BEGIN IF (SELECT count(*) FROM snapshot.entity_contract_revision WHERE change_set_id=${q(p.changeSetId)}::uuid AND validation_status='valid')<>1 THEN RAISE EXCEPTION 'validation idempotency failed'; END IF; END $probe$;
    ${transition('draft','in_review',1,p.authorPrincipalId)}
    ${deny(`PERFORM * FROM publication.fn_transition_system_entity_change_set(${q(p.changeSetId)}::uuid,2,'in_review','approved',${q(p.authorPrincipalId)}::uuid);`)}
    ${context(p.publisherPrincipalId)} ${transition('in_review','approved',2,p.publisherPrincipalId)}
    DO $probe$ BEGIN ${validate(p.publisherPrincipalId,3)} END $probe$;
    ${deny(`PERFORM * FROM publication.fn_create_system_entity_release('00000000-0000-4000-8000-000000000099',${q(p.changeSetId)}::uuid,3,'{}'::jsonb,ARRAY['studio'],${q(p.publisherPrincipalId)}::uuid);`)}
    DO $probe$ BEGIN IF NOT EXISTS(SELECT 1 FROM metadata.entity_change_set WHERE id=${q(p.changeSetId)}::uuid AND status='approved' AND submitted_by=${q(p.authorPrincipalId)}::uuid AND approved_by=${q(p.publisherPrincipalId)}::uuid) THEN RAISE EXCEPTION 'transition evidence missing'; END IF; END $probe$;
    SELECT 'positive_validation_submit_review_and_eleven_denials_passed'; ROLLBACK;`;
  assert.match(run(sql), /positive_validation_submit_review_and_eleven_denials_passed/);
});
