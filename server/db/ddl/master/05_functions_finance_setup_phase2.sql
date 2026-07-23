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

