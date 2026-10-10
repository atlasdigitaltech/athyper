import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { artifactDirectory } from "../artifact-paths.mjs";
import { snapshotCandidate } from "../local-dev/candidate-snapshot.mjs";
import { sourceIdentity } from "../local-dev/evidence.mjs";
import { assess } from "./qualify-entity-foundation.mjs";

const root = resolve(import.meta.dirname, "../../..");
const publication = [
  "src/publication-rollback.test.ts",
  "src/entity-ai-manifest-compiler.test.ts",
  "src/publication-recovery.test.ts",
  "src/__tests__/publication-orchestrator.test.ts",
  "src/__tests__/authorization-activation-hold.test.ts",
];
const host = [
  "src/composition/shared/publication/tenant-rollback.test.ts",
  "src/composition/shared/entity-runtime/deployment-readiness.test.ts",
  "src/composition/shared/entity-runtime/readiness-inventory.test.ts",
  "src/composition/shared/entity-runtime/__tests__/published-parent-admission.test.ts",
  "src/composition/shared/entity-runtime/__tests__/entity-activity-provider.test.ts",
  "src/composition/shared/verification-permissions.test.ts",
  "src/composition/shared/publication/__tests__/table-entity-publication.test.ts",
  "src/composition/shared/publication/__tests__/entity-authorization-activation.test.ts",
];

// Fixed, reviewed commands; no deployed target or caller-supplied executable.
export const checks = [
  {
    id: "assembly-tool",
    binary: "node",
    args: [
      "--test",
      "--test-reporter=tap",
      "tooling/scripts/verification/foundation-publication-qualification.test.mjs",
      "tooling/scripts/local-dev/candidate-snapshot.test.mjs",
    ],
    tap: true,
  },
  {
    id: "publication",
    directory: "server/packages/services/publication",
    files: publication,
  },
  { id: "host", directory: "server/apps/platform-host", files: host },
  {
    id: "readiness-codegen",
    binary: "pnpm",
    args: [
      "--fail-if-no-match",
      "--filter",
      "@athyper/server-db",
      "run",
      "codegen",
    ],
    generated: [
      "server/packages/adapters/database/neon-postgres/src/generated/kysely/types.ts",
      "server/packages/adapters/database/mesh-postgres/src/generated/kysely-mesh/types.ts",
      "server/packages/adapters/database/athyper-postgres/src/generated/kysely-studio/types.ts",
    ],
  },
  {
    id: "readiness-typecheck",
    binary: "pnpm",
    args: [
      "--recursive",
      "--workspace-concurrency=2",
      "--filter",
      "@athyper/server-contract-metadata",
      "--filter",
      "@athyper/server-platform-metadata",
      "--filter",
      "@athyper/server-platform-ai",
      "--filter",
      "@athyper/server-platform-host",
      "--filter",
      "@athyper/server-service-publication",
      "--filter",
      "@athyper/server-plane-studio-meta-entity-authoring",
      "typecheck",
    ],
  },
  {
    id: "readiness-contracts",
    directory: "server/packages/contracts/metadata",
    files: [
      "src/entity-readiness.test.ts",
      "src/entity-support-receipt.test.ts",
      "src/entity-capability-requirements.test.ts",
    ],
  },
  {
    id: "deployment-support",
    directory: "server/packages/platform/metadata",
    files: [
      "src/entity-deployment-support.test.ts",
      "src/entity-readiness-declaration.test.ts",
      "src/entity-readiness-inventory.test.ts",
      "src/entity-readiness-inventory.postgres.test.ts",
    ],
  },
  {
    id: "authoring-readiness",
    directory: "server/packages/planes/studio/meta-entity-authoring",
    files: [
      "src/authoring/country-ai.test.ts",
      "src/authoring/table-product-storage-plane.test.ts",
    ],
  },
  {
    id: "ai-manifest-readiness",
    directory: "server/packages/platform/ai",
    files: ["src/entity-tool-manifest.test.ts"],
  },
  {
    id: "compiler-identity",
    binary: "pnpm",
    args: [
      "exec",
      "tsx",
      "--eval",
      "import { publicationCompilerIdentity } from './server/apps/platform-host/src/composition/shared/publication/compiler-build.ts'; process.stdout.write(JSON.stringify(publicationCompilerIdentity()));",
    ],
    compiler: true,
  },
  {
    id: "migration-layout",
    binary: "node",
    args: ["server/db/scripts/checks/ddl/migration-layout.mjs"],
  },
  {
    id: "rollback-retry",
    binary: "node",
    args: [
      "--test",
      "--test-reporter=tap",
      "server/db/scripts/tests/integration/publication-rollback-retry.test.mjs",
    ],
    tap: true,
  },
  {
    id: "publication-concurrency-recovery",
    binary: "node",
    args: [
      "--test",
      "--test-reporter=tap",
      "server/db/scripts/tests/integration/publication-concurrency-recovery.test.mjs",
    ],
    tap: true,
  },
  {
    id: "principal-link-target-upgrade",
    binary: "node",
    args: [
      "tooling/scripts/verification/qualify-principal-link-target-upgrade.mjs",
    ],
    receipt: "principal-link-target-upgrade",
  },
  {
    id: "principal-source-fresh",
    binary: "pnpm",
    args: [
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-principal-source-foundation.mts",
    ],
    receipt: "principal-source-foundation",
  },
  {
    id: "principal-source-upgrade",
    binary: "pnpm",
    args: [
      "exec",
      "tsx",
      "tooling/scripts/verification/qualify-principal-source-foundation.mts",
      "--upgrade",
    ],
    receipt: "principal-source-foundation",
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });

