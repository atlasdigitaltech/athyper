REVOKE ALL ON ALL TABLES IN SCHEMA governance FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA governance FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA governance TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA governance TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA governance TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA governance TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA governance TO athyperadmin;
    END IF;
END;
$$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
  REVOKE INSERT,UPDATE,DELETE ON governance.cycle_subject FROM athyperapp;
END IF; END $$;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
  REVOKE UPDATE,DELETE ON governance.process_selection_evidence FROM athyperapp;
END IF; END $$;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
 REVOKE UPDATE,DELETE ON governance.process_attempt,governance.process_document_job FROM athyperapp;
END IF; END $$;
GRANT EXECUTE ON FUNCTION governance.evaluate_cycle_completion(uuid,uuid) TO athyperapp,athyperadmin;
