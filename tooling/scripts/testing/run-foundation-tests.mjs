import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Provide foundation test files to run.");
  process.exit(1);
}

// Each file gets a fresh process so browser shims and compiled workspace
// modules are released before the next file starts.
const failures = [];
for (const file of files) {
  // Keep pnpm's executable shim: it supplies workspace NODE_PATH resolution.
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "--tsconfig",
      "tooling/config/tsconfig-react.json",
      "--test",
      file,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.error || result.status !== 0) {
    failures.push(file);
    console.error(
      result.error?.message ?? `${file}: ${result.signal ?? result.status}`,
    );
  }
}
console.log(
  `Foundation files: ${files.length - failures.length} passed, ${failures.length} failed.`,
);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
