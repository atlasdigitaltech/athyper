import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root =
  process.env.HOME +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-company-image-correction-v2-20260912.proposal.dev.json",
    ),
  ),
  revocation = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-company-context-revocation-20260912.dev.json",
    ),
  );
assert.equal(revocation.revoked, true);
const docker = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const fp = () =>
  JSON.parse(
    docker([
      "exec",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-c",
      "SELECT jsonb_object_agg(name,digest) FROM (" +
        [
          "authz.group_member",
          "authz.group_role",
          "authz.role_permission",
          "authz.deny_rule",
          "authz.plane_membership",
          "runtime_meta.release_activation_head",
          "runtime_meta.applied_release",
        ]
          .map(
            (t) =>
              `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${t} r`,
          )
          .join(" UNION ALL ") +
        ") s;",
    ]),
  );
const before = fp();
const original = Object.fromEntries(
  ["api", "worker"].map((mode) => [
    mode,
    JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0],
  ]),
);
for (const c of Object.values(original)) assert.equal(c.Image, p.runtimeImage);
const artifact = original.api.Mounts.find(
  (m) => m.Destination === "/release/artifact.json",
);
assert.ok(artifact);
const bad = root + "/recovery-incompatible-artifact.json";
fs.writeFileSync(bad, fs.readFileSync(artifact.Source, "utf8") + "\n", {
  mode: 0o600,
});
const mounts = (c, badArtifact = false) =>
  c.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (badArtifact && m.Destination === "/release/artifact.json"
        ? bad
        : m.Source) +
      ",dst=" +
      m.Destination +
      (m.RW ? "" : ",readonly"),
  ]);
const failedName = "athyper-bp-company-incompatible-recovery-probe";
docker([
  "run",
  "-d",
  "--name",
  failedName,
  "--network",
  "athyper-bp-enter-isolated",
  "--env-file",
  root + "/runtime.env",
  "-e",
  "MODE=api",
  ...mounts(original.api, true),
  "--entrypoint",
  "node",
  "--no-healthcheck",
  p.previousRuntimeImage,
  "/app/server/qualification/host.mjs",
]);
let state;
for (let i = 0; i < 30; i++) {
  state = JSON.parse(docker(["inspect", failedName]))[0].State;
  if (!state.Running) break;
  await new Promise((r) => setTimeout(r, 300));
}
assert.equal(state.Running, false);
const logResult = cp.spawnSync("docker", ["logs", failedName], {
  encoding: "utf8",
});
const logs = logResult.stdout + logResult.stderr;
assert.ok(logs.includes("PINNED_ARTIFACT_MISMATCH"));
docker(["rm", failedName]);
fs.unlinkSync(bad);
const restored = [];
for (const mode of ["worker", "api"]) {
  const name = "athyper-bp-enter-" + mode,
    prior = name + "-before-compatible-recovery";
  docker(["stop", name]);
  docker(["rename", name, prior]);
  docker(["network", "disconnect", "athyper-bp-enter-isolated", prior]);
  try {
    const id = docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "athyper-bp-enter-isolated",
      "--env-file",
      root + "/runtime.env",
      "-e",
      "MODE=" + mode,
      ...mounts(original[mode]),
      "--entrypoint",
      "node",
      "--no-healthcheck",
      p.runtimeImage,
      "/app/server/qualification/host.mjs",
    ]).trim();
    restored.push({ mode, id, image: p.runtimeImage, prior });
  } catch (e) {
    docker(["rename", prior, name]);
    docker(["network", "connect", "athyper-bp-enter-isolated", name]);
    docker(["start", name]);
    throw e;
  }
}
let healthy = false;
for (let i = 0; i < 30; i++) {
  try {
    const r = docker([
      "exec",
      "athyper-bp-enter-api",
      "node",
      "-e",
      'fetch("http://127.0.0.1:4000/health").then(r=>{console.log(r.status);process.exit(r.status===200?0:1)})',
    ]);
    healthy = r.trim() === "200";
    if (healthy) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
assert.ok(healthy);
const checks = [];
for (const account of ["catl.admin", "catl.owner"]) {
  const r = JSON.parse(
    docker([
      "exec",
      "athyper-bp-enter-ui-session-client",
      "node",
      "/app/server/qualification-client/session-client.mjs",
      account,
      "/api/neon/business-partner-company-setup-cases/" +
        revocation.revocationCaseId +
        "/view",
      "GET",
    ]),
  );
  assert.equal(r.status, 403);
  assert.equal(r.releaseSet, p.releaseSetHash);
  checks.push({ account, status: r.status, releaseSet: r.releaseSet });
}
const after = fp();
assert.deepEqual(after, before);
const output =
  "governance/policy/reports/business-partner-company-compatible-recovery-20260912.dev.json";
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      passed: true,
      incompatibleProbe: {
        image: p.previousRuntimeImage,
        artifact: "deliberately invalid local probe file",
        rejected: "PINNED_ARTIFACT_MISMATCH",
        neverServedRequests: true,
      },
      restored,
      checks,
      before,
      after,
      authorizationAndActivationsUnchanged: true,
      expiredAndRevokedMembershipRowsPreserved: true,
      artifactRollbackPerformed: false,
      fullAtlasRecoveryQualified: false,
    },
    null,
    2,
  ) + "\n",
);
console.log({
  passed: true,
  restored,
  checks,
  authorizationAndActivationsUnchanged: true,
});
