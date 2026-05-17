-- 035_version_fields/010_fields_dimensions.sql
-- Version-bound entity_field rows for Dimension/Intent entities (75–80)
-- Entities: dimension_type, dimension_value, dimension_set_item,
--           business_intent, company_code_intent_policy, company_code_dimension_default
-- Idempotent: ON CONFLICT DO NOTHING + UPDATE patch for existing rows

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    DELETE FROM control.entity_field ef
    USING control.entity_version ev, control.entity e
    WHERE ef.entity_version_id = ev.id
      AND ev.entity_id = e.id
      AND e.name = 'business_intent'
      AND ef.name IN (
          'default_gl_account_id',
          'default_tax_group_id',
          'is_approval_required',
          'max_auto_approve_amount',
          'max_auto_approve_currency',
          'default_tax_code',
          'default_asset_profile_code',
          'commodity_domain_affinities'
      );

    -- ── dimension_type ────────────────────────────────────────────────────────
    -- No reference fields; validation column omitted.
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_type' AND ev.version_no = 1;

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
            (v_ev,'category',              'category',              'Category',          'enum',    'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_hierarchical',       'is_hierarchical',       'Hierarchical',      'boolean', 'hidden', 'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'max_depth',             'max_depth',             'Max Depth',         'integer', 'number', 'one','standard',false,false, true,  false,130,v_su),
            (v_ev,'is_balanced',           'is_balanced',           'Balanced',          'boolean', 'hidden', 'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_multi_allowed',      'is_multi_allowed',      'Multi-Value',       'boolean', 'hidden', 'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_company_scoped_allowed','is_company_scoped_allowed','Company Scoped','boolean','hidden', 'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'source_entity_name',    'source_entity_name',    'Source Entity',     'string',  'text',   'one','system',  false,true,  false, false,170,v_su),
            (v_ev,'icon',                  'icon',                  'Icon',              'string',  'text',   'one','standard',false,false, false, false,180,v_su),
            (v_ev,'sort_order',            'sort_order',            'Sort Order',        'integer', 'number', 'one','standard',false,false, true,  false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_value ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_value' AND ev.version_no = 1;

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
            (v_ev,'dimension_type_id',   'dimension_type_id',   'Dimension Type',    'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_type"}'::jsonb,  110,v_su),
            (v_ev,'company_code_id',     'company_code_id',     'Company Code',      'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"company_code"}'::jsonb,    120,v_su),
            (v_ev,'parent_id',           'parent_id',           'Parent',            'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"dimension_value"}'::jsonb, 130,v_su),
            (v_ev,'level_no',            'level_no',            'Level',             'integer', 'number',   'one','system',  false,true,  true,  false,NULL::jsonb,                               140,v_su),
            (v_ev,'path_key',            'path_key',            'Path',              'string',  'text',     'one','system',  false,false, true,  false,NULL::jsonb,                               150,v_su),
            (v_ev,'effective_from',      'effective_from',      'Effective From',    'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,                               160,v_su),
            (v_ev,'effective_to',        'effective_to',        'Effective To',      'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,                               170,v_su),
            (v_ev,'is_posting_allowed',  'is_posting_allowed',  'Posting Allowed',   'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               180,v_su),
            (v_ev,'is_budgeting_allowed','is_budgeting_allowed','Budgeting Allowed', 'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               190,v_su),
            (v_ev,'is_planning_allowed', 'is_planning_allowed', 'Planning Allowed',  'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               200,v_su),
            (v_ev,'sort_order',          'sort_order',          'Sort Order',        'integer', 'number',   'one','standard',false,false, true,  false,NULL::jsonb,                               210,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dimension_set_item ────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dimension_set_item' AND ev.version_no = 1;

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
            (v_ev,'dimension_set_id',   'dimension_set_id',   'Dimension Set',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_set"}'::jsonb,   110,v_su),
            (v_ev,'dimension_type_id',  'dimension_type_id',  'Dimension Type', 'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_type"}'::jsonb,  120,v_su),
            (v_ev,'dimension_value_id', 'dimension_value_id', 'Value',          'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_value"}'::jsonb, 130,v_su),
            (v_ev,'ordinal',            'ordinal',            'Order',          'integer', 'number',   'one','standard',true, false, true,  false,NULL::jsonb,                               140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── business_intent ───────────────────────────────────────────────────────
    -- CONTROL class: 000_common_fields inserts description/status/is_active but NOT code/name
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'business_intent' AND ev.version_no = 1;

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
            (v_ev,'code',                   'code',                   'Code',               'string', 'text',     'one','standard',true, true,  true,  true, NULL::jsonb,                                  100,v_su),
            (v_ev,'name',                   'name',                   'Name',               'string', 'text',     'one','standard',true, false, true,  true, NULL::jsonb,                                  105,v_su),
            (v_ev,'domain',                 'domain',                 'Domain',             'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,                                  110,v_su),
            (v_ev,'subtype',                'subtype',                'Subtype',            'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,                                  120,v_su),
            (v_ev,'parent_id',              'parent_id',              'Parent Intent',      'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"business_intent"}'::jsonb,    130,v_su),
            (v_ev,'visibility',             'visibility',             'Visibility',         'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,                                  180,v_su),
            (v_ev,'sort_order',             'sort_order',             'Sort Order',         'integer','number',   'one','standard',false,false, true,  false,NULL::jsonb,                                  190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_intent_policy ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_intent_policy' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',        'company_code_id',        'Company Code',     'uuid',  'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,    110,v_su),
            (v_ev,'intent_id',              'intent_id',              'Intent',           'uuid',  'reference','one','standard',true, true,  false, false,'{"ref_entity":"business_intent"}'::jsonb, 120,v_su),
            (v_ev,'mapping_mode',           'mapping_mode',           'Mode',             'enum',  'select',   'one','standard',true, true,  true,  false,NULL::jsonb,                                130,v_su),
            (v_ev,'is_default',             'is_default',             'Default',          'boolean','hidden',  'one','standard',false,true,  false, false,NULL::jsonb,                                140,v_su),
            (v_ev,'override_gl_account_id', 'override_gl_account_id', 'Override GL Acct', 'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"gl_account"}'::jsonb,      150,v_su),
            (v_ev,'notes',                  'notes',                  'Notes',            'text',  'textarea', 'one','standard',false,false, false, true, NULL::jsonb,                                160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_dimension_default ────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_dimension_default' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',    'company_code_id',    'Company Code',   'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,    110,v_su),
            (v_ev,'dimension_type_id',  'dimension_type_id',  'Dimension Type', 'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_type"}'::jsonb,  120,v_su),
            (v_ev,'dimension_value_id', 'dimension_value_id', 'Default Value',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"dimension_value"}'::jsonb, 130,v_su),
            (v_ev,'is_mandatory',       'is_mandatory',       'Mandatory',      'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               140,v_su),
            (v_ev,'allow_override',     'allow_override',     'Allow Override', 'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,                               150,v_su),
            (v_ev,'effective_from',     'effective_from',     'Effective From', 'date',    'date',     'one','standard',true, true,  true,  false,NULL::jsonb,                               160,v_su),
            (v_ev,'effective_to',       'effective_to',       'Effective To',   'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,                               170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── Patch existing rows missing ref_entity (idempotent UPDATE) ────────────
    -- Covers rows already inserted before validation column was added to this file.
    UPDATE control.entity_field ef
       SET validation = ref_fix.val
      FROM (VALUES
        ('dimension_value',              'dimension_type_id',        '{"ref_entity":"dimension_type"}'::jsonb),
        ('dimension_value',              'company_code_id',          '{"ref_entity":"company_code"}'::jsonb),
        ('dimension_value',              'parent_id',                '{"ref_entity":"dimension_value"}'::jsonb),
        ('dimension_set_item',           'dimension_set_id',         '{"ref_entity":"dimension_set"}'::jsonb),
        ('dimension_set_item',           'dimension_type_id',        '{"ref_entity":"dimension_type"}'::jsonb),
        ('dimension_set_item',           'dimension_value_id',       '{"ref_entity":"dimension_value"}'::jsonb),
        ('business_intent',              'parent_id',                '{"ref_entity":"business_intent"}'::jsonb),
        ('company_code_intent_policy',   'company_code_id',          '{"ref_entity":"company_code"}'::jsonb),
        ('company_code_intent_policy',   'intent_id',                '{"ref_entity":"business_intent"}'::jsonb),
        ('company_code_intent_policy',   'override_gl_account_id',   '{"ref_entity":"gl_account"}'::jsonb),
        ('company_code_dimension_default','company_code_id',         '{"ref_entity":"company_code"}'::jsonb),
        ('company_code_dimension_default','dimension_type_id',       '{"ref_entity":"dimension_type"}'::jsonb),
        ('company_code_dimension_default','dimension_value_id',      '{"ref_entity":"dimension_value"}'::jsonb)
      ) AS ref_fix(entity_name, field_name, val),
      control.entity_version ev2,
      control.entity e2
     WHERE ef.name = ref_fix.field_name
       AND ev2.id = ef.entity_version_id
       AND e2.id = ev2.entity_id
       AND e2.name = ref_fix.entity_name
       AND (ef.validation IS NULL OR NOT (ef.validation ? 'ref_entity'));

    RAISE NOTICE '035_version_fields/010_fields_dimensions: done';
END $$;
