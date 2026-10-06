BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Freeze authoring/publication history during the bounded schema preparation.
LOCK TABLE metadata.entity_change_set, metadata.entity_field,
 metadata.entity_runtime_profile, metadata.entity_surface,
 metadata.entity_surface_section, metadata.entity_surface_field_binding,
 metadata.entity_operation, metadata.entity_release, snapshot.entity_contract_revision,
 snapshot.entity_draft_save IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE entity_native_installation_history (
 table_name text PRIMARY KEY, column_names text[] NOT NULL, row_hash text NOT NULL
) ON COMMIT DROP;
DO $$ DECLARE table_name text; old_columns text[]; old_hash text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
 'metadata.entity_change_set','metadata.entity_field','metadata.entity_runtime_profile',
 'metadata.entity_surface','metadata.entity_surface_section','metadata.entity_surface_field_binding',
 'metadata.entity_operation','metadata.entity_release','snapshot.entity_contract_revision','snapshot.entity_draft_save'] LOOP
  SELECT array_agg(attname ORDER BY attnum) INTO old_columns FROM pg_attribute
   WHERE attrelid=table_name::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, %L)) FROM %s t','',table_name) INTO old_hash;
  INSERT INTO pg_temp.entity_native_installation_history VALUES(table_name,old_columns,old_hash);
 END LOOP;
END $$;
-- Correct root patch revision handling only. No canonical
-- conversion, constraint retirement, control initialization, grants or activation.
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN
 RAISE EXCEPTION 'Native authoring preparation requires the Studio database';
END IF; END $$;
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

-- Compare only the exact pre-installation columns; newly added NULL columns
-- cannot change canonical member values, attribution, roots, releases or history.
DO $$ DECLARE captured record; new_hash text;
BEGIN
 FOR captured IN SELECT * FROM pg_temp.entity_native_installation_history ORDER BY table_name LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(p.value ORDER BY p.value::text)::text, %L)) FROM %s t CROSS JOIN LATERAL (SELECT jsonb_object_agg(key,value) AS value FROM jsonb_each(to_jsonb(t)) WHERE key=ANY($1)) p','',captured.table_name)
   INTO new_hash USING captured.column_names;
  IF new_hash IS DISTINCT FROM captured.row_hash THEN
   RAISE EXCEPTION 'ENTITY_NATIVE_PREPARATION_HISTORY_CHANGED: %',captured.table_name;
  END IF;
 END LOOP;
END $$;
COMMIT;
