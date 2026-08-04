import { randomUUID } from "node:crypto";

import { createRedisClient } from "@athyper/adapter-memory-cache";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { executeDurableMutationTransaction } from "@athyper/svc-shared";

const enabled = process.env.RUN_META_ENTITY_INTEGRATION === "1";
const integrationDescribe = enabled ? describe : describe.skip;

integrationDescribe("meta-entity PostgreSQL/Redis foundation", () => {
  it("rolls the business row back when a required durable effect fails", async () => {
    const connectionString = required("META_ENTITY_INTEGRATION_DATABASE_URL");
    const pool = new Pool({ connectionString, max: 1 });
    const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
    const table = `meta_entity_rollback_${randomUUID().replaceAll("-", "")}`;

    try {
      await sql.raw(`create temporary table ${table} (id uuid primary key)`).execute(db);
      await expect(executeDurableMutationTransaction(db, async (trx) => {
        await sql.raw(`insert into ${table} (id) values ('${randomUUID()}')`).execute(trx);
        throw new Error("required outbox insert failed");
      })).rejects.toThrow("required outbox insert failed");
      const result = await sql<{ count: string }>`select count(*)::text as count from ${sql.table(table)}`.execute(db);
      expect(result.rows[0]?.count).toBe("0");
    } finally {
      await db.destroy();
    }
  });

  it("increments only the exact Redis generation and survives reconnect", async () => {
    const url = new URL(required("META_ENTITY_INTEGRATION_REDIS_URL"));
    const redis = createRedisClient({
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
      db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    });
    const prefix = `integration:${randomUUID()}`;
    const selected = `${prefix}:execdesc:gen:v1:neon:tenant-a:supplier`;
    const neighbor = `${prefix}:execdesc:gen:v1:neon:tenant-b:supplier`;

    try {
      await redis.connect();
      await redis.mset(selected, "1", neighbor, "9");
      expect(await redis.incr(selected)).toBe(2);
      expect(await redis.get(neighbor)).toBe("9");
      redis.disconnect();
      await redis.connect();
      expect(await redis.get(selected)).toBe("2");
    } finally {
      await redis.del(selected, neighbor).catch(() => undefined);
      redis.disconnect();
    }
  });

  it.runIf(Boolean(process.env.META_ENTITY_RLS_TABLE))("keeps tenant B rows outside tenant A RLS scope", async () => {
    const table = required("META_ENTITY_RLS_TABLE");
    if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(table)) throw new Error("META_ENTITY_RLS_TABLE is not a safe identifier");
    const pool = new Pool({ connectionString: required("META_ENTITY_INTEGRATION_DATABASE_URL"), max: 1 });
    const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
    try {
      const rows = await db.transaction().execute(async (trx) => {
        await sql`select set_config('app.current_tenant_id', ${required("META_ENTITY_RLS_TENANT_A")}, true)`.execute(trx);
        return sql<{ tenant_id: string }>`select tenant_id::text as tenant_id from ${sql.table(table)} limit 100`.execute(trx);
      });
      expect(rows.rows.every((row) => row.tenant_id === process.env.META_ENTITY_RLS_TENANT_A)).toBe(true);
      expect(rows.rows.some((row) => row.tenant_id === process.env.META_ENTITY_RLS_TENANT_B)).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when RUN_META_ENTITY_INTEGRATION=1`);
  return value;
}
