-- ============================================================================
-- PRINCIPAL GROUPS — OWNER & ADMIN PER TENANT / COMPANY CODE
-- ============================================================================
-- File:    001_demo_rbac.sql
-- Schema:  master
-- Tables:  auth_group, auth_group_role
--
-- ── Design ──────────────────────────────────────────────────────────────────
--
-- Each organisational unit gets two groups:
--
--   <CODE>-OWNER  (e.g. ATHYPER-OWNER, DEMO_CA-OWNER, ATHQ-OWNER)
--     Roles:  All shared.role entries whose code starts with 'owner-'
--     Scope:  'all'    → tenant-level groups
--             'ou_l1'  → CC-level groups (athyper multi-entity only)
--
--   <CODE>-ADMIN  (e.g. ATHYPER-ADMIN, DEMO_CA-ADMIN, ATHQ-ADMIN)
--     Roles:  All shared.role entries whose code starts with 'admin-'
--     Scope:  same as above
--
-- Tenant-level groups: 1 tenant × 2 = 2 groups
-- CC-level groups (athyper only): 17 CCs × 2 = 34 groups
-- Total: 36 groups
--
-- ── Idempotency ─────────────────────────────────────────────────────────────
-- Step 0 TRUNCATES auth_group (CASCADE → auth_group_role, auth_group_member).
-- Steps 1-4 are INSERT … ON CONFLICT DO NOTHING.
-- Re-running is safe.
-- ============================================================================

