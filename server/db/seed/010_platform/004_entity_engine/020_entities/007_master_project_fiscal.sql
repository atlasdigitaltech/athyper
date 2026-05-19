-- 020_entities/007_master_project_fiscal.sql
-- Entities 61–64: Finance Master — Projects & Fiscal
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 61. project ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'project', 'PROJ', 'project', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'project',
        'Project', 'Projects', 'folder-kanban', 'teal',
        '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 62. project_item ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'project_item', 'PRJIT', 'project_item', 'DOCUMENT_RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'project_item',
        'Project Item', 'Project Items', 'list-checks', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 63. dimension_set ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_set', 'DMSET', 'dimension_set', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'dimension_set',
        'Dimension Set', 'Dimension Sets', 'layers-3', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 64. fiscal_period ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'fiscal_period', 'FPER', 'fiscal_period', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'locked', 'master', 'fiscal_period',
        'Fiscal Period', 'Fiscal Periods', 'calendar', 'green',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
