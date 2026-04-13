-- 09_triggers/003d_master_payment_terms.sql
-- Depends on: 04_tables/003d_master_payment_terms.sql, 08_functions (shared.trg_set_updated_at,
--             shared.trg_set_status_changed, control.trg_validate_lookup_columns)
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- Functions: CREATE OR REPLACE for idempotency.


-- ============================================================================
-- PART G — updated_at triggers
-- ============================================================================

-- holiday_calendar
DROP TRIGGER IF EXISTS trg_hc_updated_at ON master.holiday_calendar;
CREATE TRIGGER trg_hc_updated_at BEFORE UPDATE ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- holiday_calendar_day
DROP TRIGGER IF EXISTS trg_hcd_updated_at ON master.holiday_calendar_day;
CREATE TRIGGER trg_hcd_updated_at BEFORE UPDATE ON master.holiday_calendar_day
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- payment_term
DROP TRIGGER IF EXISTS trg_pt_updated_at ON master.payment_term;
CREATE TRIGGER trg_pt_updated_at BEFORE UPDATE ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- payment_term_clause
DROP TRIGGER IF EXISTS trg_ptc_updated_at ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_updated_at BEFORE UPDATE ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- payment_term_discount_tier
DROP TRIGGER IF EXISTS trg_ptdt_updated_at ON master.payment_term_discount_tier;
CREATE TRIGGER trg_ptdt_updated_at BEFORE UPDATE ON master.payment_term_discount_tier
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- ============================================================================
-- PART G — status_changed triggers
-- ============================================================================

-- holiday_calendar
DROP TRIGGER IF EXISTS trg_hc_status_changed ON master.holiday_calendar;
CREATE TRIGGER trg_hc_status_changed BEFORE UPDATE ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- payment_term
DROP TRIGGER IF EXISTS trg_pt_status_changed ON master.payment_term;
CREATE TRIGGER trg_pt_status_changed BEFORE UPDATE ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ============================================================================
-- PART G — hc_single_default: enforce at most one is_default per tenant (FIX-8)
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_enforce_single_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE master.holiday_calendar
           SET is_default = false,
               updated_at = now()
         WHERE tenant_id = NEW.tenant_id
           AND id <> NEW.id
           AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hc_single_default ON master.holiday_calendar;
CREATE TRIGGER trg_hc_single_default
    BEFORE INSERT OR UPDATE OF is_default ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION master.trg_enforce_single_default();


-- ============================================================================
-- PART G — weekend_days validation (FIX-8)
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_weekend_days()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- CUSTOM requires weekend_days with at least one element
    IF NEW.weekend_pattern = 'CUSTOM' THEN
        IF NEW.weekend_days IS NULL OR array_length(NEW.weekend_days, 1) IS NULL THEN
            RAISE EXCEPTION 'holiday_calendar: weekend_pattern=CUSTOM requires non-empty weekend_days array';
        END IF;
    END IF;

    -- Non-CUSTOM must not have weekend_days
    IF NEW.weekend_pattern <> 'CUSTOM' AND NEW.weekend_days IS NOT NULL THEN
        RAISE EXCEPTION 'holiday_calendar: weekend_days must be NULL when weekend_pattern is not CUSTOM';
    END IF;

    -- All elements must be 1..7 (ISO day-of-week)
    IF NEW.weekend_days IS NOT NULL THEN
        IF NOT (NEW.weekend_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]) THEN
            RAISE EXCEPTION 'holiday_calendar: weekend_days elements must be 1-7 (ISO day-of-week)';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hc_validate_weekend_days ON master.holiday_calendar;
CREATE TRIGGER trg_hc_validate_weekend_days
    BEFORE INSERT OR UPDATE OF weekend_pattern, weekend_days ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_weekend_days();


-- ============================================================================
-- PART I — Lookup validation triggers
-- ============================================================================

-- holiday_calendar.status
DROP TRIGGER IF EXISTS trg_hc_status_lookup ON master.holiday_calendar;
CREATE TRIGGER trg_hc_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.holiday_calendar
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.holiday_calendar_status', 'status');

-- payment_term.status
DROP TRIGGER IF EXISTS trg_pt_status_lookup ON master.payment_term;
CREATE TRIGGER trg_pt_status_lookup
    BEFORE INSERT OR UPDATE OF status ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_status', 'status');

-- payment_term.term_category
DROP TRIGGER IF EXISTS trg_pt_category_lookup ON master.payment_term;
CREATE TRIGGER trg_pt_category_lookup
    BEFORE INSERT OR UPDATE OF term_category ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_category', 'term_category');

