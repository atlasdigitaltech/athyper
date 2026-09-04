import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const failures = [];

// 1. The P0 performance phases (0-5) must remain recorded in history. This is the
//    provenance guard for the whole meta-entity / runtime performance programme.
const required = [
  "perf(phase-0):",
  "perf(phase-1):",
  "perf(phase-2):",
  "perf(phase-3):",
  "perf(phase-4):",
  "perf(phase-5):",
];
const history = execFileSync("git", ["log", "--format=%s", "--all"], {
  cwd: root,
  encoding: "utf8",
});
for (const marker of required) {
  if (!history.includes(marker))
    failures.push(`performance phase marker missing from history: ${marker}`);
}

// 2. Redis SCAN retirement boundary. The three-plane reorg completed the SCAN
//    elimination the old allowlist inventory was tracking — there is no
//    unbounded SCAN left. This is now a forward ratchet at zero: descriptor,
//    permission, and request-path caches must use exact keys / generation
//    markers, never SCAN / scanStream / scanIterator on a Redis client.
const SCAN_CALL =
  /\b(?:redis|cache|kv|store|client|conn|pool)\w*\s*\.\s*(?:scan|scanStream|scanIterator)\s*\(/;
const scanRoots = ["server/packages/services", "server/packages/platform"];
for (const relativeRoot of scanRoots) {
  for (const file of tsFilesBelow(resolve(root, relativeRoot))) {
    if (file.includes("__tests__") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(file, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (SCAN_CALL.test(line)) {
        failures.push(
          `${relative(root, file)}:${index + 1} Redis SCAN is retired; use an exact key or generation marker`,
        );
      }
    });
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log(
  "Performance phase history and Redis SCAN retirement boundary verified.",
);

function tsFilesBelow(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "dist"
        ? []
        : tsFilesBelow(child);
    }
    return entry.name.endsWith(".ts") ? [child] : [];
  });
}
