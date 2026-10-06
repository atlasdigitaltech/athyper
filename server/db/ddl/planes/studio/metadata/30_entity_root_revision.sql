-- Root patches inside an already advanced graph command retain its revision.
-- Token is a transaction protocol marker, never independent authoring authority.
CREATE OR REPLACE FUNCTION metadata.entity_root_patch_keeps_revision(old_root jsonb,new_root jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT (
  old_root->>'status' IN ('draft','rejected') AND new_root->>'status'=old_root->>'status'
  AND new_root->>'lock_version'=old_root->>'lock_version'
  AND current_setting('app.entity_change_set_write_token',true)=old_root->>'id'||':'||(old_root->>'lock_version')
  AND (old_root-ARRAY['reference_contract_version','native_core_layout_version','authoring_schema_hash','entity_label_id','default_locale','required_locales']::text[])
     =(new_root-ARRAY['reference_contract_version','native_core_layout_version','authoring_schema_hash','entity_label_id','default_locale','required_locales']::text[])
 ) IS TRUE;
$$;
-- Replace only a known canonical guard, preserving the entire installed body
-- (including ancestry, ownership, publication and independent-review checks).
DO $patch$ DECLARE definition_ text; body_hash text;
BEGIN
 SELECT pg_get_functiondef(p.oid),md5(p.prosrc) INTO STRICT definition_,body_hash
 FROM pg_proc p WHERE p.oid='metadata.trg_guard_entity_change_set()'::regprocedure;
 IF body_hash=ANY(ARRAY['959ab23cad1b37dcf7ee2eb95b0114dc','4491056ebce42820988823b74ed07511']::text[]) THEN RETURN; END IF;
 IF NOT body_hash=ANY(ARRAY['0830ef7a7a8f2dc5e339e924c7fc5981','ba3fb5c316d6378f99e2d7343f2ce509']::text[]) THEN
  RAISE EXCEPTION 'ENTITY_ROOT_REVISION_GUARD_UNKNOWN: review installed guard before correction';
 END IF;
 definition_ := replace(definition_, '    NEW.lock_version := OLD.lock_version + 1;', '    IF NOT metadata.entity_root_patch_keeps_revision(to_jsonb(OLD),to_jsonb(NEW)) THEN
        NEW.lock_version := OLD.lock_version + 1;
    END IF;');
 EXECUTE definition_;
END $patch$;