export function assessTap(result, log) {
  const count = (key) =>
    Number(log.match(new RegExp(`^# ${key} (\\d+)$`, "m"))?.[1] ?? NaN);
  const counts = {
    passed: count("pass"),
    failed: count("fail"),
    skipped: count("skipped"),
    todo: count("todo"),
  };
  return {
    passed:
      result.status === 0 &&
      !result.error &&
      counts.passed > 0 &&
      counts.failed === 0 &&
      counts.skipped === 0 &&
      counts.todo === 0,
    exitCode: result.status,
    counts,
  };
}

export function assemblyPassed(before, after, results) {
  return (
    before.treeSha256 === after.treeSha256 &&
    before.revision === after.revision &&
    checks.every(
      (check) =>
        results.filter((result) => result.id === check.id).length === 1 &&
        results.find((result) => result.id === check.id).passed === true,
    )
  );
}

export function assessCompiler(result, log) {
  let compiler;
  try {
    compiler = JSON.parse(log);
  } catch {
    /* No identity is not a compiler pin. */
  }
  return {
    passed:
      result.status === 0 &&
      !result.error &&
      compiler?.name === "athyper.compiled-entity-artifact" &&
      typeof compiler.version === "string" &&
      compiler.version.length > 0 &&
      /^[a-f0-9]{64}$/.test(compiler.buildHash),
    exitCode: result.status,
    ...(compiler ? { compiler } : {}),
  };
}

async function execute(binary, args, cwd, logPath, env) {
  const startedAt = new Date().toISOString();
  const log = createWriteStream(logPath, { flags: "wx" });
  return new Promise((resolveResult) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600_000,
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let error;
    child.on("error", (failure) => {
      error = String(failure);
    });
    child.on("close", (status, signal) => {
      log.end(() =>
        resolveResult({
          status,
          signal,
          startedAt,
          completedAt: new Date().toISOString(),
          ...(error ? { error } : {}),
        }),
      );
    });
  });
}

