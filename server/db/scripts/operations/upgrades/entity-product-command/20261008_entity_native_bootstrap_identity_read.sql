BEGIN;
SET LOCAL lock_timeout='5s';
-- Fresh-root compiler resolution precedes root INSERT. The existing admitted-
-- draft policy cannot expose installed identities until that root exists.
-- Extend only the identity SELECT policies to the existing transaction-bound
-- creation ticket. No allocation, adoption, retirement or mutation authority.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_field_identity'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='metadata.entity_field_identity'::regclass AND polname='reference_command_read' AND polcmd='r' AND polpermissive)
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='metadata.entity_field_identity'::regclass AND polname='reference_command_read_fence' AND polcmd='r' AND NOT polpermissive)
 THEN RAISE EXCEPTION 'NATIVE_IDENTITY_READ_PREREQUISITE'; END IF;
END $$;
ALTER POLICY reference_command_read ON metadata.entity_field_identity USING(tenant_id IS NULL AND (
 EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity_field_identity.entity_id AND c.tenant_id IS NULL AND entity_command_private.admitted(c.id))
 OR entity_command_private.admitted_creation_entity(entity_id)));
ALTER POLICY reference_command_read_fence ON metadata.entity_field_identity USING(tenant_id IS NULL AND (
 EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity_field_identity.entity_id AND c.tenant_id IS NULL AND entity_command_private.admitted(c.id))
 OR entity_command_private.admitted_creation_entity(entity_id)));
COMMIT;
