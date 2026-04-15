-- 035_version_fields/011_fields_tax_fx.sql
-- Version-bound entity_field rows for Tax/FX entities (81–83)
-- Entities: tax_jurisdiction, tax_type, fx_rate
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── tax_jurisdiction ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tax_jurisdiction' AND ev.version_no = 1;

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
            (v_ev,'country_code',       'country_code',       'Country',          'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'state_region_code',  'state_region_code',  'State/Region',     'string',  'text',  'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'jurisdiction_type',  'jurisdiction_type',  'Type',             'enum',    'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent',           'uuid',    'reference','one','standard',false,true,false,false,140,v_su),
            (v_ev,'level_no',           'level_no',           'Level',            'integer', 'number','one','system',  false,true,  true,  false,150,v_su),
            (v_ev,'filing_frequency',   'filing_frequency',   'Filing Frequency', 'enum',    'select','one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'currency_code',      'currency_code',      'Currency',         'string',  'text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'sort_order',         'sort_order',         'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tax_type ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tax_type' AND ev.version_no = 1;

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
            (v_ev,'category',              'category',              'Category',         'enum',    'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_recoverable',        'is_recoverable',        'Recoverable',      'boolean', 'hidden','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'is_deducted_at_source', 'is_deducted_at_source', 'Deducted at Source','boolean','hidden','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'is_included_in_price',  'is_included_in_price',  'Included in Price','boolean', 'hidden','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_compound_eligible',  'is_compound_eligible',  'Compound Eligible','boolean', 'hidden','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'sort_order',            'sort_order',            'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── fx_rate ───────────────────────────────────────────────────────────────
    -- NOTE: fx_rate has no code/name columns; 000_common_fields bulk-inserts them
    -- for all MASTER entities (harmless — ON CONFLICT DO NOTHING guards inserts).
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'fx_rate' AND ev.version_no = 1;

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
            (v_ev,'from_currency',  'from_currency',  'From Currency', 'string',  'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'to_currency',    'to_currency',    'To Currency',   'string',  'text',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'rate',           'rate',           'Rate',          'decimal', 'number','one','standard',true, false, true,  false,130,v_su),
            (v_ev,'rate_type',      'rate_type',      'Rate Type',     'enum',    'select','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'effective_date', 'effective_date', 'Effective Date','date',    'date',  'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'source',         'source',         'Source',        'enum',    'select','one','standard',true, true,  true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/011_fields_tax_fx: done';
END $$;
