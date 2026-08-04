import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const tenantId = process.argv[2] ?? "11111111-1111-4111-8111-111111111111";
const files = [
  resolve("D:/Products/athyper/server/db/seed/blueprints/universal/990_validation/998_canonical_neon_authority.sql"),
  resolve("D:/Products/athyper/server/db/seed/blueprints/universal/990_validation/999_common_onboarding_assertions.sql"),
];

const db = new Client({
  connectionString:
    process.env.DATABASE_ADMIN_URL ??
    "postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_neon?sslmode=disable",
});

await db.connect();
try {
  await db.query("SELECT set_config('app.database_plane','neon',false)");
  await db.query("SELECT set_config('app.seed_tenant_id', $1, false)", [tenantId]);

  for (const path of files) {
    const sql = await readFile(path, "utf8");
    console.log(`-- executing ${path}`);
    const started = Date.now();
    await db.query(sql);
    const durationMs = Date.now() - started;
    console.log(`ok in ${durationMs}ms`);
  }

  const receipt = await db.query(
    `SELECT status, assertionresults FROM public.seed_pack_execution_v2 LIMIT 0`
  ).catch(() => null);
  console.log("receipt-table-check:", Boolean(receipt));

  console.log("final-validation assertions passed");
} finally {
  await db.end();
}
