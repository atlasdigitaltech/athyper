-- 035_version_fields/004_fields_doc_template.sql
-- Version-bound entity_field rows for Document/Template entities (41–48)
-- Entities: document, brand_profile, letterhead, template, template_binding,
--           entity_document_link, lifecycle_instance, print_profile
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── document ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'document' AND ev.version_no = 1;

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
            (v_ev,'tags','tags','Tags','string','text','one','standard',false,false,false,true,110,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── brand_profile ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'brand_profile' AND ev.version_no = 1;

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
            (v_ev,'direction',       'direction',       'Direction',        'enum',   'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'default_locale',  'default_locale',  'Default Locale',   'string', 'text',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'is_default',      'is_default',      'Default',          'boolean','hidden','one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── letterhead ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'letterhead' AND ev.version_no = 1;

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
            (v_ev,'company_code_id',   'company_code_id',   'Company Code',    'uuid',   'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'watermark_text',    'watermark_text',    'Watermark',       'string', 'text',     'one','standard',false,false, false, true, 120,v_su),
            (v_ev,'is_default',        'is_default',        'Default',         'boolean','hidden',   'one','standard',false,true,  false, false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── template ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'template' AND ev.version_no = 1;

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
            (v_ev,'kind',               'kind',               'Template Kind',     'enum',   'select',   'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'engine',             'engine',             'Engine',            'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'current_version_id', 'current_version_id', 'Current Version',   'uuid',   'reference','one','system',  false,true,  false, false,130,v_su),
            (v_ev,'is_rtl_supported',   'is_rtl_supported',   'RTL Support',       'boolean','hidden',   'one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── template_binding ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'template_binding' AND ev.version_no = 1;

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
            (v_ev,'template_id', 'template_id', 'Template',   'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'entity_name', 'entity_name', 'Entity',     'string', 'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'operation',   'operation',   'Operation',  'string', 'text',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'variant',     'variant',     'Variant',    'string', 'text',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'priority',    'priority',    'Priority',   'integer','number',   'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── entity_document_link ──────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'entity_document_link' AND ev.version_no = 1;

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
            (v_ev,'entity_type', 'entity_type', 'Entity Type', 'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',   'entity_id',   'Entity',      'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'document_id', 'document_id', 'Document',    'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'link_type',   'link_type',   'Link Type',   'enum',  'select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── lifecycle_instance ────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'lifecycle_instance' AND ev.version_no = 1;

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
            (v_ev,'entity_name', 'entity_name', 'Entity Name', 'string','text',     'one','system',true, true,  true,  false,110,v_su),
            (v_ev,'entity_ref',  'entity_id',   'Entity ID',   'string','text',     'one','system',true, true,  false, true, 120,v_su),
            (v_ev,'lifecycle_id','lifecycle_id','Lifecycle',   'uuid',  'reference','one','system',true, true,  false, false,130,v_su),
            (v_ev,'state_id',    'state_id',    'State',       'uuid',  'reference','one','system',true, true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── print_profile ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'print_profile' AND ev.version_no = 1;

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
            (v_ev,'paper_size',    'paper_size',    'Paper Size',    'enum',   'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'orientation',   'orientation',   'Orientation',   'enum',   'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'color_mode',    'color_mode',    'Color Mode',    'enum',   'select','one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'output_format', 'output_format', 'Output Format', 'enum',   'select','one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'quality_dpi',   'quality_dpi',   'DPI',           'integer','number','one','standard',false,false, true,  false,150,v_su),
            (v_ev,'is_default',    'is_default',    'Default',       'boolean','hidden','one','standard',false,true,  false, false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/004_fields_doc_template: done';
END $$;
