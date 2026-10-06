import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  preparationSql,
  rootMigrationName,
} from "./apply-entity-native-resource-preparation.dev.mjs";
const source = readFileSync(
  new URL(
    "../../../server/db/migrations/20261007_entity_native_resource_preparation.sql",
    import.meta.url,
  ),
  "utf8",
);
const digest = createHash("sha256").update(source).digest("hex");
test("keeps dollar-quoted guards intact and records the ledger inside the application transaction", () => {
  const sql = preparationSql(source, digest, true);
  assert.match(sql, /DO \$\$ BEGIN IF EXISTS/);
  assert.ok(
    sql.indexOf("pg_advisory_xact_lock") <
      sql.indexOf("CREATE TABLE metadata.entity_ai_profile"),
  );
  assert.ok(
    sql.indexOf("-- Compare only the exact pre-installation") <
      sql.indexOf("INSERT INTO public.athyper_schema_migration_v1"),
  );
  assert.ok(sql.endsWith("COMMIT;\n"));
  assert.equal((sql.match(/BEGIN;/g) ?? []).length, 1);
  assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);
});
test("rehearsal rolls back without writing an applied ledger receipt", () => {
  const sql = preparationSql(source, digest, false);
  assert.ok(sql.endsWith("ROLLBACK;\n"));
  assert.doesNotMatch(sql, /INSERT INTO public.athyper_schema_migration_v1/);
});
test("rejects changed bytes before producing application SQL", () => {
  assert.throws(() => preparationSql(source + "\n", digest, true));
});

test("root preparation pins its own ledger identity and rejects unknown migrations", () => {
  const rootSource = readFileSync(
    new URL(
      "../../../server/db/migrations/" + rootMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const rootDigest = createHash("sha256").update(rootSource).digest("hex");
  const sql = preparationSql(rootSource, rootDigest, true, rootMigrationName);
  assert.match(sql, /ADD COLUMN native_core_layout_version integer/);
  assert.match(sql, /entity_change_set_native_pending_ck/);
  assert.match(
    sql,
    /migration_name='20261007_entity_native_root_preparation.sql'/,
  );
  assert.doesNotMatch(
    sql,
    /migration_name='20261007_entity_native_resource_preparation.sql'/,
  );
  assert.throws(() =>
    preparationSql(rootSource, rootDigest, true, "unregistered.sql"),
  );
});
