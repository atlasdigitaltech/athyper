-- 020_entities/001_master_identity.sql
-- Entities 1–26: IAM + Foundation (master schema)
-- Depends on: shared.module rows (IAM, FND) exist
-- Idempotent: UNIQUE (table_schema, table_name) → ON CONFLICT DO NOTHING
-- governance_level: 'full'|'standard'|'lite'  (spec 'light'→'standard', 'none'/'audit_only'→'lite')

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_iam text;
    v_fnd text;
BEGIN
    SELECT id::text INTO v_iam FROM shared.module WHERE code = 'IAM';
    SELECT id::text INTO v_fnd FROM shared.module WHERE code = 'FND';

    -- ── 1. tenant ────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant', 'TNT', 'tenant', 'MASTER', 'system', 'ent', 'table',
        'full', 'platform_critical', 'locked', 'master', 'tenant',
        'Tenant', 'Tenants', 'building-2', 'indigo',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 2. principal ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal', 'PRIN', 'principal', 'MASTER', 'system', 'ent', 'table',
        'full', 'platform_critical', 'controlled', 'master', 'principal',
        'User', 'Users', 'user', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 3. principal_profile ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_profile', 'PRINP', 'principal_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'principal_profile',
        'User Profile', 'User Profiles', 'user-circle', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 4. principal_identity_binding ────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_identity_binding', 'PIB', 'principal_identity_binding', 'CONTROL', 'system', 'ent', 'table',
        'full', 'platform_critical', 'locked', 'master', 'principal_identity_binding',
        'Identity Binding', 'Identity Bindings', 'link', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 5. contact_link ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'contact_link', 'CLINK', 'contact_link', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'contact_link',
        'Contact Link', 'Contact Links', 'contact', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 6. contact_email ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'contact_email', 'CEMAIL', 'contact_email', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'contact_email',
        'Contact Email', 'Contact Emails', 'mail', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 7. contact_phone ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'contact_phone', 'CPHONE', 'contact_phone', 'RELATION', 'system', 'ent', 'table',
        'standard', 'operational', 'controlled', 'master', 'contact_phone',
        'Contact Phone', 'Contact Phones', 'phone', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 8. label ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'label', 'LBL', 'label', 'REFERENCE', 'system', 'ent', 'table',
        'standard', 'config', 'locked', 'master', 'label',
        'Label', 'Labels', 'tag', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 9. label_entity_type ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'label_entity_type', 'LBENT', 'label_entity_type', 'RELATION', 'system', 'ent', 'table',
        'standard', 'config', 'controlled', 'master', 'label_entity_type',
        'Label Entity Type', 'Label Entity Types', 'tags', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 10. owner_type ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_fnd, 'owner_type', 'OWNTP', 'owner_type', 'REFERENCE', 'system', 'ent', 'table',
        'standard', 'config', 'locked', 'master', 'owner_type',
        'Owner Type', 'Owner Types', 'shield', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 11. address ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'address', 'ADDR', 'address', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'address',
        'Address', 'Addresses', 'map-pin', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 12. address_link ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'address_link', 'ADDRL', 'address_link', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'address_link',
        'Address Link', 'Address Links', 'map-pin', 'gray',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 13. tenant_module_subscription ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_module_subscription', 'TMS', 'tenant_module_subscription', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'locked', 'master', 'tenant_module_subscription',
        'Module Subscription', 'Module Subscriptions', 'package-check', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 14. tenant_feature_entitlement ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_feature_entitlement', 'TFE', 'tenant_feature_entitlement', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'locked', 'master', 'tenant_feature_entitlement',
        'Feature Entitlement', 'Feature Entitlements', 'unlock', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 15. tenant_permission_override ───────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'tenant_permission_override', 'TPO', 'tenant_permission_override', 'CONTROL', 'system', 'ent', 'table',
        'full', 'platform_critical', 'locked', 'master', 'tenant_permission_override',
        'Permission Override', 'Permission Overrides', 'shield-alert', 'red',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 16. company_code_access ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'company_code_access', 'CCA', 'company_code_access', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_access',
        'Company Code Access', 'Company Code Access', 'key-square', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 17. auth_group ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'auth_group', 'AGRP', 'auth_group', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'auth_group',
        'Group', 'Groups', 'users', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 18. auth_group_role ──────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'auth_group_role', 'AGRL', 'auth_group_role', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'auth_group_role',
        'Group Role', 'Group Roles', 'shield-check', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 19. auth_group_member ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'auth_group_member', 'AGMB', 'auth_group_member', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'auth_group_member',
        'Group Member', 'Group Members', 'user-plus', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 20. principal_persona ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_persona', 'PPRS', 'principal_persona', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'principal_persona',
        'User Persona', 'User Personas', 'badge', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 21. team ─────────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'team', 'TEAM', 'team', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'team',
        'Team', 'Teams', 'users-round', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 22. team_member ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'team_member', 'TMBR', 'team_member', 'RELATION', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'team_member',
        'Team Member', 'Team Members', 'user-check', 'cyan',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 23. access_grant ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'access_grant', 'AGRANT', 'access_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'platform_critical', 'controlled', 'master', 'access_grant',
        'Access Grant', 'Access Grants', 'key', 'red',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 24. group_feature_grant ──────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'group_feature_grant', 'GFGR', 'group_feature_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'group_feature_grant',
        'Group Feature Grant', 'Group Feature Grants', 'award', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 25. principal_feature_grant ──────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'principal_feature_grant', 'PFGR', 'principal_feature_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'principal_feature_grant',
        'User Feature Grant', 'User Feature Grants', 'star', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 26. delegation_grant ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'delegation_grant', 'DLGR', 'delegation_grant', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'delegation_grant',
        'Delegation Grant', 'Delegation Grants', 'share-2', 'purple',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
