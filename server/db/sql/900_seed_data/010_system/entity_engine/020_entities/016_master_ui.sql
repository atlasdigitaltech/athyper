-- 020_entities/016_master_ui.sql
-- Entities 103–111: UI & Personalization + CMS Content
-- Depends on: shared.module rows (FND, NTF, CMS)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_fnd text;
    v_ntf text;
    v_cms text;
BEGIN
    SELECT id::text INTO v_fnd FROM shared.module WHERE code = 'FND';
    SELECT id::text INTO v_ntf FROM shared.module WHERE code = 'NTF';
    SELECT id::text INTO v_cms FROM shared.module WHERE code = 'CMS';

    -- ── 103. principal_ui_profile ────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'principal_ui_profile', 'PUIP', 'principal_ui_profile', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'controlled', 'master', 'principal_ui_profile',
        'UI Profile', 'UI Profiles', 'monitor', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 104. principal_ui_preference ─────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'principal_ui_preference', 'PUIPR', 'principal_ui_preference', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'controlled', 'master', 'principal_ui_preference',
        'UI Preference', 'UI Preferences', 'sliders', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 105. saved_view ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'saved_view', 'SVEW', 'saved_view', 'CONTROL', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'saved_view',
        'Saved View', 'Saved Views', 'bookmark', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 106. dashboard ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'dashboard', 'DASH', 'dashboard', 'MASTER', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'dashboard',
        'Dashboard', 'Dashboards', 'layout-dashboard', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 107. dashboard_widget ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'dashboard_widget', 'DASHWG', 'dashboard_widget', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'dashboard_widget',
        'Dashboard Widget', 'Dashboard Widgets', 'square', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 108. principal_notification_preference ───────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_ntf, 'principal_notification_preference', 'PNTFP', 'principal_notification_preference', 'CONTROL', 'system', 'ent', 'table',
        'lite', 'config', 'controlled', 'master', 'principal_notification_preference',
        'Notification Preference', 'Notification Preferences', 'bell-cog', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 109. content_item ────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'content_item', 'CTNT', 'content_item', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'content_item',
        'Content Item', 'Content Items', 'file-text', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 110. content_item_link ───────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'content_item_link', 'CTNTL', 'content_item_link', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'content_item_link',
        'Content Link', 'Content Links', 'link', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 111. content_item_access_grant ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_cms, 'content_item_access_grant', 'CTNTAG', 'content_item_access_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'content_item_access_grant',
        'Content Access Grant', 'Content Access Grants', 'shield-check', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
