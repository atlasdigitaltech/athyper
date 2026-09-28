import { test } from "node:test";
import assert from "node:assert/strict";
import { actors, buildStageSql } from "./stage-dev-platform-authority.mjs";
const subjects={"platform.admin":"00000000-0000-4000-8000-000000000001","platform.owner":"00000000-0000-4000-8000-000000000002"};
test("requires two exact, distinct identity subjects and defaults to rollback",()=>{
  assert.throws(()=>buildStageSql({}));
  assert.throws(()=>buildStageSql({...subjects,"platform.owner":subjects["platform.admin"]}));
  assert.throws(()=>buildStageSql({...subjects,unexpected:subjects["platform.admin"]}));
  assert.throws(()=>buildStageSql({...subjects,"platform.admin":"'; COMMIT;"}));
  assert.match(buildStageSql(subjects),/ROLLBACK;$/);
  assert.match(buildStageSql(subjects,true),/COMMIT;$/);
});
test("separates maker/checker and excludes workload, exception and wildcard grants",()=>{
  const admin=actors[0].permissions,owner=actors[1].permissions;
  assert.ok(admin.includes("studio.metadata.publication_policy.create"));
  assert.ok(!admin.includes("studio.metadata.publication_policy.activate"));
  assert.ok(owner.includes("studio.metadata.publication_policy.activate"));
  assert.ok(!owner.includes("studio.metadata.publication_policy.create"));
  for(const actor of actors)for(const permission of actor.permissions)assert.doesNotMatch(permission,/automated|break_glass|\*/);
});
test("stages suspended membership, preserves old identities and confines SQL to Studio authority tenant",()=>{
  const sql=buildStageSql(subjects);
  assert.match(sql,/current_database\(\)<>'athyper_studio'/);
  assert.match(sql,/code='athyper'/);
  assert.match(sql,/scope_kind='tenant' AND target_id=tenant_uuid/);
  assert.match(sql,/'suspended',actor_uuid/);
  assert.match(sql,/Role permission drift/);
  assert.match(sql,/Existing authority requires explicit review/);
  assert.match(sql,/SET CONSTRAINTS ALL IMMEDIATE/);
  assert.match(sql,/INSERT INTO event.command_execution/);
  assert.doesNotMatch(sql,/INSERT INTO master.principal\(|UPDATE master.principal|DELETE|DISABLE|session_replication_role|runtime_meta\.|INSERT INTO control.policy_definition/);
});
