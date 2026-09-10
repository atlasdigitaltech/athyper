import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyTestEvidence } from "./verify-ci-integrity-evidence.mjs";
const root = resolve(import.meta.dirname, "../../..");
const output = resolve(root, "artifacts/ci-integrity/finance-tests.json");
mkdirSync(resolve(root, "artifacts/ci-integrity"), { recursive: true });
const result = spawnSync(
  "pnpm",
  [
    "--fail-if-no-match",
    "--filter",
    "@athyper/server-service-finance",
    "exec",
    "vitest",
    "run",
    "--exclude",
    "**/*.postgres.test.ts",
    "--reporter=default",
    "--reporter=json",
    `--outputFile=${output}`,
  ],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
verifyTestEvidence(JSON.parse(readFileSync(output, "utf8")));
console.log(
  "All current finance semantic suites passed with nonempty, zero-skip evidence. PostgreSQL coverage is separately mandatory in verify:ci-database.",
);
