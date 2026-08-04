REVOKE ALL ON runtime_meta.entity_contract FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION runtime_meta.trg_guard_entity_contract() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA runtime_meta TO athyperapp;
        GRANT SELECT ON runtime_meta.entity_contract TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA runtime_meta TO athyperadmin;
        GRANT ALL PRIVILEGES ON runtime_meta.entity_contract TO athyperadmin;
        GRANT EXECUTE ON FUNCTION runtime_meta.trg_guard_entity_contract()
            TO athyperadmin;
    END IF;
END;
$$;
