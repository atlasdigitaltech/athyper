-- 035_version_fields/012_fields_budget.sql
-- Version-bound entity_field rows for Budget/Planning entities (84–86)
-- Entities: budget_profile, budget_allocation, planning_model
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── budget_profile ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'budget_profile' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',     'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'fund_type',           'fund_type',           'Fund Type',        'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'fund_source',         'fund_source',         'Fund Source',      'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',         'string',  'text',     'one','standard',true, true,  false, false,140,v_su),
            (v_ev,'total_amount',        'total_amount',        'Total Amount',     'money',   'money',    'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'reserved_amount',     'reserved_amount',     'Reserved',         'money',   'money',    'one','system',  false,true,  true,  false,160,v_su),
            (v_ev,'consumed_amount',     'consumed_amount',     'Consumed',         'money',   'money',    'one','system',  false,true,  true,  false,170,v_su),
            (v_ev,'available_amount',    'available_amount',    'Available',        'money',   'money',    'one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'fiscal_year',         'fiscal_year',         'Fiscal Year',      'integer', 'number',   'one','standard',true, true,  true,  false,190,v_su),
            (v_ev,'is_multi_year',       'is_multi_year',       'Multi-Year',       'boolean', 'hidden',   'one','standard',false,true,  false, false,200,v_su),
            (v_ev,'multi_year_strategy', 'multi_year_strategy', 'Multi-Yr Strategy','enum',    'select',   'one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'overspend_policy',    'overspend_policy',    'Overspend Policy', 'enum',    'select',   'one','standard',true, true,  true,  false,220,v_su),
            (v_ev,'is_replenishable',    'is_replenishable',    'Replenishable',    'boolean', 'hidden',   'one','standard',false,true,  false, false,230,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',          'uuid',    'reference','one','standard',false,true,  false, false,240,v_su),
            (v_ev,'parent_profile_id',   'parent_profile_id',   'Parent Profile',   'uuid',    'reference','one','standard',false,true,  false, false,250,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',       'integer', 'number',   'one','standard',false,false, true,  false,260,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── budget_allocation ─────────────────────────────────────────────────────
    -- DOCUMENT class: code/name not bulk-inserted by 000_common_fields; add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'budget_allocation' AND ev.version_no = 1;

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
            (v_ev,'code',                'code',                'Code',             'string',  'text',     'one','standard',true, true,  true,  true, 100,v_su),
            (v_ev,'name',                'name',                'Name',             'string',  'text',     'one','standard',true, false, true,  true, 105,v_su),
            (v_ev,'budget_profile_id',   'budget_profile_id',   'Budget Profile',   'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',     'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'fiscal_year',         'fiscal_year',         'Fiscal Year',      'integer', 'number',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',         'string',  'text',     'one','standard',true, true,  false, false,140,v_su),
            (v_ev,'cost_center_id',      'cost_center_id',      'Cost Center',      'uuid',    'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'project_id',          'project_id',          'Project',          'uuid',    'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'gl_account_id',       'gl_account_id',       'GL Account',       'uuid',    'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'allocated_amount',    'allocated_amount',    'Allocated',        'money',   'money',    'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'reserved_amount',     'reserved_amount',     'Reserved',         'money',   'money',    'one','system',  false,true,  true,  false,190,v_su),
            (v_ev,'consumed_amount',     'consumed_amount',     'Consumed',         'money',   'money',    'one','system',  false,true,  true,  false,200,v_su),
            (v_ev,'available_amount',    'available_amount',    'Available',        'money',   'money',    'one','system',  false,true,  true,  false,210,v_su),
            (v_ev,'overspend_policy',    'overspend_policy',    'Overspend Policy', 'enum',    'select',   'one','standard',true, true,  true,  false,220,v_su),
            (v_ev,'is_carry_forward',    'is_carry_forward',    'Carry Forward',    'boolean', 'hidden',   'one','standard',false,true,  false, false,230,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',          'uuid',    'reference','one','standard',false,true,  false, false,240,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',       'integer', 'number',   'one','standard',false,false, true,  false,250,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── planning_model ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'planning_model' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',      'company_code_id',      'Company Code',    'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'model_type',           'model_type',           'Model Type',      'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'planning_horizon',     'planning_horizon',     'Horizon',         'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'granularity',          'granularity',          'Granularity',     'enum',    'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'base_currency_code',   'base_currency_code',   'Base Currency',   'string',  'text',     'one','standard',true, true,  false, false,150,v_su),
            (v_ev,'fiscal_year_from',     'fiscal_year_from',     'Fiscal Year From','integer', 'number',   'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'fiscal_year_to',       'fiscal_year_to',       'Fiscal Year To',  'integer', 'number',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'version',              'version',              'Version',         'integer', 'number',   'one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'is_current',           'is_current',           'Current',         'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su),
            (v_ev,'based_on_model_id',    'based_on_model_id',    'Based On',        'uuid',    'reference','one','standard',false,true,  false, false,200,v_su),
            (v_ev,'responsible_person_id','responsible_person_id','Owner',           'uuid',    'reference','one','standard',false,true,  false, false,210,v_su),
            (v_ev,'sort_order',           'sort_order',           'Sort Order',      'integer', 'number',   'one','standard',false,false, true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/012_fields_budget: done';
END $$;
