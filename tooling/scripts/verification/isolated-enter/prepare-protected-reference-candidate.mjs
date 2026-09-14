import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { docker, fingerprint } from "./finance-reveal-client.mjs";
const old = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-protected-values-amendment-20260912.proposal.dev.json",
  ),
);
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  stage =
    os.homedir() +
    "/.athyper/qualification/bp/protected-reference-candidate-20260912";
fs.mkdirSync(stage, { recursive: true });
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  destination =
    "/app/server/node_modules/.pnpm/@athyper+server-adapter-secretstore-infisical@file+server+packages+adapters+secretstore-infisical/node_modules/@athyper/server-adapter-secretstore-infisical/dist/index.js";
const source = "server/packages/adapters/secretstore-infisical/dist/index.js";
fs.copyFileSync(source, stage + "/index.js");
docker([
  "tag",
  old.runtimeImage,
  "athyper-bp-protected-reference-base:20260912",
]);
fs.writeFileSync(
  stage + "/Dockerfile",
  "FROM athyper-bp-protected-reference-base:20260912\nCOPY index.js " +
    destination +
    "\n",
);
docker([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-protected-reference-candidate:20260912",
  stage,
]);
const image = JSON.parse(
  docker([
    "image",
    "inspect",
    "athyper-bp-protected-reference-candidate:20260912",
  ]),
)[0].Id;
const releaseSetHash = sha(
    JSON.stringify({ runtimeImage: image, artifacts: old.artifacts }),
  ),
  harness = root + "/protected-reference-harness";
fs.cpSync(root + "/protected-values-harness", harness, {
  recursive: true,
  force: false,
  errorOnExist: true,
});
const boundary = fs.readFileSync(harness + "/release-boundary.mjs", "utf8");
assert(boundary.includes(old.releaseSetHash));
fs.writeFileSync(
  harness + "/release-boundary.mjs",
  boundary.replaceAll(old.releaseSetHash, releaseSetHash),
);
const deployment = JSON.parse(
  fs.readFileSync(root + "/protected-values-deployment.json"),
);
deployment.runtimeImage = image;
fs.writeFileSync(
  root + "/protected-reference-deployment.json",
  JSON.stringify(deployment),
  { flag: "wx", mode: 0o600 },
);
const current = JSON.parse(
    docker(["inspect", "athyper-bp-protected-values-canary"]),
  )[0],
  before = fingerprint();
const mounts = current.Mounts.flatMap((m) => [
  "--mount",
  "type=bind,src=" +
    (m.Destination === "/app/server/qualification"
      ? harness
      : m.Destination === "/release/deployment.json"
        ? root + "/protected-reference-deployment.json"
        : m.Source) +
    ",dst=" +
    m.Destination +
    (m.RW ? "" : ",readonly"),
]);
const canary = "athyper-bp-protected-reference-canary",
  id = docker([
    "run",
    "-d",
    "--name",
    canary,
    "--network",
    "athyper-bp-enter-isolated",
    "--env-file",
    root + "/runtime-protected-values.env",
    "-e",
    "MODE=api",
    ...mounts,
    "--entrypoint",
    "node",
    "--no-healthcheck",
    image,
    "/app/server/qualification/host.mjs",
  ]).trim();
assert.deepEqual(fingerprint(), before);
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: image,
  releaseSetHash,
  baseImage: old.runtimeImage,
  previousRuntimeImage: old.previousRuntimeImage,
  artifacts: old.artifacts,
  canary: { name: canary, id },
  files: [{ source, destination, sha256: sha(fs.readFileSync(source)) }],
  harness: fs
    .readdirSync(harness)
    .filter((n) => fs.statSync(harness + "/" + n).isFile())
    .map((name) => ({
      name,
      sha256: sha(fs.readFileSync(harness + "/" + name)),
    })),
  secretReference: old.secret.reference,
  secretName: "athyper_ref_" + sha(old.secret.reference),
  tests: { adapter: 4, build: "passed" },
  activeRuntimeChanged: false,
  grantsChanged: false,
  secretCreated: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-protected-reference-candidate-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({ image, releaseSetHash, canary });
