-- Retire operator archive replay; native publication and delivery recovery stay.
DO $retire$
DECLARE relation text; populated boolean;
BEGIN
  FOREACH relation IN ARRAY ARRAY['metadata.publication_recovery_revocation','metadata.publication_recovery_archive'] LOOP
    IF to_regclass(relation) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', relation);
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s)', relation) INTO populated;
      IF populated THEN RAISE EXCEPTION 'PUBLICATION_ARCHIVE_RETIREMENT_REQUIRES_EMPTY_TABLE: %', relation; END IF;
    END IF;
  END LOOP;
END $retire$;
DROP FUNCTION IF EXISTS metadata.fn_import_publication_recovery(uuid,uuid,text,text,text,jsonb,text,timestamptz);
DROP FUNCTION IF EXISTS metadata.fn_succeed_publication_recovery(uuid,uuid,jsonb,text,timestamptz);
DROP FUNCTION IF EXISTS metadata.fn_revoke_publication_recovery(uuid,text);
DROP TABLE IF EXISTS metadata.publication_recovery_revocation;
DROP TABLE IF EXISTS metadata.publication_recovery_archive;
