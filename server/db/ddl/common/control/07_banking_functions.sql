CREATE OR REPLACE FUNCTION control.jsonb_has_secret_shaped_key(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_key text;
    v_child jsonb;
BEGIN
    CASE jsonb_typeof(p_value)
        WHEN 'object' THEN
            FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
            LOOP
                IF lower(v_key) ~ '(password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|authorization|credential)' THEN
                    RETURN true;
                END IF;
                IF control.jsonb_has_secret_shaped_key(v_child) THEN
                    RETURN true;
                END IF;
            END LOOP;
        WHEN 'array' THEN
            FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
            LOOP
                IF control.jsonb_has_secret_shaped_key(v_child) THEN
                    RETURN true;
                END IF;
            END LOOP;
    END CASE;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_reject_secret_shaped_json()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'connector_instance' THEN
        IF NOT control.jsonb_has_secret_shaped_key(NEW.config) THEN
            RETURN NEW;
        END IF;
    ELSIF TG_TABLE_NAME = 'integration_endpoint' THEN
        IF NOT control.jsonb_has_secret_shaped_key(NEW.headers) THEN
            RETURN NEW;
        END IF;
    ELSE
        RAISE EXCEPTION 'unexpected table for secret-material guard: %', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME IN ('connector_instance', 'integration_endpoint') THEN
        RAISE EXCEPTION 'secret material must be stored only through credential_reference'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_bank_account_validation_rule(
    p_country_code char(2),
    p_payment_rail_code text,
    p_direction control.bank_validation_direction_d DEFAULT 'both',
    p_currency_code char(3) DEFAULT NULL
)
RETURNS control.bank_account_validation_rule
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT rule
      FROM control.bank_account_validation_rule AS rule
     WHERE rule.status = 'active'
       AND rule.country_code = upper(p_country_code)
       AND rule.payment_rail_code = lower(btrim(p_payment_rail_code))
       AND rule.direction IN ('both', p_direction)
       AND (rule.currency_code IS NULL OR rule.currency_code = upper(p_currency_code))
     ORDER BY
       (rule.currency_code IS NOT NULL) DESC,
       (rule.direction = p_direction) DESC,
       rule.priority DESC,
       rule.code
     LIMIT 1;
$$;
