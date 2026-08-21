import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  analyzeDockerPnpmVersions,
  packageManagerVersion,
} from "./verify-docker-toolchain.mjs";

test("extracts a packageManager version without its integrity suffix", () => {
  assert.equal(
    packageManagerVersion('{"packageManager":"pnpm@10.33.0+sha512.example"}'),
    "10.33.0",
  );
});

test("accepts matching Docker and CI pins", () => {
  const result = analyzeDockerPnpmVersions({
    expectedVersion: "10.33.0",
    dockerfileEntries: [
      ["server/Dockerfile.prod", "RUN corepack prepare pnpm@10.33.0 --activate"],
    ],
    workflowText: "env:\n  PNPM_VERSION: '10.33.0'\n",
  });
  assert.deepEqual(result, { mismatches: [], unpinned: [] });
});

test("reports Docker and CI drift", () => {
  const result = analyzeDockerPnpmVersions({
    expectedVersion: "10.33.0",
    dockerfileEntries: [
      ["server/Dockerfile.prod", "RUN corepack prepare pnpm@10.28.2 --activate"],
    ],
    workflowText: "env:\n  PNPM_VERSION: '10.28.2'\n",
  });
  assert.deepEqual(result.mismatches, [
    {
      path: "server/Dockerfile.prod",
      actual: "10.28.2",
      expected: "10.33.0",
    },
    {
      path: ".github/workflows/ci.yml",
      actual: "10.28.2",
      expected: "10.33.0",
    },
  ]);
});

test("rejects pnpm latest", () => {
  const result = analyzeDockerPnpmVersions({
    expectedVersion: "10.33.0",
    dockerfileEntries: [
      ["apps/Dockerfile", "RUN corepack prepare pnpm@latest --activate"],
    ],
    workflowText: "env:\n  PNPM_VERSION: 10.33.0\n",
  });
  assert.deepEqual(result.unpinned, ["apps/Dockerfile"]);
});
