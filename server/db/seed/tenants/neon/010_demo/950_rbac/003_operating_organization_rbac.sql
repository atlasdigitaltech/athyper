-- ============================================================================
-- ATHYPER DEMO OPERATING ORGANIZATION RBAC
-- Groups and role assignments are scoped only to Operating Organizations.
-- Depends on: platform roles, 202_operating_organizations.sql, 001_demo_rbac.sql
-- ============================================================================

DO $operating_org_rbac$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[003_operating_organization_rbac] athyper tenant not found';
    END IF;

    INSERT INTO shared.role (code, name, persona_id, module_id, metadata, created_by)
    SELECT r.code, r.name, p.id, m.id, r.metadata, v_su
    FROM (VALUES
        ('strategic_buyer', 'Strategic Buyer', 'agent', 'SOURCE', '{"domain":"procurement"}'::jsonb),
        ('sourcing_approver', 'Sourcing Approver', 'manager', 'SOURCE', '{"domain":"procurement"}'::jsonb),
        ('regional_buyer', 'Regional Buyer', 'agent', 'SOURCE', '{"domain":"procurement"}'::jsonb),
        ('enterprise_sales', 'Enterprise Sales', 'agent', 'SALE', '{"domain":"sales"}'::jsonb),
        ('regional_sales_manager', 'Regional Sales Manager', 'manager', 'SALE', '{"domain":"sales"}'::jsonb),
        ('operating_org_auditor', 'Operating Organization Auditor', 'reporter', 'SOURCE', '{"domain":"cross_domain"}'::jsonb)
    ) AS r(code, name, persona_code, module_code, metadata)
    JOIN shared.persona p ON p.code = r.persona_code
    JOIN shared.module m ON m.code = r.module_code
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        persona_id = EXCLUDED.persona_id,
        module_id = EXCLUDED.module_id,
        metadata = EXCLUDED.metadata,
        status = 'active',
        updated_at = now(),
        updated_by = v_su;

    INSERT INTO master.auth_group (
        tenant_id, code, name, description, is_system, is_self_service_eligible, created_by
    ) VALUES
        (v_tenant_id, 'GROUP-SOURCING-BUYERS', 'Group Sourcing Buyers', 'Buyers for Group Strategic Sourcing.', true, false, v_su),
        (v_tenant_id, 'GROUP-SOURCING-APPROVERS', 'Group Sourcing Approvers', 'Approvers for Group Strategic Sourcing.', true, false, v_su),
        (v_tenant_id, 'APAC-PROCUREMENT-BUYERS', 'APAC Procurement Buyers', 'Buyers for Regional Procurement APAC.', true, false, v_su),
        (v_tenant_id, 'GROUP-ENTERPRISE-SALES-USERS', 'Group Enterprise Sales Users', 'Users for Group Enterprise Sales.', true, false, v_su),
        (v_tenant_id, 'APAC-SALES-MANAGERS', 'APAC Sales Managers', 'Managers for Regional Sales APAC.', true, false, v_su),
        (v_tenant_id, 'OPERATING-ORG-AUDITORS', 'Operating Organization Auditors', 'Read-only audit access to selected Operating Organizations.', true, false, v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        status = 'active',
        updated_at = now(),
        updated_by = v_su;

    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id, visibility_scope,
        assignment_scope_type, assignment_scope_ref_id, include_descendants, created_by
    )
    SELECT
        v_tenant_id,
        g.id,
        r.id,
        'all',
        'operating_organization',
        oo.id,
        true,
        v_su
    FROM (VALUES
        ('GROUP-SOURCING-BUYERS', 'strategic_buyer', 'procurement', 'GROUP-SOURCING'),
        ('GROUP-SOURCING-APPROVERS', 'sourcing_approver', 'procurement', 'GROUP-SOURCING'),
        ('APAC-PROCUREMENT-BUYERS', 'regional_buyer', 'procurement', 'PROC-APAC'),
        ('GROUP-ENTERPRISE-SALES-USERS', 'enterprise_sales', 'sales', 'GROUP-ENTERPRISE-SALES'),
        ('APAC-SALES-MANAGERS', 'regional_sales_manager', 'sales', 'SALES-APAC'),
        ('OPERATING-ORG-AUDITORS', 'operating_org_auditor', 'procurement', 'GROUP-SOURCING'),
        ('OPERATING-ORG-AUDITORS', 'operating_org_auditor', 'procurement', 'PROC-APAC'),
        ('OPERATING-ORG-AUDITORS', 'operating_org_auditor', 'sales', 'GROUP-ENTERPRISE-SALES'),
        ('OPERATING-ORG-AUDITORS', 'operating_org_auditor', 'sales', 'SALES-APAC')
    ) AS x(group_code, role_code, domain_code, org_code)
    JOIN master.auth_group g
      ON g.tenant_id = v_tenant_id AND g.code = x.group_code
    JOIN shared.role r ON r.code = x.role_code
    JOIN master.operating_organization oo
      ON oo.tenant_id = v_tenant_id
     AND oo.domain = x.domain_code
     AND oo.code = x.org_code
     AND oo.status = 'active'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants)
    DO UPDATE SET
        visibility_scope = EXCLUDED.visibility_scope,
        status = 'active',
        updated_at = now(),
        updated_by = v_su;

    RAISE NOTICE '[003_operating_organization_rbac] Seeded six groups and Operating Organization-scoped roles';
END;
$operating_org_rbac$;
