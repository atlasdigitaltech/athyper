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
 FOREACH member_table IN ARRAY ARRAY['entity_access_permission','entity_ai_binding','entity_ai_field','entity_ai_profile','entity_ai_reference','entity_ai_term','entity_authorization_profile','entity_capability','entity_field','entity_field_access','entity_field_choice','entity_field_policy_binding','entity_field_reference_binding','entity_flow','entity_flow_step','entity_key','entity_key_field','entity_label','entity_label_translation','entity_numbering_binding','entity_operation','entity_operation_context_requirement','entity_operation_field','entity_operation_permission','entity_operation_rule','entity_operation_scope_binding','entity_policy_binding','entity_predicate','entity_relation','entity_relation_field','entity_relation_target','entity_runtime_profile','entity_search_field','entity_search_profile','entity_surface','entity_surface_field_binding','entity_surface_navigation_group','entity_surface_operation','entity_surface_section','entity_surface_view','entity_surface_view_field','entity_target'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM metadata.%I WHERE change_set_id=$1 AND (entity_id IS DISTINCT FROM $2 OR tenant_id IS DISTINCT FROM $3))',member_table)
   INTO invalid USING draft,root.entity_id,root.tenant_id;
  IF invalid THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_OWNER_INVALID:%',member_table USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM metadata.entity_label_translation t LEFT JOIN metadata.entity_label l ON l.id=t.label_id AND l.change_set_id=draft
  WHERE t.change_set_id=draft AND (l.id IS NULL OR t.locale_code=root.default_locale OR NOT(t.locale_code=ANY(root.required_locales))))
 THEN RAISE EXCEPTION 'NATIVE_SNAPSHOT_LABEL_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
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
 IF TG_OP<>'INSERT' THEN previous_draft:=(to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='entity_change_set' THEN 'id' ELSE 'change_set_id' END)::uuid; END IF;
 IF TG_OP<>'DELETE' THEN next_draft:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='entity_change_set' THEN 'id' ELSE 'change_set_id' END)::uuid; END IF;
 FOR draft IN SELECT DISTINCT value FROM unnest(ARRAY[previous_draft,next_draft]) value WHERE value IS NOT NULL ORDER BY value LOOP
  SELECT * INTO root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
  IF FOUND AND root.native_core_layout_version IS NOT NULL THEN
   PERFORM metadata.fn_assert_native_authoring_snapshot(draft,root.authoring_schema_hash,root.native_core_layout_version);
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
DO $$ DECLARE member_table text; BEGIN
 FOREACH member_table IN ARRAY ARRAY['entity_access_permission','entity_ai_binding','entity_ai_field','entity_ai_profile','entity_ai_reference','entity_ai_term','entity_authorization_profile','entity_capability','entity_field','entity_field_access','entity_field_choice','entity_field_policy_binding','entity_field_reference_binding','entity_flow','entity_flow_step','entity_key','entity_key_field','entity_label','entity_label_translation','entity_numbering_binding','entity_operation','entity_operation_context_requirement','entity_operation_field','entity_operation_permission','entity_operation_rule','entity_operation_scope_binding','entity_policy_binding','entity_predicate','entity_relation','entity_relation_field','entity_relation_target','entity_runtime_profile','entity_search_field','entity_search_profile','entity_surface','entity_surface_field_binding','entity_surface_navigation_group','entity_surface_operation','entity_surface_section','entity_surface_view','entity_surface_view_field','entity_target']||ARRAY['entity_change_set'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER native_snapshot_final_guard AFTER INSERT OR UPDATE OR DELETE ON metadata.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_snapshot_final_guard()',member_table);
 END LOOP;
END $$;
