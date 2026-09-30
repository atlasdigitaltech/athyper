import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessInsertionSql } from "./access-sql.mjs";

const prefix = "governance/policy/";
const approvalsPath =
  prefix + "reviews/business-partner-enter-access-20260912.user-approval.json";
const output = process.argv[2];
assert.ok(
  output && process.argv.length === 3 && !fs.existsSync(output),
  "Provide a new application evidence path",
);
const approved = JSON.parse(fs.readFileSync(approvalsPath));
const revisions = [
  "2b7f0041ec7fd67b8bdc59d7c06ea950bf4c50cef6f315a61337584e9945621c",
  "e3fcb693492924eedee0d0b53053a2934aa9310df3a6bba6fbbc8cb6d29de16a",
];
assert.equal(approved.decision, "approved");
assert.deepEqual(approved.proposalRevisions, revisions);
const proposals = ["test", "atlas"].map((kind) =>
  JSON.parse(
    fs.readFileSync(
      prefix +
        `reviews/business-partner-enter-${kind}-access-20260912.proposal.dev.json`,
    ),
  ),
);
const run = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
for (const [i, p] of proposals.entries()) {
  const { proposalRevision, ...body } = p;
  assert.equal(
    createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    revisions[i],
  );
  assert.equal(proposalRevision, revisions[i]);
  assert.ok(
    Date.now() >= Date.parse(p.effectiveFrom) &&
      Date.now() < Date.parse(p.effectiveUntil),
    "Approved window is not open",
  );
  assert.equal(p.destination.container, "athyper-bp-enter-db");
  assert.equal(p.destination.database, "athyper_neon");
  assert.equal(p.destination.network, "athyper-bp-enter-isolated");
  for (const name of ["db", "api", "worker"]) {
    const c = JSON.parse(run(["inspect", "athyper-bp-enter-" + name]))[0];
    assert.equal(c.State.Running, true);
    assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [
      p.destination.network,
    ]);
    assert.ok(!Object.values(c.NetworkSettings.Ports ?? {}).some(Boolean));
    if (name !== "db") assert.equal(c.Image, p.image);
  }
}
const psql = (container, plane, sql) =>
  run(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_" + plane,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    sql,
  );
const tables = [
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
  .map((t) => "authz." + t)
  .concat("runtime_meta.release_activation_head");
const fingerprint = (container, plane) =>
  JSON.parse(
    psql(
      container,
      plane,
      "BEGIN READ ONLY;SELECT jsonb_object_agg(name,digest) FROM (" +
        tables
          .map(
            (t) =>
              `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${t} r`,
          )
          .join(" UNION ALL ") +
        ") s;ROLLBACK;",
    ),
  );
const sharedBefore = Object.fromEntries(
  ["studio", "neon", "mesh"].map((plane) => [
    plane,
    fingerprint("athyper-dev-db-1", plane),
  ]),
);
const before = fingerprint("athyper-bp-enter-db", "neon");
const quote = (x) => "'" + String(x).replaceAll("'", "''") + "'";
let sql =
  "BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';SELECT pg_advisory_xact_lock(hashtext('bp-enter-approved-access-20260912'));\n";
for (const p of proposals) {
  sql += `DO $window$ BEGIN IF clock_timestamp()<${quote(p.effectiveFrom)}::timestamptz OR clock_timestamp()>=${quote(p.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Approved window closed';END IF;END $window$;\n`;
  sql += accessInsertionSql(p).replace(/^BEGIN;/, "");
  sql += `DO $counts$ BEGIN IF (SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(p.proposalRevision)} AND status='active')<>${p.batches.length} THEN RAISE EXCEPTION 'Grant count mismatch';END IF;END $counts$;\n`;
}
sql += "COMMIT;";
const rows = psql("athyper-bp-enter-db", "neon", sql)
  .trim()
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map(JSON.parse);
const after = fingerprint("athyper-bp-enter-db", "neon");
const sharedAfter = Object.fromEntries(
  ["studio", "neon", "mesh"].map((plane) => [
    plane,
    fingerprint("athyper-dev-db-1", plane),
  ]),
);
const sharedUnchanged =
  JSON.stringify(sharedBefore) === JSON.stringify(sharedAfter);
const protectedUnchanged = tables
  .filter(
    (t) =>
      ![
        "authz.role",
        "authz.role_permission",
        "authz.principal_group",
        "authz.group_member",
        "authz.group_role",
      ].includes(t),
  )
  .every((t) => before[t] === after[t]);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  approval: approvalsPath,
  approvalHash: createHash("sha256")
    .update(fs.readFileSync(approvalsPath))
    .digest("hex"),
  proposalRevisions: revisions,
  grantsApplied: true,
  destination: proposals[0].destination,
  releaseId: proposals[0].releaseId,
  artifactHash: proposals[0].artifactHash,
  image: proposals[0].image,
  effectiveFrom: proposals[0].effectiveFrom,
  effectiveUntil: proposals[0].effectiveUntil,
  rows,
  before,
  after,
  sharedBefore,
  sharedAfter,
  sharedUnchanged,
  protectedUnchanged,
  authenticatedBusinessQualification: false,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
assert.equal(sharedUnchanged, true);
assert.equal(protectedUnchanged, true);
assert.deepEqual(
  rows.map((r) => r.permissionAssignments),
  [44, 1],
);
console.log({
  applied: true,
  permissionAssignments: 45,
  newAssignments: 6,
  sharedUnchanged,
  protectedUnchanged,
  authenticatedBusinessQualification: false,
});
