-- ============================================================================
-- CIRRUSATLANTIC — LE-SCOPED NEON ACCESS GROUPS
-- ============================================================================
-- File:     030_cirrusatlantic/network/002_neon_le_groups.sql
-- Purpose:  Add LE-scoped auth_groups for the NEON login resolver.
--           CirrusAtlantic has exactly 1 LE (CATL), so the resolver will
--           always auto-login (1 context → skip chooser).
--           This file establishes the LE-scope pattern for consistency and
--           future use (additional LEs can be added without restructuring).
--
--   CATL-LE-OWNER  LE-CATL  include_descendants=false → CATL only (leaf LE)
--   CATL-LE-ADMIN  LE-CATL  include_descendants=false → CATL only (leaf LE)
--
-- Principals assigned:
--   catl.owner   → CATL-LE-OWNER
--   catl.admin   → CATL-LE-ADMIN
--   catl.finance → CATL-LE-ADMIN
--
-- Stable LE ID: dd000030-0000-0000-0000-000000000001
-- Depends:  100_org_structure/200_legal_entities.sql,
--           900_principals/001_principals.sql,
--           950_rbac/001_rbac.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout
-- ============================================================================

DO $catl_le_groups$
DECLARE
    v_su                uuid := '00000000-0000-0000-0000-000000000000';
    v_tid               uuid;
    v_le_catl           uuid := 'dd000030-0000-0000-0000-000000000001';
    v_grp_catl_le_owner uuid;
    v_grp_catl_le_admin uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] cirrusatlantic tenant not found'; END IF;

    -- Verify stable LE ID exists
    IF NOT EXISTS (SELECT 1 FROM master.legal_entity WHERE id = v_le_catl) THEN
        RAISE EXCEPTION '[002_neon_le_groups] LE-CATL (dd000030-...) not found';
    END IF;

    -- ── Groups ────────────────────────────────────────────────────────────────
    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    ) VALUES
        (v_tid, 'CATL-LE-OWNER', 'CirrusAtlantic Owner (LE)',
         'LE-scoped owner for LE-CATL. Single legal entity — auto-login applies.',
         true, false, v_su),
        (v_tid, 'CATL-LE-ADMIN', 'CirrusAtlantic Administrator (LE)',
         'LE-scoped admin for LE-CATL. Single legal entity — auto-login applies.',
         true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_grp_catl_le_owner FROM master.auth_group WHERE tenant_id = v_tid AND code = 'CATL-LE-OWNER';
    SELECT id INTO v_grp_catl_le_admin FROM master.auth_group WHERE tenant_id = v_tid AND code = 'CATL-LE-ADMIN';

    -- ── Role assignments: owner-* → CATL-LE-OWNER ────────────────────────────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_catl_le_owner, r.id,
           'all', 'legal_entity', v_le_catl,
           false, v_su
    FROM shared.role r
    WHERE r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    -- ── Role assignments: admin-* → CATL-LE-ADMIN ────────────────────────────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_catl_le_admin, r.id,
           'all', 'legal_entity', v_le_catl,
           false, v_su
    FROM shared.role r
    WHERE r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    -- ── Group memberships ─────────────────────────────────────────────────────
    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT v_tid, p.id, pg.id, now(), v_su, v_su
    FROM (VALUES
        ('catl.owner',   'CATL-LE-OWNER'),
        ('catl.admin',   'CATL-LE-ADMIN'),
        ('catl.finance', 'CATL-LE-ADMIN')
    ) AS v(ext_ref, group_code)
    JOIN master.principal  p  ON p.tenant_id  = v_tid AND p.external_ref = v.ext_ref
    JOIN master.auth_group pg ON pg.tenant_id = v_tid AND pg.code        = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] cirrusatlantic: 2 LE-scoped groups seeded (CATL-LE-OWNER, CATL-LE-ADMIN)';
END $catl_le_groups$;
