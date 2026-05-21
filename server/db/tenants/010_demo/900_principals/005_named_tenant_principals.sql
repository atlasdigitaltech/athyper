-- ============================================================================
-- ATHYPER/ATHQ EXTRA PERSONA USERS — PRINCIPAL + PROFILE + AUTH BINDING
-- ============================================================================
-- File:     005_named_tenant_principals.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding
-- Purpose:  Pre-seed extra athyper/ATHQ persona users so that KC → DB identity
--           resolution works on first login without JIT.
--
-- KEY DESIGN: KC user UUID == DB principal UUID == subject_id in auth binding.
--   These users are imported into KC via realm-demosetup.json with explicit
--   UUIDs that match the values here.
--
-- Series aa000001 — extra athyper/ATHQ users:
--   athyper  athyper--athq  kumar           aa000001-…001
--   athyper  athyper--athq  raja            aa000001-…002
--   athyper  athyper--athq  rama            aa000001-…003
--   athyper  athyper--athq  laks            aa000001-…004
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $named_tenant_principals$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id, t.id, v.code, v.name,
           'user', false, false, 'oidc_jit', 'active', v_su
    FROM (VALUES
        -- aa000001 series — extra athyper/ATHQ users
        ('aa000001-0000-0000-0000-000000000001'::uuid, 'athyper', 'kumar', 'Kumar Rajan'),
        ('aa000001-0000-0000-0000-000000000002'::uuid, 'athyper', 'raja',  'Raja Krishnan'),
        ('aa000001-0000-0000-0000-000000000003'::uuid, 'athyper', 'rama',  'Rama Subramaniam'),
        ('aa000001-0000-0000-0000-000000000004'::uuid, 'athyper', 'laks',  'Lakshmi Narayanan')
    ) AS v(id, tenant_code, code, name)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[005_named_tenant_principals] Stage A: 4 principals seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal_profile
    -- keycloak_id = principal UUID (matches KC import UUID in realm-demosetup.json)
    -- ══════════════════════════════════════════════════════════════════════════

    -- shared.trg_set_updated_at() reads app.current_principal_id to set updated_by.
    -- Without this GUC the trigger writes NULL, violating principal_profile_audit_pair_chk.
    PERFORM set_config('app.current_principal_id', v_su::text, true);
    -- Disable the keycloak column freeze guard so the seed can write KC metadata directly.
    PERFORM set_config('app.iam_profile_kc_frozen', 'false', true);

    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id, p.id,
        v.given_name, v.family_name, p.name,
        p.id,       -- KC UUID = principal UUID
        p.code,     -- KC username = principal code
        'synced',
        v_su
    FROM (VALUES
        -- aa000001 series
        ('aa000001-0000-0000-0000-000000000001'::uuid, 'Kumar',   'Rajan'),
        ('aa000001-0000-0000-0000-000000000002'::uuid, 'Raja',    'Krishnan'),
        ('aa000001-0000-0000-0000-000000000003'::uuid, 'Rama',    'Subramaniam'),
        ('aa000001-0000-0000-0000-000000000004'::uuid, 'Lakshmi', 'Narayanan')
    ) AS v(principal_id, given_name, family_name)
    JOIN master.principal p ON p.id = v.principal_id
    ON CONFLICT (tenant_id, principal_id) DO UPDATE
        SET given_name           = EXCLUDED.given_name,
            family_name          = EXCLUDED.family_name,
            display_name         = EXCLUDED.display_name,
            keycloak_id          = EXCLUDED.keycloak_id,
            keycloak_username    = EXCLUDED.keycloak_username,
            keycloak_sync_status = EXCLUDED.keycloak_sync_status,
            updated_at           = now(),
            updated_by           = v_su;

    RAISE NOTICE '[005_named_tenant_principals] Stage B: 4 principal profiles seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE C: master.principal_identity_binding
    -- provider_code = 'keycloak', subject_id = KC UUID (= principal.id)
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    )
    SELECT
        p.tenant_id, p.id,
        'athyper',
        'keycloak',
        p.id::text,
        p.code,
        'synced', true, true, now(), v_su
    FROM master.principal p
    WHERE p.id IN (
        'aa000001-0000-0000-0000-000000000001'::uuid,
        'aa000001-0000-0000-0000-000000000002'::uuid,
        'aa000001-0000-0000-0000-000000000003'::uuid,
        'aa000001-0000-0000-0000-000000000004'::uuid
    )
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING;

    RAISE NOTICE '[005_named_tenant_principals] Stage C: 4 auth bindings seeded';
    RAISE NOTICE '[005_named_tenant_principals] Complete — 4 athyper/ATHQ extra persona users ready';

END $named_tenant_principals$;
