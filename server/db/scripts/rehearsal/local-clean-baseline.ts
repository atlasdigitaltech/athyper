#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface GateReport {
  ready?: boolean;
  counts?: Record<string, number>;
}

interface CommandResult {
  name: string;
  command: string;
  passed: boolean;
  exitCode: number | null;
  report?: GateReport;
  error?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const contractPath = resolve(
  repositoryRoot,
  "config/governance/authorization-phase8-local-clean-baseline.v1.json",
);
const contract = JSON.parse(await readFile(contractPath, "utf8")) as {
  contractVersion: string;
  productionMigrationReadiness: string;
};
const execute = process.argv.includes("--execute");

const prerequisiteCommands = [
  {
    name: "clean_ddl",
    args: ["exec", "tsx", "scripts/verify/verify-authorization-v2-clean-ddl.ts", "--strict"],
  },
  {
    name: "final_seeds",
    args: ["exec", "tsx", "scripts/verify/verify-authorization-v2-seeds.ts", "--strict"],
  },
  {
    name: "generated_artifacts",
    args: ["exec", "tsx", "scripts/verify/verify-authorization-v2-artifacts.ts", "--strict"],
  },
] as const;

const prerequisites = prerequisiteCommands.map(({ name, args }) =>
  runJsonCommand(name, "pnpm.cmd", ["--dir", databaseRoot, ...args])
);
const blockers = prerequisites
  .filter((item) => !item.passed)
  .map((item) => `${item.name}_repository_gate_failed`);

if (blockers.length === 0 && !execute) {
  blockers.push("clean_build_execution_not_requested");
}

// Destructive database creation/reset is deliberately unreachable until every
// repository prerequisite is green. This prevents Phase 7's legacy baseline
// from being recreated and accidentally certified.
if (blockers.length === 0 && execute) {
  blockers.push("isolated_ab_database_executor_not_yet_configured");
}

const result = {
  contractVersion: contract.contractVersion,
  generatedAt: new Date().toISOString(),
  executionRequested: execute,
  destructiveExecutionStarted: false,
  prerequisites,
  certification: {
    "local-development-clean-baseline": "blocked",
    "production-migration-readiness": contract.productionMigrationReadiness,
  },
  blockers,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = blockers.length === 0 ? 0 : 1;

function runJsonCommand(
  name: string,
  command: string,
  args: string[],
): CommandResult {
  const child = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
    env: process.env,
  });
  const output = child.stdout?.trim() ?? "";
  let report: GateReport | undefined;
  let error: string | undefined;
  try {
    report = output ? JSON.parse(output) as GateReport : undefined;
  } catch {
    error = "command did not return a JSON gate report";
  }
  return {
    name,
    command: [command, ...args].join(" "),
    passed: child.status === 0 && report?.ready === true,
    exitCode: child.status,
    report,
    error: error
      ?? child.error?.message
      ?? (child.stderr?.trim() || undefined),
  };
}
