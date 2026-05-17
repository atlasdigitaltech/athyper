-- 050_entity_lifecycles.sql
-- Binds lifecycle state machines to master.* entity names.
-- All bindings are system-global (tenant_id IS NULL).
-- Idempotent: ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING
-- Run AFTER: 010_lifecycles/*.sql + 020_entities/*.sql

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
        RAISE EXCEPTION 'lifecycle rows not found — run 010_lifecycles/*.sql first';
    END IF;

    -- ── IAM: Tenant ──────────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tenant', v_lc_tenant, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── IAM: Principal identity ───────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'principal',                   v_lc_principal, 100, v_su),
        (NULL, 'principal_profile',           v_lc_principal, 100, v_su),
        (NULL, 'principal_identity_binding',  v_lc_principal, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── IAM: Groups, teams & grants ──────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'auth_group',               v_lc_active_inactive, 100, v_su),
        (NULL, 'principal_persona',        v_lc_active_inactive, 100, v_su),
        (NULL, 'team',                     v_lc_active_inactive, 100, v_su),
        (NULL, 'access_grant',             v_lc_delegation,      100, v_su),
        (NULL, 'delegation_grant',         v_lc_delegation,      100, v_su),
        (NULL, 'group_feature_grant',      v_lc_active_inactive, 100, v_su),
        (NULL, 'principal_feature_grant',  v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── IAM: Reference/lookup masters ────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'label',      v_lc_active_inactive, 100, v_su),
        (NULL, 'owner_type', v_lc_active_inactive, 100, v_su),
        (NULL, 'address',    v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── IAM: Tenant configuration ─────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tenant_module_subscription',   v_lc_active_inactive, 100, v_su),
        (NULL, 'tenant_feature_entitlement',   v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── IAM: Self-service requests ────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'user_profile_update_request', v_lc_master_doc, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── NTF: Notifications ───────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'notification',         v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'notification_default', v_lc_active_inactive,          100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── ACT/CMS: Collaborative objects ───────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'attachment',   v_lc_attachment,   100, v_su),
        (NULL, 'comment',      v_lc_comment,      100, v_su),
        (NULL, 'conversation', v_lc_conversation, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── DOC: Document & template masters ─────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'document',      v_lc_master_doc,      100, v_su),
        (NULL, 'template',      v_lc_template,        100, v_su),
        (NULL, 'brand_profile', v_lc_active_inactive, 100, v_su),
        (NULL, 'letterhead',    v_lc_active_inactive, 100, v_su),
        (NULL, 'print_profile', v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Org structure ────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'legal_entity',  v_lc_org_master,      100, v_su),
        (NULL, 'company_code',  v_lc_org_master,      100, v_su),
        (NULL, 'cost_center',   v_lc_org_master,      100, v_su),
        (NULL, 'profit_center', v_lc_org_master,      100, v_su),
        (NULL, 'site',          v_lc_org_master,      100, v_su),
        (NULL, 'warehouse',     v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Chart of Accounts / GL ──────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'chart_of_account', v_lc_active_inactive, 100, v_su),
        (NULL, 'gl_account',       v_lc_gl_account,      100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Project & Period ─────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'project',       v_lc_project,      100, v_su),
        (NULL, 'fiscal_period', v_lc_fiscal_period, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Business Partners ────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'business_partner', v_lc_bp_master, 100, v_su),
        (NULL, 'customer',         v_lc_bp_master, 100, v_su),
        (NULL, 'supplier',         v_lc_bp_master, 100, v_su),
        (NULL, 'employee',         v_lc_employee,  100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Assets ───────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'asset_class', v_lc_active_inactive, 100, v_su),
        (NULL, 'asset',       v_lc_asset,           100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Dimensions ───────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'dimension_type',  v_lc_active_inactive, 100, v_su),
        (NULL, 'dimension_value', v_lc_active_inactive, 100, v_su),
        (NULL, 'dimension_set',   v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Tax & FX ────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'tax_jurisdiction', v_lc_active_inactive, 100, v_su),
        (NULL, 'tax_type',         v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Budget ───────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'budget_profile',    v_lc_budget_profile,    100, v_su),
        (NULL, 'budget_allocation', v_lc_budget_allocation, 100, v_su),
        (NULL, 'planning_model',    v_lc_active_inactive,   100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── Finance: Banking & Payments ───────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'bank_party',      v_lc_active_inactive, 100, v_su),
        (NULL, 'bank_account',    v_lc_bank_account,    100, v_su),
        (NULL, 'bank_branch',     v_lc_active_inactive, 100, v_su),
        (NULL, 'payment_method',  v_lc_active_inactive, 100, v_su),
        (NULL, 'payment_term',    v_lc_active_inactive, 100, v_su),
        (NULL, 'holiday_calendar', v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── REL: Products & Items ─────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'product',            v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'item',               v_lc_active_inactive_archived, 100, v_su),
        (NULL, 'commodity_category', v_lc_active_inactive,          100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    -- ── UI / CMS ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by) VALUES
        (NULL, 'saved_view',               v_lc_active_inactive, 100, v_su),
        (NULL, 'dashboard',                v_lc_active_inactive, 100, v_su),
        (NULL, 'content_item',             v_lc_content,         100, v_su),
        (NULL, 'content_item_access_grant', v_lc_active_inactive, 100, v_su)
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    RAISE NOTICE 'control.entity_lifecycle: % system-global bindings seeded',
        (SELECT count(*) FROM control.entity_lifecycle WHERE tenant_id IS NULL);
END $$;
