-- Binds lifecycle state machines to entity names. All bindings are system-global (tenant_id IS NULL).
-- Run AFTER 030_control_lifecycle_contract.sql / 030p_p2p_lifecycle_contract.sql and 040_control_entity_contract.sql.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';

    -- Lifecycle UUIDs (resolved by code)
    v_lc_active_inactive          uuid;
    v_lc_active_inactive_archived uuid;
    v_lc_org_master               uuid;
    v_lc_bp_master                uuid;
    v_lc_tenant                   uuid;
    v_lc_principal                uuid;
    v_lc_employee                 uuid;
    v_lc_gl_account               uuid;
    v_lc_fiscal_period            uuid;
    v_lc_attachment               uuid;
    v_lc_comment                  uuid;
    v_lc_conversation             uuid;
    v_lc_template                 uuid;
    v_lc_master_doc               uuid;
    v_lc_project                  uuid;
    v_lc_asset                    uuid;
    v_lc_budget_profile           uuid;
    v_lc_budget_allocation        uuid;
    v_lc_bank_account             uuid;
    v_lc_content                  uuid;
    v_lc_delegation               uuid;
BEGIN
    -- Resolve lifecycle UUIDs by code.
    SELECT id INTO v_lc_active_inactive          FROM control.lifecycle WHERE code = 'lc_active_inactive'          AND tenant_id IS NULL;
    SELECT id INTO v_lc_active_inactive_archived FROM control.lifecycle WHERE code = 'lc_active_inactive_archived' AND tenant_id IS NULL;

    SELECT id INTO v_lc_org_master               FROM control.lifecycle WHERE code = 'lc_org_master'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_bp_master                FROM control.lifecycle WHERE code = 'lc_bp_master'                AND tenant_id IS NULL;
    SELECT id INTO v_lc_tenant                   FROM control.lifecycle WHERE code = 'lc_tenant'                   AND tenant_id IS NULL;
    SELECT id INTO v_lc_principal                FROM control.lifecycle WHERE code = 'lc_principal'                AND tenant_id IS NULL;
    SELECT id INTO v_lc_employee                 FROM control.lifecycle WHERE code = 'lc_employee'                 AND tenant_id IS NULL;
    SELECT id INTO v_lc_gl_account               FROM control.lifecycle WHERE code = 'lc_gl_account'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_fiscal_period            FROM control.lifecycle WHERE code = 'lc_fiscal_period'            AND tenant_id IS NULL;
    SELECT id INTO v_lc_attachment               FROM control.lifecycle WHERE code = 'lc_attachment'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_comment                  FROM control.lifecycle WHERE code = 'lc_comment'                  AND tenant_id IS NULL;
    SELECT id INTO v_lc_conversation             FROM control.lifecycle WHERE code = 'lc_conversation'             AND tenant_id IS NULL;
    SELECT id INTO v_lc_template                 FROM control.lifecycle WHERE code = 'lc_template'                 AND tenant_id IS NULL;
    SELECT id INTO v_lc_master_doc               FROM control.lifecycle WHERE code = 'lc_master_doc'               AND tenant_id IS NULL;
    SELECT id INTO v_lc_project                  FROM control.lifecycle WHERE code = 'lc_project'                  AND tenant_id IS NULL;
    SELECT id INTO v_lc_asset                    FROM control.lifecycle WHERE code = 'lc_asset'                    AND tenant_id IS NULL;
    SELECT id INTO v_lc_budget_profile           FROM control.lifecycle WHERE code = 'lc_budget_profile'           AND tenant_id IS NULL;
    SELECT id INTO v_lc_budget_allocation        FROM control.lifecycle WHERE code = 'lc_budget_allocation'        AND tenant_id IS NULL;
    SELECT id INTO v_lc_bank_account             FROM control.lifecycle WHERE code = 'lc_bank_account'             AND tenant_id IS NULL;
    SELECT id INTO v_lc_content                  FROM control.lifecycle WHERE code = 'lc_content'                  AND tenant_id IS NULL;
    SELECT id INTO v_lc_delegation               FROM control.lifecycle WHERE code = 'lc_delegation'               AND tenant_id IS NULL;

    IF v_lc_active_inactive IS NULL THEN
        RAISE EXCEPTION 'lifecycle rows not found â€” run 010_lifecycles/*.sql first';
    END IF;

    -- â”€â”€ IAM: Tenant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tenant', v_lc_tenant, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ IAM: Principal identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'principal',                   v_lc_principal, 100, v_su),
        (NULL, 'principal_profile',           v_lc_principal, 100, v_su),
        (NULL, 'principal_identity_binding',  v_lc_principal, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ IAM: Groups, teams & grants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'auth_group',               v_lc_active_inactive, 100, v_su),
        (NULL, 'principal_persona',        v_lc_active_inactive, 100, v_su),
        (NULL, 'team',                     v_lc_active_inactive, 100, v_su),
        (NULL, 'access_grant',             v_lc_delegation,      100, v_su),
        (NULL, 'delegation_grant',         v_lc_delegation,      100, v_su),
        (NULL, 'group_feature_grant',      v_lc_active_inactive, 100, v_su),
        (NULL, 'principal_feature_grant',  v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ IAM: Reference/lookup masters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'label',      v_lc_active_inactive, 100, v_su),
        (NULL, 'owner_type', v_lc_active_inactive, 100, v_su),
        (NULL, 'address',    v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ IAM: Tenant configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tenant_module_subscription',   v_lc_active_inactive, 100, v_su),
        (NULL, 'tenant_feature_entitlement',   v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ IAM: Self-service requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'user_profile_update_request', v_lc_master_doc, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ NTF: Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'notification',         v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'notification_default', v_lc_active_inactive,          100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ ACT/CMS: Collaborative objects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'attachment',   v_lc_attachment,   100, v_su),
        (NULL, 'comment',      v_lc_comment,      100, v_su),
        (NULL, 'conversation', v_lc_conversation, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ DOC: Document & template masters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'document',      v_lc_master_doc,      100, v_su),
        (NULL, 'template',      v_lc_template,        100, v_su),
        (NULL, 'brand_profile', v_lc_active_inactive, 100, v_su),
        (NULL, 'letterhead',    v_lc_active_inactive, 100, v_su),
        (NULL, 'print_profile', v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Org structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'legal_entity',  v_lc_org_master,      100, v_su),
        (NULL, 'company_code',  v_lc_org_master,      100, v_su),
        (NULL, 'cost_center',   v_lc_org_master,      100, v_su),
        (NULL, 'profit_center', v_lc_org_master,      100, v_su),
        (NULL, 'site',          v_lc_org_master,      100, v_su),
        (NULL, 'warehouse',     v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Chart of Accounts / GL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'chart_of_account', v_lc_active_inactive, 100, v_su),
        (NULL, 'gl_account',       v_lc_gl_account,      100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Project & Period â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'project',       v_lc_project,      100, v_su),
        (NULL, 'fiscal_period', v_lc_fiscal_period, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Business Partners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'business_partner', v_lc_bp_master, 100, v_su),
        (NULL, 'customer',         v_lc_bp_master, 100, v_su),
        (NULL, 'supplier',         v_lc_bp_master, 100, v_su),
        (NULL, 'employee',         v_lc_employee,  100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Assets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'asset_class', v_lc_active_inactive, 100, v_su),
        (NULL, 'asset',       v_lc_asset,           100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Dimensions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'dimension_type',  v_lc_active_inactive, 100, v_su),
        (NULL, 'dimension_value', v_lc_active_inactive, 100, v_su),
        (NULL, 'dimension_set',   v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Tax & FX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tax_jurisdiction', v_lc_active_inactive, 100, v_su),
        (NULL, 'tax_type',         v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Budget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'budget_profile',    v_lc_budget_profile,    100, v_su),
        (NULL, 'budget_allocation', v_lc_budget_allocation, 100, v_su),
        (NULL, 'planning_model',    v_lc_active_inactive,   100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ Finance: Banking & Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'bank_party',      v_lc_active_inactive, 100, v_su),
        (NULL, 'bank_account',    v_lc_bank_account,    100, v_su),
        (NULL, 'bank_branch',     v_lc_active_inactive, 100, v_su),
        (NULL, 'payment_method',  v_lc_active_inactive, 100, v_su),
        (NULL, 'payment_term',    v_lc_active_inactive, 100, v_su),
        (NULL, 'holiday_calendar', v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ REL: Products & Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'product',            v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'item',               v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'commodity_category', v_lc_active_inactive,          100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- â”€â”€ UI / CMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'saved_view',               v_lc_active_inactive, 100, v_su),
        (NULL, 'dashboard',                v_lc_active_inactive, 100, v_su),
        (NULL, 'content_item',             v_lc_content,         100, v_su),
        (NULL, 'content_item_access_grant', v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    RAISE NOTICE 'control.entity_lifecycle: % system-global bindings seeded',
        (SELECT count(*) FROM control.entity_lifecycle WHERE tenant_id IS NULL);
END $$;


-- Coverage backfill: bind a generic active/active-archived/attachment/master-doc lifecycle
-- to every master.* schema-coverage entity that has a status column and no explicit binding.
DO $$
DECLARE
    v_system_user uuid := '00000000-0000-0000-0000-000000000001';
    v_lc_active uuid;
    v_lc_active_archived uuid;
    v_lc_attachment uuid;
    v_lc_master_doc uuid;
    v_rows integer := 0;
BEGIN
    SELECT id INTO v_lc_active
    FROM control.lifecycle
    WHERE code = 'lc_active_inactive'
      AND tenant_id IS NULL;

    SELECT id INTO v_lc_active_archived
    FROM control.lifecycle
    WHERE code = 'lc_active_inactive_archived'
      AND tenant_id IS NULL;

    SELECT id INTO v_lc_attachment
    FROM control.lifecycle
    WHERE code = 'lc_attachment'
      AND tenant_id IS NULL;

    SELECT id INTO v_lc_master_doc
    FROM control.lifecycle
    WHERE code = 'lc_master_doc'
      AND tenant_id IS NULL;

    IF v_lc_active IS NULL THEN
        RAISE EXCEPTION 'lc_active_inactive lifecycle not found; run 010_lifecycles first';
    END IF;

    INSERT INTO control.entity_lifecycle (
        tenant_id,
        entity_name,
        lifecycle_id,
        priority,
        created_by
    )
    SELECT
        NULL::uuid,
        e.name,
        CASE
            WHEN e.entity_code = 'attachment_folder' THEN COALESCE(v_lc_attachment, v_lc_active)
            WHEN e.entity_code IN (
                'party_risk_assessment',
                'party_risk_evidence',
                'party_risk_mitigation'
            ) THEN COALESCE(v_lc_master_doc, v_lc_active_archived, v_lc_active)
            WHEN EXISTS (
                SELECT 1
                FROM information_schema.columns del
                WHERE del.table_schema = e.table_schema
                  AND del.table_name = e.table_name
                  AND del.column_name IN ('deleted_at', 'archived_at')
            ) THEN COALESCE(v_lc_active_archived, v_lc_active)
            ELSE v_lc_active
        END,
        100,
        v_system_user
    FROM control.entity e
    WHERE e.table_schema = 'master'
      AND e.ownership_model = 'system'
      AND e.backing_type = 'table'
      AND COALESCE((e.feature_flags ->> 'is_readonly')::boolean, false) = false
      AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
      AND EXISTS (
          SELECT 1
          FROM information_schema.columns ic
          WHERE ic.table_schema = e.table_schema
            AND ic.table_name = e.table_name
            AND ic.column_name = 'status'
      )
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE 'Master schema coverage lifecycle bindings inserted %', v_rows;
END $$;


-- Document lifecycle bindings.
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'purchase_invoice', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'purchase_invoice' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'purchase_order', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'commitment' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'journal_entry', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'journal_entry' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'payment_entry', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'payment_entry' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (tenant_id, entity_name, lifecycle_id, priority, created_by)
SELECT NULL::uuid, 'supplier_commodity_category', lc.id, 100,
       '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'lc_active_inactive'
  AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


-- Commodity classification rule entity bindings.
INSERT INTO control.entity_lifecycle
    (tenant_id, entity_name, lifecycle_id, priority, created_by)
SELECT NULL::uuid, entity_code, lc.id, 100, '00000000-0000-0000-0000-000000000000'
FROM control.entity e
JOIN control.lifecycle lc ON lc.code = 'lc_active_inactive' AND lc.tenant_id IS NULL
WHERE e.entity_code IN (
          'commodity_classification_to_intent_rule',
          'commodity_classification',
          'commodity_code_to_category_rule'
      )
  AND e.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (tenant_id, entity_name, lifecycle_id, priority, created_by)
SELECT NULL::uuid, e.entity_code, lc.id, 100, '00000000-0000-0000-0000-000000000000'
FROM control.entity e
JOIN control.lifecycle lc ON lc.code = 'lc_active_inactive' AND lc.tenant_id IS NULL
WHERE e.entity_code IN (
          'commodity_category_buy_policy',
          'commodity_category_sell_policy',
          'commodity_category_inventory_policy'
      )
  AND e.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'user_profile_update_request', lc.id, NULL, NULL, 100,
       '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'upupr' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'supplier', lc.id, NULL, NULL, 100,
       '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'supplier' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'customer', lc.id, NULL, NULL, 100,
       '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'customer' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


-- Retired entity bindings.
DELETE FROM control.entity_lifecycle WHERE entity_name = 'company_code_supplier_spend_policy';
DELETE FROM control.entity_lifecycle WHERE entity_name = 'supplier_spend_category';


-- P2P bindings (PR / POC / DN / receipt / SES). Lifecycles defined in 030p_p2p_lifecycle_contract.sql.
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'purchase_requisition', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'purchase_requisition' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'purchase_order_confirmation', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'purchase_order_confirmation' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'delivery_note', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'delivery_note' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'receipt', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'receipt' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;


INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
SELECT 'service_sheet', lc.id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'service_sheet' AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;




