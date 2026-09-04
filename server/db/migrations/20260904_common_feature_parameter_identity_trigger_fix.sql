-- Keep shared trigger-record access table-specific. PostgreSQL resolves fields
-- on a trigger record at runtime, so NEW.code must never be evaluated for the
-- override/value tables that do not expose a code column.
BEGIN;

CREATE OR REPLACE FUNCTION control.trg_guard_feature_parameter_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'identity and creation evidence are immutable on %.%',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME IN ('feature_flag_catalog', 'parameter_definition') THEN
        IF NEW.code IS DISTINCT FROM OLD.code THEN
            RAISE EXCEPTION 'catalog code is immutable on %', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'feature_flag_override' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.feature_flag_id IS DISTINCT FROM OLD.feature_flag_id THEN
            RAISE EXCEPTION 'feature-flag override coordinates are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'tenant_parameter_value' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.parameter_definition_id IS DISTINCT FROM OLD.parameter_definition_id THEN
            RAISE EXCEPTION 'tenant parameter-value coordinates are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'deprecated feature and parameter records cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
