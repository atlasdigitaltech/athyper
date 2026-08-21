\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_policies integer; v_triggers integer;
BEGIN
    IF to_regclass('snapshot.entity_numbering_test_artifact') IS NULL
    THEN RAISE EXCEPTION 'Missing snapshot.entity_numbering_test_artifact'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='snapshot' AND r.relname='entity_numbering_test_artifact'
        AND r.relrowsecurity AND r.relforcerowsecurity)
    THEN RAISE EXCEPTION 'Numbering test artifact must enable and force RLS'; END IF;

    SELECT count(*) INTO v_policies FROM pg_policies
     WHERE schemaname='snapshot' AND tablename='entity_numbering_test_artifact';
    IF v_policies <> 2 THEN RAISE EXCEPTION 'Expected 2 numbering artifact RLS policies; found %', v_policies; END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='snapshot' AND r.relname='entity_numbering_test_artifact' AND NOT t.tgisinternal;
    IF v_triggers <> 2 THEN RAISE EXCEPTION 'Expected validation and immutability triggers; found %', v_triggers; END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='snapshot'
      AND table_name='entity_numbering_test_artifact' AND column_name IN ('counter_id','allocated_value','allocation_id'))
    THEN RAISE EXCEPTION 'Allocation/counter state leaked into immutable preview artifacts'; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='snapshot' AND p.proname='trg_validate_entity_numbering_test_artifact'
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%'))
    THEN RAISE EXCEPTION 'Numbering artifact validator must fix search_path'; END IF;
END $$;
ROLLBACK;
\echo 'META_ENTITY_NUMBERING_TEST_ARTIFACT_SMOKE_OK table=1 policies=2 triggers=2 counter_state=0'
