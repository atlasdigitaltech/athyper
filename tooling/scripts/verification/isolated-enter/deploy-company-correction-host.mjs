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
const manifest = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-correction-candidate-20260912.dev.json",
  ),
);
const image = manifest.runtimeImage;
const deployment = JSON.parse(fs.readFileSync(root + "/deployment.json"));
deployment.runtimeImage = image;
fs.writeFileSync(
  root + "/company-correction-deployment.json",
  JSON.stringify(deployment),
  { mode: 0o600 },
);
const host = manifest;
const approval = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-company-image-correction-20260912.user-approval.dev.json",
  ),
);
if (
  approval.decision !== "approved" ||
  approval.proposalRevision !==
    "2077eeda1e658259bbde41bc53ccaa65ff17f762aed05a7c5d5f8b3bd144f758" ||
  Date.now() >= Date.parse("2026-09-12T05:34:47.375Z")
)
  throw Error("EXACT_IMAGE_AMENDMENT_APPROVAL_REQUIRED");
const results = [];
for (const mode of ["worker", "api"]) {
  const name = "athyper-bp-enter-" + mode,
    prior = name + "-before-company-correction";
  const current = JSON.parse(run(["inspect", name]))[0];
  if (
    current.Image !==
    "sha256:181476b05c51cca94905035f0a6abbb565db1e1e35b4283ee773872f074d8aef"
  )
    throw Error("OLD_IMAGE_CHANGED");
  const mounts = current.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? root + "/company-correction-harness"
        : m.Destination === "/release/deployment.json"
          ? root + "/company-correction-deployment.json"
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

fs.writeFileSync(
  "governance/policy/reports/business-partner-company-correction-execution-deployment-20260912.dev.json",
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
