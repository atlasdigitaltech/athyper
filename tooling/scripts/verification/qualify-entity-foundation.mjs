import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { artifactDirectory } from "../artifact-paths.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const suites = [
  {
    id: "authoring",
    directory: "server/packages/planes/studio/meta-entity-authoring",
    files: [],
    required: [
      "src/__tests__/configuration-editor-qualification.test.ts",
      "src/__tests__/structural-editor-qualification.test.ts",
      "src/__tests__/intake-presentation.test.ts",
      "src/__tests__/runtime-restoration.test.ts",
      "src/__tests__/execution-binding-storage.test.ts",
      "src/__tests__/product.test.ts",
      "src/__tests__/table-product.test.ts",
      "src/__tests__/system-reference-authoring.test.ts",
      "src/__tests__/amend-successor-localization.test.ts",
      "src/authoring/product-localization.test.ts",
      "src/authoring/principal-localization.test.ts",
      "src/authoring/table-product-permissions.test.ts",
    ],
  },
  {
    id: "records",
    directory: "server/packages/services/records",
    files: [],
    required: [
      "src/mutation-service.test.ts",
      "src/masked-disclosure.test.ts",
      "src/__tests__/record-owner-access.test.ts",
      "src/__tests__/parent-collection-scope.test.ts",
    ],
  },
  {
    id: "publication",
    directory: "server/packages/services/publication",
    files: [],
    required: [
      "src/__tests__/publication-runtime-review.test.ts",
      "src/__tests__/publication-orchestrator.test.ts",
      "src/__tests__/publication-jobs.test.ts",
      "src/__tests__/authorization-activation-hold.test.ts",
    ],
  },
  {
    id: "host",
    directory: "server/apps/platform-host",
    files: [],
    required: [
      "src/composition/shared/verification-permissions.test.ts",
      "src/composition/shared/entity-runtime/published-owner-authorizer.test.ts",
      "src/composition/shared/entity-runtime/entity-export-registrations.test.ts",
      "src/composition/shared/publication/__tests__/table-entity-publication.test.ts",
    ],
  },
];

// An exit code alone cannot prove tests ran. Report skipped cases separately;
// they never count as database, deployment, browser or masking qualification.
export function assess(result, report, required = []) {
  const counts = {
    passed: report?.numPassedTests,
    failed: report?.numFailedTests,
    skipped: report?.numPendingTests,
    todo: report?.numTodoTests,
  };
  const valid = Object.values(counts).every(
    (value) => Number.isInteger(value) && value >= 0,
  );
  const missingOrSkipped = required.filter((path) => {
    const file = report?.testResults?.find((file) =>
      file.name?.replaceAll("\\", "/").endsWith(`/${path}`),
    );
    return (
      file?.status !== "passed" ||
      !file.assertionResults?.length ||
      file.assertionResults.some((test) => test.status !== "passed")
    );
  });
  return {
    passed:
      result.status === 0 &&
      !result.error &&
      valid &&
      counts.passed > 0 &&
      counts.failed === 0 &&
      report.success === true &&
      report.numFailedTestSuites === 0 &&
      missingOrSkipped.length === 0,
    exitCode: result.status,
    counts,
    missingOrSkipped,
    ...(result.error ? { error: String(result.error) } : {}),
  };
}

export function runSuites(selected, execute) {
  if (!selected.length) throw Error("EMPTY_FOUNDATION_QUALIFICATION");
  // Collect every independent result even if an earlier suite fails.
  return selected.map((suite) => {
    try {
      const { result, report } = execute(suite);
      return {
        id: suite.id,
        ...assess(result, report, suite.required ?? suite.files ?? []),
      };
    } catch (error) {
      return { id: suite.id, passed: false, error: String(error) };
    }
  });
}

function snapshot() {
  const git = (args) => execFileSync("git", args, { cwd: root });
  const commit = git(["rev-parse", "HEAD"]).toString().trim();
  const status = git([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).toString();
  const hash = createHash("sha256")
    .update(commit)
    .update(git(["diff", "HEAD", "--binary"]));
  // Include untracked source, not just filenames, so concurrent edits cannot be
  // mistaken for evidence from a frozen commit. Git ignores build/runtime output.
  for (const path of git(["ls-files", "--others", "--exclude-standard", "-z"])
    .toString()
    .split("\0")
    .filter(Boolean)
    .sort())
    hash
      .update(path)
      .update("\0")
      .update(readFileSync(join(root, path)));
  return {
    commit,
    clean: status.length === 0,
    fingerprint: hash.digest("hex"),
  };
}

export function main() {
  const output = artifactDirectory("entity-foundation");
  mkdirSync(output, { recursive: true });
  const before = snapshot();
  const startedAt = new Date().toISOString();
  const results = runSuites(suites, (suite) => {
    console.log(`Qualifying ${suite.id}…`);
    const reportPath = join(output, `${suite.id}.json`);
    rmSync(reportPath, { force: true });
    // Explicit files must exist: a stale Vitest substring filter must not
    // silently select only the remaining tests.
    for (const file of suite.files)
      readFileSync(join(root, suite.directory, file));
    const args = [
      "exec",
      "vitest",
      "run",
      ...suite.files,
      "--maxWorkers=2",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ];
    const log = openSync(join(output, `${suite.id}.log`), "w");
    let result;
    try {
      result = spawnSync("pnpm", args, {
        cwd: join(root, suite.directory),
        stdio: ["ignore", log, log],
        timeout: 300_000,
      });
    } finally {
      closeSync(log);
    }
    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch {
      /* Missing evidence fails assess(). */
    }
    return { result, report };
  });
  const after = snapshot();
  const stable = before.fingerprint === after.fingerprint;
  const passed = stable && results.every((result) => result.passed);
  const report = {
    schemaVersion: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    before,
    after,
    stable,
    passed,
    qualification: "source-tests-only",
    frozenCommit: stable && before.clean && after.clean,
    entities: ["country", "principal"],
    writableDependents: [
      "principal_profile",
      "principal_notification_preference",
    ],
    suites: results,
    notQualified: [
      "live-database-isolation",
      "schema-upgrade",
      "deployed-activation",
      "authenticated-browser-save",
      "masked-only-disclosure",
      "branch-protection",
      "bulk-onboarding",
    ],
  };
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  for (const result of results)
    console.log(
      `${result.id}: ${result.passed ? "PASS" : "FAIL"} ${JSON.stringify(result.counts ?? result.error)}`,
    );
  if (!stable)
    console.error(
      "Source changed during qualification; rerun from a stable checkout.",
    );
  console.log(`Evidence: ${join(output, "summary.json")}`);
  return passed ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = main();
