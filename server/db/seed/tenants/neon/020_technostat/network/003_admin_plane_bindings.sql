-- ============================================================================
-- TECHNOSTAT — ADMIN PLANE IDENTITY BINDINGS
-- ============================================================================
-- File:     020_technostat/network/003_admin_plane_bindings.sql
-- Purpose:  Add realm_key='admin' principal_identity_binding rows for the
--           technostat tenant admins who can log in via the ADMIN plane KC realm.
--
-- ADMIN realm KC UUIDs (stable — must match admin-realm.json KC import):
--   dd002000-0000-0000-0000-000000000001  tksa.owner  (admin realm)
--   dd002000-0000-0000-0000-000000000002  tksa.admin  (admin realm)
--
-- Existing NEON principal UUIDs (from 003_technostat_production_seed.sql P17):
--   cc001000-0000-0000-0000-000000000001  tksa.owner
--   cc001000-0000-0000-0000-000000000002  tksa.admin
--
-- Login flow: ADMIN realm KC → subject_id lookup → technostat principal →
--             technostat tenant admin console (auto-login: 1 tenant context).
--
-- Depends:  003_technostat_production_seed.sql P17 (principals must exist)
-- Idempotent: ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING
-- ============================================================================

DO $tksa_admin_bindings$
DECLARE
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_tid   uuid;
BEGIN

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003_admin_plane_bindings] technostat tenant not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'cc001000-0000-0000-0000-000000000001' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] tksa.owner principal not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'cc001000-0000-0000-0000-000000000002' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] tksa.admin principal not found';
    END IF;

    -- ── ADMIN realm identity bindings ─────────────────────────────────────────
    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES
        (v_tid, 'cc001000-0000-0000-0000-000000000001',
         'athyper', 'keycloak', 'cc001000-0000-0000-0000-000000000001', 'tksa.owner',
         'synced', true, true, now(), v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000002',
         'athyper', 'keycloak', 'cc001000-0000-0000-0000-000000000002', 'tksa.admin',
         'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING;

    INSERT INTO master.tenant_admin_grant (
        tenant_id, principal_id, persona_key, all_legal_entities, status, created_by
    ) VALUES
        (v_tid, 'cc001000-0000-0000-0000-000000000001', 'owner', true, 'active', v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000002', 'admin', true, 'active', v_su)
    ON CONFLICT (tenant_id, principal_id, persona_key) DO UPDATE SET
        all_legal_entities = EXCLUDED.all_legal_entities,
        status             = EXCLUDED.status,
        updated_at         = now(),
        updated_by         = v_su;

    RAISE NOTICE '[003_admin_plane_bindings] technostat: 2 admin realm bindings seeded (tksa.owner, tksa.admin)';
END $tksa_admin_bindings$;
