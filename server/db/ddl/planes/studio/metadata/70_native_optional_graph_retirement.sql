-- Final native-foundation contraction. Flow and numbering remain shared
-- onboarding/snapshot contracts and are deliberately outside this retirement.
DO $retire$
DECLARE relation text; populated boolean;
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
END $retire$;

DROP TABLE IF EXISTS metadata.entity_surface_component_binding;
DROP TABLE IF EXISTS metadata.entity_contract_test_case;
DROP TABLE IF EXISTS metadata.entity_change_case_binding;
DROP TABLE IF EXISTS metadata.entity_materialization_field_mapping;
DROP TABLE IF EXISTS metadata.entity_materialization_binding;
DROP TABLE IF EXISTS metadata.entity_lifecycle_operation_binding;
DROP TABLE IF EXISTS metadata.entity_lifecycle_binding;
DROP FUNCTION IF EXISTS metadata.trg_validate_entity_lifecycle_binding();
