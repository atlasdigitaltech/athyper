-- A caller-set GUC alone is not evidence of a preceding graph revision update.
-- Invoker visibility and the existing root update/audit triggers remain intact.
DO $$ DECLARE body_hash text;
BEGIN
 SELECT md5(prosrc) INTO STRICT body_hash FROM pg_proc
 WHERE oid='metadata.entity_root_patch_keeps_revision(jsonb,jsonb)'::regprocedure;
 IF NOT body_hash=ANY(ARRAY['81564ba98b352f8050d5779d546e2441','efcad6f58610f611419eea284dfededc']::text[]) THEN
  RAISE EXCEPTION 'ENTITY_ROOT_REVISION_HELPER_UNKNOWN: review installed protocol helper';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION metadata.entity_root_patch_keeps_revision(old_root jsonb,new_root jsonb)
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
