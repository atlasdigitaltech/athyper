-- ============================================================================
-- ATHYPER — ADMIN PLANE IDENTITY BINDINGS
-- ============================================================================
-- File:     010_demo/network/003_admin_plane_bindings.sql
-- Purpose:  Add realm_key='admin' principal_identity_binding rows for the
--           athyper tenant admins who can log in via the ADMIN plane KC realm.
--           The existing principal (NEON plane) gets a second identity binding
--           for the ADMIN realm — same DB principal, different KC realm.
--
-- ADMIN realm KC UUIDs (stable — must match admin-realm.json KC import):
--   dd001000-0000-0000-0000-000000000001  athq.owner  (admin realm)
--   dd001000-0000-0000-0000-000000000002  athq.admin  (admin realm)
--
-- Existing NEON principal UUIDs (from 001_demo_principals.sql):
--   aa001000-0000-0000-0000-000000000006  athq.owner
--   aa001000-0000-0000-0000-000000000007  athq.admin
--
-- Login flow: ADMIN realm KC → subject_id lookup → NEON principal → athyper
--             tenant admin console (auto-login: 1 tenant context).
--
-- Depends:  900_principals/001_demo_principals.sql (principals must exist)
-- Idempotent: ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING
-- ============================================================================

DO $athq_admin_bindings$
DECLARE
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_tid   uuid;
BEGIN

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003_admin_plane_bindings] athyper tenant not found'; END IF;

    -- Verify principals exist before binding
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'aa001000-0000-0000-0000-000000000006' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] athq.owner principal not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'aa001000-0000-0000-0000-000000000007' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] athq.admin principal not found';
    END IF;

    -- ── ADMIN realm identity bindings ─────────────────────────────────────────
    -- subject_id = KC user UUID in the ADMIN realm (different from NEON KC UUID)
    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES
        (v_tid, 'aa001000-0000-0000-0000-000000000006',
         'athyper', 'keycloak', 'aa001000-0000-0000-0000-000000000006', 'athq.owner',
         'synced', true, true, now(), v_su),
        (v_tid, 'aa001000-0000-0000-0000-000000000007',
         'athyper', 'keycloak', 'aa001000-0000-0000-0000-000000000007', 'athq.admin',
         'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING;

    INSERT INTO master.tenant_admin_grant (
        tenant_id, principal_id, persona_key, all_legal_entities, status, created_by
    ) VALUES
        (v_tid, 'aa001000-0000-0000-0000-000000000006', 'owner', true, 'active', v_su),
        (v_tid, 'aa001000-0000-0000-0000-000000000007', 'admin', true, 'active', v_su)
    ON CONFLICT (tenant_id, principal_id, persona_key) DO UPDATE SET
        all_legal_entities = EXCLUDED.all_legal_entities,
        status             = EXCLUDED.status,
        updated_at         = now(),
        updated_by         = v_su;

    RAISE NOTICE '[003_admin_plane_bindings] athyper: 2 admin realm bindings seeded (athq.owner, athq.admin)';
END $athq_admin_bindings$;