DO $rbac$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ── Step 0: Clear all existing auth_group data ──────────────────────
    TRUNCATE master.auth_group CASCADE;
    RAISE NOTICE '[001_demo_rbac] Cleared auth_group (CASCADE)';

    -- ── Step 1: Create tenant-level OWNER + ADMIN groups (14 tenants × 2) ───

    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    )
    SELECT
        t.id,
        grp.code,
        grp.name,
        grp.description,
        true, false, v_su
    FROM master.tenant t
    CROSS JOIN (
        SELECT
            upper(replace(code, '-', '_')) || '-OWNER' AS code,
            name || ' Owner'                            AS name,
            'Full operational control for ' || name || '. '
            || 'Assigned all owner-* roles across all modules.' AS description
        FROM master.tenant
        WHERE realm_key = 'athyper' AND code <> 'system'
        -- match the outer t row
        UNION ALL
        SELECT
            upper(replace(code, '-', '_')) || '-ADMIN',
            name || ' Administrator',
            'Administrative access for ' || name || '. '
            || 'Assigned all admin-* roles across all modules.'
        FROM master.tenant
        WHERE realm_key = 'athyper' AND code <> 'system'
    ) grp
    WHERE t.code = lower(split_part(replace(grp.code, '_', '-'), '-OWNER', 1))
       OR t.code = lower(split_part(replace(grp.code, '_', '-'), '-ADMIN', 1))
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- Simpler, explicit approach that avoids regex complexity:
    -- Each of the 14 tenants gets exactly its own two groups.

    TRUNCATE master.auth_group CASCADE;

    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    )
    SELECT t.id, v.grp_code, v.grp_name, v.grp_desc, true, false, v_su
    FROM (VALUES
        -- athyper
        ('athyper', 'ATHYPER-OWNER', 'Athyper Group Owner',         'Full operational control for Athyper Group. Assigned all owner-* roles.'),
        ('athyper', 'ATHYPER-ADMIN', 'Athyper Group Administrator', 'Administrative access for Athyper Group. Assigned all admin-* roles.')
    ) AS v(tenant_code, grp_code, grp_name, grp_desc)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[001_demo_rbac] Step 1 complete — 2 tenant-level groups created';

    -- ── Step 2: Create CC-level OWNER + ADMIN groups for athyper (17 × 2) ───

    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    )
    SELECT
        (SELECT id FROM master.tenant WHERE code = 'athyper' AND realm_key = 'athyper'),
        v.grp_code, v.grp_name, v.grp_desc,
        true, false, v_su
    FROM (VALUES
        ('ACFB-OWNER', 'ACFB Owner',                  'Full operational control for ACFB (Athyper Canada Food & Bev).'),
        ('ACFB-ADMIN', 'ACFB Administrator',           'Administrative access for ACFB (Athyper Canada Food & Bev).'),
        ('ADPM-OWNER', 'ADPM Owner',                  'Full operational control for ADPM (Athyper Germany Pharma).'),
        ('ADPM-ADMIN', 'ADPM Administrator',           'Administrative access for ADPM (Athyper Germany Pharma).'),
        ('AITM-OWNER', 'AITM Owner',                  'Full operational control for AITM (Athyper India Textile).'),
        ('AITM-ADMIN', 'AITM Administrator',           'Administrative access for AITM (Athyper India Textile).'),
        ('AJED-OWNER', 'AJED Owner',                  'Full operational control for AJED (Athyper Japan Education).'),
        ('AJED-ADMIN', 'AJED Administrator',           'Administrative access for AJED (Athyper Japan Education).'),
        ('AMRE-OWNER', 'AMRE Owner',                  'Full operational control for AMRE (Athyper Malaysia Real Estate).'),
        ('AMRE-ADMIN', 'AMRE Administrator',           'Administrative access for AMRE (Athyper Malaysia Real Estate).'),
        ('APHS-OWNER', 'APHS Owner',                  'Full operational control for APHS (Athyper Philippines Hospital).'),
        ('APHS-ADMIN', 'APHS Administrator',           'Administrative access for APHS (Athyper Philippines Hospital).'),
        ('AQTS-OWNER', 'AQTS Owner',                  'Full operational control for AQTS (Athyper Qatar Transport).'),
        ('AQTS-ADMIN', 'AQTS Administrator',           'Administrative access for AQTS (Athyper Qatar Transport).'),
        ('AQTU-OWNER', 'AQTU Owner',                  'Full operational control for AQTU (Athyper Qatar Utilities).'),
        ('AQTU-ADMIN', 'AQTU Administrator',           'Administrative access for AQTU (Athyper Qatar Utilities).'),
        ('ASAC-OWNER', 'ASAC Owner',                  'Full operational control for ASAC (Athyper Saudi Construction).'),
        ('ASAC-ADMIN', 'ASAC Administrator',           'Administrative access for ASAC (Athyper Saudi Construction).'),
        ('ASAH-OWNER', 'ASAH Owner',                  'Full operational control for ASAH (Athyper Saudi Hospitality).'),
        ('ASAH-ADMIN', 'ASAH Administrator',           'Administrative access for ASAH (Athyper Saudi Hospitality).'),
        ('ASGF-OWNER', 'ASGF Owner',                  'Full operational control for ASGF (Athyper Singapore Financial).'),
        ('ASGF-ADMIN', 'ASGF Administrator',           'Administrative access for ASGF (Athyper Singapore Financial).'),
        ('ASPE-OWNER', 'ASPE Owner',                  'Full operational control for ASPE (Athyper SA Petroleum).'),
        ('ASPE-ADMIN', 'ASPE Administrator',           'Administrative access for ASPE (Athyper SA Petroleum).'),
        ('ATEM-OWNER', 'ATEM Owner',                  'Full operational control for ATEM (Athyper Taiwan Electronics).'),
        ('ATEM-ADMIN', 'ATEM Administrator',           'Administrative access for ATEM (Athyper Taiwan Electronics).'),
        ('ATHQ-OWNER', 'ATHQ Owner',                  'Full operational control for ATHQ (Athyper Group Holdings).'),
        ('ATHQ-ADMIN', 'ATHQ Administrator',           'Administrative access for ATHQ (Athyper Group Holdings).'),
        ('AUET-OWNER', 'AUET Owner',                  'Full operational control for AUET (Athyper UAE Trading).'),
        ('AUET-ADMIN', 'AUET Administrator',           'Administrative access for AUET (Athyper UAE Trading).'),
        ('AUIC-OWNER', 'AUIC Owner',                  'Full operational control for AUIC (Athyper US InfoComm).'),
        ('AUIC-ADMIN', 'AUIC Administrator',           'Administrative access for AUIC (Athyper US InfoComm).'),
        ('AUKA-OWNER', 'AUKA Owner',                  'Full operational control for AUKA (Athyper UK Agriculture).'),
        ('AUKA-ADMIN', 'AUKA Administrator',           'Administrative access for AUKA (Athyper UK Agriculture).')
    ) AS v(grp_code, grp_name, grp_desc)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[001_demo_rbac] Step 2 complete — 34 CC-level groups created for athyper';

    -- ── Step 3: Assign owner-* roles to all OWNER groups ─────────────────────
    --
    -- 3a: Tenant-level OWNER groups — visibility_scope='all', assignment_scope_type='tenant'
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id, visibility_scope, assignment_scope_type, created_by
    )
    SELECT
        pg.tenant_id, pg.id AS group_id, r.id AS role_id,
        'all' AS visibility_scope, 'tenant' AS assignment_scope_type, v_su
    FROM master.auth_group pg
    JOIN master.tenant t ON t.id = pg.tenant_id
    CROSS JOIN shared.role r
    WHERE pg.code LIKE '%-OWNER'
      AND pg.code NOT IN (
          'ACFB-OWNER','ADPM-OWNER','AITM-OWNER','AJED-OWNER','AMRE-OWNER',
          'APHS-OWNER','AQTS-OWNER','AQTU-OWNER','ASAC-OWNER','ASAH-OWNER',
          'ASGF-OWNER','ASPE-OWNER','ATEM-OWNER','ATHQ-OWNER','AUET-OWNER',
          'AUIC-OWNER','AUKA-OWNER'
      )
      AND r.code LIKE 'owner-%'
      AND t.code <> 'system'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[001_demo_rbac] Step 3a complete — owner-* roles → tenant-level OWNER groups (visibility_scope=all, type=tenant)';

    -- 3b: CC-level OWNER groups — visibility_scope='all', assignment_scope_type='company_code'
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        created_by
    )
    SELECT
        pg.tenant_id, pg.id, r.id,
        'all' AS visibility_scope,
        'company_code' AS assignment_scope_type,
        cc.id AS assignment_scope_ref_id,
        v_su
    FROM master.auth_group pg
    JOIN master.tenant t ON t.id = pg.tenant_id AND t.code = 'athyper'
    -- resolve CC code from group code: 'ATHQ-OWNER' → 'ATHQ'
    JOIN master.company_code cc
        ON cc.tenant_id = t.id
       AND cc.code = split_part(pg.code, '-OWNER', 1)
    CROSS JOIN shared.role r
    WHERE pg.code IN (
        'ACFB-OWNER','ADPM-OWNER','AITM-OWNER','AJED-OWNER','AMRE-OWNER',
        'APHS-OWNER','AQTS-OWNER','AQTU-OWNER','ASAC-OWNER','ASAH-OWNER',
        'ASGF-OWNER','ASPE-OWNER','ATEM-OWNER','ATHQ-OWNER','AUET-OWNER',
        'AUIC-OWNER','AUKA-OWNER'
    )
      AND r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[001_demo_rbac] Step 3b complete — owner-* roles → CC-level OWNER groups (visibility_scope=all, type=company_code)';

    -- ── Step 4: Assign admin-* roles to all ADMIN groups ─────────────────────
    --
    -- 4a: Tenant-level ADMIN groups — visibility_scope='all', assignment_scope_type='tenant'
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id, visibility_scope, assignment_scope_type, created_by
    )
    SELECT
        pg.tenant_id, pg.id, r.id, 'all', 'tenant', v_su
    FROM master.auth_group pg
    JOIN master.tenant t ON t.id = pg.tenant_id
    CROSS JOIN shared.role r
    WHERE pg.code LIKE '%-ADMIN'
      AND pg.code NOT IN (
          'ACFB-ADMIN','ADPM-ADMIN','AITM-ADMIN','AJED-ADMIN','AMRE-ADMIN',
          'APHS-ADMIN','AQTS-ADMIN','AQTU-ADMIN','ASAC-ADMIN','ASAH-ADMIN',
          'ASGF-ADMIN','ASPE-ADMIN','ATEM-ADMIN','ATHQ-ADMIN','AUET-ADMIN',
          'AUIC-ADMIN','AUKA-ADMIN'
      )
      AND r.code LIKE 'admin-%'
      AND t.code <> 'system'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[001_demo_rbac] Step 4a complete — admin-* roles → tenant-level ADMIN groups (visibility_scope=all, type=tenant)';

    -- 4b: CC-level ADMIN groups — visibility_scope='all', assignment_scope_type='company_code'
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        created_by
    )
    SELECT
        pg.tenant_id, pg.id, r.id,
        'all' AS visibility_scope,
        'company_code' AS assignment_scope_type,
        cc.id AS assignment_scope_ref_id,
        v_su
    FROM master.auth_group pg
    JOIN master.tenant t ON t.id = pg.tenant_id AND t.code = 'athyper'
    JOIN master.company_code cc
        ON cc.tenant_id = t.id
       AND cc.code = split_part(pg.code, '-ADMIN', 1)
    CROSS JOIN shared.role r
    WHERE pg.code IN (
        'ACFB-ADMIN','ADPM-ADMIN','AITM-ADMIN','AJED-ADMIN','AMRE-ADMIN',
        'APHS-ADMIN','AQTS-ADMIN','AQTU-ADMIN','ASAC-ADMIN','ASAH-ADMIN',
        'ASGF-ADMIN','ASPE-ADMIN','ATEM-ADMIN','ATHQ-ADMIN','AUET-ADMIN',
        'AUIC-ADMIN','AUKA-ADMIN'
    )
      AND r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    RAISE NOTICE '[001_demo_rbac] Step 4b complete — admin-* roles → CC-level ADMIN groups (visibility_scope=all, type=company_code)';

END $rbac$;

-- ── Verification ──────────────────────────────────────────────────────────────
DO $verify$
DECLARE
    v_groups   int;
    v_agr_owner int;
    v_agr_admin int;
BEGIN
    SELECT count(*) INTO v_groups  FROM master.auth_group;
    SELECT count(*) INTO v_agr_owner FROM master.auth_group_role gr
        JOIN master.auth_group pg ON pg.id = gr.group_id WHERE pg.code LIKE '%-OWNER';
    SELECT count(*) INTO v_agr_admin FROM master.auth_group_role gr
        JOIN master.auth_group pg ON pg.id = gr.group_id WHERE pg.code LIKE '%-ADMIN';

    RAISE NOTICE '[001_demo_rbac] Verification:';
    RAISE NOTICE '  Total groups:              %   (expected 36)', v_groups;
    RAISE NOTICE '  OWNER group role links:    %', v_agr_owner;
    RAISE NOTICE '  ADMIN group role links:    %', v_agr_admin;
END $verify$;
