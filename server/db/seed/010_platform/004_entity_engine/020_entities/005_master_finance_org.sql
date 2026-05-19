-- 020_entities/005_master_finance_org.sql
-- Entities 49–54: Finance Master — Core Org
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 49. legal_entity ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'legal_entity', 'LE', 'legal_entity', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'legal_entity',
        'Legal Entity', 'Legal Entities', 'building-2', 'emerald',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 50. company_code ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'company_code', 'CC', 'company_code', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code',
        'Company Code', 'Company Codes', 'briefcase', 'emerald',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 51. cost_center ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'cost_center', 'CCTR', 'cost_center', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'cost_center',
        'Cost Center', 'Cost Centers', 'target', 'emerald',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 52. profit_center ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'profit_center', 'PCTR', 'profit_center', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'profit_center',
        'Profit Center', 'Profit Centers', 'trending-up', 'emerald',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 53. site ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'site', 'SITE', 'site', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'site',
        'Site', 'Sites', 'map-pin', 'emerald',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 54. warehouse ────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'warehouse', 'WHS', 'warehouse', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'warehouse',
        'Warehouse', 'Warehouses', 'warehouse', 'emerald',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
