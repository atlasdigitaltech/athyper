-- 035_version_fields/015_fields_products.sql
-- Version-bound entity_field rows for product, item, and commodity_classification.
-- Commodity category fields are owned by 024_fields_commodity_category.sql.
-- Idempotent: ON CONFLICT DO NOTHING plus targeted cleanup for retired names.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN
    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.name IN ('product', 'item')
      AND ef.name IN ('spend_category_id', 'item_category_id');

    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.name IN ('spend_category', 'company_code_spend_policy');

    -- product
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'product' AND ev.version_no = 1;

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
            (v_ev,'commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one','standard',false,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,110,v_su),
            (v_ev,'product_type','product_type','Product Type','enum','select','one','standard',true,true,true,false,NULL::jsonb,130,v_su),
            (v_ev,'unit_of_measure','unit_of_measure','UOM','string','text','one','standard',false,true,false,false,NULL::jsonb,140,v_su),
            (v_ev,'base_price','base_price','Base Price','money','money','one','standard',false,true,true,false,NULL::jsonb,150,v_su),
            (v_ev,'currency_code','currency_code','Currency','string','text','one','standard',false,true,false,false,NULL::jsonb,160,v_su),
            (v_ev,'is_taxable','is_taxable','Taxable','boolean','hidden','one','standard',false,true,false,false,NULL::jsonb,170,v_su)
        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- item
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'item' AND ev.version_no = 1;

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
            (v_ev,'code','code','Code','string','text','one','standard',true,true,true,true,NULL::jsonb,30,v_su),
            (v_ev,'name','name','Name','string','text','one','standard',true,true,true,true,NULL::jsonb,40,v_su),
            (v_ev,'description','description','Description','text','textarea','one','standard',false,false,false,true,NULL::jsonb,50,v_su),
            (v_ev,'company_code_id','company_code_id','Company Code','uuid','reference','one','standard',true,true,false,false,'{"ref_entity":"company_code"}'::jsonb,110,v_su),
            (v_ev,'product_id','product_id','Product','uuid','reference','one','standard',false,true,false,false,'{"ref_entity":"product"}'::jsonb,120,v_su),
            (v_ev,'commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one','standard',false,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,130,v_su),
            (v_ev,'valuation_method','valuation_method','Valuation Method','enum','select','one','standard',true,true,true,false,NULL::jsonb,150,v_su),
            (v_ev,'standard_cost','standard_cost','Standard Cost','money','money','one','standard',false,true,true,false,NULL::jsonb,160,v_su),
            (v_ev,'uom_code','uom_code','UOM','string','text','one','standard',true,true,false,false,NULL::jsonb,170,v_su),
            (v_ev,'has_lot_tracking','has_lot_tracking','Lot Tracking','boolean','hidden','one','standard',false,true,false,false,NULL::jsonb,180,v_su),
            (v_ev,'has_serial_tracking','has_serial_tracking','Serial Tracking','boolean','hidden','one','standard',false,true,false,false,NULL::jsonb,190,v_su)
        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- commodity_classification
    SELECT ev.id INTO v_ev
    FROM control.entity_version ev
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
            (v_ev,'owner_type','owner_type','Owner Type','string','text','one','standard',true,true,true,false,110,v_su),
            (v_ev,'owner_id','owner_id','Owner','uuid','reference','one','standard',true,true,false,false,120,v_su),
            (v_ev,'classification_type','classification_type','Classification','enum','select','one','standard',true,true,true,false,130,v_su),
            (v_ev,'domain_code','domain_code','Domain','string','text','one','standard',true,true,true,false,140,v_su),
            (v_ev,'mapping_type','mapping_type','Mapping Type','enum','select','one','standard',true,true,true,false,150,v_su),
            (v_ev,'is_primary','is_primary','Primary','boolean','hidden','one','standard',false,true,false,false,160,v_su)
        ) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
               cardinality, origin, is_required, is_filterable, is_sortable,
               is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    UPDATE control.entity_field ef
       SET validation = ref_fix.val
      FROM (VALUES
        ('product', 'commodity_category_id', '{"ref_entity":"commodity_category"}'::jsonb),
        ('item',    'company_code_id',       '{"ref_entity":"company_code"}'::jsonb),
        ('item',    'product_id',            '{"ref_entity":"product"}'::jsonb),
        ('item',    'commodity_category_id', '{"ref_entity":"commodity_category"}'::jsonb)
      ) AS ref_fix(entity_name, field_name, val),
      control.entity_version ev2,
      control.entity e2
     WHERE ef.name = ref_fix.field_name
       AND ev2.id = ef.entity_version_id
       AND e2.id = ev2.entity_id
       AND e2.name = ref_fix.entity_name
       AND (ef.validation IS NULL OR NOT (ef.validation ? 'ref_entity'));

    RAISE NOTICE '035_version_fields/015_fields_products: done';
END $$;
