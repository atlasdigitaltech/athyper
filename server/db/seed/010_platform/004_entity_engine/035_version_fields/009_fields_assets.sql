-- 035_version_fields/009_fields_assets.sql
-- Version-bound entity_field rows for Asset entities (70–74)
-- Entities: asset_class, asset, asset_book, asset_component, asset_assignment_history
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── asset_class ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_class' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',  'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'parent_id',         'parent_id',         'Parent Class',  'uuid',   'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'asset_nature',      'asset_nature',      'Nature',        'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_depreciable',    'is_depreciable',    'Depreciable',   'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'capitalization_threshold','capitalization_threshold','Cap Threshold','money','money','one','standard',false,true,true,false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',      'string', 'text',     'one','standard',true, true,  false, false,160,v_su),
            (v_ev,'sort_order',        'sort_order',        'Sort Order',    'integer','number',   'one','standard',false,false, true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset ─────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'asset_class_id',    'asset_class_id',    'Asset Class',     'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'acquisition_date',  'acquisition_date',  'Acquisition Date','date',   'date',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'in_service_date',   'in_service_date',   'In Service Date', 'date',   'date',     'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'acquisition_cost',  'acquisition_cost',  'Acquisition Cost','money',  'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'currency_code',     'currency_code',     'Currency',        'string', 'text',     'one','standard',true, true,  false, false,160,v_su),
            (v_ev,'useful_life_months','useful_life_months','Useful Life (mo)','integer','number',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'cost_center_id',    'cost_center_id',    'Cost Center',     'uuid',   'reference','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'custodian_id',      'custodian_id',      'Custodian',       'uuid',   'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'barcode',           'barcode',           'Barcode',         'string', 'text',     'one','standard',false,true,  false, true, 200,v_su),
            (v_ev,'serial_number',     'serial_number',     'Serial No.',      'string', 'text',     'one','standard',false,true,  false, true, 210,v_su),
            (v_ev,'retirement_type',   'retirement_type',   'Retirement Type', 'enum',   'select',   'one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_book ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_book' AND ev.version_no = 1;

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
            (v_ev,'asset_id',              'asset_id',              'Asset',            'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'book_type',             'book_type',             'Book Type',        'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'depreciation_method',   'depreciation_method',   'Depr Method',      'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'useful_life_months',    'useful_life_months',    'Useful Life (mo)', 'integer','number',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'cost_basis',            'cost_basis',            'Cost Basis',       'money',  'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'accumulated_depreciation','accumulated_depreciation','Accum Depr',   'money',  'money',    'one','system',  false,true,  true,  false,160,v_su),
            (v_ev,'carrying_amount',       'carrying_amount',       'Carrying Amount',  'money',  'money',    'one','system',  false,true,  true,  false,170,v_su),
            (v_ev,'currency_code',         'currency_code',         'Currency',         'string', 'text',     'one','standard',true, true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_component ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_component' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'parent_asset_id',   'parent_asset_id',   'Parent Asset',    'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'component_asset_id','component_asset_id','Component Asset', 'uuid',   'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'component_type',    'component_type',    'Component Type',  'enum',   'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'pct_of_parent',     'pct_of_parent',     'Allocation %',    'decimal','number',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'allocated_cost',    'allocated_cost',    'Allocated Cost',  'money',  'money',    'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'useful_life_months','useful_life_months','Useful Life (mo)','integer','number',   'one','standard',true, true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── asset_assignment_history ──────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'asset_assignment_history' AND ev.version_no = 1;

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
            (v_ev,'asset_id',       'asset_id',       'Asset',          'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'assignment_type','assignment_type','Assignment Type','enum',     'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'to_value_id',    'to_value_id',    'To (New)',       'uuid',     'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'effective_from', 'effective_from', 'Effective From', 'date',     'date',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'effective_to',   'effective_to',   'Effective To',   'date',     'date',     'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'reason',         'reason',         'Reason',         'text',     'textarea', 'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'assigned_by',    'assigned_by',    'Assigned By',    'uuid',     'reference','one','standard',true, true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/009_fields_assets: done';
END $$;
