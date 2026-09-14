import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessInsertionSql } from "./access-sql.mjs";

const path =
  "governance/policy/reviews/business-partner-neon-final-execution-20260912.proposal.dev.json";
const p = JSON.parse(fs.readFileSync(path));
const { proposalRevision, ...body } = p;
assert.equal(
  createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  proposalRevision,
);
assert.equal(p.destination.container, "athyper-bp-enter-db");
assert.equal(p.destination.database, "athyper_neon");
const q = (x) => "'" + String(x).replaceAll("'", "''") + "'";
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
const registrations = p.scopeRegistrations
  .map(
    (s) => `DO $scope$ DECLARE actor uuid;BEGIN
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${q(p.tenantId)} AND code='seed.three-plane-provisioner' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM document.${s.scope_key.startsWith("document.comment:") ? "comment" : "attachment"} WHERE tenant_id=${q(p.tenantId)} AND id=${q(s.target_id)}) THEN RAISE EXCEPTION 'Fixture changed';END IF;
 INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,status,created_by)
 VALUES(${q(s.id)},${q(p.tenantId)},'resource',${q(s.scope_key)},${q(s.target_id)},${q(s.parent_scope_target_id)},${q(s.display_name)},'active',actor);END $scope$;`,
  )
  .join("\n");
let sql = accessInsertionSql(p).replace(
  "END $guard$;",
  "END $guard$;" + registrations,
);
sql += `UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=created_by WHERE source_ref=${q(proposalRevision)};
 UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=created_by WHERE source_ref=${q(proposalRevision)};
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT json_build_object('activeMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${q(proposalRevision)} AND status='active'),'activeAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${q(proposalRevision)} AND status='active'));
 ROLLBACK;`;
const before = fingerprint();
const rows = run(sql)
  .trim()
  .split("\n")
  .filter((x) => x.startsWith("{"))
  .map(JSON.parse);
const after = fingerprint();
assert.equal(before, after);
assert.equal(rows[0].permissionAssignments, p.permissionAssignments);
assert.equal(rows[0].newMemberships, p.batches.length);
assert.equal(rows[0].newAssignments, p.batches.length);
assert.equal(rows[1].activeMemberships, 0);
assert.equal(rows[1].activeAssignments, 0);
const report = {
  createdAt: new Date().toISOString(),
  proposalRevision,
  passed: true,
  rollbackOnly: true,
  grantsApplied: false,
  candidateDeploymentVerified: false,
  rows,
  before: JSON.parse(before),
  after: JSON.parse(after),
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-neon-final-access-rehearsal-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({ passed: true, rows, allRolledBack: true });
