REVOKE ALL ON control.risk_source_config, control.v_risk_source_config FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON control.v_risk_source_config TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON control.risk_source_config TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.risk_source_config TO athyperadmin;
        GRANT SELECT ON control.v_risk_source_config TO athyperadmin;
    END IF;
END;
$$;
