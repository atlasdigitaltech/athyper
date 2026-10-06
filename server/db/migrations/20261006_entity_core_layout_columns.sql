BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Freeze authoring/publication history during the bounded schema preparation.
LOCK TABLE metadata.entity_change_set, metadata.entity_field,
 metadata.entity_runtime_profile, metadata.entity_surface,
 metadata.entity_surface_section, metadata.entity_surface_field_binding,
 metadata.entity_release, snapshot.entity_contract_revision,
 snapshot.entity_draft_save IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE entity_native_installation_history (
 table_name text PRIMARY KEY, column_names text[] NOT NULL, row_hash text NOT NULL
) ON COMMIT DROP;
DO $$ DECLARE table_name text; old_columns text[]; old_hash text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
 'metadata.entity_change_set','metadata.entity_field','metadata.entity_runtime_profile',
 'metadata.entity_surface','metadata.entity_surface_section','metadata.entity_surface_field_binding',
 'metadata.entity_release','snapshot.entity_contract_revision','snapshot.entity_draft_save'] LOOP
  SELECT array_agg(attname ORDER BY attnum) INTO old_columns FROM pg_attribute
   WHERE attrelid=table_name::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, %L)) FROM %s t','',table_name) INTO old_hash;
  INSERT INTO pg_temp.entity_native_installation_history VALUES(table_name,old_columns,old_hash);
 END LOOP;
