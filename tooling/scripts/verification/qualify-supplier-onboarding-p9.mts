/** P9 replayable qualification. Legacy receipts are restored; fresh receipts are retained per run. */
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const stage = process.argv[2];
const suites: Record<string, string[][]> = {
  build: [
    ["pnpm", "--filter", "@athyper/server-platform-host...", "build"],
    ["pnpm", "--filter", "@athyper/product-neon-business-partner", "typecheck"],
    ["pnpm", "--filter", "@athyper/neon", "build"],
  ],
  tests: [
    ["pnpm", "--filter", "@athyper/product-neon-business-partner", "test"],
    ["pnpm", "--filter", "@athyper/server-platform-host", "test"],
    ["pnpm", "--filter", "@athyper/server-platform-governance", "test"],
    ["pnpm", "--filter", "@athyper/server-platform-control-admin", "test"],
    ["pnpm", "--filter", "@athyper/server-service-master-data", "test"],
    [
      "pnpm",
      "exec",
      "tsx",
      "--tsconfig",
      "tooling/config/tsconfig-react.json",
      "--test",
      "tests/foundation/business-partner-full-profile.test.ts",
      "tests/foundation/business-partner-audit.test.ts",
    ],
  ],
  communications: [
    [
      "pnpm",
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-supplier-communications-activation-notices.mts",
      "--read-only",
    ],
  ],
  fixtures: [
    [
      "pnpm",
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-supplier-onboarding-p9-fixtures.mts",
    ],
  ],
  clean: [
    [
      "pnpm",
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-supplier-onboarding-p9-clean.mts",
    ],
  ],
  database: [
    "qualify-supplier-onboarding-p1a.mts",
    "qualify-supplier-onboarding-p9-minimum.mts",
    "qualify-supplier-process-tasks-db.mts",
    "qualify-supplier-process-document-jobs-db.mts",
    "qualify-supplier-process-document-outcomes-db.mts",
    "qualify-supplier-process-correction-db.mts",
    "qualify-supplier-onboarding-completion-db.mts",
    "qualify-supplier-onboarding-payment-db.mts",
    "qualify-supplier-onboarding-bank-link-db.mts",
    "qualify-supplier-onboarding-receipts-db.mts",
    "qualify-supplier-process-materializer-contract-db.mjs",
    "qualify-supplier-onboarding-communications-db.mts",
    "qualify-supplier-onboarding-neon-db.mjs",
  ].map((file) => [
    "pnpm",
    "exec",
    "tsx",
    `tooling/scripts/verification/${file}`,
    ...(file === "qualify-supplier-process-tasks-db.mts"
      ? ["--p9-fixtures"]
      : []),
  ]),
  browser: [
    [
      "pnpm",
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-business-partner-360-restoration.mts",
    ],
    [
      "pnpm",
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-supplier-onboarding-neon-live.mts",
      "--p9",
    ],
    [
      "pnpm",
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-supplier-onboarding-neon-history.mts",
    ],
  ],
};
if (!stage || !suites[stage])
  throw Error(
    `Usage: pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts ${Object.keys(suites).join("|")}`,
  );
const at = new Date().toISOString();
const dir = `governance/policy/reports/p9/${at.replaceAll(":", "-")}-${stage}`;
mkdirSync(dir, { recursive: true });
const report: any = {
  package: "P9",
  stage,
  at,
  passed: false,
  steps: [],
  acceptance:
    "Stage evidence only; full Increment A acceptance requires the P9 acceptance matrix.",
};
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
function receiptPaths(command: string[]) {
  const script = command.find((arg) => /^tooling\/.*\.(mts|mjs)$/.test(arg));
  if (!script) return [];
  const source = readFileSync(script, "utf8");
  const paths = [
    ...source.matchAll(
      /["']((?:governance\/policy\/reports|docs\/architecture\/business-partner)\/[^"']+\.json)["']/g,
    ),
  ].map((match) => match[1]!);
  if (stage === "clean")
    paths.push(
      "governance/policy/reports/supplier-onboarding-p9-clean-catalog.dev.json",
      "governance/policy/reports/supplier-onboarding-p9-native-form.dev.json",
    );
  return [...new Set(paths)];
}
function receipts(paths: string[]) {
  return new Map(
    paths
      .filter((path) => existsSync(path))
      .map((path) => [path, readFileSync(path)]),
  );
}
try {
  for (const [index, command] of suites[stage].entries()) {
    console.log(
      `P9 ${stage} ${index + 1}/${suites[stage].length}: ${command.join(" ")}`,
    );
    const paths = receiptPaths(command);
    const before = receipts(paths);
    const startedAt = new Date().toISOString();
    const result = spawnSync(command[0], command.slice(1), {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 20 * 60 * 1000,
    });
    const log = `${index + 1}.log`;
    writeFileSync(
      join(dir, log),
      (result.stdout ?? "") + (result.stderr ?? ""),
      { mode: 0o600 },
    );
    const evidence = [];
    for (const [path, bytes] of receipts(paths)) {
      const original = before.get(path);
      if (original?.equals(bytes)) continue;
      const artifact = `${index + 1}-${path.split("/").at(-1)}`;
      writeFileSync(join(dir, artifact), bytes);
      evidence.push({ source: path, artifact, sha256: hash(bytes) });
      if (stage !== "fixtures") {
        if (original) writeFileSync(path, original);
        else unlinkSync(path);
      }
    }
    // A failed legacy script may not write its receipt: exit status is authoritative.
    const step = {
      command,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: result.status,
      signal: result.signal,
      passed: result.status === 0 && !result.error,
      error: result.error?.message,
      log,
      evidence,
    };
    report.steps.push(step);
    writeFileSync(
      join(dir, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        passed: step.passed,
        exitCode: step.exitCode,
        evidence: evidence.length,
      }),
    );
  }
  report.passed = report.steps.every((s: any) => s.passed);
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(dir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `P9 ${stage}: ${report.passed ? "PASS" : "FAIL"}; ${dir}/report.json`,
  );
}
if (!report.passed) process.exitCode = 1;
