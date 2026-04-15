-- 035_version_fields/001_fields_identity.sql
-- Version-bound entity_field rows for IAM/Foundation entities (1–26)
-- Entities: tenant, principal, principal_profile, principal_identity_binding,
--           contact_link, contact_email, contact_phone, label, label_entity_type,
--           owner_type, address, address_link, tenant_module_subscription,
--           tenant_feature_entitlement, tenant_permission_override,
--           company_code_access, auth_group, auth_group_role, auth_group_member,
--           principal_persona, team, team_member, access_grant,
--           group_feature_grant, principal_feature_grant, delegation_grant
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── tenant ────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant' AND ev.version_no = 1;

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
            (v_ev,'display_name','display_name','Display Name','string','text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'realm_key',   'realm_key',   'Realm Key',  'string','text',     'one','system',  true, true,  true,  true, 120,v_su),
            (v_ev,'region',      'region',      'Region',     'string','text',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'subscription','subscription','Subscription','enum', 'select',   'one','standard',true, true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal ─────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal' AND ev.version_no = 1;

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
            (v_ev,'principal_type',     'principal_type',     'Type',           'enum',   'select', 'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'is_locked',          'is_locked',          'Locked',         'boolean','hidden', 'one','standard',false,true,  false, false,120,v_su),
            (v_ev,'is_service_account', 'is_service_account', 'Service Account','boolean','hidden', 'one','standard',false,true,  false, false,130,v_su),
            (v_ev,'login_email',        'login_email',        'Login Email',    'string', 'text',   'one','system',  false,true,  true,  true, 140,v_su),
            (v_ev,'external_ref',       'external_ref',       'External Ref',   'string', 'text',   'one','standard',false,true,  false, true, 150,v_su),
            (v_ev,'principal_source',   'principal_source',   'Source',         'enum',   'select', 'one','standard',false,true,  true,  false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_profile ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_profile' AND ev.version_no = 1;

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
            (v_ev,'principal_id',         'principal_id',         'Principal',       'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'given_name',           'given_name',           'First Name',      'string','text',  'one','standard',false,true,  true,  true, 120,v_su),
            (v_ev,'family_name',          'family_name',          'Last Name',       'string','text',  'one','standard',false,true,  true,  true, 130,v_su),
            (v_ev,'preferred_name',       'preferred_name',       'Preferred Name',  'string','text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'display_name',         'display_name',         'Display Name',    'string','text',  'one','system',  false,true,  true,  true, 150,v_su),
            (v_ev,'locale',               'locale',               'Locale',          'string','text',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'timezone',             'timezone',             'Timezone',        'string','text',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'keycloak_sync_status', 'keycloak_sync_status', 'Sync Status',     'enum', 'status','one','system',  false,true,  true,  false,180,v_su),
            (v_ev,'default_company_code_id','default_company_code_id','Default Company','uuid','reference','one','standard',false,true,false,false,190,v_su),
            (v_ev,'employee_id',          'employee_id',          'Employee',        'uuid','reference','one','standard',false,true,  false, false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_identity_binding ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_identity_binding' AND ev.version_no = 1;

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
            (v_ev,'principal_id',  'principal_id',  'Principal',     'uuid','reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'provider_code', 'provider_code', 'Provider',      'enum','select',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subject_ref',   'subject_id',    'Subject ID',    'string','text',  'one','system',  true, false, false, true, 130,v_su),
            (v_ev,'username',      'username',      'Username',      'string','text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'sync_status',   'sync_status',   'Sync Status',   'enum', 'status','one','system',  false,true,  true,  false,150,v_su),
            (v_ev,'synced_at',     'synced_at',     'Synced At',     'timestamp','datetime','one','system',false,true,true,false,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_link ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_link' AND ev.version_no = 1;

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
            (v_ev,'owner_type',  'owner_type',  'Owner Type',  'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',    'owner_id',    'Owner',       'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'channel_type','channel_type','Channel',     'enum',  'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'value',       'value',       'Value',       'string','text',     'one','standard',true, false, false, true, 140,v_su),
            (v_ev,'purpose',     'purpose',     'Purpose',     'enum',  'select',   'one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'is_primary',  'is_primary',  'Primary',     'boolean','hidden',  'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_verified', 'is_verified', 'Verified',    'boolean','hidden',  'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'verified_at', 'verified_at', 'Verified At', 'timestamp','datetime','one','system',false,true,true,false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_email ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_email' AND ev.version_no = 1;

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
            (v_ev,'contact_link_id','contact_link_id','Contact Link','uuid',    'reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'local_part',     'local_part',     'Local Part',  'string',  'text',     'one','system',  false,true,  true,  true, 120,v_su),
            (v_ev,'domain',         'domain',         'Domain',      'string',  'text',     'one','system',  false,true,  true,  true, 130,v_su),
            (v_ev,'is_disposable',  'is_disposable',  'Disposable',  'boolean', 'hidden',   'one','system',  false,true,  false, false,140,v_su),
            (v_ev,'bounce_count',   'bounce_count',   'Bounces',     'integer', 'number',   'one','system',  false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── contact_phone ─────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'contact_phone' AND ev.version_no = 1;

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
            (v_ev,'contact_link_id','contact_link_id','Contact Link',  'uuid',  'reference','one','system',  true, true,  false, false,110,v_su),
            (v_ev,'e164',           'e164',           'E.164 Number',  'string','text',     'one','system',  false,true,  true,  true, 120,v_su),
            (v_ev,'calling_code',   'calling_code',   'Calling Code',  'string','text',     'one','system',  false,true,  false, false,130,v_su),
            (v_ev,'national_number','national_number', 'National No.',  'string','text',     'one','system',  false,false, false, true, 140,v_su),
            (v_ev,'line_type',      'line_type',      'Line Type',     'enum',  'select',   'one','system',  false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── label ─────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'label' AND ev.version_no = 1;

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
            (v_ev,'entity',      'entity',      'Entity',      'string','text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'locale_code', 'locale_code', 'Locale',      'string','text',  'one','standard',true, true,  true,  false,120,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── owner_type ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'owner_type' AND ev.version_no = 1;

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
            (v_ev,'category',   'category',   'Category',    'enum',   'select','one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'sort_order', 'sort_order', 'Sort Order',  'integer','number','one','standard',false,false, true,  false,120,v_su),
            (v_ev,'schema_name','schema_name','Schema',      'string', 'text',  'one','system',  false,false, false, false,130,v_su),
            (v_ev,'table_name', 'table_name', 'Table',       'string', 'text',  'one','system',  false,false, false, false,140,v_su),
            (v_ev,'is_system',  'is_system',  'System',      'boolean','hidden','one','system',  false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── address ───────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'address' AND ev.version_no = 1;

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
            (v_ev,'address_type',      'address_type',      'Address Type',    'enum',   'select','one','standard',false,true,  true,  false,110,v_su),
            (v_ev,'line1',             'line1',             'Address Line 1',  'string', 'text',  'one','standard',false,false, false, true, 120,v_su),
            (v_ev,'line2',             'line2',             'Address Line 2',  'string', 'text',  'one','standard',false,false, false, false,130,v_su),
            (v_ev,'city',              'city',              'City',            'string', 'text',  'one','standard',false,true,  true,  true, 140,v_su),
            (v_ev,'region',            'region',            'Region/State',    'string', 'text',  'one','standard',false,true,  true,  true, 150,v_su),
            (v_ev,'postal_code',       'postal_code',       'Postal Code',     'string', 'text',  'one','standard',false,true,  true,  true, 160,v_su),
            (v_ev,'country_code',      'country_code',      'Country',         'string', 'text',  'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'formatted_address', 'formatted_address', 'Full Address',    'string', 'text',  'one','system',  false,false, false, true, 180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── address_link ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'address_link' AND ev.version_no = 1;

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
            (v_ev,'owner_type',     'owner_type',     'Owner Type',     'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',       'owner_id',       'Owner',          'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'address_id',     'address_id',     'Address',        'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'purpose',        'purpose',        'Purpose',        'enum',  'select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'is_primary',     'is_primary',     'Primary',        'boolean','hidden',  'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'effective_from', 'effective_from', 'Effective From', 'date',  'date',     'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'effective_until','effective_until','Effective Until','date',  'date',     'one','standard',false,true,  true,  false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_module_subscription ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_module_subscription' AND ev.version_no = 1;

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
            (v_ev,'module_id',    'module_id',    'Module',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'status',       'status',       'Status',       'enum',     'status',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'subscribed_at','subscribed_at','Subscribed At','timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'expires_at',   'expires_at',   'Expires At',   'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_feature_entitlement ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_feature_entitlement' AND ev.version_no = 1;

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
            (v_ev,'feature_id',    'feature_id',    'Feature',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'status',        'status',        'Status',       'enum',     'status',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'activated_at',  'activated_at',  'Activated At', 'timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'expires_at',    'expires_at',    'Expires At',   'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'activated_by',  'activated_by',  'Activated By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── tenant_permission_override ────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'tenant_permission_override' AND ev.version_no = 1;

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
            (v_ev,'permission_id','permission_id','Permission','uuid',   'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'is_granted',   'is_granted',   'Granted',  'boolean','hidden',   'one','standard',true, true,  false, false,120,v_su),
            (v_ev,'reason',       'reason',       'Reason',   'text',   'textarea', 'one','standard',false,false, false, true, 130,v_su),
            (v_ev,'expires_at',   'expires_at',   'Expires',  'timestamp','datetime','one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by',   'granted_by',   'Granted By','uuid',  'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_access ───────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_access' AND ev.version_no = 1;

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
            (v_ev,'entity_type',     'entity_type',     'Entity Type',    'string','text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'entity_id',       'entity_id',       'Entity',         'uuid',  'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',   'uuid',  'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'granted_by',      'granted_by',      'Granted By',     'uuid',  'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group' AND ev.version_no = 1;

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
            (v_ev,'is_system',               'is_system',               'System Group',     'boolean','hidden','one','system',  false,true,  false, false,110,v_su),
            (v_ev,'is_self_service_eligible','is_self_service_eligible','Self-Service',     'boolean','hidden','one','standard',false,true,  false, false,120,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group_role ───────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group_role' AND ev.version_no = 1;

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
            (v_ev,'group_id',              'group_id',              'Group',             'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'role_id',               'role_id',               'Role',              'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'visibility_scope',      'visibility_scope',      'Visibility Scope',  'enum','select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'assignment_scope_type', 'assignment_scope_type', 'Assignment Scope',  'enum','select',   'one','standard',true, true,  true,  false,140,v_su),
            (v_ev,'expires_at',            'expires_at',            'Expires At',        'timestamp','datetime','one','standard',false,true,true,false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── auth_group_member ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'auth_group_member' AND ev.version_no = 1;

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
            (v_ev,'principal_id','principal_id','User',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'group_id',    'group_id',    'Group',     'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'joined_at',   'joined_at',   'Joined At', 'timestamp','datetime', 'one','system',  false,true,  true,  false,130,v_su),
            (v_ev,'added_by',    'added_by',    'Added By',  'uuid',     'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_persona ─────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_persona' AND ev.version_no = 1;

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
            (v_ev,'principal_id','principal_id','User',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'persona_id',  'persona_id',  'Persona',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'assigned_by', 'assigned_by', 'Assigned By','uuid',     'reference','one','standard',false,true,  false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── team ──────────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'team' AND ev.version_no = 1;

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
            (v_ev,'leader_id',     'leader_id',     'Leader',         'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'team_type',     'team_type',     'Team Type',      'enum','select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'effective_from','effective_from','Effective From', 'date','date',     'one','standard',false,true,  true,  false,130,v_su),
            (v_ev,'effective_to',  'effective_to',  'Effective To',   'date','date',     'one','standard',false,true,  true,  false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── team_member ───────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'team_member' AND ev.version_no = 1;

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
            (v_ev,'team_id',     'team_id',     'Team',        'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'principal_id','principal_id','User',        'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'role_in_team','role_in_team','Role in Team','string',   'text',     'one','standard',false,true,  true,  true, 130,v_su),
            (v_ev,'joined_at',   'joined_at',   'Joined At',   'timestamp','datetime', 'one','system',  false,true,  true,  false,140,v_su),
            (v_ev,'left_at',     'left_at',     'Left At',     'timestamp','datetime', 'one','standard',false,true,  true,  false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── access_grant ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'access_grant' AND ev.version_no = 1;

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
            (v_ev,'role_id',              'role_id',              'Role',             'uuid',     'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'group_id',             'group_id',             'Group',            'uuid',     'reference','one','standard',false,true,  false, false,120,v_su),
            (v_ev,'principal_id',         'principal_id',         'User',             'uuid',     'reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'permission_id',        'permission_id',        'Permission',       'uuid',     'reference','one','standard',true, true,  false, false,140,v_su),
            (v_ev,'effect',               'effect',               'Effect',           'enum',     'select',   'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'visibility_scope',     'visibility_scope',     'Visibility',       'enum',     'select',   'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'assignment_scope_type','assignment_scope_type','Scope Type',       'enum',     'select',   'one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'expires_at',           'expires_at',           'Expires At',       'timestamp','datetime', 'one','standard',false,true,  true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── group_feature_grant ───────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'group_feature_grant' AND ev.version_no = 1;

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
            (v_ev,'group_id',   'group_id',   'Group',      'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'feature_id', 'feature_id', 'Feature',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'access_type','access_type','Access Type','enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'expires_at', 'expires_at', 'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by', 'granted_by', 'Granted By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── principal_feature_grant ───────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'principal_feature_grant' AND ev.version_no = 1;

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
            (v_ev,'principal_id','principal_id','User',       'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'feature_id',  'feature_id',  'Feature',    'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'access_type', 'access_type', 'Access Type','enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'granted_by',  'granted_by',  'Granted By', 'uuid',     'reference','one','standard',false,true,  false, false,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── delegation_grant ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'delegation_grant' AND ev.version_no = 1;

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
            (v_ev,'delegator_id','delegator_id','Delegator',  'uuid',     'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'delegate_id', 'delegate_id', 'Delegate',   'uuid',     'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'scope_type',  'scope_type',  'Scope Type', 'enum',     'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'scope_ref',   'scope_ref',   'Scope Ref',  'string',   'text',     'one','standard',false,true,  false, true, 140,v_su),
            (v_ev,'expires_at',  'expires_at',  'Expires At', 'timestamp','datetime', 'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_revoked',  'is_revoked',  'Revoked',    'boolean',  'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'reason',      'reason',      'Reason',     'text',     'textarea', 'one','standard',false,false, false, true, 170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/001_fields_identity: done';
END $$;
