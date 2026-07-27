import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const LIVE_DATABASE_URL = process.env["COLLAB_INTEGRATION_DATABASE_URL"]
  ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const TENANT_ID = "00000000-0000-0000-0000-000000000000";
const PRINCIPAL_ID = "00000000-0000-0000-0000-000000000000";

let db: Kysely<Record<string, never>> | undefined;

maybeDescribe("enriched comments live database contract", () => {
  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool = (pgModule.default as { Pool?: unknown } | undefined)?.Pool
      ?? (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("The pg package is required for collaboration integration tests");

    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString: LIVE_DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });

    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    await sql`select 1`.execute(db);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it.each([
    ["UUID-shaped", "019f787c-e5c8-738e-bfe6-c0099f86d480"],
    ["human-readable", "INV-A4-0001"],
  ])("executes the enriched count for a %s entity reference", async (_kind, entityId) => {
    if (!db) throw new Error("Integration database is not initialized");

    const result = await sql<{
      total_count: string;
      unread_count: string;
      last_read_at: string | Date | null;
    }>`
      WITH cursor AS (
        SELECT last_read_at
        FROM master.comment_feed_cursor
        WHERE tenant_id = ${TENANT_ID}::uuid
          AND principal_id = ${PRINCIPAL_ID}::uuid
          AND entity_type = 'collab_contract_test'
          AND entity_id = ${entityId}
        LIMIT 1
      )
      SELECT
        COUNT(*) FILTER (WHERE c.parent_comment_id IS NULL)::text AS total_count,
        COUNT(*) FILTER (
          WHERE c.parent_comment_id IS NULL
            AND c.commenter_id <> ${PRINCIPAL_ID}::uuid
            AND ((SELECT last_read_at FROM cursor) IS NULL
              OR c.created_at > (SELECT last_read_at FROM cursor))
        )::text AS unread_count,
        (SELECT last_read_at FROM cursor) AS last_read_at
      FROM master.comment c
      WHERE c.tenant_id = ${TENANT_ID}::uuid
        AND c.entity_type = 'collab_contract_test'
        AND c.entity_id = ${entityId}
        AND c.deleted_at IS NULL
    `.execute(db);

    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0]?.total_count ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(result.rows[0]?.unread_count ?? 0)).toBeGreaterThanOrEqual(0);
  });
});
