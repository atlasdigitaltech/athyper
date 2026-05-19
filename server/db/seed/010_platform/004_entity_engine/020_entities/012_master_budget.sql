-- 020_entities/012_master_budget.sql
-- Entities 84–86: Budget & Planning
-- Depends on: shared.module rows (BUDGET)

DO $$
DECLARE
    v_su     uuid := '00000000-0000-0000-0000-000000000000';
    v_budget text;
BEGIN
    SELECT id::text INTO v_budget FROM shared.module WHERE code = 'BUDGET';

    -- ── 84. budget_profile ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_budget, 'budget_profile', 'BUDGP', 'budget_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'budget_profile',
        'Budget Profile', 'Budget Profiles', 'pie-chart', 'green',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 85. budget_allocation ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_budget, 'budget_allocation', 'BUDGA', 'budget_allocation', 'DOCUMENT', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'budget_allocation',
        'Budget Allocation', 'Budget Allocations', 'bar-chart-3', 'green',
        '{"is_approvable":true}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 86. planning_model ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_budget, 'planning_model', 'PLNM', 'planning_model', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'planning_model',
        'Planning Model', 'Planning Models', 'network', 'green',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
