DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT,INSERT,UPDATE ON
            document.bank_statement,
            document.bank_statement_line,
            document.bank_recon_case,
            document.depreciation_run,
            document.depreciation_schedule
        TO athyperapp;
        GRANT SELECT,INSERT ON
            document.bank_recon_case_line,
            document.depreciation_run_line
        TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            document.bank_statement,
            document.bank_statement_line,
            document.bank_recon_case,
            document.bank_recon_case_line,
            document.depreciation_run,
            document.depreciation_run_line,
            document.depreciation_schedule
        TO athyperadmin;
    END IF;
END;
$$;
