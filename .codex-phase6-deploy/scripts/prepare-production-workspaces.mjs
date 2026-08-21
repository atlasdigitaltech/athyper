import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const list = spawnSync(
  "pnpm",
  ["--filter", "@athyper/runtime-server...", "list", "--depth", "-1", "--json"],
  { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
);

if (list.status !== 0) {
  process.stderr.write(list.stderr);
  process.exit(list.status ?? 1);
}

const workspaces = JSON.parse(list.stdout);

function sourceTargets(value, targets = new Set()) {
  if (typeof value === "string") {
    if (/^\.\/src\/.*\.tsx?$/.test(value)) targets.add(value);
    return targets;
  }
  if (value && typeof value === "object") {
    for (const [condition, target] of Object.entries(value)) {
      if (condition !== "types") sourceTargets(target, targets);
    }
  }
  return targets;
}

function runtimeTarget(value) {
  if (typeof value === "string") {
    return /^\.\/src\/.*\.tsx?$/.test(value)
      ? value.replace(/^\.\/src\//, "./dist/").replace(/\.tsx?$/, ".js")
      : value;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([condition, target]) => [
        condition,
        condition === "types" ? target : runtimeTarget(target),
      ]),
    );
  }
  return value;
}

function runtimeExport(value) {
  if (typeof value === "string" && /^\.\/src\/.*\.tsx?$/.test(value)) {
    return { types: value, import: runtimeTarget(value) };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, target]) => [key, runtimeExport(target)]),
    );
  }
  return value;
}

for (const workspace of workspaces) {
  const directory = resolve(workspace.path);
  if (directory === resolve(root, "server")) continue;

  const manifestPath = resolve(directory, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const targets = sourceTargets(manifest.exports);
  if (targets.size === 0 && /^\.\/src\/.*\.tsx?$/.test(manifest.main ?? "")) {
    targets.add(manifest.main);
  }
  if (targets.size === 0) continue;

  const entries = [...targets].map((target) => resolve(directory, target));
  console.log(
    `[production-workspaces] compiling ${manifest.name} (${relative(root, directory)})`,
  );

  const build = spawnSync(
    resolve(root, "server/packages/services/ai/node_modules/.bin/tsup"),
    [
      ...entries,
      "--format",
      "esm",
      "--out-dir",
      resolve(directory, "dist"),
    ],
    { cwd: directory, encoding: "utf8", stdio: "inherit" },
  );
  if (build.status !== 0) process.exit(build.status ?? 1);

  if (manifest.main) manifest.main = runtimeTarget(manifest.main);
  if (manifest.exports) manifest.exports = runtimeExport(manifest.exports);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
