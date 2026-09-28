import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshSql } from "./refresh-dev-test-admin.mjs";

test("refresh is additive, scoped to existing managed roles and rolls back by default", () => {
  for(const plane of ["studio","neon","mesh"]) {
    const sql=refreshSql(plane);
    assert.match(sql,/ROLLBACK;$/);
    assert.match(sql,/SET CONSTRAINTS ALL IMMEDIATE/);
    assert.match(sql,/permission.status='published'/);
    assert.match(sql,/s.status='active'/);
    assert.match(sql,/fn_internal_permission_is_assignable_at_scope/);
    assert.match(sql,/role.source_ref='dev:test-full-admin:v1'/);
    assert.match(sql,/t.code IN \('athyper','cirrusatlantic'\)/);
    assert.doesNotMatch(sql,/DELETE FROM|DISABLE TRIGGER|session_replication_role|INSERT INTO authz.group_role|INSERT INTO master.principal|UPDATE authz.permission/i);
    assert.match(sql,/status='suspended'/);
    assert.match(sql,/status='active',updated_by/);
  }
});
test("explicit commit and closed plane vocabulary",()=>{
  assert.match(refreshSql("studio",true),/COMMIT;$/);
  for(const plane of ["qa","production","studio';--",""])assert.throws(()=>refreshSql(plane));
});
