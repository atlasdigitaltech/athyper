import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  analyzeNodePins,
  analyzeDockerPnpmVersions,
  nodeEngineVersion,
  packageManagerVersion,
} from "./verify-docker-toolchain.mjs";

test("extracts a packageManager version without its integrity suffix", () => {
  assert.equal(
    packageManagerVersion('{"packageManager":"pnpm@10.33.0+sha512.example"}'),
    "10.33.0",
  );
});

test("requires an exact Node engine", () => {
  assert.equal(nodeEngineVersion('{"engines":{"node":"24.19.0"}}'), "24.19.0");
  assert.throws(() => nodeEngineVersion('{"engines":{"node":">=24"}}'), /exact version/u);
});

test("accepts exact local, Docker, and workflow Node pins", () => {
  const image = "node:24.19.0-alpine3.23@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const result = analyzeNodePins({
    expectedVersion: "24.19.0",
    expectedImage: image,
    nodeVersionFile: "24.19.0\n",
    dockerfileEntries: [["Dockerfile", `FROM ${image} AS base`]],
    workflowEntries: [[".github/workflows/ci.yml", "env:\n  NODE_VERSION: '24.19.0'\n"]],
  });
  assert.deepEqual(result, { mismatches: [] });
});

test("reports floating Node Docker and workflow pins", () => {
  const result = analyzeNodePins({
    expectedVersion: "24.19.0",
    expectedImage: "node:24.19.0-alpine3.23@sha256:expected",
    nodeVersionFile: "24\n",
    dockerfileEntries: [["Dockerfile", "FROM node:24-alpine AS base"]],
    workflowEntries: [[".github/workflows/ci.yml", "steps:\n  node-version: 24\n"]],
  });
  assert.equal(result.mismatches.length, 3);
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
