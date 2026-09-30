/** Replaces only the isolated GET/HEAD candidate, never the qualified API/worker. */
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const image = process.argv[2];
if (process.argv.length !== 3 || !/^sha256:[a-f0-9]{64}$/.test(image ?? ""))
  throw Error("Exact local image ID required");
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911";
const docker = (args) =>
  cp
    .execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    .trim();
if (JSON.parse(docker(["image", "inspect", image]))[0].Id !== image)
  throw Error("Image mismatch");
const host = fs.readFileSync(root + "/harness/host-read-only.mjs");
if (
  !host.toString().includes("['GET','HEAD'].includes(req.method)") ||
  !host.toString().includes("READ_QUALIFICATION_ONLY")
)
  throw Error("Read-only host required");
const network = JSON.parse(
  docker(["network", "inspect", "athyper-bp-r19s-isolated"]),
)[0];
if (!network.Internal) throw Error("Internal isolation required");
const authority = assertAuthorityUnchanged("revoked");
const name = "athyper-bp-r19s-read-api",
  previous = name + "-previous-" + Date.now();
const old = JSON.parse(docker(["inspect", name]))[0];
if (
  Object.keys(old.NetworkSettings.Networks).join(",") !== network.Name ||
  Object.values(old.NetworkSettings.Ports ?? {}).some(Boolean)
)
  throw Error("Unexpected candidate isolation");
const savedDeployment = fs.readFileSync(root + "/read-deployment.json");
const deployment = JSON.parse(savedDeployment);
deployment.runtimeImage = image;
const args = [
  "run",
  "-d",
  "--name",
  name,
  "--network",
  network.Name,
  "--env-file",
  root + "/runtime.env",
  "-e",
  "MODE=api",
  "--entrypoint",
  "node",
  "--no-healthcheck",
];
for (const [src, dst] of [
  ["artifact.json", "/release/artifact.json"],
  ["public-key.der", "/release/public-key.der"],
  ["harness", "/app/server/qualification"],
  ["read-deployment.json", "/release/deployment.json"],
])
  args.push(
    "--mount",
    "type=bind,src=" + root + "/" + src + ",dst=" + dst + ",readonly",
  );
let created = false,
  renamed = false;
try {
  docker(["stop", name]);
  docker(["rename", name, previous]);
  renamed = true;
  fs.writeFileSync(
    root + "/read-deployment.json",
    JSON.stringify(deployment, null, 2) + "\n",
    { mode: 0o600 },
  );
  const id = docker([
    ...args,
    image,
    "/app/server/qualification/host-read-only.mjs",
  ]);
  created = true;
  let ready = false;
  for (let n = 0; n < 40; n++) {
    const state = JSON.parse(docker(["inspect", name]))[0].State;
    if (!state.Running) throw Error("Candidate startup failed");
    const log = docker(["logs", name]);
    if (
      log.includes("bp_authorization_deployment_verified") &&
      log.includes("isolated_host_ready")
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("Candidate readiness not confirmed");
  if (assertAuthorityUnchanged("revoked").sha256 !== authority.sha256)
    throw Error("Authority changed");
  const record = {
    image,
    id,
    harnessSha256: createHash("sha256").update(host).digest("hex"),
    methods: ["GET", "HEAD"],
    grantMutations: [],
    transferGrants: "revoked",
    previousContainer: previous,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    root + "/read-candidate.json",
    JSON.stringify(record, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(record));
} catch (error) {
  if (created) docker(["rm", "-f", name]);
  fs.writeFileSync(root + "/read-deployment.json", savedDeployment, {
    mode: 0o600,
  });
  if (renamed) docker(["rename", previous, name]);
  docker(["start", name]);
  throw error;
}
