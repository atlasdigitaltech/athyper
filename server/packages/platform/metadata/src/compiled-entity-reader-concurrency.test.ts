import { expect, it, vi } from "vitest";
import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
} from "@athyper/server-contract-publication";
import { PinnedCompiledEntityReader } from "./compiled-entity-reader.js";
import type { CompiledEntityArtifactReadCoordinate } from "./artifact-resolution.js";

const coordinate = {
  tenantId: "tenant",
  principalId: "admin",
  planeKey: "neon" as const,
  entityCode: "principal",
};
const core = parseCompiledEntityArtifact({
  schema: "athyper.compiled-entity-artifact/2.0-draft",
  schemaVersion: 2,
  contractStatus: "draft_for_review",
  plane: "neon",
  dependencies: [],
  artifactKey: "principal/core",
  artifactType: "core",
  entityCode: "principal",
  artifactHash: `sha256:${"a".repeat(64)}`,
});
const release = parseCompiledEntityReleaseEnvelope({
  schema: "athyper.compiled-entity-release/2.0-draft",
  contractStatus: "unsigned_review_only",
  releaseId: "release",
  releaseNo: 1,
  targetPlanes: ["neon"],
  externalDependencies: [],
  signature: {},
  releaseHash: `sha256:${"b".repeat(64)}`,
  artifacts: [
    {
      artifactKey: core.artifactKey,
      artifactType: core.artifactType,
      entityCode: core.entityCode,
      ref: "principal/core.json",
      hash: core.artifactHash,
    },
  ],
});

it("keeps concurrent release admission and fragment reads bound to each requesting principal", async () => {
  let resume!: () => void;
  const barrier = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const source = {
    findAdmittedRelease: vi.fn(async () => {
      await barrier;
      return release;
    }),
    findArtifact: vi.fn(
      async (_input: CompiledEntityArtifactReadCoordinate) => {
        await barrier;
        return core;
      },
    ),
  };
  const reader = new PinnedCompiledEntityReader({ source });
  const adminPending = reader.resolve(coordinate);
  const financePending = reader.resolve({
    ...coordinate,
    principalId: "finance",
  });
  expect(source.findAdmittedRelease).toHaveBeenCalledTimes(2);
  resume();
  const [admin, finance] = await Promise.all([adminPending, financePending]);
  expect(admin!.coordinate.principalId).toBe("admin");
  expect(finance!.coordinate.principalId).toBe("finance");
  await Promise.all([reader.core(admin!), reader.core(finance!)]);
  expect(source.findArtifact).toHaveBeenCalledTimes(2);
  expect(
    source.findArtifact.mock.calls
      .map(([input]) => input.coordinate.principalId)
      .sort(),
  ).toEqual(["admin", "finance"]);
});

it("does not share an allowed actor's admission with a simultaneous denied actor", async () => {
  let resume!: () => void;
  const barrier = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const reader = new PinnedCompiledEntityReader({
    source: {
      findAdmittedRelease: async (input) => {
        await barrier;
        return input.principalId === "admin" ? release : null;
      },
      findArtifact: async () => core,
    },
  });
  const admin = reader.resolve(coordinate);
  const denied = reader.resolve({ ...coordinate, principalId: "denied" });
  resume();
  expect(await admin).not.toBeNull();
  expect(await denied).toBeNull();
});
