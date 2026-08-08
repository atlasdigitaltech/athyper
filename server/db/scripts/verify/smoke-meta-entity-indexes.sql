\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_count integer; v_change_set_id uuid;
BEGIN
    SELECT count(*) INTO v_count FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='metadata' AND r.relkind='r' AND r.relname=ANY(ARRAY[
       'entity_surface_operation','entity_operation_rule','entity_flow','entity_flow_step',
       'entity_policy_binding','entity_field_policy_binding','entity_contract_test_case']);
    IF v_count <> 7 THEN RAISE EXCEPTION 'Expected 7 Phase 4 tables; found %', v_count; END IF;

    SELECT count(*) INTO v_count FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='metadata' AND r.relname=ANY(ARRAY[
       'entity_surface_operation','entity_operation_rule','entity_flow','entity_flow_step',
       'entity_policy_binding','entity_field_policy_binding','entity_contract_test_case'])
       AND r.relrowsecurity AND r.relforcerowsecurity;
    IF v_count <> 7 THEN RAISE EXCEPTION 'Every Phase 4 table must force RLS; found %', v_count; END IF;

    SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='metadata' AND r.relname=ANY(ARRAY[
       'entity_surface_operation','entity_operation_rule','entity_flow','entity_flow_step',
       'entity_policy_binding','entity_field_policy_binding','entity_contract_test_case']) AND NOT t.tgisinternal;
    IF v_count <> 28 THEN RAISE EXCEPTION 'Expected 28 Phase 4 triggers; found %', v_count; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='metadata' AND p.proname='trg_validate_entity_phase4_binding'
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%'))
    THEN RAISE EXCEPTION 'Phase 4 validator must fix search_path'; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='metadata'
      AND ((table_name='entity_flow_step' AND column_name LIKE '%field%')
        OR (table_name IN ('entity_policy_binding','entity_field_policy_binding') AND column_name IN ('rule_body','policy_body'))
        OR (table_name='entity_contract_test_case' AND column_name LIKE 'last_run%')))
    THEN RAISE EXCEPTION 'Phase 4 ownership boundary contains duplicated or mutable runtime state'; END IF;

    SELECT cs.id INTO v_change_set_id FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id
     WHERE e.entity_code='business_partner' AND cs.change_set_code='p2_7_studio_draft';
    IF (SELECT count(*) FROM metadata.entity_surface_operation WHERE change_set_id=v_change_set_id) <> 2
       OR (SELECT count(*) FROM metadata.entity_operation_rule WHERE change_set_id=v_change_set_id) <> 2
       OR (SELECT count(*) FROM metadata.entity_flow WHERE change_set_id=v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_policy_binding WHERE change_set_id=v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_field_policy_binding WHERE change_set_id=v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_contract_test_case WHERE change_set_id=v_change_set_id) <> 3
    THEN RAISE EXCEPTION 'Phase 4 Business Partner fixture is incomplete'; END IF;
END;
$$;
ROLLBACK;
\echo 'META_ENTITY_PHASE4_SMOKE_OK tables=7 triggers=28 flow=1 policies=2 tests=3'
