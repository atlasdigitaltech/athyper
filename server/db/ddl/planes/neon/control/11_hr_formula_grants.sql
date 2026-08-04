DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.formula_expression,
            control.formula_expression_version,
            control.rate_table,
            control.rate_table_row
        TO athyperapp;

        GRANT EXECUTE ON FUNCTION control.trg_guard_published_formula_version()
        TO athyperapp;
    END IF;
END;
$$;
