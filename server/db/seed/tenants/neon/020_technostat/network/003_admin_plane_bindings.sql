-- ============================================================================
-- TECHNOSTAT — ADMIN PLANE IDENTITY BINDINGS
-- ============================================================================
-- File:     020_technostat/network/003_admin_plane_bindings.sql
-- Purpose:  Identity bindings + tenant_admin_grant rows for all technostat
--           principals that can log in via the ADMIN plane.
--
-- Single athyper realm KC UUIDs (subject_id = KC user UUID, same as principal UUID):
--   cc001000-0000-0000-0000-000000000001  tksa.owner
--   cc001000-0000-0000-0000-000000000002  tksa.admin
--   cc001000-0000-0000-0000-000000000003  ssk.admin   (SSK Saudi — company-scoped)
--   cc001000-0000-0000-0000-000000000004  tegy.admin  (Technostat Egypt — company-scoped)
--   cc001000-0000-0000-0000-000000000005  sdtx.admin  (Satellites DT — company-scoped)
--
-- Identity bindings for all five are also seeded in 003_technostat_production_seed.sql
-- (P17). The INSERT here is idempotent via ON CONFLICT DO NOTHING.
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
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'cc001000-0000-0000-0000-000000000003' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] ssk.admin principal not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'cc001000-0000-0000-0000-000000000004' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] tegy.admin principal not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = 'cc001000-0000-0000-0000-000000000005' AND tenant_id = v_tid) THEN
        RAISE EXCEPTION '[003_admin_plane_bindings] sdtx.admin principal not found';
    END IF;

    -- ── athyper realm identity bindings ───────────────────────────────────────
    -- Identity bindings for all five are also seeded in P17 of the production
    -- seed; this insert is idempotent and covers standalone seeding scenarios.
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
         'synced', true, true, now(), v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000003',
         'athyper', 'keycloak', 'cc001000-0000-0000-0000-000000000003', 'ssk.admin',
         'synced', true, true, now(), v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000004',
         'athyper', 'keycloak', 'cc001000-0000-0000-0000-000000000004', 'tegy.admin',
         'synced', true, true, now(), v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000005',
         'athyper', 'keycloak', 'cc001000-0000-0000-0000-000000000005', 'sdtx.admin',
         'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING;

    INSERT INTO master.tenant_admin_grant (
        tenant_id, principal_id, persona_key, all_legal_entities, status, created_by
    ) VALUES
        (v_tid, 'cc001000-0000-0000-0000-000000000001', 'owner', true, 'active', v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000002', 'admin', true, 'active', v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000003', 'admin', true, 'active', v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000004', 'admin', true, 'active', v_su),
        (v_tid, 'cc001000-0000-0000-0000-000000000005', 'admin', true, 'active', v_su)
    ON CONFLICT (tenant_id, principal_id, persona_key) DO UPDATE SET
        all_legal_entities = EXCLUDED.all_legal_entities,
        status             = EXCLUDED.status,
        updated_at         = now(),
        updated_by         = v_su;

    RAISE NOTICE '[003_admin_plane_bindings] technostat: 5 admin plane bindings + grants seeded (tksa.owner, tksa.admin, ssk.admin, tegy.admin, sdtx.admin)';
END $tksa_admin_bindings$;
