-- Retire tenant QA restoration after removing its application callers.
-- No data disposal or CASCADE; applied migration history remains immutable.
DO $retire$
DECLARE populated boolean;
BEGIN
  IF to_regclass('publication.entity_runtime_restoration_link') IS NOT NULL THEN
    LOCK TABLE publication.entity_runtime_restoration_link IN ACCESS EXCLUSIVE MODE;
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM publication.entity_runtime_restoration_link)' INTO populated;
    IF populated THEN RAISE EXCEPTION 'RUNTIME_RESTORATION_RETIREMENT_REQUIRES_EMPTY_TABLE'; END IF;
  END IF;
END $retire$;
DROP FUNCTION IF EXISTS publication.fn_prepare_runtime_restoration(uuid);
DROP FUNCTION IF EXISTS publication.fn_runtime_restoration_compilation_source(uuid);
DROP TABLE IF EXISTS publication.entity_runtime_restoration_link;
