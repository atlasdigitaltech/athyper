import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  preparationSql,
  rootMigrationName,
  revisionMigrationName,
  legacyNullabilityMigrationName,
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

test("revision correction pins known guard bodies and its own immutable receipt", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + revisionMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const sql = preparationSql(source, digest, true, revisionMigrationName);
  assert.match(sql, /ENTITY_ROOT_REVISION_GUARD_UNKNOWN/);
  assert.match(sql, /entity_root_patch_keeps_revision/);
  assert.match(
    sql,
    /migration_name='20261007_entity_root_revision_protocol.sql'/,
  );
  assert.doesNotMatch(sql, /DROP CONSTRAINT|requires_mfa|GRANT /);
});

test("nullability preparation installs equivalent legacy checks before relaxing physical nullability", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + legacyNullabilityMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const hash = createHash("sha256").update(source).digest("hex");
  const statement = preparationSql(
    source,
    hash,
    true,
    legacyNullabilityMigrationName,
  );
  assert.equal((statement.match(/DROP NOT NULL/g) ?? []).length, 6);
  assert.ok(
    statement.indexOf("ADD CONSTRAINT entity_field_legacy_required_ck") <
      statement.indexOf("ALTER COLUMN field_key DROP NOT NULL"),
  );
  assert.match(
    statement,
    /NATIVE_NULLABILITY_PREPARATION_REQUIRES_PENDING_GUARDS/,
  );
  assert.match(statement, /NATIVE_NULLABILITY_ORIGINAL_ROWS_CHANGED/);
  assert.match(
    statement,
    /migration_name='20261007_entity_native_legacy_nullability_preparation.sql'/,
  );
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT|requires_mfa|\bGRANT\b|\bUPDATE\b|\bDELETE\b/,
  );
});
