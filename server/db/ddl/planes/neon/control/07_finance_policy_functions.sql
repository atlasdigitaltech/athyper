CREATE OR REPLACE FUNCTION control.trg_guard_rounding_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated rounding rules cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Rounding-rule identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.method IS DISTINCT FROM OLD.method
        OR NEW.precision_digits IS DISTINCT FROM OLD.precision_digits
        OR NEW.rounding_increment IS DISTINCT FROM OLD.rounding_increment
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated rounding decisions are immutable; create a replacement rule'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Archived rounding rules cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'archived')
            OR OLD.status = 'inactive' AND NEW.status = 'archived'
       ) THEN
        RAISE EXCEPTION 'Invalid activated rounding-rule status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_procurement_match_tolerance_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated match-tolerance policies cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.match_type IS DISTINCT FROM OLD.match_type
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Match-policy identity, scope, effective start and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.ordered_quantity_over_tolerance_percent
            IS DISTINCT FROM OLD.ordered_quantity_over_tolerance_percent
        OR NEW.received_quantity_over_tolerance_percent
            IS DISTINCT FROM OLD.received_quantity_over_tolerance_percent
        OR NEW.unit_price_variance_percent
            IS DISTINCT FROM OLD.unit_price_variance_percent
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated matching tolerances are immutable; create an effective-dated replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION 'An activated match-policy period may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Archived match policies cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'archived')
            OR OLD.status = 'inactive' AND NEW.status = 'archived'
       ) THEN
        RAISE EXCEPTION 'Invalid activated match-policy status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_fx_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_source text;
    v_source_count integer;
    v_distinct_source_count integer;
    v_superseded control.fx_policy%ROWTYPE;
BEGIN
    FOREACH v_source IN ARRAY NEW.preferred_source_codes LOOP
        IF v_source !~ '^[A-Z][A-Z0-9_]{0,62}$' THEN
            RAISE EXCEPTION 'Invalid FX source code: %', v_source
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;

    SELECT count(*), count(DISTINCT source_code)
      INTO v_source_count, v_distinct_source_count
      FROM unnest(NEW.preferred_source_codes) AS source_code;

    IF v_source_count <> v_distinct_source_count THEN
        RAISE EXCEPTION 'FX preferred source codes must be unique'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.company_code_id IS NOT NULL AND NEW.ledger_book_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM master.company_code_book_assignment AS assignment
             WHERE assignment.tenant_id = NEW.tenant_id
               AND assignment.company_code_id = NEW.company_code_id
               AND assignment.book_id = NEW.ledger_book_id
               AND assignment.status = 'active'
               AND assignment.effective_from <= NEW.effective_from
               AND (assignment.effective_to IS NULL
                    OR assignment.effective_to >= NEW.effective_from)
       ) THEN
        RAISE EXCEPTION 'FX policy ledger book must be assigned to the company on effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A root FX policy lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_superseded
          FROM control.fx_policy
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.supersedes_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded FX policy does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_superseded.company_code_id IS DISTINCT FROM NEW.company_code_id
           OR v_superseded.ledger_book_id IS DISTINCT FROM NEW.ledger_book_id
           OR v_superseded.transaction_context IS DISTINCT FROM NEW.transaction_context
           OR NEW.version_no <> v_superseded.version_no + 1 THEN
            RAISE EXCEPTION 'FX replacement must retain scope/context and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_fx_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated FX policies cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.transaction_context IS DISTINCT FROM OLD.transaction_context
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'FX policy identity, scope, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.default_rate_type IS DISTINCT FROM OLD.default_rate_type
        OR NEW.revaluation_rate_type IS DISTINCT FROM OLD.revaluation_rate_type
        OR NEW.pivot_currency_code IS DISTINCT FROM OLD.pivot_currency_code
        OR NEW.allow_inverse IS DISTINCT FROM OLD.allow_inverse
        OR NEW.allow_triangulation IS DISTINCT FROM OLD.allow_triangulation
        OR NEW.preferred_source_codes IS DISTINCT FROM OLD.preferred_source_codes
        OR NEW.max_rate_age_days IS DISTINCT FROM OLD.max_rate_age_days
        OR NEW.missing_rate_behavior IS DISTINCT FROM OLD.missing_rate_behavior
        OR NEW.manual_override_allowed IS DISTINCT FROM OLD.manual_override_allowed
        OR NEW.manual_override_approval_required
            IS DISTINCT FROM OLD.manual_override_approval_required
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated FX decisions are immutable; create a versioned replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION 'An activated FX policy period may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'superseded' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'A superseded FX policy is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'superseded')
            OR OLD.status = 'inactive' AND NEW.status = 'superseded'
       ) THEN
        RAISE EXCEPTION 'Invalid activated FX policy status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_dimension_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_account_class master.gl_account_class_d;
    v_superseded control.dimension_policy%ROWTYPE;
