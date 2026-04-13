-- ============================================================================
-- PRINCIPAL GROUP MEMBERS — OWNER & ADMIN ASSIGNMENTS
-- ============================================================================
-- File:    002_demo_group_members.sql
-- Schema:  master
-- Tables:  group_member
--
-- ── Design ──────────────────────────────────────────────────────────────────
--
-- Two tiers of membership:
--
-- Tier 1 — Principal system users (62 users from 003_principal_users.sql):
--   Each *.OWNER user → their tenant/CC OWNER group
--   Each *.ADMIN user → their tenant/CC ADMIN group
--
-- Tier 2 — Demo users (17 users from 001_demo_principals.sql):
--   persona=owner/manager → athyper ATHYPER-OWNER group (tenant-level)
--   persona=admin/agent/etc → athyper ATHYPER-ADMIN group (tenant-level)
--
-- Idempotent: TRUNCATE group_member then ON CONFLICT DO NOTHING.
-- ============================================================================
 
DO $members$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_athyper   uuid;
BEGIN
    SELECT id INTO v_athyper
    FROM master.tenant WHERE code = 'athyper' AND realm_key = 'athyper';
 
    -- ── Step 0: Clear existing group_member rows ─────────────────────────────
    TRUNCATE master.group_member CASCADE;
    RAISE NOTICE '[002_demo_group_members] Cleared group_member';
 
    -- ── Step 1: Assign principal system users (tenant-level, 28 users) ───────
    --
    -- *.OWNER  → <TENANT_CODE_UPPER>-OWNER group in their tenant
    -- *.ADMIN  → <TENANT_CODE_UPPER>-ADMIN group in their tenant
    --
    INSERT INTO master.group_member (
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
    JOIN master.principal_group pg ON pg.tenant_id = p.tenant_id
        AND pg.code = upper(replace(t.code, '-', '_'))
                      || CASE WHEN p.code LIKE '%.OWNER' THEN '-OWNER' ELSE '-ADMIN' END
    WHERE p.id IN (
        'bb001000-0000-0000-0000-000000000001'::uuid,
        'bb001000-0000-0000-0000-000000000002'::uuid,
        'bb001000-0000-0000-0000-000000000003'::uuid,
        'bb001000-0000-0000-0000-000000000004'::uuid,
        'bb001000-0000-0000-0000-000000000005'::uuid,
        'bb001000-0000-0000-0000-000000000006'::uuid,
        'bb001000-0000-0000-0000-000000000007'::uuid,
        'bb001000-0000-0000-0000-000000000008'::uuid,
        'bb001000-0000-0000-0000-000000000009'::uuid,
        'bb001000-0000-0000-0000-00000000000a'::uuid,
        'bb001000-0000-0000-0000-00000000000b'::uuid,
        'bb001000-0000-0000-0000-00000000000c'::uuid,
        'bb001000-0000-0000-0000-00000000000d'::uuid,
        'bb001000-0000-0000-0000-00000000000e'::uuid,
        'bb001000-0000-0000-0000-00000000000f'::uuid,
        'bb001000-0000-0000-0000-000000000010'::uuid,
        'bb001000-0000-0000-0000-000000000011'::uuid,
        'bb001000-0000-0000-0000-000000000012'::uuid,
        'bb001000-0000-0000-0000-000000000013'::uuid,
        'bb001000-0000-0000-0000-000000000014'::uuid,
        'bb001000-0000-0000-0000-000000000015'::uuid,
        'bb001000-0000-0000-0000-000000000016'::uuid,
        'bb001000-0000-0000-0000-000000000017'::uuid,
        'bb001000-0000-0000-0000-000000000018'::uuid,
        'bb001000-0000-0000-0000-000000000019'::uuid,
        'bb001000-0000-0000-0000-00000000001a'::uuid,
        'bb001000-0000-0000-0000-00000000001b'::uuid,
        'bb001000-0000-0000-0000-00000000001c'::uuid
    )
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;
 
    RAISE NOTICE '[002_demo_group_members] Step 1 complete — 28 tenant-level principal users assigned';
 
    -- ── Step 2: Assign CC-level principals (athyper, 34 users) ───────────────
    --
    -- <CC>.OWNER → <CC>-OWNER group
    -- <CC>.ADMIN → <CC>-ADMIN group
    --
    INSERT INTO master.group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        pg.id,
        now(), v_su, v_su
    FROM master.principal p
    JOIN master.principal_group pg ON pg.tenant_id = p.tenant_id
        AND pg.code = split_part(p.code, '.', 1)
                      || CASE WHEN p.code LIKE '%.OWNER' THEN '-OWNER' ELSE '-ADMIN' END
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
        'bb002000-0000-0000-0000-00000000001b'::uuid,
        'bb002000-0000-0000-0000-00000000001c'::uuid,
        'bb002000-0000-0000-0000-00000000001d'::uuid,
        'bb002000-0000-0000-0000-00000000001e'::uuid,
        'bb002000-0000-0000-0000-00000000001f'::uuid,
        'bb002000-0000-0000-0000-000000000020'::uuid,
        'bb002000-0000-0000-0000-000000000021'::uuid,
        'bb002000-0000-0000-0000-000000000022'::uuid
    )
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;
 
    RAISE NOTICE '[002_demo_group_members] Step 2 complete — 34 CC-level principals assigned';
 
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
    INSERT INTO master.group_member (
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
    JOIN master.principal_group pg
        ON pg.tenant_id = v_athyper AND pg.code = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;
 
    RAISE NOTICE '[002_demo_group_members] Step 3 complete — demo users assigned to correct scope groups';
 
    -- ── Step 4: Assign named/demo tenant persona users to their ADMIN groups ────
    --
    -- One persona user per tenant (from 005_named_tenant_principals.sql).
    -- Each is assigned to the ADMIN group of their own tenant.
    --
    INSERT INTO master.group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        pg.id,
        now(), v_su, v_su
    FROM (VALUES
        -- (tenant_code,     principal_code,    group_code)
        ('athyper-hq1', 'siti.aminah',    'ATHYPER_HQ1-ADMIN'),
        ('pepsi',       'michael.torres', 'PEPSI-ADMIN'),
        ('coke',        'sarah.johnson',  'COKE-ADMIN'),
        ('maaza',       'rahul.gupta',    'MAAZA-ADMIN'),
        ('demo_ca',     'david.chen',     'DEMO_CA-ADMIN'),
        ('demo_ch',     'sophie.mueller', 'DEMO_CH-ADMIN'),
        ('demo_de',     'hans.weber',     'DEMO_DE-ADMIN'),
        ('demo_fr',     'pierre.dupont',  'DEMO_FR-ADMIN'),
        ('demo_in',     'priya.sharma',   'DEMO_IN-ADMIN'),
        ('demo_my',     'ahmad.razak',    'DEMO_MY-ADMIN'),
        ('demo_qa',     'khalid.althani', 'DEMO_QA-ADMIN'),
        ('demo_sa',     'omar.hassan',    'DEMO_SA-ADMIN'),
        ('demo_us',     'jennifer.smith', 'DEMO_US-ADMIN')
    ) AS v(tenant_code, principal_code, group_code)
    JOIN master.tenant t
        ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    JOIN master.principal p
        ON p.tenant_id = t.id AND p.code = v.principal_code
    JOIN master.principal_group pg
        ON pg.tenant_id = t.id AND pg.code = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;
 
    RAISE NOTICE '[002_demo_group_members] Step 4 complete — 13 named/demo tenant persona users assigned';
    RAISE NOTICE '[002_demo_group_members] Complete';
 
END $members$;
 
-- ── Verification ──────────────────────────────────────────────────────────────
SELECT
    t.code                   AS tenant,
    pg.code                  AS "group",
    count(gm.principal_id)   AS member_count
FROM master.group_member gm
JOIN master.principal_group pg ON pg.id = gm.group_id
JOIN master.tenant t           ON t.id  = gm.tenant_id
WHERE t.code <> 'system'
GROUP BY t.code, pg.code
ORDER BY t.code, pg.code;