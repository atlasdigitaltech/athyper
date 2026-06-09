-- ============================================================================
-- CIRRUSATLANTIC — RBAC (Groups + Role Assignments)
-- ============================================================================
-- File:     001_rbac.sql
-- Schema:   master (auth_group, auth_group_role, auth_group_member)
-- Purpose:  Provision CATL-OWNER and CATL-ADMIN groups, assign roles,
--           and add the seed principals to their groups.
-- Depends:  900_principals/001_principals.sql
-- Idempotent: Yes — ON CONFLICT DO NOTHING
-- ============================================================================

DO $catl_rbac$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tid       uuid;
    v_owner_grp uuid;
    v_admin_grp uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[001_rbac] CirrusAtlantic tenant not found'; END IF;

    -- ── Groups ────────────────────────────────────────────────────────────
    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    ) VALUES
        (v_tid, 'CATL-OWNER', 'CirrusAtlantic Owner',
         'Full operational control. Assigned all owner-* roles.',
         true, false, v_su),
        (v_tid, 'CATL-ADMIN', 'CirrusAtlantic Administrator',
         'Administrative access. Assigned all admin-* roles.',
         true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_owner_grp FROM master.auth_group WHERE tenant_id = v_tid AND code = 'CATL-OWNER';
    SELECT id INTO v_admin_grp  FROM master.auth_group WHERE tenant_id = v_tid AND code = 'CATL-ADMIN';

    -- ── Role assignments ──────────────────────────────────────────────────
    -- CATL-OWNER gets all owner-* roles; CATL-ADMIN gets all admin-* roles
    INSERT INTO master.auth_group_role (tenant_id, group_id, role_id, visibility_scope, created_by)
    SELECT v_tid, v_owner_grp, r.id, 'all', v_su
    FROM shared.role r
    WHERE r.code LIKE 'owner-%'
    ON CONFLICT ON CONSTRAINT auth_group_role_uq DO NOTHING;

    INSERT INTO master.auth_group_role (tenant_id, group_id, role_id, visibility_scope, created_by)
    SELECT v_tid, v_admin_grp, r.id, 'all', v_su
    FROM shared.role r
    WHERE r.code LIKE 'admin-%'
    ON CONFLICT ON CONSTRAINT auth_group_role_uq DO NOTHING;

    -- ── Group membership ──────────────────────────────────────────────────
    -- catl.admin  → CATL-ADMIN
    INSERT INTO master.auth_group_member (tenant_id, group_id, principal_id, created_by)
    SELECT v_tid, v_admin_grp,
           (SELECT id FROM master.principal WHERE tenant_id = v_tid AND external_ref = 'catl.admin'),
           v_su
    WHERE (SELECT id FROM master.principal WHERE tenant_id = v_tid AND external_ref = 'catl.admin') IS NOT NULL
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    -- catl.owner  → CATL-OWNER
    INSERT INTO master.auth_group_member (tenant_id, group_id, principal_id, created_by)
    SELECT v_tid, v_owner_grp,
           (SELECT id FROM master.principal WHERE tenant_id = v_tid AND external_ref = 'catl.owner'),
           v_su
    WHERE (SELECT id FROM master.principal WHERE tenant_id = v_tid AND external_ref = 'catl.owner') IS NOT NULL
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    -- catl.finance → CATL-ADMIN (finance lead gets admin-level access)
    INSERT INTO master.auth_group_member (tenant_id, group_id, principal_id, created_by)
    SELECT v_tid, v_admin_grp,
           (SELECT id FROM master.principal WHERE tenant_id = v_tid AND external_ref = 'catl.finance'),
           v_su
    WHERE (SELECT id FROM master.principal WHERE tenant_id = v_tid AND external_ref = 'catl.finance') IS NOT NULL
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[001_rbac] CATL-OWNER + CATL-ADMIN groups seeded with roles and members';

END $catl_rbac$;
