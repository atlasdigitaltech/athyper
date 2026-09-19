import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/consolidated-studio-ui-build-v2";
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const base =
  "sha256:7eeb739fdb7a99937a9be9c0c0e4b3a5f88d4f956985d022813d55127ab76621";
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
fs.cpSync(
  "apps/studio/.next-bp-consolidated/standalone",
  root + "/standalone",
  { recursive: true, verbatimSymlinks: true },
);
fs.cpSync(
  "apps/studio/.next-bp-consolidated/static",
  root + "/standalone/apps/studio/.next-bp-consolidated/static",
  { recursive: true },
);
if (fs.existsSync("apps/studio/public"))
  fs.cpSync("apps/studio/public", root + "/standalone/apps/studio/public", {
    recursive: true,
  });
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(dir + "/" + e.name)
        : e.isFile()
          ? [dir + "/" + e.name]
          : [],
    );
const files = Object.fromEntries(
  walk(root + "/standalone")
    .sort()
    .map((p) => [
      p.slice(root.length + 1),
      createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    ]),
);
run(["tag", base, "athyper-bp-studio-ui-base:20260912"]);
fs.writeFileSync(
  root + "/Dockerfile",
  "FROM athyper-bp-studio-ui-base:20260912\nUSER root\nCOPY standalone/ /app/\nWORKDIR /app\n",
);
run([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-consolidated-studio-ui:20260912",
  root,
]);
const image = run([
  "image",
  "inspect",
  "--format",
  "{{.Id}}",
  "athyper-bp-consolidated-studio-ui:20260912",
]).trim();
const report =
  "governance/policy/reports/business-partner-consolidated-studio-ui-image-20260912-v2.dev.json";
fs.writeFileSync(
  report,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      base,
      image,
      files,
      buildNetwork: "none",
      deployed: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({ image, files: Object.keys(files).length, report });
