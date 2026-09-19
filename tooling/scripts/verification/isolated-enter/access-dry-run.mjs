import { accessInsertionSql } from "./access-sql.mjs";
import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const [proposalPath, output] = process.argv.slice(2);
if (
  !proposalPath ||
  !output ||
  process.argv.length !== 4 ||
  fs.existsSync(output)
)
  throw Error("Provide proposal and new evidence output paths");
const p = JSON.parse(fs.readFileSync(proposalPath));
if (
  !Number.isFinite(Date.parse(p.effectiveFrom)) ||
  !Number.isFinite(Date.parse(p.effectiveUntil)) ||
  Date.parse(p.effectiveUntil) <= Date.now() ||
  Date.parse(p.effectiveUntil) <= Date.parse(p.effectiveFrom)
)
  throw Error("Proposal window invalid or expired");
const { proposalRevision, ...body } = p;
assert.equal(
  createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  proposalRevision,
);
const run = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const c = JSON.parse(run(["inspect", p.destination.container]))[0];
assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [
  p.destination.network,
]);
assert.ok(!Object.values(c.NetworkSettings.Ports ?? {}).some(Boolean));
const q = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const psql = (sql) =>
  run(
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
    sql,
  );
const fingerprint = () =>
  psql(
    `SELECT jsonb_object_agg(name,digest) FROM (${[
      "role",
      "role_permission",
      "principal_group",
      "group_member",
      "group_role",
      "permission",
      "permission_scope_kind",
      "deny_rule",
      "override",
      "record_acl",
      "plane_membership",
      "delegation",
      "delegation_grant",
      "scope_target",
    ]
      .map(
        (t) =>
          `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM authz.${t} r`,
      )
      .concat(
        "SELECT 'activation' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM runtime_meta.release_activation_head r",
      )
      .join(" UNION ALL ")}) s;`,
  ).trim();
let sql = accessInsertionSql(p);
sql += `UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=created_by,updated_at=now(),updated_by=created_by WHERE source_ref=${q(proposalRevision)} AND group_id IN (${p.batches.map((b) => q(b.groupId)).join(",")}); UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=created_by,updated_at=now(),updated_by=created_by WHERE source_ref=${q(proposalRevision)} AND id IN (${p.batches.map((b) => q(b.assignmentId)).join(",")});SET CONSTRAINTS ALL IMMEDIATE;
SELECT json_build_object('remainingActiveAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${q(proposalRevision)} AND status='active'),'remainingActiveMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${q(proposalRevision)} AND status='active'));ROLLBACK;`;
const before = fingerprint(),
  rows = psql(sql)
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map(JSON.parse),
  after = fingerprint();
assert.equal(after, before);
assert.equal(
  rows[0].permissionAssignments,
  p.batches.reduce((n, b) => n + b.permissions.length, 0),
);
assert.equal(rows[0].newAssignments, p.batches.length);
assert.equal(rows[0].newMemberships, p.batches.length);
assert.equal(rows[1].remainingActiveAssignments, 0);
assert.equal(rows[1].remainingActiveMemberships, 0);
const report = {
  schemaVersion: 1,
  proposalRevision,
  capturedAt: new Date().toISOString(),
  databaseRollback: true,
  insertion: rows[0],
  revocationRehearsal: rows[1],
  before: JSON.parse(before),
  after: JSON.parse(after),
  unchanged: true,
  grantsApplied: false,
  passed: true,
  doesNotProveAuthenticatedBusinessAccess: true,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log({
  passed: true,
  ...rows[0],
  revocationRehearsed: true,
  allRolledBack: true,
});
