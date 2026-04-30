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
--   The auth adapter looks up (tenant_id, provider_code, subject_id) on every
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
    -- Targets only principals created by oidc_jit whose keycloak_id matches one
    -- of our stable UUIDs but whose principal.id is different (JIT random UUID).
    -- CASCADE removes profile + auth_binding + persona + auth_group_member.
    -- Skips principals that already use the stable UUID (re-run safe).
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
    ) VALUES
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000001', 'ATHQ',    'Viewer',    'ATHQ Viewer',    'aa001000-0000-0000-0000-000000000001', 'athq.viewer',    'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000002', 'ATHQ',    'Reporter',  'ATHQ Reporter',  'aa001000-0000-0000-0000-000000000002', 'athq.reporter',  'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000003', 'ATHQ',    'Requester', 'ATHQ Requester', 'aa001000-0000-0000-0000-000000000003', 'athq.requester', 'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000004', 'ATHQ',    'Agent',     'ATHQ Agent',     'aa001000-0000-0000-0000-000000000004', 'athq.agent',     'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000005', 'ATHQ',    'Manager',   'ATHQ Manager',   'aa001000-0000-0000-0000-000000000005', 'athq.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000006', 'ATHQ',    'Owner',     'ATHQ Owner',     'aa001000-0000-0000-0000-000000000006', 'athq.owner',     'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000007', 'ATHQ',    'Admin',     'ATHQ Admin',     'aa001000-0000-0000-0000-000000000007', 'athq.admin',     'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000008', 'AQTU',    'Manager',   'AQTU Manager',   'aa001000-0000-0000-0000-000000000008', 'aqtu.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000009', 'ASAC',    'Manager',   'ASAC Manager',   'aa001000-0000-0000-0000-000000000009', 'asac.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000a', 'AUIC',    'Manager',   'AUIC Manager',   'aa001000-0000-0000-0000-00000000000a', 'auic.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000b', 'ASGF',    'Manager',   'ASGF Manager',   'aa001000-0000-0000-0000-00000000000b', 'asgf.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000c', 'ATHQ',    'CFO',       'ATHQ CFO',       'aa001000-0000-0000-0000-00000000000c', 'athq.cfo',       'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000d', 'Partner', 'Viewer',    'Partner Viewer', 'aa001000-0000-0000-0000-00000000000d', 'partner.viewer', 'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000e', 'Partner', 'Agent',     'Partner Agent',  'aa001000-0000-0000-0000-00000000000e', 'partner.agent',  'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000f', 'Partner', 'Manager',   'Partner Manager','aa001000-0000-0000-0000-00000000000f', 'partner.manager','synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000010', 'Partner', 'Owner',     'Partner Owner',  'aa001000-0000-0000-0000-000000000010', 'partner.owner',  'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000011', 'Karim',   'Dual',      'Karim Dual',     'aa001000-0000-0000-0000-000000000011', 'karim.dual',     'synced', v_su)
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
        provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000001', 'keycloak', 'aa001000-0000-0000-0000-000000000001', 'athq.viewer',    'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000002', 'keycloak', 'aa001000-0000-0000-0000-000000000002', 'athq.reporter',  'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000003', 'keycloak', 'aa001000-0000-0000-0000-000000000003', 'athq.requester', 'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000004', 'keycloak', 'aa001000-0000-0000-0000-000000000004', 'athq.agent',     'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000005', 'keycloak', 'aa001000-0000-0000-0000-000000000005', 'athq.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000006', 'keycloak', 'aa001000-0000-0000-0000-000000000006', 'athq.owner',     'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000007', 'keycloak', 'aa001000-0000-0000-0000-000000000007', 'athq.admin',     'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000008', 'keycloak', 'aa001000-0000-0000-0000-000000000008', 'aqtu.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000009', 'keycloak', 'aa001000-0000-0000-0000-000000000009', 'asac.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000a', 'keycloak', 'aa001000-0000-0000-0000-00000000000a', 'auic.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000b', 'keycloak', 'aa001000-0000-0000-0000-00000000000b', 'asgf.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000c', 'keycloak', 'aa001000-0000-0000-0000-00000000000c', 'athq.cfo',       'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000d', 'keycloak', 'aa001000-0000-0000-0000-00000000000d', 'partner.viewer', 'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000e', 'keycloak', 'aa001000-0000-0000-0000-00000000000e', 'partner.agent',  'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000f', 'keycloak', 'aa001000-0000-0000-0000-00000000000f', 'partner.manager','synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000010', 'keycloak', 'aa001000-0000-0000-0000-000000000010', 'partner.owner',  'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000011', 'keycloak', 'aa001000-0000-0000-0000-000000000011', 'karim.dual',     'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING;

    RAISE NOTICE '[001_demo_principals] 17 principals + profiles + auth bindings seeded';

END $demo_principals$;
