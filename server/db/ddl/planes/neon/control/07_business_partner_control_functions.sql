CREATE OR REPLACE FUNCTION control.trg_validate_business_partner_control_lookup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_domain text;
    v_code text;
BEGIN
    IF TG_TABLE_NAME = 'business_partner_qualification' THEN
        NEW.qualification_type_code := lower(btrim(NEW.qualification_type_code));
        v_domain := 'control.business_partner_qualification_type';
        v_code := NEW.qualification_type_code;
    ELSIF TG_ARGV[0] = 'operation' THEN
        NEW.operation_code := lower(btrim(NEW.operation_code));
        v_domain := 'control.business_partner_block_operation';
        v_code := NEW.operation_code;
    ELSE
        IF NEW.reason_code IS NULL THEN
            RETURN NEW;
        END IF;
        NEW.reason_code := lower(btrim(NEW.reason_code));
        v_domain := 'control.business_partner_block_reason';
        v_code := NEW.reason_code;
    END IF;

    IF NOT control.lookup_value_is_active(v_domain, v_code, NEW.tenant_id) THEN
        RAISE EXCEPTION 'Unknown or inactive lookup value %/%', v_domain, v_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_business_partner_control_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_role master.partner_role_d;
BEGIN
    IF TG_TABLE_NAME = 'business_partner_qualification' THEN
        v_role := NEW.partner_role;
    ELSIF NEW.partner_role_scope <> 'all' THEN
        v_role := NEW.partner_role_scope::text::master.partner_role_d;
    END IF;

    IF v_role = 'supplier' AND NOT EXISTS (
        SELECT 1
          FROM master.supplier
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = NEW.business_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no supplier role',
            NEW.business_partner_id USING ERRCODE = 'check_violation';
    ELSIF v_role = 'customer' AND NOT EXISTS (
        SELECT 1
          FROM master.customer
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = NEW.business_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no customer role',
            NEW.business_partner_id USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.operating_organization_id IS NOT NULL
       AND NEW.company_code_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.operating_organization_company_assignment assignment
            WHERE assignment.tenant_id = NEW.tenant_id
              AND assignment.operating_organization_id =
                  NEW.operating_organization_id
              AND assignment.company_code_id = NEW.company_code_id
              AND assignment.status = 'active'
              AND assignment.effective_from <= CURRENT_DATE
              AND (
                  assignment.effective_until IS NULL
                  OR assignment.effective_until > CURRENT_DATE
              )
       ) THEN
        RAISE EXCEPTION
            'Company code % does not actively participate in operating organization %',
            NEW.company_code_id, NEW.operating_organization_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'business_partner_qualification'
       AND NEW.commodity_capability_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.business_partner_commodity_capability capability
            WHERE capability.tenant_id = NEW.tenant_id
              AND capability.id = NEW.commodity_capability_id
              AND capability.business_partner_id = NEW.business_partner_id
              AND capability.partner_role = NEW.partner_role
       ) THEN
        RAISE EXCEPTION
            'Commodity capability does not belong to the selected partner role'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'business_partner_qualification'
       AND NEW.risk_assessment_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.party_risk_assessment assessment
            WHERE assessment.tenant_id = NEW.tenant_id
              AND assessment.id = NEW.risk_assessment_id
              AND assessment.business_partner_id = NEW.business_partner_id
       ) THEN
        RAISE EXCEPTION
            'Risk assessment does not belong to the selected business partner'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_qualification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.partner_role IS DISTINCT FROM OLD.partner_role
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION
            'Qualification identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.decision = 'pending'
       AND (NEW.reviewed_at IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Pending qualification cannot contain decision evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision IN ('approved', 'conditional')
       AND NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'Approved qualification requires review evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision IN ('rejected', 'suspended')
       AND NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION '% qualification requires review evidence', NEW.decision
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.partner_role_scope IS DISTINCT FROM OLD.partner_role_scope
        OR NEW.operating_organization_id
            IS DISTINCT FROM OLD.operating_organization_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.operation_code IS DISTINCT FROM OLD.operation_code
        OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
        OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Block coordinates and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status <> 'active'
       AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Terminal block status % cannot transition', OLD.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
