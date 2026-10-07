BEGIN;
CREATE TEMP TABLE native_nullability_original_rows(schema_name text,table_name text,row_hash text) ON COMMIT DROP;
DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('metadata','snapshot') AND c.relkind='r' ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.nspname,r.relname) INTO h;
  INSERT INTO native_nullability_original_rows VALUES(r.nspname,r.relname,h);
 END LOOP;
END $$;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('metadata.entity_change_set'::regclass,'metadata.entity_field'::regclass,'metadata.entity_runtime_profile'::regclass,'metadata.entity_surface'::regclass,'metadata.entity_surface_section'::regclass,'metadata.entity_surface_field_binding'::regclass,'metadata.entity_operation'::regclass) AND conname LIKE '%\_native_pending_ck' ESCAPE '\' AND convalidated) <> 7 THEN
  RAISE EXCEPTION 'NATIVE_CORE_ROOT_REQUIRES_PENDING_GUARDS';
 END IF;
END $$;
DO $$ BEGIN IF to_regprocedure('metadata.fn_assert_native_authoring_snapshot(uuid,text,integer)') IS NOT NULL OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='metadata.fn_assert_native_typed_rows(uuid,integer)'::regprocedure) IS DISTINCT FROM '6478d6cebc4b24df9f51e59a621f7892' THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_PREDECESSOR_UNKNOWN'; END IF; END $$;
-- GENERATED from the normalized core/layout/operation contracts.
-- Structural component only. Pending cutover guards remain in force.
CREATE OR REPLACE FUNCTION metadata.fn_assert_native_typed_rows(change_set uuid, expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $native_rows$
DECLARE root metadata.entity_change_set%ROWTYPE;
BEGIN
  IF expected_version IS NULL OR expected_version NOT IN (1,2) THEN RAISE EXCEPTION 'NATIVE_TYPED_VERSION_UNSUPPORTED' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=change_set FOR SHARE;
  IF root.native_core_layout_version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'NATIVE_TYPED_VERSION_MISMATCH' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_field" r WHERE r.change_set_id=root.id AND NOT (
    (r.entity_id IS NOT DISTINCT FROM root.entity_id) IS TRUE AND
    (r.tenant_id IS NOT DISTINCT FROM root.tenant_id) IS TRUE AND
    ((r."field_identity_id" IS NOT NULL AND (r."field_identity_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE) IS TRUE AND
    ((r."field_identity_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field_identity" target WHERE target.id=r."field_identity_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND (target.identity_status='active' OR (target.identity_status='reserved' AND target.introduced_change_set_id=root.id))))) IS TRUE AND
    (((r."parent_field_id" IS NOT NULL AND (r."parent_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."parent_field_id" IS NULL)) IS TRUE AND
    ((r."parent_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."parent_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."label_id" IS NOT NULL AND (r."label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."label_id" IS NULL)) IS TRUE AND
    ((r."label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."description" IS NOT NULL AND (length(r."description"::text)<=2000)) IS TRUE OR r."description" IS NULL)) IS TRUE AND
    (((r."data_type"::text = 'string') IS TRUE OR (r."data_type"::text = 'text') IS TRUE OR (r."data_type"::text = 'integer') IS TRUE OR (r."data_type"::text = 'bigint') IS TRUE OR (r."data_type"::text = 'decimal') IS TRUE OR (r."data_type"::text = 'boolean') IS TRUE OR (r."data_type"::text = 'uuid') IS TRUE OR (r."data_type"::text = 'date') IS TRUE OR (r."data_type"::text = 'datetime') IS TRUE OR (r."data_type"::text = 'json') IS TRUE OR (r."data_type"::text = 'enum') IS TRUE OR (r."data_type"::text = 'money') IS TRUE)) IS TRUE AND
    (((r."storage_type" IS NOT NULL AND (length(r."storage_type"::text)<=4000)) IS TRUE OR r."storage_type" IS NULL)) IS TRUE AND
    (((r."cardinality"::text = 'one') IS TRUE OR (r."cardinality"::text = 'many') IS TRUE)) IS TRUE AND
    (((r."value_origin"::text = 'stored') IS TRUE OR (r."value_origin"::text = 'computed') IS TRUE OR (r."value_origin"::text = 'projected') IS TRUE OR (r."value_origin"::text = 'runtime') IS TRUE)) IS TRUE AND
    ((((r."storage_kind"::text = 'column') IS TRUE OR (r."storage_kind"::text = 'extension') IS TRUE) OR r."storage_kind" IS NULL)) IS TRUE AND
    (((r."storage_path" IS NOT NULL AND (r."storage_path"::text ~ '^[A-Za-z_][A-Za-z0-9_.]{0,126}$')) IS TRUE OR r."storage_path" IS NULL)) IS TRUE AND
    (r."nullable" IS NOT NULL) IS TRUE AND
    (r."required" IS NOT NULL) IS TRUE AND
    (((r."write_mode"::text = 'read_only') IS TRUE OR (r."write_mode"::text = 'mutable') IS TRUE OR (r."write_mode"::text = 'write_once') IS TRUE)) IS TRUE AND
    ((r."data_classification" IS NOT NULL AND (r."data_classification"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE) IS TRUE AND
    (((r."retention_policy_code" IS NOT NULL AND (r."retention_policy_code"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."retention_policy_code" IS NULL)) IS TRUE AND
    (((r."semantic_role" IS NOT NULL AND (r."semantic_role"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."semantic_role" IS NULL)) IS TRUE AND
    (((r."min_length" IS NOT NULL AND (r."min_length" BETWEEN 0 AND 2147483647)) IS TRUE OR r."min_length" IS NULL)) IS TRUE AND
    (((r."max_length" IS NOT NULL AND (r."max_length" BETWEEN 0 AND 2147483647)) IS TRUE OR r."max_length" IS NULL)) IS TRUE AND
    (((r."minimum" IS NOT NULL AND (length(r."minimum"::text)<=4096 AND r."minimum"::text ~ '^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$')) IS TRUE OR r."minimum" IS NULL)) IS TRUE AND
    (((r."maximum" IS NOT NULL AND (length(r."maximum"::text)<=4096 AND r."maximum"::text ~ '^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$')) IS TRUE OR r."maximum" IS NULL)) IS TRUE AND
    (((r."pattern" IS NOT NULL AND (length(r."pattern"::text)<=4000)) IS TRUE OR r."pattern" IS NULL)) IS TRUE AND
    (((r."precision" IS NOT NULL AND (r."precision" BETWEEN 1 AND 1000)) IS TRUE OR r."precision" IS NULL)) IS TRUE AND
    (((r."scale" IS NOT NULL AND (r."scale" BETWEEN 0 AND 1000)) IS TRUE OR r."scale" IS NULL)) IS TRUE AND
    (((r."domain_code" IS NOT NULL AND (r."domain_code"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."domain_code" IS NULL)) IS TRUE AND
    (((r."default_kind"::text = 'none') IS TRUE OR (r."default_kind"::text = 'literal_null') IS TRUE OR (r."default_kind"::text = 'literal') IS TRUE OR (r."default_kind"::text = 'context') IS TRUE OR (r."default_kind"::text = 'database') IS TRUE)) IS TRUE AND
    (((r."default_text" IS NOT NULL AND (length(r."default_text"::text)<=4000)) IS TRUE OR r."default_text" IS NULL)) IS TRUE AND
    (((r."default_numeric" IS NOT NULL AND (length(r."default_numeric"::text)<=4096 AND r."default_numeric"::text ~ '^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$')) IS TRUE OR r."default_numeric" IS NULL)) IS TRUE AND
    ((r."default_boolean" IS NOT NULL OR r."default_boolean" IS NULL)) IS TRUE AND
    (((r."default_context_key" IS NOT NULL AND (r."default_context_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."default_context_key" IS NULL)) IS TRUE AND
    (((r."default_context_version" IS NOT NULL AND (r."default_context_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."default_context_version" IS NULL)) IS TRUE AND
    (((r."key_generation"::text = 'none') IS TRUE OR (r."key_generation"::text = 'database_uuidv7') IS TRUE OR (r."key_generation"::text = 'provided') IS TRUE)) IS TRUE AND
    (((r."relation_id" IS NOT NULL AND (r."relation_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."relation_id" IS NULL)) IS TRUE AND
    ((r."relation_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_relation" target WHERE target.id=r."relation_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."computed_contract_key" IS NOT NULL AND (r."computed_contract_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."computed_contract_key" IS NULL)) IS TRUE AND
    (((r."computed_contract_version" IS NOT NULL AND (r."computed_contract_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."computed_contract_version" IS NULL)) IS TRUE AND
    (((r."validation_contract_key" IS NOT NULL AND (r."validation_contract_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."validation_contract_key" IS NULL)) IS TRUE AND
    (((r."validation_contract_version" IS NOT NULL AND (r."validation_contract_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."validation_contract_version" IS NULL)) IS TRUE AND
    (((r."json_schema_key" IS NOT NULL AND (r."json_schema_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."json_schema_key" IS NULL)) IS TRUE AND
    (((r."json_schema_hash" IS NOT NULL AND (r."json_schema_hash"::text ~ '^[0-9a-f]{64}$')) IS TRUE OR r."json_schema_hash" IS NULL)) IS TRUE AND
    (((r."replacement_field_id" IS NOT NULL AND (r."replacement_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."replacement_field_id" IS NULL)) IS TRUE AND
    ((r."replacement_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."replacement_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."minimum_date" IS NOT NULL AND (to_char(r."minimum_date",'YYYY-MM-DD') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) IS TRUE OR r."minimum_date" IS NULL)) IS TRUE AND
    (((r."maximum_date" IS NOT NULL AND (to_char(r."maximum_date",'YYYY-MM-DD') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) IS TRUE OR r."maximum_date" IS NULL)) IS TRUE AND
    (((r."minimum_datetime" IS NOT NULL AND (to_char(r."minimum_datetime" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$')) IS TRUE OR r."minimum_datetime" IS NULL)) IS TRUE AND
    (((r."maximum_datetime" IS NOT NULL AND (to_char(r."maximum_datetime" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$')) IS TRUE OR r."maximum_datetime" IS NULL)) IS TRUE AND
    ((((r."temporal_kind"::text = 'date') IS TRUE OR (r."temporal_kind"::text = 'instant') IS TRUE) OR r."temporal_kind" IS NULL)) IS TRUE AND
    (((r."currency_field_id" IS NOT NULL AND (r."currency_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."currency_field_id" IS NULL)) IS TRUE AND
    ((r."currency_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."currency_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."currency_code" IS NOT NULL AND (length(r."currency_code"::text)>=1 AND length(r."currency_code"::text)<=64 AND r."currency_code"::text ~ '\S')) IS TRUE OR r."currency_code" IS NULL)) IS TRUE AND
    (((r."default_date" IS NOT NULL AND (to_char(r."default_date",'YYYY-MM-DD') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) IS TRUE OR r."default_date" IS NULL)) IS TRUE AND
    (((r."default_datetime" IS NOT NULL AND (to_char(r."default_datetime" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$')) IS TRUE OR r."default_datetime" IS NULL)) IS TRUE AND
    (((r."default_uuid" IS NOT NULL AND (r."default_uuid"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."default_uuid" IS NULL)) IS TRUE AND
    (r."field_key" IS NULL) IS TRUE AND
    (r."type_config" IS NULL) IS TRUE AND
    (r."default_spec" IS NULL) IS TRUE AND
    (r."computation_spec" IS NULL) IS TRUE AND
    (r."validation_spec" IS NULL) IS TRUE
  )) THEN RAISE EXCEPTION 'NATIVE_TYPED_ROW_INVALID:entity_field' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_runtime_profile" r WHERE r.change_set_id=root.id AND NOT (
    (r.entity_id IS NOT DISTINCT FROM root.entity_id) IS TRUE AND
    (r.tenant_id IS NOT DISTINCT FROM root.tenant_id) IS TRUE AND
    ((r."profile_key"::text = 'default') IS TRUE) IS TRUE AND
    (((r."backing_kind"::text = 'table') IS TRUE OR (r."backing_kind"::text = 'view') IS TRUE OR (r."backing_kind"::text = 'materialized_view') IS TRUE OR (r."backing_kind"::text = 'external') IS TRUE OR (r."backing_kind"::text = 'virtual') IS TRUE)) IS TRUE AND
    ((((r."storage_plane"::text = 'studio') IS TRUE OR (r."storage_plane"::text = 'neon') IS TRUE OR (r."storage_plane"::text = 'mesh') IS TRUE) OR r."storage_plane" IS NULL)) IS TRUE AND
    (((r."storage_schema" IS NOT NULL AND (r."storage_schema"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."storage_schema" IS NULL)) IS TRUE AND
    (((r."storage_object" IS NOT NULL AND (r."storage_object"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."storage_object" IS NULL)) IS TRUE AND
    (((r."storage_catalogue_hash" IS NOT NULL AND (r."storage_catalogue_hash"::text ~ '^[0-9a-f]{64}$')) IS TRUE OR r."storage_catalogue_hash" IS NULL)) IS TRUE AND
    (((r."read_mode"::text = 'none') IS TRUE OR (r."read_mode"::text = 'generic') IS TRUE OR (r."read_mode"::text = 'facade') IS TRUE OR (r."read_mode"::text = 'projection') IS TRUE)) IS TRUE AND
    (((r."write_mode"::text = 'none') IS TRUE OR (r."write_mode"::text = 'generic') IS TRUE OR (r."write_mode"::text = 'facade') IS TRUE OR (r."write_mode"::text = 'append_only') IS TRUE)) IS TRUE AND
    (((r."api_exposure"::text = 'none') IS TRUE OR (r."api_exposure"::text = 'catalog_only') IS TRUE OR (r."api_exposure"::text = 'api') IS TRUE)) IS TRUE AND
    (((r."create_mode"::text = 'form_only') IS TRUE OR (r."create_mode"::text = 'early_draft') IS TRUE OR (r."create_mode"::text = 'direct') IS TRUE OR (r."create_mode"::text = 'source_document') IS TRUE)) IS TRUE AND
    (((r."draft_ttl_hours" IS NOT NULL AND (r."draft_ttl_hours" BETWEEN 1 AND 8760)) IS TRUE OR r."draft_ttl_hours" IS NULL)) IS TRUE AND
    (((r."concurrency_mode"::text = 'none') IS TRUE OR (r."concurrency_mode"::text = 'optimistic') IS TRUE OR (r."concurrency_mode"::text = 'append_only') IS TRUE)) IS TRUE AND
    ((r."id_field_id" IS NOT NULL AND (r."id_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE) IS TRUE AND
    ((r."id_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."id_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."tenant_field_id" IS NOT NULL AND (r."tenant_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."tenant_field_id" IS NULL)) IS TRUE AND
    ((r."tenant_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."tenant_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."record_version_field_id" IS NOT NULL AND (r."record_version_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."record_version_field_id" IS NULL)) IS TRUE AND
    ((r."record_version_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."record_version_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."soft_delete_field_id" IS NOT NULL AND (r."soft_delete_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."soft_delete_field_id" IS NULL)) IS TRUE AND
    ((r."soft_delete_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."soft_delete_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."read_handler_key" IS NOT NULL AND (r."read_handler_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."read_handler_key" IS NULL)) IS TRUE AND
    (((r."read_handler_version" IS NOT NULL AND (r."read_handler_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."read_handler_version" IS NULL)) IS TRUE AND
    (((r."write_handler_key" IS NOT NULL AND (r."write_handler_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."write_handler_key" IS NULL)) IS TRUE AND
    (((r."write_handler_version" IS NOT NULL AND (r."write_handler_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."write_handler_version" IS NULL)) IS TRUE AND
    (((r."reference_capability_key" IS NOT NULL AND (r."reference_capability_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."reference_capability_key" IS NULL)) IS TRUE AND
    (((r."reference_capability_version" IS NOT NULL AND (r."reference_capability_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."reference_capability_version" IS NULL)) IS TRUE AND
    (r."tenant_field_key" IS NULL) IS TRUE AND
    (r."record_version_field_key" IS NULL) IS TRUE AND
    (r."soft_delete_field_key" IS NULL) IS TRUE
  )) THEN RAISE EXCEPTION 'NATIVE_TYPED_ROW_INVALID:entity_runtime_profile' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface" r WHERE r.change_set_id=root.id AND r."component_contract_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:ui_component_contract' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface" r WHERE r.change_set_id=root.id AND NOT (
    (r.entity_id IS NOT DISTINCT FROM root.entity_id) IS TRUE AND
    (r.tenant_id IS NOT DISTINCT FROM root.tenant_id) IS TRUE AND
    ((r."surface_key" IS NOT NULL AND (r."surface_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE) IS TRUE AND
    (((r."surface_kind"::text = 'list') IS TRUE OR (r."surface_kind"::text = 'detail') IS TRUE OR (r."surface_kind"::text = 'form') IS TRUE OR (r."surface_kind"::text = 'embedded') IS TRUE OR (r."surface_kind"::text = 'lookup') IS TRUE)) IS TRUE AND
    ((((r."embedded_mode"::text = 'sectioned') IS TRUE OR (r."embedded_mode"::text = 'collection') IS TRUE) OR r."embedded_mode" IS NULL)) IS TRUE AND
    (((r."label_id" IS NOT NULL AND (r."label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."label_id" IS NULL)) IS TRUE AND
    ((r."label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."description_label_id" IS NOT NULL AND (r."description_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."description_label_id" IS NULL)) IS TRUE AND
    ((r."description_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."description_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."layout_kind"::text = 'flow') IS TRUE OR (r."layout_kind"::text = 'grid') IS TRUE OR (r."layout_kind"::text = 'stack') IS TRUE)) IS TRUE AND
    (r."is_default" IS NOT NULL) IS TRUE AND
    (((r."icon_key" IS NOT NULL AND (r."icon_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."icon_key" IS NULL)) IS TRUE AND
    (((r."identity_field_id" IS NOT NULL AND (r."identity_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."identity_field_id" IS NULL)) IS TRUE AND
    ((r."identity_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."identity_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."title_field_id" IS NOT NULL AND (r."title_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."title_field_id" IS NULL)) IS TRUE AND
    ((r."title_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."title_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."code_field_id" IS NOT NULL AND (r."code_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."code_field_id" IS NULL)) IS TRUE AND
    ((r."code_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."code_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."column_count" IS NOT NULL AND (r."column_count" BETWEEN 1 AND 12)) IS TRUE OR r."column_count" IS NULL)) IS TRUE AND
    (((r."search_profile_id" IS NOT NULL AND (r."search_profile_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."search_profile_id" IS NULL)) IS TRUE AND
    ((r."search_profile_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_search_profile" target WHERE target.id=r."search_profile_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."supported_modes" IS NOT NULL AND (coalesce(array_ndims(r."supported_modes"),1)=1 AND coalesce(array_lower(r."supported_modes",1),1)=1 AND NOT EXISTS (SELECT 1 FROM unnest(r."supported_modes") AS native_item_0(value) WHERE NOT (((native_item_0.value::text = 'table') IS TRUE OR (native_item_0.value::text = 'compact') IS TRUE))))) IS TRUE OR r."supported_modes" IS NULL)) IS TRUE AND
    (((r."default_page_size" IS NOT NULL AND (r."default_page_size" BETWEEN 1 AND 2147483647)) IS TRUE OR r."default_page_size" IS NULL)) IS TRUE AND
    (((r."allowed_page_sizes" IS NOT NULL AND (coalesce(array_ndims(r."allowed_page_sizes"),1)=1 AND coalesce(array_lower(r."allowed_page_sizes",1),1)=1 AND NOT EXISTS (SELECT 1 FROM unnest(r."allowed_page_sizes") AS native_item_0(value) WHERE NOT ((native_item_0.value IS NOT NULL AND (native_item_0.value BETWEEN 1 AND 2147483647)) IS TRUE)))) IS TRUE OR r."allowed_page_sizes" IS NULL)) IS TRUE AND
    (((r."max_sort_levels" IS NOT NULL AND (r."max_sort_levels" BETWEEN 1 AND 32)) IS TRUE OR r."max_sort_levels" IS NULL)) IS TRUE AND
    ((((r."count_mode"::text = 'exact') IS TRUE OR (r."count_mode"::text = 'estimated') IS TRUE OR (r."count_mode"::text = 'none') IS TRUE) OR r."count_mode" IS NULL)) IS TRUE AND
    (((r."max_filters" IS NOT NULL AND (r."max_filters" BETWEEN 1 AND 1000)) IS TRUE OR r."max_filters" IS NULL)) IS TRUE AND
    (((r."max_filter_depth" IS NOT NULL AND (r."max_filter_depth" BETWEEN 1 AND 32)) IS TRUE OR r."max_filter_depth" IS NULL)) IS TRUE AND
    (((r."max_page_size" IS NOT NULL AND (r."max_page_size" BETWEEN 1 AND 2147483647)) IS TRUE OR r."max_page_size" IS NULL)) IS TRUE AND
    (((r."empty_title_label_id" IS NOT NULL AND (r."empty_title_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."empty_title_label_id" IS NULL)) IS TRUE AND
    ((r."empty_title_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."empty_title_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."empty_description_label_id" IS NOT NULL AND (r."empty_description_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."empty_description_label_id" IS NULL)) IS TRUE AND
    ((r."empty_description_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."empty_description_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."component_contract_id" IS NOT NULL AND (r."component_contract_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."component_contract_id" IS NULL)) IS TRUE AND
    ((r."show_group_band" IS NOT NULL OR r."show_group_band" IS NULL)) IS TRUE AND
    (((r."reference_key_id" IS NOT NULL AND (r."reference_key_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."reference_key_id" IS NULL)) IS TRUE AND
    ((r."reference_key_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_key" target WHERE target.id=r."reference_key_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."reference_format" IS NOT NULL AND (length(r."reference_format"::text)<=4000)) IS TRUE OR r."reference_format" IS NULL)) IS TRUE AND
    (((r."extension_point_key" IS NOT NULL AND (r."extension_point_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."extension_point_key" IS NULL)) IS TRUE AND
    (r."title" IS NULL) IS TRUE AND
    (r."description" IS NULL) IS TRUE AND
    (r."layout_config" IS NULL) IS TRUE
  )) THEN RAISE EXCEPTION 'NATIVE_TYPED_ROW_INVALID:entity_surface' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_section" r WHERE r.change_set_id=root.id AND r."component_contract_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:ui_component_contract' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_section" r WHERE r.change_set_id=root.id AND r."capability_layout_binding_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:entity_capability_binding' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_section" r WHERE r.change_set_id=root.id AND NOT (
    (r.entity_id IS NOT DISTINCT FROM root.entity_id) IS TRUE AND
    (r.tenant_id IS NOT DISTINCT FROM root.tenant_id) IS TRUE AND
    ((r."entity_surface_id" IS NOT NULL AND (r."entity_surface_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE) IS TRUE AND
    ((r."entity_surface_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_surface" target WHERE target.id=r."entity_surface_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."navigation_group_id" IS NOT NULL AND (r."navigation_group_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."navigation_group_id" IS NULL)) IS TRUE AND
    ((r."navigation_group_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_surface_navigation_group" target WHERE target.id=r."navigation_group_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."parent_section_id" IS NOT NULL AND (r."parent_section_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."parent_section_id" IS NULL)) IS TRUE AND
    ((r."parent_section_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_surface_section" target WHERE target.id=r."parent_section_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    ((r."section_key" IS NOT NULL AND (r."section_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE) IS TRUE AND
    (((r."label_id" IS NOT NULL AND (r."label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."label_id" IS NULL)) IS TRUE AND
    ((r."label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."section_kind"::text = 'section') IS TRUE OR (r."section_kind"::text = 'subsection') IS TRUE OR (r."section_kind"::text = 'fieldset') IS TRUE OR (r."section_kind"::text = 'columns') IS TRUE)) IS TRUE AND
    (((r."content_kind"::text = 'fields') IS TRUE OR (r."content_kind"::text = 'related_list') IS TRUE OR (r."content_kind"::text = 'component') IS TRUE OR (r."content_kind"::text = 'capability') IS TRUE)) IS TRUE AND
    ((r."position" IS NOT NULL AND (r."position" BETWEEN 1 AND 32767)) IS TRUE) IS TRUE AND
    ((r."column_count" IS NOT NULL AND (r."column_count" BETWEEN 1 AND 12)) IS TRUE) IS TRUE AND
    (r."collapsible" IS NOT NULL) IS TRUE AND
    (r."collapsed_by_default" IS NOT NULL) IS TRUE AND
    (((r."placement"::text = 'direct') IS TRUE OR (r."placement"::text = 'overflow') IS TRUE)) IS TRUE AND
    (((r."icon_key" IS NOT NULL AND (r."icon_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."icon_key" IS NULL)) IS TRUE AND
    (((r."relation_target_id" IS NOT NULL AND (r."relation_target_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."relation_target_id" IS NULL)) IS TRUE AND
    ((r."relation_target_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_relation_target" target WHERE target.id=r."relation_target_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."target_surface_key" IS NOT NULL AND (r."target_surface_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."target_surface_key" IS NULL)) IS TRUE AND
    (((r."target_view_key" IS NOT NULL AND (r."target_view_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."target_view_key" IS NULL)) IS TRUE AND
    (((r."read_operation_key" IS NOT NULL AND (r."read_operation_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."read_operation_key" IS NULL)) IS TRUE AND
    ((((r."presentation_cardinality"::text = 'one') IS TRUE OR (r."presentation_cardinality"::text = 'zero_or_one') IS TRUE OR (r."presentation_cardinality"::text = 'many') IS TRUE) OR r."presentation_cardinality" IS NULL)) IS TRUE AND
    (((r."empty_title_label_id" IS NOT NULL AND (r."empty_title_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."empty_title_label_id" IS NULL)) IS TRUE AND
    ((r."empty_title_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."empty_title_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."empty_description_label_id" IS NOT NULL AND (r."empty_description_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."empty_description_label_id" IS NULL)) IS TRUE AND
    ((r."empty_description_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."empty_description_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    ((((r."empty_creation_mode"::text = 'unavailable') IS TRUE OR (r."empty_creation_mode"::text = 'setup_operation') IS TRUE) OR r."empty_creation_mode" IS NULL)) IS TRUE AND
    (((r."setup_label_id" IS NOT NULL AND (r."setup_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."setup_label_id" IS NULL)) IS TRUE AND
    ((r."setup_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."setup_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."create_operation_key" IS NOT NULL AND (r."create_operation_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."create_operation_key" IS NULL)) IS TRUE AND
    (((r."edit_label_id" IS NOT NULL AND (r."edit_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."edit_label_id" IS NULL)) IS TRUE AND
    ((r."edit_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."edit_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."component_contract_id" IS NOT NULL AND (r."component_contract_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."component_contract_id" IS NULL)) IS TRUE AND
    (((r."entity_capability_id" IS NOT NULL AND (r."entity_capability_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."entity_capability_id" IS NULL)) IS TRUE AND
    ((r."entity_capability_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_capability" target WHERE target.id=r."entity_capability_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."capability_layout_binding_id" IS NOT NULL AND (r."capability_layout_binding_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."capability_layout_binding_id" IS NULL)) IS TRUE AND
    (((r."extension_point_key" IS NOT NULL AND (r."extension_point_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."extension_point_key" IS NULL)) IS TRUE AND
    (r."title" IS NULL) IS TRUE AND
    (r."layout_config" IS NULL) IS TRUE
  )) THEN RAISE EXCEPTION 'NATIVE_TYPED_ROW_INVALID:entity_surface_section' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_field_binding" r WHERE r.change_set_id=root.id AND r."overlay_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:entity_surface_overlay' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_field_binding" r WHERE r.change_set_id=root.id AND r."component_display_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:ui_component_contract' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_field_binding" r WHERE r.change_set_id=root.id AND r."component_input_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:ui_component_contract' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_field_binding" r WHERE r.change_set_id=root.id AND r."component_filter_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:ui_component_contract' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_field_binding" r WHERE r.change_set_id=root.id AND r."component_format_id" IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_REFERENCE_STORAGE_UNAVAILABLE:ui_component_contract' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM metadata."entity_surface_field_binding" r WHERE r.change_set_id=root.id AND NOT (
    (r.entity_id IS NOT DISTINCT FROM root.entity_id) IS TRUE AND
    (r.tenant_id IS NOT DISTINCT FROM root.tenant_id) IS TRUE AND
    (((r."entity_surface_id" IS NOT NULL AND (r."entity_surface_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."entity_surface_id" IS NULL)) IS TRUE AND
    ((r."entity_surface_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_surface" target WHERE target.id=r."entity_surface_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."entity_surface_section_id" IS NOT NULL AND (r."entity_surface_section_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."entity_surface_section_id" IS NULL)) IS TRUE AND
    ((r."entity_surface_section_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_surface_section" target WHERE target.id=r."entity_surface_section_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."overlay_id" IS NOT NULL AND (r."overlay_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."overlay_id" IS NULL)) IS TRUE AND
    ((r."entity_field_id" IS NOT NULL AND (r."entity_field_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE) IS TRUE AND
    ((r."entity_field_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_field" target WHERE target.id=r."entity_field_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    ((r."binding_key" IS NOT NULL AND (r."binding_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE) IS TRUE AND
    (((r."binding_kind"::text = 'field') IS TRUE OR (r."binding_kind"::text = 'badge') IS TRUE OR (r."binding_kind"::text = 'summary') IS TRUE OR (r."binding_kind"::text = 'header_context') IS TRUE OR (r."binding_kind"::text = 'reference_token') IS TRUE)) IS TRUE AND
    ((r."position" IS NOT NULL AND (r."position" BETWEEN 1 AND 32767)) IS TRUE) IS TRUE AND
    (((r."label_override_id" IS NOT NULL AND (r."label_override_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."label_override_id" IS NULL)) IS TRUE AND
    ((r."label_override_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."label_override_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."help_label_id" IS NOT NULL AND (r."help_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."help_label_id" IS NULL)) IS TRUE AND
    ((r."help_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."help_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."placeholder_label_id" IS NOT NULL AND (r."placeholder_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."placeholder_label_id" IS NULL)) IS TRUE AND
    ((r."placeholder_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."placeholder_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."component_display_id" IS NOT NULL AND (r."component_display_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."component_display_id" IS NULL)) IS TRUE AND
    (((r."component_input_id" IS NOT NULL AND (r."component_input_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."component_input_id" IS NULL)) IS TRUE AND
    (((r."component_filter_id" IS NOT NULL AND (r."component_filter_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."component_filter_id" IS NULL)) IS TRUE AND
    (((r."component_format_id" IS NOT NULL AND (r."component_format_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."component_format_id" IS NULL)) IS TRUE AND
    ((r."column_span" IS NOT NULL AND (r."column_span" BETWEEN 1 AND 12)) IS TRUE) IS TRUE AND
    (((r."width" IS NOT NULL AND (r."width" BETWEEN 1 AND 10000)) IS TRUE OR r."width" IS NULL)) IS TRUE AND
    ((((r."alignment"::text = 'start') IS TRUE OR (r."alignment"::text = 'center') IS TRUE OR (r."alignment"::text = 'end') IS TRUE) OR r."alignment" IS NULL)) IS TRUE AND
    (((r."filter_operators" IS NOT NULL AND (coalesce(array_ndims(r."filter_operators"),1)=1 AND coalesce(array_lower(r."filter_operators",1),1)=1 AND NOT EXISTS (SELECT 1 FROM unnest(r."filter_operators") AS native_item_0(value) WHERE NOT ((native_item_0.value IS NOT NULL AND (native_item_0.value::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE)))) IS TRUE OR r."filter_operators" IS NULL)) IS TRUE AND
    (((r."default_filter_operator" IS NOT NULL AND (r."default_filter_operator"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."default_filter_operator" IS NULL)) IS TRUE AND
    (r."meaningful_for_form" IS NOT NULL) IS TRUE AND
    (((r."reference_surface_key" IS NOT NULL AND (r."reference_surface_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."reference_surface_key" IS NULL)) IS TRUE AND
    ((((r."reference_load_mode"::text = 'eager') IS TRUE OR (r."reference_load_mode"::text = 'lazy') IS TRUE) OR r."reference_load_mode" IS NULL)) IS TRUE AND
    (((r."token_key" IS NOT NULL AND (r."token_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."token_key" IS NULL)) IS TRUE AND
    ((r."text_wrap" IS NOT NULL OR r."text_wrap" IS NULL)) IS TRUE AND
    (((r."fraction_digits" IS NOT NULL AND (r."fraction_digits" BETWEEN 0 AND 1000)) IS TRUE OR r."fraction_digits" IS NULL)) IS TRUE AND
    ((((r."date_style"::text = 'short') IS TRUE OR (r."date_style"::text = 'medium') IS TRUE OR (r."date_style"::text = 'long') IS TRUE) OR r."date_style" IS NULL)) IS TRUE AND
    (((r."empty_text_label_id" IS NOT NULL AND (r."empty_text_label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."empty_text_label_id" IS NULL)) IS TRUE AND
    ((r."empty_text_label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."empty_text_label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (r."label_override" IS NULL) IS TRUE AND
    (r."help_text" IS NULL) IS TRUE AND
    (r."placeholder" IS NULL) IS TRUE AND
    (r."display_config" IS NULL) IS TRUE
  )) THEN RAISE EXCEPTION 'NATIVE_TYPED_ROW_INVALID:entity_surface_field_binding' USING ERRCODE='23514'; END IF;
  IF expected_version=2 THEN IF EXISTS (SELECT 1 FROM metadata."entity_operation" r WHERE r.change_set_id=root.id AND NOT (
    (r.entity_id IS NOT DISTINCT FROM root.entity_id) IS TRUE AND
    (r.tenant_id IS NOT DISTINCT FROM root.tenant_id) IS TRUE AND
    ((r."operation_key" IS NOT NULL AND (r."operation_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE) IS TRUE AND
    (((r."operation_kind"::text = 'create') IS TRUE OR (r."operation_kind"::text = 'read') IS TRUE OR (r."operation_kind"::text = 'update') IS TRUE OR (r."operation_kind"::text = 'delete') IS TRUE OR (r."operation_kind"::text = 'execute') IS TRUE OR (r."operation_kind"::text = 'transition') IS TRUE OR (r."operation_kind"::text = 'import') IS TRUE OR (r."operation_kind"::text = 'export') IS TRUE)) IS TRUE AND
    (((r."description" IS NOT NULL AND (length(r."description"::text)<=4000)) IS TRUE OR r."description" IS NULL)) IS TRUE AND
    ((r."label_id" IS NOT NULL AND (r."label_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE) IS TRUE AND
    ((r."label_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_label" target WHERE target.id=r."label_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    ((r."audit_event_code" IS NOT NULL AND (r."audit_event_code"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE) IS TRUE AND
    (((r."execution_mode"::text = 'synchronous') IS TRUE OR (r."execution_mode"::text = 'asynchronous') IS TRUE)) IS TRUE AND
    (((r."idempotency_mode"::text = 'none') IS TRUE OR (r."idempotency_mode"::text = 'optional') IS TRUE OR (r."idempotency_mode"::text = 'required') IS TRUE)) IS TRUE AND
    (((r."input_surface_id" IS NOT NULL AND (r."input_surface_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."input_surface_id" IS NULL)) IS TRUE AND
    ((r."input_surface_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_surface" target WHERE target.id=r."input_surface_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."result_surface_id" IS NOT NULL AND (r."result_surface_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."result_surface_id" IS NULL)) IS TRUE AND
    ((r."result_surface_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_surface" target WHERE target.id=r."result_surface_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."authorization_target"::text = 'collection') IS TRUE OR (r."authorization_target"::text = 'existing') IS TRUE OR (r."authorization_target"::text = 'new') IS TRUE)) IS TRUE AND
    (((r."authorization_effect"::text = 'read') IS TRUE OR (r."authorization_effect"::text = 'write') IS TRUE OR (r."authorization_effect"::text = 'navigation') IS TRUE)) IS TRUE AND
    (r."requires_parent_read" IS NOT NULL) IS TRUE AND
    ((r."requires_preflight" IS NOT NULL OR r."requires_preflight" IS NULL)) IS TRUE AND
    (((r."replacement_operation_id" IS NOT NULL AND (r."replacement_operation_id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) IS TRUE OR r."replacement_operation_id" IS NULL)) IS TRUE AND
    ((r."replacement_operation_id" IS NULL OR EXISTS (SELECT 1 FROM metadata."entity_operation" target WHERE target.id=r."replacement_operation_id" AND target.entity_id=root.entity_id AND target.tenant_id IS NOT DISTINCT FROM root.tenant_id AND target.change_set_id=root.id))) IS TRUE AND
    (((r."handler_key" IS NOT NULL AND (r."handler_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."handler_key" IS NULL)) IS TRUE AND
    (((r."handler_version" IS NOT NULL AND (r."handler_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."handler_version" IS NULL)) IS TRUE AND
    (((r."preflight_key" IS NOT NULL AND (r."preflight_key"::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE OR r."preflight_key" IS NULL)) IS TRUE AND
    (((r."preflight_version" IS NOT NULL AND (r."preflight_version" BETWEEN 1 AND 2147483647)) IS TRUE OR r."preflight_version" IS NULL)) IS TRUE AND
    (((r."extension_field_mode"::text = 'none') IS TRUE OR (r."extension_field_mode"::text = 'allow_owned_fields') IS TRUE)) IS TRUE AND
    (((r."export_formats" IS NOT NULL AND (coalesce(array_ndims(r."export_formats"),1)=1 AND coalesce(array_lower(r."export_formats",1),1)=1 AND NOT EXISTS (SELECT 1 FROM unnest(r."export_formats") AS native_item_0(value) WHERE NOT ((native_item_0.value IS NOT NULL AND (native_item_0.value::text ~ '^[a-z][a-z0-9_.:-]{0,126}$')) IS TRUE)))) IS TRUE OR r."export_formats" IS NULL)) IS TRUE AND
    (((r."export_max_records" IS NOT NULL AND (r."export_max_records"::text ~ '^[1-9][0-9]{0,18}$')) IS TRUE OR r."export_max_records" IS NULL)) IS TRUE AND
    (r."label" IS NULL) IS TRUE
  )) THEN RAISE EXCEPTION 'NATIVE_TYPED_ROW_INVALID:entity_operation' USING ERRCODE='23514'; END IF; END IF;
END;
$native_rows$;
-- Aggregate database-local draft integrity, not installed-resource or publication approval.
-- All pending cutover constraints remain; external compiler/reader qualification is mandatory.
CREATE OR REPLACE FUNCTION metadata.fn_assert_native_authoring_snapshot(draft uuid, expected_hash text, expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE root metadata.entity_change_set%ROWTYPE; member_table text; invalid boolean;
BEGIN
 SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 PERFORM metadata.fn_assert_native_root(draft,expected_hash,expected_version);
 PERFORM metadata.fn_assert_native_typed_rows(draft,expected_version);
 PERFORM metadata.fn_assert_native_core_graph(draft);
 PERFORM metadata.fn_assert_native_layout_graph(draft);
 PERFORM metadata.validate_reference_members(draft);
 -- Use a finite repository-owned inventory, not entity names or author-supplied tables.
 FOREACH member_table IN ARRAY ARRAY['entity_access_permission','entity_ai_binding','entity_ai_field','entity_ai_profile','entity_ai_reference','entity_ai_term','entity_authorization_profile','entity_capability','entity_change_case_binding','entity_contract_test_case','entity_field','entity_field_access','entity_field_choice','entity_field_policy_binding','entity_field_reference_binding','entity_flow','entity_flow_step','entity_key','entity_key_field','entity_label','entity_label_translation','entity_lifecycle_binding','entity_lifecycle_operation_binding','entity_materialization_binding','entity_numbering_binding','entity_operation','entity_operation_context_requirement','entity_operation_field','entity_operation_permission','entity_operation_rule','entity_operation_scope_binding','entity_policy_binding','entity_predicate','entity_relation','entity_relation_field','entity_relation_target','entity_runtime_profile','entity_search_field','entity_search_profile','entity_surface','entity_surface_field_binding','entity_surface_navigation_group','entity_surface_operation','entity_surface_section','entity_surface_view','entity_surface_view_field','entity_target'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM metadata.%I WHERE change_set_id=$1 AND (entity_id IS DISTINCT FROM $2 OR tenant_id IS DISTINCT FROM $3))',member_table)
   INTO invalid USING draft,root.entity_id,root.tenant_id;
  IF invalid THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_OWNER_INVALID:%',member_table USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM metadata.entity_label_translation t LEFT JOIN metadata.entity_label l ON l.id=t.label_id AND l.change_set_id=draft
  WHERE t.change_set_id=draft AND (l.id IS NULL OR t.locale_code=root.default_locale OR NOT(t.locale_code=ANY(root.required_locales))))
 THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_LABEL_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_materialization_field_mapping m JOIN metadata.entity_materialization_binding b ON b.id=m.entity_materialization_binding_id WHERE b.change_set_id=draft AND m.tenant_id IS DISTINCT FROM root.tenant_id) THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_MAPPING_OWNER_INVALID' USING ERRCODE='23514'; END IF;
 IF expected_version=1 THEN
  IF EXISTS(SELECT 1 FROM metadata.entity_ai_profile WHERE change_set_id=draft)
    OR EXISTS(SELECT 1 FROM metadata.entity_ai_field WHERE change_set_id=draft)
    OR EXISTS(SELECT 1 FROM metadata.entity_ai_binding WHERE change_set_id=draft)
    OR EXISTS(SELECT 1 FROM metadata.entity_ai_reference WHERE change_set_id=draft)
    OR EXISTS(SELECT 1 FROM metadata.entity_ai_term WHERE change_set_id=draft)
  THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_VERSION_MEMBERS_INVALID' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_operation o WHERE o.change_set_id=draft AND (
  (o.handler_key IS NULL)<>(o.handler_version IS NULL)
  OR (o.preflight_key IS NULL)<>(o.preflight_version IS NULL)
  OR (o.operation_kind<>'read' AND o.handler_key IS NULL)
  OR (o.requires_preflight=false AND o.preflight_key IS NOT NULL)
  OR (o.operation_kind<>'export' AND (o.export_formats IS NOT NULL OR o.export_max_records IS NOT NULL))
  OR (o.export_formats IS NOT NULL AND (cardinality(o.export_formats)=0 OR cardinality(o.export_formats)<>(SELECT count(DISTINCT v) FROM unnest(o.export_formats) v)))
 )) THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_OPERATION_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_ai_profile WHERE change_set_id=draft GROUP BY change_set_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_AI_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
 -- AI child scope must match the one local profile even when FK checks are deferred.
 IF EXISTS(SELECT 1 FROM (
   SELECT ai_profile_id FROM metadata.entity_ai_field WHERE change_set_id=draft
   UNION ALL SELECT ai_profile_id FROM metadata.entity_ai_binding WHERE change_set_id=draft
   UNION ALL SELECT ai_profile_id FROM metadata.entity_ai_reference WHERE change_set_id=draft
   UNION ALL SELECT ai_profile_id FROM metadata.entity_ai_term WHERE change_set_id=draft
 ) child LEFT JOIN metadata.entity_ai_profile p ON p.id=child.ai_profile_id AND p.change_set_id=draft WHERE p.id IS NULL)
 THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_AI_SCOPE_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_ai_term t
  LEFT JOIN metadata.entity_ai_binding b ON b.id=t.provider_binding_id AND b.change_set_id=draft AND b.ai_profile_id=t.ai_profile_id
  LEFT JOIN metadata.entity_ai_profile p ON p.id=t.ai_profile_id AND p.change_set_id=draft
  WHERE t.change_set_id=draft AND (b.id IS NULL OR b.binding_kind<>'insight_provider' OR p.vocabulary_locale IS NULL))
 THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_AI_TERM_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM (
  SELECT position,row_number() OVER(PARTITION BY ai_profile_id ORDER BY position) expected FROM metadata.entity_ai_field WHERE change_set_id=draft
  UNION ALL SELECT position,row_number() OVER(PARTITION BY ai_profile_id ORDER BY position) FROM metadata.entity_ai_reference WHERE change_set_id=draft
  UNION ALL SELECT position,row_number() OVER(PARTITION BY ai_profile_id,binding_kind ORDER BY position) FROM metadata.entity_ai_binding WHERE change_set_id=draft
 ) ordering WHERE position<>expected)
 THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_AI_ORDER_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT id FROM (
  SELECT id FROM metadata.entity_operation WHERE change_set_id=draft
  UNION ALL SELECT id FROM metadata.entity_ai_profile WHERE change_set_id=draft
  UNION ALL SELECT id FROM metadata.entity_ai_field WHERE change_set_id=draft
  UNION ALL SELECT id FROM metadata.entity_ai_binding WHERE change_set_id=draft
  UNION ALL SELECT id FROM metadata.entity_ai_reference WHERE change_set_id=draft
  UNION ALL SELECT id FROM metadata.entity_ai_term WHERE change_set_id=draft
 ) members GROUP BY id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_MEMBER_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
 -- SQL checks local graph integrity. Resource versions/hashes, effective field
 -- exposure and actual storage authority are independently resolved by the host.
END $$;

CREATE OR REPLACE FUNCTION metadata.fn_assert_native_authoring_contract(draft uuid, expected_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
BEGIN PERFORM metadata.fn_assert_native_authoring_snapshot(draft,expected_hash,1); END $$;

CREATE OR REPLACE FUNCTION metadata.native_snapshot_final_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE previous_draft uuid; next_draft uuid; draft uuid; root metadata.entity_change_set%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='entity_materialization_field_mapping' THEN
  IF TG_OP<>'INSERT' THEN SELECT change_set_id INTO previous_draft FROM metadata.entity_materialization_binding WHERE id=OLD.entity_materialization_binding_id; END IF;
  IF TG_OP<>'DELETE' THEN SELECT change_set_id INTO next_draft FROM metadata.entity_materialization_binding WHERE id=NEW.entity_materialization_binding_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_PARENT_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
 IF TG_OP<>'INSERT' THEN previous_draft:=(to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='entity_change_set' THEN 'id' ELSE 'change_set_id' END)::uuid; END IF;
 IF TG_OP<>'DELETE' THEN next_draft:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='entity_change_set' THEN 'id' ELSE 'change_set_id' END)::uuid; END IF;
 END IF;
 FOR draft IN SELECT DISTINCT value FROM unnest(ARRAY[previous_draft,next_draft]) value WHERE value IS NOT NULL ORDER BY value LOOP
  SELECT * INTO root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
  IF FOUND AND root.native_core_layout_version IS NOT NULL THEN
   PERFORM metadata.fn_assert_native_authoring_snapshot(draft,root.authoring_schema_hash,root.native_core_layout_version);
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
DO $$ DECLARE member_table text; BEGIN
 FOREACH member_table IN ARRAY ARRAY['entity_access_permission','entity_ai_binding','entity_ai_field','entity_ai_profile','entity_ai_reference','entity_ai_term','entity_authorization_profile','entity_capability','entity_change_case_binding','entity_contract_test_case','entity_field','entity_field_access','entity_field_choice','entity_field_policy_binding','entity_field_reference_binding','entity_flow','entity_flow_step','entity_key','entity_key_field','entity_label','entity_label_translation','entity_lifecycle_binding','entity_lifecycle_operation_binding','entity_materialization_binding','entity_numbering_binding','entity_operation','entity_operation_context_requirement','entity_operation_field','entity_operation_permission','entity_operation_rule','entity_operation_scope_binding','entity_policy_binding','entity_predicate','entity_relation','entity_relation_field','entity_relation_target','entity_runtime_profile','entity_search_field','entity_search_profile','entity_surface','entity_surface_field_binding','entity_surface_navigation_group','entity_surface_operation','entity_surface_section','entity_surface_view','entity_surface_view_field','entity_target']||ARRAY['entity_change_set','entity_materialization_field_mapping'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER native_snapshot_final_guard AFTER INSERT OR UPDATE OR DELETE ON metadata.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_snapshot_final_guard()',member_table);
 END LOOP;
END $$;
DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT * FROM native_nullability_original_rows LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.schema_name,r.table_name) INTO h;
  IF h IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'NATIVE_CORE_ROOT_ORIGINAL_ROWS_CHANGED: %.%',r.schema_name,r.table_name; END IF;
 END LOOP;
END $$;
COMMIT;
