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
    "governance/policy/reports/business-partner-neon-denial-candidate-20260912.dev.json",
  ),
);
const image = manifest.runtimeImage;
const deployment = JSON.parse(
  fs.readFileSync(root + "/neon-denial-deployment.json"),
);
if (deployment.runtimeImage !== image) throw Error("DEPLOYMENT_CHANGED");
const host = manifest;
const approval = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-neon-denial-image-20260912.user-approval.dev.json",
  ),
);
if (
  approval.decision !== "approved" ||
  approval.proposalRevision !==
    "5ffe103d2645a4428119bdf795988022bb7981121dce2a82c52ec2d4f4eadc39" ||
  Date.now() >= Date.parse("2026-09-12T07:00:00.000Z")
)
  throw Error("EXACT_IMAGE_AMENDMENT_APPROVAL_REQUIRED");
if (Date.now() < Date.parse("2026-09-12T05:00:00.000Z"))
  throw Error("APPROVED_WINDOW_NOT_STARTED");
const proposal = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-neon-denial-image-20260912.proposal.dev.json",
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
    hash(fs.readFileSync(root + "/neon-denial-harness/" + f.name)) !== f.sha256
  )
    throw Error("HARNESS_CHANGED");
const remaining = Number(
  run([
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
    "SELECT (SELECT count(*) FROM authz.group_member WHERE source_ref='3c623d23098b2a862b3a32f38e256405ad3d70d2f57f93b5e2ec40845af51e3c' AND status='active')+(SELECT count(*) FROM authz.group_role WHERE source_ref='3c623d23098b2a862b3a32f38e256405ad3d70d2f57f93b5e2ec40845af51e3c' AND status='active');",
  ]),
);
if (remaining !== 0) throw Error("REVOKED_ACCESS_REQUIRED");
const results = [];
for (const mode of ["worker", "api"]) {
  const name = "athyper-bp-enter-" + mode,
    prior = name + "-before-neon-denial";
  const current = JSON.parse(run(["inspect", name]))[0];
  if (
    current.Image !==
    "sha256:bb6946f9f7d4e771dbc2f27d045dc768a009d4ff26b97d6bd5710ee08b3f4084"
  )
    throw Error("OLD_IMAGE_CHANGED");
  const mounts = current.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? root + "/neon-denial-harness"
        : m.Destination === "/release/deployment.json"
          ? root + "/neon-denial-deployment.json"
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
  "governance/policy/reports/business-partner-neon-denial-execution-deployment-20260912.dev.json",
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
