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
-- Install dormant native root columns only. No canonical
-- conversion, constraint retirement, control initialization, grants or activation.
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN
 RAISE EXCEPTION 'Native authoring preparation requires the Studio database';
END IF; END $$;
-- GENERATED dormant native authoring root columns. Not enrollment or cutover.
ALTER TABLE metadata.entity_change_set ADD COLUMN native_core_layout_version integer;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_kind text;
ALTER TABLE metadata.entity_change_set ADD COLUMN schema_version integer;
ALTER TABLE metadata.entity_change_set ADD COLUMN authoring_schema_hash text;
ALTER TABLE metadata.entity_change_set ADD COLUMN entity_label_id uuid;
ALTER TABLE metadata.entity_change_set ADD COLUMN publication_resource_key text;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_uri text;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_hash text;
ALTER TABLE metadata.entity_change_set ADD COLUMN publication_owner text;
ALTER TABLE metadata.entity_change_set ADD COLUMN source_predecessor_release_id uuid;
ALTER TABLE metadata.entity_change_set ADD CONSTRAINT entity_change_set_native_pending_ck CHECK (native_core_layout_version IS NULL AND source_kind IS NULL AND schema_version IS NULL AND authoring_schema_hash IS NULL AND entity_label_id IS NULL AND publication_resource_key IS NULL AND source_uri IS NULL AND source_hash IS NULL AND publication_owner IS NULL AND source_predecessor_release_id IS NULL);

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
