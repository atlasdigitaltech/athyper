import { test } from "node:test";
import assert from "node:assert/strict";
import {
  finalNativeSchemaSql,
  nativePendingTables,
} from "./entity-native-final-schema.mjs";
import { parseArguments } from "./entity-native-build.mjs";
test("final schema rehearsal is explicit and cannot target DEV, QA or injected SQL", () => {
  assert.equal(
    parseArguments(["--mode", "rehearse-schema"]).mode,
    "rehearse-schema",
  );
  for (const db of [
    "athyper_studio",
    "qa",
    "entity_restore_x';DROP SCHEMA metadata;--",
    "entity_restore_",
  ])
    assert.throws(() => finalNativeSchemaSql(db), /RESTORE_TARGET_REQUIRED/);
});
test("final profile retains aggregate integrity and has bounded transactional DDL", () => {
  const sql = finalNativeSchemaSql("entity_restore_" + "a".repeat(32));
  assert.equal(nativePendingTables.length, 7);
  assert.match(sql, /native_snapshot_final_guard/);
  assert.match(sql, /LOCAL_NATIVE_SCHEMA_PARTIAL_PREDECESSOR/);
  assert.match(sql, /lock_timeout='5s'/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(
    sql,
    /DROP (?:TABLE|SCHEMA)|CASCADE|DISABLE|requires_mfa|DELETE FROM/,
  );
});
test("explicit local installation permits only the approved Studio database", () => {
  assert.match(
    finalNativeSchemaSql("athyper_studio", "owner-approved-local-reset"),
    /LOCAL_NATIVE_SCHEMA_TARGET_MISMATCH/,
  );
  for (const db of ["athyper_neon", "qa", "entity_restore_" + "a".repeat(32)])
    assert.throws(() => finalNativeSchemaSql(db, "owner-approved-local-reset"));
  assert.throws(() => finalNativeSchemaSql("athyper_studio", "unknown"));
});
