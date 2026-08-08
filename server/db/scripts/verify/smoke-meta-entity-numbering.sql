\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_count integer; v_change_set_id uuid;
BEGIN
    IF to_regclass('metadata.entity_numbering_binding') IS NULL THEN
        RAISE EXCEPTION 'metadata.entity_numbering_binding is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_class AS relation JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
         WHERE namespace.nspname='metadata' AND relation.relname='entity_numbering_binding'
           AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) THEN RAISE EXCEPTION 'metadata.entity_numbering_binding must force RLS'; END IF;
    SELECT count(*) INTO v_count FROM pg_trigger AS trigger
      JOIN pg_class AS relation ON relation.oid=trigger.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
     WHERE namespace.nspname='metadata' AND relation.relname='entity_numbering_binding' AND NOT trigger.tgisinternal;
    IF v_count <> 4 THEN RAISE EXCEPTION 'Expected 4 numbering binding triggers; found %',v_count; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc AS procedure JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
       WHERE namespace.nspname='metadata' AND procedure.proname='trg_validate_entity_numbering_binding'
         AND EXISTS (SELECT 1 FROM unnest(coalesce(procedure.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%')
    ) THEN RAISE EXCEPTION 'Numbering binding validator must fix search_path'; END IF;
    SELECT change_set.id INTO v_change_set_id FROM metadata.entity_change_set AS change_set
      JOIN metadata.entity AS entity ON entity.id=change_set.entity_id
     WHERE entity.entity_code='business_partner' AND change_set.change_set_code='p2_7_studio_draft';
    IF (SELECT count(*) FROM metadata.entity_numbering_binding WHERE change_set_id=v_change_set_id) <> 1 THEN
        RAISE EXCEPTION 'Business Partner numbering fixture is incomplete';
    END IF;
END $$;
ROLLBACK;
\echo 'META_ENTITY_PHASE5_NUMBERING_SMOKE_OK table=1 triggers=4 bindings=1'