END $$;
-- Generated from the typed core/layout descriptor. Installation is not cutover qualification.
-- No history conversion, grants, protected-state initialization or legacy constraint relaxation.
SET LOCAL lock_timeout='5s';
ALTER TABLE metadata.entity_field ADD COLUMN parent_field_id uuid;
ALTER TABLE metadata.entity_field ADD COLUMN label_id uuid;
ALTER TABLE metadata.entity_field ADD COLUMN storage_type text;
ALTER TABLE metadata.entity_field ADD COLUMN storage_kind text;
ALTER TABLE metadata.entity_field ADD COLUMN nullable boolean;
ALTER TABLE metadata.entity_field ADD COLUMN required boolean;
ALTER TABLE metadata.entity_field ADD COLUMN semantic_role text;
ALTER TABLE metadata.entity_field ADD COLUMN min_length integer;
ALTER TABLE metadata.entity_field ADD COLUMN max_length integer;
ALTER TABLE metadata.entity_field ADD COLUMN minimum numeric;
ALTER TABLE metadata.entity_field ADD COLUMN maximum numeric;
ALTER TABLE metadata.entity_field ADD COLUMN pattern text;
ALTER TABLE metadata.entity_field ADD COLUMN precision integer;
ALTER TABLE metadata.entity_field ADD COLUMN scale integer;
ALTER TABLE metadata.entity_field ADD COLUMN domain_code text;
ALTER TABLE metadata.entity_field ADD COLUMN default_kind text;
ALTER TABLE metadata.entity_field ADD COLUMN default_text text;
ALTER TABLE metadata.entity_field ADD COLUMN default_numeric numeric;
ALTER TABLE metadata.entity_field ADD COLUMN default_boolean boolean;
ALTER TABLE metadata.entity_field ADD COLUMN default_context_key text;
ALTER TABLE metadata.entity_field ADD COLUMN default_context_version integer;
ALTER TABLE metadata.entity_field ADD COLUMN key_generation text;
ALTER TABLE metadata.entity_field ADD COLUMN relation_id uuid;
ALTER TABLE metadata.entity_field ADD COLUMN computed_contract_key text;
ALTER TABLE metadata.entity_field ADD COLUMN computed_contract_version integer;
ALTER TABLE metadata.entity_field ADD COLUMN validation_contract_key text;
ALTER TABLE metadata.entity_field ADD COLUMN validation_contract_version integer;
ALTER TABLE metadata.entity_field ADD COLUMN json_schema_key text;
ALTER TABLE metadata.entity_field ADD COLUMN json_schema_hash text;
ALTER TABLE metadata.entity_field ADD COLUMN replacement_field_id uuid;
ALTER TABLE metadata.entity_field ADD COLUMN minimum_date date;
ALTER TABLE metadata.entity_field ADD COLUMN maximum_date date;
ALTER TABLE metadata.entity_field ADD COLUMN minimum_datetime timestamptz;
ALTER TABLE metadata.entity_field ADD COLUMN maximum_datetime timestamptz;
ALTER TABLE metadata.entity_field ADD COLUMN temporal_kind text;
ALTER TABLE metadata.entity_field ADD COLUMN currency_field_id uuid;
ALTER TABLE metadata.entity_field ADD COLUMN currency_code text;
ALTER TABLE metadata.entity_field ADD COLUMN default_date date;
ALTER TABLE metadata.entity_field ADD COLUMN default_datetime timestamptz;
ALTER TABLE metadata.entity_field ADD COLUMN default_uuid uuid;
ALTER TABLE metadata.entity_field ADD CONSTRAINT entity_field_native_pending_ck CHECK (num_nonnulls(parent_field_id,label_id,storage_type,storage_kind,nullable,required,semantic_role,min_length,max_length,minimum,maximum,pattern,precision,scale,domain_code,default_kind,default_text,default_numeric,default_boolean,default_context_key,default_context_version,key_generation,relation_id,computed_contract_key,computed_contract_version,validation_contract_key,validation_contract_version,json_schema_key,json_schema_hash,replacement_field_id,minimum_date,maximum_date,minimum_datetime,maximum_datetime,temporal_kind,currency_field_id,currency_code,default_date,default_datetime,default_uuid) = 0);
COMMENT ON CONSTRAINT entity_field_native_pending_ck ON metadata.entity_field IS 'Native core/layout values remain unavailable until coordinated history-preserving constraint, writer, compiler and governance cutover qualification.';
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN storage_catalogue_hash text;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN id_field_id uuid;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN tenant_field_id uuid;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN record_version_field_id uuid;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN soft_delete_field_id uuid;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN read_handler_version integer;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN write_handler_version integer;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN reference_capability_key text;
ALTER TABLE metadata.entity_runtime_profile ADD COLUMN reference_capability_version integer;
ALTER TABLE metadata.entity_runtime_profile ADD CONSTRAINT entity_runtime_profile_native_pending_ck CHECK (num_nonnulls(storage_catalogue_hash,id_field_id,tenant_field_id,record_version_field_id,soft_delete_field_id,read_handler_version,write_handler_version,reference_capability_key,reference_capability_version) = 0);
COMMENT ON CONSTRAINT entity_runtime_profile_native_pending_ck ON metadata.entity_runtime_profile IS 'Native core/layout values remain unavailable until coordinated history-preserving constraint, writer, compiler and governance cutover qualification.';
ALTER TABLE metadata.entity_surface ADD COLUMN embedded_mode text;
ALTER TABLE metadata.entity_surface ADD COLUMN label_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN description_label_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN icon_key text;
ALTER TABLE metadata.entity_surface ADD COLUMN identity_field_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN title_field_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN code_field_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN column_count integer;
ALTER TABLE metadata.entity_surface ADD COLUMN search_profile_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN supported_modes text[];
ALTER TABLE metadata.entity_surface ADD COLUMN default_page_size integer;
ALTER TABLE metadata.entity_surface ADD COLUMN allowed_page_sizes integer[];
ALTER TABLE metadata.entity_surface ADD COLUMN max_sort_levels integer;
ALTER TABLE metadata.entity_surface ADD COLUMN count_mode text;
ALTER TABLE metadata.entity_surface ADD COLUMN max_filters integer;
ALTER TABLE metadata.entity_surface ADD COLUMN max_filter_depth integer;
ALTER TABLE metadata.entity_surface ADD COLUMN max_page_size integer;
ALTER TABLE metadata.entity_surface ADD COLUMN empty_title_label_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN empty_description_label_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN component_contract_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN show_group_band boolean;
ALTER TABLE metadata.entity_surface ADD COLUMN reference_key_id uuid;
ALTER TABLE metadata.entity_surface ADD COLUMN reference_format text;
ALTER TABLE metadata.entity_surface ADD COLUMN extension_point_key text;
ALTER TABLE metadata.entity_surface ADD CONSTRAINT entity_surface_native_pending_ck CHECK (num_nonnulls(embedded_mode,label_id,description_label_id,icon_key,identity_field_id,title_field_id,code_field_id,column_count,search_profile_id,supported_modes,default_page_size,allowed_page_sizes,max_sort_levels,count_mode,max_filters,max_filter_depth,max_page_size,empty_title_label_id,empty_description_label_id,component_contract_id,show_group_band,reference_key_id,reference_format,extension_point_key) = 0);
COMMENT ON CONSTRAINT entity_surface_native_pending_ck ON metadata.entity_surface IS 'Native core/layout values remain unavailable until coordinated history-preserving constraint, writer, compiler and governance cutover qualification.';
ALTER TABLE metadata.entity_surface_section ADD COLUMN label_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN content_kind text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN placement text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN icon_key text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN relation_target_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN target_surface_key text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN target_view_key text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN read_operation_key text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN presentation_cardinality text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN empty_title_label_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN empty_description_label_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN empty_creation_mode text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN setup_label_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN create_operation_key text;
ALTER TABLE metadata.entity_surface_section ADD COLUMN edit_label_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN component_contract_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN entity_capability_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN capability_layout_binding_id uuid;
ALTER TABLE metadata.entity_surface_section ADD COLUMN extension_point_key text;
ALTER TABLE metadata.entity_surface_section ADD CONSTRAINT entity_surface_section_native_pending_ck CHECK (num_nonnulls(label_id,content_kind,placement,icon_key,relation_target_id,target_surface_key,target_view_key,read_operation_key,presentation_cardinality,empty_title_label_id,empty_description_label_id,empty_creation_mode,setup_label_id,create_operation_key,edit_label_id,component_contract_id,entity_capability_id,capability_layout_binding_id,extension_point_key) = 0);
COMMENT ON CONSTRAINT entity_surface_section_native_pending_ck ON metadata.entity_surface_section IS 'Native core/layout values remain unavailable until coordinated history-preserving constraint, writer, compiler and governance cutover qualification.';
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN overlay_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN binding_kind text;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN label_override_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN help_label_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN placeholder_label_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN component_display_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN component_input_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN component_filter_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN component_format_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN width integer;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN alignment text;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN filter_operators text[];
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN default_filter_operator text;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN meaningful_for_form boolean;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN reference_surface_key text;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN reference_load_mode text;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN token_key text;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN text_wrap boolean;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN fraction_digits integer;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN date_style text;
ALTER TABLE metadata.entity_surface_field_binding ADD COLUMN empty_text_label_id uuid;
ALTER TABLE metadata.entity_surface_field_binding ADD CONSTRAINT entity_surface_field_binding_native_pending_ck CHECK (num_nonnulls(overlay_id,binding_kind,label_override_id,help_label_id,placeholder_label_id,component_display_id,component_input_id,component_filter_id,component_format_id,width,alignment,filter_operators,default_filter_operator,meaningful_for_form,reference_surface_key,reference_load_mode,token_key,text_wrap,fraction_digits,date_style,empty_text_label_id) = 0);
COMMENT ON CONSTRAINT entity_surface_field_binding_native_pending_ck ON metadata.entity_surface_field_binding IS 'Native core/layout values remain unavailable until coordinated history-preserving constraint, writer, compiler and governance cutover qualification.';
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
