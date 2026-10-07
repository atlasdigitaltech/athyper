import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  preparationSql,
  snapshotMigrationName,
  componentCatalogueMigrationName,
  rootMigrationName,
  revisionMigrationName,
  legacyNullabilityMigrationName,
  typedRowMigrationName,
  constraintMigrationName,
  coreRootMigrationName,
} from "./apply-entity-native-resource-preparation.dev.mjs";
const source = readFileSync(
  new URL(
    "../../../server/db/migrations/20261007_entity_native_resource_preparation.sql",
    import.meta.url,
  ),
  "utf8",
);
const digest = createHash("sha256").update(source).digest("hex");
test("core/root guard preparation preserves original rows, pending gates and protected-state scope", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + coreRootMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const statement = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    coreRootMigrationName,
  );
  assert.match(statement, /NATIVE_CORE_ROOT_REQUIRES_PENDING_GUARDS/);
  assert.match(statement, /NATIVE_CORE_ROOT_ORIGINAL_ROWS_CHANGED/);
  assert.match(statement, /NATIVE_CORE_ROOT_GUARD_ALREADY_EXISTS/);
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT|SECURITY DEFINER|requires_mfa|\bGRANT\b/,
  );
  for (const name of [
    "37_native_core_graph_guard.sql",
    "38_native_root_guard.sql",
    "39_reference_predicate_native_types.sql",
  ])
    assert.ok(
      source.includes(
        readFileSync(
          new URL(
            "../../../server/db/ddl/planes/studio/metadata/" + name,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
});
test("constraint compatibility pins predecessor definitions and retains cutover/authority protections", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + constraintMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const statement = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    constraintMigrationName,
  );
  assert.match(statement, /NATIVE_CONSTRAINT_PREDECESSOR_MISMATCH/);
  assert.match(statement, /NATIVE_COMPATIBILITY_REQUIRES_PENDING_GUARDS/);
  assert.match(statement, /NATIVE_COMPATIBILITY_ORIGINAL_ROWS_CHANGED/);
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT \w+_native_pending_ck|SECURITY DEFINER|requires_mfa|\bGRANT\b/,
  );
  for (const file of [
    "35_native_constraint_compatibility.sql",
    "36_native_layout_graph_guard.sql",
  ])
    assert.ok(
      source.includes(
        readFileSync(
          new URL(
            "../../../server/db/ddl/planes/studio/metadata/" + file,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
});
test("typed row preparation preserves pending guards, data and legacy binding requiredness", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + typedRowMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const statement = preparationSql(source, digest, true, typedRowMigrationName);
  assert.match(statement, /NATIVE_ROW_GUARDS_REQUIRE_PENDING_GUARDS/);
  assert.match(statement, /NATIVE_ROW_GUARDS_ORIGINAL_ROWS_CHANGED/);
  assert.match(statement, /SECURITY INVOKER/);
  assert.ok(
    statement.indexOf("ADD CONSTRAINT entity_binding_legacy_required_ck") <
      statement.indexOf("ALTER COLUMN display_config DROP NOT NULL"),
  );
  assert.doesNotMatch(
    statement,
    /DROP CONSTRAINT|SECURITY DEFINER|requires_mfa|\bGRANT\b|\bUPDATE\b|\bDELETE\b/,
  );
  // The applied predecessor is immutable; the forward correction carries the
  // current generated body, which intentionally differs from this historical one.
  assert.equal(
    digest,
    "a56e79e3fc4353b8a704a9bbadd7ca04abe45ec009b8a9119ac87fd0a04a97f3",
  );
});
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

test("snapshot preparation composes real guards without retiring cutover or rewriting history", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + snapshotMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const applied = preparationSql(source, digest, true, snapshotMigrationName);
  assert.equal(
    digest,
    "6c555f7fc63d11b66b90aa58e02c2ff28327c09ba8519e842093646189942eb4",
  );
  assert.match(applied, /NATIVE_SNAPSHOT_PREDECESSOR_UNKNOWN/);
  assert.match(applied, /PERFORM metadata.fn_assert_native_typed_rows/);
  assert.match(applied, /PERFORM metadata.validate_reference_members/);
  assert.match(
    applied,
    /CREATE CONSTRAINT TRIGGER native_snapshot_final_guard/,
  );
  assert.doesNotMatch(applied, /DROP CONSTRAINT|requires_mfa|GRANT /);
  assert.doesNotMatch(applied, /r\."field_keys"|r\."id_field_key"/);
});

test("component catalogue preparation preserves original rows and installs canonical guards", () => {
  const source = readFileSync(
    new URL(
      "../../../server/db/migrations/" + componentCatalogueMigrationName,
      import.meta.url,
    ),
    "utf8",
  );
  const applied = preparationSql(
    source,
    createHash("sha256").update(source).digest("hex"),
    true,
    componentCatalogueMigrationName,
  );
  for (const name of [
    "41_ui_component_catalogue.generated.sql",
    "33_native_typed_row_guards.generated.sql",
  ])
    assert.ok(
      source.includes(
        readFileSync(
          new URL(
            "../../../server/db/ddl/planes/studio/metadata/" + name,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
  assert.match(applied, /UI_COMPONENT_PREDECESSOR_UNKNOWN/);
  assert.match(applied, /ORIGINAL_ROWS_CHANGED/);
  assert.doesNotMatch(applied, /DROP CONSTRAINT|requires_mfa|GRANT /);
});
