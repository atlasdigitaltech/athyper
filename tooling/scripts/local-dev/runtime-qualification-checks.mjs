import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";

// Run entire suites. Required files are discovery sentinels, never Vitest filters.
export const runtimeQualificationSuites = Object.freeze([
  {
    name: "runtime-authority",
    packageName: "@athyper/server-platform-host",
    directory: "server/apps/platform-host",
    required: [
      "src/development/runtime-publication.test.ts",
      "src/development/publication.test.ts",
      "src/composition/shared/entity-runtime/__tests__/service-composition.test.ts",
      "src/composition/__tests__/entity-read-registrations.test.ts",
      "src/composition/__tests__/entity-runtime-handler-registry.test.ts",
      "src/composition/__tests__/publication-qualification.test.ts",
      "src/composition/shared/entity-governance/persistence.test.ts",
      "src/composition/shared/entity-governance/authorization-management.test.ts",
      "src/composition/shared/publication/targets.test.ts",
      "src/composition/shared/identity/plane-admission.test.ts",
      "src/kernel/__tests__/capability-registration.test.ts",
      "src/composition/infrastructure/__tests__/runtime-ownership.test.ts",
    ],
  },
  {
    name: "entity-records",
    packageName: "@athyper/server-service-records",
    directory: "server/packages/services/records",
    required: [
      "src/__tests__/parent-collection-scope.test.ts",
      "src/__tests__/collection-scope-sql.test.ts",
      "src/transfer/transfer-runtime-review.test.ts",
      "src/transfer/export-preflight.test.ts",
    ],
  },
  {
    name: "entity-experience",
    packageName: "@athyper/server-platform-experience",
    directory: "server/packages/platform/experience",
    required: [
      "src/entity-operation-dispatcher.test.ts",
      "src/entity-operation-admission.test.ts",
      "src/entity-intake-operation-routes.test.ts",
    ],
  },
  { name: "job-runtime", packageName: "@athyper/server-runtime-jobs", directory: "server/packages/runtime/jobs", required: ["src/__tests__/bullmq-job-runtime.test.ts", "src/__tests__/job-cancellation.test.ts"] },
  { name: "job-scheduling", packageName: "@athyper/server-runtime-scheduling", directory: "server/packages/runtime/scheduling", required: ["src/__tests__/bullmq-job-scheduler.test.ts", "src/__tests__/schedule-owner-registry.test.ts"] },
]);

export function assertQualificationDiscovery(root, suite, discovered) {
  if (
    !Array.isArray(discovered) ||
    discovered.length === 0 ||
    discovered.some((item) => typeof item?.file !== "string")
  )
    throw new Error(
      `Qualification discovery is empty or invalid: ${suite.name}`,
    );
  const files = new Set(discovered.map((item) => resolve(root, item.file)));
  for (const path of suite.required)
    if (!files.has(resolve(root, suite.directory, path)))
      throw new Error(
        `Qualification test not discovered: ${suite.directory}/${path}`,
      );
  return {
    name: suite.name,
    packageName: suite.packageName,
    files: [...files].map((file) => relative(root, file)).sort(),
  };
}

export function discoverRuntimeQualificationTests(root) {
  return runtimeQualificationSuites.map((suite) => {
    const output = execFileSync(
      "pnpm",
      [
        "--filter",
        suite.packageName,
        "exec",
        "vitest",
        "list",
        "--filesOnly",
        "--json",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return assertQualificationDiscovery(root, suite, JSON.parse(output));
  });
}
