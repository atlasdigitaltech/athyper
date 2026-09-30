-- Pre-alignment validator, preserved only for migration tests.
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