-- payment_term_clause.trigger_event
DROP TRIGGER IF EXISTS trg_ptc_trigger_event_lookup ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_trigger_event_lookup
    BEFORE INSERT OR UPDATE OF trigger_event ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_trigger_event', 'trigger_event');

-- payment_term_clause.release_event
DROP TRIGGER IF EXISTS trg_ptc_release_event_lookup ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_release_event_lookup
    BEFORE INSERT OR UPDATE OF release_event ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_release_event', 'release_event');

-- payment_term_clause.recovery_method
DROP TRIGGER IF EXISTS trg_ptc_recovery_method_lookup ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_recovery_method_lookup
    BEFORE INSERT OR UPDATE OF recovery_method ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.payment_term_recovery_method', 'recovery_method');


-- ============================================================================
-- PART G — settles_clause_code pairing validation (FIX-4)
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_settles_clause()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_target_type text;
BEGIN
    -- Only applies when settles_clause_code is set
    IF NEW.settles_clause_code IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolve the clause_type of the referenced (settled) clause
    SELECT clause_type INTO v_target_type
      FROM master.payment_term_clause
     WHERE payment_term_id = NEW.payment_term_id
       AND clause_code     = NEW.settles_clause_code;

    IF v_target_type IS NULL THEN
        RAISE EXCEPTION 'payment_term_clause: settles_clause_code "%" not found within the same payment term',
            NEW.settles_clause_code;
    END IF;

    -- ADVANCE_RECOVERY must settle ADVANCE
    IF NEW.clause_type = 'ADVANCE_RECOVERY' AND v_target_type <> 'ADVANCE' THEN
        RAISE EXCEPTION 'payment_term_clause: ADVANCE_RECOVERY clause must settle an ADVANCE clause, found %',
            v_target_type;
    END IF;

    -- RETENTION_RELEASE must settle RETENTION
    IF NEW.clause_type = 'RETENTION_RELEASE' AND v_target_type <> 'RETENTION' THEN
        RAISE EXCEPTION 'payment_term_clause: RETENTION_RELEASE clause must settle a RETENTION clause, found %',
            v_target_type;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ptc_validate_settles ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_validate_settles
    BEFORE INSERT OR UPDATE OF settles_clause_code, clause_type ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_settles_clause();


-- ============================================================================
-- PART G — Validate current payment term on supplier/customer profiles
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_validate_current_payment_term()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_is_current boolean;
    v_status     text;
BEGIN
    -- Only validate when payment_term_id is set
    IF NEW.payment_term_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_current_version, status
      INTO v_is_current, v_status
      FROM master.payment_term
     WHERE id = NEW.payment_term_id
       AND tenant_id = NEW.tenant_id;

    IF v_is_current IS NULL THEN
        RAISE EXCEPTION '% payment_term_id not found in tenant',
            TG_TABLE_NAME;
    END IF;

    IF v_is_current <> true THEN
        RAISE EXCEPTION '% payment_term_id must reference the current version of a payment term',
            TG_TABLE_NAME;
    END IF;

    IF v_status <> 'active' THEN
        RAISE EXCEPTION '% payment_term_id must reference an active payment term, found status=%',
            TG_TABLE_NAME, v_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scp_validate_payment_term ON master.company_code_supplier_profile;
CREATE TRIGGER trg_scp_validate_payment_term
    BEFORE INSERT OR UPDATE OF payment_term_id ON master.company_code_supplier_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_current_payment_term();

DROP TRIGGER IF EXISTS trg_ccp_validate_payment_term ON master.company_code_customer_profile;
CREATE TRIGGER trg_ccp_validate_payment_term
    BEFORE INSERT OR UPDATE OF payment_term_id ON master.company_code_customer_profile
    FOR EACH ROW EXECUTE FUNCTION master.trg_validate_current_payment_term();


-- ============================================================================
-- PART G — Payment term immutability (FIX-7)
-- Prevents mutation of business-critical columns once status leaves 'draft'.
-- Lifecycle columns (status, is_current_version, updated_at, updated_by,
-- status_changed_at, status_changed_by) are always allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_payment_term_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Only enforce once term leaves draft
    IF OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.code,  NEW.name,  NEW.description,  NEW.applicable_to,
        NEW.base_event,  NEW.due_rule_type,  NEW.due_days,  NEW.due_day_of_month,
        NEW.grace_days,  NEW.due_date_flexibility,  NEW.business_day_convention,
        NEW.holiday_calendar_id,  NEW.month_offset,  NEW.term_category,
        NEW.installment_count,  NEW.version,  NEW.supersedes_payment_term_id,
        NEW.effective_from,  NEW.effective_to,  NEW.sort_order,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.code,  OLD.name,  OLD.description,  OLD.applicable_to,
        OLD.base_event,  OLD.due_rule_type,  OLD.due_days,  OLD.due_day_of_month,
        OLD.grace_days,  OLD.due_date_flexibility,  OLD.business_day_convention,
        OLD.holiday_calendar_id,  OLD.month_offset,  OLD.term_category,
        OLD.installment_count,  OLD.version,  OLD.supersedes_payment_term_id,
        OLD.effective_from,  OLD.effective_to,  OLD.sort_order,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term: business columns are immutable once status is not draft (current status=%)',
            OLD.status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pt_immutable ON master.payment_term;
