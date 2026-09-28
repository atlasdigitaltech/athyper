import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAuthoritySql } from "./provision-dev-publication-authority.mjs";

test("defaults to rollback and rejects unspecified or unexpected tenants", () => {
  assert.throws(() => buildAuthoritySql(undefined));
  assert.throws(() => buildAuthoritySql("production"));
  assert.throws(() => buildAuthoritySql("cirrusatlantic'; COMMIT;"));
  assert.match(buildAuthoritySql("cirrusatlantic"), /ROLLBACK;$/);
  assert.match(buildAuthoritySql("cirrusatlantic", true), /COMMIT;$/);
});
test("keeps real constraints, exact tenant scopes and no MFA or review bypass", () => {
  const sql = buildAuthoritySql("cirrusatlantic");
  assert.match(sql, /SET CONSTRAINTS ALL IMMEDIATE/);
  assert.match(sql, /scope_kind='tenant' AND target_id=t.id/);
  assert.match(sql, /'studio.metadata.publication_policy.activate',true,true/);
  assert.match(sql, /'studio.metadata.publication_policy.create',true,false/);
  assert.match(sql, /'studio.metadata.contract.publish_automated',false,true/);
  assert.doesNotMatch(sql, /DISABLE|session_replication_role|UPDATE authz.permission|INSERT INTO control.policy_definition|runtime_meta\./);
});
test("only named workloads receive service memberships and drift fails closed", () => {
  const sql = buildAuthoritySql("athyper");
  assert.match(sql, /code='dev.metadata.'\|\|r.kind/);
  assert.match(sql, /principal_type='service_account'/);
  assert.match(sql, /Workload role permission drift/);
  assert.match(sql, /Workload group membership drift/);
  assert.match(sql, /Workload group assignment drift/);
  assert.match(sql, /INSERT INTO event.command_execution/);
});
test("live provisioning uses the same UUIDs and security flags as generated Studio catalog", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../../seed/contracts/authorization/catalog/studio/catalog.v2.json", import.meta.url), "utf8"));
  const scopes = JSON.parse(readFileSync(new URL("../../../seed/contracts/authorization/catalog/studio/scope-compatibility.v1.json", import.meta.url), "utf8"));
  const sql = buildAuthoritySql("cirrusatlantic");
  for (const code of ["studio.metadata.publication_policy.create", "studio.metadata.publication_policy.activate", "studio.metadata.contract.publish_automated"]) {
    const permission = catalog.permissions.find(p => p.canonicalCode === code);
    assert.ok(permission);
    assert.ok(sql.includes(`('${permission.permissionId}'::uuid,'${code}',${permission.requiresMfa},${permission.requiresSod},'${permission.definitionSha256}')`));
    assert.deepEqual(scopes.permissions.find(p => p.permissionCode === code).scopes, [{ kind: "tenant", propagation: "exact" }]);
  }
});
test("workload-only mode does not update human grant groups", () => {
  const sql = buildAuthoritySql("athyper", false, true);
  assert.match(sql, /AND false \/\* workload-only mode never modifies human roles \*\//);
  assert.match(sql, /"humanGrantGroups":0/);
  assert.match(sql, /ROLLBACK;/);
});
