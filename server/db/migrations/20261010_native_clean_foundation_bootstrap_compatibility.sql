BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- This bridge is for the current empty Studio foundation only.  Historic
-- upgrades retain their own pinned guard transitions and must not use it.
DO $$
DECLARE
  guard_hash text;
  guard_definition text;
  pending_definition text;
BEGIN
  IF current_database() <> 'athyper_studio' THEN
    RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_STUDIO_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM metadata.entity_change_set)
    OR EXISTS (SELECT 1 FROM metadata.entity_release)
    OR EXISTS (SELECT 1 FROM snapshot.entity_draft_save)
  THEN
    RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_ENTITY_HISTORY_PRESENT';
  END IF;
  SELECT md5(p.prosrc), pg_get_functiondef(p.oid)
    INTO STRICT guard_hash, guard_definition
    FROM pg_proc p
   WHERE p.oid = 'metadata.trg_guard_entity_change_set()'::regprocedure;
  IF guard_hash <> 'fa13eaf4d79ae015aba82e607a1c47e2'
     OR position('metadata.entity_root_patch_keeps_revision(to_jsonb(OLD),to_jsonb(NEW))' IN guard_definition) = 0
  THEN
    RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_ROOT_GUARD_UNKNOWN';
  END IF;
  IF to_regprocedure('metadata.entity_root_patch_keeps_revision(jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_HELPER_ALREADY_PRESENT';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO STRICT pending_definition
    FROM pg_constraint
   WHERE conrelid = 'metadata.entity_change_set'::regclass
     AND conname = 'entity_change_set_native_pending_ck'
     AND convalidated;
  IF pending_definition <> 'CHECK (((native_core_layout_version IS NULL) AND (source_kind IS NULL) AND (schema_version IS NULL) AND (authoring_schema_hash IS NULL) AND (entity_label_id IS NULL) AND (publication_resource_key IS NULL) AND (source_uri IS NULL) AND (source_hash IS NULL) AND (publication_owner IS NULL) AND (source_predecessor_release_id IS NULL)))' THEN
    RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_PENDING_GUARD_UNKNOWN';
  END IF;
END $$;
-- Match the maintained provenance protocol used by the product-command
-- initialization.  The existing canonical root trigger already invokes it.
CREATE FUNCTION metadata.entity_root_patch_keeps_revision(old_root jsonb,new_root jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT (
  old_root->>'status' IN ('draft','rejected') AND new_root->>'status'=old_root->>'status'
  AND new_root->>'lock_version'=old_root->>'lock_version'
  AND current_setting('app.entity_change_set_write_token',true)=old_root->>'id'||':'||(old_root->>'lock_version')
  AND EXISTS (
   SELECT 1 FROM metadata.entity_change_set cs
   WHERE cs.id=(old_root->>'id')::uuid
    AND cs.lock_version=(old_root->>'lock_version')::bigint
    AND CASE WHEN cs.updated_at=transaction_timestamp() THEN
     pg_xact_status((cs.xmin::text::numeric
       + floor(pg_current_xact_id_if_assigned()::text::numeric/4294967296)*4294967296
       + CASE WHEN cs.xmin::text::numeric-mod(pg_current_xact_id_if_assigned()::text::numeric,4294967296)< -2147483648
         THEN 4294967296
         WHEN cs.xmin::text::numeric-mod(pg_current_xact_id_if_assigned()::text::numeric,4294967296)>2147483648
         THEN -4294967296 ELSE 0 END)::text::xid8)='in progress'
     ELSE false END
    AND (old_root->>'updated_at')::timestamptz=transaction_timestamp()
    AND cs.updated_at=transaction_timestamp()
  )
  AND (old_root-ARRAY['reference_contract_version','native_core_layout_version','authoring_schema_hash','entity_label_id','default_locale','required_locales']::text[])
     =(new_root-ARRAY['reference_contract_version','native_core_layout_version','authoring_schema_hash','entity_label_id','default_locale','required_locales']::text[])
 ) IS TRUE;
$$;
DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='metadata.entity_root_patch_keeps_revision(jsonb,jsonb)'::regprocedure) <> 'efcad6f58610f611419eea284dfededc' THEN
    RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_PROTOCOL_HELPER_DRIFT';
  END IF;
END $$;
COMMIT;
