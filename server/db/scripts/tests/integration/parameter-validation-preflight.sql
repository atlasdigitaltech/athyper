-- psql -X -v ON_ERROR_STOP=1 -f parameter-validation-preflight.sql
-- Only session-local temporary functions are created; persistent data/functions remain unchanged.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout='120s';
-- Fail instead of auditing only the subset visible through tenant RLS.
SET LOCAL row_security=off;
-- Reject JSON that cannot be consumed by the API without non-finite numbers or excess nesting.
CREATE OR REPLACE FUNCTION pg_temp.parameter_json_is_api_compatible(p_value jsonb, p_depth integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE
    v_child jsonb;
    v_number double precision;
BEGIN
    IF p_value IS NULL OR p_depth > 64 THEN RETURN false; END IF;
    CASE jsonb_typeof(p_value)
      WHEN 'number' THEN
        BEGIN
            v_number := p_value::text::double precision;
        EXCEPTION WHEN numeric_value_out_of_range THEN RETURN false;
        END;
        RETURN v_number NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision);
      WHEN 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
            IF NOT pg_temp.parameter_json_is_api_compatible(v_child,p_depth+1) THEN RETURN false; END IF;
        END LOOP;
      WHEN 'object' THEN
        FOR v_child IN SELECT value FROM jsonb_each(p_value) LOOP
            IF NOT pg_temp.parameter_json_is_api_compatible(v_child,p_depth+1) THEN RETURN false; END IF;
        END LOOP;
      ELSE NULL;
    END CASE;
    RETURN true;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.parameter_value_matches_definition(
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
    v_allowed jsonb;
    v_matches boolean := false;
BEGIN
    IF NOT pg_temp.parameter_json_is_api_compatible(p_value)
       OR p_value_type IS NULL OR p_value_type NOT IN ('boolean','integer','number','string','enum','duration','json') THEN
        RETURN false;
    END IF;
    CASE p_value_type
      WHEN 'boolean' THEN IF jsonb_typeof(p_value) <> 'boolean' THEN RETURN false; END IF;
      WHEN 'string' THEN IF jsonb_typeof(p_value) <> 'string' THEN RETURN false; END IF;
      WHEN 'integer' THEN
        IF jsonb_typeof(p_value) <> 'number' THEN RETURN false; END IF;
        v_numeric_value := p_value::text::numeric;
        IF trunc(v_numeric_value) <> v_numeric_value OR abs(v_numeric_value) > 9007199254740991 THEN RETURN false; END IF;
      WHEN 'number' THEN IF jsonb_typeof(p_value) <> 'number' THEN RETURN false; END IF;
      WHEN 'enum' THEN
        IF jsonb_typeof(p_value) NOT IN ('string','number','boolean') OR p_allowed_values IS NULL THEN RETURN false; END IF;
      WHEN 'duration' THEN
        IF jsonb_typeof(p_value) <> 'string' THEN RETURN false; END IF;
        IF (p_value #>> '{}') !~ '^P([0-9]+D)?(T([0-9]+H)?([0-9]+M)?([0-9]+([.][0-9]+)?S)?)?$'
           OR (p_value #>> '{}') IN ('P','PT') OR (p_value #>> '{}') ~ 'T$' THEN RETURN false; END IF;
      ELSE NULL;
    END CASE;

    -- SQL NULL means no bound. JSON null and non-number bounds are invalid configuration.
    IF p_min_value IS NOT NULL OR p_max_value IS NOT NULL THEN
        IF p_value_type NOT IN ('integer','number') THEN RETURN false; END IF;
        IF p_min_value IS NOT NULL AND (jsonb_typeof(p_min_value) <> 'number'
           OR NOT pg_temp.parameter_json_is_api_compatible(p_min_value)) THEN RETURN false; END IF;
        IF p_max_value IS NOT NULL AND (jsonb_typeof(p_max_value) <> 'number'
           OR NOT pg_temp.parameter_json_is_api_compatible(p_max_value)) THEN RETURN false; END IF;
        IF p_min_value IS NOT NULL AND p_max_value IS NOT NULL
           AND p_min_value::text::numeric > p_max_value::text::numeric THEN RETURN false; END IF;
        v_numeric_value := p_value::text::numeric;
        IF p_min_value IS NOT NULL AND v_numeric_value < p_min_value::text::numeric THEN RETURN false; END IF;
        IF p_max_value IS NOT NULL AND v_numeric_value > p_max_value::text::numeric THEN RETURN false; END IF;
    END IF;

    IF p_allowed_values IS NOT NULL THEN
        IF jsonb_typeof(p_allowed_values) <> 'array' THEN RETURN false; END IF;
        FOR v_allowed IN SELECT value FROM jsonb_array_elements(p_allowed_values) LOOP
            IF NOT pg_temp.parameter_json_is_api_compatible(v_allowed) THEN RETURN false; END IF;
            -- Full jsonb equality preserves array order and scalar types, unlike containment.
            IF v_allowed = p_value THEN v_matches := true; END IF;
        END LOOP;
        IF NOT v_matches THEN RETURN false; END IF;
    END IF;
    RETURN true;
END;
$$;

SELECT 'definition' AS kind,d.id,NULL::uuid AS tenant_id,d.code
FROM control.parameter_definition d
WHERE NOT pg_temp.parameter_value_matches_definition(d.default_value,d.value_type,d.min_value,d.max_value,d.allowed_values)
UNION ALL
SELECT 'override',v.id,v.tenant_id,d.code
FROM control.tenant_parameter_value v LEFT JOIN control.parameter_definition d ON d.id=v.parameter_definition_id
WHERE d.id IS NULL OR NOT pg_temp.parameter_value_matches_definition(v.value,d.value_type,d.min_value,d.max_value,d.allowed_values)
ORDER BY kind,code,id;
ROLLBACK;
