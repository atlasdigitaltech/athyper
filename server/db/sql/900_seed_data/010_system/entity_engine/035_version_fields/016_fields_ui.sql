-- 035_version_fields/016_fields_ui.sql
-- Version-bound entity_field rows for UI/CMS entities (103–111)
-- Entities: principal_ui_profile, principal_ui_preference, saved_view, dashboard,
--           dashboard_widget, principal_notification_preference, content_item,
--           content_item_link, content_item_access_grant
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── principal_ui_profile ──────────────────────────────────────────────────
    -- CONTROL class: 1:1 with principal; no status/is_active columns
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_ui_profile' AND ev.version_no = 1;

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
            (v_ev,'principal_id',           'principal_id',           'Principal',         'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'locale_code',            'locale_code',            'Locale',            'string',  'text',     'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'language_code',          'language_code',          'Language',          'string',  'text',     'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'timezone_code',          'timezone_code',          'Timezone',          'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'appearance_mode',        'appearance_mode',        'Appearance',        'enum',    'select',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'density_code',           'density_code',           'Density',           'enum',    'select',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'home_workspace_code',    'home_workspace_code',    'Home Workspace',    'string',  'text',     'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'default_company_code_id','default_company_code_id','Default Company',   'uuid',    'reference','one','standard',false,true,  false, false,180,v_su),
            (v_ev,'default_dashboard_id',   'default_dashboard_id',   'Default Dashboard', 'uuid',    'reference','one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_ui_preference ───────────────────────────────────────────────
    -- CONTROL class: key-value extension table
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_ui_preference' AND ev.version_no = 1;

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
            (v_ev,'principal_id',    'principal_id',    'Principal',       'uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'preference_code', 'preference_code', 'Preference',      'string', 'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',    'surface_code',    'Surface',         'string', 'text',     'one','standard',false,true,  true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── saved_view ────────────────────────────────────────────────────────────
    -- CONTROL class: code/name not bulk-inserted — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'saved_view' AND ev.version_no = 1;

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
            (v_ev,'code',               'code',               'Code',           'string',  'text',     'one','standard',true, true,  true,  false,100,v_su),
            (v_ev,'name',               'name',               'Name',           'string',  'text',     'one','standard',true, false, true,  true, 105,v_su),
            (v_ev,'owner_principal_id', 'owner_principal_id', 'Owner',          'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'scope',              'scope',              'Scope',          'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',       'surface_code',       'Surface',        'string',  'text',     'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'entity_key',         'entity_key',         'Entity Key',     'string',  'text',     'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_pinned',          'is_pinned',          'Pinned',         'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_default',         'is_default',         'Default',        'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'version',            'version',            'Version',        'integer', 'number',   'one','system',  false,false, true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dashboard ─────────────────────────────────────────────────────────────
    -- MASTER class: code/name/description/status/is_active from 000_common_fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dashboard' AND ev.version_no = 1;

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
            (v_ev,'owner_principal_id','owner_principal_id','Owner',         'uuid',    'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'scope',            'scope',            'Scope',          'enum',    'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'surface_code',     'surface_code',     'Surface',        'string',  'text',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'is_default',       'is_default',       'Default',        'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_home',          'is_home',          'Home Dashboard', 'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── dashboard_widget ──────────────────────────────────────────────────────
    -- RELATION class: id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'dashboard_widget' AND ev.version_no = 1;

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
            (v_ev,'dashboard_id',    'dashboard_id',    'Dashboard',      'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'widget_code',     'widget_code',     'Widget Code',    'string',  'text',     'one','standard',true, true,  true,  true, 120,v_su),
            (v_ev,'widget_type_code','widget_type_code','Widget Type',    'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'title',           'title',           'Title',          'string',  'text',     'one','standard',false,false, false, true, 140,v_su),
            (v_ev,'x_pos',           'x_pos',           'X Position',     'integer', 'number',   'one','standard',true, false, true,  false,150,v_su),
            (v_ev,'y_pos',           'y_pos',           'Y Position',     'integer', 'number',   'one','standard',true, false, true,  false,160,v_su),
            (v_ev,'width_units',     'width_units',     'Width',          'integer', 'number',   'one','standard',true, false, true,  false,170,v_su),
            (v_ev,'height_units',    'height_units',    'Height',         'integer', 'number',   'one','standard',true, false, true,  false,180,v_su),
            (v_ev,'is_visible',      'is_visible',      'Visible',        'boolean', 'hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_notification_preference ─────────────────────────────────────
    -- CONTROL class
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_notification_preference' AND ev.version_no = 1;

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
            (v_ev,'principal_id',  'principal_id',  'Principal',     'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'event_code',    'event_code',    'Event',         'string',  'text',     'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'channel',       'channel',       'Channel',       'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_enabled',    'is_enabled',    'Enabled',       'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'frequency_code','frequency_code','Frequency',     'enum',    'select',   'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item ──────────────────────────────────────────────────────────
    -- MASTER class: uses 'title' (not 'name') and 'summary' (not 'description')
    -- NOTE: bulk pass inserts 'name'/'description'/'is_active' for MASTER —
    -- content_item uses 'title'/'summary' and has no is_active column (harmless metadata rows)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item' AND ev.version_no = 1;

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
            (v_ev,'title',              'title',              'Title',          'string', 'text',     'one','standard',true, false, true,  true, 110,v_su),
            (v_ev,'kind',               'kind',               'Kind',           'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'parent_id',          'parent_id',          'Parent',         'uuid',   'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'locale_code',        'locale_code',        'Locale',         'string', 'text',     'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'slug',               'slug',               'Slug',           'string', 'text',     'one','standard',true, false, true,  true, 150,v_su),
            (v_ev,'summary',            'summary',            'Summary',        'text',   'textarea', 'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'current_version_id', 'current_version_id', 'Current Version','uuid',   'reference','one','system',  false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item_link ─────────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item_link' AND ev.version_no = 1;

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
            (v_ev,'source_content_item_id','source_content_item_id','Source',        'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'target_content_item_id','target_content_item_id','Target',        'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'relation_type',         'relation_type',         'Relation Type', 'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'display_order',         'display_order',         'Order',         'integer', 'number',   'one','standard',false,false, true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── content_item_access_grant ─────────────────────────────────────────────
    -- CONTROL class: no updated_at/updated_by columns in DDL (harmless if bulk inserts them)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'content_item_access_grant' AND ev.version_no = 1;

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
            (v_ev,'content_item_id','content_item_id','Content Item',   'uuid',      'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'subject_type',   'subject_type',   'Subject Type',   'enum',      'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subject_id',     'subject_id',     'Subject',        'uuid',      'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'access_level',   'access_level',   'Access Level',   'enum',      'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'expires_at',     'expires_at',     'Expires At',     'timestamp', 'datetime', 'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/016_fields_ui: done';
END $$;
