import { Kysely, PostgresDialect } from "kysely";
import { expect, it } from "vitest";
import { assertSuccessorTargetHeads } from "./successor-targets.js";
it("accepts only the original head or the exact signed committed release during replay", async () => {
  const pin = {
    plane: "studio",
    environment: "local",
    instance: "dev",
    publicationKey: "metadata.reference.fixture",
    appliedReleaseId: "11111111-1111-4111-8111-111111111111",
    sourceReleaseId: "22222222-2222-4222-8222-222222222222",
    sourceReleaseNo: 1,
    artifactHash: "a".repeat(64),
    headVersion: 1,
  } as const;
  let row = {
    applied_release_id: pin.appliedReleaseId as string,
    source_release_id: pin.sourceReleaseId as string,
    source_release_no: 1,
    artifact_hash: pin.artifactHash,
    row_version: 1,
    valid: true,
  };
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({
          query: async () => ({ rows: [row] }),
          release() {},
        }),
        end: async () => {},
      } as never,
    }),
  });
  const committed = {
    releaseId: "new",
    releaseNo: 2,
    artifactHash: "b".repeat(64),
  };
  try {
    await expect(
      assertSuccessorTargetHeads([pin], { studio: db }, committed),
    ).resolves.toBeUndefined();
    row = {
      ...row,
      applied_release_id: "new-applied",
      source_release_id: "new",
      source_release_no: 2,
      artifact_hash: committed.artifactHash,
      row_version: 2,
    };
    await expect(
      assertSuccessorTargetHeads([pin], { studio: db }, committed),
    ).resolves.toBeUndefined();
    await expect(
      assertSuccessorTargetHeads([pin], { studio: db }),
    ).rejects.toThrow();
    row.artifact_hash = "c".repeat(64);
    await expect(
      assertSuccessorTargetHeads([pin], { studio: db }, committed),
    ).rejects.toThrow();
    row.artifact_hash = committed.artifactHash;
    row.source_release_id = "unrelated";
    await expect(
      assertSuccessorTargetHeads([pin], { studio: db }, committed),
    ).rejects.toThrow();
    row.source_release_id = "new";
    row.valid = false;
    await expect(
      assertSuccessorTargetHeads([pin], { studio: db }, committed),
    ).rejects.toThrow("HEAD_INVALID");
  } finally {
    await db.destroy();
  }
});
