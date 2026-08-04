REVOKE ALL ON master.warehouse FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON master.warehouse TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON master.warehouse TO athyperadmin;
        GRANT EXECUTE ON FUNCTION master.trg_guard_warehouse_identity() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION master.trg_validate_warehouse_type() TO athyperadmin;
    END IF;
END;
$$;
