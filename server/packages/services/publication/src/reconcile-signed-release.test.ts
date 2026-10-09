import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { reconcileSignedRelease } from "./reconcile-signed-release.js";

it("publishes a complete signed set once and rejects missing scope or approval", async () => {
  let row: { actor_id: string; status: string; complete: boolean } | undefined =
    {
      actor_id: "actor",
      status: "approved",
      complete: false,
    };
  const transitions: unknown[][] = [];
  const query = vi.fn(async (text: string, values: unknown[]) => {
    if (text.includes("AS complete")) return { rows: row ? [row] : [] };
    if (text.includes("fn_transition_release")) {
      transitions.push(values);
      row!.status = "published";
      return {
        rows: [
          {
            id: "release",
            tenant_id: "tenant",
            release_key: "metadata.fixture",
            release_no: 1,
            release_kind: "publish",
            status: "published",
            compatibility_level: "compatible",
            release_hash: "a".repeat(64),
            manifest_hash: "b".repeat(64),
            created_by: "actor",
            created_at: new Date().toISOString(),
            metadata: {},
          },
        ],
      };
    }
    return { rows: [] };
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  try {
    expect(await reconcileSignedRelease(db, "release")).toBe(false);
    expect(transitions).toHaveLength(0);
    row.complete = true;
    expect(await reconcileSignedRelease(db, "release")).toBe(true);
    expect(await reconcileSignedRelease(db, "release")).toBe(true);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.slice(0, 3)).toEqual([
      "release",
      "published",
      "actor",
    ]);
    row.status = "withdrawn";
    await expect(reconcileSignedRelease(db, "release")).rejects.toThrow(
      "APPROVAL_REQUIRED",
    );
    row = undefined;
    await expect(reconcileSignedRelease(db, "release")).rejects.toThrow(
      "SCOPE_REQUIRED",
    );
  } finally {
    await db.destroy();
  }
});
