-- ============================================================================
-- DEMO PRINCIPALS — PRINCIPAL + PROFILE + AUTH BINDING
-- ============================================================================
-- File:     001_demo_principals.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding
-- Purpose:  Pre-seed all 17 human demo users so the KC → DB identity
--           resolution works on first login without a JIT create.
--
-- KEY DESIGN: KC user UUID == DB principal UUID == principal_identity_binding.subject_id
--   The auth adapter looks up (tenant_id, realm_key, provider_code, subject_id) on every
--   authenticated request. With this seed, that binding exists before first login.
--
-- All 17 demo users belong to the 'athyper' tenant.
-- KC org claims (ATHQ, AQTU, ASAC, etc.) provide business-unit scope within
-- that tenant — they are NOT separate DB tenants.
--
-- UUID series (aa001000-…):
--   aa001000-0000-0000-0000-000000000001  athq.viewer
--   aa001000-0000-0000-0000-000000000002  athq.reporter
--   aa001000-0000-0000-0000-000000000003  athq.requester
--   aa001000-0000-0000-0000-000000000004  athq.agent
--   aa001000-0000-0000-0000-000000000005  athq.manager
--   aa001000-0000-0000-0000-000000000006  athq.owner
--   aa001000-0000-0000-0000-000000000007  athq.admin
--   aa001000-0000-0000-0000-000000000008  aqtu.manager
--   aa001000-0000-0000-0000-000000000009  asac.manager
--   aa001000-0000-0000-0000-00000000000a  auic.manager
--   aa001000-0000-0000-0000-00000000000b  asgf.manager
--   aa001000-0000-0000-0000-00000000000c  athq.cfo
--   aa001000-0000-0000-0000-00000000000d  partner.viewer
--   aa001000-0000-0000-0000-00000000000e  partner.agent
--   aa001000-0000-0000-0000-00000000000f  partner.manager
--   aa001000-0000-0000-0000-000000000010  partner.owner
--   aa001000-0000-0000-0000-000000000011  karim.dual
-- ============================================================================

DO $demo_principals$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    v_stable_ids uuid[] := ARRAY[
        'aa001000-0000-0000-0000-000000000001'::uuid,
        'aa001000-0000-0000-0000-000000000002'::uuid,
        'aa001000-0000-0000-0000-000000000003'::uuid,
        'aa001000-0000-0000-0000-000000000004'::uuid,
        'aa001000-0000-0000-0000-000000000005'::uuid,
        'aa001000-0000-0000-0000-000000000006'::uuid,
        'aa001000-0000-0000-0000-000000000007'::uuid,
        'aa001000-0000-0000-0000-000000000008'::uuid,
        'aa001000-0000-0000-0000-000000000009'::uuid,
        'aa001000-0000-0000-0000-00000000000a'::uuid,
        'aa001000-0000-0000-0000-00000000000b'::uuid,
        'aa001000-0000-0000-0000-00000000000c'::uuid,
        'aa001000-0000-0000-0000-00000000000d'::uuid,
        'aa001000-0000-0000-0000-00000000000e'::uuid,
        'aa001000-0000-0000-0000-00000000000f'::uuid,
        'aa001000-0000-0000-0000-000000000010'::uuid,
        'aa001000-0000-0000-0000-000000000011'::uuid
    ];
