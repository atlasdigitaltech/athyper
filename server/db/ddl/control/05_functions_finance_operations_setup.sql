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

CREATE OR REPLACE FUNCTION control.guard_fx_policy_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = control, pg_catalog, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX policies are append-only and cannot be deleted',
            HINT = 'Use the governed policy replacement command.';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.transaction_context IS DISTINCT FROM OLD.transaction_context
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.default_rate_type IS DISTINCT FROM OLD.default_rate_type
       OR NEW.revaluation_rate_type IS DISTINCT FROM OLD.revaluation_rate_type
       OR NEW.pivot_currency_code IS DISTINCT FROM OLD.pivot_currency_code
       OR NEW.allow_inverse IS DISTINCT FROM OLD.allow_inverse
       OR NEW.allow_triangulation IS DISTINCT FROM OLD.allow_triangulation
       OR NEW.preferred_sources IS DISTINCT FROM OLD.preferred_sources
       OR NEW.maximum_rate_age_days IS DISTINCT FROM OLD.maximum_rate_age_days
       OR NEW.missing_rate_behavior IS DISTINCT FROM OLD.missing_rate_behavior
       OR NEW.manual_override_allowed IS DISTINCT FROM OLD.manual_override_allowed
       OR NEW.manual_override_approval_required IS DISTINCT FROM OLD.manual_override_approval_required
       OR NEW.auto_reverse_revaluation IS DISTINCT FROM OLD.auto_reverse_revaluation
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX policy decisions and lineage are immutable',
            HINT = 'Use the governed policy replacement command.';
    END IF;

    IF OLD.status = 'superseded' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'A superseded FX policy is immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'superseded'
           OR NEW.status_changed_at IS NULL
           OR NEW.status_changed_by IS NULL THEN
            RAISE EXCEPTION USING
                ERRCODE = '55000',
                MESSAGE = 'The only permitted FX policy status transition is to superseded';
        END IF;
    ELSIF NEW.effective_to IS NOT DISTINCT FROM OLD.effective_to THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX policy updates must close an effective period or supersede the row';
    END IF;

    IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (
         NEW.effective_to IS NULL
         OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'An FX policy effective period may be shortened but never extended';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.guard_fx_policy_immutable() IS
    'Database boundary for append-only FX policy decisions; only period closure and supersession are mutable.';
