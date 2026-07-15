import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const required = [
  "perf(phase-0):",
  "perf(phase-1):",
  "perf(phase-2):",
  "perf(phase-3):",
  "perf(phase-4):",
  "perf(phase-5):",
];
const history = execFileSync("git", ["log", "--format=%s", "--all"], { cwd: root, encoding: "utf8" });
const failures = required.filter((marker) => !history.includes(marker));
const route = readFileSync(resolve(root, "server/packages/services/records/routes/entity-mutation.route.ts"), "utf8");
for (const marker of ["legacy.create", "legacy.patch", "legacy.delete"]) {
  if (!route.includes(marker)) failures.push(`legacy mutation fallback '${marker}' is missing`);
}
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Performance phase history and legacy-retirement boundary verified.");
