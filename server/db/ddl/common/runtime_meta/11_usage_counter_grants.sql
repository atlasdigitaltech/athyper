REVOKE ALL ON runtime_meta.tenant_usage_counter FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON runtime_meta.tenant_usage_counter TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON runtime_meta.tenant_usage_counter TO athyperadmin;
    END IF;
END;
$$;
