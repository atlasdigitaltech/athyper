-- Relational layout component. Resource catalogue/security completeness and
-- whole-source root admission remain separate; pending cutover checks stay on.
CREATE OR REPLACE FUNCTION metadata.fn_assert_native_layout_graph(draft uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE root metadata.entity_change_set%ROWTYPE;
BEGIN
 SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF root.native_core_layout_version IS NULL OR root.native_core_layout_version NOT IN (1,2)
 THEN RAISE EXCEPTION 'NATIVE_LAYOUT_ROOT_VERSION_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_navigation_group g LEFT JOIN metadata.entity_surface s ON s.id=g.entity_surface_id
   WHERE g.change_set_id=draft AND (s.id IS NULL OR s.change_set_id<>draft OR s.surface_kind<>'detail'))
 THEN RAISE EXCEPTION 'NATIVE_LAYOUT_NAVIGATION_SURFACE_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_section s LEFT JOIN metadata.entity_surface v ON v.id=s.entity_surface_id
   LEFT JOIN metadata.entity_surface_navigation_group g ON g.id=s.navigation_group_id
   LEFT JOIN metadata.entity_surface_section p ON p.id=s.parent_section_id
   WHERE s.change_set_id=draft AND (
     v.id IS NULL OR v.change_set_id<>draft OR v.entity_id<>root.entity_id OR v.tenant_id IS DISTINCT FROM root.tenant_id
     OR NOT (v.surface_kind IN ('detail','form') OR (v.surface_kind='embedded' AND v.embedded_mode='sectioned'))
     OR (s.navigation_group_id IS NOT NULL AND (v.surface_kind<>'detail' OR g.id IS NULL OR g.change_set_id<>draft OR g.entity_surface_id<>s.entity_surface_id))
     OR (s.parent_section_id IS NOT NULL AND (p.id IS NULL OR p.change_set_id<>draft OR p.entity_surface_id<>s.entity_surface_id OR p.navigation_group_id IS DISTINCT FROM s.navigation_group_id OR p.content_kind<>'fields'))
     OR (s.collapsed_by_default AND NOT s.collapsible)
     OR (s.content_kind<>'related_list' AND num_nonnulls(s.relation_target_id,s.target_surface_key,s.target_view_key,s.read_operation_key,s.presentation_cardinality,s.empty_title_label_id,s.empty_description_label_id,s.empty_creation_mode,s.setup_label_id,s.create_operation_key,s.edit_label_id)<>0)
     OR (s.content_kind<>'component' AND s.component_contract_id IS NOT NULL)
     OR (s.content_kind<>'capability' AND num_nonnulls(s.entity_capability_id,s.capability_layout_binding_id)<>0)
     OR ((s.entity_capability_id IS NULL)<>(s.capability_layout_binding_id IS NULL))
     OR (s.content_kind<>'fields' AND s.extension_point_key IS NOT NULL)
     OR (s.content_kind='related_list' AND s.empty_creation_mode IS DISTINCT FROM 'setup_operation' AND num_nonnulls(s.setup_label_id,s.create_operation_key)<>0)
   )) THEN RAISE EXCEPTION 'NATIVE_LAYOUT_SECTION_GRAPH_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH RECURSIVE parents AS (
   SELECT id,parent_section_id,ARRAY[id] path,false cycle FROM metadata.entity_surface_section WHERE change_set_id=draft
   UNION ALL SELECT p.id,p.parent_section_id,t.path||p.id,p.id=ANY(t.path)
   FROM parents t JOIN metadata.entity_surface_section p ON p.id=t.parent_section_id AND p.change_set_id=draft WHERE NOT t.cycle
 ) SELECT 1 FROM parents WHERE cycle)
 THEN RAISE EXCEPTION 'NATIVE_LAYOUT_PARENT_CYCLE' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_section s WHERE s.change_set_id=draft
   AND EXISTS(SELECT 1 FROM metadata.entity_surface_section c WHERE c.change_set_id=draft AND c.parent_section_id=s.id)
   AND EXISTS(SELECT 1 FROM metadata.entity_surface_field_binding b WHERE b.change_set_id=draft AND b.entity_surface_section_id=s.id))
 THEN RAISE EXCEPTION 'NATIVE_LAYOUT_MIXED_CHILDREN' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_field_binding b
   LEFT JOIN metadata.entity_surface v ON v.id=b.entity_surface_id
   LEFT JOIN metadata.entity_surface_section s ON s.id=b.entity_surface_section_id
   LEFT JOIN metadata.entity_field f ON f.id=b.entity_field_id
   WHERE b.change_set_id=draft AND (
     b.overlay_id IS NOT NULL OR v.id IS NULL OR v.change_set_id<>draft
     OR f.id IS NULL OR f.change_set_id<>draft
     OR v.entity_id<>root.entity_id OR f.entity_id<>root.entity_id
     OR v.tenant_id IS DISTINCT FROM root.tenant_id OR f.tenant_id IS DISTINCT FROM root.tenant_id
     OR (b.entity_surface_section_id IS NOT NULL AND (s.id IS NULL OR s.change_set_id<>draft OR s.entity_surface_id<>b.entity_surface_id OR s.content_kind<>'fields'))
     OR b.column_span>coalesce(s.column_count,v.column_count)
     OR (b.meaningful_for_form AND v.surface_kind<>'form')
     OR (b.binding_kind='reference_token' AND v.surface_kind<>'lookup')
     OR (b.binding_kind<>'reference_token' AND b.token_key IS NOT NULL)
     OR (b.component_display_id IS NOT NULL AND f.data_type='uuid')
     OR (b.label_override_id IS NOT NULL AND b.label_override_id=f.label_id)
     OR (b.component_input_id IS NOT NULL AND (v.surface_kind<>'form' OR f.write_mode='read_only' OR f.value_origin<>'stored'))
     OR (b.placeholder_label_id IS NOT NULL AND b.component_input_id IS NULL)
     OR (b.component_filter_id IS NULL AND num_nonnulls(b.filter_operators,b.default_filter_operator)<>0)
     OR (b.component_filter_id IS NOT NULL AND (coalesce(cardinality(b.filter_operators),0)=0 OR cardinality(b.filter_operators)<>(SELECT count(DISTINCT op) FROM unnest(b.filter_operators) op)))
     OR (b.default_filter_operator IS NOT NULL AND NOT (b.default_filter_operator=ANY(coalesce(b.filter_operators,ARRAY[]::text[]))))
     OR (num_nonnulls(b.reference_surface_key,b.reference_load_mode)>0 AND f.relation_id IS NULL)
   )) THEN RAISE EXCEPTION 'NATIVE_LAYOUT_BINDING_GRAPH_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_field_binding WHERE change_set_id=draft AND token_key IS NOT NULL GROUP BY entity_surface_id,token_key HAVING count(*)>1)
 THEN RAISE EXCEPTION 'NATIVE_LAYOUT_TOKEN_CONFLICT' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_surface_section WHERE change_set_id=draft
   GROUP BY entity_surface_id,navigation_group_id,parent_section_id
   HAVING min(position)<>1 OR max(position)<>count(*) OR count(DISTINCT position)<>count(*))
 OR EXISTS(SELECT 1 FROM metadata.entity_surface_field_binding WHERE change_set_id=draft
   GROUP BY entity_surface_id,overlay_id,entity_surface_section_id,binding_kind
   HAVING min(position)<>1 OR max(position)<>count(*) OR count(DISTINCT position)<>count(*))
 THEN RAISE EXCEPTION 'NATIVE_LAYOUT_ORDER_INVALID' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION metadata.native_layout_final_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE draft uuid; version integer;
BEGIN
 IF TG_TABLE_NAME='entity_change_set' THEN draft:=COALESCE(NEW.id,OLD.id);
 ELSE draft:=COALESCE(NEW.change_set_id,OLD.change_set_id); END IF;
 SELECT native_core_layout_version INTO STRICT version FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF version IS NOT NULL THEN PERFORM metadata.fn_assert_native_layout_graph(draft); END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE member text; BEGIN
 FOREACH member IN ARRAY ARRAY['entity_change_set','entity_surface','entity_surface_section','entity_surface_field_binding','entity_field','entity_surface_navigation_group'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER native_layout_final_guard AFTER INSERT OR UPDATE%s ON metadata.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_layout_final_guard()',CASE WHEN member='entity_change_set' THEN '' ELSE ' OR DELETE' END,member);
 END LOOP;
END $$;
