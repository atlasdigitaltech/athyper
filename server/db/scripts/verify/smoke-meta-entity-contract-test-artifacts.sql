\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_tables integer; v_policies integer; v_triggers integer;
BEGIN
    SELECT count(*) INTO v_tables FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='snapshot' AND r.relkind='r'
       AND r.relname=ANY(ARRAY['entity_contract_test_run','entity_contract_test_result']);
    IF v_tables <> 2 THEN RAISE EXCEPTION 'Expected 2 contract-test artifact tables; found %', v_tables; END IF;

    SELECT count(*) INTO v_policies FROM pg_policies
     WHERE schemaname='snapshot' AND tablename=ANY(ARRAY['entity_contract_test_run','entity_contract_test_result']);
    IF v_policies <> 4 THEN RAISE EXCEPTION 'Expected 4 contract-test artifact RLS policies; found %', v_policies; END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='snapshot' AND r.relname=ANY(ARRAY['entity_contract_test_run','entity_contract_test_result']) AND NOT t.tgisinternal;
    IF v_triggers <> 4 THEN RAISE EXCEPTION 'Expected 4 contract-test artifact triggers; found %', v_triggers; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='metadata'
      AND table_name='entity_contract_test_case' AND column_name LIKE 'last_run%')
    THEN RAISE EXCEPTION 'Mutable execution state leaked into metadata.entity_contract_test_case'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='snapshot' AND p.proname='trg_validate_entity_contract_test_run'
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%'))
    THEN RAISE EXCEPTION 'Contract-test run validator must fix search_path'; END IF;
END $$;
ROLLBACK;
\echo 'META_ENTITY_CONTRACT_TEST_ARTIFACT_SMOKE_OK tables=2 policies=4 triggers=4'
