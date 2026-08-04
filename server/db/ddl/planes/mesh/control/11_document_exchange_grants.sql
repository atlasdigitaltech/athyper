REVOKE ALL ON control.network_document_type FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION control.trg_guard_network_document_type() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON control.network_document_type TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.network_document_type TO athyperadmin;
        GRANT EXECUTE ON FUNCTION control.trg_guard_network_document_type()
            TO athyperadmin;
    END IF;
END;
$$;
