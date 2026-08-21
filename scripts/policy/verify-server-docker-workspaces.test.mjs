import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { analyzeServerDockerWorkspaceCopies } from "./verify-server-docker-workspaces.mjs";

const dockerfilePath = resolve("server", "Dockerfile.prod");
const atlasManifest =
  "packages/shared/runtime-domain/atlas-agent-runtime/package.json";

test("detects a deliberately omitted pruner workspace source", () => {
  const dockerfileText = readFileSync(dockerfilePath, "utf8");
  const withoutWorkspaceSource = dockerfileText.replace(
    /^COPY \. \.$/m,
    "COPY package.json ./",
  );

  const analysis = analyzeServerDockerWorkspaceCopies({
    dockerfileText: withoutWorkspaceSource,
    requiredManifestPaths: [atlasManifest],
  });

  assert.deepEqual(analysis.missing, [atlasManifest]);
});

test("accepts a required manifest supplied through the pruner workspace source", () => {
  const dockerfileText = readFileSync(dockerfilePath, "utf8");
  const analysis = analyzeServerDockerWorkspaceCopies({
    dockerfileText,
    requiredManifestPaths: [atlasManifest],
  });

  assert.deepEqual(analysis.missing, []);
});

test("does not let a post-install source copy hide a missing manifest", () => {
  const dockerfileText = [
    "FROM node:24-alpine",
    "RUN pnpm install --frozen-lockfile",
    "COPY packages/shared/ ./packages/shared/",
  ].join("\n");
  const analysis = analyzeServerDockerWorkspaceCopies({
    dockerfileText,
    requiredManifestPaths: [atlasManifest],
  });

  assert.deepEqual(analysis.missing, [atlasManifest]);
});

test("reports a pre-install manifest COPY whose source no longer exists", () => {
  const staleManifest = "packages/shared/removed/package.json";
  const dockerfileText = [
    "FROM node:24-alpine",
    `COPY ${staleManifest} ./packages/shared/removed/`,
    "RUN pnpm install --frozen-lockfile",
  ].join("\n");
  const analysis = analyzeServerDockerWorkspaceCopies({
    dockerfileText,
    requiredManifestPaths: [],
    sourceExists: () => false,
  });

  assert.deepEqual(analysis.stale, [staleManifest]);
});
