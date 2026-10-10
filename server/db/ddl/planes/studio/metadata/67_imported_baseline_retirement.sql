-- Retire unused imported-baseline publication after its application callers are removed.
-- No CASCADE and no data disposal: installations retaining this history must
-- explicitly dispose of or migrate it before this forward upgrade.
DO $retire$
DECLARE relation_name text; populated boolean;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'metadata.entity_baseline_import',
    'metadata.entity_baseline_import_revocation',
    'publication.entity_baseline_release_link',
    'publication.entity_authorization_successor_link',
    'publication.entity_authorization_successor_payload'
  ] LOOP
    IF to_regclass(relation_name) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', relation_name::regclass);
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s)', relation_name::regclass) INTO populated;
      IF populated THEN
        RAISE EXCEPTION 'IMPORTED_BASELINE_RETIREMENT_REQUIRES_EMPTY_TABLE: %', relation_name;
      END IF;
    END IF;
  END LOOP;
END $retire$;

DROP FUNCTION IF EXISTS publication.fn_initial_baseline_compilation_source(uuid);
DROP FUNCTION IF EXISTS publication.fn_authorization_successor_compilation_source(uuid);
DROP FUNCTION IF EXISTS publication.fn_prepare_initial_baseline_release(uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS publication.fn_prepare_authorization_successor(uuid,jsonb);
DROP TABLE IF EXISTS publication.entity_authorization_successor_link;
DROP TABLE IF EXISTS publication.entity_authorization_successor_payload;
DROP TABLE IF EXISTS publication.entity_baseline_release_link;
DROP TABLE IF EXISTS metadata.entity_baseline_import_revocation;
DROP TABLE IF EXISTS metadata.entity_baseline_import;
DROP FUNCTION IF EXISTS publication.trg_validate_baseline_release_link();
DROP FUNCTION IF EXISTS publication.trg_guard_global_baseline_link();
DROP FUNCTION IF EXISTS metadata.trg_revoke_unused_baseline();
