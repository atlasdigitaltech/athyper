-- 020_entities/010_master_dimensions.sql
-- Entities 75–80: Dimensions & Analytics
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 75. dimension_type ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_type', 'DMTP', 'dimension_type', 'DIMENSION', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'dimension_type',
        'Dimension Type', 'Dimension Types', 'layout-grid', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 76. dimension_value ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_value', 'DMVAL', 'dimension_value', 'DIMENSION', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'dimension_value',
        'Dimension Value', 'Dimension Values', 'tag', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 77. dimension_set_item ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'dimension_set_item', 'DMSIT', 'dimension_set_item', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'dimension_set_item',
        'Dimension Set Item', 'Dimension Set Items', 'list-plus', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 78. business_intent ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'business_intent', 'BINT', 'business_intent', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'business_intent',
        'Business Intent', 'Business Intents', 'lightbulb', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 79. company_code_intent_policy ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_intent_policy', 'CCIP', 'company_code_intent_policy', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_intent_policy',
        'Company Intent Policy', 'Company Intent Policies', 'shield-check', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 80. company_code_dimension_default ───────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_dimension_default', 'CCDD', 'company_code_dimension_default', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_dimension_default',
        'Dimension Default', 'Dimension Defaults', 'settings', 'teal',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
