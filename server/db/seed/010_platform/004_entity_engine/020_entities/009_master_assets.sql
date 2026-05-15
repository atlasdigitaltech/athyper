-- 020_entities/009_master_assets.sql
-- Entities 70–74: Assets
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 70. asset_class ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_class', 'ASCLS', 'asset_class', 'MASTER', 'system', 'ent', 'table',
        'full', 'config', 'controlled', 'master', 'asset_class',
        'Asset Class', 'Asset Classes', 'layers', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 71. asset ────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset', 'ASSET', 'asset', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'asset',
        'Asset', 'Assets', 'hard-drive', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 72. asset_book ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_book', 'ASTBK', 'asset_book', 'DOCUMENT_RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'asset_book',
        'Asset Book', 'Asset Books', 'book-marked', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 73. asset_component ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_component', 'ASTCMP', 'asset_component', 'DOCUMENT_RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'asset_component',
        'Asset Component', 'Asset Components', 'cpu', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 74. asset_assignment_history ─────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'asset_assignment_history', 'ASTASGN', 'asset_assignment_history', 'LOG', 'system', 'ent', 'table',
        'lite', 'operational', 'locked', 'master', 'asset_assignment_history',
        'Asset Assignment History', 'Asset Assignment History', 'history', 'yellow',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
