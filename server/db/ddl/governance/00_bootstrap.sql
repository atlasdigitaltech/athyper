-- ============================================================================
-- governance/00_bootstrap.sql
-- Pre-table schema types and sequences.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION governance.validate_domain_data(p_data jsonb, p_schema jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'governance', 'pg_catalog'
AS $function$
DECLARE
    v_key      text;
    v_prop_def jsonb;
    v_val_type text;
    v_actual   jsonb;
    v_enum_arr jsonb;
BEGIN
    IF p_data IS NULL OR p_data = '{}'::jsonb THEN RETURN; END IF;
    IF p_schema IS NULL THEN RETURN; END IF;

    -- Required keys
    IF p_schema ? 'required' THEN
        FOR v_key IN SELECT jsonb_array_elements_text(p_schema->'required') LOOP
            IF NOT (p_data ? v_key) THEN
                RAISE EXCEPTION 'domain_data missing required key: "%"', v_key;
            END IF;
        END LOOP;
    END IF;

    -- Property type + enum validation
    IF p_schema ? 'properties' THEN
        FOR v_key, v_prop_def IN SELECT * FROM jsonb_each(p_schema->'properties') LOOP
            IF NOT (p_data ? v_key) THEN CONTINUE; END IF;
            v_actual := p_data->v_key;
            v_val_type := v_prop_def->>'type';

            IF v_val_type IS NOT NULL THEN
                CASE v_val_type
                    WHEN 'string'  THEN
                        IF jsonb_typeof(v_actual) <> 'string'  THEN
                            RAISE EXCEPTION 'domain_data.% must be string, got %',  v_key, jsonb_typeof(v_actual);
                        END IF;
                    WHEN 'number'  THEN
                        IF jsonb_typeof(v_actual) <> 'number'  THEN
                            RAISE EXCEPTION 'domain_data.% must be number, got %',  v_key, jsonb_typeof(v_actual);
                        END IF;
                    WHEN 'boolean' THEN
                        IF jsonb_typeof(v_actual) <> 'boolean' THEN
                            RAISE EXCEPTION 'domain_data.% must be boolean, got %', v_key, jsonb_typeof(v_actual);
                        END IF;
                    WHEN 'array'   THEN
                        IF jsonb_typeof(v_actual) <> 'array'   THEN
                            RAISE EXCEPTION 'domain_data.% must be array, got %',   v_key, jsonb_typeof(v_actual);
                        END IF;
                    WHEN 'object'  THEN
                        IF jsonb_typeof(v_actual) <> 'object'  THEN
                            RAISE EXCEPTION 'domain_data.% must be object, got %',  v_key, jsonb_typeof(v_actual);
                        END IF;
                    ELSE NULL;
                END CASE;
            END IF;

            v_enum_arr := v_prop_def->'enum';
            IF v_enum_arr IS NOT NULL AND jsonb_typeof(v_enum_arr) = 'array' THEN
                IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_enum_arr) e WHERE e = v_actual) THEN
                    RAISE EXCEPTION 'domain_data.% value % not in allowed enum %', v_key, v_actual, v_enum_arr;
                END IF;
            END IF;
        END LOOP;
    END IF;
END;
$function$;
