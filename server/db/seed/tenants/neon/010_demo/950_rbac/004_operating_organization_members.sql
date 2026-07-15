-- ============================================================================
-- ATHYPER DEMO OPERATING ORGANIZATION GROUP MEMBERS
-- Depends on: 001_demo_rbac.sql, 003_operating_organization_rbac.sql
-- ============================================================================

DO $operating_org_members$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id, joined_at, added_by, created_by
    )
    SELECT
        v_tenant_id,
        p.id,
        g.id,
        now(),
        v_su,
        v_su
    FROM (VALUES
        ('athq.agent', 'GROUP-SOURCING-BUYERS'),
        ('athq.manager', 'GROUP-SOURCING-APPROVERS'),
        ('kumar', 'APAC-PROCUREMENT-BUYERS'),
        ('raja', 'GROUP-ENTERPRISE-SALES-USERS'),
        ('rama', 'APAC-SALES-MANAGERS'),
        ('athq.reporter', 'OPERATING-ORG-AUDITORS')
    ) AS x(principal_code, group_code)
    JOIN master.principal p
      ON p.tenant_id = v_tenant_id AND p.code = x.principal_code
    JOIN master.auth_group g
      ON g.tenant_id = v_tenant_id AND g.code = x.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[004_operating_organization_members] Seeded six demo principal memberships';
END;
$operating_org_members$;
