import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20e6,
  });
const build = JSON.parse(
  readFileSync(
    "docs/examples/atlas-f6/distributed-inference-build.json",
    "utf8",
  ),
);
const qualification = JSON.parse(
  readFileSync(
    "docs/examples/atlas-f6/distributed-admission-qualification.json",
    "utf8",
  ),
);
assert.ok(
  qualification.passed && qualification.imageDigest === build.imageDigest,
);
const before = JSON.parse(
  docker("inspect", "athyper-dev-api-1", "athyper-dev-worker-1"),
);
assert.equal(before[0].Image, build.baseImage, "API changed after build");
const dir = build.deploymentDirectory,
  rollback = JSON.parse(readFileSync(dir + "/rollback.json", "utf8"));
const workerConfig = JSON.parse(
  docker(
    "compose",
    ...before[1].Config.Labels["com.docker.compose.project.config_files"]
      .split(",")
      .flatMap((f) => ["-f", f]),
    "config",
    "--format",
    "json",
  ),
);
const escape = (v) =>
  typeof v === "string"
    ? v.replaceAll("$", "$$")
    : Array.isArray(v)
      ? v.map(escape)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, v]) => [k, escape(v)]))
        : v;
for (const section of ["services", "networks", "volumes", "secrets", "configs"])
  rollback[section] = {
    ...escape(workerConfig[section] ?? {}),
    ...(rollback[section] ?? {}),
  };
rollback.services.worker = escape(workerConfig.services.worker);
rollback.services.worker.image = before[1].Image;
delete rollback.services.worker.build;
writeFileSync(dir + "/rollback.json", JSON.stringify(rollback), {
  mode: 0o600,
});
const rollout = structuredClone(rollback);
rollout.services.api.image = build.imageDigest;
rollout.services.worker.image = build.imageDigest;
const inferenceNetwork = Object.keys(rollout.networks).find(
  (k) =>
    k === "atlas_inference" ||
    rollout.networks[k].name === "athyper-dev-atlas_inference",
);
assert.ok(inferenceNetwork);
const workerNetworks = rollout.services.worker.networks;
rollout.services.worker.networks = Array.isArray(workerNetworks)
  ? [...new Set([...workerNetworks, inferenceNetwork])]
  : { ...workerNetworks, [inferenceNetwork]: null };
writeFileSync(dir + "/coordinated-rollout.json", JSON.stringify(rollout), {
  mode: 0o600,
});
const secret = before[0].Mounts.find(
  (m) => m.Destination === "/run/secrets/redis-password",
);
const config = ["local-inference", "semantic-retrieval"].map((n) =>
  JSON.parse(readFileSync("deploy/config/atlas/" + n + ".json", "utf8")),
);
const report = {
  observedAt: new Date().toISOString(),
  imageDigest: build.imageDigest,
  baseImages: before.map((c) => ({ name: c.Name, digest: c.Image })),
  checks: [],
  maintenanceStartedAt: null,
};
let changed = false,
  success = false;
async function healthy(names) {
  for (let i = 0; i < 60; i++) {
    const state = JSON.parse(docker("inspect", ...names));
    if (state.every((c) => c.State.Health?.Status === "healthy")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Deployment health deadline exceeded");
}
function isolated(image, source, args = [], network = "athyper-dev_data") {
  const id = docker(
    "create",
    "-i",
    "--network",
    network,
    "--mount",
    `type=bind,source=${secret.Source},target=/run/secrets/redis-password,readonly`,
    "--entrypoint",
    "node",
    image,
    "--input-type=module",
    "-",
    ...args,
  ).trim();
  try {
    if (network !== "athyper-dev-atlas_inference")
      docker("network", "connect", "athyper-dev-atlas_inference", id);
    const r = spawnSync("docker", ["start", "-ai", id], {
      input: source,
      encoding: "utf8",
      timeout: 90000,
      maxBuffer: 8e6,
    });
    let value;
    try {
      value = JSON.parse(r.stdout);
    } catch {
      throw Error("Isolated inference assessment did not return a receipt");
    }
    assert.equal(r.status, 0, "Isolated inference assessment failed");
    return value;
  } finally {
    docker("rm", "-f", id);
  }
}
try {
  report.maintenanceStartedAt = new Date().toISOString();
  docker(
    "compose",
    "-f",
    dir + "/rollback.json",
    "stop",
    "-t",
    "30",
    "api",
    "worker",
  );
  changed = true;
  docker("restart", "athyper-dev-atlas-atlas-inference-1");
  await healthy(["athyper-dev-atlas-atlas-inference-1"]);
  const script = readFileSync(
    "tooling/scripts/verification/atlas-inference-eviction-reproduction.mjs",
    "utf8",
  );
  for (const [mode, image] of [
    [
      "historical",
      "sha256:134c54a06b958caf97e553e904d275d4ed782f450bac5184d714bccfbdb857e5",
    ],
    ["corrected", build.imageDigest],
  ]) {
    const r = isolated(image, script, [JSON.stringify(config), mode]);
    r.imageDigest = image;
    writeFileSync(
      "docs/examples/atlas-f6/inference-eviction-" + mode + ".json",
      JSON.stringify(r, null, 2) + "\n",
    );
    assert.equal(r.passed, true);
    report.checks.push(mode + " controlled eviction qualification");
  }
  docker("restart", "athyper-dev-atlas-atlas-inference-1");
  await healthy(["athyper-dev-atlas-atlas-inference-1"]);
  const provision = isolated(
    build.imageDigest,
    `import{readFileSync}from'node:fs';import{randomUUID}from'node:crypto';import{createRedisCacheAdapter}from'/app/server/node_modules/@athyper/server-adapter-cache-redis/dist/index.js';import{ATLAS_INFERENCE_ADMISSION_KEY as key}from'/app/server/dist/composition/atlas-inference-admission.js';const c=createRedisCacheAdapter({url:'redis://:'+encodeURIComponent(readFileSync('/run/secrets/redis-password','utf8').trim())+'@memorycache:6379'});await c.connect();try{if(await c.client.hget(key,'owner'))throw Error('Owner is present; explicit recovery required');const created=await c.client.hsetnx(key,'epoch',randomUUID());console.log(JSON.stringify({initialized:true,created:created===1}));}finally{await c.close();}`,
  );
  assert.ok(provision.initialized);
  report.checks.push(
    "coordination state initialized after inference quiescence",
  );
  docker(
    "compose",
    "-f",
    dir + "/coordinated-rollout.json",
    "up",
    "-d",
    "--no-deps",
    "--pull",
    "never",
    "api",
    "worker",
  );
  await healthy(["athyper-dev-api-1", "athyper-dev-worker-1"]);
  success = true;
  report.checks.push("API and worker healthy on the coordinated image");
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (changed && !success) {
    docker(
      "compose",
      "-f",
      dir + "/rollback.json",
      "up",
      "-d",
      "--no-deps",
      "--pull",
      "never",
      "api",
      "worker",
    );
    await healthy(["athyper-dev-api-1", "athyper-dev-worker-1"]);
    report.rollbackRestored = true;
  }
  report.passed = success;
  report.completedAt = new Date().toISOString();
  report.deploymentDirectory = dir;
  writeFileSync(
    "docs/examples/atlas-f6/distributed-inference-deployment.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
