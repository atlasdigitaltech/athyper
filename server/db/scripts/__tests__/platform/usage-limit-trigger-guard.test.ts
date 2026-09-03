import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");

test("usage-limit identity guard branches by trigger table before referencing row fields", async () => {
  const source = await readFile(
    resolve(dbRoot, "ddl/common/control/07_functions.sql"),
    "utf8",
  );
  const guard = source.match(
    /CREATE OR REPLACE FUNCTION control\.trg_guard_usage_limit_identity\(\)[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(guard, "usage-limit identity guard must exist");
  assert.match(
    guard,
    /IF TG_TABLE_NAME = 'subscription_plan_usage_limit' THEN\s+IF NEW\.subscription_plan_id/s,
  );
  assert.match(
    guard,
    /ELSIF TG_TABLE_NAME = 'tenant_usage_limit_override' THEN\s+IF NEW\.tenant_id/s,
  );
  assert.match(
    guard,
    /ELSIF TG_TABLE_NAME = 'usage_metric_catalog' THEN\s+IF NEW\.code/s,
  );
  assert.doesNotMatch(
    guard,
    /TG_TABLE_NAME = 'subscription_plan_usage_limit'\s+AND/s,
  );
});
test("usage-limit trigger fix is installed by every forward-migration manifest", async () => {
  const migrationName = "20260828_usage_limit_trigger_guard.sql";
  const [studio, neon, mesh, migration] = await Promise.all([
    readFile(resolve(dbRoot, "migrations/manifests/studio.txt"), "utf8"),
    readFile(resolve(dbRoot, "migrations/manifests/neon.txt"), "utf8"),
    readFile(resolve(dbRoot, "migrations/manifests/mesh.txt"), "utf8"),
    readFile(resolve(dbRoot, `migrations/${migrationName}`), "utf8"),
  ]);
  for (const manifest of [studio, neon, mesh])
    assert.match(manifest, new RegExp(`^${migrationName}$`, "m"));
  assert.match(
    migration,
    /current_database\(\) NOT IN \('athyper_studio','athyper_neon','athyper_mesh'\)/,
  );
});
