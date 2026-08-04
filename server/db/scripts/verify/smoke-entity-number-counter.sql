DO $$
DECLARE v_count integer;
BEGIN
    IF to_regclass('runtime_meta.entity_number_counter') IS NULL THEN
        RAISE EXCEPTION 'runtime_meta.entity_number_counter is missing';
    END IF;
    SELECT count(*) INTO v_count FROM information_schema.columns
     WHERE table_schema='runtime_meta' AND table_name='entity_number_counter'
       AND column_name=ANY(ARRAY['tenant_id','numbering_policy_id','scope_key','reset_bucket','next_value',
         'allocation_count','row_version','last_allocated_value','last_allocation_id','last_correlation_id']);
    IF v_count <> 10 THEN RAISE EXCEPTION 'Counter contract columns are incomplete: %',v_count; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='runtime_meta' AND r.relname='entity_number_counter'
        AND r.relrowsecurity AND r.relforcerowsecurity) THEN
      RAISE EXCEPTION 'Entity number counter must force RLS';
    END IF;
    SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='runtime_meta' AND r.relname='entity_number_counter' AND NOT t.tgisinternal;
    IF v_count <> 2 THEN RAISE EXCEPTION 'Expected 2 counter triggers; found %',v_count; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='runtime_meta' AND p.proname='trg_validate_entity_number_counter'
        AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'Counter validator must fix search_path';
    END IF;
END $$;
\echo 'ENTITY_NUMBER_COUNTER_SMOKE_OK columns=10 triggers=2 forced_rls=true'
