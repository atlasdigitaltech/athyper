CREATE OR REPLACE FUNCTION runtime_meta.trg_validate_entity_number_counter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, runtime_meta, control
AS $$
DECLARE
    v_policy control.numbering_policy%ROWTYPE;
BEGIN
    SELECT * INTO v_policy FROM control.numbering_policy WHERE id = NEW.numbering_policy_id;
    IF NOT FOUND OR v_policy.status <> 'active' THEN
        RAISE EXCEPTION 'Entity number counter requires an active numbering policy' USING ERRCODE='foreign_key_violation';
    END IF;
    IF v_policy.tenant_id IS NOT NULL AND v_policy.tenant_id <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Tenant numbering counter cannot reference another tenant policy' USING ERRCODE='foreign_key_violation';
    END IF;
    IF v_policy.scope_kind = 'tenant' AND NEW.scope_key <> NEW.tenant_id::text THEN
        RAISE EXCEPTION 'Tenant-scoped numbering counter scope_key must equal tenant_id' USING ERRCODE='check_violation';
    END IF;
    IF (v_policy.reset_kind = 'never' AND NEW.reset_bucket <> 'never')
       OR (v_policy.reset_kind = 'calendar_year' AND NEW.reset_bucket !~ '^[0-9]{4}$')
       OR (v_policy.reset_kind = 'calendar_month' AND NEW.reset_bucket !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
       OR (v_policy.reset_kind = 'calendar_day' AND NEW.reset_bucket !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
       OR (v_policy.reset_kind = 'fiscal_year' AND NEW.reset_bucket !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$') THEN
        RAISE EXCEPTION 'Counter reset_bucket does not match numbering policy reset_kind' USING ERRCODE='check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.next_value <> v_policy.start_value OR NEW.allocation_count <> 0 OR NEW.row_version <> 0
           OR NEW.last_allocated_value IS NOT NULL OR NEW.last_allocation_id IS NOT NULL
           OR NEW.last_allocated_at IS NOT NULL OR NEW.last_allocated_by IS NOT NULL
           OR NEW.last_correlation_id IS NOT NULL THEN
            RAISE EXCEPTION 'New numbering counters must begin at the policy start value with no allocation state'
                USING ERRCODE='check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id
       OR NEW.numbering_policy_id <> OLD.numbering_policy_id
       OR NEW.scope_key <> OLD.scope_key OR NEW.reset_bucket <> OLD.reset_bucket
       OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
        RAISE EXCEPTION 'Entity number counter identity is immutable' USING ERRCODE='integrity_constraint_violation';
    END IF;
    IF v_policy.maximum_value IS NOT NULL AND OLD.next_value > v_policy.maximum_value THEN
        RAISE EXCEPTION 'NUMBERING_POLICY_EXHAUSTED' USING ERRCODE='program_limit_exceeded';
    END IF;
    IF NEW.next_value <> OLD.next_value + v_policy.increment_by
       OR NEW.allocation_count <> OLD.allocation_count + 1
       OR NEW.row_version <> OLD.row_version + 1
       OR NEW.last_allocated_value <> OLD.next_value
       OR NEW.last_allocation_id IS NULL OR NEW.last_allocated_at IS NULL OR NEW.last_allocated_by IS NULL THEN
        RAISE EXCEPTION 'Counter updates must represent exactly one numbering allocation'
            USING ERRCODE='integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;
