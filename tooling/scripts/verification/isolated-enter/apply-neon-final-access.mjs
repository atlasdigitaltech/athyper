import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessInsertionSql } from "./access-sql.mjs";
const proposalPath =
  "governance/policy/reviews/business-partner-neon-final-execution-20260912.proposal.dev.json";
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
const registrations = p.scopeRegistrations
  .map(
    (s) => `DO $scope$ DECLARE actor uuid;BEGIN
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${q(p.tenantId)} AND code='seed.three-plane-provisioner' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM document.${s.scope_key.startsWith("document.comment:") ? "comment" : "attachment"} WHERE tenant_id=${q(p.tenantId)} AND id=${q(s.target_id)}) THEN RAISE EXCEPTION 'Fixture changed';END IF;
 INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,status,created_by)
 VALUES(${q(s.id)},${q(p.tenantId)},'resource',${q(s.scope_key)},${q(s.target_id)},${q(s.parent_scope_target_id)},${q(s.display_name)},'active',actor);END $scope$;`,
  )
  .join("\n");
const approvalPath =
  "governance/policy/reviews/business-partner-neon-final-execution-20260912.user-approval.dev.json";
const approval = JSON.parse(fs.readFileSync(approvalPath));
assert.equal(approval.decision, "approved");
assert.equal(approval.proposalRevision, proposalRevision);
assert.equal(
  proposalRevision,
  "3c623d23098b2a862b3a32f38e256405ad3d70d2f57f93b5e2ec40845af51e3c",
);
assert.ok(
  Date.now() >= Date.parse(p.effectiveFrom) &&
    Date.now() < Date.parse(p.effectiveUntil),
);
const hash = (x) => createHash("sha256").update(x).digest("hex");
assert.equal(
  hash(fs.readFileSync(p.candidateManifest)),
  p.candidateManifestSha256,
);
const manifest = JSON.parse(fs.readFileSync(p.candidateManifest));
assert.equal(hash(fs.readFileSync(p.fixtures.path)), p.fixtures.sha256);
for (const m of manifest.additionalMigrations)
  assert.equal(hash(fs.readFileSync(m.path)), m.sha256);
const docker = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
for (const mode of ["api", "worker"]) {
  const c = JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0];
  assert.equal(c.State.Running, true);
  assert.equal(c.Image, p.runtimeImage);
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [
    p.destination.network,
  ]);
  const mount = c.Mounts.find(
    (m) => m.Destination === "/app/server/qualification",
  );
  assert.ok(mount.Source.endsWith("/neon-final-harness"));
  for (const f of manifest.harness)
    assert.equal(hash(fs.readFileSync(mount.Source + "/" + f.name)), f.sha256);
  const deployment = c.Mounts.find(
    (m) => m.Destination === "/release/deployment.json",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(deployment.Source)).runtimeImage,
    p.runtimeImage,
  );
}
const sessions = [];
for (const b of p.batches.filter(
  (b, i, a) => a.findIndex((x) => x.account === b.account) === i,
)) {
  const output = docker([
    "exec",
    "athyper-bp-enter-ui-session-client",
    "node",
    "/app/server/qualification-client/session-client.mjs",
    b.account,
    "/api/iam/me",
    "GET",
  ]);
  const r = JSON.parse(output);
  assert.equal(r.status, 200);
  assert.equal(r.principalId, b.principalId);
  assert.equal(r.releaseSet, p.releaseSetHash);
  sessions.push({
    account: b.account,
    status: r.status,
    assurance: r.assurance,
    releaseSet: r.releaseSet,
  });
}
const sharedFingerprint = () =>
  JSON.parse(
    docker([
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-c",
      "SELECT jsonb_object_agg(name,digest) FROM (" +
        tables
          .map(
            (t) =>
              `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM authz.${t} r`,
          )
          .join(" UNION ALL ") +
        ") s;",
    ]),
  );
let sql = accessInsertionSql(p).replace(
  "END $guard$;",
  "END $guard$;" + registrations,
);
sql += `DO $window$ BEGIN IF clock_timestamp()<${q(p.effectiveFrom)}::timestamptz OR clock_timestamp()>=${q(p.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Approved window closed';END IF;END $window$;`;
for (const a of manifest.artifacts)
  sql += `DO $pin$ BEGIN IF NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release r ON r.id=h.applied_release_id WHERE h.artifact_hash=${q(a.artifactHash)} AND r.source_release_id=${q(a.releaseId)}) THEN RAISE EXCEPTION 'Release set changed';END IF;END $pin$;`;
sql += "COMMIT;";
const before = fingerprint(),
  sharedBefore = sharedFingerprint(),
  rows = run(sql)
    .trim()
    .split("\n")
    .filter((x) => x.startsWith("{"))
    .map(JSON.parse),
  after = fingerprint(),
  sharedAfter = sharedFingerprint();
const report = {
  proposalRevision,
  approvalPath,
  createdAt: new Date().toISOString(),
  grantsApplied: true,
  runtimeImage: p.runtimeImage,
  releaseSetHash: p.releaseSetHash,
  effectiveUntil: p.effectiveUntil,
  rows,
  sessions,
  before: JSON.parse(before),
  after: JSON.parse(after),
  sharedBefore,
  sharedAfter,
  sharedUnchanged: JSON.stringify(sharedBefore) === JSON.stringify(sharedAfter),
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-neon-final-access-application-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
assert.equal(rows[0].permissionAssignments, 47);
assert.equal(report.sharedUnchanged, true);
console.log({ applied: true, rows, sharedUnchanged: true });
