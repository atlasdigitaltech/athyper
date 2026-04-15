-- 020_entities/002_master_notifications.sql
-- Entities 27–29: Notifications & Tenant Config
-- Depends on: shared.module rows (NTF, IAM)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_ntf text;
    v_iam text;
BEGIN
    SELECT id::text INTO v_ntf FROM shared.module WHERE code = 'NTF';
    SELECT id::text INTO v_iam FROM shared.module WHERE code = 'IAM';

    -- ── 27. notification ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_ntf, 'notification', 'NOTIF', 'notification', 'LOG', 'system', 'ent', 'table',
        'lite', 'operational', 'locked', 'master', 'notification',
        'Notification', 'Notifications', 'bell', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 28. notification_default ─────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_ntf, 'notification_default', 'NOTIFD', 'notification_default', 'CONTROL', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'notification_default',
        'Notification Default', 'Notification Defaults', 'bell-ring', 'amber',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 29. tenant_profile ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_profile', 'TNTP', 'tenant_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'tenant_profile',
        'Tenant Profile', 'Tenant Profiles', 'building', 'indigo',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
