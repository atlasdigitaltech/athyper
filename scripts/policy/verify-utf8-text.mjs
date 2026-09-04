#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
// Keep this gate focused on the rebuilt server source and the generated server
// architecture artifacts it owns. Broader documentation remediation is tracked
// separately because historical product-design records predate this baseline.
// (The pre-reorg status-report / route-manifest docs were removed; a missing
// root is skipped rather than crashing the gate.)
const roots = [
  "server/packages",
  "docs/architecture/server-route-manifest.md",
  "docs/architecture/server-route-manifest.json",
];
const ignored = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "archive",
]);
const extensions = new Set([
  ".ts",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);
const failures = [];

for (const path of roots.map((item) => join(root, item))) scan(path);
if (failures.length) {
  console.error(
    `UTF-8 mojibake markers found in ${failures.length} file(s):\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else console.log("UTF-8 text policy verified.");

function scan(path) {
  if (!existsSync(path)) return;
  if (!statSync(path).isDirectory()) return inspect(path);
  for (const entry of readdirSync(path)) {
    if (!ignored.has(entry)) scan(join(path, entry));
  }
}
function inspect(path) {
  if (!extensions.has(path.slice(path.lastIndexOf(".")))) return;
  const source = readFileSync(path, "utf8");
  if (/\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf]/.test(source))
    failures.push(relative(root, path).replaceAll("\\", "/"));
}
