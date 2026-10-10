BEGIN;
SET LOCAL lock_timeout='5s';
-- Fresh proposal IDs/parentage/timestamps must survive canonical readback.
-- Existing INSERT policies and identity_guard still require admitted draft scope,
-- current actor, reserved state and the graph transaction's revision token.
-- No UPDATE/DELETE, identity adoption or publication lifecycle grant is added.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_field_identity'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='metadata.entity_field_identity'::regclass AND polname='reference_command_identity_insert' AND polcmd='a' AND polpermissive)
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='metadata.entity_field_identity'::regclass AND polname='reference_command_identity_insert_fence' AND polcmd='a' AND NOT polpermissive)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='metadata.entity_field_identity'::regclass AND tgname='identity_guard' AND tgenabled='O')
 THEN RAISE EXCEPTION 'NATIVE_FRESH_IDENTITY_PRIVILEGE_PREREQUISITE'; END IF;
END $$;
GRANT INSERT(id,parent_identity_id,created_at) ON metadata.entity_field_identity TO athyper_product_command_app;
COMMIT;
