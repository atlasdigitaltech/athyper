-- ============================================================================
-- DEMO & PARTNER TENANTS — SEED
-- ============================================================================
-- File:     002_demo_tenants.sql
-- Schema:   master.tenant
-- Purpose:  Seed 13 additional tenants that share the 'athyper' KC realm:
--             9  demo tenants  (demo_ca … demo_us)
--             4  named tenants (athyper-hq1, pepsi, coke, maaza)
-- Depends:  000_athyper_tenant.sql (system principal, athyper tenant)
-- Idempotent: Yes — ON CONFLICT (realm_key, code) DO NOTHING
-- KC org aliases: {tenant_code}--{entity_code_lowercase}  e.g. athyper--athq, demo_ca--democa
-- The session service receives entity_code lowercase and calls .toUpperCase() before the DB lookup.
-- ============================================================================

DO $demo_tenants$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ── Demo tenants ────────────────────────────────────────────────────────
    INSERT INTO master.tenant (id, code, name, display_name, realm_key, region, subscription, status, created_by)
    VALUES
      ('cc000001-0000-0000-0000-000000000001', 'demo_ca',      'Demo Canada',       'Demo Canada Corporation',      'athyper', 'NA',  'starter',     'active', v_su),
      ('cc000002-0000-0000-0000-000000000001', 'demo_ch',      'Demo Switzerland',  'Demo Swiss AG',                'athyper', 'EU',  'starter',     'active', v_su),
      ('cc000003-0000-0000-0000-000000000001', 'demo_de',      'Demo Germany',      'Demo Germany GmbH',            'athyper', 'EU',  'starter',     'active', v_su),
      ('cc000004-0000-0000-0000-000000000001', 'demo_fr',      'Demo France',       'Demo France SAS',              'athyper', 'EU',  'starter',     'active', v_su),
      ('cc000005-0000-0000-0000-000000000001', 'demo_in',      'Demo India',        'Demo India Private Limited',   'athyper', 'APAC','starter',     'active', v_su),
      ('cc000006-0000-0000-0000-000000000001', 'demo_my',      'Demo Malaysia',     'Demo Malaysia Sdn Bhd',        'athyper', 'APAC','starter',     'active', v_su),
      ('cc000007-0000-0000-0000-000000000001', 'demo_qa',      'Demo Qatar',        'Demo Qatar WLL',               'athyper', 'GCC', 'starter',     'active', v_su),
      ('cc000008-0000-0000-0000-000000000001', 'demo_sa',      'Demo Saudi Arabia', 'Demo Saudi Arabia LLC',        'athyper', 'GCC', 'starter',     'active', v_su),
      ('cc000009-0000-0000-0000-000000000001', 'demo_us',      'Demo United States','Demo USA Inc',                 'athyper', 'NA',  'starter',     'active', v_su),
    -- ── Named tenants ────────────────────────────────────────────────────────
      ('cc000010-0000-0000-0000-000000000001', 'athyper-hq1',  'Athyper HQ 1',      'Athyper HQ Unit 1',            'athyper', 'GCC', 'professional','active', v_su),
      ('cc000011-0000-0000-0000-000000000001', 'pepsi',        'Pepsi',             'Pepsi Corporation',            'athyper', 'NA',  'professional','active', v_su),
      ('cc000012-0000-0000-0000-000000000001', 'coke',         'Coke',              'Coca-Cola Corporation',        'athyper', 'NA',  'professional','active', v_su),
      ('cc000013-0000-0000-0000-000000000001', 'maaza',        'Maaza',             'Maaza Beverages India',        'athyper', 'APAC','professional','active', v_su)
    ON CONFLICT (realm_key, code) DO NOTHING;

    RAISE NOTICE '[002_demo_tenants] 13 additional tenants seeded';

END $demo_tenants$;
