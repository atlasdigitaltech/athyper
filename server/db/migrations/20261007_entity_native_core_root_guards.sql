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
DO $$ BEGIN IF to_regprocedure('metadata.fn_assert_native_core_graph(uuid)') IS NOT NULL OR to_regprocedure('metadata.fn_assert_native_root(uuid,text,integer)') IS NOT NULL THEN RAISE EXCEPTION 'NATIVE_CORE_ROOT_GUARD_ALREADY_EXISTS'; END IF; END $$;
-- Database-local draft invariants from normalized-core-validation.ts.
-- Completeness and independently installed resources are separate gates.
CREATE OR REPLACE FUNCTION metadata.fn_assert_native_core_graph(draft uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE root metadata.entity_change_set%ROWTYPE;
BEGIN
 SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF root.native_core_layout_version IS NULL OR root.native_core_layout_version NOT IN (1,2)
 THEN RAISE EXCEPTION 'NATIVE_CORE_ROOT_VERSION_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field f LEFT JOIN metadata.entity_field_identity i ON i.id=f.field_identity_id
   LEFT JOIN metadata.entity_field p ON p.id=f.parent_field_id
   LEFT JOIN metadata.entity_field currency ON currency.id=f.currency_field_id
   WHERE f.change_set_id=draft AND (
     i.id IS NULL OR i.entity_id<>root.entity_id OR i.tenant_id IS DISTINCT FROM root.tenant_id
     OR (i.identity_status<>'active' AND NOT(i.identity_status='reserved' AND i.introduced_change_set_id=draft))
     OR (i.parent_identity_id IS NULL AND f.parent_field_id IS NOT NULL)
     OR (i.parent_identity_id IS NOT NULL AND (p.id IS NULL OR p.change_set_id<>draft OR p.field_identity_id IS DISTINCT FROM i.parent_identity_id))
     OR f.replacement_field_id=f.id
     OR (f.currency_field_id IS NOT NULL AND (currency.id IS NULL OR currency.change_set_id<>draft OR currency.id=f.id OR currency.data_type NOT IN ('string','enum') OR currency.cardinality<>'one'))
   )) THEN RAISE EXCEPTION 'NATIVE_CORE_FIELD_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field WHERE change_set_id=draft GROUP BY field_identity_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'NATIVE_CORE_DUPLICATE_IDENTITY' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH RECURSIVE parents AS (
   SELECT id,parent_field_id,ARRAY[id] path,false cycle FROM metadata.entity_field WHERE change_set_id=draft
   UNION ALL SELECT p.id,p.parent_field_id,t.path||p.id,p.id=ANY(t.path) FROM parents t
   JOIN metadata.entity_field p ON p.id=t.parent_field_id AND p.change_set_id=draft WHERE NOT t.cycle
 ) SELECT 1 FROM parents WHERE cycle)
 THEN RAISE EXCEPTION 'NATIVE_CORE_PARENT_CYCLE' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field f WHERE f.change_set_id=draft AND (
   (f.value_origin<>'stored' AND f.write_mode<>'read_only')
   OR (f.value_origin IN ('computed','runtime') AND num_nonnulls(f.storage_kind,f.storage_path,f.storage_type)>0)
   OR (f.data_type NOT IN ('string','text') AND num_nonnulls(f.min_length,f.max_length,f.pattern)>0)
   OR (f.data_type NOT IN ('integer','bigint','decimal','money') AND num_nonnulls(f.minimum,f.maximum)>0)
   OR (f.data_type NOT IN ('decimal','money') AND num_nonnulls(f.precision,f.scale)>0)
   OR (f.data_type<>'date' AND num_nonnulls(f.minimum_date,f.maximum_date)>0)
   OR (f.data_type<>'datetime' AND num_nonnulls(f.minimum_datetime,f.maximum_datetime)>0)
   OR f.min_length>f.max_length OR f.minimum>f.maximum OR f.scale>f.precision
   OR f.minimum_date>f.maximum_date OR f.minimum_datetime>f.maximum_datetime
   OR (f.data_type IN ('integer','bigint') AND (f.minimum<>trunc(f.minimum) OR f.maximum<>trunc(f.maximum) OR f.default_numeric<>trunc(f.default_numeric)))
   OR (f.temporal_kind IS NOT NULL AND f.temporal_kind IS DISTINCT FROM CASE f.data_type WHEN 'date' THEN 'date' WHEN 'datetime' THEN 'instant' END)
   OR num_nonnulls(f.currency_code,f.currency_field_id)>1
   OR (f.data_type<>'money' AND num_nonnulls(f.currency_code,f.currency_field_id)>0)
   OR ((f.json_schema_key IS NULL)<>(f.json_schema_hash IS NULL))
   OR ((f.computed_contract_key IS NULL)<>(f.computed_contract_version IS NULL))
   OR ((f.validation_contract_key IS NULL)<>(f.validation_contract_version IS NULL))
   OR ((f.default_context_key IS NULL)<>(f.default_context_version IS NULL))
   OR (f.value_origin<>'computed' AND f.computed_contract_key IS NOT NULL)
   OR num_nonnulls(f.default_text,f.default_numeric,f.default_boolean,f.default_date,f.default_datetime,f.default_uuid)>1
   OR (f.default_kind<>'literal' AND num_nonnulls(f.default_text,f.default_numeric,f.default_boolean,f.default_date,f.default_datetime,f.default_uuid)>0)
   OR (f.default_text IS NOT NULL AND f.data_type NOT IN ('string','text','enum'))
   OR (f.default_numeric IS NOT NULL AND f.data_type NOT IN ('integer','bigint','decimal','money'))
   OR (f.default_boolean IS NOT NULL AND f.data_type<>'boolean')
   OR (f.default_date IS NOT NULL AND f.data_type<>'date')
   OR (f.default_datetime IS NOT NULL AND f.data_type<>'datetime')
   OR f.default_uuid IS NOT NULL
   OR (f.default_kind='literal_null' AND NOT f.nullable)
   OR (f.default_kind<>'context' AND f.default_context_key IS NOT NULL)
   OR (f.default_kind<>'none' AND (f.value_origin<>'stored' OR f.write_mode='read_only'))
   OR (f.key_generation<>'none' AND f.data_type<>'uuid')
 )) THEN RAISE EXCEPTION 'NATIVE_CORE_FIELD_VARIANT_INVALID' USING ERRCODE='23514'; END IF;
 -- PostgreSQL has special values and BC dates that JSON/ISO codecs cannot carry.
 IF EXISTS(SELECT 1 FROM metadata.entity_field f CROSS JOIN LATERAL (VALUES(f.minimum),(f.maximum),(f.default_numeric)) n(value)
   WHERE f.change_set_id=draft AND n.value::text IN ('NaN','Infinity','-Infinity'))
 OR EXISTS(SELECT 1 FROM metadata.entity_field f CROSS JOIN LATERAL (VALUES(f.minimum_date),(f.maximum_date),(f.default_date)) d(value)
   WHERE f.change_set_id=draft AND (NOT isfinite(d.value) OR d.value<DATE '0001-01-01' OR d.value>=DATE '10000-01-01'))
 OR EXISTS(SELECT 1 FROM metadata.entity_field f CROSS JOIN LATERAL (VALUES(f.minimum_datetime),(f.maximum_datetime),(f.default_datetime)) d(value)
   WHERE f.change_set_id=draft AND (NOT isfinite(d.value) OR d.value<TIMESTAMPTZ '0001-01-01 00:00:00+00' OR d.value>=TIMESTAMPTZ '10000-01-01 00:00:00+00'))
 THEN RAISE EXCEPTION 'NATIVE_CORE_SCALAR_ENCODING_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_runtime_profile r WHERE r.change_set_id=draft AND (
   (r.backing_kind NOT IN ('table','view','materialized_view') AND num_nonnulls(r.storage_schema,r.storage_object,r.storage_catalogue_hash)>0)
   OR (r.backing_kind='virtual' AND r.storage_plane IS NOT NULL)
   OR ((r.read_handler_key IS NULL)<>(r.read_handler_version IS NULL))
   OR ((r.write_handler_key IS NULL)<>(r.write_handler_version IS NULL))
   OR ((r.reference_capability_key IS NULL)<>(r.reference_capability_version IS NULL))
   OR (r.read_mode<>'facade' AND r.read_handler_key IS NOT NULL)
   OR (r.write_mode<>'facade' AND r.write_handler_key IS NOT NULL)
 )) THEN RAISE EXCEPTION 'NATIVE_CORE_RUNTIME_VARIANT_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface s WHERE s.change_set_id=draft AND (
   (s.surface_kind<>'embedded' AND s.embedded_mode IS NOT NULL)
   OR ((s.surface_kind='list' OR (s.surface_kind='embedded' AND s.embedded_mode='collection')) IS NOT TRUE AND num_nonnulls(s.identity_field_id,s.search_profile_id,s.supported_modes,s.default_page_size,s.allowed_page_sizes,s.max_sort_levels,s.count_mode,s.max_filters,s.max_filter_depth,s.max_page_size,s.empty_title_label_id,s.empty_description_label_id)>0)
   OR ((s.surface_kind IN ('detail','form') OR (s.surface_kind='embedded' AND s.embedded_mode='sectioned')) IS NOT TRUE AND s.column_count IS NOT NULL)
   OR (s.surface_kind<>'detail' AND num_nonnulls(s.code_field_id,s.show_group_band)>0)
   OR (s.surface_kind NOT IN ('detail','lookup') AND s.title_field_id IS NOT NULL)
   OR (s.surface_kind='lookup' AND (s.component_contract_id IS NOT NULL OR s.layout_kind<>'stack' OR s.extension_point_key IS NOT NULL))
   OR (s.surface_kind<>'lookup' AND num_nonnulls(s.reference_key_id,s.reference_format)>0)
   OR (s.surface_kind='detail' AND s.extension_point_key IS NOT NULL)
   OR EXISTS(SELECT 1 FROM metadata.entity_field f WHERE f.change_set_id=draft AND f.id IN (s.identity_field_id,s.title_field_id,s.code_field_id) AND f.data_type='uuid')
   OR (s.allowed_page_sizes IS NOT NULL AND (cardinality(s.allowed_page_sizes)=0 OR cardinality(s.allowed_page_sizes)<>(SELECT count(DISTINCT n) FROM unnest(s.allowed_page_sizes) n) OR EXISTS(SELECT 1 FROM unnest(s.allowed_page_sizes) n WHERE n>s.max_page_size) OR (s.default_page_size IS NOT NULL AND NOT (s.default_page_size=ANY(s.allowed_page_sizes)))))
   OR (s.supported_modes IS NOT NULL AND (cardinality(s.supported_modes)=0 OR cardinality(s.supported_modes)<>(SELECT count(DISTINCT mode) FROM unnest(s.supported_modes) mode)))
 )) THEN RAISE EXCEPTION 'NATIVE_CORE_SURFACE_VARIANT_INVALID' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION metadata.native_core_final_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE draft uuid; version integer;
