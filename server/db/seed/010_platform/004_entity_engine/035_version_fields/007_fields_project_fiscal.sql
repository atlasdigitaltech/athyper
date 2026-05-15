-- 035_version_fields/007_fields_project_fiscal.sql
-- Version-bound entity_field rows for Project/Fiscal entities (61–64)
-- Entities: project, project_item, dimension_set, fiscal_period
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── project ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'project' AND ev.version_no = 1;

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
            (v_ev,'project_type',      'project_type',        'Project Type',   'enum',   'select',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'company_code_id',   'company_code_id',     'Company Code',   'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'start_date',        'planned_start',       'Start Date',     'date',   'date',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'end_date',          'planned_end',         'End Date',       'date',   'date',     'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'budget_amount',     'planned_cost',        'Budget',         'money',  'money',    'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'currency_id',       'currency_code',       'Currency',       'uuid',   'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'project_manager_id','responsible_person_id','Project Manager','uuid',  'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'parent_project_id', 'parent_project_id',  'Parent Project', 'uuid',   'reference','one','standard',false,true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── project_item ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'project_item' AND ev.version_no = 1;

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
            (v_ev,'project_id',      'project_id',    'Project',       'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'item_type',       'item_type',     'Item Type',     'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'planned_amount',  'planned_cost',  'Planned',       'money',  'money',    'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'currency_id',     'currency_code', 'Currency',      'uuid',   'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_set ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_set' AND ev.version_no = 1;

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
            (v_ev,'dimension_count', 'dimension_count', 'Dimensions', 'integer','number', 'one','system',false,false, false, false,110,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── fiscal_period ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'fiscal_period' AND ev.version_no = 1;

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
            (v_ev,'period_no',       'period_number',   'Period No.',    'integer','number',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'period_type',     'period_type',     'Period Type',   'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'fiscal_year',     'fiscal_year',     'Fiscal Year',   'integer','number',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'start_date',      'start_date',      'Start Date',    'date',   'date',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'end_date',        'end_date',        'End Date',      'date',   'date',     'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid',   'reference','one','standard',true, true,  false, false,160,v_su),
            (v_ev,'posting_status',  'status',          'Posting Status','enum',   'status',   'one','system',  true, true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/007_fields_project_fiscal: done';
END $$;
