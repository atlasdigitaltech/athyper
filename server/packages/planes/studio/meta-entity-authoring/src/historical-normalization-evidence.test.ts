import { expect, it, vi } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  assessEnrollmentHistory,
  inspectHistoricalNormalizationEvidence,
} from "./historical-normalization-evidence.js";
import { sha256 } from "./deterministic.js";
import { Kysely, PostgresDialect } from "kysely";
const source = {
  contractSchema: "athyper.meta-entity-contract/2.2",
  entity: { entityCode: "reference" },
} as MetaEntityGraph;
const row = {
  revision: 1,
  tenantId: null,
  graph: source,
  graphHash: sha256(source),
};
it("verifies exact stored history without claiming conversion or filling gaps", () => {
  expect(assessEnrollmentHistory(source, 1, null, [row])).toEqual({
    snapshotCount: 1,
    currentRevisionCaptured: true,
    integrity: "verified",
    issues: [],
  });
  expect(assessEnrollmentHistory(source, 1, null, [])).toMatchObject({
    integrity: "no-snapshots",
    currentRevisionCaptured: false,
  });
  expect(assessEnrollmentHistory(source, 2, null, [row])).toMatchObject({
    integrity: "verified",
    currentRevisionCaptured: false,
  });
});
it.each([
  [{ ...row, graphHash: "0".repeat(64) }, "ENROLLMENT_HISTORY_HASH_INVALID"],
  [{ ...row, tenantId: "other" }, "ENROLLMENT_HISTORY_SCOPE_INVALID"],
  [{ ...row, revision: 2 }, "ENROLLMENT_HISTORY_REVISION_INVALID"],
  [{ ...row, revision: 0.5 }, "ENROLLMENT_HISTORY_REVISION_INVALID"],
])("rejects corrupt or cross-scope history", (changed, code) => {
  expect(assessEnrollmentHistory(source, 1, null, [changed])).toMatchObject({
    integrity: "failed",
    issues: expect.arrayContaining([code]),
  });
});
it("rejects duplicate revisions and validly rehashed substitutions at the current revision", () => {
  expect(assessEnrollmentHistory(source, 1, null, [row, row]).issues).toContain(
    "ENROLLMENT_HISTORY_REVISION_INVALID",
  );
  const altered = {
    ...source,
    contractSchema: "athyper.meta-entity-contract/2.1",
  } as MetaEntityGraph;
  expect(
    assessEnrollmentHistory(source, 1, null, [
      { ...row, graph: altered, graphHash: sha256(altered) },
    ]).issues,
  ).toEqual(["ENROLLMENT_CURRENT_HISTORY_MISMATCH"]);
});
it("refuses a mutable diagnostic transaction before reading source data", async () => {
  const statements: string[] = [];
  const client = {
    query: vi.fn(async (query: unknown) => {
      const text =
        typeof query === "string" ? query : (query as { text: string }).text;
      statements.push(text);
      return {
        rows: text.includes("transaction_read_only")
          ? [{ read_only: "off", isolation: "repeatable read" }]
          : [],
        rowCount: 0,
      };
    }),
    release: vi.fn(),
  };
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: { connect: async () => client, end: async () => {} } as never,
    }),
  });
  try {
    await expect(
      db
        .transaction()
        .execute((tx) =>
          inspectHistoricalNormalizationEvidence(
            tx,
            "00000000-0000-4000-8000-000000000001",
            { maximumBytes: 10000, maximumHistoryRows: 10 },
          ),
        ),
    ).rejects.toThrow("Read-only enrollment inspection");
    expect(statements.some((s) => s.includes("metadata."))).toBe(false);
  } finally {
    await db.destroy();
  }
});
