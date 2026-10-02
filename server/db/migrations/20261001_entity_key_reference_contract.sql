-- Studio metadata contract extension only; no reference data or permissions change.
BEGIN;
DO $$ BEGIN
    IF current_database() NOT LIKE '%studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='metadata.trg_validate_entity_field_contract()'::regprocedure)
       NOT IN ('094cf23ee64f2ebf719c45e7f7207d36', '8c392b82c80ff9ad8a68862942e57aae') THEN
        RAISE EXCEPTION 'Entity field validator changed; review before applying key-reference migration';
    END IF;
END $$;
CREATE OR REPLACE FUNCTION metadata.fn_entity_key_reference_valid(p_reference jsonb, p_field_key text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_mapping jsonb;
    v_sources text[] := ARRAY[]::text[];
    v_targets text[] := ARRAY[]::text[];
BEGIN
    IF jsonb_typeof(p_reference) IS DISTINCT FROM 'object'
       OR NOT metadata.fn_jsonb_object_has_only_keys(p_reference, ARRAY['targetEntity', 'labelField', 'fields'])
       OR jsonb_typeof(p_reference -> 'targetEntity') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_reference -> 'labelField') IS DISTINCT FROM 'string'
       OR coalesce(p_reference ->> 'targetEntity', '') !~ '^[a-z][a-z0-9_]{0,62}$'
       OR coalesce(p_reference ->> 'labelField', '') !~ '^[a-z][a-z0-9_]{0,62}$'
       OR jsonb_typeof(p_reference -> 'fields') IS DISTINCT FROM 'array' THEN
        RETURN false;
    END IF;
    IF jsonb_array_length(p_reference -> 'fields') NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
    FOR v_mapping IN SELECT value FROM jsonb_array_elements(p_reference -> 'fields') LOOP
        IF jsonb_typeof(v_mapping) IS DISTINCT FROM 'object'
           OR NOT metadata.fn_jsonb_object_has_only_keys(v_mapping, ARRAY['source', 'target'])
           OR jsonb_typeof(v_mapping -> 'source') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_mapping -> 'target') IS DISTINCT FROM 'string'
           OR coalesce(v_mapping ->> 'source', '') !~ '^[a-z][a-z0-9_]{0,62}$'
           OR coalesce(v_mapping ->> 'target', '') !~ '^[a-z][a-z0-9_]{0,62}$'
           OR (v_mapping ->> 'source') = ANY(v_sources)
           OR (v_mapping ->> 'target') = ANY(v_targets) THEN
            RETURN false;
        END IF;
        v_sources := array_append(v_sources, v_mapping ->> 'source');
        v_targets := array_append(v_targets, v_mapping ->> 'target');
    END LOOP;
    RETURN p_field_key = ANY(v_sources);
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_field_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_allowed text[];
    v_rule jsonb;
    v_parameters jsonb;
    v_rule_kind text;
