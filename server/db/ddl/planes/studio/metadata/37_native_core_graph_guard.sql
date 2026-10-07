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
