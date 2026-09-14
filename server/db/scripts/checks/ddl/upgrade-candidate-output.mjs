import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runtimeRoot } from "../../../../../tooling/scripts/artifact-paths.mjs";
const directory = resolve(
  runtimeRoot(),
  "candidates",
  `sql-upgrade-${randomUUID()}`,
);
export function writeUpgradeCandidate(name, bytes) {
  if (!/^[a-zA-Z0-9_.-]+\.sql$/.test(name))
    throw new Error("Invalid candidate filename");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, name);
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  return path;
}
