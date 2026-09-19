import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/consolidated-backend-build-v3";
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const base =
  "sha256:a60b4997920cd7edab1cb41aaaf23cc8c6a26deaebfaa99720712fbeb0853778";
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
if (
  run(["inspect", "--format", "{{.Image}}", "athyper-bp-enter-api"]).trim() !==
  base
)
  throw Error("BASE_CHANGED");
const installed = JSON.parse(
  run([
    "exec",
    "athyper-bp-enter-api",
    "node",
    "--input-type=module",
    "-e",
    "import fs from 'node:fs';const root='/app/server/node_modules',found={};const scan=dir=>{if(!fs.existsSync(dir))return;for(const n of fs.readdirSync(dir)){try{const resolved=fs.realpathSync(dir+'/'+n);(found['@athyper/'+n]??=new Set()).add(resolved);}catch{}}};scan(root+'/@athyper');for(const p of fs.readdirSync(root+'/.pnpm'))scan(root+'/.pnpm/'+p+'/node_modules/@athyper');console.log(JSON.stringify(Object.fromEntries(Object.entries(found).map(([name,paths])=>[name,[...paths]]))));",
  ]),
);
const manifests = cp
  .execFileSync("rg", ["--files", "server", "packages", "-g", "package.json"], {
    encoding: "utf8",
  })
  .trim()
  .split("\n");
const packages = [];
for (const file of manifests) {
  const p = JSON.parse(fs.readFileSync(file)),
    dist = path.dirname(file) + "/dist";
  if (installed[p.name] && fs.existsSync(dist)) {
    for (const target of installed[p.name])
      packages.push({
        name: p.name,
        source: dist,
        target: target + "/dist",
        key: String(packages.length),
      });
  }
}
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
const files = {};
for (const item of [
  {
    name: "host",
    source: "server/apps/platform-host/dist",
    target: "/app/server/dist",
    key: "host",
  },
  ...packages,
]) {
  const dst = root + "/output/" + item.key;
  fs.cpSync(item.source, dst, { recursive: true, verbatimSymlinks: true });
  for (const p of walk(dst))
    files[p.slice(root.length + 1)] = createHash("sha256")
      .update(fs.readFileSync(p))
      .digest("hex");
}
run(["tag", base, "athyper-bp-consolidated-backend-base:20260912"]);
fs.writeFileSync(
  root + "/Dockerfile",
  "FROM athyper-bp-consolidated-backend-base:20260912\nUSER root\nCOPY output/host/ /app/server/dist/\n" +
    packages.map((p) => `COPY output/${p.key}/ ${p.target}/`).join("\n") +
    "\nWORKDIR /app/server\n",
);
run([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-consolidated-backend:20260912",
  root,
]);
const image = run([
  "image",
  "inspect",
  "--format",
  "{{.Id}}",
  "athyper-bp-consolidated-backend:20260912",
]).trim();
const report =
  "governance/policy/reports/business-partner-consolidated-backend-image-20260912-v3.dev.json";
fs.writeFileSync(
  report,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      base,
      image,
      packages,
      files,
      buildNetwork: "none",
      deployed: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  image,
  packages: packages.length,
  files: Object.keys(files).length,
  report,
});
