-- 035_version_fields/005_fields_finance_org.sql
-- Version-bound entity_field rows for Finance Org entities (49–54)
-- Entities: legal_entity, company_code, business_unit, cost_center,
--           profit_center, warehouse
-- EXCLUDES common fields (id, tenant_id, code, name, description, status,
--           is_active, created_at, created_by, updated_at, updated_by)
--           — those are seeded in 000_common_fields.sql
-- Idempotent: ON CONFLICT DO NOTHING (ef_version_name_uidx)
-- Run AFTER: 000_common_fields.sql

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── legal_entity ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'legal_entity' AND ev.version_no = 1;

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
            (v_ev,'legal_name',        'legal_name',             'Legal Name',        'string','text',      'one','standard',true, true,  true,  true,  110,v_su),
            (v_ev,'registration_no',   'registration_no',        'Registration No.',  'string','text',      'one','standard',false,true,  false, true,  120,v_su),
            (v_ev,'tax_identifier',    'tax_registration_number','Tax ID',            'string','text',      'one','standard',false,true,  false, true,  130,v_su),
            (v_ev,'country_code',      'country_code',           'Country',           'string','text',      'one','standard',true, true,  true,  false, 140,v_su),
            (v_ev,'entity_type',       'entity_type',            'Entity Type',       'enum',  'select',    'one','standard',true, true,  true,  false, 150,v_su),
            (v_ev,'incorporation_date','incorporation_date',      'Incorporated',      'date',  'date',      'one','standard',false,true,  true,  false, 160,v_su),
            (v_ev,'is_publicly_listed','is_publicly_listed',     'Publicly Listed',   'boolean','hidden',   'one','standard',false,true,  false, false, 170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code' AND ev.version_no = 1;

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
            (v_ev,'legal_entity_id',        'legal_entity_id',        'Legal Entity',      'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'local_currency_id',      'local_currency_id',      'Local Currency',    'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'accounting_currency_id', 'accounting_currency_id', 'Accounting Currency','uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'chart_of_account_id',    'chart_of_account_id',    'Chart of Accounts', 'uuid','reference','one','standard',true, true,  false, false,140,v_su),
            (v_ev,'fiscal_year_variant',    'fiscal_year_variant',    'Fiscal Year',       'string','text',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'company_code_type',      'company_code_type',      'Type',              'enum', 'select',  'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'timezone',               'timezone',               'Timezone',          'string','text',   'one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── business_unit ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'business_unit' AND ev.version_no = 1;

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
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',   'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'bu_type',         'bu_type',         'Unit Type',      'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'bu_head_id',      'bu_head_id',      'Head',           'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'parent_id',       'parent_id',       'Parent Unit',    'uuid','reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── cost_center ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'cost_center' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',  'company_code_id',     'Company Code',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'cost_center_type', 'cost_center_category','Type',          'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'manager_id',       'responsible_person_id','Manager',      'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'parent_id',        'parent_id',           'Parent',        'uuid','reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'business_unit_id', 'business_unit_id',    'Business Unit', 'uuid','reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── profit_center ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'profit_center' AND ev.version_no = 1;

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
            (v_ev,'company_code_id', 'company_code_id',     'Company Code', 'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'pc_type',         'profit_center_type',  'Type',         'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'manager_id',      'responsible_person_id','Manager',     'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'parent_id',       'parent_id',           'Parent',       'uuid','reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── warehouse ─────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'warehouse' AND ev.version_no = 1;

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
            (v_ev,'site_id',         'site_id',         'Site',           'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'warehouse_type',  'warehouse_type',  'Type',           'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'manager_id',      'manager_id',      'Manager',        'uuid','reference','one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/005_fields_finance_org: done';
END $$;
