\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
    v_count integer;
    v_change_set_id uuid;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relkind = 'r'
       AND relation.relname = ANY (ARRAY[
            'entity_lifecycle_binding',
            'entity_lifecycle_operation_binding'
       ]);
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 Phase 5 lifecycle tables; found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relname = ANY (ARRAY[
            'entity_lifecycle_binding',
            'entity_lifecycle_operation_binding'
       ])
       AND relation.relrowsecurity
       AND relation.relforcerowsecurity;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Every Phase 5 lifecycle table must force RLS; found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_trigger AS trigger
      JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relname = ANY (ARRAY[
            'entity_lifecycle_binding',
            'entity_lifecycle_operation_binding'
       ])
       AND NOT trigger.tgisinternal;
    IF v_count <> 8 THEN
        RAISE EXCEPTION 'Expected 8 Phase 5 lifecycle triggers; found %', v_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_proc AS procedure
          JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'metadata'
           AND procedure.proname = 'trg_validate_entity_lifecycle_binding'
           AND EXISTS (
                SELECT 1
                  FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting
                 WHERE setting LIKE 'search_path=%'
           )
    ) THEN
        RAISE EXCEPTION 'Phase 5 lifecycle validator must fix search_path';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'metadata'
           AND table_name = 'entity_operation'
           AND column_name = 'lifecycle_transition_code'
    ) THEN
        RAISE EXCEPTION 'Lifecycle transition ownership still leaks into metadata.entity_operation';
    END IF;

    SELECT change_set.id INTO v_change_set_id
      FROM metadata.entity_change_set AS change_set
      JOIN metadata.entity AS entity ON entity.id = change_set.entity_id
     WHERE entity.entity_code = 'business_partner'
       AND change_set.change_set_code = 'p2_7_studio_draft';

    IF (SELECT count(*) FROM metadata.entity_lifecycle_binding WHERE change_set_id = v_change_set_id) <> 1
       OR (SELECT count(*) FROM metadata.entity_lifecycle_operation_binding WHERE change_set_id = v_change_set_id) <> 2 THEN
        RAISE EXCEPTION 'Phase 5 Business Partner lifecycle fixture is incomplete';
    END IF;
END;
$$;

ROLLBACK;

\echo 'META_ENTITY_PHASE5_LIFECYCLE_SMOKE_OK tables=2 triggers=8 bindings=1 mappings=2'
