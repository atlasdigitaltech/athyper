import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(packageRoot, "src");
const forbidden = [
  /from\s+["']@athyper\/svc-/,
  /from\s+["'][^"']*server\//,
  /from\s+["']node:/,
  /import\s+["']server-only["']/,
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  }));
  return nested.flat().filter((file) => /\.[cm]?[jt]sx?$/.test(file));
}

const violations = [];
for (const file of await files(sourceRoot)) {
  const source = await readFile(file, "utf8");
  if (forbidden.some((pattern) => pattern.test(source))) {
    violations.push(path.relative(packageRoot, file));
  }
}
if (violations.length) {
  throw new Error(`Server boundary violation:\n${violations.join("\n")}`);
}
