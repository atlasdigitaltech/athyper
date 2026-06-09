-- ============================================================================
-- TECHNOSTAT — LE-SCOPED NEON ACCESS GROUPS
-- ============================================================================
-- File:     020_technostat/network/002_neon_le_groups.sql
-- Purpose:  Add LE-scoped auth_groups so the NEON login resolver can present
--           legal-entity contexts in the chooser (or trigger auto-login when
--           exactly 1 LE context is resolved).
--           Supplements — does NOT replace — the CC-scoped groups in P19.
--
--   TKSA-LE-OWNER  LE-TKSA  include_descendants=true  → TKSA+SSK+TEGY+SDTX
--   TEGY-LE-ADMIN  LE-TEGY  include_descendants=true  → TEGY+SDTX
--   SSK-LE-ADMIN   LE-SSK   include_descendants=false → SSK only (leaf)
--   SDTX-LE-ADMIN  LE-SDTX  include_descendants=false → SDTX only (leaf)
--
-- Principals assigned:
--   tksa.owner → TKSA-LE-OWNER   (group-level owner for the full LE tree)
--   tegy.admin → TEGY-LE-ADMIN   (LE admin: TEGY + SDTX subsidiary)
--   ssk.admin  → SSK-LE-ADMIN    (LE admin: SSK Saudi only)
--   sdtx.admin → SDTX-LE-ADMIN   (LE admin: SDTX only)
--
-- Depends:  003_technostat_production_seed.sql (P02 LEs, P17 principals, P19/P20 groups)
-- Idempotent: ON CONFLICT DO NOTHING throughout
-- ============================================================================

DO $tksa_le_groups$
DECLARE
    v_su                uuid := '00000000-0000-0000-0000-000000000000';
    v_tid               uuid;
    v_le_tksa           uuid;
    v_le_ssk            uuid;
    v_le_tegy           uuid;
    v_le_sdtx           uuid;
    v_grp_tksa_le_owner uuid;
    v_grp_tegy_le_admin uuid;
    v_grp_ssk_le_admin  uuid;
    v_grp_sdtx_le_admin uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] technostat tenant not found'; END IF;

    -- ── Resolve LE IDs (non-stable; look up by code) ──────────────────────────
    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TKSA';
    SELECT id INTO v_le_ssk  FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SSK';
    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TEGY';
    SELECT id INTO v_le_sdtx FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SDTX';

    IF v_le_tksa IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] LE-TKSA not found'; END IF;
    IF v_le_ssk  IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] LE-SSK not found'; END IF;
    IF v_le_tegy IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] LE-TEGY not found'; END IF;
    IF v_le_sdtx IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] LE-SDTX not found'; END IF;

    -- ── Groups ────────────────────────────────────────────────────────────────
    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    ) VALUES
        (v_tid, 'TKSA-LE-OWNER', 'TKSA Group Owner (LE)',
         'LE-scoped owner: LE-TKSA + all descendants (SSK, TEGY, SDTX). '
         'Assigned all owner-* roles with include_descendants=true.',
         true, false, v_su),
        (v_tid, 'TEGY-LE-ADMIN', 'TEGY Group Administrator (LE)',
         'LE-scoped admin: LE-TEGY + SDTX subsidiary. '
         'Assigned all admin-* roles with include_descendants=true.',
         true, false, v_su),
        (v_tid, 'SSK-LE-ADMIN', 'SSK Administrator (LE)',
         'LE-scoped admin: LE-SSK (standalone, no child LEs). '
         'Assigned all admin-* roles with include_descendants=false.',
         true, false, v_su),
        (v_tid, 'SDTX-LE-ADMIN', 'SDTX Administrator (LE)',
         'LE-scoped admin: LE-SDTX (leaf LE, no child LEs). '
         'Assigned all admin-* roles with include_descendants=false.',
         true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_grp_tksa_le_owner FROM master.auth_group WHERE tenant_id = v_tid AND code = 'TKSA-LE-OWNER';
    SELECT id INTO v_grp_tegy_le_admin FROM master.auth_group WHERE tenant_id = v_tid AND code = 'TEGY-LE-ADMIN';
    SELECT id INTO v_grp_ssk_le_admin  FROM master.auth_group WHERE tenant_id = v_tid AND code = 'SSK-LE-ADMIN';
    SELECT id INTO v_grp_sdtx_le_admin FROM master.auth_group WHERE tenant_id = v_tid AND code = 'SDTX-LE-ADMIN';

    -- ── Role assignments: owner-* → TKSA-LE-OWNER (LE-TKSA, desc=true) ───────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_tksa_le_owner, r.id,
           'all', 'legal_entity', v_le_tksa,
           true, v_su
    FROM shared.role r
    WHERE r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] TKSA-LE-OWNER: owner-* roles → LE-TKSA (desc=true)';

    -- ── Role assignments: admin-* → TEGY-LE-ADMIN (LE-TEGY, desc=true) ───────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_tegy_le_admin, r.id,
           'all', 'legal_entity', v_le_tegy,
           true, v_su
    FROM shared.role r
    WHERE r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] TEGY-LE-ADMIN: admin-* roles → LE-TEGY (desc=true)';

    -- ── Role assignments: admin-* → SSK-LE-ADMIN (LE-SSK, desc=false) ────────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_ssk_le_admin, r.id,
           'all', 'legal_entity', v_le_ssk,
           false, v_su
    FROM shared.role r
    WHERE r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] SSK-LE-ADMIN: admin-* roles → LE-SSK (desc=false)';

    -- ── Role assignments: admin-* → SDTX-LE-ADMIN (LE-SDTX, desc=false) ─────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_sdtx_le_admin, r.id,
           'all', 'legal_entity', v_le_sdtx,
           false, v_su
    FROM shared.role r
    WHERE r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] SDTX-LE-ADMIN: admin-* roles → LE-SDTX (desc=false)';

    -- ── Group memberships ─────────────────────────────────────────────────────
    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT v_tid, p.id, pg.id, now(), v_su, v_su
    FROM (VALUES
        ('tksa.owner', 'TKSA-LE-OWNER'),
        ('tegy.admin', 'TEGY-LE-ADMIN'),
        ('ssk.admin',  'SSK-LE-ADMIN'),
        ('sdtx.admin', 'SDTX-LE-ADMIN')
    ) AS v(principal_code, group_code)
    JOIN master.principal  p  ON p.tenant_id  = v_tid AND p.code  = v.principal_code
    JOIN master.auth_group pg ON pg.tenant_id = v_tid AND pg.code = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] technostat: 4 LE-scoped groups seeded (TKSA/TEGY/SSK/SDTX)';
END $tksa_le_groups$;
