/** Final local native integrity profile, exercised only on a restored database by
 * the preparation harness. This does not authorize DEV reset or draft writes. */
export const nativePendingTables = Object.freeze([
  "entity_change_set",
  "entity_field",
  "entity_operation",
  "entity_runtime_profile",
  "entity_surface",
  "entity_surface_field_binding",
  "entity_surface_section",
]);
const guards = [
  "fn_assert_native_authoring_snapshot(uuid,text,integer)",
  "fn_assert_native_typed_rows(uuid,integer)",
  "fn_assert_native_core_graph(uuid)",
  "fn_assert_native_layout_graph(uuid)",
  "fn_assert_native_root(uuid,text,integer)",
  "validate_reference_members(uuid)",
];
export function finalNativeSchemaSql(restoredDatabase) {
  if (!/^entity_restore_[a-f0-9]{30,32}$/.test(restoredDatabase))
    throw Error("LOCAL_NATIVE_SCHEMA_RESTORE_TARGET_REQUIRED");
  const names = nativePendingTables.map((n) => `'${n}'`).join(",");
  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $profile$
DECLARE member text; present integer;
BEGIN
 IF current_database()<>'${restoredDatabase}' THEN RAISE EXCEPTION 'LOCAL_NATIVE_SCHEMA_TARGET_MISMATCH'; END IF;
 ${guards.map((g) => `IF to_regprocedure('metadata.${g}') IS NULL THEN RAISE EXCEPTION 'LOCAL_NATIVE_SCHEMA_GUARD_MISSING:${g}'; END IF;`).join("\n")}
 FOREACH member IN ARRAY ARRAY[${names}] LOOP
  EXECUTE format('LOCK TABLE metadata.%I IN ACCESS EXCLUSIVE MODE',member);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('metadata.'||member) AND relrowsecurity AND relforcerowsecurity)
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('metadata.'||member)
    AND tgname='native_snapshot_final_guard' AND tgenabled='O' AND tgdeferrable AND tginitdeferred
    AND tgfoid='metadata.native_snapshot_final_guard()'::regprocedure)
  THEN RAISE EXCEPTION 'LOCAL_NATIVE_SCHEMA_FINAL_GUARD_REQUIRED:%',member; END IF;
 END LOOP;
 SELECT count(*) INTO present FROM pg_constraint WHERE conrelid IN
  (SELECT to_regclass('metadata.'||n) FROM unnest(ARRAY[${names}]) n)
  AND conname=split_part(conrelid::regclass::text,'.',2)||'_native_pending_ck' AND convalidated;
 -- Either untouched predecessor or replay of this final profile. Partial removal rejects.
 IF present NOT IN (0,7) THEN RAISE EXCEPTION 'LOCAL_NATIVE_SCHEMA_PARTIAL_PREDECESSOR'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_change_set WHERE native_core_layout_version IS NOT NULL)
 THEN RAISE EXCEPTION 'LOCAL_NATIVE_SCHEMA_ALREADY_ENROLLED'; END IF;
 IF present=7 THEN
  FOREACH member IN ARRAY ARRAY[${names}] LOOP
   EXECUTE format('ALTER TABLE metadata.%I DROP CONSTRAINT %I',member,member||'_native_pending_ck');
  END LOOP;
 END IF;
END $profile$;
COMMIT;`;
}
