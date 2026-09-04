import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const ignored = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo"]);
const violations = [];

function walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    let stat;
    try { stat = lstatSync(path); } catch { continue; }
    if (stat.isSymbolicLink()) {
      violations.push(`${relative(root, path).replaceAll("\\", "/")} -> ${relative(root, realpathSync(path)).replaceAll("\\", "/")}`);
      continue;
    }
    if (entry.isDirectory()) walk(path);
  }
}

for (const sourceRoot of ["apps", "packages", "server", "tooling"]) walk(join(root, sourceRoot));

if (violations.length) {
  console.error(["Source junction/symlink check failed:", ...violations.map((item) => `- ${item}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("No source junctions or symlinks found outside node_modules.");
}
