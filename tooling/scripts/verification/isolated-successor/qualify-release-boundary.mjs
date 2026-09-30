import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const key = "metadata.entity.business_partner.local-master-data.cirrusatlantic";
const sql = (q) =>
  cp
    .execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-r19s-db",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    )
    .trim();
const db = JSON.parse(
  cp.execFileSync("docker", ["inspect", "athyper-bp-r19s-db"], {
    encoding: "utf8",
  }),
)[0];
assert.deepEqual(Object.keys(db.NetworkSettings.Networks), [
  "athyper-bp-r19s-isolated",
]);
assert.ok(!Object.values(db.NetworkSettings.Ports ?? {}).some(Boolean));
const head = () =>
  JSON.parse(
    sql(
      `SELECT row_to_json(h) FROM runtime_meta.release_activation_head h WHERE publication_key='${key}'`,
    ),
  );
const before = head();
assert.equal(before.source_release_no, 19);
const target = JSON.parse(
  sql(
    `SELECT row_to_json(a) FROM (SELECT id,status FROM runtime_meta.applied_release WHERE publication_key='${key}' AND source_release_no=18) a`,
  ),
);
assert.equal(target.status, "superseded");
const report = {
  schemaVersion: 1,
  kind: "isolated_native_release_boundary_rollback",
  capturedAt: new Date().toISOString(),
  before,
  authorityBefore: assertAuthorityUnchanged("revoked"),
  checks: [],
  failClosedRecoveryQualified: false,
  compatibleFunctionalRollbackQualified: false,
  grantsRestored: false,
  sharedDevChanged: false,
};
const move = (id) =>
  sql(
    `BEGIN;ALTER TABLE runtime_meta.release_activation_head DISABLE TRIGGER bp_release19_activation_hold;SELECT runtime_meta.fn_rollback_release('${key}','${id}'::uuid,'{"purpose":"isolated_release_boundary_qualification","grants_restored":false}'::jsonb);ALTER TABLE runtime_meta.release_activation_head ENABLE TRIGGER bp_release19_activation_hold;COMMIT;`,
  );
const send = (name, path, method, body, expected) => {
  const r = JSON.parse(
    cp.execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-r19s-auth-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        "catl.admin",
        path,
        method,
      ],
      {
        input: JSON.stringify(body ?? {}),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ),
  );
  report.checks.push({
    name,
    status: r.status,
    code: r.body?.code,
    artifact: r.artifact,
    passed: r.status === expected,
    checkedAt: new Date().toISOString(),
  });
  assert.equal(r.status, expected, name);
};
const exportReport = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-release-19-successor-export-ai.dev.json",
  ),
);
let moved = false;
try {
  send(
    "read_before",
    "/api/records/business_partner/f7688c3d-8c92-5651-a469-da3f4f786375",
    "GET",
    {},
    200,
  );
  move(target.id);
  moved = true;
  report.rollbackHead = head();
  assert.equal(report.rollbackHead.source_release_no, 18);
  assertAuthorityUnchanged("revoked");
  send(
    "incompatible_release_read_closed",
    "/api/records/business_partner/f7688c3d-8c92-5651-a469-da3f4f786375",
    "GET",
    {},
    503,
  );
  send(
    "incompatible_release_export_closed",
    "/api/records/business_partner/exports",
    "POST",
    { filter: { fields: ["id"] } },
    503,
  );
  move(before.applied_release_id);
  moved = false;
  report.recoveredHead = head();
  assert.equal(report.recoveredHead.artifact_hash, before.artifact_hash);
  send(
    "read_after_recovery",
    "/api/records/business_partner/f7688c3d-8c92-5651-a469-da3f4f786375",
    "GET",
    {},
    200,
  );
  send(
    "revoked_export_still_denied",
    "/api/records/business_partner/exports",
    "POST",
    { filter: { fields: ["id"] } },
    403,
  );
  send(
    "revoked_download_still_denied",
    "/api/records/exports/" + exportReport.exportRequestId + "/download",
    "GET",
    {},
    403,
  );
  report.authorityAfter = assertAuthorityUnchanged("revoked");
  assert.equal(report.authorityBefore.sha256, report.authorityAfter.sha256);
  report.failClosedRecoveryQualified = true;
} catch (e) {
  report.blocker = String(e.stderr || e.message)
    .split("\n")[0]
    .slice(0, 200);
  process.exitCode = 1;
} finally {
  if (moved) move(before.applied_release_id);
  report.finalHead = head();
  report.execution = JSON.parse(
    cp.execFileSync(
      "docker",
      ["inspect", "athyper-bp-r19s-api", "athyper-bp-r19s-worker"],
      { encoding: "utf8" },
    ),
  ).map((c) => ({ id: c.Id, image: c.Image }));
  report.limitations = [
    "This tests native metadata rollback with an intentionally incompatible active runtime and fail-closed recovery. It does not qualify a functional compatible release-18 runtime rollback.",
    "No grant snapshot was restored.",
  ];
  fs.writeFileSync(
    "governance/policy/reports/business-partner-successor-release-boundary.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      failClosedRecoveryQualified: report.failClosedRecoveryQualified,
      compatibleFunctionalRollbackQualified: false,
      blocker: report.blocker,
    }),
  );
}
