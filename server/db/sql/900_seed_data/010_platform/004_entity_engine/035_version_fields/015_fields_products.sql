-- 035_version_fields/015_fields_products.sql
-- Version-bound entity_field rows for Product/Procurement entities (97–102)
-- Entities: product, item, item_category, commodity_classification,
--           spend_category, company_code_spend_policy
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── product ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'product' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'category_id',       'category_id',       'Category',         'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'spend_category_id', 'spend_category_id', 'Spend Category',   'uuid',    'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'product_type',      'product_type',      'Product Type',     'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'unit_of_measure',   'unit_of_measure',   'UOM',              'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'base_price',        'base_price',        'Base Price',       'money',   'money',    'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',         'string',  'text',     'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_taxable',        'is_taxable',        'Taxable',          'boolean', 'hidden',   'one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── item ──────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'item' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',    'company_code_id',    'Company Code',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'product_id',         'product_id',         'Product',         'uuid',    'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'category_id',        'category_id',        'Category',        'uuid',    'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'spend_category_id',  'spend_category_id',  'Spend Category',  'uuid',    'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'valuation_method',   'valuation_method',   'Valuation Method','enum',    'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'standard_cost',      'standard_cost',      'Standard Cost',   'money',   'money',    'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'uom_code',           'uom_code',           'UOM',             'string',  'text',     'one','standard',true, true,  false, false,170,v_su),
            (v_ev,'has_lot_tracking',   'has_lot_tracking',   'Lot Tracking',    'boolean', 'hidden',   'one','standard',false,true,  false, false,180,v_su),
            (v_ev,'has_serial_tracking','has_serial_tracking','Serial Tracking', 'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── item_category ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'item_category' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'parent_id',           'parent_id',           'Parent Category',   'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'level_no',            'level_no',            'Level',             'integer', 'number',   'one','system',  false,true,  true,  false,120,v_su),
            (v_ev,'default_tax_group_id','default_tax_group_id','Default Tax Group', 'uuid',    'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',        'integer', 'number',   'one','standard',false,false, true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── commodity_classification ──────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'commodity_classification' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',          'owner_type',          'Owner Type',        'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',            'owner_id',            'Owner',             'uuid',    'reference','one','standard',true, true,false,false,120,v_su),
            (v_ev,'classification_type', 'classification_type', 'Classification',    'enum',    'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'domain_code',         'domain_code',         'Domain',            'string',  'text',  'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'mapping_type',        'mapping_type',        'Mapping Type',      'enum',    'select','one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_primary',          'is_primary',          'Primary',           'boolean', 'hidden','one','standard',false,true,  false, false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── spend_category ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'spend_category' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'parent_id',                  'parent_id',                  'Parent',                  'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'procurement_type',           'procurement_type',           'Procurement Type',        'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'visibility',                 'visibility',                 'Visibility',              'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_classification_required', 'is_classification_required', 'Classification Required', 'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_hs_required',             'is_hs_required',             'HS Code Required',        'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_regulated',               'is_regulated',               'Regulated',               'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'default_intent_id',          'default_intent_id',          'Default Intent',          'uuid',    'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'sort_order',                 'sort_order',                 'Sort Order',              'integer', 'number',   'one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_spend_policy ─────────────────────────────────────────────
    -- CONTROL class: description seeded by 000_common_fields (no actual column — harmless)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_spend_policy' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',    'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,110,v_su),
            (v_ev,'spend_category_id',   'spend_category_id',   'Spend Category',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"spend_category"}'::jsonb,120,v_su),
            (v_ev,'mapping_mode',        'mapping_mode',        'Mode',            'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'default_gl_account_id','default_gl_account_id','Default GL Acct','uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"gl_account"}'::jsonb,140,v_su),
            (v_ev,'default_tax_group_id','default_tax_group_id','Default Tax Grp', 'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_group"}'::jsonb,150,v_su),
            (v_ev,'default_intent_id',   'default_intent_id',   'Default Intent',  'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"business_intent"}'::jsonb,160,v_su),
            (v_ev,'asset_class_id',      'asset_class_id',      'Asset Class',     'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"asset_class"}'::jsonb,170,v_su),
            (v_ev,'capex_screening_threshold','capex_screening_threshold','CapEx Threshold','decimal','number','one','standard',false,true, true, false,'{"min":0}'::jsonb,180,v_su),
            (v_ev,'capex_screening_currency','capex_screening_currency','CapEx Currency','string','currency','one','standard',false,true, true, false,NULL::jsonb,190,v_su),
            (v_ev,'is_asset_tagging_required','is_asset_tagging_required','Asset Tagging Required','boolean','checkbox','one','standard',false,true,true,false,NULL::jsonb,200,v_su),
            (v_ev,'override_visibility', 'override_visibility', 'Override Visibility','enum','select',    'one','standard',false,true,  true,  false,NULL::jsonb,210,v_su),
            (v_ev,'override_is_classification_required','override_is_classification_required','Override Classification Required','boolean','checkbox','one','standard',false,true,true,false,NULL::jsonb,220,v_su),
            (v_ev,'override_is_hs_required','override_is_hs_required','Override HS Required','boolean','checkbox','one','standard',false,true,true,false,NULL::jsonb,230,v_su),
            (v_ev,'override_is_regulated','override_is_regulated','Override Regulated','boolean','checkbox','one','standard',false,true,true,false,NULL::jsonb,240,v_su),
            (v_ev,'is_default',          'is_default',          'Default',         'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,250,v_su),
            (v_ev,'priority',            'priority',            'Priority',        'integer', 'number',   'one','standard',false,false, true,  false,NULL::jsonb,260,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/015_fields_products: done';
END $$;
