CREATE OR REPLACE FUNCTION control.jsonb_contains_secret_key(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_key text;
    v_child jsonb;
BEGIN
    IF p_value IS NULL THEN
        RETURN false;
    END IF;

    IF jsonb_typeof(p_value) = 'object' THEN
        FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
        LOOP
            IF lower(regexp_replace(v_key, '[^a-zA-Z0-9]+', '_', 'g')) ~
               '(^|_)(password|passwd|secret|client_secret|clientsecret|api_key|apikey|access_token|accesstoken|refresh_token|refreshtoken|private_key|privatekey|credential|credentials)($|_)'
               OR control.jsonb_contains_secret_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_value) = 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
        LOOP
            IF control.jsonb_contains_secret_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    END IF;

    RETURN false;
END;
$$;

COMMENT ON FUNCTION control.jsonb_contains_secret_key(jsonb) IS
    'Rejects secret-shaped keys at any depth before bank-interface configuration reaches ordinary JSON storage.';

CREATE OR REPLACE FUNCTION control.guard_bank_interface_nonsecret_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = control, pg_catalog, pg_temp
AS $$
BEGIN
    IF control.jsonb_contains_secret_key(NEW.config) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'bank interface config may not contain credentials or secret-shaped keys',
            HINT = 'Store credentials in the platform secret provider and set only credential_reference through a governed command.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.guard_fx_policy_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = control, master, pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.company_code_id IS NOT NULL AND NEW.ledger_book_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM master.company_code_book_assignment assignment
         WHERE assignment.tenant_id = NEW.tenant_id
           AND assignment.company_code_id = NEW.company_code_id
           AND assignment.book_id = NEW.ledger_book_id
           AND assignment.status = 'active'
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'FX policy Book must be actively assigned to the policy Company';
    END IF;
    RETURN NEW;
END;
$$;
