CREATE OR REPLACE FUNCTION control.trg_validate_budget_control_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.budget_control_policy%ROWTYPE;
    v_override_tenant uuid;
BEGIN
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
        RAISE EXCEPTION 'Budget-control ledger book must be assigned to the company on effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.override_policy_definition_id IS NOT NULL THEN
        SELECT tenant_id INTO v_override_tenant
          FROM control.policy_definition
         WHERE id = NEW.override_policy_definition_id;
        IF NOT FOUND OR (v_override_tenant IS NOT NULL AND v_override_tenant <> NEW.tenant_id) THEN
            RAISE EXCEPTION 'Override policy must be global or belong to the same tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A budget-control lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_previous
          FROM control.budget_control_policy
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded budget-control policy is outside the tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_previous.policy_code <> NEW.policy_code
           OR v_previous.company_code_id IS DISTINCT FROM NEW.company_code_id
           OR v_previous.ledger_book_id IS DISTINCT FROM NEW.ledger_book_id
           OR v_previous.source_document_type IS DISTINCT FROM NEW.source_document_type
           OR NEW.version_no <> v_previous.version_no + 1 THEN
            RAISE EXCEPTION 'Budget-control replacement must retain scope and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_budget_control_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated budget-control policies cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.policy_code IS DISTINCT FROM OLD.policy_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.source_document_type IS DISTINCT FROM OLD.source_document_type
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Budget-control identity, scope, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.period_scope IS DISTINCT FROM OLD.period_scope
        OR NEW.consumption_basis IS DISTINCT FROM OLD.consumption_basis
        OR NEW.warn_at_percent IS DISTINCT FROM OLD.warn_at_percent
        OR NEW.block_at_percent IS DISTINCT FROM OLD.block_at_percent
        OR NEW.override_policy_definition_id IS DISTINCT FROM OLD.override_policy_definition_id
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated budget-control decisions are immutable; create a replacement version'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION 'An activated budget-control period may be shortened but not extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'superseded')
            OR OLD.status = 'inactive' AND NEW.status = 'superseded'
       ) THEN
        RAISE EXCEPTION 'Invalid budget-control status transition'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_budget_control_policy(
    p_tenant_id uuid,
    p_policy_code text,
    p_company_code_id uuid,
    p_ledger_book_id uuid,
    p_source_document_type text,
    p_effective_date date DEFAULT CURRENT_DATE
)
RETURNS SETOF control.budget_control_policy
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT policy.*
      FROM control.budget_control_policy AS policy
     WHERE policy.tenant_id = p_tenant_id
       AND policy.policy_code = p_policy_code
       AND policy.status = 'active'
       AND policy.effective_from <= p_effective_date
       AND (policy.effective_to IS NULL OR policy.effective_to >= p_effective_date)
       AND (policy.company_code_id IS NULL OR policy.company_code_id = p_company_code_id)
       AND (policy.ledger_book_id IS NULL OR policy.ledger_book_id = p_ledger_book_id)
       AND (policy.source_document_type IS NULL
            OR policy.source_document_type = p_source_document_type)
     ORDER BY
       (policy.company_code_id IS NOT NULL)::integer DESC,
       (policy.ledger_book_id IS NOT NULL)::integer DESC,
       (policy.source_document_type IS NOT NULL)::integer DESC,
       policy.version_no DESC
     LIMIT 1
$$;
