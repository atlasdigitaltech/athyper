-- ============================================================================
-- Athyper demo Operating Organizations
-- Domains: procurement and sales
-- Depends on: 199_gl_preseed.sql
-- Idempotent: yes
-- ============================================================================

DO $operating_org_seed$
DECLARE
    v_tenant_id uuid;
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_group_sourcing uuid;
    v_proc_apac uuid;
    v_group_sales uuid;
    v_sales_apac uuid;
    v_athq_company uuid;
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '202_operating_organizations',
        'version', '1.0.0'
    ));
BEGIN
    -- Generic updated_at triggers resolve the actor from request/session
    -- context. Tenant seeds execute without a login session, so establish the
    -- canonical system actor locally for this transaction.
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[202_operating_organizations] athyper tenant not found';
    END IF;

    SELECT id INTO v_athq_company
    FROM master.company_code
    WHERE tenant_id = v_tenant_id AND code = 'ATHQ';

    IF v_athq_company IS NULL THEN
        RAISE EXCEPTION '[202_operating_organizations] ATHQ company code not found';
    END IF;

    INSERT INTO master.operating_organization (
        tenant_id, domain, code, name, description,
        effective_from, metadata, status, created_by, updated_at, updated_by
    ) VALUES
        (v_tenant_id, 'procurement', 'GROUP-SOURCING',
         'Group Strategic Sourcing',
         'Cross-company strategic sourcing for the Athyper group.',
         current_date, v_meta, 'active', v_su, now(), v_su),
        (v_tenant_id, 'procurement', 'PROC-APAC',
         'Regional Procurement APAC',
         'Regional procurement and shared buying for APAC companies.',
         current_date, v_meta, 'active', v_su, now(), v_su),
        (v_tenant_id, 'sales', 'GROUP-ENTERPRISE-SALES',
         'Group Enterprise Sales',
         'Cross-company enterprise opportunity and quotation orchestration.',
         current_date, v_meta, 'active', v_su, now(), v_su),
        (v_tenant_id, 'sales', 'SALES-APAC',
         'Regional Sales APAC',
         'Regional sales orchestration for APAC companies.',
         current_date, v_meta, 'active', v_su, now(), v_su)
    ON CONFLICT (tenant_id, domain, code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        effective_from = EXCLUDED.effective_from,
        metadata = EXCLUDED.metadata,
        status = EXCLUDED.status,
        updated_at = now(),
        updated_by = EXCLUDED.created_by;

    SELECT id INTO v_group_sourcing FROM master.operating_organization
    WHERE tenant_id = v_tenant_id AND domain = 'procurement' AND code = 'GROUP-SOURCING';
    SELECT id INTO v_proc_apac FROM master.operating_organization
    WHERE tenant_id = v_tenant_id AND domain = 'procurement' AND code = 'PROC-APAC';
    SELECT id INTO v_group_sales FROM master.operating_organization
    WHERE tenant_id = v_tenant_id AND domain = 'sales' AND code = 'GROUP-ENTERPRISE-SALES';
    SELECT id INTO v_sales_apac FROM master.operating_organization
    WHERE tenant_id = v_tenant_id AND domain = 'sales' AND code = 'SALES-APAC';

    INSERT INTO master.operating_organization_company (
        tenant_id, operating_organization_id, company_code_id,
        participation_role, effective_from, metadata, status, created_by,
        updated_at, updated_by
    )
    SELECT
        v_tenant_id,
        org.id,
        cc.id,
        member.participation_role,
        current_date,
        v_meta,
        'active',
        v_su,
        now(),
        v_su
    FROM (VALUES
        (v_group_sourcing, 'ATHQ', 'lead_buyer'),
        (v_group_sourcing, 'AMRE', 'participant'),
        (v_group_sourcing, 'AQTU', 'participant'),
        (v_group_sourcing, 'ASAC', 'participant'),
        (v_group_sourcing, 'AUET', 'participant'),

        (v_proc_apac, 'ATHQ', 'lead_buyer'),
        (v_proc_apac, 'AMRE', 'participant'),
        (v_proc_apac, 'ASGF', 'participant'),
        (v_proc_apac, 'AITM', 'participant'),
        (v_proc_apac, 'ATEM', 'participant'),
        (v_proc_apac, 'AJED', 'participant'),
        (v_proc_apac, 'APHS', 'participant'),

        (v_group_sales, 'ATHQ', 'lead_seller'),
        (v_group_sales, 'AMRE', 'participant'),
        (v_group_sales, 'AQTU', 'participant'),
        (v_group_sales, 'ASAC', 'participant'),
        (v_group_sales, 'AUET', 'participant'),

        (v_sales_apac, 'ATHQ', 'lead_seller'),
        (v_sales_apac, 'AMRE', 'participant'),
        (v_sales_apac, 'ASGF', 'participant'),
        (v_sales_apac, 'AITM', 'participant'),
        (v_sales_apac, 'ATEM', 'participant'),
        (v_sales_apac, 'AJED', 'participant'),
        (v_sales_apac, 'APHS', 'participant')
    ) AS member(org_id, company_code, participation_role)
    JOIN master.operating_organization org
      ON org.tenant_id = v_tenant_id AND org.id = member.org_id
    JOIN master.company_code cc
      ON cc.tenant_id = v_tenant_id AND cc.code = member.company_code
    ON CONFLICT (tenant_id, operating_organization_id, company_code_id) DO UPDATE SET
        participation_role = EXCLUDED.participation_role,
        effective_from = EXCLUDED.effective_from,
        effective_until = NULL,
        metadata = EXCLUDED.metadata,
        status = EXCLUDED.status,
        updated_at = now(),
        updated_by = EXCLUDED.created_by;

    INSERT INTO master.procurement_organization_profile (
        tenant_id, operating_organization_id, organization_type,
        buying_model_default, default_currency, default_lead_company_id,
        metadata, created_by, updated_at, updated_by
    ) VALUES
        (v_tenant_id, v_group_sourcing, 'central_procurement',
         'federated', 'MYR', v_athq_company, v_meta, v_su, now(), v_su),
        (v_tenant_id, v_proc_apac, 'regional_procurement',
         'federated', 'MYR', v_athq_company, v_meta, v_su, now(), v_su)
    ON CONFLICT (tenant_id, operating_organization_id) DO UPDATE SET
        organization_type = EXCLUDED.organization_type,
        buying_model_default = EXCLUDED.buying_model_default,
        default_currency = EXCLUDED.default_currency,
        default_lead_company_id = EXCLUDED.default_lead_company_id,
        metadata = EXCLUDED.metadata,
        updated_at = now(),
        updated_by = EXCLUDED.created_by;

    INSERT INTO master.sales_organization_profile (
        tenant_id, operating_organization_id, organization_type,
        selling_model_default, default_currency,
        default_booking_company_id, default_invoicing_company_id,
        metadata, created_by, updated_at, updated_by
    ) VALUES
        (v_tenant_id, v_group_sales, 'enterprise_sales',
         'federated', 'MYR', v_athq_company, v_athq_company, v_meta, v_su, now(), v_su),
        (v_tenant_id, v_sales_apac, 'regional_sales',
         'federated', 'MYR', v_athq_company, v_athq_company, v_meta, v_su, now(), v_su)
    ON CONFLICT (tenant_id, operating_organization_id) DO UPDATE SET
        organization_type = EXCLUDED.organization_type,
        selling_model_default = EXCLUDED.selling_model_default,
        default_currency = EXCLUDED.default_currency,
        default_booking_company_id = EXCLUDED.default_booking_company_id,
        default_invoicing_company_id = EXCLUDED.default_invoicing_company_id,
        metadata = EXCLUDED.metadata,
        updated_at = now(),
        updated_by = EXCLUDED.created_by;

    RAISE NOTICE '[202_operating_organizations] Seeded 4 Operating Organizations and memberships';
END;
$operating_org_seed$;
