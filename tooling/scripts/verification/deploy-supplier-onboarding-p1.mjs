/** Narrow local DEV runtime build; preserves the running image and compose rollback. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
const run = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const container = "athyper-dev-source-api-1",
  before = JSON.parse(run(["inspect", container]))[0];
const root = `${homedir()}/.athyper/instances/dev/deployments/supplier-p1-${Date.now()}`;
mkdirSync(root, { recursive: true, mode: 0o700 });
const files = [];
for (const [pkg, kind, names] of [
  [
    "master-data",
    "contracts",
    ["index.js", "supplier-onboarding-requirement.js"],
  ],
  [
    "master-data",
    "services",
    [
      "index.js",
      "business-partner-request-service.js",
      "business-partner-intake-profile.js",
      "supplier-onboarding-requirement.js",
    ],
  ],
]) {
  const name = `@athyper/server-${kind === "contracts" ? "contract" : "service"}-${pkg}`;
  const target = run([
    "exec",
    container,
    "readlink",
    "-f",
    `/app/server/node_modules/${name}`,
  ]).trim();
  for (const file of names)
    files.push({
      source: `server/packages/${kind}/${pkg}/dist/${file}`,
      target: `${target}/dist/${file}`,
    });
}
files.push({
  source: "server/apps/platform-host/dist/composition/register-services.js",
  target: "/app/server/dist/composition/register-services.js",
});
for (const [i, f] of files.entries()) {
  f.local = `${i}.js`;
  copyFileSync(f.source, `${root}/${f.local}`);
  f.hash = createHash("sha256").update(readFileSync(f.source)).digest("hex");
}
const base = `athyper-runtime-server:p1-base-${before.Image.slice(7, 19)}`;
run(["tag", before.Image, base]);
writeFileSync(
  `${root}/Dockerfile`,
  `FROM ${base}\n` +
    files.map((f) => `COPY ${f.local} ${f.target}`).join("\n") +
    "\n",
);
const tag = `athyper-runtime-server:supplier-p1-${Date.now()}`;
run(["build", "-t", tag, root]);
const image = run(["image", "inspect", "--format", "{{.Id}}", tag]).trim();
run([
  "run",
  "--rm",
  "--entrypoint",
  "node",
  image,
  "--input-type=module",
  "-e",
  "await import('./dist/composition/register-services.js');console.log('P1 imports verified')",
]);
writeFileSync(
  `${root}/override.json`,
  JSON.stringify({ services: { api: { image } } }),
);
writeFileSync(
  `${root}/rollback.json`,
  JSON.stringify({ services: { api: { image: before.Image } } }),
);
const configs =
  before.Config.Labels["com.docker.compose.project.config_files"].split(",");
run([
  "compose",
  "-p",
  before.Config.Labels["com.docker.compose.project"],
  ...configs.flatMap((x) => ["-f", x]),
  "-f",
  `${root}/override.json`,
  "up",
  "-d",
  "--no-deps",
  "--no-build",
  "api",
]);
const report = {
  at: new Date().toISOString(),
  container,
  beforeImage: before.Image,
  image,
  files,
  override: `${root}/override.json`,
  rollback: `${root}/rollback.json`,
};
writeFileSync(
  "governance/policy/reports/supplier-onboarding-p1-runtime.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