CREATE TRIGGER trg_pt_immutable
    BEFORE UPDATE ON master.payment_term
    FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_immutable();


-- ============================================================================
-- PART G — Payment term clause immutability (FIX-7)
-- Prevents mutation once parent term is not in draft.
-- Lifecycle columns (is_active, updated_at, updated_by) are allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_payment_term_clause_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_term_status text;
BEGIN
    SELECT status INTO v_term_status
      FROM master.payment_term
     WHERE id = OLD.payment_term_id
       AND tenant_id = OLD.tenant_id;

    -- Allow all changes while parent term is draft
    IF v_term_status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.clause_code,  NEW.clause_type,  NEW.sequence_no,
        NEW.settles_clause_code,  NEW.application_scope,  NEW.basis_amount_mode,
        NEW.calc_mode,  NEW.default_pct,  NEW.default_amount,  NEW.currency_code,
        NEW.flexibility_mode,  NEW.min_pct,  NEW.max_pct,  NEW.min_amount,  NEW.max_amount,
        NEW.cumulative_cap_pct,  NEW.cumulative_cap_amount,
        NEW.trigger_event,  NEW.release_event,  NEW.release_delay_days,
        NEW.recovery_start_after_pct,  NEW.recovery_end_before_pct,
        NEW.recovery_method,  NEW.partial_release_pct,  NEW.partial_release_event,
        NEW.rounding_method,  NEW.rounding_scale,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.clause_code,  OLD.clause_type,  OLD.sequence_no,
        OLD.settles_clause_code,  OLD.application_scope,  OLD.basis_amount_mode,
        OLD.calc_mode,  OLD.default_pct,  OLD.default_amount,  OLD.currency_code,
        OLD.flexibility_mode,  OLD.min_pct,  OLD.max_pct,  OLD.min_amount,  OLD.max_amount,
        OLD.cumulative_cap_pct,  OLD.cumulative_cap_amount,
        OLD.trigger_event,  OLD.release_event,  OLD.release_delay_days,
        OLD.recovery_start_after_pct,  OLD.recovery_end_before_pct,
        OLD.recovery_method,  OLD.partial_release_pct,  OLD.partial_release_event,
        OLD.rounding_method,  OLD.rounding_scale,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term_clause: business columns are immutable once parent term status is not draft (term status=%)',
            v_term_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ptc_immutable ON master.payment_term_clause;
CREATE TRIGGER trg_ptc_immutable
    BEFORE UPDATE ON master.payment_term_clause
    FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_clause_immutable();


-- ============================================================================
-- PART G — Payment term discount tier immutability (FIX-7)
-- Prevents mutation once parent term is not in draft.
-- Lifecycle columns (updated_at, updated_by) are allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.trg_payment_term_discount_tier_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_term_status text;
BEGIN
    SELECT status INTO v_term_status
      FROM master.payment_term
     WHERE id = OLD.payment_term_id
       AND tenant_id = OLD.tenant_id;

    -- Allow all changes while parent term is draft
    IF v_term_status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.tier_no,  NEW.qualify_within_days,  NEW.discount_pct,
        NEW.discount_fixed,  NEW.currency_code,  NEW.discount_basis_mode,
        NEW.min_invoice_amount,  NEW.is_best_only,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.tier_no,  OLD.qualify_within_days,  OLD.discount_pct,
        OLD.discount_fixed,  OLD.currency_code,  OLD.discount_basis_mode,
        OLD.min_invoice_amount,  OLD.is_best_only,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term_discount_tier: business columns are immutable once parent term status is not draft (term status=%)',
            v_term_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ptdt_immutable ON master.payment_term_discount_tier;
CREATE TRIGGER trg_ptdt_immutable
    BEFORE UPDATE ON master.payment_term_discount_tier
    FOR EACH ROW EXECUTE FUNCTION master.trg_payment_term_discount_tier_immutable();