export async function main() {
  if (process.argv.length !== 2)
    throw Error(
      "No arguments accepted; output uses ATHYPER_ARTIFACT_ROOT/RUN_ID",
    );
  const output = artifactDirectory("foundation-publication");
  mkdirSync(resolve(output, ".."), { recursive: true });
  mkdirSync(output); // Refuse to overwrite any previous attempt.
  const candidate = join(output, "candidate");
  const startedAt = new Date().toISOString();
  const snapshot = await snapshotCandidate(root, candidate);
  json(join(output, "snapshot.json"), snapshot);
  const before = await sourceIdentity(candidate);
  json(join(output, "source-manifest.json"), before);
  execFileSync("git", [
    "-C",
    candidate,
    "archive",
    "--format=tar.gz",
    `--output=${join(output, "source.tar.gz")}`,
    snapshot.sourceRevision,
  ]);
  const sourceArchiveSha256 = sha256(
    readFileSync(join(output, "source.tar.gz")),
  );
  const env = {
    ...process.env,
    CI: "true",
    ATHYPER_ARTIFACT_ROOT: join(output, "receipts"),
    ATHYPER_ARTIFACT_RUN_ID: "qualification",
  };
  console.log(
    `Pinned candidate ${snapshot.sourceRevision}; evidence: ${output}`,
  );
  const install = await execute(
    "pnpm",
    ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
    candidate,
    join(output, "install.log"),
    env,
  );
  json(join(output, "install.json"), install);
  const results = [];
  for (const check of checks) {
    console.log(`Qualifying ${check.id}…`);
    const logPath = join(output, `${check.id}.log`);
    const reportPath = join(output, `${check.id}.json`);
    const checkEnv = {
      ...env,
      ATHYPER_ARTIFACT_ROOT: join(output, "receipts", check.id),
    };
    const args = check.files
      ? [
          "exec",
          "vitest",
          "run",
          ...check.files,
          "--maxWorkers=2",
          "--reporter=json",
          `--outputFile=${reportPath}`,
        ]
      : check.args;
    const command = {
      binary: check.binary ?? "pnpm",
      args,
      directory: check.directory ?? ".",
    };
    let result;
    try {
      for (const file of check.files ?? [])
        readFileSync(join(candidate, check.directory, file));
      const execution = await execute(
        command.binary,
        args,
        join(candidate, command.directory),
        logPath,
        checkEnv,
      );
      let assessment = {
        passed: execution.status === 0 && !execution.error,
        exitCode: execution.status,
      };
      if (check.files) {
        let report;
        try {
          report = JSON.parse(readFileSync(reportPath, "utf8"));
        } catch {
          /* Missing reports fail closed. */
        }
        assessment = assess(execution, report, check.files);
      } else if (check.tap)
        assessment = assessTap(execution, readFileSync(logPath, "utf8"));
      else if (check.compiler)
        assessment = assessCompiler(execution, readFileSync(logPath, "utf8"));
      else if (check.receipt) {
        const receiptPath = join(
          checkEnv.ATHYPER_ARTIFACT_ROOT,
          check.receipt,
          "qualification",
          "qualification.json",
        );
        const bytes = readFileSync(receiptPath);
        assessment = {
          ...assessment,
          passed: assessment.passed && JSON.parse(bytes).passed === true,
          receiptPath,
          receiptSha256: sha256(bytes),
        };
      }
      result = {
        id: check.id,
        command,
        execution,
        ...assessment,
        logSha256: sha256(readFileSync(logPath)),
        ...(check.files
          ? { reportSha256: sha256(readFileSync(reportPath)) }
          : {}),
        ...(check.generated
          ? {
              generatedArtifacts: check.generated.map((path) => {
                const bytes = readFileSync(join(candidate, path));
                if (!bytes.length)
                  throw Error(`Empty generated artifact: ${path}`);
                return { path, bytes: bytes.length, sha256: sha256(bytes) };
              }),
            }
          : {}),
      };
    } catch (error) {
      result = { id: check.id, command, passed: false, error: String(error) };
    }
    results.push(result);
    json(join(output, `${check.id}-result.json`), result);
    console.log(`${check.id}: ${result.passed ? "PASS" : "FAIL"}`);
  }
  const after = await sourceIdentity(candidate);
  json(join(output, "source-after.json"), after);
  const passed =
    install.status === 0 &&
    !install.error &&
    assemblyPassed(before, after, results);
  const report = {
    schema: "athyper.foundation-publication-qualification/1",
    startedAt,
    completedAt: new Date().toISOString(),
    passed,
    qualification: "source-and-disposable-database-only",
    sourceRevision: snapshot.sourceRevision,
    sourceTreeSha256: before.treeSha256,
    sourceArchiveSha256,
    stable:
      before.treeSha256 === after.treeSha256 &&
      before.revision === after.revision,
    node: process.versions.node,
    install,
    installLogSha256: sha256(readFileSync(join(output, "install.log"))),
    results,
    databaseQualification: {
      check: "publication-concurrency-recovery",
      scope: "canonical-SQL-state-machine-with-stub-projection-owners",
      cases: [
        "concurrent-idempotent-stage-and-activation",
        "competing-pinned-predecessor-successors",
        "partial-plane-recovery-to-verified-heads",
        "rejected-verification-preserves-serving-head",
      ],
    },
    notQualified: [
      "full-owner-authorization",
      "end-to-end-concurrent-authorized-publication-and-activation",
      "partial-plane-recovery-to-authenticated-serving-state",
      "remaining-supported-upgrade-baselines",
      "target-deployment-readback",
      "country-authenticated-serving-journey",
      "D3-independent-authorship-and-attempt-rules",
      "D3-semantic-runtime-acceptance",
      "D5-deployed-readiness",
      "full-release-static-gates",
    ],
  };
  json(join(output, "summary.json"), report);
  console.log(`Evidence: ${join(output, "summary.json")}`);
  return passed ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await main();
