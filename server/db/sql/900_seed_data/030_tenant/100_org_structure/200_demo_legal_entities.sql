-- ============================================================================
-- DEMO & PARTNER TENANTS — LEGAL ENTITIES & COMPANY CODES
-- ============================================================================
-- File:     200_demo_legal_entities.sql
-- Schemas:  master.legal_entity, master.company_code
-- Purpose:  One standalone legal entity + one company code per demo/partner
--           tenant (13 total).  Each entity is a self-contained root (no
--           parent_entity_id) because it is the sole entity of its tenant.
-- Depends:  002_demo_tenants.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO NOTHING
-- Stable IDs:
--   Legal entities : dd000001-… dd000013-0000-0000-0000-000000000001
--   Company codes  : ee000001-… ee000013-0000-0000-0000-000000000001
-- ============================================================================

DO $demo_le$
DECLARE
    v_su   uuid  := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '200_demo_le', 'version', '1.0.0', 'seeded_at', now()::text
    ));
BEGIN

    -- ── Legal Entities (13) ──────────────────────────────────────────────────
    -- Each demo/partner tenant has exactly one root legal entity (entity_type='parent').
    -- country_code / functional_currency / regulatory_framework follow local standards.

    INSERT INTO master.legal_entity (
        id, tenant_id,
        code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct,
        regulatory_framework, metadata, status, created_by
    ) VALUES

    -- ── Demo tenants (9) ────────────────────────────────────────────────────
    ('dd000001-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_ca'),
     'DEMOCA', 'Demo Canada Corporation',         'Demo Canada standalone entity',
     'CA', 'CAD', 'CAD', 'parent', NULL, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    ('dd000002-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_ch'),
     'DEMOCH', 'Demo Swiss AG',                   'Demo Switzerland standalone entity',
     'CH', 'CHF', 'CHF', 'parent', NULL, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    ('dd000003-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_de'),
     'DEMODE', 'Demo Germany GmbH',               'Demo Germany standalone entity',
     'DE', 'EUR', 'EUR', 'parent', NULL, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    ('dd000004-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_fr'),
     'DEMOFR', 'Demo France SAS',                 'Demo France standalone entity',
     'FR', 'EUR', 'EUR', 'parent', NULL, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    ('dd000005-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_in'),
     'DEMOIN', 'Demo India Private Limited',       'Demo India standalone entity',
     'IN', 'INR', 'INR', 'parent', NULL, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    ('dd000006-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_my'),
     'DEMOMY', 'Demo Malaysia Sdn Bhd',            'Demo Malaysia standalone entity',
     'MY', 'MYR', 'MYR', 'parent', NULL, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    ('dd000007-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_qa'),
     'DEMOQA', 'Demo Qatar WLL',                   'Demo Qatar standalone entity',
     'QA', 'QAR', 'QAR', 'parent', NULL, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    ('dd000008-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_sa'),
     'DEMOSA', 'Demo Saudi Arabia LLC',            'Demo Saudi Arabia standalone entity',
     'SA', 'SAR', 'SAR', 'parent', NULL, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    ('dd000009-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_us'),
     'DEMOUS', 'Demo USA Inc',                     'Demo United States standalone entity',
     'US', 'USD', 'USD', 'parent', NULL, 'full', 100.00, 'us_gaap',
     v_meta, 'active', v_su),

    -- ── Athyper master tenant (1) ────────────────────────────────────────────
    -- KC org athyper--athq maps to tenant code 'athyper' with entity ATHQ.
    -- A matching legal entity + company_code row is required for session resolution.
    ('dd000014-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
     'ATHQ',  'Athyper Group Holdings',             'Athyper master holding entity',
     'AE', 'AED', 'USD', 'parent', NULL, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- ── Named tenants (4) ───────────────────────────────────────────────────
    ('dd000010-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper-hq1'),
     'ATHQ',  'Athyper HQ Unit 1',                 'Athyper HQ 1 standalone entity',
     'MY', 'MYR', 'MYR', 'parent', NULL, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    ('dd000011-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'pepsi'),
     'PEPSI', 'Pepsi Corporation',                 'Pepsi standalone entity',
     'US', 'USD', 'USD', 'parent', NULL, 'full', 100.00, 'us_gaap',
     v_meta, 'active', v_su),

    ('dd000012-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'coke'),
     'COKE',  'Coca-Cola Corporation',             'Coke standalone entity',
     'US', 'USD', 'USD', 'parent', NULL, 'full', 100.00, 'us_gaap',
     v_meta, 'active', v_su),

    ('dd000013-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'maaza'),
     'MAAZA', 'Maaza Beverages India',             'Maaza standalone entity',
     'IN', 'INR', 'INR', 'parent', NULL, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ── Company Codes (13) ───────────────────────────────────────────────────
    -- One posting company per tenant; references the legal entity above by stable UUID.
    -- fiscal_year_start_month: India = 4 (April), all others = 1 (January).
    -- is_intercompany_enabled = true — demo transactions may span entities.

    INSERT INTO master.company_code (
        id, tenant_id,
        code, name, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant,
        regulatory_framework, is_intercompany_enabled,
        metadata, status, created_by
    ) VALUES

    -- ── Demo tenants (9) ────────────────────────────────────────────────────
    ('ee000001-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_ca'),
     'DEMOCA', 'Demo Canada',
     'dd000001-0000-0000-0000-000000000001',
     'CAD', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000002-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_ch'),
     'DEMOCH', 'Demo Switzerland',
     'dd000002-0000-0000-0000-000000000001',
     'CHF', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000003-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_de'),
     'DEMODE', 'Demo Germany',
     'dd000003-0000-0000-0000-000000000001',
     'EUR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000004-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_fr'),
     'DEMOFR', 'Demo France',
     'dd000004-0000-0000-0000-000000000001',
     'EUR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000005-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_in'),
     'DEMOIN', 'Demo India',
     'dd000005-0000-0000-0000-000000000001',
     'INR', 4, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000006-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_my'),
     'DEMOMY', 'Demo Malaysia',
     'dd000006-0000-0000-0000-000000000001',
     'MYR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000007-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_qa'),
     'DEMOQA', 'Demo Qatar',
     'dd000007-0000-0000-0000-000000000001',
     'QAR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000008-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_sa'),
     'DEMOSA', 'Demo Saudi Arabia',
     'dd000008-0000-0000-0000-000000000001',
     'SAR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000009-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'demo_us'),
     'DEMOUS', 'Demo United States',
     'dd000009-0000-0000-0000-000000000001',
     'USD', 1, 'calendar', 'us_gaap',    true, v_meta, 'active', v_su),

    -- ── Athyper master tenant (1) ────────────────────────────────────────────
    ('ee000014-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
     'ATHQ',  'Athyper Group Holdings',
     'dd000014-0000-0000-0000-000000000001',
     'AED', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    -- ── Named tenants (4) ───────────────────────────────────────────────────
    ('ee000010-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper-hq1'),
     'ATHQ',  'Athyper HQ Unit 1',
     'dd000010-0000-0000-0000-000000000001',
     'MYR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000011-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'pepsi'),
     'PEPSI', 'Pepsi Corporation',
     'dd000011-0000-0000-0000-000000000001',
     'USD', 1, 'calendar', 'us_gaap',    true, v_meta, 'active', v_su),

    ('ee000012-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'coke'),
     'COKE',  'Coca-Cola Corporation',
     'dd000012-0000-0000-0000-000000000001',
     'USD', 1, 'calendar', 'us_gaap',    true, v_meta, 'active', v_su),

    ('ee000013-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'maaza'),
     'MAAZA', 'Maaza Beverages India',
     'dd000013-0000-0000-0000-000000000001',
     'INR', 4, 'calendar', 'local_gaap', true, v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[200_demo_legal_entities] 14 legal entities + 14 company codes seeded';

END $demo_le$;
