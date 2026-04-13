-- 05_pre_constraint_functions/001_shared.sql
-- Execution order: 04_tables → THIS → 06_constraints
-- Depends on: 01_schemas (shared schema exists)
--
-- shared.current_tenant_id() is required by control.fn_valid_lookup() and
-- master.fn_valid_owner_type() which are called from 06_constraints CHECKs.

CREATE OR REPLACE FUNCTION shared.current_tenant_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = shared, pg_catalog
AS $$
DECLARE
    v text := current_setting('app.current_tenant_id', true);
BEGIN
    IF v IS NULL OR v = '' THEN
        RAISE EXCEPTION 'app.current_tenant_id session context is not set — '
            'ensure middleware calls SET app.current_tenant_id before queries'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN v::uuid;
EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'app.current_tenant_id is not a valid UUID: "%"', v
        USING ERRCODE = 'invalid_parameter_value';
END;
$$;
