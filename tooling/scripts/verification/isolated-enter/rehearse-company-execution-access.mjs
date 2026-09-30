import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessInsertionSql } from "./access-sql.mjs";
const proposalPath =
  "governance/policy/reviews/business-partner-company-execution-bound-20260912.proposal.dev.json";
const p = JSON.parse(fs.readFileSync(proposalPath));
const { proposalRevision, ...body } = p;
assert.equal(
  createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  proposalRevision,
);
assert.equal(p.destination.container, "athyper-bp-enter-db");
assert.equal(p.destination.database, "athyper_neon");
const run = (sql) =>
  cp.execFileSync(
    "docker",
    [
      "exec",
      "-i",
      p.destination.container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      p.destination.database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const q = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const tables = [
  "role",
  "role_permission",
  "principal_group",
  "group_member",
  "group_role",
  "scope_target",
  "plane_membership",
  "deny_rule",
];
const fingerprint = () =>
  run(
    "SELECT jsonb_object_agg(name,digest) FROM (" +
      tables
        .map(
          (t) =>
            `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM authz.${t} r`,
        )
        .join(" UNION ALL ") +
      ") s;",
  ).trim();
const s = p.scopeRegistration;
const registration = `DO $scope$ DECLARE actor uuid;BEGIN SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${q(p.tenantId)} AND code='seed.three-plane-provisioner' AND status='active';IF NOT EXISTS(SELECT 1 FROM master.company_code WHERE id=${q(s.target_id)} AND tenant_id=${q(p.tenantId)} AND code=${q(s.scope_key)} AND status='active') THEN RAISE EXCEPTION 'Company changed';END IF; INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,status,created_by) VALUES(${q(s.id)},${q(p.tenantId)},${q(s.scope_kind)},${q(s.scope_key)},${q(s.target_id)},${q(s.parent_scope_target_id)},${q(s.display_name)},'active',actor);END $scope$;`;
// Rehearsal deliberately guards the still-active base release. Final application must
// require the candidate's complete image/artifact deployment and explicit approval.
const baseline = {
  ...p,
  releaseId: "c2cc6900-26c1-47ca-8dfc-1d488000950c",
  artifactHash:
    "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc",
};
let sql = accessInsertionSql(baseline).replace(
  "END $guard$;",
  "END $guard$;" + registration,
);
sql += `UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=created_by WHERE source_ref=${q(proposalRevision)};UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=created_by WHERE source_ref=${q(proposalRevision)};SET CONSTRAINTS ALL IMMEDIATE;SELECT json_build_object('activeMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${q(proposalRevision)} AND status='active'),'activeAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${q(proposalRevision)} AND status='active'));ROLLBACK;`;
const before = fingerprint(),
  rows = run(sql)
    .trim()
    .split("\n")
    .filter((x) => x.startsWith("{"))
    .map(JSON.parse),
  after = fingerprint();
assert.equal(before, after);
assert.equal(rows[0].permissionAssignments, 8);
assert.equal(rows[0].newMemberships, 2);
assert.equal(rows[1].activeMemberships, 0);
assert.equal(rows[1].activeAssignments, 0);
const output =
  "governance/policy/reports/business-partner-company-execution-access-rehearsal-20260912.dev.json";
assert.ok(!fs.existsSync(output));
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      proposalRevision,
      createdAt: new Date().toISOString(),
      passed: true,
      rollbackOnly: true,
      grantsApplied: false,
      candidateDeploymentVerified: false,
      guard:
        "Existing active BP baseline; candidate signed projection separately rehearsed",
      rows,
      before: JSON.parse(before),
      after: JSON.parse(after),
    },
    null,
    2,
  ) + "\n",
);
console.log({ passed: true, rows, allRolledBack: true });
