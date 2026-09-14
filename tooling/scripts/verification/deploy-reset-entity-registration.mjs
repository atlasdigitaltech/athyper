import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 4000000,
  });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const reportPath =
  "governance/policy/reports/business-partner-reset-registration-deployment.dev.json";
assert.ok(
  !fs.existsSync(reportPath),
  "Inspect existing deployment, do not replay",
);
const names = ["athyper-dev-api-1", "athyper-dev-worker-1"];
const before = JSON.parse(run(["inspect", ...names]));
assert.equal(before[0].Image, before[1].Image);
assert.equal(
  before[0].Config.Labels["com.docker.compose.project.config_files"],
  before[1].Config.Labels["com.docker.compose.project.config_files"],
);
const baseConfig =
  before[0].Config.Labels["com.docker.compose.project.config_files"];
assert.ok(!baseConfig.includes(","));
const config = JSON.parse(fs.readFileSync(baseConfig));
assert.equal(config.name, "athyper-dev");
for (const name of ["api", "worker"])
  assert.equal(config.services[name].environment.BP_AUTHORIZATION_MODE, "off");
const fingerprint = () => {
  const state = {};
  for (const database of ["athyper_neon", "athyper_studio"]) {
    const tables = [
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
    ];
    state[database] = run([
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      [
        ...tables.map(
          (t) =>
            `SELECT '${t}',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM authz.${t} r`,
        ),
        "SELECT 'activation',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM runtime_meta.release_activation_head r",
      ].join(" UNION ALL "),
    ]);
  }
  return hash(JSON.stringify(state));
};
const authorityBefore = fingerprint();
const root = path.join(
  os.homedir(),
  ".athyper/instances/dev/deployments/bp-reset-registration-" + Date.now(),
);
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const destination =
  "/app/server/node_modules/.pnpm/@athyper+server-plane-studio-meta-entity-authoring@file+server+packages+planes+studio+meta-entity-authoring/node_modules/@athyper/server-plane-studio-meta-entity-authoring/dist";
const files = [
  "entity-registration.js",
  "routes.js",
  "kysely-authoring-repository.js",
].map((name) => {
  const bytes = fs.readFileSync(
    "server/packages/planes/studio/meta-entity-authoring/dist/" + name,
  );
  fs.writeFileSync(path.join(root, name), bytes);
  return { name, sha256: hash(bytes) };
});
const baseTag =
    "athyper/runtime:reset-registration-base-" + before[0].Image.slice(7, 19),
  tag = "athyper/runtime:reset-registration-" + Date.now();
run(["tag", before[0].Image, baseTag]);
fs.writeFileSync(
  path.join(root, "Dockerfile"),
  `FROM ${baseTag}\n` +
    files.map((f) => `COPY ${f.name} ${destination}/${f.name}`).join("\n") +
    "\n",
);
run(["build", "--pull=false", "--network=none", "-t", tag, root]);
run([
  "run",
  "--rm",
  "--network",
  "none",
  "--entrypoint",
  "node",
  tag,
  "--input-type=module",
  "-e",
  `await import('${destination}/routes.js');await import('${destination}/kysely-authoring-repository.js');`,
]);
const image = run(["image", "inspect", "--format", "{{.Id}}", tag]).trim();
for (const name of ["api", "worker"]) {
  config.services[name].image = image;
  config.services[name].pull_policy = "never";
}
const nextConfig = path.join(root, "compose.private.json");
fs.writeFileSync(nextConfig, JSON.stringify(config, null, 2) + "\n", {
  mode: 0o600,
});
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  baseImage: before[0].Image,
  image,
  files,
  moduleLoadPassed: true,
  baseConfig,
  nextConfig,
  authorityBefore,
  deployed: false,
  grantsChanged: false,
  activationChanged: false,
};
const save = () =>
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
save();
try {
  assert.equal(
    fingerprint(),
    authorityBefore,
    "Authority changed during image preparation",
  );
  run([
    "compose",
    "-p",
    "athyper-dev",
    "-f",
    nextConfig,
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    "api",
    "worker",
  ]);
  let current;
  for (let i = 0; i < 50; i++) {
    current = JSON.parse(run(["inspect", ...names]));
    if (current.every((c) => c.State.Health?.Status === "healthy")) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(
    current.every((c) => c.State.Health?.Status === "healthy"),
    "Health check failed",
  );
  report.authorityAfter = fingerprint();
  assert.equal(
    report.authorityAfter,
    authorityBefore,
    "Authority or activation drift",
  );
  report.deployed = true;
  report.healthy = true;
} catch (e) {
  report.failure = String(e.stderr ?? e.message).slice(0, 1200);
  process.exitCode = 1;
  try {
    run([
      "compose",
      "-p",
      "athyper-dev",
      "-f",
      baseConfig,
      "up",
      "-d",
      "--no-deps",
      "--force-recreate",
      "api",
      "worker",
    ]);
    report.configurationRestored = true;
  } catch {
    report.configurationRestored = false;
  }
}
report.finishedAt = new Date().toISOString();
save();
console.log(JSON.stringify(report));
