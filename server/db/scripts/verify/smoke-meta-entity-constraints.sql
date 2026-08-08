\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relkind = 'r'
       AND relation.relname = ANY (ARRAY[
            'entity_surface',
            'entity_surface_section',
            'entity_surface_field_binding',
            'entity_operation'
       ]);
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Expected 4 Phase 3 metadata tables; found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relname = ANY (ARRAY[
            'entity_surface',
            'entity_surface_section',
            'entity_surface_field_binding',
            'entity_operation'
       ])
       AND relation.relrowsecurity
       AND relation.relforcerowsecurity;
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Every Phase 3 metadata table must have enabled and forced RLS; found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'metadata'
       AND procedure.proname = ANY (ARRAY[
            'trg_validate_entity_surface_binding',
            'trg_validate_entity_operation_references'
       ])
       AND EXISTS (
            SELECT 1
              FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting
             WHERE setting LIKE 'search_path=%'
       );
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Every Phase 3 function must fix search_path; found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_trigger AS trigger
      JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relname = ANY (ARRAY[
            'entity_surface',
            'entity_surface_section',
            'entity_surface_field_binding',
            'entity_operation'
       ])
       AND NOT trigger.tgisinternal;
    IF v_count <> 15 THEN
        RAISE EXCEPTION 'Expected 15 Phase 3 validation/audit triggers; found %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'metadata'
           AND table_name = 'entity_surface_field_binding'
           AND column_name = ANY (ARRAY[
                'data_type', 'type_config', 'validation_spec', 'storage_path'
           ])
    ) THEN
        RAISE EXCEPTION 'Semantic field contract properties leaked into surface bindings';
    END IF;

    IF (SELECT count(*) FROM metadata.entity_surface) < 1
       OR (SELECT count(*) FROM metadata.entity_surface_section) < 2
       OR (SELECT count(*) FROM metadata.entity_surface_field_binding) < 6
       OR (SELECT count(*) FROM metadata.entity_operation) < 2 THEN
        RAISE EXCEPTION 'The P3 Business Partner example graph is incomplete';
    END IF;
END;
$$;

ROLLBACK;

\echo 'META_ENTITY_PHASE3_SMOKE_OK tables=4 triggers=15 fixed_path_functions=2 example=1'