BEGIN
 IF TG_TABLE_NAME='entity_change_set' THEN draft:=COALESCE(NEW.id,OLD.id);
 ELSIF TG_TABLE_NAME='entity_field_identity' THEN
   -- Catalogue changes must also validate every currently native consumer.
   FOR draft IN SELECT DISTINCT f.change_set_id FROM metadata.entity_field f JOIN metadata.entity_change_set c ON c.id=f.change_set_id
     WHERE f.field_identity_id=COALESCE(NEW.id,OLD.id) AND c.native_core_layout_version IS NOT NULL ORDER BY f.change_set_id LOOP
     PERFORM metadata.fn_assert_native_core_graph(draft);
   END LOOP;
   RETURN NULL;
 ELSE draft:=COALESCE(NEW.change_set_id,OLD.change_set_id); END IF;
 SELECT native_core_layout_version INTO STRICT version FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF version IS NOT NULL THEN PERFORM metadata.fn_assert_native_core_graph(draft); END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE member text; BEGIN
 FOREACH member IN ARRAY ARRAY['entity_change_set','entity_field','entity_runtime_profile','entity_surface','entity_field_identity'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER native_core_final_guard AFTER INSERT OR UPDATE%s ON metadata.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_core_final_guard()',CASE WHEN member='entity_change_set' THEN '' ELSE ' OR DELETE' END,member);
 END LOOP;
END $$;
-- Root integrity is not host publication, product-write authority or signature
-- evidence. Caller pins must still come from independently admitted policy.
CREATE OR REPLACE FUNCTION metadata.fn_assert_native_root(draft uuid, expected_hash text, expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE root metadata.entity_change_set%ROWTYPE;
BEGIN
 SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF expected_version IS NULL OR expected_version NOT IN (1,2)
   OR root.native_core_layout_version IS DISTINCT FROM expected_version
   OR expected_hash IS NULL OR expected_hash !~ '^[0-9a-f]{64}$'
   OR root.authoring_schema_hash IS DISTINCT FROM expected_hash
 THEN RAISE EXCEPTION 'NATIVE_ROOT_PIN_INVALID' USING ERRCODE='23514'; END IF;
 IF ((root.source_kind='product' AND root.tenant_id IS NULL)
   OR (root.source_kind='tenant_entity' AND root.tenant_id IS NOT NULL)) IS NOT TRUE
 THEN RAISE EXCEPTION 'NATIVE_ROOT_SOURCE_UNSUPPORTED' USING ERRCODE='23514'; END IF;
 IF root.reference_contract_version IS DISTINCT FROM 1 OR root.default_locale IS NULL OR btrim(root.default_locale)=''
   OR root.required_locales IS NULL OR cardinality(root.required_locales)=0
   OR array_ndims(root.required_locales) IS DISTINCT FROM 1 OR array_lower(root.required_locales,1) IS DISTINCT FROM 1
   OR array_position(root.required_locales,NULL) IS NOT NULL OR NOT(root.default_locale=ANY(root.required_locales))
   OR cardinality(root.required_locales)<>(SELECT count(DISTINCT locale) FROM unnest(root.required_locales) locale)
 THEN RAISE EXCEPTION 'NATIVE_ROOT_DEPENDENCIES_INVALID' USING ERRCODE='23514'; END IF;
 IF (expected_version=2 AND root.entity_label_id IS NULL) OR (root.entity_label_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM metadata.entity_label l WHERE l.id=root.entity_label_id AND l.change_set_id=root.id
     AND l.entity_id=root.entity_id AND l.tenant_id IS NOT DISTINCT FROM root.tenant_id AND l.source_kind='owned'))
 THEN RAISE EXCEPTION 'NATIVE_ROOT_LABEL_INVALID' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION metadata.native_root_transition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.native_core_layout_version IS NOT NULL THEN RAISE EXCEPTION 'NATIVE_ROOT_EXPLICIT_CONVERSION_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF OLD.native_core_layout_version IS NOT NULL AND (
   NEW.native_core_layout_version IS DISTINCT FROM OLD.native_core_layout_version
   OR NEW.authoring_schema_hash IS DISTINCT FROM OLD.authoring_schema_hash
   OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
   OR NEW.reference_contract_version IS DISTINCT FROM OLD.reference_contract_version)
 THEN RAISE EXCEPTION 'NATIVE_ROOT_REPIN_REQUIRES_VERSIONED_MIGRATION' USING ERRCODE='23514'; END IF;
 -- Initial conversion still passes the existing root revision/provenance and
 -- authoring guards. No session flag authorizes it and no pending check drops.
 RETURN NEW;
