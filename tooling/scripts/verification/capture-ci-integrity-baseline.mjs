import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Read-only GitHub inventory. Persist structured metadata and log fingerprints,
// never raw logs (which can contain credentials or application data).
export function captureBaseline(repository, request) {
  const runs = request(
    `repos/${repository}/actions/workflows/ci.yml/runs?branch=main&per_page=10`,
  );
  const observations = (runs.value?.workflow_runs ?? []).map((run) => {
    const jobs = request(
      `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`,
    );
    const artifacts = request(
      `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`,
    );
    return {
      id: run.id,
      commit: run.head_sha,
      url: run.html_url,
      createdAt: run.created_at,
      conclusion: run.conclusion,
      jobsStatus: jobs.status,
      jobs: (jobs.value?.jobs ?? []).map((job) => {
        const log = request(
          `repos/${repository}/actions/jobs/${job.id}/logs`,
          true,
        );
        return {
          id: job.id,
          name: job.name,
          conclusion: job.conclusion,
          steps: (job.steps ?? []).map(({ name, conclusion }) => ({
            name,
            conclusion,
          })),
          log: {
            status: log.status,
            ...(log.status === "available"
              ? {
                  sha256: createHash("sha256").update(log.value).digest("hex"),
                  bytes: Buffer.byteLength(log.value),
                  noProjectMatch: /No projects matched/.test(log.value),
                  placeholder:
                    /(?:Build|Test) placeholder|placeholder.*(?:build|test)|(?:Build|Test) step . configure for your runtime/i.test(
                      log.value,
                    ),
                }
              : { reason: log.reason }),
          },
        };
      }),
      artifactsStatus: artifacts.status,
      artifacts: (artifacts.value?.artifacts ?? []).map(
        ({ name, size_in_bytes, expired }) => ({
          name,
          size_in_bytes,
          expired,
        }),
      ),
    };
  });
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    repository,
    branch: "main",
    requestedRuns: 10,
    runsStatus: runs.status,
    ...(runs.reason ? { runsError: runs.reason } : {}),
    availableRuns: observations.length,
    observations,
    branchSummary: request(`repos/${repository}/branches/main`),
    branchProtection: request(`repos/${repository}/branches/main/protection`),
    applicableRules: request(`repos/${repository}/rules/branches/main`),
    rulesets: request(`repos/${repository}/rulesets?includes_parents=true`),
    qualification:
      "observation-only; successful historical jobs do not qualify the working tree",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const output = resolve(
    process.argv[2] ?? "governance/policy/reports/ci-integrity-baseline.json",
  );
  const report = captureBaseline(
    "atlasdigitaltech/athyper",
    (endpoint, raw = false) => {
      const result = spawnSync("gh", ["api", endpoint], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
      if (result.error || result.status !== 0)
        return {
          status: "unavailable",
          reason: result.error?.message ?? result.stderr.trim(),
        };
      return {
        status: "available",
        value: raw ? result.stdout : JSON.parse(result.stdout),
      };
    },
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Captured ${report.availableRuns} runs in ${output}`);
  if (report.runsStatus !== "available") process.exitCode = 1;
}