BEGIN
    NEW.policy_code := lower(btrim(NEW.policy_code));
    NEW.description := nullif(btrim(NEW.description), '');
    NEW.scope_document_type :=
        nullif(lower(btrim(NEW.scope_document_type)), '');

    IF NEW.scope_account_id IS NOT NULL THEN
        SELECT account_class
          INTO v_account_class
          FROM master.gl_account
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.scope_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Scoped GL account does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF NEW.scope_account_class IS NOT NULL
           AND NEW.scope_account_class <> v_account_class THEN
            RAISE EXCEPTION
                'Scoped GL account does not belong to scope_account_class'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.company_code_id IS NOT NULL AND NEW.scope_book_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM master.company_code_book_assignment AS assignment
             WHERE assignment.tenant_id = NEW.tenant_id
               AND assignment.company_code_id = NEW.company_code_id
               AND assignment.book_id = NEW.scope_book_id
               AND assignment.status = 'active'
               AND assignment.effective_from <= NEW.effective_from
               AND (assignment.effective_to IS NULL
                    OR assignment.effective_to >= NEW.effective_from)
       ) THEN
        RAISE EXCEPTION
            'Scoped ledger book must be assigned to the company on effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.enforcement = 'forbidden' AND EXISTS (
        SELECT 1
          FROM control.dimension_policy_allowed_value AS allowed
         WHERE allowed.tenant_id = NEW.tenant_id
           AND allowed.policy_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Forbidden dimension policies cannot have allowed values'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A root dimension policy lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_superseded
          FROM control.dimension_policy
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.supersedes_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded dimension policy does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_superseded.policy_code IS DISTINCT FROM NEW.policy_code
           OR v_superseded.dimension_type_id IS DISTINCT FROM NEW.dimension_type_id
           OR v_superseded.company_code_id IS DISTINCT FROM NEW.company_code_id
           OR v_superseded.scope_account_class IS DISTINCT FROM NEW.scope_account_class
           OR v_superseded.scope_account_id IS DISTINCT FROM NEW.scope_account_id
           OR v_superseded.scope_subledger_type IS DISTINCT FROM NEW.scope_subledger_type
           OR v_superseded.scope_book_id IS DISTINCT FROM NEW.scope_book_id
           OR v_superseded.scope_document_type IS DISTINCT FROM NEW.scope_document_type
           OR NEW.version_no <> v_superseded.version_no + 1 THEN
            RAISE EXCEPTION
                'Dimension policy replacement must retain lineage scope and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_dimension_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated dimension policies cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.policy_code IS DISTINCT FROM OLD.policy_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.dimension_type_id IS DISTINCT FROM OLD.dimension_type_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.scope_account_class IS DISTINCT FROM OLD.scope_account_class
       OR NEW.scope_account_id IS DISTINCT FROM OLD.scope_account_id
       OR NEW.scope_subledger_type IS DISTINCT FROM OLD.scope_subledger_type
       OR NEW.scope_book_id IS DISTINCT FROM OLD.scope_book_id
       OR NEW.scope_document_type IS DISTINCT FROM OLD.scope_document_type
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Dimension policy identity, scope, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.enforcement IS DISTINCT FROM OLD.enforcement
        OR NEW.depends_on_dimension_type_id
            IS DISTINCT FROM OLD.depends_on_dimension_type_id
        OR NEW.mutually_exclusive_dimension_type_id
            IS DISTINCT FROM OLD.mutually_exclusive_dimension_type_id
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION
            'Activated dimension policy semantics are immutable; create a versioned replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL
                AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION
            'An activated dimension policy period may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'An archived dimension policy is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'archived')
            OR OLD.status = 'inactive' AND NEW.status = 'archived'
       ) THEN
        RAISE EXCEPTION 'Invalid activated dimension-policy status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_dimension_policy_allowed_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_policy control.dimension_policy%ROWTYPE;
    v_value_company_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION
            'Dimension policy allowed-value membership is immutable; delete and reinsert while draft'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_policy
      FROM control.dimension_policy
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(NEW.policy_id, OLD.policy_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dimension policy does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_policy.status <> 'draft' THEN
        RAISE EXCEPTION
            'Allowed values may change only while the dimension policy is draft'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF v_policy.enforcement = 'forbidden' THEN
        RAISE EXCEPTION 'Forbidden dimension policies cannot have allowed values'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT company_code_id
      INTO v_value_company_id
      FROM master.dimension_value
     WHERE tenant_id = NEW.tenant_id
       AND dimension_type_id = NEW.dimension_type_id
       AND id = NEW.dimension_value_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allowed dimension value does not exist in policy dimension'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_value_company_id IS NOT NULL
       AND v_value_company_id IS DISTINCT FROM v_policy.company_code_id THEN
        RAISE EXCEPTION
            'Company-scoped dimension value requires a policy for the same company'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
