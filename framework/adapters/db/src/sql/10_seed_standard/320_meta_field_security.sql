/* ============================================================================
   Athyper v2.1 — Meta Field Security Policies
   Protects sensitive fields across ent and fin schemas.

   Dependencies: meta.entity, meta.field_security_policy
                 (from 300_meta_entity_registration.sql)
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_entity_id uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP

        -- ====================================================================
        -- ENT: Employee — PII protection
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'Employee';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, mask_strategy, scope, priority, is_active, created_by)
            VALUES
                -- Mask personal data for non-HR roles
                (v_tenant, v_entity_id, 'email',            'read', ARRAY['hr_admin','hr_manager','tenantAdmin'], 'partial', 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'phone',            'read', ARRAY['hr_admin','hr_manager','tenantAdmin'], 'partial', 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'termination_date', 'read', ARRAY['hr_admin','hr_manager','tenantAdmin'], 'redact',  'entity', 10, true, 'system'),
                -- Only HR can modify sensitive fields
                (v_tenant, v_entity_id, 'employee_number',  'write', ARRAY['hr_admin'],                           null,      'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'status',           'write', ARRAY['hr_admin','hr_manager'],               null,      'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'termination_date', 'write', ARRAY['hr_admin'],                           null,      'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- ENT: Customer — Tax ID protection
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'Customer';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, mask_strategy, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'tax_id', 'read', ARRAY['finance_admin','crm_admin','tenantAdmin'], 'partial', 'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- ENT: Supplier — Tax ID protection
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'Supplier';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, mask_strategy, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'tax_id', 'read', ARRAY['finance_admin','srm_admin','tenantAdmin'], 'partial', 'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- FIN: ChartOfAccounts — restrict structural modifications
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'ChartOfAccounts';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'account_type',          'write', ARRAY['finance_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'normal_balance',        'write', ARRAY['finance_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'subledger_type',        'write', ARRAY['finance_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'allow_direct_posting',  'write', ARRAY['finance_admin'], 'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- FIN: FundingProfile — mask financial amounts for non-finance roles
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'FundingProfile';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, mask_strategy, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'total_limit',      'read', ARRAY['finance_viewer','finance_admin','budget_manager','tenantAdmin'], 'redact', 'entity', 20, true, 'system'),
                (v_tenant, v_entity_id, 'reserved_amount',  'read', ARRAY['finance_viewer','finance_admin','budget_manager','tenantAdmin'], 'redact', 'entity', 20, true, 'system'),
                (v_tenant, v_entity_id, 'committed_amount', 'read', ARRAY['finance_viewer','finance_admin','budget_manager','tenantAdmin'], 'redact', 'entity', 20, true, 'system'),
                (v_tenant, v_entity_id, 'consumed_amount',  'read', ARRAY['finance_viewer','finance_admin','budget_manager','tenantAdmin'], 'redact', 'entity', 20, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- FIN: LegalEntity — restrict ownership and consolidation fields
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'LegalEntity';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'ownership_pct',        'write', ARRAY['finance_admin','legal_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'consolidation_method', 'write', ARRAY['finance_admin','legal_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'entity_type',          'write', ARRAY['finance_admin','legal_admin'], 'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- FIN: Asset — restrict cost/valuation modifications
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'Asset';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'acquisition_cost', 'write', ARRAY['asset_manager','finance_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'residual_value',   'write', ARRAY['asset_manager','finance_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'status',           'write', ARRAY['asset_manager','finance_admin'], 'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- FIN: CommissionPlan — restrict formula/tiers visibility
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'CommissionPlan';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, mask_strategy, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'tiers',   'read',  ARRAY['compensation_admin','finance_admin','tenantAdmin'], 'redact', 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'formula', 'read',  ARRAY['compensation_admin','finance_admin','tenantAdmin'], 'redact', 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'tiers',   'write', ARRAY['compensation_admin'],                               null,     'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'formula', 'write', ARRAY['compensation_admin'],                               null,     'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- FIN: FiscalPeriod — restrict period close operations
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'FiscalPeriod';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'status', 'write', ARRAY['finance_admin','period_controller'], 'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- FIN: AIModelRegistry — restrict deployment
        -- ====================================================================
        SELECT id INTO v_entity_id FROM meta.entity
        WHERE tenant_id = v_tenant AND name = 'AIModelRegistry';

        IF v_entity_id IS NOT NULL THEN
            INSERT INTO meta.field_security_policy (tenant_id, entity_id, field_path, policy_type,
                                                    role_list, scope, priority, is_active, created_by)
            VALUES
                (v_tenant, v_entity_id, 'status',             'write', ARRAY['ml_engineer','finance_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'capability_level',   'write', ARRAY['ml_engineer','finance_admin'], 'entity', 10, true, 'system'),
                (v_tenant, v_entity_id, 'config',             'write', ARRAY['ml_engineer'],                  'entity', 10, true, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

    END LOOP;

    RAISE NOTICE 'Field security policies created: %',
        (SELECT count(*) FROM meta.field_security_policy);
END $$;
