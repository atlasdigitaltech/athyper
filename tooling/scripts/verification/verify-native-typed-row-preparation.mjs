/** Rollback-only DEV constraint/component probe; no enrollment or authority. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { typedRowMigrationName } from "./apply-entity-native-resource-preparation.dev.mjs";
const output = process.argv[2];
assert.ok(
  output && process.argv.length === 3,
  "Provide the evidence output path",
);
const source = readFileSync(
  new URL(
    "../../../server/db/migrations/" + typedRowMigrationName,
    import.meta.url,
  ),
);
const digest = createHash("sha256").update(source).digest("hex");
const statement = `BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${typedRowMigrationName}' AND sha256='${digest}' AND status='applied') THEN RAISE EXCEPTION 'EXACT_APPLIED_ROW_GUARD_MIGRATION_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='metadata.fn_assert_native_typed_rows(uuid,integer)'::regprocedure AND prosecdef) THEN RAISE EXCEPTION 'INVOKER_REQUIRED'; END IF;
END $$;
CREATE TEMP TABLE binding_probe (LIKE metadata.entity_surface_field_binding INCLUDING ALL) ON COMMIT DROP;
INSERT INTO binding_probe SELECT * FROM metadata.entity_surface_field_binding WHERE binding_kind IS NULL LIMIT 1;
DO $$ DECLARE violated text; draft uuid; BEGIN
 IF (SELECT count(*) FROM binding_probe)<>1 THEN RAISE EXCEPTION 'LEGACY_BINDING_FIXTURE_REQUIRED'; END IF;
 BEGIN
  UPDATE binding_probe SET display_config=NULL;
  RAISE EXCEPTION 'EXPECTED_LEGACY_NULL_REJECTION';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS violated=CONSTRAINT_NAME;
  IF violated<>'entity_binding_legacy_required_ck' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE binding_probe SET binding_kind='attribute';
  RAISE EXCEPTION 'EXPECTED_NATIVE_PENDING_REJECTION';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS violated=CONSTRAINT_NAME;
  IF violated<>'entity_surface_field_binding_native_pending_ck' THEN RAISE; END IF;
 END;
 SELECT id INTO STRICT draft FROM metadata.entity_change_set WHERE native_core_layout_version IS NULL ORDER BY id LIMIT 1;
 BEGIN
  PERFORM metadata.fn_assert_native_typed_rows(draft,2);
  RAISE EXCEPTION 'EXPECTED_LEGACY_MARKER_REJECTION';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'NATIVE_TYPED_VERSION_MISMATCH' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM metadata.fn_assert_native_typed_rows(draft,3);
  RAISE EXCEPTION 'EXPECTED_VERSION_REJECTION';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'NATIVE_TYPED_VERSION_UNSUPPORTED' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;`;
const result = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_studio",
  ],
  { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
assert.ok(result.trim().endsWith("ROLLBACK"));
const report = {
  schema: "entity.native-typed-row-preparation-probe/1",
  inspectedAt: new Date().toISOString(),
  database: "athyper_studio",
  migration: typedRowMigrationName,
  sha256: digest,
  positiveLegacyBinding: 1,
  negativeConstraintProbes: 2,
  negativeNativeAdmissionProbes: 2,
  rolledBack: true,
  qualification: "not-established",
  productionEnabled: false,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
