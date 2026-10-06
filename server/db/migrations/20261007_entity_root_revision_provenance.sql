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
