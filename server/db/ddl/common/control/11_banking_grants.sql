REVOKE ALL ON control.bank_account_validation_rule FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON control.bank_account_validation_rule TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.resolve_bank_account_validation_rule(char, text, control.bank_validation_direction_d, char)
            TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.bank_account_validation_rule TO athyperadmin;
        GRANT EXECUTE ON FUNCTION control.resolve_bank_account_validation_rule(char, text, control.bank_validation_direction_d, char)
            TO athyperadmin;
    END IF;
END;
$$;
