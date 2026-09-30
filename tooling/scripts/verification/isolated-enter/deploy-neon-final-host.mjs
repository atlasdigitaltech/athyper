import { createHash } from "node:crypto";
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
    "governance/policy/reports/business-partner-neon-final-candidate-20260912.dev.json",
  ),
);
const image = manifest.runtimeImage;
const deployment = JSON.parse(
  fs.readFileSync(root + "/neon-final-deployment.json"),
);
if (deployment.runtimeImage !== image) throw Error("DEPLOYMENT_CHANGED");
const host = manifest;
const approval = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-neon-final-execution-20260912.user-approval.dev.json",
  ),
);
if (
  approval.decision !== "approved" ||
  approval.proposalRevision !==
    "3c623d23098b2a862b3a32f38e256405ad3d70d2f57f93b5e2ec40845af51e3c" ||
  Date.now() >= Date.parse("2026-09-12T07:00:00.000Z")
)
  throw Error("EXACT_IMAGE_AMENDMENT_APPROVAL_REQUIRED");
if (Date.now() < Date.parse("2026-09-12T05:00:00.000Z"))
  throw Error("APPROVED_WINDOW_NOT_STARTED");
const proposal = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-neon-final-execution-20260912.proposal.dev.json",
  ),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const { proposalRevision, ...body } = proposal;
if (
  hash(JSON.stringify(body)) !== approval.proposalRevision ||
  hash(fs.readFileSync(proposal.candidateManifest)) !==
    proposal.candidateManifestSha256
)
  throw Error("APPROVED_BINDING_CHANGED");
for (const f of manifest.harness)
  if (
    hash(fs.readFileSync(root + "/neon-final-harness/" + f.name)) !== f.sha256
  )
    throw Error("HARNESS_CHANGED");
const results = [];
for (const mode of ["worker", "api"]) {
  const name = "athyper-bp-enter-" + mode,
    prior = name + "-before-neon-final";
  const current = JSON.parse(run(["inspect", name]))[0];
  if (
    current.Image !==
    "sha256:2289573661d7025943a847aac424b3f7ffeaf7b03587f249c4655c2530f7bbbc"
  )
    throw Error("OLD_IMAGE_CHANGED");
  const mounts = current.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? root + "/neon-final-harness"
        : m.Destination === "/release/deployment.json"
          ? root + "/neon-final-deployment.json"
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
  "governance/policy/reports/business-partner-neon-final-execution-deployment-20260912.dev.json",
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
