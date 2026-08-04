CREATE OR REPLACE FUNCTION control.parameter_value_matches_definition(
    p_value jsonb,
    p_value_type text,
    p_min_value jsonb,
    p_max_value jsonb,
    p_allowed_values jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_numeric_value numeric;
BEGIN
    IF p_value_type = 'boolean' AND jsonb_typeof(p_value) <> 'boolean' THEN
        RETURN false;
    ELSIF p_value_type = 'integer'
          AND (jsonb_typeof(p_value) <> 'number' OR p_value::text !~ '^-?[0-9]+$') THEN
        RETURN false;
    ELSIF p_value_type = 'number' AND jsonb_typeof(p_value) <> 'number' THEN
        RETURN false;
    ELSIF p_value_type IN ('string', 'enum') AND jsonb_typeof(p_value) <> 'string' THEN
        RETURN false;
    ELSIF p_value_type = 'duration' AND jsonb_typeof(p_value) NOT IN ('number', 'string') THEN
        RETURN false;
    END IF;

    IF p_allowed_values IS NOT NULL
       AND NOT (p_allowed_values @> jsonb_build_array(p_value)) THEN
        RETURN false;
    END IF;

    IF p_value_type IN ('integer', 'number') THEN
        v_numeric_value := p_value::text::numeric;
        IF p_min_value IS NOT NULL AND v_numeric_value < p_min_value::text::numeric THEN
            RETURN false;
        END IF;
        IF p_max_value IS NOT NULL AND v_numeric_value > p_max_value::text::numeric THEN
            RETURN false;
        END IF;
    END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_parameter_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NOT control.parameter_value_matches_definition(
        NEW.default_value, NEW.value_type, NEW.min_value, NEW.max_value, NEW.allowed_values
    ) THEN
        RAISE EXCEPTION 'invalid default value for parameter %', NEW.code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tenant_parameter_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_definition control.parameter_definition;
BEGIN
    SELECT * INTO v_definition
      FROM control.parameter_definition
     WHERE id = NEW.parameter_definition_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown parameter definition: %', NEW.parameter_definition_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_definition.status <> 'active' OR NOT v_definition.tenant_can_override THEN
        RAISE EXCEPTION 'parameter % cannot be tenant-overridden', v_definition.code
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT control.parameter_value_matches_definition(
        NEW.value, v_definition.value_type, v_definition.min_value,
        v_definition.max_value, v_definition.allowed_values
    ) THEN
        RAISE EXCEPTION 'invalid value for parameter %', v_definition.code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

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

    IF TG_TABLE_NAME IN ('feature_flag_catalog', 'parameter_definition')
       AND NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'catalog code is immutable on %', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    ELSIF TG_TABLE_NAME = 'feature_flag_override'
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.feature_flag_id IS DISTINCT FROM OLD.feature_flag_id) THEN
        RAISE EXCEPTION 'feature-flag override coordinates are immutable'
            USING ERRCODE = 'check_violation';
    ELSIF TG_TABLE_NAME = 'tenant_parameter_value'
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.parameter_definition_id IS DISTINCT FROM OLD.parameter_definition_id) THEN
        RAISE EXCEPTION 'tenant parameter-value coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'deprecated feature and parameter records cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