BEGIN
    v_allowed := CASE NEW.data_type::text
        WHEN 'string' THEN ARRAY['kind', 'min_length', 'max_length', 'pattern', 'keyReference']
        WHEN 'text' THEN ARRAY['kind', 'min_length', 'max_length', 'pattern']
        WHEN 'integer' THEN ARRAY['kind', 'minimum', 'maximum']
        WHEN 'bigint' THEN ARRAY['kind', 'minimum', 'maximum']
        WHEN 'decimal' THEN ARRAY['kind', 'minimum', 'maximum', 'precision', 'scale']
        WHEN 'boolean' THEN ARRAY['kind']
        WHEN 'uuid' THEN ARRAY['kind']
        WHEN 'date' THEN ARRAY['kind']
        WHEN 'datetime' THEN ARRAY['kind', 'timezone_mode']
        WHEN 'json' THEN ARRAY['kind', 'schema_code']
        WHEN 'enum' THEN ARRAY['kind', 'domain_code']
        WHEN 'reference' THEN ARRAY['kind', 'identifier_type']
        WHEN 'money' THEN ARRAY['kind', 'currency_mode', 'currency_field_key', 'fixed_currency_code', 'scale']
    END;

    IF NOT metadata.fn_jsonb_object_has_only_keys(NEW.type_config, v_allowed) THEN
        RAISE EXCEPTION 'type_config contains properties not allowed for data type %', NEW.data_type
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.type_config ? 'keyReference'
       AND NOT metadata.fn_entity_key_reference_valid(NEW.type_config -> 'keyReference', NEW.field_key::text) THEN
        RAISE EXCEPTION 'keyReference requires a strict owned field-key mapping'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.data_type = 'enum'
       AND coalesce(NEW.type_config ->> 'domain_code', '') !~ '^[a-z][a-z0-9_.-]{1,126}$' THEN
        RAISE EXCEPTION 'enum type_config requires a canonical domain_code'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.data_type = 'reference'
       AND coalesce(NEW.type_config ->> 'identifier_type', '') NOT IN ('uuid', 'string', 'integer', 'bigint') THEN
        RAISE EXCEPTION 'reference type_config requires a supported identifier_type'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.default_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.default_spec,
            ARRAY['kind', 'value', 'field_key', 'context_key', 'resolver_key', 'apply_on']
        ) OR coalesce(NEW.default_spec ->> 'kind', '') NOT IN (
            'static', 'current_time', 'current_date', 'principal',
            'tenant_context', 'parent_field', 'resolver'
        ) THEN
            RAISE EXCEPTION 'default_spec is not a supported strict default contract'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF NEW.default_spec ? 'apply_on'
           AND (jsonb_typeof(NEW.default_spec -> 'apply_on') <> 'array'
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(NEW.default_spec -> 'apply_on') AS apply_event
                     WHERE apply_event NOT IN ('create', 'reset')
                )) THEN
            RAISE EXCEPTION 'default_spec.apply_on may contain only create or reset'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
    END IF;

    IF NEW.computation_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.computation_spec,
            ARRAY['kind', 'language', 'expression', 'handler_key']
        ) OR coalesce(NEW.computation_spec ->> 'kind', '') NOT IN ('expression', 'handler') THEN
            RAISE EXCEPTION 'computation_spec is not a supported strict computation contract'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF (NEW.computation_spec ->> 'kind' = 'expression'
                AND (coalesce(NEW.computation_spec ->> 'language', '') NOT IN ('cel', 'jsonlogic')
                    OR nullif(btrim(NEW.computation_spec ->> 'expression'), '') IS NULL
                    OR NEW.computation_spec ? 'handler_key'))
           OR (NEW.computation_spec ->> 'kind' = 'handler'
                AND (coalesce(NEW.computation_spec ->> 'handler_key', '') !~ '^[a-z][a-z0-9_.:-]{1,126}$'
                    OR NEW.computation_spec ? 'expression'
                    OR NEW.computation_spec ? 'language')) THEN
            RAISE EXCEPTION 'computation_spec kind and properties are inconsistent'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
    END IF;

    IF NEW.validation_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.validation_spec,
            ARRAY['schema_version', 'rules']
        ) OR coalesce((NEW.validation_spec ->> 'schema_version')::integer, 0) <> 1
          OR jsonb_typeof(NEW.validation_spec -> 'rules') <> 'array' THEN
            RAISE EXCEPTION 'validation_spec must be a version 1 strict rule collection'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        FOR v_rule IN SELECT value FROM jsonb_array_elements(NEW.validation_spec -> 'rules') LOOP
            IF NOT metadata.fn_jsonb_object_has_only_keys(
                v_rule,
                ARRAY['code', 'kind', 'parameters', 'message_key', 'severity']
            ) THEN
                RAISE EXCEPTION 'validation_spec contains an unsupported rule property'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
            v_rule_kind := v_rule ->> 'kind';
            v_parameters := coalesce(v_rule -> 'parameters', '{}'::jsonb);
            IF coalesce(v_rule ->> 'code', '') !~ '^[a-z][a-z0-9_.-]{1,126}$'
               OR v_rule_kind NOT IN ('length', 'range', 'pattern', 'allowed_values', 'comparison', 'custom_handler')
               OR jsonb_typeof(v_parameters) <> 'object'
               OR coalesce(v_rule ->> 'severity', 'error') NOT IN ('error', 'warning') THEN
                RAISE EXCEPTION 'validation_spec contains an invalid rule contract'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
            v_allowed := CASE v_rule_kind
                WHEN 'length' THEN ARRAY['minimum', 'maximum']
                WHEN 'range' THEN ARRAY['minimum', 'maximum', 'inclusive_minimum', 'inclusive_maximum']
                WHEN 'pattern' THEN ARRAY['pattern', 'flags']
                WHEN 'allowed_values' THEN ARRAY['values']
                WHEN 'comparison' THEN ARRAY['field_key', 'operator']
                WHEN 'custom_handler' THEN ARRAY['handler_key']
            END;
            IF NOT metadata.fn_jsonb_object_has_only_keys(v_parameters, v_allowed) THEN
                RAISE EXCEPTION 'validation rule % contains unsupported parameters', v_rule ->> 'code'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Field specification contains a value with an invalid scalar type'
            USING ERRCODE = 'invalid_parameter_value';
END;
$$;
COMMIT;
