import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./isolated-release20/authority-check.mjs";
const docker = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 3000000,
  });
const names = ["athyper-dev-api-1", "athyper-dev-worker-1"];
const containers = JSON.parse(docker(["inspect", ...names]));
const files = containers.map(
  (c) => c.Config.Labels["com.docker.compose.project.config_files"],
);
assert.equal(new Set(files).size, 1);
assert.ok(!files[0].includes(","));
const basePath = files[0],
  baseBytes = fs.readFileSync(basePath),
  base = JSON.parse(baseBytes);
assert.equal(base.name, "athyper-dev");
const stale = [];
for (const c of containers) {
  const mount = c.Mounts.find(
    (m) => m.Destination === "/bp-authorization/deployment.json",
  );
  assert.ok(mount);
  const bytes = fs.readFileSync(mount.Source),
    config = JSON.parse(bytes);
  assert.equal(
    config.rollout.mode,
    "shadow",
    "Never disable enforced authorization as reset recovery",
  );
  stale.push({
    container: c.Name,
    image: c.Image,
    deploymentSha256: createHash("sha256").update(bytes).digest("hex"),
    artifactHash: config.artifactHash,
    mode: config.rollout.mode,
  });
}
const heads = docker([
  "exec",
  "athyper-dev-db-1",
  "psql",
  "-X",
  "-U",
  "postgres",
  "-d",
  "athyper_neon",
  "-Atc",
  "select count(*) from runtime_meta.release_activation_head where publication_key like '%business_partner%'",
]).trim();
assert.equal(
  heads,
  "0",
  "Active BP publication requires a different recovery plan",
);
const before = assertAuthorityUnchanged();
for (const [i, name] of ["api", "worker"].entries()) {
  const service = base.services[name];
  assert.ok(service && !Array.isArray(service.environment));
  for (const key of Object.keys(service.environment))
    if (key.startsWith("BP_AUTHORIZATION_")) delete service.environment[key];
  service.environment.BP_AUTHORIZATION_MODE = "off";
  service.image = containers[i].Image;
  service.pull_policy = "never";
}
const target = basePath.replace(
  /[^/]+$/,
  "bp-reset-shadow-retirement.private.json",
);
assert.notEqual(target, basePath);
assert.ok(
  !fs.existsSync(target),
  "Use a fresh successor instead of overwriting saved configuration",
);
fs.writeFileSync(target, JSON.stringify(base, null, 2) + "\n", { mode: 0o600 });
fs.chmodSync(target, 0o600);
assert.equal(
  createHash("sha256").update(fs.readFileSync(basePath)).digest("hex"),
  createHash("sha256").update(baseBytes).digest("hex"),
);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  kind: "bp_reset_obsolete_shadow_retirement",
  stale,
  baseConfigurationSha256: createHash("sha256").update(baseBytes).digest("hex"),
  newConfigurationSha256: createHash("sha256")
    .update(fs.readFileSync(target))
    .digest("hex"),
  configurationPath: target,
  normalAuthorizationDisabled: false,
  shadowOnlyRetired: true,
  grantsRestored: false,
  activationRequested: false,
  qualified: false,
};
try {
  docker([
    "compose",
    "-p",
    "athyper-dev",
    "-f",
    target,
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    "api",
    "worker",
  ]);
  let current;
  for (let i = 0; i < 90; i++) {
    current = JSON.parse(docker(["inspect", ...names]));
    if (current.every((c) => c.State.Health?.Status === "healthy")) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  report.containers = current.map((c) => ({
    name: c.Name,
    id: c.Id,
    image: c.Image,
    health: c.State.Health?.Status,
    state: c.State.Status,
  }));
  assert.ok(
    current.every((c) => c.State.Health?.Status === "healthy"),
    "Runtime still unhealthy",
  );
  const after = assertAuthorityUnchanged();
  assert.equal(
    after.sha256,
    before.sha256,
    "Authority drift during reset recovery",
  );
  report.authoritySha256 = after.sha256;
  report.authorityUnchanged = true;
  report.qualified = true;
} catch (e) {
  report.failure = e.message.slice(0, 300);
  process.exitCode = 1;
}
fs.writeFileSync(
  "governance/policy/reports/business-partner-reset-runtime-recovery.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