BEGIN

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE 0: Remove JIT-created demo principals that conflict with stable UUIDs
    -- by Keycloak subject. Earlier seeds may also have created the same code with
    -- a different principal id and downstream references; those are preserved and
    -- resolved by code in STAGE B/C instead of being deleted.
    -- ══════════════════════════════════════════════════════════════════════════
    DELETE FROM master.principal p
    USING master.principal_profile pp
    WHERE pp.principal_id = p.id
      AND p.tenant_id     = v_tenant_id
      AND p.principal_source = 'oidc_jit'
      AND pp.keycloak_id::uuid = ANY(v_stable_ids)
      AND p.id           <> ALL(v_stable_ids);

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    ) VALUES
    ('aa001000-0000-0000-0000-000000000001', v_tenant_id, 'athq.viewer',    'ATHQ Viewer',    'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000002', v_tenant_id, 'athq.reporter',  'ATHQ Reporter',  'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000003', v_tenant_id, 'athq.requester', 'ATHQ Requester', 'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000004', v_tenant_id, 'athq.agent',     'ATHQ Agent',     'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000005', v_tenant_id, 'athq.manager',   'ATHQ Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000006', v_tenant_id, 'athq.owner',     'ATHQ Owner',     'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000007', v_tenant_id, 'athq.admin',     'ATHQ Admin',     'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000008', v_tenant_id, 'aqtu.manager',   'AQTU Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000009', v_tenant_id, 'asac.manager',   'ASAC Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000a', v_tenant_id, 'auic.manager',   'AUIC Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000b', v_tenant_id, 'asgf.manager',   'ASGF Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000c', v_tenant_id, 'athq.cfo',       'ATHQ CFO',       'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000d', v_tenant_id, 'partner.viewer', 'Partner Viewer', 'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000e', v_tenant_id, 'partner.agent',  'Partner Agent',  'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000f', v_tenant_id, 'partner.manager','Partner Manager','user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000010', v_tenant_id, 'partner.owner',  'Partner Owner',  'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000011', v_tenant_id, 'karim.dual',     'Karim Dual',     'user', false, false, 'oidc_jit', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal_profile
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
        p.tenant_id,
        p.id,
        v.given_name,
        v.family_name,
        v.display_name,
        v.stable_id::text,
        v.code,
        'synced',
        v_su
    FROM (VALUES
        ('aa001000-0000-0000-0000-000000000001'::uuid, 'athq.viewer',    'ATHQ',    'Viewer',    'ATHQ Viewer'),
        ('aa001000-0000-0000-0000-000000000002'::uuid, 'athq.reporter',  'ATHQ',    'Reporter',  'ATHQ Reporter'),
        ('aa001000-0000-0000-0000-000000000003'::uuid, 'athq.requester', 'ATHQ',    'Requester', 'ATHQ Requester'),
        ('aa001000-0000-0000-0000-000000000004'::uuid, 'athq.agent',     'ATHQ',    'Agent',     'ATHQ Agent'),
        ('aa001000-0000-0000-0000-000000000005'::uuid, 'athq.manager',   'ATHQ',    'Manager',   'ATHQ Manager'),
        ('aa001000-0000-0000-0000-000000000006'::uuid, 'athq.owner',     'ATHQ',    'Owner',     'ATHQ Owner'),
        ('aa001000-0000-0000-0000-000000000007'::uuid, 'athq.admin',     'ATHQ',    'Admin',     'ATHQ Admin'),
        ('aa001000-0000-0000-0000-000000000008'::uuid, 'aqtu.manager',   'AQTU',    'Manager',   'AQTU Manager'),
        ('aa001000-0000-0000-0000-000000000009'::uuid, 'asac.manager',   'ASAC',    'Manager',   'ASAC Manager'),
        ('aa001000-0000-0000-0000-00000000000a'::uuid, 'auic.manager',   'AUIC',    'Manager',   'AUIC Manager'),
        ('aa001000-0000-0000-0000-00000000000b'::uuid, 'asgf.manager',   'ASGF',    'Manager',   'ASGF Manager'),
        ('aa001000-0000-0000-0000-00000000000c'::uuid, 'athq.cfo',       'ATHQ',    'CFO',       'ATHQ CFO'),
        ('aa001000-0000-0000-0000-00000000000d'::uuid, 'partner.viewer', 'Partner', 'Viewer',    'Partner Viewer'),
        ('aa001000-0000-0000-0000-00000000000e'::uuid, 'partner.agent',  'Partner', 'Agent',     'Partner Agent'),
        ('aa001000-0000-0000-0000-00000000000f'::uuid, 'partner.manager','Partner', 'Manager',   'Partner Manager'),
        ('aa001000-0000-0000-0000-000000000010'::uuid, 'partner.owner',  'Partner', 'Owner',     'Partner Owner'),
        ('aa001000-0000-0000-0000-000000000011'::uuid, 'karim.dual',     'Karim',   'Dual',      'Karim Dual')
    ) AS v(stable_id, code, given_name, family_name, display_name)
    JOIN master.principal p ON p.tenant_id = v_tenant_id AND p.code = v.code
    ON CONFLICT (tenant_id, principal_id) DO UPDATE
        SET given_name           = EXCLUDED.given_name,
            family_name          = EXCLUDED.family_name,
            display_name         = EXCLUDED.display_name,
            keycloak_id          = EXCLUDED.keycloak_id,
            keycloak_username    = EXCLUDED.keycloak_username,
            keycloak_sync_status = EXCLUDED.keycloak_sync_status,
            updated_at           = now(),
            updated_by           = v_su;

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
        p.tenant_id,
        p.id,
        'athyper',
        'keycloak',
        v.stable_id::text,
        v.code,
        'synced',
        true,
        true,
        now(),
        v_su
    FROM (VALUES
        ('aa001000-0000-0000-0000-000000000001'::uuid, 'athq.viewer'),
        ('aa001000-0000-0000-0000-000000000002'::uuid, 'athq.reporter'),
        ('aa001000-0000-0000-0000-000000000003'::uuid, 'athq.requester'),
        ('aa001000-0000-0000-0000-000000000004'::uuid, 'athq.agent'),
        ('aa001000-0000-0000-0000-000000000005'::uuid, 'athq.manager'),
        ('aa001000-0000-0000-0000-000000000006'::uuid, 'athq.owner'),
        ('aa001000-0000-0000-0000-000000000007'::uuid, 'athq.admin'),
        ('aa001000-0000-0000-0000-000000000008'::uuid, 'aqtu.manager'),
        ('aa001000-0000-0000-0000-000000000009'::uuid, 'asac.manager'),
        ('aa001000-0000-0000-0000-00000000000a'::uuid, 'auic.manager'),
        ('aa001000-0000-0000-0000-00000000000b'::uuid, 'asgf.manager'),
        ('aa001000-0000-0000-0000-00000000000c'::uuid, 'athq.cfo'),
        ('aa001000-0000-0000-0000-00000000000d'::uuid, 'partner.viewer'),
        ('aa001000-0000-0000-0000-00000000000e'::uuid, 'partner.agent'),
        ('aa001000-0000-0000-0000-00000000000f'::uuid, 'partner.manager'),
        ('aa001000-0000-0000-0000-000000000010'::uuid, 'partner.owner'),
        ('aa001000-0000-0000-0000-000000000011'::uuid, 'karim.dual')
    ) AS v(stable_id, code)
    JOIN master.principal p ON p.tenant_id = v_tenant_id AND p.code = v.code
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO UPDATE
        SET subject_id         = EXCLUDED.subject_id,
            username           = EXCLUDED.username,
            sync_status        = EXCLUDED.sync_status,
            idp_enabled        = EXCLUDED.idp_enabled,
            idp_email_verified = EXCLUDED.idp_email_verified,
            synced_at          = EXCLUDED.synced_at,
            updated_at         = now(),
            updated_by         = v_su;

    RAISE NOTICE '[001_demo_principals] 17 principals + profiles + auth bindings seeded';

END $demo_principals$;
