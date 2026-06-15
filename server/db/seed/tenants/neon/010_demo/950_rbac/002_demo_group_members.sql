-- ============================================================================
-- PRINCIPAL GROUP MEMBERS — OWNER & ADMIN ASSIGNMENTS
-- ============================================================================
-- File:    002_demo_auth_group_members.sql
-- Schema:  master
-- Tables:  auth_group_member
--
-- ── Design ──────────────────────────────────────────────────────────────────
--
-- Two tiers of membership:
--
-- Tier 1 — Principal system users (34 users from 003_principal_users.sql):
--   Each *.owner user → their tenant/CC OWNER group
--   Each *.admin user → their tenant/CC ADMIN group
--
-- Tier 2 — Demo users (17 users from 001_demo_principals.sql):
--   persona=owner/manager → athyper ATHYPER-OWNER group (tenant-level)
--   persona=admin/agent/etc → athyper ATHYPER-ADMIN group (tenant-level)
--
-- Idempotent: TRUNCATE auth_group_member then ON CONFLICT DO NOTHING.
-- ============================================================================
 
DO $members$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_athyper   uuid;
BEGIN
    SELECT id INTO v_athyper
    FROM master.tenant WHERE code = 'athyper' AND realm_key = 'athyper';
 
    -- ── Step 0: Clear existing auth_group_member rows ─────────────────────────────
    TRUNCATE master.auth_group_member CASCADE;
    RAISE NOTICE '[002_demo_auth_group_members] Cleared auth_group_member';
 
    -- ── Step 1: Assign principal system users (tenant-level, 2 users) ────────
    --
    -- *.owner  → <TENANT_CODE_UPPER>-OWNER group in their tenant
    -- *.admin  → <TENANT_CODE_UPPER>-ADMIN group in their tenant
    --
    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        pg.id,
        now(), v_su, v_su
    FROM master.principal p
    JOIN master.tenant t ON t.id = p.tenant_id
    JOIN master.auth_group pg ON pg.tenant_id = p.tenant_id
        AND pg.code = upper(replace(t.code, '-', '_'))
                      || CASE WHEN lower(p.code) LIKE '%.owner' THEN '-OWNER' ELSE '-ADMIN' END
    WHERE p.id IN (
        'bb001000-0000-0000-0000-000000000001'::uuid,
        'bb001000-0000-0000-0000-000000000002'::uuid
    )
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[002_demo_auth_group_members] Step 1 complete — 2 tenant-level principal users assigned';
 
    -- ── Step 2: Assign CC-level principals (athyper, 32 users) ───────────────
    --
    -- <cc>.owner → <CC>-OWNER group
    -- <cc>.admin → <CC>-ADMIN group
    --
    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        pg.id,
        now(), v_su, v_su
    FROM master.principal p
    JOIN master.auth_group pg ON pg.tenant_id = p.tenant_id
        AND pg.code = upper(split_part(p.code, '.', 1))
                      || CASE WHEN lower(p.code) LIKE '%.owner' THEN '-OWNER' ELSE '-ADMIN' END
    WHERE p.id IN (
        'bb002000-0000-0000-0000-000000000001'::uuid,
        'bb002000-0000-0000-0000-000000000002'::uuid,
        'bb002000-0000-0000-0000-000000000003'::uuid,
        'bb002000-0000-0000-0000-000000000004'::uuid,
        'bb002000-0000-0000-0000-000000000005'::uuid,
        'bb002000-0000-0000-0000-000000000006'::uuid,
        'bb002000-0000-0000-0000-000000000007'::uuid,
        'bb002000-0000-0000-0000-000000000008'::uuid,
        'bb002000-0000-0000-0000-000000000009'::uuid,
        'bb002000-0000-0000-0000-00000000000a'::uuid,
        'bb002000-0000-0000-0000-00000000000b'::uuid,
        'bb002000-0000-0000-0000-00000000000c'::uuid,
        'bb002000-0000-0000-0000-00000000000d'::uuid,
        'bb002000-0000-0000-0000-00000000000e'::uuid,
        'bb002000-0000-0000-0000-00000000000f'::uuid,
        'bb002000-0000-0000-0000-000000000010'::uuid,
        'bb002000-0000-0000-0000-000000000011'::uuid,
        'bb002000-0000-0000-0000-000000000012'::uuid,
        'bb002000-0000-0000-0000-000000000013'::uuid,
        'bb002000-0000-0000-0000-000000000014'::uuid,
        'bb002000-0000-0000-0000-000000000015'::uuid,
        'bb002000-0000-0000-0000-000000000016'::uuid,
        'bb002000-0000-0000-0000-000000000017'::uuid,
        'bb002000-0000-0000-0000-000000000018'::uuid,
        'bb002000-0000-0000-0000-000000000019'::uuid,
        'bb002000-0000-0000-0000-00000000001a'::uuid,
        'bb002000-0000-0000-0000-00000000001d'::uuid,
        'bb002000-0000-0000-0000-00000000001e'::uuid,
        'bb002000-0000-0000-0000-00000000001f'::uuid,
        'bb002000-0000-0000-0000-000000000020'::uuid,
        'bb002000-0000-0000-0000-000000000021'::uuid,
        'bb002000-0000-0000-0000-000000000022'::uuid
    )
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;
 
    RAISE NOTICE '[002_demo_auth_group_members] Step 2 complete — 32 CC-level principals assigned';
 
    -- ── Step 3: Assign demo users to correct scope groups ────────────────────
    --
    -- Scope rules derived from KC org memberships:
    --   Tenant-wide scope (scope='all'):
    --     athq.admin, athq.owner, athq.cfo → ATHYPER-ADMIN / ATHYPER-OWNER
    --   CC-level scope (scope='ou_l1'):
    --     athq.* (non-admin/owner)    → ATHQ-ADMIN
    --     aqtu.manager, karim.dual,
    --     partner.*                   → AQTU-ADMIN
    --     asac.manager                → ASAC-ADMIN
    --     auic.manager                → AUIC-ADMIN
    --     asgf.manager                → ASGF-ADMIN
    --
    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT
        v_athyper,
        p.id,
        pg.id,
        now(), v_su, v_su
    FROM (VALUES
        -- principal_code        , group_code
        ('athq.admin',            'ATHYPER-ADMIN'),
        ('athq.owner',            'ATHYPER-OWNER'),
        ('athq.cfo',              'ATHYPER-ADMIN'),
        ('athq.manager',          'ATHQ-ADMIN'),
        ('athq.agent',            'ATHQ-ADMIN'),
        ('athq.viewer',           'ATHQ-ADMIN'),
        ('athq.reporter',         'ATHQ-ADMIN'),
        ('athq.requester',        'ATHQ-ADMIN'),
        -- extra athq persona users (aa000001-* series)
        ('kumar',                 'ATHQ-ADMIN'),
        ('raja',                  'ATHQ-ADMIN'),
        ('rama',                  'ATHQ-ADMIN'),
        ('laks',                  'ATHQ-OWNER'),
        ('aqtu.manager',          'AQTU-ADMIN'),
        ('asac.manager',          'ASAC-ADMIN'),
        ('auic.manager',          'AUIC-ADMIN'),
        ('asgf.manager',          'ASGF-ADMIN'),
        ('karim.dual',            'AQTU-ADMIN'),
        ('partner.viewer',        'AQTU-ADMIN'),
        ('partner.agent',         'AQTU-ADMIN'),
        ('partner.manager',       'AQTU-ADMIN'),
        ('partner.owner',         'AQTU-ADMIN')
    ) AS v(principal_code, group_code)
    JOIN master.principal p
        ON p.tenant_id = v_athyper AND p.code = v.principal_code
    JOIN master.auth_group pg
        ON pg.tenant_id = v_athyper AND pg.code = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;
 
    RAISE NOTICE '[002_demo_auth_group_members] Step 3 complete — demo users assigned to correct scope groups';
 
    RAISE NOTICE '[002_demo_auth_group_members] Complete';
 
END $members$;
 
-- ── Verification ──────────────────────────────────────────────────────────────
SELECT
    t.code                   AS tenant,
    pg.code                  AS "group",
    count(gm.principal_id)   AS member_count
FROM master.auth_group_member gm
JOIN master.auth_group pg ON pg.id = gm.group_id
JOIN master.tenant t           ON t.id  = gm.tenant_id
WHERE t.code <> 'system'
GROUP BY t.code, pg.code
ORDER BY t.code, pg.code;
