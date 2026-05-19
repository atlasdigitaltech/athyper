-- 035_version_fields/024_fields_commodity_category.sql
-- Phase 1 commodity category fields and product/item bridge fields.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    DELETE FROM control.entity_operation
     WHERE entity_name IN (
        'commodity_category_spend_profile',
        'commodity_category_sales_profile',
        'commodity_category_inventory_profile'
     );

    DELETE FROM control.entity_lifecycle
     WHERE entity_name IN (
        'commodity_category_spend_profile',
        'commodity_category_sales_profile',
        'commodity_category_inventory_profile'
     );

    DELETE FROM control.entity
     WHERE entity_code IN (
        'commodity_category_spend_profile',
        'commodity_category_sales_profile',
        'commodity_category_inventory_profile'
     )
       AND tenant_id IS NULL;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, enum_domain_code, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, lookup_config, sort_order, created_by)
    SELECT ev.id, f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, 'standard', f.enum_domain_code, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.validation, f.reference_config, f.lookup_config, f.sort_order, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    CROSS JOIN (VALUES
        ('parent_id',        'parent_id',        'Parent',      'uuid',    'reference', 'zero_or_one', NULL::text, false, true,  false, false, '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, NULL::jsonb, 110),
        ('root_category_id', 'root_category_id', 'Root',        'uuid',    'reference', 'one',         NULL::text, true,  true,  false, false, '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, NULL::jsonb, 120),
        ('level_no',        'level_no',         'Level',       'integer', 'number',    'zero_or_one', NULL::text, false, true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 130),
        ('sort_order',      'sort_order',       'Sort Order',  'integer', 'number',    'one',         NULL::text, false, false, true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 140),
        ('is_buy_allowed',  'buy_allowed',      'Buy Allowed', 'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 150),
        ('is_sell_allowed', 'sell_allowed',     'Sell Allowed','boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 160),
        ('is_inventory_allowed','inventory_allowed','Inventory Allowed','boolean','checkbox','one',   NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 170),
        ('is_classification_required','is_classification_required','Classification Required','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,180),
        ('is_hs_required',  'is_hs_required',   'HS Required', 'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 190),
        ('is_regulated',    'is_regulated',     'Regulated',   'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 200),
        ('allowed_classification_domains','allowed_classification_domains','Allowed Classification Domains','jsonb','json','one',NULL::text,true,false,false,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,210),
        ('uom_code',        'uom_code',         'UOM',         'string',  'text',      'zero_or_one', NULL::text, false, true,  false, true,  NULL::jsonb, NULL::jsonb, NULL::jsonb, 220),
        ('sales_revenue_recognition_method','sales_revenue_recognition_method','Revenue Recognition','string','text','one',NULL::text,true,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,230),
        ('sales_variable_consideration','sales_variable_consideration','Variable Consideration','string','text','zero_or_one',NULL::text,false,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,240),
        ('sales_standalone_selling_price_method','sales_standalone_selling_price_method','Standalone Selling Price','string','text','zero_or_one',NULL::text,false,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,250),
        ('is_stockable',    'is_stockable',     'Stockable',   'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 260),
        ('is_consumable',   'is_consumable',    'Consumable',  'boolean', 'checkbox',  'one',         NULL::text, true,  true,  true,  false, NULL::jsonb, NULL::jsonb, NULL::jsonb, 270),
        ('default_valuation_method','default_valuation_method','Valuation Method','enum','select','zero_or_one','master.valuation_method',false,true,true,true,NULL::jsonb,NULL::jsonb,NULL::jsonb,280),
        ('is_lot_tracking_allowed','is_lot_tracking_allowed','Lot Tracking Allowed','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,290),
        ('is_lot_tracking_required','is_lot_tracking_required','Lot Tracking Required','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,300),
        ('is_serial_tracking_allowed','is_serial_tracking_allowed','Serial Tracking Allowed','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,310),
        ('is_serial_tracking_required','is_serial_tracking_required','Serial Tracking Required','boolean','checkbox','one',NULL::text,true,true,true,false,NULL::jsonb,NULL::jsonb,NULL::jsonb,320)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, enum_domain_code, is_required,
           is_filterable, is_sortable, is_searchable, validation, reference_config, lookup_config, sort_order)
    WHERE e.entity_code = 'commodity_category'
      AND e.tenant_id IS NULL
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('code','name','is_buy_allowed','is_sell_allowed','is_inventory_allowed','is_regulated','status'),
               'search_fields',      jsonb_build_array('code','name','description'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['code']::text[]), true),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category'
       AND tenant_id IS NULL;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, sort_order, created_by)
    SELECT ev.id, 'commodity_category_id', 'commodity_category_id', 'Commodity Category',
           'uuid', 'reference', 'zero_or_one', 'standard', false, true, false, false,
           '{"ref_entity":"commodity_category"}'::jsonb,
           '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,
           115, v_su
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.entity_code IN ('product', 'item')
      AND e.tenant_id IS NULL
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || jsonb_build_object(
               'requires_owner_type_scope', true,
               'owner_type_column', 'owner_type',
               'default_owner_type_scope', 'commodity_category'
           ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_classification'
       AND tenant_id IS NULL;

    UPDATE control.entity_field ef
       SET label            = 'Commodity Category',
           data_type        = 'uuid',
           ui_type          = 'reference',
           validation       = '{"ref_entity":"commodity_category"}'::jsonb,
           reference_config = '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,
           updated_at       = now(),
           updated_by       = v_su
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.entity_code = 'commodity_classification'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'owner_id';

    RAISE NOTICE '035_version_fields/024_fields_commodity_category: done';
END $$;
