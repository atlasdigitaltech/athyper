import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-release-20-isolated-20260911",
  build = root + "/context-build";
const docker = (a) =>
  cp.execFileSync("docker", a, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 3000000,
  });
const baseline = JSON.parse(docker(["inspect", "athyper-bp-r20-api"]))[0];
assert.equal(
  baseline.Image,
  "sha256:3fbbbaa376286770d3d8f0563cc72015f67aabfcc4fe4223531fd8005317143c",
);
fs.mkdirSync(build, { recursive: true, mode: 0o700 });
const modules = [
    "entity-list-service",
    "list-context-discovery",
    "entity-backend-authorizer",
    "list-experience",
    "navigation-context-discovery",
  ],
  hashes = {};
for (const name of modules) {
  const source = "server/packages/services/records/dist/" + name + ".js";
  fs.copyFileSync(source, build + "/" + name + ".js");
  hashes[name] = createHash("sha256")
    .update(fs.readFileSync(source))
    .digest("hex");
}
const mapper = "business-partner-backend-mapping";
const mapperSource =
  "server/apps/platform-host/dist/composition/" + mapper + ".js";
fs.copyFileSync(mapperSource, build + "/" + mapper + ".js");
hashes[mapper] = createHash("sha256")
  .update(fs.readFileSync(mapperSource))
  .digest("hex");
const records = docker([
  "exec",
  "athyper-bp-r20-api",
  "readlink",
  "-f",
  "/app/server/node_modules/@athyper/server-service-records",
]).trim();
docker(["tag", baseline.Image, "athyper-bp-r20-context-base:20260911"]);
fs.writeFileSync(
  build + "/Dockerfile",
  `FROM athyper-bp-r20-context-base:20260911\nUSER root\nCOPY ${modules.map((n) => n + ".js").join(" ")} ${records}/dist/\nCOPY ${mapper}.js /app/server/dist/composition/\n`,
);
cp.execFileSync(
  "docker",
  ["build", "-t", "athyper-bp-r20-context:20260911", build],
  { stdio: ["pipe", "pipe", "pipe"] },
);
const image = JSON.parse(
  docker(["image", "inspect", "athyper-bp-r20-context:20260911"]),
)[0].Id;
const harness = root + "/context-harness";
fs.cpSync(root + "/harness", harness, { recursive: true });
let host = fs.readFileSync(harness + "/host.mjs", "utf8");
const anchor = "configure(app){";
assert.equal(host.split(anchor).length, 2);
host = host.replace(
  anchor,
  anchor +
    "\n app.use((req,res,next)=>['GET','HEAD'].includes(req.method)?next():res.status(405).json({code:'READ_QUALIFICATION_ONLY'}));\n",
);
fs.writeFileSync(harness + "/host.mjs", host);
let client = fs.readFileSync(root + "/session-client.mjs", "utf8");
assert.equal(client.split("http://athyper-bp-r20-api:4000").length, 2);
client = client.replace(
  "http://athyper-bp-r20-api:4000",
  "http://athyper-bp-r20-context-api:4000",
);
fs.writeFileSync(root + "/context-session-client.mjs", client, { mode: 0o600 });
const mounts = baseline.Mounts.flatMap((m) => [
  "-v",
  (m.Destination === "/app/server/qualification" ? harness : m.Source) +
    ":" +
    m.Destination +
    ":ro",
]);
const id = docker([
  "run",
  "-d",
  "--name",
  "athyper-bp-r20-context-api",
  "--network",
  "athyper-bp-r20-isolated",
  "--env-file",
  root + "/runtime.env",
  "-e",
  "MODE=api",
  ...mounts,
  "--entrypoint",
  "node",
  image,
  "/app/server/qualification/host.mjs",
]).trim();
// Client contains session-handling code only, never tokens or granted authority.
cp.execFileSync("docker", [
  "cp",
  root + "/context-session-client.mjs",
  "athyper-bp-r20-auth-client:/app/server/qualification-client/context-session-client.mjs",
]);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  baseImage: baseline.Image,
  imageId: image,
  containerId: id,
  moduleHashes: hashes,
  readOnly: true,
  sharedDevChanged: false,
  baselineApiWorkerChanged: false,
  grantsChanged: false,
  artifactChanged: false,
  qualificationPending: true,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-release-20-context-candidate.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
