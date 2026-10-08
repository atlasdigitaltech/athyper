-- Native fields retire field_key; stable catalogue identities own their keys.
-- Preserve product (NULL tenant) and tenant legacy-key uniqueness without making
-- multiple retired NULL keys collide. No rows, grants or cutover checks change.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='metadata.entity_field'::regclass AND conname='entity_field_key_uq'
   AND contype='u' AND convalidated
   AND pg_get_constraintdef(oid)='UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, field_key)')
 THEN RAISE EXCEPTION 'NATIVE_FIELD_KEY_PREDECESSOR_CHANGED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='metadata.entity_field_identity'::regclass AND contype='u' AND convalidated
   AND pg_get_constraintdef(oid)='UNIQUE NULLS NOT DISTINCT (entity_id, tenant_id, parent_identity_id, field_key)')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='metadata.entity_field'::regclass AND tgname='native_snapshot_final_guard'
   AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred
   AND tgfoid='metadata.native_snapshot_final_guard()'::regprocedure)
 THEN RAISE EXCEPTION 'NATIVE_FIELD_KEY_IDENTITY_GUARDS_REQUIRED'; END IF;
END $$;

-- Create the replacement before dropping its predecessor. Failure rolls back
-- the entire migration, including existing-data duplicate identity findings.
CREATE UNIQUE INDEX entity_field_legacy_key_uq ON metadata.entity_field
 (tenant_id,change_set_id,field_key) NULLS NOT DISTINCT WHERE field_key IS NOT NULL;
CREATE UNIQUE INDEX entity_field_draft_identity_uq ON metadata.entity_field
 (change_set_id,field_identity_id) WHERE field_identity_id IS NOT NULL;
ALTER TABLE metadata.entity_field DROP CONSTRAINT entity_field_key_uq;
