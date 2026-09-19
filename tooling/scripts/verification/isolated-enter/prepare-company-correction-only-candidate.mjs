import fs from "node:fs";
import cp from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  sha = (x) => createHash("sha256").update(x).digest("hex"),
  write = (p, v) =>
    fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", { flag: "wx" });
const prior = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-consolidated-candidate-20260912.dev.json",
  ),
);
const build = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-correction-only-image-20260912.dev.json",
  ),
);
const releaseSetHash = sha(
  JSON.stringify({ runtimeImage: build.image, artifacts: prior.artifacts }),
);
fs.cpSync(
  root + "/consolidated-harness",
  root + "/company-correction-only-harness",
  { recursive: true, verbatimSymlinks: true },
);
const rb = root + "/company-correction-only-harness/release-boundary.mjs";
fs.writeFileSync(
  rb,
  fs.readFileSync(rb, "utf8").replace(prior.releaseSetHash, releaseSetHash),
);
const config = JSON.parse(
  fs.readFileSync(root + "/consolidated-deployment.json"),
);
config.runtimeImage = build.image;
fs.writeFileSync(
  root + "/company-correction-only-deployment.json",
  JSON.stringify(config),
  { mode: 0o600 },
);
const manifest = {
  ...prior,
  createdAt: new Date().toISOString(),
  runtimeImage: build.image,
  releaseSetHash,
  status: "correction-candidate-not-deployed-or-qualified",
  harness: fs
    .readdirSync(root + "/company-correction-only-harness")
    .filter((n) =>
      fs.statSync(root + "/company-correction-only-harness/" + n).isFile(),
    )
    .map((name) => ({
      name,
      sha256: sha(
        fs.readFileSync(root + "/company-correction-only-harness/" + name),
      ),
    })),
  reason:
    "Match canonical signed company entity name in central operation authorization",
};
const manifestPath =
  "governance/policy/reports/business-partner-company-correction-candidate-v2-20260912.dev.json";
write(manifestPath, manifest);
const original = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-company-execution-bound-20260912.proposal.dev.json",
  ),
);
const amendment = {
  schemaVersion: 1,
  kind: "company_execution_image_binding_amendment",
  approved: false,
  applied: false,
  originalProposalRevision: original.proposalRevision,
  originalApproval:
    "governance/policy/reviews/business-partner-company-execution-bound-20260912.user-approval.dev.json",
  destination: original.destination,
  previousRuntimeImage: original.runtimeImage,
  runtimeImage: build.image,
  previousReleaseSetHash: original.releaseSetHash,
  releaseSetHash,
  candidateManifest: manifestPath,
  candidateManifestSha256: sha(fs.readFileSync(manifestPath)),
  effectiveFrom: original.effectiveFrom,
  effectiveUntil: original.effectiveUntil,
  grantMutation: false,
  permissionsChanged: false,
  artifactChanges: false,
  scope:
    "Replace isolated API/worker image and bound harness only, using the already-applied eight company permissions within their original window",
  excluded: original.excluded,
};
amendment.proposalRevision = sha(JSON.stringify(amendment));
write(
  "governance/policy/reviews/business-partner-company-image-correction-v2-20260912.proposal.dev.json",
  amendment,
);
const docker = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const c = JSON.parse(docker(["inspect", "athyper-bp-enter-api"]))[0];
if (c.Image !== original.runtimeImage) throw Error("CURRENT_IMAGE_CHANGED");
const mounts = c.Mounts.flatMap((m) => [
  "--mount",
  "type=bind,src=" +
    (m.Destination === "/app/server/qualification"
      ? root + "/company-correction-only-harness"
      : m.Destination === "/release/deployment.json"
        ? root + "/company-correction-only-deployment.json"
        : m.Source) +
    ",dst=" +
    m.Destination +
    (m.RW ? "" : ",readonly"),
]);
docker([
  "run",
  "-d",
  "--name",
  "athyper-bp-company-correction-canary",
  "--network",
  original.destination.network,
  "--env-file",
  root + "/runtime.env",
  "-e",
  "MODE=api",
  ...mounts,
  "--entrypoint",
  "node",
  "--no-healthcheck",
  build.image,
  "/app/server/qualification/host.mjs",
]);
console.log({
  image: build.image,
  releaseSetHash,
  proposalRevision: amendment.proposalRevision,
  grantMutation: false,
  effectiveUntil: amendment.effectiveUntil,
});
