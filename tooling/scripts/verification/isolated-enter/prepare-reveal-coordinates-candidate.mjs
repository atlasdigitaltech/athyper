import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  docker,
  fingerprint,
  proposal as amendment,
} from "./affordance-count-client.mjs";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  stage =
    os.homedir() +
    "/.athyper/qualification/bp/reveal-coordinates-candidate-20260912";
fs.mkdirSync(stage, { recursive: true });
const sha = (x) => createHash("sha256").update(x).digest("hex");
const master =
    "/app/server/node_modules/.pnpm/@athyper+server-service-master-data@file+server+packages+services+master-data/node_modules/@athyper/server-service-master-data/dist/",
  contract =
    "/app/server/node_modules/.pnpm/@athyper+server-contract-master-data@file+server+packages+contracts+master-data/node_modules/@athyper/server-contract-master-data/dist/";
const files = [
  {
    source:
      "server/packages/services/master-data/dist/business-partner-360-policy.js",
    destination: master + "business-partner-360-policy.js",
  },
];
for (const f of files) {
  fs.copyFileSync(f.source, stage + "/" + path.basename(f.source));
  f.sha256 = sha(fs.readFileSync(f.source));
}
docker([
  "tag",
  amendment.runtimeImage,
  "athyper-bp-reveal-coordinates-base:20260912",
]);
fs.writeFileSync(
  stage + "/Dockerfile",
  "FROM athyper-bp-reveal-coordinates-base:20260912\n" +
    files
      .map((f) => "COPY " + path.basename(f.source) + " " + f.destination)
      .join("\n") +
    "\n",
);
docker([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-reveal-coordinates-candidate:20260912",
  stage,
]);
const runtimeImage = JSON.parse(
  docker([
    "image",
    "inspect",
    "athyper-bp-reveal-coordinates-candidate:20260912",
  ]),
)[0].Id;
const uiPrior = JSON.parse(docker(["inspect", "athyper-bp-enter-neon-ui"]))[0];
const uiStage = stage + "/ui";
fs.mkdirSync(uiStage, { recursive: true });
fs.cpSync(
  "apps/neon/.next-bp-reveal-coordinates/standalone",
  uiStage + "/standalone",
  { recursive: true, verbatimSymlinks: true },
);
fs.cpSync(
  "apps/neon/.next-bp-reveal-coordinates/static",
  uiStage + "/standalone/apps/neon/.next-bp-reveal-coordinates/static",
  { recursive: true },
);
fs.cpSync("apps/neon/public", uiStage + "/standalone/apps/neon/public", {
  recursive: true,
});
docker([
  "tag",
  uiPrior.Image,
  "athyper-bp-reveal-coordinates-ui-base:20260912",
]);
fs.writeFileSync(
  uiStage + "/Dockerfile",
  "FROM athyper-bp-reveal-coordinates-ui-base:20260912\nUSER root\nCOPY standalone/ /app/\nWORKDIR /app\n",
);
docker([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-reveal-coordinates-ui-candidate:20260912",
  uiStage,
]);
const uiImage = JSON.parse(
  docker([
    "image",
    "inspect",
    "athyper-bp-reveal-coordinates-ui-candidate:20260912",
  ]),
)[0].Id;
const releaseSetHash = sha(
    JSON.stringify({ runtimeImage, artifacts: amendment.artifacts }),
  ),
  harness = root + "/reveal-coordinates-harness";
fs.cpSync(root + "/summary-context-harness", harness, {
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
  fs.readFileSync(root + "/summary-context-deployment.json"),
);
deployment.runtimeImage = runtimeImage;
fs.writeFileSync(
  root + "/reveal-coordinates-deployment.json",
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
        ? root + "/reveal-coordinates-deployment.json"
        : m.Source) +
    ",dst=" +
    m.Destination +
    (m.RW ? "" : ",readonly"),
]);
const canary = "athyper-bp-reveal-coordinates-canary";
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
const uiCanary = "athyper-bp-reveal-coordinates-ui-canary";
const uiId = docker([
  "run",
  "-d",
  "--name",
  uiCanary,
  "--network",
  "athyper-bp-enter-isolated",
  "--env-file",
  root + "/neon-ui.env",
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
  uiCanary: { name: uiCanary, id: uiId },
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
  ordinaryDraftsRetained: true,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-reveal-coordinates-candidate-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({ runtimeImage, uiImage, releaseSetHash });
