-- 035_version_fields/002_fields_notifications.sql
-- Version-bound entity_field rows for Notification/Tenant-Config entities (27–29)
-- Entities: notification, notification_default (partition), tenant_profile
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── notification ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'notification' AND ev.version_no = 1;

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
            (v_ev,'recipient_id',  'recipient_id',  'Recipient',   'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'sender_id',     'sender_id',     'Sender',      'uuid',     'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'channel',       'channel',       'Channel',     'enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'category',      'category',      'Category',    'enum',     'select',   'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'priority',      'priority',      'Priority',    'enum',     'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'title',         'title',         'Title',       'string',   'text',     'one','standard',true, false, false, true, 160,v_su),
            (v_ev,'body',          'body',          'Body',        'text',     'textarea', 'one','standard',false,false, false, true, 170,v_su),
            (v_ev,'entity_type',   'entity_type',   'Entity Type', 'string',   'text',     'one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'entity_id',     'entity_id',     'Entity',      'uuid',     'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'is_read',       'is_read',       'Read',        'boolean',  'hidden',   'one','standard',false,true,  false, false,200,v_su),
            (v_ev,'is_dismissed',  'is_dismissed',  'Dismissed',   'boolean',  'hidden',   'one','standard',false,true,  false, false,210,v_su),
            (v_ev,'expires_at',    'expires_at',    'Expires At',  'timestamp','datetime', 'one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_profile ────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_profile' AND ev.version_no = 1;

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
            (v_ev,'country_code',            'country_code',            'Country',            'string', 'text',  'one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'currency_code',           'currency_code',           'Currency',           'string', 'text',  'one','standard',false,true,  true,  false,120,v_su),
            (v_ev,'locale_code',             'locale_code',             'Locale',             'string', 'text',  'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'timezone_code',           'timezone_code',           'Timezone',           'string', 'text',  'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'fiscal_year_start_month', 'fiscal_year_start_month', 'Fiscal Year Start',  'integer','number','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'language_code',           'language_code',           'Language',           'string', 'text',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'reporting_currency_code', 'reporting_currency_code', 'Reporting Currency', 'string', 'text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'default_brand_profile_id','default_brand_profile_id','Default Brand',      'uuid',   'reference','one','standard',false,true,false,false,180,v_su),
            (v_ev,'default_letterhead_id',   'default_letterhead_id',   'Default Letterhead', 'uuid',   'reference','one','standard',false,true,false,false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/002_fields_notifications: done';
END $$;
