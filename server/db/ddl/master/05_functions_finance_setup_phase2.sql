CREATE OR REPLACE FUNCTION master.end_bank_account_link(
    p_tenant_id uuid,
    p_link_id uuid,
    p_effective_until date,
    p_actor_id uuid
)
RETURNS master.bank_account_link
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = master, shared, pg_catalog, pg_temp
AS $$
DECLARE
    v_link master.bank_account_link;
BEGIN
    IF p_tenant_id <> shared.current_tenant_id() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'tenant context does not match bank account link command';
    END IF;

    SELECT * INTO v_link
      FROM master.bank_account_link
     WHERE tenant_id = p_tenant_id AND id = p_link_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'bank account link not found in active tenant';
    END IF;
    IF p_effective_until <= v_link.effective_from THEN
        RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'effective_until must be after effective_from';
    END IF;
    IF v_link.effective_until IS NOT NULL AND p_effective_until > v_link.effective_until THEN
        RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'an ended bank account link cannot be extended by the end command';
    END IF;

    UPDATE master.bank_account_link
       SET effective_until = p_effective_until,
           updated_at = now(),
           updated_by = p_actor_id
     WHERE tenant_id = p_tenant_id AND id = p_link_id
     RETURNING * INTO v_link;

    RETURN v_link;
END;
$$;

COMMENT ON FUNCTION master.end_bank_account_link(uuid, uuid, date, uuid) IS
    'Governed temporal lifecycle command for bank_account_link. Generic delete/retire is not supported.';

CREATE OR REPLACE FUNCTION master.guard_fx_rate_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, pg_catalog, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX rates are append-only and cannot be deleted',
            HINT = 'Use the governed rate replacement command.';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.from_currency IS DISTINCT FROM OLD.from_currency
       OR NEW.to_currency IS DISTINCT FROM OLD.to_currency
       OR NEW.rate IS DISTINCT FROM OLD.rate
       OR NEW.rate_type IS DISTINCT FROM OLD.rate_type
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
       OR NEW.effective_time IS DISTINCT FROM OLD.effective_time
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX rate values and lineage are immutable',
            HINT = 'Use the governed rate replacement command.';
    END IF;

    IF OLD.status = 'superseded' OR NEW.status <> 'superseded' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'The only permitted FX rate update is active to superseded';
    END IF;

    IF NEW.status_changed_at IS NULL OR NEW.status_changed_by IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Superseding an FX rate requires status_changed_at and status_changed_by';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.guard_fx_rate_immutable() IS
    'Database boundary for immutable FX quotes: only the active-to-superseded lifecycle transition is mutable.';
