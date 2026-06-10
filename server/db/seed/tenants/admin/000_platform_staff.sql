-- ============================================================================
-- ADMIN PLANE — PLATFORM STAFF PRINCIPALS
-- ============================================================================
-- File:     admin/000_platform_staff.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding,
--           master.auth_group, master.auth_group_role, master.auth_group_member
-- Purpose:  Seed platform staff principals in the athyper (platform_owner)
--           tenant with realm_key='admin' identity bindings.
--           These users log into the ADMIN realm KC and see a chooser of ALL
--           tenants (resolved by the admin app from master.tenant, since
--           tenant_type='platform_owner' grants cross-tenant visibility).
--
-- UUID series (ff001000-…):
--   ff001000-0000-0000-0000-000000000001  platform.owner  (full platform owner)
--   ff001000-0000-0000-0000-000000000002  platform.admin  (platform administrator)
--   ff001000-0000-0000-0000-000000000003  support.agent   (read-only support)
--
-- Groups created:
--   PLATFORM-STAFF-OWNER  → all owner-* roles, assignment_scope_type=tenant
--   PLATFORM-STAFF-ADMIN  → all admin-* roles, assignment_scope_type=tenant
--
-- Depends:  platform/006_system_tenant/000_athyper_tenant.sql,
--           010_demo/950_rbac/001_demo_rbac.sql (auth_group must exist already)
-- Idempotent: ON CONFLICT DO NOTHING throughout
-- ============================================================================

DO $platform_staff$
DECLARE
    v_su            uuid := '00000000-0000-0000-0000-000000000000';
    v_tid           uuid;
    v_grp_owner     uuid;
    v_grp_admin     uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[000_platform_staff] athyper tenant not found'; END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);
    PERFORM set_config('app.iam_profile_kc_frozen', 'false', true);

    -- ── Stage A: Principals ───────────────────────────────────────────────────
    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    ) VALUES
        ('ff001000-0000-0000-0000-000000000001', v_tid,
         'platform.owner', 'Platform Owner',
         'user', false, false, 'oidc_jit', 'active', v_su),
        ('ff001000-0000-0000-0000-000000000002', v_tid,
         'platform.admin', 'Platform Administrator',
         'user', false, false, 'oidc_jit', 'active', v_su),
        ('ff001000-0000-0000-0000-000000000003', v_tid,
         'support.agent', 'Support Agent',
         'user', false, false, 'oidc_jit', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[000_platform_staff] Stage A: 3 platform staff principals seeded';

    -- ── Stage B: Principal profiles ───────────────────────────────────────────
    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    ) VALUES
        (v_tid, 'ff001000-0000-0000-0000-000000000001',
         'Platform', 'Owner', 'Platform Owner',
         'ff001000-0000-0000-0000-000000000001', 'platform.owner', 'synced', v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000002',
         'Platform', 'Admin', 'Platform Administrator',
         'ff001000-0000-0000-0000-000000000002', 'platform.admin', 'synced', v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000003',
         'Support', 'Agent', 'Support Agent',
         'ff001000-0000-0000-0000-000000000003', 'support.agent', 'synced', v_su)
    ON CONFLICT (tenant_id, principal_id) DO NOTHING;

    RAISE NOTICE '[000_platform_staff] Stage B: 3 principal profiles seeded';

    -- ── Stage C: ADMIN realm identity bindings ────────────────────────────────
    -- subject_id = KC user UUID in the ADMIN realm
    -- These principals ONLY exist in the ADMIN realm (no NEON realm KC users)
    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES
        (v_tid, 'ff001000-0000-0000-0000-000000000001',
         'athyper', 'keycloak', 'ff001000-0000-0000-0000-000000000001', 'platform.owner',
         'synced', true, true, now(), v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000002',
         'athyper', 'keycloak', 'ff001000-0000-0000-0000-000000000002', 'platform.admin',
         'synced', true, true, now(), v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000003',
         'athyper', 'keycloak', 'ff001000-0000-0000-0000-000000000003', 'support.agent',
         'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING;

    INSERT INTO master.tenant_admin_grant (
        tenant_id, principal_id, persona_key, all_legal_entities, status, created_by
    ) VALUES
        (v_tid, 'ff001000-0000-0000-0000-000000000001', 'owner', true, 'active', v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000002', 'admin', true, 'active', v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000003', 'admin', true, 'active', v_su)
    ON CONFLICT (tenant_id, principal_id, persona_key) DO UPDATE SET
        all_legal_entities = EXCLUDED.all_legal_entities,
        status             = EXCLUDED.status,
        updated_at         = now(),
        updated_by         = v_su;

    RAISE NOTICE '[000_platform_staff] Stage C: 3 admin realm identity bindings + 3 tenant_admin_grants seeded';

    -- ── Stage D: Platform staff auth groups ───────────────────────────────────
    -- Dedicated groups separate from tenant OWNER/ADMIN groups so platform
    -- staff can be managed independently of per-tenant admins.
    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    ) VALUES
        (v_tid, 'PLATFORM-STAFF-OWNER', 'Platform Staff Owner',
         'Full operational control for Athyper platform staff. '
         'Assigned all owner-* roles with assignment_scope_type=tenant.',
         true, false, v_su),
        (v_tid, 'PLATFORM-STAFF-ADMIN', 'Platform Staff Administrator',
         'Administrative access for Athyper platform staff. '
         'Assigned all admin-* roles with assignment_scope_type=tenant.',
         true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_grp_owner FROM master.auth_group WHERE tenant_id = v_tid AND code = 'PLATFORM-STAFF-OWNER';
    SELECT id INTO v_grp_admin FROM master.auth_group WHERE tenant_id = v_tid AND code = 'PLATFORM-STAFF-ADMIN';

    -- ── Stage E: Role assignments ─────────────────────────────────────────────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, created_by
    )
    SELECT v_tid, v_grp_owner, r.id, 'all', 'tenant', v_su
    FROM shared.role r
    WHERE r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, created_by
    )
    SELECT v_tid, v_grp_admin, r.id, 'all', 'tenant', v_su
    FROM shared.role r
    WHERE r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[000_platform_staff] Stage E: owner-* → PLATFORM-STAFF-OWNER, admin-* → PLATFORM-STAFF-ADMIN';

    -- ── Stage F: Group memberships ────────────────────────────────────────────
    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    ) VALUES
        (v_tid, 'ff001000-0000-0000-0000-000000000001', v_grp_owner, now(), v_su, v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000002', v_grp_admin, now(), v_su, v_su),
        (v_tid, 'ff001000-0000-0000-0000-000000000003', v_grp_admin, now(), v_su, v_su)
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[000_platform_staff] Stage F: 3 group memberships (owner/admin/admin)';
    RAISE NOTICE '[000_platform_staff] Complete — 3 platform staff principals ready for ADMIN plane login';
END $platform_staff$;
