-- seed-pack-version: p4.0-v1
DO $assert_meta_entity_phase4$
DECLARE v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
BEGIN
    IF (SELECT count(*) FROM metadata.entity_surface_operation WHERE change_set_id=v_change_set_id) <> 2
       OR (SELECT count(*) FROM metadata.entity_operation_rule WHERE change_set_id=v_change_set_id) <> 2
       OR (SELECT count(*) FROM metadata.entity_flow WHERE change_set_id=v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_flow_step WHERE change_set_id=v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_policy_binding WHERE change_set_id=v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_field_policy_binding WHERE change_set_id=v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_contract_test_case WHERE change_set_id=v_change_set_id) <> 3 THEN
        RAISE EXCEPTION '[meta-entity P4] example graph coverage is incomplete';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='metadata' AND table_name='entity_contract_test_case' AND column_name LIKE 'last_run%') THEN
        RAISE EXCEPTION '[meta-entity P4] mutable execution state leaked into contract test definitions';
    END IF;
END
$assert_meta_entity_phase4$;
