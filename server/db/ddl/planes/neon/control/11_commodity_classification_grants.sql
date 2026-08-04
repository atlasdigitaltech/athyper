REVOKE ALL ON control.commodity_code_classification_policy FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE
            ON control.commodity_code_classification_policy TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES
            ON control.commodity_code_classification_policy TO athyperadmin;
    END IF;
END;
$$;
