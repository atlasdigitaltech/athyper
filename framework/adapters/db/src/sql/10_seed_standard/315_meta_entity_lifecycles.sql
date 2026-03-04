/* ============================================================================
   Athyper v2.1 — Meta Lifecycle Definitions & Entity Bindings
   Creates lifecycle state machines and binds them to business entities.

   Dependencies: meta.lifecycle, meta.lifecycle_state, meta.lifecycle_transition,
                 meta.entity_lifecycle, meta.entity (from 300_meta_entity_registration.sql)
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
    v_lc_id  uuid;
    v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_s6 uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP

        -- ====================================================================
        -- LC-1: ENT_MASTER — Standard Entity Master Lifecycle
        -- DRAFT → ACTIVE → INACTIVE → ARCHIVED
        -- Used by: Customer, Supplier, Product, ProductCategory
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'ENT_MASTER', 'Entity Master Lifecycle',
                'Standard 4-state lifecycle for business master entities', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',    'Draft',    false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ACTIVE',   'Active',   false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'INACTIVE', 'Inactive', false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ARCHIVED', 'Archived', true,  40, 'system') RETURNING id INTO v_s4;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'activate',   'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'deactivate', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s2, 'reactivate', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'archive',    'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
                (v_tenant, 'Customer',        v_lc_id, 100, 'system'),
                (v_tenant, 'Supplier',        v_lc_id, 100, 'system'),
                (v_tenant, 'Product',         v_lc_id, 100, 'system'),
                (v_tenant, 'ProductCategory', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-2: EMPLOYEE — Employee Lifecycle
        -- ACTIVE → ON_LEAVE → INACTIVE → TERMINATED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'EMPLOYEE', 'Employee Lifecycle',
                'Employee employment states from active through termination', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ACTIVE',     'Active',     false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ON_LEAVE',   'On Leave',   false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'INACTIVE',   'Inactive',   false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'TERMINATED', 'Terminated', true,  40, 'system') RETURNING id INTO v_s4;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'start_leave',  'system'),
                (v_tenant, v_lc_id, v_s2, v_s1, 'end_leave',    'system'),
                (v_tenant, v_lc_id, v_s1, v_s3, 'deactivate',   'system'),
                (v_tenant, v_lc_id, v_s3, v_s1, 'reactivate',   'system'),
                (v_tenant, v_lc_id, v_s1, v_s4, 'terminate',    'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'terminate',    'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'Employee', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-3: DOC_TEMPLATE — Document Template Lifecycle
        -- DRAFT → PUBLISHED → RETIRED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'DOC_TEMPLATE', 'Document Template Lifecycle',
                'Template publishing lifecycle', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',     'Draft',     false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'PUBLISHED', 'Published', false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'RETIRED',   'Retired',   true,  30, 'system') RETURNING id INTO v_s3;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'publish', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'retire',  'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'Template', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-4: FIN_MASTER — Finance Master Standard Lifecycle
        -- DRAFT → ACTIVE → INACTIVE → ARCHIVED
        -- Used by: ChartOfAccounts, CostCenter, ProfitCenter, Warehouse, etc.
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_MASTER', 'Finance Master Lifecycle',
                'Standard 4-state lifecycle for finance master entities', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',    'Draft',    false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ACTIVE',   'Active',   false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'INACTIVE', 'Inactive', false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ARCHIVED', 'Archived', true,  40, 'system') RETURNING id INTO v_s4;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'activate',   'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'deactivate', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s2, 'reactivate', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'archive',    'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
                (v_tenant, 'ChartOfAccounts',   v_lc_id, 100, 'system'),
                (v_tenant, 'CostCenter',        v_lc_id, 100, 'system'),
                (v_tenant, 'ProfitCenter',      v_lc_id, 100, 'system'),
                (v_tenant, 'AccountingProfile', v_lc_id, 100, 'system'),
                (v_tenant, 'BusinessIntent',    v_lc_id, 100, 'system'),
                (v_tenant, 'Warehouse',         v_lc_id, 100, 'system'),
                (v_tenant, 'ItemMaster',        v_lc_id, 100, 'system'),
                (v_tenant, 'LegalEntity',       v_lc_id, 100, 'system'),
                (v_tenant, 'TaxJurisdiction',   v_lc_id, 100, 'system'),
                (v_tenant, 'CommissionPlan',    v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-5: FIN_FISCAL_PERIOD — Fiscal Period Lifecycle
        -- FUTURE → OPEN → SOFT_CLOSE → HARD_CLOSE
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_FISCAL_PERIOD', 'Fiscal Period Lifecycle',
                'Period control lifecycle with soft/hard close gates', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'FUTURE',     'Future',     false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'OPEN',       'Open',       false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'SOFT_CLOSE', 'Soft Close', false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'HARD_CLOSE', 'Hard Close', true,  40, 'system') RETURNING id INTO v_s4;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'open_period', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'soft_close',  'system'),
                (v_tenant, v_lc_id, v_s3, v_s2, 'reopen',      'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'hard_close',  'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'FiscalPeriod', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-6: FIN_OU — Operating Unit Lifecycle
        -- DRAFT → ACTIVE → UNDER_REVIEW → SUNSET → ARCHIVED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_OU', 'Operating Unit Lifecycle',
                '5-state lifecycle for finance operating units', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',        'Draft',        false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ACTIVE',       'Active',       false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'UNDER_REVIEW', 'Under Review', false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'SUNSET',       'Sunset',       false, 40, 'system') RETURNING id INTO v_s4;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ARCHIVED',     'Archived',     true,  50, 'system') RETURNING id INTO v_s5;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'activate',       'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'review',         'system'),
                (v_tenant, v_lc_id, v_s3, v_s2, 'approve_review', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'sunset',         'system'),
                (v_tenant, v_lc_id, v_s2, v_s4, 'sunset',         'system'),
                (v_tenant, v_lc_id, v_s4, v_s5, 'archive',        'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'OperatingUnit', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-7: FIN_ASSET — Asset Lifecycle
        -- WIP → CAPITALIZED → ACTIVE → IMPAIRED → RETIRED → DISPOSED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_ASSET', 'Asset Lifecycle',
                'Full fixed asset lifecycle from WIP through disposal', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'WIP',         'Work in Progress', false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'CAPITALIZED', 'Capitalized',      false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ACTIVE',      'Active',           false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'IMPAIRED',    'Impaired',         false, 40, 'system') RETURNING id INTO v_s4;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'RETIRED',     'Retired',          false, 50, 'system') RETURNING id INTO v_s5;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DISPOSED',    'Disposed',         true,  60, 'system') RETURNING id INTO v_s6;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'capitalize',         'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'activate',           'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'impair',             'system'),
                (v_tenant, v_lc_id, v_s4, v_s3, 'reverse_impairment', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s5, 'retire',             'system'),
                (v_tenant, v_lc_id, v_s5, v_s6, 'dispose',            'system'),
                (v_tenant, v_lc_id, v_s3, v_s6, 'dispose',            'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'Asset', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-8: FIN_FUNDING — Funding Profile Lifecycle
        -- DRAFT → ACTIVE → FROZEN → CLOSED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_FUNDING', 'Funding Profile Lifecycle',
                'Budget envelope lifecycle with freeze gate', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',  'Draft',  false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'ACTIVE', 'Active', false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'FROZEN', 'Frozen', false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'CLOSED', 'Closed', true,  40, 'system') RETURNING id INTO v_s4;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'activate', 'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'freeze',   'system'),
                (v_tenant, v_lc_id, v_s3, v_s2, 'unfreeze', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'close',    'system'),
                (v_tenant, v_lc_id, v_s2, v_s4, 'close',    'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'FundingProfile', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

        -- ====================================================================
        -- LC-9: FIN_AI_MODEL — AI Model Lifecycle
        -- TRAINING → VALIDATING → DEPLOYED → DEPRECATED
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'FIN_AI_MODEL', 'AI Model Lifecycle',
                'ML model deployment lifecycle', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'TRAINING',   'Training',   false, 10, 'system') RETURNING id INTO v_s1;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'VALIDATING', 'Validating', false, 20, 'system') RETURNING id INTO v_s2;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DEPLOYED',   'Deployed',   false, 30, 'system') RETURNING id INTO v_s3;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DEPRECATED', 'Deprecated', true,  40, 'system') RETURNING id INTO v_s4;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s1, v_s2, 'validate',  'system'),
                (v_tenant, v_lc_id, v_s2, v_s3, 'deploy',    'system'),
                (v_tenant, v_lc_id, v_s2, v_s1, 'retrain',   'system'),
                (v_tenant, v_lc_id, v_s3, v_s4, 'deprecate', 'system'),
                (v_tenant, v_lc_id, v_s3, v_s1, 'retrain',   'system');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'AIModelRegistry', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

    END LOOP;

    RAISE NOTICE 'Lifecycle definitions: %, states: %, transitions: %, entity bindings: %',
        (SELECT count(*) FROM meta.lifecycle),
        (SELECT count(*) FROM meta.lifecycle_state),
        (SELECT count(*) FROM meta.lifecycle_transition),
        (SELECT count(*) FROM meta.entity_lifecycle);
END $$;
