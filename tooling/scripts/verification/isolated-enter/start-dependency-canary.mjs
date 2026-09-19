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
const current = JSON.parse(run(["inspect", "athyper-bp-enter-api"]))[0];
const image = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-dependency-image-20260912.dev.json",
  ),
).image;
const mounts = current.Mounts.flatMap((m) => [
  "--mount",
  "type=bind,src=" +
    (m.Destination === "/app/server/qualification"
      ? root + "/dependency-harness"
      : m.Source) +
    ",dst=" +
    m.Destination +
    (m.RW ? "" : ",readonly"),
]);
const id = run([
  "run",
  "-d",
  "--name",
  "athyper-bp-dependency-canary",
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
  image,
  "/app/server/qualification/host.mjs",
]).trim();
console.log({ id, image });
