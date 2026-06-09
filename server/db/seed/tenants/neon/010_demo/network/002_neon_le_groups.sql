-- ============================================================================
-- ATHYPER — LE-SCOPED NEON ACCESS GROUPS
-- ============================================================================
-- File:     010_demo/network/002_neon_le_groups.sql
-- Purpose:  Add LE-scoped auth_groups so the NEON login resolver can present
--           legal-entity contexts in the chooser.
--           Supplements the CC-scoped groups in 950_rbac/001_demo_rbac.sql.
--
-- LE hierarchy (from 199_gl_preseed.sql):
--   LE-ATHQ (holding, parent=NULL)
--     └── LE-AMRE, LE-AQTU, LE-ASAC, LE-AQTS, LE-AUET, LE-ASAH,
--         LE-AUIC, LE-ASGF, LE-AITM, LE-ACFB, LE-ADPM, LE-ATEM,
--         LE-ASPE, LE-AUKA, LE-AJED, LE-APHS  (16 direct subsidiaries)
--
-- Groups created:
--   ATHQ-LE-OWNER  LE-ATHQ  include_descendants=true
--     → Holding-level owner: ATHQ + all 16 subsidiaries via LE hierarchy
--
-- Principals assigned:
--   laks → ATHQ-LE-OWNER
--     (laks is in ATHQ-OWNER CC-scope; this adds group-level LE hierarchy access)
--
-- Note: LE IDs from 199_gl_preseed use shared.uuidv7() — looked up by code.
-- Depends:  100_org_structure/199_gl_preseed.sql, 950_rbac/001_demo_rbac.sql,
--           900_principals/005_named_tenant_principals.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout
-- ============================================================================

DO $athq_le_groups$
DECLARE
    v_su                uuid := '00000000-0000-0000-0000-000000000000';
    v_tid               uuid;
    v_le_athq           uuid;
    v_grp_athq_le_owner uuid;
BEGIN

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] athyper tenant not found'; END IF;

    -- ── Resolve LE-ATHQ (non-stable uuidv7 from 199_gl_preseed) ─────────────
    SELECT id INTO v_le_athq FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-ATHQ';
    IF v_le_athq IS NULL THEN RAISE EXCEPTION '[002_neon_le_groups] LE-ATHQ not found'; END IF;

    -- ── Group ─────────────────────────────────────────────────────────────────
    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    ) VALUES
        (v_tid, 'ATHQ-LE-OWNER', 'ATHQ Group Holding Owner (LE)',
         'LE-scoped owner: LE-ATHQ holding + all 16 subsidiaries via include_descendants=true. '
         'Gives group-level principal full operational access across the entire Athyper LE tree.',
         true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_grp_athq_le_owner FROM master.auth_group WHERE tenant_id = v_tid AND code = 'ATHQ-LE-OWNER';

    -- ── Role assignments: owner-* → ATHQ-LE-OWNER (LE-ATHQ, desc=true) ───────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_athq_le_owner, r.id,
           'all', 'legal_entity', v_le_athq,
           true, v_su
    FROM shared.role r
    WHERE r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] ATHQ-LE-OWNER: owner-* roles → LE-ATHQ (desc=true, covers all 17 LEs)';

    -- ── Group membership ──────────────────────────────────────────────────────
    -- laks: currently in ATHQ-OWNER (CC-scope: ATHQ only).
    -- Adding to ATHQ-LE-OWNER gives LE-scope across the full group hierarchy.
    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT v_tid, p.id, v_grp_athq_le_owner, now(), v_su, v_su
    FROM master.principal p
    WHERE p.tenant_id = v_tid AND p.code = 'laks'
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[002_neon_le_groups] athyper: 1 LE-scoped group seeded (ATHQ-LE-OWNER → laks)';
END $athq_le_groups$;
