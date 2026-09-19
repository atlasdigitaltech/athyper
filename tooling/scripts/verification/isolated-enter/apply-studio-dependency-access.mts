import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import {
  canonicalBytes,
  sha256,
} from "../../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import { accessInsertionSql } from "./access-sql.mjs";
const root = "governance/policy/";
const proposalPath =
  root + "reviews/bp-dependencies-20260912/studio-access.proposal.json";
const approvalPath =
  root + "reviews/bp-dependencies-20260912/studio-access.user-approval.json";
const output =
  root +
  "reports/business-partner-dependency-authoring-access-20260912.application.dev.json";
const p = JSON.parse(fs.readFileSync(proposalPath, "utf8"));
const { proposalRevision, ...body } = p;
assert.equal(
  proposalRevision,
  "25c9f5a766f08a2d04e56c3cebc71c185e9667be9ef59dd459405e0f103627cb",
);
assert.equal(sha256(canonicalBytes(body)), proposalRevision);
const approval = JSON.parse(fs.readFileSync(approvalPath, "utf8"));
assert.equal(approval.decision, "approved");
assert.equal(approval.proposalRevision, proposalRevision);
assert.ok(!fs.existsSync(output), "Application receipt already exists");
assert.ok(
  Date.now() >= Date.parse(p.effectiveFrom) &&
    Date.now() < Date.parse(p.effectiveUntil),
  "Window closed",
);
assert.deepEqual(p.destination, {
  container: "athyper-bp-enter-db",
  database: "athyper_studio",
  network: "athyper-bp-enter-isolated",
});
const run = (args: string[], input?: string) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const container = JSON.parse(run(["inspect", p.destination.container]))[0];
assert.equal(container.State.Running, true);
assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [
  p.destination.network,
]);
assert.ok(!Object.values(container.NetworkSettings.Ports ?? {}).some(Boolean));
const q = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const psql = (container: string, plane: string, sql: string) =>
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
const fingerprint = (container: string, plane: string) =>
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
const shared = () =>
  Object.fromEntries(
    ["studio", "neon", "mesh"].map((plane) => [
      plane,
      fingerprint("athyper-dev-db-1", plane),
    ]),
  );
const sharedBefore = shared(),
  before = fingerprint(p.destination.container, "studio"),
  neonBefore = fingerprint(p.destination.container, "neon");
// This Studio grant transaction has no NEON activation dependency. Keep all
// principal/catalog/scope guards from the reviewed insertion recipe.
const insertion = accessInsertionSql(p);
const batches = insertion.slice(insertion.indexOf("\n") + 1);
const sql = `BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtext('bp-dependency-studio-access-20260912'));
DO $guard$ BEGIN IF current_database()<>'athyper_studio' OR clock_timestamp()<${q(p.effectiveFrom)}::timestamptz OR clock_timestamp()>=${q(p.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Destination/window mismatch';END IF;END $guard$;
${batches}
DO $counts$ BEGIN IF (SELECT count(*) FROM authz.role_permission WHERE role_id IN (${p.batches.map((b: any) => q(b.roleId) + "::uuid").join(",")}))<>10 THEN RAISE EXCEPTION 'Permission count mismatch';END IF;END $counts$;COMMIT;`;
const rows = psql(p.destination.container, "studio", sql)
  .trim()
  .split("\n")
  .filter((x) => x.startsWith("{"))
  .map((x) => JSON.parse(x));
const after = fingerprint(p.destination.container, "studio"),
  sharedAfter = shared(),
  neonAfter = fingerprint(p.destination.container, "neon");
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
  proposalRevision,
  approvalPath,
  destination: p.destination,
  effectiveFrom: p.effectiveFrom,
  effectiveUntil: p.effectiveUntil,
  rows,
  before,
  after,
  sharedBefore,
  sharedAfter,
  neonBefore,
  neonAfter,
  protectedUnchanged,
  sharedUnchanged:
    sha256(canonicalBytes(sharedBefore)) ===
    sha256(canonicalBytes(sharedAfter)),
  neonUnchanged:
    sha256(canonicalBytes(neonBefore)) === sha256(canonicalBytes(neonAfter)),
  grantsApplied: true,
  publicationApproved: false,
  enforcementActivated: false,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
assert.equal(report.protectedUnchanged, true);
assert.equal(report.sharedUnchanged, true);
assert.equal(report.neonUnchanged, true);
assert.equal(rows[0].permissionAssignments, 10);
console.log({
  applied: true,
  permissionAssignments: 10,
  sharedUnchanged: true,
  neonUnchanged: true,
  protectedUnchanged: true,
  expires: p.effectiveUntil,
});
