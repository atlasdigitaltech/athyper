import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAuthorizationSeedPack } from "../../scripts/provisioning/apply-authorization-seed-pack.js";
import { registerSeedPack, type QueryClient } from "../../scripts/provisioning/safe-provision.js";

test("seed application joins the supplied transaction and propagates errors without committing it", async () => {
  const calls: string[] = [];
  const failure = new Error("seed query failed");
  const client: QueryClient = {
    async query<Row extends object>(sql: string) {
      calls.push(sql);
      if (sql.includes("current_database()")) return { rows: [{ database: "athyper_neon", plane: "neon" }] as unknown as Row[] };
      if (sql.includes("set_config")) return { rows: [] as Row[] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] as Row[] };
      throw failure;
    },
  };
  await assert.rejects(applyAuthorizationSeedPack({ plane: "neon", transactionClient: client }), error => error === failure);
  assert.ok(calls.some(sql => sql.includes("current_database()")));
  assert.ok(calls.every(sql => !["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)));
});

test("immutable pack hashes match across historical absolute and relocated source paths", async () => {
  const client: QueryClient = {
    async query<Row extends object>(sql: string) {
      const rows = sql.includes("SELECT source_path") ? [{ source_path: "/old/checkout/server/db/seed/packs/catalog.sql", content_sha256: "a".repeat(64), manifest_sha256: "b".repeat(64) }] : [];
      return { rows: rows as unknown as Row[] };
    },
  };
  assert.equal(await registerSeedPack(client, { plane: "neon", packKey: "catalog", packVersion: "v1", sourcePath: "seed/packs/catalog.sql", contentSha256: "a".repeat(64), manifestSha256: "b".repeat(64) }), "matched");
  await assert.rejects(registerSeedPack(client, { plane: "neon", packKey: "catalog", packVersion: "v1", sourcePath: "seed/packs/catalog.sql", contentSha256: "c".repeat(64), manifestSha256: "b".repeat(64) }), /immutable seed pack content drift/);
});
