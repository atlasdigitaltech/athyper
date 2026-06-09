-- ============================================================================
-- CIRRUSATLANTIC — ADMIN PLANE IDENTITY BINDINGS
-- ============================================================================
-- File:     030_cirrusatlantic/network/003_admin_plane_bindings.sql
-- Purpose:  Add realm_key='admin' principal_identity_binding rows for the
--           cirrusatlantic tenant admins who can log in via the ADMIN plane.
--
-- ADMIN realm KC UUIDs (stable — must match admin-realm.json KC import):
--   dd003000-0000-0000-0000-000000000001  catl.owner  (admin realm)
--   dd003000-0000-0000-0000-000000000002  catl.admin  (admin realm)
--
-- Existing NEON principal UUIDs (from 900_principals/001_principals.sql):
--   aa003000-0000-0000-0000-000000000002  catl.owner
--   aa003000-0000-0000-0000-000000000001  catl.admin
--
-- Login flow: ADMIN realm KC → subject_id lookup → cirrusatlantic principal →
--             cirrusatlantic tenant admin console (auto-login: 1 tenant context).
--
-- Depends:  900_principals/001_principals.sql (principals must exist)
-- Idempotent: ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING
-- ============================================================================

DO $catl_admin_bindings$
DECLARE
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_tid   uuid;
BEGIN

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003_admin_plane_bindings] cirrusatlantic tenant not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'aa003000-0000-0000-0000-000000000002' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] catl.owner principal not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'aa003000-0000-0000-0000-000000000001' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] catl.admin principal not found';
    END IF;

    -- ── ADMIN realm identity bindings ─────────────────────────────────────────
    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES
        (v_tid, 'aa003000-0000-0000-0000-000000000002',
         'athyper', 'keycloak', 'aa003000-0000-0000-0000-000000000002', 'catl.owner',
         'synced', true, true, now(), v_su),
        (v_tid, 'aa003000-0000-0000-0000-000000000001',
         'athyper', 'keycloak', 'aa003000-0000-0000-0000-000000000001', 'catl.admin',
         'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING;

    INSERT INTO master.tenant_admin_grant (
        tenant_id, principal_id, persona_key, all_legal_entities, status, created_by
    ) VALUES
        (v_tid, 'aa003000-0000-0000-0000-000000000002', 'owner', true, 'active', v_su),
        (v_tid, 'aa003000-0000-0000-0000-000000000001', 'admin', true, 'active', v_su)
    ON CONFLICT (tenant_id, principal_id, persona_key) DO UPDATE SET
        all_legal_entities = EXCLUDED.all_legal_entities,
        status             = EXCLUDED.status,
        updated_at         = now(),
        updated_by         = v_su;

    RAISE NOTICE '[003_admin_plane_bindings] cirrusatlantic: 2 admin realm bindings seeded (catl.owner, catl.admin)';
END $catl_admin_bindings$;
