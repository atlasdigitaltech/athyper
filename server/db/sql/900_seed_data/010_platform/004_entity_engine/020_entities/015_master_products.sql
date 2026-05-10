-- 020_entities/015_master_products.sql
-- Entities 97–102: Products, Items & Classification
-- Depends on: shared.module rows (REL)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_rel text;
    v_acc text;
BEGIN
    SELECT id::text INTO v_rel FROM shared.module WHERE code = 'REL';
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 97. product ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'product', 'PROD', 'product', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'product',
        'Product', 'Products', 'package', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 98. item ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'item', 'ITEM', 'item', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'item',
        'Item', 'Items', 'box', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 99. item_category ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'item_category', 'ITEMCAT', 'item_category', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'item_category',
        'Item Category', 'Item Categories', 'folder-tree', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 100. commodity_classification ────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'commodity_classification', 'COMCL', 'commodity_classification', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'commodity_classification',
        'Commodity Classification', 'Commodity Classifications', 'tags', 'rose',
        false, '{"requires_owner_type_scope":true,"owner_type_column":"owner_type"}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 101. spend_category ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_rel, 'spend_category', 'SCAT', 'spend_category', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'spend_category',
        'Spend Category', 'Spend Categories', 'shopping-cart', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 102. company_code_spend_policy ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_spend_policy', 'CCSPP', 'company_code_spend_policy', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_spend_policy',
        'Spend Policy', 'Spend Policies', 'shield', 'rose',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
