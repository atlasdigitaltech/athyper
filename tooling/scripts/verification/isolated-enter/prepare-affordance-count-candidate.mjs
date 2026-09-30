import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { docker, fingerprint, amendment } from "./protected-reveal-client.mjs";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  stage =
    os.homedir() +
    "/.athyper/qualification/bp/affordance-count-candidate-20260912";
fs.mkdirSync(stage, { recursive: true });
const sha = (x) => createHash("sha256").update(x).digest("hex");
const master =
    "/app/server/node_modules/.pnpm/@athyper+server-service-master-data@file+server+packages+services+master-data/node_modules/@athyper/server-service-master-data/dist/",
  contract =
    "/app/server/node_modules/.pnpm/@athyper+server-contract-master-data@file+server+packages+contracts+master-data/node_modules/@athyper/server-contract-master-data/dist/";
const files = [
  ...[
    "business-partner-360-policy",
    "business-partner-360-service",
    "kysely-business-partner-360-commercial-controls",
  ].map((n) => ({
    source: "server/packages/services/master-data/dist/" + n + ".js",
    destination: master + n + ".js",
  })),
  {
    source:
      "server/packages/contracts/master-data/dist/business-partner-360.js",
    destination: contract + "business-partner-360.js",
  },
];
for (const f of files) {
  fs.copyFileSync(f.source, stage + "/" + path.basename(f.source));
  f.sha256 = sha(fs.readFileSync(f.source));
}
docker(["tag", amendment.runtimeImage, "athyper-bp-affordance-base:20260912"]);
fs.writeFileSync(
  stage + "/Dockerfile",
  "FROM athyper-bp-affordance-base:20260912\n" +
    files
      .map((f) => "COPY " + path.basename(f.source) + " " + f.destination)
      .join("\n") +
    "\n",
);
docker([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-affordance-count-candidate:20260912",
  stage,
]);
const runtimeImage = JSON.parse(
  docker([
    "image",
    "inspect",
    "athyper-bp-affordance-count-candidate:20260912",
  ]),
)[0].Id;
const uiPrior = JSON.parse(docker(["inspect", "athyper-bp-enter-neon-ui"]))[0];
const uiStage = stage + "/ui";
fs.mkdirSync(uiStage, { recursive: true });
fs.cpSync("apps/neon/.next-bp-reveal/standalone", uiStage + "/standalone", {
  recursive: true,
  verbatimSymlinks: true,
});
fs.cpSync(
  "apps/neon/.next-bp-reveal/static",
  uiStage + "/standalone/apps/neon/.next-bp-reveal/static",
  { recursive: true },
);
fs.cpSync("apps/neon/public", uiStage + "/standalone/apps/neon/public", {
  recursive: true,
});
docker(["tag", uiPrior.Image, "athyper-bp-affordance-ui-base:20260912"]);
fs.writeFileSync(
  uiStage + "/Dockerfile",
  "FROM athyper-bp-affordance-ui-base:20260912\nUSER root\nCOPY standalone/ /app/\nWORKDIR /app\n",
);
docker([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-affordance-ui-candidate:20260912",
  uiStage,
]);
const uiImage = JSON.parse(
  docker(["image", "inspect", "athyper-bp-affordance-ui-candidate:20260912"]),
)[0].Id;
const releaseSetHash = sha(
    JSON.stringify({ runtimeImage, artifacts: amendment.artifacts }),
  ),
  harness = root + "/affordance-count-harness";
fs.cpSync(root + "/protected-reference-harness", harness, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const boundary = fs.readFileSync(harness + "/release-boundary.mjs", "utf8");
assert(boundary.includes(amendment.releaseSetHash));
fs.writeFileSync(
  harness + "/release-boundary.mjs",
  boundary.replaceAll(amendment.releaseSetHash, releaseSetHash),
);
const deployment = JSON.parse(
  fs.readFileSync(root + "/protected-reference-deployment.json"),
);
deployment.runtimeImage = runtimeImage;
fs.writeFileSync(
  root + "/affordance-count-deployment.json",
  JSON.stringify(deployment),
  { flag: "wx", mode: 0o600 },
);
const before = fingerprint(),
  api = JSON.parse(docker(["inspect", "athyper-bp-enter-api"]))[0];
const mounts = api.Mounts.flatMap((m) => [
  "--mount",
  "type=bind,src=" +
    (m.Destination === "/app/server/qualification"
      ? harness
      : m.Destination === "/release/deployment.json"
        ? root + "/affordance-count-deployment.json"
        : m.Source) +
    ",dst=" +
    m.Destination +
    (m.RW ? "" : ",readonly"),
]);
const canary = "athyper-bp-affordance-count-canary";
const id = docker([
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
  runtimeImage,
  "/app/server/qualification/host.mjs",
]).trim();
const uiCanary = "athyper-bp-affordance-ui-canary";
const uiId = docker([
  "run",
  "-d",
  "--name",
  uiCanary,
  "--network",
  "athyper-bp-enter-isolated",
  "--env-file",
  root + "/neon-ui.env",
  "-p",
  "127.0.0.1:13329:3000",
  ...uiPrior.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      m.Source +
      ",dst=" +
      m.Destination +
      (m.RW ? "" : ",readonly"),
  ]),
  uiImage,
]).trim();
assert.deepEqual(fingerprint(), before);
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage,
  uiImage,
  previousRuntimeImage: amendment.runtimeImage,
  previousUiImage: uiPrior.Image,
  releaseSetHash,
  artifacts: amendment.artifacts,
  files,
  canary: { name: canary, id },
  uiCanary: { name: uiCanary, id: uiId, loopbackPort: 13329 },
  harness: fs
    .readdirSync(harness)
    .filter((n) => fs.statSync(harness + "/" + n).isFile())
    .map((name) => ({
      name,
      sha256: sha(fs.readFileSync(harness + "/" + name)),
    })),
  uiBuild:
    "Current NEON workspace standalone production build; isolated candidate only. Full source scope must be reviewed before any shared deployment.",
  activeRuntimeChanged: false,
  grantsChanged: false,
  ordinaryDraftsRetained: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-affordance-count-candidate-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({ runtimeImage, uiImage, releaseSetHash });
