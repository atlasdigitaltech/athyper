import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fingerprint } from "./neon-final-client.mjs";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  read = (p) => JSON.parse(fs.readFileSync(p));
const prior = read(
  "governance/policy/reports/business-partner-neon-denial-candidate-20260912.dev.json",
);
const build = read(
  os.homedir() +
    "/.athyper/qualification/bp/finance-reveal-candidate-v2-20260912/image.json",
);
assert.equal(build.base, prior.runtimeImage);
const releaseSetHash = sha(
  JSON.stringify({ runtimeImage: build.image, artifacts: prior.artifacts }),
);
const harness = root + "/finance-reveal-v2-harness";
fs.cpSync(root + "/neon-denial-harness", harness, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const boundary = fs.readFileSync(harness + "/release-boundary.mjs", "utf8");
assert(boundary.includes(prior.releaseSetHash));
fs.writeFileSync(
  harness + "/release-boundary.mjs",
  boundary.replaceAll(prior.releaseSetHash, releaseSetHash),
);
const deployment = read(root + "/neon-denial-deployment.json");
deployment.runtimeImage = build.image;
fs.writeFileSync(
  root + "/finance-reveal-v2-deployment.json",
  JSON.stringify(deployment),
  { flag: "wx", mode: 0o600 },
);
const migration =
  "server/db/scripts/operations/repair/reference-permissions/20260912_finance_journal_activity_permission.sql";
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  status: "local-candidate-not-deployed-or-authenticated",
  runtimeImage: build.image,
  previousRuntimeImage: build.base,
  releaseSetHash,
  artifacts: prior.artifacts,
  files: build.files,
  harness: fs
    .readdirSync(harness)
    .filter((n) => fs.statSync(harness + "/" + n).isFile())
    .map((name) => ({
      name,
      sha256: sha(fs.readFileSync(harness + "/" + name)),
    })),
  migration: {
    path: migration,
    sha256: sha(fs.readFileSync(migration)),
    applied: false,
  },
  scope: "NEON only",
  ui: "Selected reveal context wired and tested in local source; UI image unchanged.",
  access: { grantsApplied: false, oldGrantsRemainRevoked: true },
  qualification: {
    sqlPreview:
      "governance/policy/reports/business-partner-finance-activity-preview-v2-20260912.dev.json",
    authenticated: false,
    dispositionsAccepted: false,
  },
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-finance-reveal-candidate-v2-20260912.dev.json",
  JSON.stringify(manifest, null, 2) + "\n",
  { flag: "wx" },
);
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const current = JSON.parse(run(["inspect", "athyper-bp-enter-api"]))[0];
assert.equal(current.Image, build.base);
const before = fingerprint();
const mounts = current.Mounts.flatMap((m) => [
  "--mount",
  "type=bind,src=" +
    (m.Destination === "/app/server/qualification"
      ? harness
      : m.Destination === "/release/deployment.json"
        ? root + "/finance-reveal-v2-deployment.json"
        : m.Source) +
    ",dst=" +
    m.Destination +
    (m.RW ? "" : ",readonly"),
]);
const id = run([
  "run",
  "-d",
  "--name",
  "athyper-bp-finance-reveal-v2-canary",
  "--network",
  "athyper-bp-enter-isolated",
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
]).trim();
assert.deepEqual(fingerprint(), before);
console.log({
  id,
  runtimeImage: build.image,
  releaseSetHash,
  grantsApplied: false,
  activeRuntimeChanged: false,
});
