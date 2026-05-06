-- 035_version_fields/006_fields_coa_gl.sql
-- Version-bound entity_field rows for COA/GL entities (55–60)
-- Entities: chart_of_account, gl_account_type, gl_account,
--           gl_account_hierarchy, company_code_gl_config, company_code_book_assignment
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── chart_of_account ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'chart_of_account' AND ev.version_no = 1;

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
            (v_ev,'coa_type',            'framework',           'COA Type',          'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'base_currency_id',    'base_currency_id',    'Base Currency',     'uuid',   'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'account_level_count', 'account_level_count', 'Hierarchy Levels',  'integer','number', 'one','standard',false,false, false, false,130,v_su),
            (v_ev,'is_default',          'is_default',          'Default COA',       'boolean','hidden', 'one','standard',true, true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account_type ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account_type' AND ev.version_no = 1;

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
            (v_ev,'account_class',    'account_class',    'Account Class',    'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'normal_balance',   'normal_balance',   'Normal Balance',   'enum',   'select', 'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'is_balance_sheet', 'is_balance_sheet', 'Balance Sheet',    'boolean','hidden', 'one','standard',true, true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account' AND ev.version_no = 1;

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
            (v_ev,'chart_of_account_id','chart_of_account_id','Chart of Accounts','uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'account_type_id',    'account_type_id',    'Account Type',     'uuid','reference','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent Account',   'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'account_nature',     'account_class',      'Nature',           'enum','select',  'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'normal_balance',     'normal_balance',     'Normal Balance',   'enum','select',  'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'currency_id',        'currency_code',      'Currency',         'uuid','reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_reconciling',     'is_reconciling',     'Reconciling',      'boolean','hidden','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'is_blocked',         'is_blocked',         'Blocked',          'boolean','hidden','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'posting_level',      'posting_level',      'Posting Level',    'enum','select',  'one','standard',true, true,  true,  false,190,v_su),
            (v_ev,'account_level',      'level_no',           'Level',            'integer','number','one','standard',false,true,  true,  false,200,v_su),
            (v_ev,'account_path',       'path',               'Account Path',     'string','text',  'one','system',  false,false, false, true, 210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── gl_account_hierarchy ──────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'gl_account_hierarchy' AND ev.version_no = 1;

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
            (v_ev,'root_account_id', 'root_account_id', 'Root Account',  'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid','reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'level',           'level',           'Level',         'integer','number','one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'path',            'path',            'Path',          'string','text',   'one','system',  false,false, false, true, 140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ledger_book
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'ledger_book' AND ev.version_no = 1;

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
            (v_ev,'code',                 'code',                 'Book Code',         'string', 'text',    'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'name',                 'name',                 'Name',              'string', 'text',    'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'category',             'category',             'Category',          'string', 'select',  'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'base_currency_code',   'base_currency_code',   'Base Currency',     'string', 'currency','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'is_primary',           'is_primary',           'Primary',           'boolean','checkbox','one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'is_manual_je_allowed', 'is_manual_je_allowed', 'Manual JE Allowed', 'boolean','checkbox','one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'status',               'status',               'Status',            'string', 'status',  'one','system',  true, true,  true,  false,170,v_su),
            (v_ev,'sort_order',           'sort_order',           'Sort Order',        'integer','number',  'one','standard',false,false, true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_gl_config' AND ev.version_no = 1;

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
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid',  'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'config_key',      'config_key',      'Config Key',   'string','text',     'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'config_value',    'config_value',    'Config Value', 'json',  'json-editor','one','standard',true,false, false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_book_assignment ──────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_book_assignment' AND ev.version_no = 1;

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
            (v_ev,'company_code_id', 'company_code_id', 'Company Code', 'uuid',  'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'book_id',         'book_id',         'Ledger Book',  'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'priority',        'priority',        'Priority',     'integer','number',  'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'status',          'status',          'Status',       'string','status',   'one','system',  true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;

        DELETE FROM control.entity_field
        WHERE entity_version_id = v_ev
          AND name IN ('book_code','is_leading');
    END IF;

    RAISE NOTICE '035_version_fields/006_fields_coa_gl: done';
END $$;
