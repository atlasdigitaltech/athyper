import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDevContainer, buildProvisionSql, members } from "./setup-dev-test-admin.mjs";

const subject = "b09bb25c-f046-41b2-8a74-c6387d3b154b";
test("only running DEV compose containers can be targeted", () => {
  const container = project => ({ Config: { Labels: { "com.docker.compose.project": project } }, State: { Running: true } });
  assert.doesNotThrow(() => assertDevContainer(container("athyper-dev")));
  for (const project of ["athyper-qa", "athyper-prod", undefined]) assert.throws(() => assertDevContainer(container(project)));
  assert.throws(() => assertDevContainer({ ...container("athyper-dev"), State: { Running: false } }));
});
test("defaults to rollback with real database constraints enabled", () => {
  for (const plane of ["studio", "neon", "mesh"]) {
    const sql = buildProvisionSql(plane, subject);
    assert.match(sql, /SET CONSTRAINTS ALL IMMEDIATE/);
    assert.match(sql, /ROLLBACK;$/);
    assert.match(sql, new RegExp(`current_database\\(\\) <> 'athyper_${plane}'`));
    assert.doesNotMatch(sql, /DISABLE|session_replication_role|DELETE FROM|UPDATE authz.permission|UPDATE authz.deny_rule|auth_epoch\s*=/i);
  }
});
test("only exact approved identities; no all-user membership", () => {
  assert.deepEqual(members, { athyper: ["athyper.admin", "athyper.owner"], cirrusatlantic: ["catl.admin", "catl.owner"] });
  const sql = buildProvisionSql("studio", subject, true);
  assert.match(sql, /COMMIT;$/);
  assert.match(sql, /effective_until IS NULL/);
  assert.match(sql, /tenant_id=tenant_uuid/);
  assert.match(sql, /p.status='published'/);
  assert.match(sql, /Permission snapshot drift requires explicit review/);
});
test("rejects invalid coordinates before any SQL", () => {
  assert.throws(() => buildProvisionSql("qa", subject));
  assert.throws(() => buildProvisionSql("studio", "bad' subject"));
});
