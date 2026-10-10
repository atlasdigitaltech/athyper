-- Retire unused optional Entity graph storage. This is intentionally bounded:
-- metadata.entity_flow, metadata.entity_flow_step, and
-- metadata.entity_numbering_binding remain for their independent onboarding
-- and snapshot consumers.
DO $retire$
DECLARE relation text; populated boolean; definition text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'metadata.entity_surface_component_binding',
    'metadata.entity_contract_test_case',
    'metadata.entity_change_case_binding',
    'metadata.entity_materialization_field_mapping',
    'metadata.entity_materialization_binding',
    'metadata.entity_lifecycle_operation_binding',
    'metadata.entity_lifecycle_binding'
  ] LOOP
    IF to_regclass(relation) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', relation);
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s)', relation) INTO populated;
      IF populated THEN
        RAISE EXCEPTION 'NATIVE_OPTIONAL_GRAPH_RETIREMENT_REQUIRES_EMPTY_TABLE: %', relation;
      END IF;
    END IF;
  END LOOP;

  -- Existing installations carry the pre-retirement implementation. Rebuild
  -- its function text before relations disappear; new installations receive
  -- the cleaned canonical definitions directly.
  SELECT pg_get_functiondef('metadata.fn_validate_entity_graph(uuid)'::regprocedure) INTO definition;
  definition := replace(definition, E'\n        + (SELECT count(*) FROM metadata.entity_contract_test_case WHERE change_set_id = p_change_set_id)\n        + (SELECT count(*) FROM metadata.entity_lifecycle_binding WHERE change_set_id = p_change_set_id)\n        + (SELECT count(*) FROM metadata.entity_lifecycle_operation_binding WHERE change_set_id = p_change_set_id)', '');
  definition := replace(definition, E'\n    SELECT lifecycle.binding_key INTO v_problem_path\n      FROM metadata.entity_lifecycle_binding AS lifecycle\n     WHERE lifecycle.change_set_id = p_change_set_id\n       AND lifecycle.status = \'active\'\n       AND lifecycle.required\n       AND NOT EXISTS (\n            SELECT 1\n              FROM metadata.entity_lifecycle_operation_binding AS operation_binding\n             WHERE operation_binding.entity_lifecycle_binding_id = lifecycle.id\n               AND operation_binding.status = \'active\'\n       )\n     LIMIT 1;\n    IF FOUND THEN\n        RAISE EXCEPTION \'ENTITY_LIFECYCLE_OPERATION_REQUIRED\'\n            USING ERRCODE = \'check_violation\', DETAIL = \'lifecycle.\' || v_problem_path;\n    END IF;\n', E'\n');
  EXECUTE definition;

  SELECT pg_get_functiondef('metadata.fn_assert_native_authoring_snapshot(uuid,text,integer)'::regprocedure) INTO definition;
  FOREACH relation IN ARRAY ARRAY[
    'entity_change_case_binding','entity_contract_test_case',
    'entity_lifecycle_binding','entity_lifecycle_operation_binding',
    'entity_materialization_binding'
  ] LOOP
    definition := replace(definition, format(',''%s''', relation), '');
  END LOOP;
  definition := replace(definition, E'\n IF EXISTS(SELECT 1 FROM metadata.entity_materialization_field_mapping m JOIN metadata.entity_materialization_binding b ON b.id=m.entity_materialization_binding_id WHERE b.change_set_id=draft AND m.tenant_id IS DISTINCT FROM root.tenant_id) THEN RAISE EXCEPTION \'NATIVE_SNAPSHOT_MAPPING_OWNER_INVALID\' USING ERRCODE=\'23514\'; END IF;', '');
  EXECUTE definition;

  SELECT pg_get_functiondef('metadata.native_snapshot_final_guard()'::regprocedure) INTO definition;
  definition := replace(definition, E' IF TG_TABLE_NAME=\'entity_materialization_field_mapping\' THEN', ' IF FALSE THEN');
  EXECUTE definition;
END $retire$;

DROP TABLE IF EXISTS metadata.entity_surface_component_binding;
DROP TABLE IF EXISTS metadata.entity_contract_test_case;
DROP TABLE IF EXISTS metadata.entity_change_case_binding;
DROP TABLE IF EXISTS metadata.entity_materialization_field_mapping;
DROP TABLE IF EXISTS metadata.entity_materialization_binding;
DROP TABLE IF EXISTS metadata.entity_lifecycle_operation_binding;
DROP TABLE IF EXISTS metadata.entity_lifecycle_binding;
DROP FUNCTION IF EXISTS metadata.trg_validate_entity_lifecycle_binding();
