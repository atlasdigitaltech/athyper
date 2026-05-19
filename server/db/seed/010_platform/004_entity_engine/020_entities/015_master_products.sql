-- 020_entities/015_master_products.sql
-- Product, item, commodity category, and commodity classification entities.
-- Depends on: shared.module rows (REL)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_rel text;
BEGIN
    SELECT id::text INTO v_rel FROM shared.module WHERE code = 'REL';

    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES
        (v_rel, 'product', 'PROD', 'product', 'MASTER', 'system', 'ent', 'table',
         'full', 'operational', 'extensible', 'master', 'product',
         'Product', 'Products', 'package', 'rose',
         '{}'::jsonb, 'ACTIVE', v_su),
        (v_rel, 'item', 'ITEM', 'item', 'MASTER', 'system', 'ent', 'table',
         'full', 'operational', 'extensible', 'master', 'item',
         'Item', 'Items', 'box', 'rose',
         '{}'::jsonb, 'ACTIVE', v_su),
        (v_rel, 'commodity_category', 'COMCAT', 'commodity_category', 'MASTER', 'system', 'ent', 'table',
         'full', 'operational', 'extensible', 'master', 'commodity_category',
         'Commodity Category', 'Commodity Categories', 'layers', 'rose',
         '{}'::jsonb, 'ACTIVE', v_su),
        (v_rel, 'commodity_classification', 'COMCL', 'commodity_classification', 'RELATION', 'system', 'ent', 'table',
         'full', 'operational', 'controlled', 'master', 'commodity_classification',
         'Commodity Classification', 'Commodity Classifications', 'tags', 'rose',
         '{"requires_owner_type_scope":true,"owner_type_column":"owner_type","default_owner_type_scope":"commodity_category"}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO UPDATE
       SET module_id        = EXCLUDED.module_id,
           name             = EXCLUDED.name,
           entity_short     = EXCLUDED.entity_short,
           entity_code      = EXCLUDED.entity_code,
           entity_class     = EXCLUDED.entity_class,
           ownership_model  = EXCLUDED.ownership_model,
           kind             = EXCLUDED.kind,
           backing_type     = EXCLUDED.backing_type,
           governance_level = EXCLUDED.governance_level,
           security_tier    = EXCLUDED.security_tier,
           mutability       = EXCLUDED.mutability,
           label_singular   = EXCLUDED.label_singular,
           label_plural     = EXCLUDED.label_plural,
           icon_key         = EXCLUDED.icon_key,
           color_token      = EXCLUDED.color_token,
           feature_flags    = COALESCE(control.entity.feature_flags, '{}'::jsonb) || EXCLUDED.feature_flags,
           status           = 'ACTIVE',
           updated_at       = now(),
           updated_by       = v_su;
END $$;
