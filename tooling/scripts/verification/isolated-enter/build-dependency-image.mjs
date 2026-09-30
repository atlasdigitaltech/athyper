import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/dependency-build";
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const base =
  "sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47";
const run = (args) => cp.execFileSync("docker", args, { encoding: "utf8" });
if (
  run(["inspect", "--format", "{{.Image}}", "athyper-bp-enter-api"]).trim() !==
  base
)
  throw Error("BASE_CHANGED");
const pkg = run([
  "exec",
  "athyper-bp-enter-api",
  "readlink",
  "-f",
  "/app/server/node_modules/@athyper/server-service-records",
]).trim();
fs.cpSync("server/packages/services/records/dist", root + "/records", {
  recursive: true,
});
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
    );
const files = Object.fromEntries(
  walk(root + "/records")
    .sort()
    .map((p) => [
      p.slice(root.length + 1),
      createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    ]),
);
run(["tag", base, "athyper-bp-dependency-base:20260912"]);
fs.writeFileSync(
  root + "/Dockerfile",
  `FROM athyper-bp-dependency-base:20260912\nUSER root\nCOPY records/ ${pkg}/dist/\nWORKDIR /app/server\n`,
);
run([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-dependency-execution:20260912",
  root,
]);
const image = run([
  "image",
  "inspect",
  "--format",
  "{{.Id}}",
  "athyper-bp-dependency-execution:20260912",
]).trim();
const out =
  "governance/policy/reports/business-partner-dependency-image-20260912.dev.json";
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      base,
      image,
      files,
      network: "none",
      deployed: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({ image, report: out });
