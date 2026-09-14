import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  run = (args) =>
    cp.execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
const image = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-dependency-image-20260912.dev.json",
  ),
).image;
const deployment = JSON.parse(fs.readFileSync(root + "/deployment.json"));
deployment.runtimeImage = image;
fs.writeFileSync(
  root + "/dependency-deployment.json",
  JSON.stringify(deployment),
  { mode: 0o600 },
);
const host = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-dependency-host-20260912.dev.json",
  ),
);
const results = [];
for (const mode of ["worker", "api"]) {
  const name = "athyper-bp-enter-" + mode,
    prior = name + "-before-dependencies";
  const current = JSON.parse(run(["inspect", name]))[0];
  if (
    current.Image !==
    "sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47"
  )
    throw Error("OLD_IMAGE_CHANGED");
  const mounts = current.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? root + "/dependency-harness"
        : m.Destination === "/release/deployment.json"
          ? root + "/dependency-deployment.json"
          : m.Source) +
      ",dst=" +
      m.Destination +
      (m.RW ? "" : ",readonly"),
  ]);
  run(["stop", name]);
  run(["rename", name, prior]);
  run(["network", "disconnect", "athyper-bp-enter-isolated", prior]);
  try {
    const id = run([
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
      ...mounts,
      "--entrypoint",
      "node",
      "--no-healthcheck",
      image,
      "/app/server/qualification/host.mjs",
    ]).trim();
    results.push({
      name,
      id,
      image,
      priorImage: current.Image,
      priorContainer: prior,
    });
  } catch (e) {
    run(["rename", prior, name]);
    run(["network", "connect", "athyper-bp-enter-isolated", name]);
    run(["start", name]);
    throw Error("START_FAILED_PRIOR_RESTORED");
  }
}
run(["stop", "athyper-bp-dependency-canary"]);
fs.writeFileSync(
  "governance/policy/reports/business-partner-dependency-execution-deployment-20260912.dev.json",
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      results,
      releaseSetHash: host.releaseSetHash,
      sharedDevChanged: false,
      grantsChanged: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({ results, releaseSetHash: host.releaseSetHash });
