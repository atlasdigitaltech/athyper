import { migrationSourcePath } from "./migration-source.mjs";
import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const path =
  "governance/policy/reports/business-partner-reset-runtime-migrations.installed.dev.json";
assert.ok(!fs.existsSync(path), "Inspect previous migration attempt");
const run = (plane, sql) =>
  cp.execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_" + plane,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const hash = (x) => createHash("sha256").update(x).digest("hex");
const fingerprint = (plane) =>
  hash(
    run(
      plane,
      [
        ...[
          "role",
          "role_permission",
          "group_member",
          "group_role",
          "plane_membership",
          "delegation",
          "delegation_grant",
          "permission",
          "permission_scope_kind",
          "deny_rule",
          "record_acl",
          "override",
          "scope_target",
          "principal_group",
        ].map(
          (t) =>
            `SELECT '${t}',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM authz.${t} r`,
        ),
        "SELECT 'activation',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM runtime_meta.release_activation_head r",
      ].join(" UNION ALL "),
    ),
  );
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  migrations: [],
  complete: false,
};
const save = () =>
  fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
const inputs = ["studio", "neon"].map((plane) => ({
  plane,
  path: migrationSourcePath(`20260911_runtime_restoration_${plane}.sql`),
  before: fingerprint(plane),
}));
try {
  for (const input of inputs) {
    input.bytes = fs.readFileSync(input.path, "utf8");
    input.sha256 = hash(input.bytes);
    assert.ok(input.bytes.endsWith("COMMIT;\n"));
    const out = run(
      input.plane,
      input.bytes.replace(/COMMIT;\s*$/, "ROLLBACK;"),
    );
    assert.ok(out.trim().endsWith("ROLLBACK"));
    assert.equal(fingerprint(input.plane), input.before);
  }
  for (const input of inputs) {
    assert.equal(fingerprint(input.plane), input.before);
    assert.equal(hash(fs.readFileSync(input.path)), input.sha256);
    const out = run(input.plane, input.bytes);
    assert.ok(out.trim().endsWith("COMMIT"));
    const item = {
      plane: input.plane,
      path: input.path,
      sha256: input.sha256,
      applied: true,
      before: input.before,
    };
    report.migrations.push(item);
    save();
    item.after = fingerprint(input.plane);
    assert.equal(item.after, item.before);
    item.authorizationAndHeadsUnchanged = true;
    save();
  }
  report.complete = true;
} catch (e) {
  report.failure = String(e.stderr ?? e.message).slice(0, 1500);
  process.exitCode = 1;
}
report.finishedAt = new Date().toISOString();
save();
console.log(JSON.stringify(report));