END $$;
CREATE TRIGGER native_root_transition_guard BEFORE INSERT OR UPDATE ON metadata.entity_change_set
FOR EACH ROW EXECUTE FUNCTION metadata.native_root_transition_guard();

CREATE OR REPLACE FUNCTION metadata.native_root_final_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE draft uuid; root metadata.entity_change_set%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='entity_change_set' THEN draft:=COALESCE(NEW.id,OLD.id);
 ELSE draft:=COALESCE(NEW.change_set_id,OLD.change_set_id); END IF;
 SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF root.native_core_layout_version IS NOT NULL THEN
   PERFORM metadata.fn_assert_native_root(draft,root.authoring_schema_hash,root.native_core_layout_version);
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER native_root_final_guard AFTER INSERT OR UPDATE ON metadata.entity_change_set
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_root_final_guard();
CREATE CONSTRAINT TRIGGER native_root_final_guard AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_label
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_root_final_guard();
-- Retained predicate validation recognizes normalized string/bigint aliases.
DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='metadata.validate_reference_members(uuid)'::regprocedure) IS DISTINCT FROM '47226a093600bc2d2d8f581600e4e928' THEN RAISE EXCEPTION 'REFERENCE_PREDICATE_PREDECESSOR_MISMATCH'; END IF; END $$;
CREATE OR REPLACE FUNCTION metadata.validate_reference_members(draft uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM metadata.entity_field_choice c JOIN metadata.entity_field f ON f.id=c.entity_field_id AND f.change_set_id=draft WHERE c.change_set_id=draft AND f.data_type::text<>'enum') THEN RAISE EXCEPTION 'Choices require an enum field'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_navigation_group g JOIN metadata.entity_surface s ON s.id=g.entity_surface_id WHERE g.change_set_id=draft AND s.surface_kind::text<>'detail') THEN RAISE EXCEPTION 'Navigation groups require detail surfaces'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_section s JOIN metadata.entity_surface_navigation_group g ON g.id=s.navigation_group_id WHERE s.change_set_id=draft AND s.entity_surface_id<>g.entity_surface_id) THEN RAISE EXCEPTION 'Section navigation scope mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_view v JOIN metadata.entity_surface s ON s.id=v.entity_surface_id WHERE v.change_set_id=draft AND s.surface_kind::text NOT IN ('list','embedded')) THEN RAISE EXCEPTION 'View surface is incompatible'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_view_field v JOIN metadata.entity_surface_view view ON view.id=v.view_id JOIN metadata.entity_surface_field_binding b ON b.id=v.field_binding_id JOIN metadata.entity_field f ON f.id=b.entity_field_id WHERE v.change_set_id=draft AND (b.entity_surface_id<>view.entity_surface_id OR (v.visible_position IS NOT NULL AND f.data_type::text='uuid'))) THEN RAISE EXCEPTION 'View field scope/readable presentation is invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field_access f WHERE f.change_set_id=draft AND (NOT EXISTS(SELECT 1 FROM metadata.entity_target t WHERE t.change_set_id=draft AND t.target_plane=f.target_plane) OR cardinality(f.query_uses)<>(SELECT count(DISTINCT x) FROM unnest(f.query_uses) x))) THEN RAISE EXCEPTION 'Field access target/query use invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_access_permission p WHERE p.change_set_id=draft AND NOT EXISTS(SELECT 1 FROM metadata.entity_target t WHERE t.change_set_id=draft AND t.target_plane=p.target_plane)) OR EXISTS(SELECT 1 FROM metadata.entity_authorization_profile p WHERE p.change_set_id=draft AND NOT EXISTS(SELECT 1 FROM metadata.entity_target t WHERE t.change_set_id=draft AND t.target_plane=p.target_plane)) THEN RAISE EXCEPTION 'Access plane is undeclared'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field_access f WHERE f.change_set_id=draft AND f.representation<>'omitted' AND (f.read_operation_id IS NULL OR f.read_operation_change_set_id IS DISTINCT FROM draft)) THEN RAISE EXCEPTION 'Field access operation source invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_field_access f JOIN metadata.entity_operation o ON o.id=f.read_operation_id WHERE f.change_set_id=draft AND o.operation_kind::text NOT IN ('read','list')) THEN RAISE EXCEPTION 'Field read operation is incompatible'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_operation_field f JOIN metadata.entity_operation o ON o.id=f.entity_operation_id WHERE f.change_set_id=draft AND o.operation_kind::text IN ('read','list')) THEN RAISE EXCEPTION 'Read operations cannot enroll write fields'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p WHERE p.change_set_id=draft AND ((p.parent_predicate_id IS NULL AND ((p.purpose='list_filter' AND p.view_id IS NULL) OR (p.purpose='record_lock' AND p.authorization_profile_id IS NULL) OR (p.purpose='editability' AND p.field_binding_id IS NULL) OR (p.purpose='visibility' AND num_nonnulls(p.field_binding_id,p.surface_operation_id,p.surface_section_id,p.navigation_group_id)<>1))) OR (p.node_kind='group' AND (p.conjunction IS NULL OR num_nonnulls(p.entity_field_id,p.operator,p.value_kind,p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set,p.context_key,p.context_version)<>0)) OR (p.node_kind='condition' AND (p.conjunction IS NOT NULL OR p.entity_field_id IS NULL OR p.operator IS NULL OR p.value_kind IS NULL)))) THEN RAISE EXCEPTION 'Predicate owner/node shape invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p WHERE p.change_set_id=draft AND p.node_kind='condition' AND (
  (p.operator IN ('is_null','is_not_null')) IS DISTINCT FROM (p.value_kind='none') OR
  CASE p.value_kind
   WHEN 'none' THEN num_nonnulls(p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set,p.context_key,p.context_version)<>0
   WHEN 'context' THEN num_nonnulls(p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set)<>0 OR p.context_key IS NULL OR p.context_version IS NULL
   ELSE num_nonnulls(p.value_text,p.value_numeric,p.value_boolean,p.value_date,p.value_datetime,p.value_uuid,p.value_text_set,p.value_numeric_set,p.value_uuid_set,p.value_date_set,p.value_datetime_set)<>1 OR p.context_key IS NOT NULL OR p.context_version IS NOT NULL OR
    CASE p.value_kind WHEN 'text' THEN p.value_text IS NULL WHEN 'numeric' THEN p.value_numeric IS NULL WHEN 'boolean' THEN p.value_boolean IS NULL WHEN 'date' THEN p.value_date IS NULL WHEN 'datetime' THEN p.value_datetime IS NULL WHEN 'uuid' THEN p.value_uuid IS NULL
     WHEN 'text_set' THEN coalesce(cardinality(p.value_text_set),0)=0 WHEN 'numeric_set' THEN coalesce(cardinality(p.value_numeric_set),0)=0 WHEN 'uuid_set' THEN coalesce(cardinality(p.value_uuid_set),0)=0 WHEN 'date_set' THEN coalesce(cardinality(p.value_date_set),0)=0 WHEN 'datetime_set' THEN coalesce(cardinality(p.value_datetime_set),0)=0 ELSE true END OR
    (p.value_kind LIKE '%\_set' ESCAPE '\') IS DISTINCT FROM (p.operator IN ('in','not_in')) END
 )) THEN RAISE EXCEPTION 'Predicate payload/operator mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p JOIN metadata.entity_field f ON f.id=p.entity_field_id AND f.change_set_id=draft WHERE p.change_set_id=draft AND p.node_kind='condition' AND p.operator NOT IN ('is_null','is_not_null') AND p.value_kind<>'context' AND (
   regexp_replace(p.value_kind,'_set$','') IS DISTINCT FROM CASE f.data_type::text WHEN 'string' THEN 'text' WHEN 'text' THEN 'text' WHEN 'enum' THEN 'text' WHEN 'integer' THEN 'numeric' WHEN 'bigint' THEN 'numeric' WHEN 'decimal' THEN 'numeric' WHEN 'money' THEN 'numeric' WHEN 'boolean' THEN 'boolean' WHEN 'date' THEN 'date' WHEN 'datetime' THEN 'datetime' WHEN 'uuid' THEN 'uuid' END
   OR (p.operator IN ('gt','gte','lt','lte') AND f.data_type::text NOT IN ('integer','bigint','decimal','money','date','datetime'))
 )) THEN RAISE EXCEPTION 'Predicate field/value type invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_authorization_profile p JOIN metadata.entity_operation r ON r.id=p.record_read_operation_id JOIN metadata.entity_operation d ON d.id=p.directory_operation_id WHERE p.change_set_id=draft AND (r.operation_kind::text<>'read' OR d.operation_kind::text<>'read')) THEN RAISE EXCEPTION 'Authorization profile read operation invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p WHERE p.change_set_id=draft AND (
   p.value_numeric::text IN ('NaN','Infinity','-Infinity') OR EXISTS(SELECT 1 FROM unnest(p.value_numeric_set) n WHERE n::text IN ('NaN','Infinity','-Infinity')) OR
   EXISTS(SELECT 1 FROM unnest(p.value_text_set) t WHERE length(t) NOT BETWEEN 1 AND 4000 OR t !~ '[^[:space:]]')
 )) THEN RAISE EXCEPTION 'Predicate scalar/set payload invalid'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_predicate p JOIN metadata.entity_predicate parent ON parent.id=p.parent_predicate_id WHERE p.change_set_id=draft AND (p.purpose<>parent.purpose OR parent.node_kind<>'group')) THEN RAISE EXCEPTION 'Predicate purpose/parent mismatch'; END IF;
 IF EXISTS(WITH RECURSIVE tree AS (SELECT id,parent_predicate_id,ARRAY[id] path,false cycle,1 depth FROM metadata.entity_predicate WHERE change_set_id=draft UNION ALL SELECT p.id,p.parent_predicate_id,t.path||p.id,p.id=ANY(t.path),t.depth+1 FROM tree t JOIN metadata.entity_predicate p ON p.id=t.parent_predicate_id WHERE NOT t.cycle AND t.depth<=32) SELECT 1 FROM tree WHERE cycle OR depth>32) THEN RAISE EXCEPTION 'Predicate cycle/depth limit'; END IF;
END $$;
DO $$ DECLARE r record; h text; BEGIN
 FOR r IN SELECT * FROM native_nullability_original_rows LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.schema_name,r.table_name) INTO h;
  IF h IS DISTINCT FROM r.row_hash THEN RAISE EXCEPTION 'NATIVE_CORE_ROOT_ORIGINAL_ROWS_CHANGED: %.%',r.schema_name,r.table_name; END IF;
 END LOOP;
END $$;
COMMIT;
