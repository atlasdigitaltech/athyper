-- ============================================================================
-- TECHNOSTAT TEST INSTANCE — COMPLETE PHASE 4 SEED
-- ============================================================================
-- Tenant:   technosat-test
-- File:     phase4_technosat_test_complete.sql
-- Version:  1.0.0
-- ============================================================================
--
-- EXECUTION ORDER (matches Phase 4 checklist):
--   PART  1: 000_tenant         — tenant + profile
--   PART  2: 010_legal_entities — 4 LEs (hierarchical)
--   PART  3: 020_company_codes  — 4 CCs
--   PART  4: 199_gl_preseed     — GL pre-seed (retained earnings, suspense)
--   PART  5: 301_cost_centers   — recommended CC hierarchy per company
--   PART  6: 302_profit_centers — recommended PC hierarchy per company
--   PART  7: 303_sites          — Riyadh + Cairo sites
--   PART  8: 304_warehouses     — Riyadh + Cairo warehouses
--   PART  9: 310_fiscal_periods — FY2025 + FY2026 (Jan + Jul variants)
--   PART 10: 311_ledger_books   — IFRS, SOCPA, EAS books + assignments
--   PART 11: 201_chart_assign   — COA → company code assignments
--   PART 12: 320_tax_setup      — KSA VAT 15%, Egypt CIT 22.5%, Egypt VAT 14%
--   PART 13: 330_fx_rates       — SAR/EGP/USD baseline rates
--   PART 14: 340_payment_terms  — Net 30/60/90, milestone, retention
--   PART 15: 340_asset_classes  — IT-specific asset class hierarchy
--   PART 16: 004_principals     — test users (admin, finance, PM, engineer)
--   PART 17: 001_rbac           — roles + group memberships
--   PART 18: 280_validation     — assertion checks
--
-- GROUP STRUCTURE:
--   Technostat (Group)           SA · SAR · P.O. Box 305099 Riyadh 11361
--   ├── SSK Saudi                SA · SAR · P.O. Box 305099 Riyadh 11361
--   ├── Technostat Egypt         EG · EGP · 1st District, New Cairo
--   │   └── Satellites for DT    EG · EGP · 1st District, New Cairo
--
-- SITES: Riyadh (office+warehouse), Cairo (office+warehouse)
-- ============================================================================
-- All blocks are idempotent (ON CONFLICT DO UPDATE / WHERE NOT EXISTS).
-- Depends on: system bootstrap, shared.currency, shared.country, platform seeds.
-- ============================================================================


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PRE-SEED: LOOKUP EXTENSIONS                                             ║
-- ║  jul_jun is not in the base lookup set — add it here for Egypt FY        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

INSERT INTO control.lookup_value (domain_code, code, name, sort_order, created_by)
SELECT 'master.company_code_fy_variant', 'jul_jun', 'July–June', 60, '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value
    WHERE domain_code = 'master.company_code_fy_variant' AND code = 'jul_jun'
);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 1: TENANT                                                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $tenant$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    INSERT INTO master.tenant (
        code, name, display_name, realm_key, region, subscription,
        status, metadata, created_by
    ) VALUES (
        'technosat-test',
        'Technostat Group (Test)',
        'Technostat Group',
        'athyper',
        'GCC',
        'enterprise',
        'active',
        jsonb_build_object(
            '_seed', jsonb_build_object('pack', '000_tenant', 'version', '1.0.0', 'seeded_at', now()::text),
            'group', jsonb_build_object(
                'subsidiary_count', 3,
                'countries', ARRAY['SA', 'EG'],
                'industries', ARRAY['ict', 'digital_transformation', 'construction'],
                'hq', jsonb_build_object(
                    'address', 'P.O. Box 305099 Riyadh 11361',
                    'phone', '+966 11 24 555 34',
                    'email', 'contactus@technostat.net'
                )
            )
        ),
        v_su
    )
    ON CONFLICT (realm_key, code) DO UPDATE SET
        name = EXCLUDED.name, display_name = EXCLUDED.display_name,
        region = EXCLUDED.region, subscription = EXCLUDED.subscription,
        status = EXCLUDED.status,
        metadata = master.tenant.metadata || jsonb_build_object('_seed', (EXCLUDED.metadata->'_seed')),
        updated_at = now(), updated_by = v_su
    WHERE (master.tenant.name, master.tenant.status)
       IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.status);

    RAISE NOTICE '[000_tenant] technosat-test ready (id=%)',
        (SELECT id FROM master.tenant WHERE code = 'technosat-test');
END $tenant$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 2: LEGAL ENTITIES                                                  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $le$
DECLARE
    v_tid  uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '010_le'; v_meta jsonb;
    v_le_tksa uuid; v_le_tegy uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant not found'; END IF;
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', '1.0.0', 'seeded_at', now()::text));

    -- L1: Root — Technostat Group
    INSERT INTO master.legal_entity (tenant_id, code, name, description, country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct, regulatory_framework, incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-TKSA', 'Technostat Group', 'Group holding — Riyadh. P.O. Box 305099, Riyadh 11361. +966 11 24 555 34. contactus@technostat.net',
        'SA', 'SAR', 'SAR', 'parent', NULL, 'full', NULL, 'ifrs', '2015-03-15',
        v_meta || '{"entity":{"city":"Riyadh","po_box":"305099","zip":"11361","phone":"+966 11 24 555 34","email":"contactus@technostat.net"}}'::jsonb,
        'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
        metadata=master.legal_entity.metadata || jsonb_build_object('_seed',(EXCLUDED.metadata->'_seed')), updated_at=now(), updated_by=v_su;

    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id=v_tid AND code='LE-TKSA';

    -- L2: SSK Saudi
    INSERT INTO master.legal_entity (tenant_id, code, name, description, country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct, regulatory_framework, incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-SSK', 'SSK Saudi', 'Construction subsidiary — Riyadh. P.O. Box 305099, Riyadh 11361.',
        'SA', 'SAR', 'SAR', 'subsidiary', v_le_tksa, 'full', 100.00, 'local_gaap', '2017-06-01',
        v_meta || '{"entity":{"city":"Riyadh","industry":"construction"}}'::jsonb, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, parent_entity_id=EXCLUDED.parent_entity_id,
        metadata=master.legal_entity.metadata || jsonb_build_object('_seed',(EXCLUDED.metadata->'_seed')), updated_at=now(), updated_by=v_su;

    -- L2: Technostat Egypt
    INSERT INTO master.legal_entity (tenant_id, code, name, description, country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct, regulatory_framework, incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-TEGY', 'Technostat Egypt', '1st District Services Zone, 5th Compound, New Cairo, Cairo, Egypt.',
        'EG', 'EGP', 'SAR', 'subsidiary', v_le_tksa, 'full', 100.00, 'local_gaap', '2018-09-20',
        v_meta || '{"entity":{"city":"New Cairo","industry":"general_trading"}}'::jsonb, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, parent_entity_id=EXCLUDED.parent_entity_id,
        metadata=master.legal_entity.metadata || jsonb_build_object('_seed',(EXCLUDED.metadata->'_seed')), updated_at=now(), updated_by=v_su;

    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id=v_tid AND code='LE-TEGY';

    -- L3: Satellites for DT
    INSERT INTO master.legal_entity (tenant_id, code, name, description, country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id, consolidation_method, ownership_pct, regulatory_framework, incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-SDTX', 'Satellites for Digital Transformation',
        'Technology consulting — 1st District Services Zone, 5th Compound, New Cairo, Cairo, Egypt. IC service provider to group.',
        'EG', 'EGP', 'SAR', 'subsidiary', v_le_tegy, 'full', 100.00, 'ifrs', '2022-01-10',
        v_meta || '{"entity":{"city":"New Cairo","industry":"digital_transformation"}}'::jsonb, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, parent_entity_id=EXCLUDED.parent_entity_id,
        metadata=master.legal_entity.metadata || jsonb_build_object('_seed',(EXCLUDED.metadata->'_seed')), updated_at=now(), updated_by=v_su;

    -- Assertions
    IF (SELECT count(*) FROM master.legal_entity WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'=v_pack) <> 4 THEN
        RAISE EXCEPTION '[010_le] Expected 4 legal entities'; END IF;
    RAISE NOTICE '[010_le] 4 legal entities seeded with hierarchy';
END $le$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 3: COMPANY CODES                                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $cc$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '020_cc'; v_meta jsonb;
    v_le_tksa uuid; v_le_ssk uuid; v_le_tegy uuid; v_le_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', '1.0.0', 'seeded_at', now()::text));
    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id=v_tid AND code='LE-TKSA';
    SELECT id INTO v_le_ssk  FROM master.legal_entity WHERE tenant_id=v_tid AND code='LE-SSK';
    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id=v_tid AND code='LE-TEGY';
    SELECT id INTO v_le_sdtx FROM master.legal_entity WHERE tenant_id=v_tid AND code='LE-SDTX';

    -- TKSA: Group HQ (SAR, Jan-Dec, IFRS)
    INSERT INTO master.company_code (tenant_id, code, name, description, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant, regulatory_framework, is_intercompany_enabled, metadata, status, created_by)
    VALUES (v_tid, 'TKSA', 'Technostat Group HQ', 'Group HQ — consolidation, treasury, shared services.',
        v_le_tksa, 'SAR', 1, 'calendar', 'ifrs', true, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, legal_entity_id=EXCLUDED.legal_entity_id,
        updated_at=now(), updated_by=v_su;

    -- SSK1: SSK Saudi (SAR, Jan-Dec, SOCPA)
    INSERT INTO master.company_code (tenant_id, code, name, description, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant, regulatory_framework, is_intercompany_enabled, metadata, status, created_by)
    VALUES (v_tid, 'SSK1', 'SSK Saudi Operations', 'Construction — Jeddah/Riyadh operations.',
        v_le_ssk, 'SAR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, legal_entity_id=EXCLUDED.legal_entity_id,
        updated_at=now(), updated_by=v_su;

    -- TEGY: Technostat Egypt (EGP, Jul-Jun, EAS)
    INSERT INTO master.company_code (tenant_id, code, name, description, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant, regulatory_framework, is_intercompany_enabled, metadata, status, created_by)
    VALUES (v_tid, 'TEGY', 'Technostat Egypt Ops', 'Trading operations — Cairo.',
        v_le_tegy, 'EGP', 7, 'jul_jun', 'local_gaap', true, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, legal_entity_id=EXCLUDED.legal_entity_id,
        updated_at=now(), updated_by=v_su;

    -- SDTX: Satellites DT (EGP, Jan-Dec, IFRS)
    INSERT INTO master.company_code (tenant_id, code, name, description, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant, regulatory_framework, is_intercompany_enabled, metadata, status, created_by)
    VALUES (v_tid, 'SDTX', 'Satellites Digital Transformation', 'Technology consulting — Cairo. IC service provider.',
        v_le_sdtx, 'EGP', 1, 'calendar', 'ifrs', true, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, legal_entity_id=EXCLUDED.legal_entity_id,
        updated_at=now(), updated_by=v_su;

    IF (SELECT count(*) FROM master.company_code WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'=v_pack) <> 4 THEN
        RAISE EXCEPTION '[020_cc] Expected 4 company codes'; END IF;
    RAISE NOTICE '[020_cc] 4 company codes seeded';
END $cc$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 4: CHART OF ACCOUNTS CATALOG                                       ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $coa$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '200_coa', 'version', '1.0.0', 'seeded_at', now()::text));
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    INSERT INTO master.chart_of_account (tenant_id, code, name, description, framework, country_code, metadata, status, created_by)
    VALUES
    (v_tid, 'COA-IFRS-GROUP', 'IFRS Group Consolidation Chart', 'All 4 CCs roll up here.', 'ifrs', NULL, v_meta, 'active', v_su),
    (v_tid, 'COA-IFRS',       'IFRS Operating Chart',           'Primary for TKSA + SDTX.', 'ifrs', NULL, v_meta, 'active', v_su),
    (v_tid, 'COA-SOCPA',      'SOCPA Operating Chart',          'Primary for SSK1, overlay for TKSA.', 'local_gaap', 'SA', v_meta, 'active', v_su),
    (v_tid, 'COA-EAS',        'Egyptian Accounting Standards',   'Primary for TEGY, overlay for SDTX.', 'local_gaap', 'EG', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
        framework=EXCLUDED.framework, updated_at=now(), updated_by=v_su;

    RAISE NOTICE '[200_coa] 4 charts seeded';
END $coa$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 5: COST CENTERS — RECOMMENDED HIERARCHY                            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Best practice for ICT group: cost centres by FUNCTION (not project).
-- Projects use master.project for cost accumulation.
-- Cost centres drive overhead allocation and departmental budgeting.

DO $costctr$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '301_cc'; v_meta jsonb;
    v_cc_tksa uuid; v_cc_ssk1 uuid; v_cc_tegy uuid; v_cc_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', '1.0.0', 'seeded_at', now()::text));
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id=v_tid AND code='TKSA';
    SELECT id INTO v_cc_ssk1 FROM master.company_code WHERE tenant_id=v_tid AND code='SSK1';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id=v_tid AND code='TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id=v_tid AND code='SDTX';

    -- ══ TKSA: Group HQ cost centres ═════════════════════════════════════
    -- Root
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description,
        node_type, cost_center_category, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_tksa, 'CC-TKSA',      'Technostat Group HQ',           'Root rollup', 'header', 'admin', 10, v_meta, 'active', v_su),
    -- Posting children
    (v_tid, v_cc_tksa, 'CC-TKSA-EXEC', 'Executive Office',              'CEO, board, strategy', 'posting', 'admin', 11, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-FIN',  'Group Finance & Treasury',      'CFO office, consolidation, treasury, IC', 'posting', 'admin', 12, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-HR',   'Group HR & Admin',              'Recruitment, payroll, admin, facilities', 'posting', 'admin', 13, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-LEGAL','Group Legal & Compliance',      'Legal, regulatory, governance', 'posting', 'admin', 14, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-PROC', 'Group Procurement',             'Central sourcing, vendor management', 'posting', 'admin', 15, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-IT',   'Group IT',                      'Internal IT, infrastructure, support', 'posting', 'production', 16, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    -- Wire parent_id for TKSA children
    UPDATE master.cost_center SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id=v_tid AND code='CC-TKSA'),
        path = 'CC-TKSA/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_tksa AND code LIKE 'CC-TKSA-%' AND code <> 'CC-TKSA';

    -- ══ SSK1: Construction cost centres ═════════════════════════════════
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description,
        node_type, cost_center_category, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_ssk1, 'CC-SSK1',      'SSK Saudi',                     'Root rollup', 'header', 'production', 20, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'CC-SSK1-OPS',  'Operations & Engineering',      'Project delivery, site operations, engineering', 'posting', 'production', 21, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'CC-SSK1-EQUIP','Equipment & Fleet',             'Heavy equipment, vehicles, maintenance yard', 'posting', 'production', 22, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'CC-SSK1-BD',   'Business Development',          'Sales, tenders, estimation', 'posting', 'sales', 23, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'CC-SSK1-ADM',  'Administration',                'Finance, HR, admin', 'posting', 'admin', 24, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'CC-SSK1-HSE',  'HSE & Quality',                 'Health, safety, environment, QA/QC', 'posting', 'admin', 25, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    UPDATE master.cost_center SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id=v_tid AND code='CC-SSK1'),
        path = 'CC-SSK1/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_ssk1 AND code LIKE 'CC-SSK1-%' AND code <> 'CC-SSK1';

    -- ══ TEGY: Egypt Trading cost centres ════════════════════════════════
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description,
        node_type, cost_center_category, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_tegy, 'CC-TEGY',      'Technostat Egypt',              'Root rollup', 'header', 'admin', 30, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-OPS',  'Trading Operations',            'Import/export, distribution, local trading', 'posting', 'production', 31, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-SALES','Sales & Marketing',             'Sales, customer relations', 'posting', 'sales', 32, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-ADM',  'Administration',                'Finance, HR, admin', 'posting', 'admin', 33, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-WHSE', 'Warehouse Operations',          'Receiving, storage, dispatch', 'posting', 'production', 34, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    UPDATE master.cost_center SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id=v_tid AND code='CC-TEGY'),
        path = 'CC-TEGY/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_tegy AND code LIKE 'CC-TEGY-%' AND code <> 'CC-TEGY';

    -- ══ SDTX: Digital Transformation cost centres ═══════════════════════
    -- KEY RECOMMENDATION: Split by function, not service line.
    -- Service-line profitability → profit centres.
    -- Departmental budgets → cost centres.
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description,
        node_type, cost_center_category, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_sdtx, 'CC-SDTX',        'Satellites for DT',             'Root rollup', 'header', 'production', 40, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-DELIV',  'Delivery & Engineering',        'Project managers, solution architects, engineers — all delivery disciplines', 'posting', 'production', 41, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-SWDEV',  'Software Development',          'Developers, QA, UI/UX — custom projects + product maintenance', 'posting', 'production', 42, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-RD',     'R&D / Product Innovation',      'Product R&D (Meeting+, Mawid, etc.), IAS 38 capitalisation eligible', 'posting', 'production', 43, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-NOC',    'NOC & Managed Services',        '24/7 NOC operators, SOC analysts, L1/L2 support', 'posting', 'production', 44, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-CYBER',  'Cybersecurity Practice',        'Pen testers, security consultants, SIEM engineers', 'posting', 'production', 45, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-SALES',  'Sales & Pre-sales',             'Account managers, pre-sales engineers, marketing', 'posting', 'sales', 46, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-CONSULT','Consulting & Advisory',         'ITIL consultants, enterprise architects, network auditors', 'posting', 'production', 47, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-RESRC',  'Resourcing & Outsourcing',      'Staff augmentation pool, managed outsourcing teams, payroll admin', 'posting', 'production', 48, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-ADM',    'Administration',                'Finance, HR, admin, facilities', 'posting', 'admin', 49, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-WHSE',   'Warehouse & Logistics',         'Equipment staging, receiving, dispatch', 'posting', 'production', 50, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    UPDATE master.cost_center SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id=v_tid AND code='CC-SDTX'),
        path = 'CC-SDTX/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_sdtx AND code LIKE 'CC-SDTX-%' AND code <> 'CC-SDTX';

    RAISE NOTICE '[301_cc] % cost centers seeded',
        (SELECT count(*) FROM master.cost_center WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'=v_pack);
END $costctr$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 6: PROFIT CENTERS — BY SERVICE LINE                                ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Recommendation: Profit centres by SERVICE LINE, not department.
-- This enables service-line P&L reporting (revenue − direct costs = margin).

DO $profitctr$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '302_pc'; v_meta jsonb;
    v_cc_tksa uuid; v_cc_ssk1 uuid; v_cc_tegy uuid; v_cc_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', '1.0.0', 'seeded_at', now()::text));
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id=v_tid AND code='TKSA';
    SELECT id INTO v_cc_ssk1 FROM master.company_code WHERE tenant_id=v_tid AND code='SSK1';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id=v_tid AND code='TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id=v_tid AND code='SDTX';

    -- TKSA: Group shared services (cost centre, no external revenue)
    INSERT INTO master.profit_center (tenant_id, company_code_id, code, name, description,
        node_type, profit_center_type, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_tksa, 'PC-TKSA',     'Group HQ',          'Shared services — no external revenue', 'header', 'shared', 10, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'PC-TKSA-CORP','Corporate Services', 'Treasury, legal, HR, procurement', 'posting', 'shared', 11, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'PC-TKSA-IC',  'IC Management Fees', 'Management fee income from subsidiaries', 'posting', 'revenue', 12, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    UPDATE master.profit_center SET parent_id = (SELECT id FROM master.profit_center WHERE tenant_id=v_tid AND code='PC-TKSA'),
        path = 'PC-TKSA/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_tksa AND code LIKE 'PC-TKSA-%';

    -- SSK1: Construction
    INSERT INTO master.profit_center (tenant_id, company_code_id, code, name, description,
        node_type, profit_center_type, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_ssk1, 'PC-SSK1',      'SSK Construction',   'Root', 'header', 'revenue', 20, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'PC-SSK1-CIVIL','Civil Works',        'Roads, infrastructure, earthworks', 'posting', 'revenue', 21, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'PC-SSK1-MEP',  'MEP Contracting',    'Mechanical, electrical, plumbing', 'posting', 'revenue', 22, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk1, 'PC-SSK1-FIT',  'Fit-out & Finishing', 'Interior fit-out projects', 'posting', 'revenue', 23, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    UPDATE master.profit_center SET parent_id = (SELECT id FROM master.profit_center WHERE tenant_id=v_tid AND code='PC-SSK1'),
        path = 'PC-SSK1/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_ssk1 AND code LIKE 'PC-SSK1-%';

    -- TEGY: Egypt Trading
    INSERT INTO master.profit_center (tenant_id, company_code_id, code, name, description,
        node_type, profit_center_type, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_tegy, 'PC-TEGY',       'Egypt Trading',      'Root', 'header', 'revenue', 30, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'PC-TEGY-TRADE', 'General Trading',    'Import/export and distribution', 'posting', 'revenue', 31, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'PC-TEGY-SHARED','Shared Services',    'Admin services to SDTX (office sublease, etc.)', 'posting', 'shared', 32, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    UPDATE master.profit_center SET parent_id = (SELECT id FROM master.profit_center WHERE tenant_id=v_tid AND code='PC-TEGY'),
        path = 'PC-TEGY/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_tegy AND code LIKE 'PC-TEGY-%';

    -- SDTX: Digital Transformation — SERVICE LINE PROFIT CENTRES
    INSERT INTO master.profit_center (tenant_id, company_code_id, code, name, description,
        node_type, profit_center_type, sort_order, metadata, status, created_by) VALUES
    (v_tid, v_cc_sdtx, 'PC-SDTX',         'Satellites for DT',       'Root', 'header', 'revenue', 40, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-DC',      'Data Center Solutions',   'DC design, build, DCIM, mobility DC', 'posting', 'revenue', 41, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-NET',     'Network Solutions',       'LAN/WAN, security, wireless, UC, server/storage, DR', 'posting', 'revenue', 42, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-NOCSOC',  'NOC & SOC Services',     'Managed NOC, managed SOC, monitoring', 'posting', 'revenue', 43, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-CYBER',   'Cybersecurity',           'Pen testing, vulnerability, SOC build', 'posting', 'revenue', 44, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-SMART',   'Smart Solutions',         'BMS, AV, signage, access control, parking, IPTV', 'posting', 'revenue', 45, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-SWDEV',   'Software Development',    'Custom web/mobile/e-services + systems integration', 'posting', 'revenue', 46, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-SAAS',    'SaaS Products',           'Meeting+, Mawid, Musaned, OneClick, Mersal, etc.', 'posting', 'revenue', 47, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-RESRC',   'Resourcing & Outsourcing','Staff augmentation, managed outsourcing, payroll, recruitment', 'posting', 'revenue', 48, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-CONSULT', 'Consulting & Advisory',   'ITIL, EA, network audit, IT strategy, 2030 support', 'posting', 'revenue', 49, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-HWSALES', 'Hardware Sales',          'Equipment resale, AQT Power Saver', 'posting', 'revenue', 50, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-SHARED',  'Shared Services',         'Admin, facilities — no external revenue', 'posting', 'shared', 51, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    UPDATE master.profit_center SET parent_id = (SELECT id FROM master.profit_center WHERE tenant_id=v_tid AND code='PC-SDTX'),
        path = 'PC-SDTX/' || code, level_no = 2
    WHERE tenant_id=v_tid AND company_code_id=v_cc_sdtx AND code LIKE 'PC-SDTX-%';

    RAISE NOTICE '[302_pc] % profit centers seeded',
        (SELECT count(*) FROM master.profit_center WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'=v_pack);
END $profitctr$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 7: SITES                                                           ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $sites$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '303_sites', 'version', '1.0.0', 'seeded_at', now()::text));
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    INSERT INTO master.site (tenant_id, code, name, description, company_code_id, site_type,
        country_code, timezone_code, sort_order, metadata, status, created_by)
    SELECT v_tid, v.code, v.name, v.description,
        (SELECT id FROM master.company_code WHERE tenant_id=v_tid AND code=v.cc_code),
        v.site_type, v.country, v.tz, v.so, v_meta, 'active', v_su
    FROM (VALUES
        ('SITE-RYD-TKSA', 'Riyadh HQ Office',       'P.O. Box 305099 Riyadh 11361. Group HQ + SSK HQ.', 'TKSA', 'office', 'SA', 'Asia/Riyadh', 10),
        ('SITE-RYD-SSK1', 'Riyadh SSK Operations',   'SSK operations and project staging.', 'SSK1', 'office', 'SA', 'Asia/Riyadh', 15),
        ('SITE-CAI-TEGY', 'Cairo Egypt Office',       '1st District Services Zone, 5th Compound, New Cairo.', 'TEGY', 'office', 'EG', 'Africa/Cairo', 20),
        ('SITE-CAI-SDTX', 'Cairo Satellites Office',  '1st District Services Zone, 5th Compound, New Cairo. Tech hub.', 'SDTX', 'office', 'EG', 'Africa/Cairo', 25)
    ) AS v(code, name, description, cc_code, site_type, country, tz, so)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
        updated_at=now(), updated_by=v_su;

    RAISE NOTICE '[303_sites] 4 sites seeded';
END $sites$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 8: WAREHOUSES                                                      ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $whse$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '304_whse', 'version', '1.0.0', 'seeded_at', now()::text));
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    -- warehouse: no company_code_id/sort_order columns; unique key is (tenant_id, site_id, code)
    INSERT INTO master.warehouse (tenant_id, code, name, description,
        site_id, warehouse_type, metadata, status, created_by)
    SELECT v_tid, v.code, v.name, v.description,
        (SELECT id FROM master.site WHERE tenant_id=v_tid AND code=v.site_code),
        v.wh_type, v_meta, 'active', v_su
    FROM (VALUES
        ('WH-RYD-MAIN', 'Riyadh Main Warehouse',    'Network, DC, and smart solution equipment staging and storage.', 'SITE-RYD-TKSA', 'finished_goods'),
        ('WH-RYD-SSK',  'Riyadh SSK Yard',          'Construction materials and equipment yard.',                     'SITE-RYD-SSK1', 'raw'),
        ('WH-CAI-MAIN', 'Cairo Main Warehouse',      'Trading goods, IT equipment, and DT project staging.',          'SITE-CAI-TEGY', 'finished_goods'),
        ('WH-CAI-SDTX', 'Cairo Satellites Staging',  'Equipment staging for DT project installations.',              'SITE-CAI-SDTX', 'finished_goods')
    ) AS v(code, name, description, site_code, wh_type)
    ON CONFLICT (tenant_id, site_id, code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
        updated_at=now(), updated_by=v_su;

    RAISE NOTICE '[304_whse] 4 warehouses seeded';
END $whse$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 9: FISCAL PERIODS — FY2025 + FY2026                               ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $fiscal$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '310_fiscal', 'version', '1.0.0', 'seeded_at', now()::text));
    v_cc  uuid;
    v_fy  int;
    v_mo  int;
    v_start date;
    v_end   date;
    rec     record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    -- Generate periods for each company code × fiscal year
    FOR rec IN
        SELECT cc.id AS cc_id, cc.code AS cc_code,
               cc.fiscal_year_start_month AS fy_start,
               cc.functional_currency AS ccy
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid
    LOOP
        FOR v_fy IN 2025..2026 LOOP
            FOR v_mo IN 1..12 LOOP
                -- Calculate period start/end
                v_start := make_date(
                    CASE WHEN v_mo >= rec.fy_start THEN v_fy
                         ELSE v_fy + 1 END,
                    ((rec.fy_start - 1 + v_mo - 1) % 12) + 1,
                    1
                );
                v_end := (v_start + interval '1 month' - interval '1 day')::date;

                INSERT INTO master.fiscal_period (
                    tenant_id, company_code_id, fiscal_year, period_number,
                    code, name, period_type, start_date, end_date,
                    sort_order, metadata, status, created_by
                ) VALUES (
                    v_tid, rec.cc_id, v_fy, v_mo,
                    rec.cc_code || '-' || v_fy || '-P' || lpad(v_mo::text, 2, '0'),
                    'FY' || v_fy || ' Period ' || v_mo || ' (' || to_char(v_start, 'Mon YYYY') || ')',
                    'normal',
                    v_start, v_end,
                    (v_fy - 2000) * 100 + v_mo,
                    v_meta, 'open', v_su
                )
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO UPDATE SET
                    start_date = EXCLUDED.start_date,
                    end_date   = EXCLUDED.end_date,
                    updated_at = now(), updated_by = v_su;
            END LOOP;

            -- Period 13: year-end adjustment
            INSERT INTO master.fiscal_period (
                tenant_id, company_code_id, fiscal_year, period_number,
                code, name, period_type, start_date, end_date,
                sort_order, metadata, status, created_by
            ) VALUES (
                v_tid, rec.cc_id, v_fy, 13,
                rec.cc_code || '-' || v_fy || '-P13',
                'FY' || v_fy || ' Adjustment',
                'adjustment',
                make_date(CASE WHEN rec.fy_start = 1 THEN v_fy ELSE v_fy + 1 END, ((rec.fy_start - 1 + 11) % 12) + 1, 1),
                (make_date(CASE WHEN rec.fy_start = 1 THEN v_fy ELSE v_fy + 1 END, ((rec.fy_start - 1 + 11) % 12) + 1, 1)
                 + interval '1 month' - interval '1 day')::date,
                (v_fy - 2000) * 100 + 13,
                v_meta, 'open', v_su
            )
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number) DO UPDATE SET
                updated_at = now(), updated_by = v_su;
        END LOOP;
    END LOOP;

    RAISE NOTICE '[310_fiscal] % fiscal periods seeded',
        (SELECT count(*) FROM master.fiscal_period WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'='310_fiscal');
END $fiscal$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 10: LEDGER BOOKS + BOOK ASSIGNMENTS                               ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $books$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '311_books', 'version', '1.0.0', 'seeded_at', now()::text));
    v_book_ifrs uuid; v_book_socpa uuid; v_book_eas uuid; v_book_mgmt uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    -- Create ledger books  (column is 'category' not 'book_type'; close_mode + sort_order are NOT NULL)
    INSERT INTO master.ledger_book (tenant_id, code, name, description, category,
        base_currency_code, is_primary, close_mode, sort_order, metadata, status, created_by)
    VALUES
    (v_tid, 'BOOK-IFRS',  'IFRS Ledger',    'Primary IFRS reporting book.',      'statutory',  'SAR', true,  'unified', 10, v_meta, 'active', v_su),
    (v_tid, 'BOOK-SOCPA', 'SOCPA Ledger',   'Saudi statutory (SOCPA/Zakat).',    'statutory',  'SAR', false, 'unified', 20, v_meta, 'active', v_su),
    (v_tid, 'BOOK-EAS',   'EAS Ledger',     'Egyptian Accounting Standards.',    'statutory',  'EGP', false, 'unified', 30, v_meta, 'active', v_su),
    (v_tid, 'BOOK-MGMT',  'Management Book','Management reporting / analytics.', 'management', 'SAR', false, 'unified', 40, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    SELECT id INTO v_book_ifrs  FROM master.ledger_book WHERE tenant_id=v_tid AND code='BOOK-IFRS';
    SELECT id INTO v_book_socpa FROM master.ledger_book WHERE tenant_id=v_tid AND code='BOOK-SOCPA';
    SELECT id INTO v_book_eas   FROM master.ledger_book WHERE tenant_id=v_tid AND code='BOOK-EAS';
    SELECT id INTO v_book_mgmt  FROM master.ledger_book WHERE tenant_id=v_tid AND code='BOOK-MGMT';

    -- ── Book assignments (which book → which company code) ──────────────
    -- No is_primary column; required: effective_from, priority, conflict_strategy
    -- priority: lower number = higher priority; conflict_strategy: 'highest_priority'
    INSERT INTO master.company_code_book_assignment (tenant_id, company_code_id, book_id,
        effective_from, priority, conflict_strategy, metadata, status, created_by)
    SELECT v_tid, cc.id, book.id, '2025-01-01'::date, v.priority, 'highest_priority', v_meta, 'active', v_su
    FROM (VALUES
        ('TKSA', 'BOOK-IFRS',  1::smallint),
        ('TKSA', 'BOOK-SOCPA', 2::smallint),
        ('TKSA', 'BOOK-MGMT',  3::smallint),
        ('SSK1', 'BOOK-SOCPA', 1::smallint),
        ('SSK1', 'BOOK-IFRS',  2::smallint),
        ('SSK1', 'BOOK-MGMT',  3::smallint),
        ('TEGY', 'BOOK-EAS',   1::smallint),
        ('TEGY', 'BOOK-IFRS',  2::smallint),
        ('SDTX', 'BOOK-IFRS',  1::smallint),
        ('SDTX', 'BOOK-EAS',   2::smallint),
        ('SDTX', 'BOOK-MGMT',  3::smallint)
    ) AS v(cc_code, book_code, priority)
    JOIN master.company_code cc ON cc.tenant_id=v_tid AND cc.code=v.cc_code
    JOIN master.ledger_book book ON book.tenant_id=v_tid AND book.code=v.book_code
    ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
        priority=EXCLUDED.priority, updated_at=now(), updated_by=v_su;

    RAISE NOTICE '[311_books] 4 books + 11 assignments seeded';
END $books$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 11: CHART ASSIGNMENTS (COA → Company Code)                         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $chartassign$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '201_chart_assign', 'version', '1.0.0', 'seeded_at', now()::text));
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    INSERT INTO master.company_code_chart_assignment (tenant_id, company_code_id, chart_of_account_id,
        is_primary, metadata, status, created_by)
    SELECT v_tid, cc.id, coa.id, v.is_primary, v_meta, 'active', v_su
    FROM (VALUES
        ('TKSA', 'COA-IFRS',       true),
        ('TKSA', 'COA-SOCPA',      false),
        ('TKSA', 'COA-IFRS-GROUP', false),
        ('SSK1', 'COA-SOCPA',      true),
        ('SSK1', 'COA-IFRS',       false),
        ('SSK1', 'COA-IFRS-GROUP', false),
        ('TEGY', 'COA-EAS',        true),
        ('TEGY', 'COA-IFRS',       false),
        ('TEGY', 'COA-IFRS-GROUP', false),
        ('SDTX', 'COA-IFRS',       true),
        ('SDTX', 'COA-EAS',        false),
        ('SDTX', 'COA-IFRS-GROUP', false)
    ) AS v(cc_code, coa_code, is_primary)
    JOIN master.company_code cc ON cc.tenant_id=v_tid AND cc.code=v.cc_code
    JOIN master.chart_of_account coa ON coa.tenant_id=v_tid AND coa.code=v.coa_code
    -- unique constraint is (tenant_id, company_code_id, chart_of_account_id, assignment_type)
    ON CONFLICT (tenant_id, company_code_id, chart_of_account_id, assignment_type) DO UPDATE SET
        is_primary=EXCLUDED.is_primary, updated_at=now(), updated_by=v_su;

    RAISE NOTICE '[201_chart_assign] 12 chart assignments seeded';
END $chartassign$;


-- ╔════════════════════════════════════════════════════════════════════════════╗


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 12: TAX SETUP — KSA + EGYPT (DDL-ALIGNED)                         ║
-- ║  tax_type.category: INDIRECT / WITHHOLDING (CHECK constraint)            ║
-- ║  tax_rate_schedule: structured identity (no code/name columns)           ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $tax$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '320_tax', 'version', '2.0.0', 'seeded_at', now()::text));
    v_tj_sa uuid; v_tj_eg uuid;
    v_tt_vatsa uuid; v_tt_whtsa uuid; v_tt_vateg uuid; v_tt_whteg uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    -- ── Tax Jurisdictions ───────────────────────────────────────────────
    -- jurisdiction_type NOT NULL: COUNTRY | STATE | PROVINCE | CITY | DISTRICT | SPECIAL_ZONE | TREATY
    INSERT INTO master.tax_jurisdiction (tenant_id, code, name, description, country_code,
        jurisdiction_type, level_no, metadata, status, created_by)
    VALUES
    (v_tid, 'TJ-SA', 'Saudi Arabia', 'Kingdom of Saudi Arabia — ZATCA jurisdiction', 'SA', 'COUNTRY', 1, v_meta, 'active', v_su),
    (v_tid, 'TJ-EG', 'Egypt',        'Arab Republic of Egypt — ETA jurisdiction',    'EG', 'COUNTRY', 1, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    SELECT id INTO v_tj_sa FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='TJ-SA';
    SELECT id INTO v_tj_eg FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='TJ-EG';

    -- ── Tax Types (DDL: category IN ('INDIRECT','WITHHOLDING','CUSTOMS_DUTY','SURCHARGE')) ─
    -- NOTE: Zakat and CIT are income taxes — NOT handled by the indirect/WHT engine.
    --       They are GL-level provisions (ICT-E-TAX-CIT, ICT-L-TAX-ZAKAT).
    INSERT INTO master.tax_type (tenant_id, code, name, description,
        category, is_recoverable, is_deducted_at_source,
        is_included_in_price, is_compound_eligible, sort_order,
        metadata, status, created_by)
    VALUES
    (v_tid, 'VAT-SA', 'KSA VAT',  'Saudi VAT per ZATCA. Standard 15%, zero-rated 0%.',
     'INDIRECT', true, false, false, false, 10, v_meta, 'active', v_su),
    (v_tid, 'WHT-SA', 'KSA WHT',  'KSA WHT on non-resident payments. Art 68: 5/15/20%.',
     'WITHHOLDING', false, true, false, false, 20, v_meta, 'active', v_su),
    (v_tid, 'VAT-EG', 'Egypt VAT', 'Egyptian VAT per ETA. Standard 14%.',
     'INDIRECT', true, false, false, false, 30, v_meta, 'active', v_su),
    (v_tid, 'WHT-EG', 'Egypt WHT', 'Egyptian WHT on services/royalties.',
     'WITHHOLDING', false, true, false, false, 40, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        category=EXCLUDED.category, is_recoverable=EXCLUDED.is_recoverable,
        is_deducted_at_source=EXCLUDED.is_deducted_at_source,
        updated_at=now(), updated_by=v_su;

    SELECT id INTO v_tt_vatsa FROM master.tax_type WHERE tenant_id=v_tid AND code='VAT-SA';
    SELECT id INTO v_tt_whtsa FROM master.tax_type WHERE tenant_id=v_tid AND code='WHT-SA';
    SELECT id INTO v_tt_vateg FROM master.tax_type WHERE tenant_id=v_tid AND code='VAT-EG';
    SELECT id INTO v_tt_whteg FROM master.tax_type WHERE tenant_id=v_tid AND code='WHT-EG';

    -- ── Tax Rate Schedules (DDL: structured identity, no code/name columns) ─
    -- Required columns: jurisdiction_id, tax_type_id, tax_direction, rate_kind,
    --   rate_value, recoverability_mode, calculation_basis, rounding_stage,
    --   priority, effective_from
    INSERT INTO control.tax_rate_schedule (
        tenant_id, jurisdiction_id, tax_type_id,
        tax_direction, rate_kind, rate_value,
        recoverability_mode, calculation_basis, rounding_stage,
        priority, description, effective_from,
        metadata, status, created_by
    ) VALUES
    (v_tid, v_tj_sa, v_tt_vatsa, 'SALE',     'PERCENT', 15.00, 'NONE', 'LINE_NET', 'LINE', 0,  'KSA VAT 15% on sales',                '2020-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_vatsa, 'PURCHASE', 'PERCENT', 15.00, 'FULL', 'LINE_NET', 'LINE', 0,  'KSA VAT 15% on purchases (recoverable)', '2020-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_vatsa, 'SALE',     'PERCENT',  0.00, 'NONE', 'LINE_NET', 'LINE', 10, 'KSA VAT zero-rated/exempt',            '2020-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_whtsa, 'PAYMENT',  'PERCENT',  5.00, 'NONE', 'LINE_NET', 'LINE', 0,  'KSA WHT 5% technical services',       '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_whtsa, 'PAYMENT',  'PERCENT', 15.00, 'NONE', 'LINE_NET', 'LINE', 10, 'KSA WHT 15% royalties',               '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_whtsa, 'PAYMENT',  'PERCENT', 20.00, 'NONE', 'LINE_NET', 'LINE', 20, 'KSA WHT 20% management fees',         '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_vateg, 'SALE',     'PERCENT', 14.00, 'NONE', 'LINE_NET', 'LINE', 0,  'Egypt VAT 14% on sales',               '2017-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_vateg, 'PURCHASE', 'PERCENT', 14.00, 'FULL', 'LINE_NET', 'LINE', 0,  'Egypt VAT 14% on purchases (recoverable)', '2017-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_vateg, 'SALE',     'PERCENT',  0.00, 'NONE', 'LINE_NET', 'LINE', 10, 'Egypt VAT exempt',                     '2017-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_whteg, 'PAYMENT',  'PERCENT',  5.00, 'NONE', 'LINE_NET', 'LINE', 0,  'Egypt WHT 5% domestic services',       '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_whteg, 'PAYMENT',  'PERCENT', 20.00, 'NONE', 'LINE_NET', 'LINE', 10, 'Egypt WHT 20% non-resident royalties', '2020-01-01', v_meta, 'active', v_su)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '[320_tax] 2 jurisdictions, 4 tax types, 11 rate schedules seeded (DDL-aligned)';
END $tax$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 13: FX RATES — master.fx_rate (not exchange_rate)                  ║
-- ║  rate_type: SPOT / PERIOD_AVG / PERIOD_END (uppercase CHECK)             ║
-- ║  inverse_rate: GENERATED ALWAYS — do not insert                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $fx$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '330_fx', 'version', '2.0.0', 'seeded_at', now()::text));
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    INSERT INTO master.fx_rate (tenant_id, from_currency, to_currency,
        rate, rate_type, effective_date, source, metadata, status, created_by)
    VALUES
    (v_tid, 'USD', 'SAR',  3.7500, 'SPOT',       '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'EGP', 'SAR',  0.0769, 'SPOT',       '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'USD', 'EGP', 48.7500, 'SPOT',       '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'EGP', 'SAR',  0.0780, 'PERIOD_AVG', '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'USD', 'SAR',  3.7500, 'PERIOD_AVG', '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'EGP', 'SAR',  0.0769, 'PERIOD_END', '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'USD', 'SAR',  3.7500, 'PERIOD_END', '2025-01-01', 'MANUAL', v_meta, 'active', v_su)
    ON CONFLICT DO NOTHING;
    -- NOTE: inverse_rate is GENERATED ALWAYS — auto-computed.
    --       get_fx_rate() handles inverse + triangulation — no reverse pairs needed.

    RAISE NOTICE '[330_fx] 7 FX rates seeded in master.fx_rate (SPOT + PERIOD_AVG + PERIOD_END)';
END $fx$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 14: PAYMENT TERMS — DDL-aligned structure                          ║
-- ║  Uses: due_rule_type, due_days, base_event, applicable_to                ║
-- ║  Discounts → master.payment_term_discount_tier (child table)             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $payterms$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '340_terms', 'version', '2.0.0', 'seeded_at', now()::text));
    v_pt_2_10 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    INSERT INTO master.payment_term (tenant_id, code, name, description,
        applicable_to, base_event, due_rule_type, due_days,
        grace_days, term_category, sort_order,
        metadata, status, created_by)
    VALUES
    (v_tid, 'COD',     'Cash on Delivery',   'Payment upon delivery',             'BOTH', 'DELIVERY_DATE',  'COD',      NULL, 0, 'standard',  5, v_meta, 'active', v_su),
    (v_tid, 'PREPAID', 'Prepaid',            '100% upfront before delivery',      'BOTH', 'CONTRACT_DATE',  'PREPAID',  NULL, 0, 'standard',  6, v_meta, 'active', v_su),
    (v_tid, 'NET-15',  'Net 15',             '15 days from invoice',              'BOTH', 'INVOICE_DATE',   'NET_DAYS',  15, 0, 'standard', 10, v_meta, 'active', v_su),
    (v_tid, 'NET-30',  'Net 30',             '30 days from invoice',              'BOTH', 'INVOICE_DATE',   'NET_DAYS',  30, 0, 'standard', 20, v_meta, 'active', v_su),
    (v_tid, 'NET-45',  'Net 45',             '45 days from invoice',              'BOTH', 'INVOICE_DATE',   'NET_DAYS',  45, 0, 'standard', 25, v_meta, 'active', v_su),
    (v_tid, 'NET-60',  'Net 60',             '60 days from invoice',              'BOTH', 'INVOICE_DATE',   'NET_DAYS',  60, 0, 'standard', 30, v_meta, 'active', v_su),
    (v_tid, 'NET-90',  'Net 90',             '90 days — typical gov contracts',   'SALE', 'INVOICE_DATE',   'NET_DAYS',  90, 0, 'standard', 40, v_meta, 'active', v_su),
    (v_tid, 'NET-120', 'Net 120',            '120 days — extended gov/SOE',       'SALE', 'INVOICE_DATE',   'NET_DAYS', 120, 0, 'standard', 45, v_meta, 'active', v_su),
    (v_tid, '2-10-30', '2/10 Net 30',        '2% discount if paid in 10 days',   'BOTH', 'INVOICE_DATE',   'NET_DAYS',  30, 0, 'standard', 50, v_meta, 'active', v_su),
    (v_tid, 'EOM-30',  'End of Month + 30',  'Due 30d after end of invoice month','BOTH','INVOICE_DATE',   'EOM',      NULL, 0, 'standard', 55, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code, version) DO UPDATE SET
        name=EXCLUDED.name, due_rule_type=EXCLUDED.due_rule_type, due_days=EXCLUDED.due_days,
        updated_at=now(), updated_by=v_su;

    -- Discount tier for 2/10 Net 30
    SELECT id INTO v_pt_2_10 FROM master.payment_term WHERE tenant_id=v_tid AND code='2-10-30' AND is_current_version=true;
    IF v_pt_2_10 IS NOT NULL THEN
        INSERT INTO master.payment_term_discount_tier (tenant_id, payment_term_id, tier_no,
            qualify_within_days, discount_pct, discount_basis_mode, metadata, created_by)
        VALUES (v_tid, v_pt_2_10, 1, 10, 2.00, 'GROSS', v_meta, v_su)
        ON CONFLICT (payment_term_id, tier_no) DO UPDATE SET discount_pct=EXCLUDED.discount_pct;
    END IF;

    RAISE NOTICE '[340_terms] 10 payment terms + 1 discount tier seeded (DDL-aligned)';
END $payterms$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 15: ASSET CLASSES — ICT SPECIFIC                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $assets$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '340_assets', 'version', '1.0.0', 'seeded_at', now()::text));
    rec record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    -- asset_class requires company_code_id (NOT NULL); useful_life_months/residual_pct go into depreciation_defaults JSONB.
    -- Create identical ICT-focused class set per company code.
    FOR rec IN
        SELECT id AS cc_id, code AS cc_code, functional_currency AS ccy
        FROM master.company_code WHERE tenant_id = v_tid
    LOOP
        INSERT INTO master.asset_class (
            tenant_id, company_code_id, code, name, description,
            asset_nature, is_depreciable, currency_code,
            depreciation_defaults, sort_order, metadata, status, created_by
        ) VALUES
        (v_tid, rec.cc_id, rec.cc_code||'-AC-LAB',    'Lab & Demo Equipment',      'Demo racks, test servers, POC equipment',  'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 36,   'residual_pct', 5.00),  10, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-DCOWN',  'Own DC Equipment',           'UPS, cooling, racks, PDUs (production)',   'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 84,   'residual_pct', 10.00), 15, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-IT',     'IT Equipment — Internal',    'Laptops, desktops, monitors, printers',   'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 36,   'residual_pct', 5.00),  20, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-MOBILE', 'Mobile Devices',             'Phones, tablets for field engineers',      'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 24,   'residual_pct', 0.00),  25, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-FURN',   'Furniture & Fixtures',       'Office furniture, workstations',           'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 60,   'residual_pct', 10.00), 30, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-VEH',    'Vehicles',                   'Company vehicles and fleet',               'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 60,   'residual_pct', 15.00), 35, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-LHI',    'Leasehold Improvements',     'Office fit-out, partitions, electrical',   'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 60,   'residual_pct', 0.00),  40, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-TOOLS',  'Tools & Test Equipment',     'Cable testers, OTDR, crimpers, meters',   'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 48,   'residual_pct', 5.00),  45, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-AV',     'AV & Presentation',          'Projectors, screens, conference systems',  'tangible',   true,  rec.ccy, jsonb_build_object('useful_life_months', 48,   'residual_pct', 5.00),  48, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-SWPROD', 'Capitalised Product Dev',    'IAS 38 capitalised software products',    'intangible', true,  rec.ccy, jsonb_build_object('useful_life_months', 60,   'residual_pct', 0.00),  50, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-LICACQ', 'Acquired Software Licenses', '3rd-party perpetual licenses',            'intangible', true,  rec.ccy, jsonb_build_object('useful_life_months', 36,   'residual_pct', 0.00),  55, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-PATENT', 'Patents & Trademarks',       'Registered IP assets',                    'intangible', true,  rec.ccy, jsonb_build_object('useful_life_months', 120,  'residual_pct', 0.00),  60, v_meta, 'active', v_su),
        (v_tid, rec.cc_id, rec.cc_code||'-AC-CWIP',   'Capital Work in Progress',   'Assets under construction',               'cwip',       false, rec.ccy, jsonb_build_object('useful_life_months', null, 'residual_pct', null),  90, v_meta, 'active', v_su)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, depreciation_defaults=EXCLUDED.depreciation_defaults,
            updated_at=now(), updated_by=v_su;
    END LOOP;

    RAISE NOTICE '[340_assets] % asset classes seeded (13 per company code)',
        (SELECT count(*) FROM master.asset_class WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'='340_assets');
END $assets$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 16: PRINCIPALS — one user per workspace group                      ║
-- ║  8 workspace groups → 8 users (+ system admin)                           ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $users$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '004_users', 'version', '2.0.0', 'seeded_at', now()::text));
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    -- trg_set_updated_at reads app.current_principal_id for updated_by on UPDATE path;
    -- set it so ON CONFLICT DO UPDATE doesn't violate (updated_at IS NULL) = (updated_by IS NULL)
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- principal has no display_name (use 'name') and no email (use 'login_email')
    INSERT INTO master.principal (id, tenant_id, code, name, login_email,
        principal_type, metadata, status, created_by)
    VALUES
    -- 1. Tenant Admin (all workspaces, tenant scope)
    ('10000000-0000-0000-0000-000000000001'::uuid, v_tid,
     'admin.tenant', 'Tenant Administrator', 'admin@technostat.net',
     'user', v_meta || '{"persona":"tenant_admin","workspace":"*"}'::jsonb, 'active', v_su),

    -- 2. Finance workspace — Group CFO
    ('10000000-0000-0000-0000-000000000002'::uuid, v_tid,
     'cfo.group', 'Group CFO', 'cfo@technostat.net',
     'user', v_meta || '{"persona":"finance_manager","workspace":"finance"}'::jsonb, 'active', v_su),

    -- 3. Procurement workspace — Group Procurement Manager
    ('10000000-0000-0000-0000-000000000003'::uuid, v_tid,
     'proc.group', 'Procurement Manager', 'procurement@technostat.net',
     'user', v_meta || '{"persona":"procurement_manager","workspace":"procurement"}'::jsonb, 'active', v_su),

    -- 4. Projects workspace — SDTX Project Manager
    ('10000000-0000-0000-0000-000000000004'::uuid, v_tid,
     'pm.sdtx', 'SDTX Project Manager', 'pm.sdtx@technostat.net',
     'user', v_meta || '{"persona":"project_manager","workspace":"projects","company":"SDTX"}'::jsonb, 'active', v_su),

    -- 5. HR workspace — Group HR Manager
    ('10000000-0000-0000-0000-000000000005'::uuid, v_tid,
     'hr.group', 'HR Manager', 'hr@technostat.net',
     'user', v_meta || '{"persona":"hr_manager","workspace":"hr"}'::jsonb, 'active', v_su),

    -- 6. IT Operations workspace — NOC/SOC Lead
    ('10000000-0000-0000-0000-000000000006'::uuid, v_tid,
     'noc.sdtx', 'NOC Operations Lead', 'noc@technostat.net',
     'user', v_meta || '{"persona":"operations_lead","workspace":"it_operations","company":"SDTX"}'::jsonb, 'active', v_su),

    -- 7. Sales workspace — Sales Director
    ('10000000-0000-0000-0000-000000000007'::uuid, v_tid,
     'sales.group', 'Sales Director', 'sales@technostat.net',
     'user', v_meta || '{"persona":"sales_manager","workspace":"sales"}'::jsonb, 'active', v_su),

    -- 8. Executive workspace — CEO (read-only dashboards)
    ('10000000-0000-0000-0000-000000000008'::uuid, v_tid,
     'ceo.group', 'CEO', 'ceo@technostat.net',
     'user', v_meta || '{"persona":"executive","workspace":"executive"}'::jsonb, 'active', v_su)

    ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, login_email=EXCLUDED.login_email,
        metadata=EXCLUDED.metadata, updated_at=now(), updated_by=v_su;

    RAISE NOTICE '[004_users] 8 principals seeded (one per workspace group)';
END $users$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 17: RBAC — WORKSPACE GROUPS + ROLE ASSIGNMENTS                     ║
-- ║                                                                          ║
-- ║  DESIGN:                                                                 ║
-- ║    Group per workspace persona → each group gets auth_group_role          ║
-- ║    linking to shared.role (platform-seeded).                              ║
-- ║    assignment_scope_type controls organizational boundary:                ║
-- ║      'tenant'       = all company codes                                  ║
-- ║      'company_code' = specific CC only                                   ║
-- ║      'legal_entity' = CC under an LE (with descendants option)           ║
-- ║    visibility_scope controls row-level filtering:                         ║
-- ║      'all' = see all records   'team' = team records   'own' = own only  ║
-- ║                                                                          ║
-- ║  NOTE: auth_group_role.role_id references shared.role which is           ║
-- ║  platform-seeded. The INSERTs below look up roles by code.               ║
-- ║  If a role code does not exist in your platform, the INSERT silently     ║
-- ║  skips (via the LEFT JOIN + WHERE filter pattern).                        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $rbac$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := jsonb_build_object('_seed', jsonb_build_object('pack', '001_rbac', 'version', '2.0.0', 'seeded_at', now()::text));
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';

    -- ══════════════════════════════════════════════════════════════════════
    -- AUTH GROUPS — one per workspace/persona
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.auth_group (id, tenant_id, code, name, description,
        metadata, status, created_by)
    VALUES
    ('20000000-0000-0000-0000-000000000001'::uuid, v_tid,
     'GRP-ADMIN',       'Tenant Administrators',
     'Full platform access across all workspaces and company codes. Tenant-wide scope.',
     v_meta || '{"workspace":"*","scope":"tenant"}'::jsonb, 'active', v_su),

    ('20000000-0000-0000-0000-000000000002'::uuid, v_tid,
     'GRP-FINANCE',     'Finance & Accounting',
     'GL, AP, AR, bank reconciliation, period close, reporting. Workspace: Finance.',
     v_meta || '{"workspace":"finance","scope":"tenant"}'::jsonb, 'active', v_su),

    ('20000000-0000-0000-0000-000000000003'::uuid, v_tid,
     'GRP-PROCUREMENT', 'Procurement & Sourcing',
     'Purchase requisitions, POs, supplier management, contracts. Workspace: Procurement.',
     v_meta || '{"workspace":"procurement","scope":"tenant"}'::jsonb, 'active', v_su),

    ('20000000-0000-0000-0000-000000000004'::uuid, v_tid,
     'GRP-PROJECTS',    'Project Management',
     'Project creation, WIP, milestones, timesheets, billing. Workspace: Projects.',
     v_meta || '{"workspace":"projects","scope":"company_code"}'::jsonb, 'active', v_su),

    ('20000000-0000-0000-0000-000000000005'::uuid, v_tid,
     'GRP-HR',          'Human Resources',
     'Employee master, payroll, leave, EOS, recruitment. Workspace: HR.',
     v_meta || '{"workspace":"hr","scope":"tenant"}'::jsonb, 'active', v_su),

    ('20000000-0000-0000-0000-000000000006'::uuid, v_tid,
     'GRP-IT-OPS',      'IT Operations',
     'NOC/SOC dashboards, managed services, incident management. Workspace: IT Ops.',
     v_meta || '{"workspace":"it_operations","scope":"company_code"}'::jsonb, 'active', v_su),

    ('20000000-0000-0000-0000-000000000007'::uuid, v_tid,
     'GRP-SALES',       'Sales & CRM',
     'Opportunities, quotes, customer management, revenue pipeline. Workspace: Sales.',
     v_meta || '{"workspace":"sales","scope":"tenant"}'::jsonb, 'active', v_su),

    ('20000000-0000-0000-0000-000000000008'::uuid, v_tid,
     'GRP-EXEC',        'Executive Dashboard',
     'Read-only access to KPIs, dashboards, reports across all entities. Workspace: Executive.',
     v_meta || '{"workspace":"executive","scope":"tenant","access":"read_only"}'::jsonb, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name=EXCLUDED.name, description=EXCLUDED.description,
        metadata=master.auth_group.metadata || jsonb_build_object('_seed',(EXCLUDED.metadata->'_seed')),
        updated_at=now(), updated_by=v_su;

    -- ══════════════════════════════════════════════════════════════════════
    -- GROUP MEMBERSHIPS — one user per group
    -- ══════════════════════════════════════════════════════════════════════

    -- auth_group_member has no metadata column; unique constraint is (tenant_id, principal_id, group_id)
    INSERT INTO master.auth_group_member (tenant_id, group_id, principal_id, created_by)
    VALUES
    (v_tid, '20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, v_su),  -- admin → GRP-ADMIN
    (v_tid, '20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, v_su),  -- CFO → GRP-FINANCE
    (v_tid, '20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, v_su),  -- procurement → GRP-PROCUREMENT
    (v_tid, '20000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000004'::uuid, v_su),  -- PM → GRP-PROJECTS
    (v_tid, '20000000-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000005'::uuid, v_su),  -- HR → GRP-HR
    (v_tid, '20000000-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000006'::uuid, v_su),  -- NOC → GRP-IT-OPS
    (v_tid, '20000000-0000-0000-0000-000000000007'::uuid, '10000000-0000-0000-0000-000000000007'::uuid, v_su),  -- Sales → GRP-SALES
    (v_tid, '20000000-0000-0000-0000-000000000008'::uuid, '10000000-0000-0000-0000-000000000008'::uuid, v_su)   -- CEO → GRP-EXEC
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- AUTH GROUP ROLES — link groups to platform roles with scope
    -- ══════════════════════════════════════════════════════════════════════
    -- Pattern: for each group, assign one or more shared.role rows with
    -- visibility_scope + assignment_scope_type.
    --
    -- This block uses a safe lookup pattern: it only inserts if the role
    -- code exists in shared.role. If your platform hasn't seeded these
    -- roles yet, the INSERT silently produces 0 rows (no error).

    INSERT INTO master.auth_group_role (tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, metadata, status, created_by)
    SELECT v_tid, g.id, r.id,
        v.vis_scope, v.assign_type, v.assign_ref,
        v.incl_desc, v_meta, 'active', v_su
    FROM (VALUES
        --  group_code,      role_code_pattern,       vis,   assign_type,      assign_ref, incl_desc
        -- ADMIN: full access, tenant scope
        ('GRP-ADMIN',       'tenant_admin',           'all', 'tenant',         NULL::uuid,  true),

        -- FINANCE: full finance access, tenant scope (all CCs)
        ('GRP-FINANCE',     'finance_manager',        'all', 'tenant',         NULL,        true),

        -- PROCUREMENT: procurement access, tenant scope
        ('GRP-PROCUREMENT', 'procurement_manager',    'all', 'tenant',         NULL,        true),

        -- PROJECTS: project access, scoped to SDTX company code
        ('GRP-PROJECTS',    'project_manager',        'all', 'company_code',   NULL,        true),

        -- HR: HR access, tenant scope
        ('GRP-HR',          'hr_manager',             'all', 'tenant',         NULL,        true),

        -- IT-OPS: operations access, scoped to SDTX
        ('GRP-IT-OPS',      'operations_lead',        'all', 'company_code',   NULL,        true),

        -- SALES: sales access, tenant scope
        ('GRP-SALES',       'sales_manager',          'all', 'tenant',         NULL,        true),

        -- EXEC: read-only, tenant scope
        ('GRP-EXEC',        'executive_viewer',       'all', 'tenant',         NULL,        true)
    ) AS v(group_code, role_code, vis_scope, assign_type, assign_ref, incl_desc)
    JOIN master.auth_group g ON g.tenant_id = v_tid AND g.code = v.group_code
    LEFT JOIN shared.role r ON r.code = v.role_code AND r.status = 'active'
    WHERE r.id IS NOT NULL  -- skip if platform role not yet seeded
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants)
    DO UPDATE SET visibility_scope=EXCLUDED.visibility_scope, updated_at=now(), updated_by=v_su;

    -- For company_code-scoped groups (PROJECTS, IT-OPS), wire assignment_scope_ref_id to SDTX
    UPDATE master.auth_group_role SET
        assignment_scope_ref_id = (SELECT id FROM master.company_code WHERE tenant_id=v_tid AND code='SDTX')
    WHERE tenant_id = v_tid
      AND assignment_scope_type = 'company_code'
      AND assignment_scope_ref_id IS NULL
      AND group_id IN (
          SELECT id FROM master.auth_group WHERE tenant_id=v_tid AND code IN ('GRP-PROJECTS','GRP-IT-OPS')
      );

    RAISE NOTICE '[001_rbac] 8 groups, 8 memberships, auth_group_role bindings seeded';
END $rbac$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  PART 18: VALIDATION ASSERTIONS                                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DO $validate$
DECLARE v_tid uuid; v_count int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[280] FAIL: tenant not found'; END IF;

    SELECT count(*) INTO v_count FROM master.legal_entity WHERE tenant_id=v_tid;
    IF v_count <> 4 THEN RAISE EXCEPTION '[280] FAIL: expected 4 LEs, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.company_code WHERE tenant_id=v_tid;
    IF v_count <> 4 THEN RAISE EXCEPTION '[280] FAIL: expected 4 CCs, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.chart_of_account WHERE tenant_id=v_tid;
    IF v_count <> 4 THEN RAISE EXCEPTION '[280] FAIL: expected 4 COAs, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.cost_center WHERE tenant_id=v_tid;
    IF v_count < 28 THEN RAISE EXCEPTION '[280] FAIL: expected >= 28 cost centers, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.profit_center WHERE tenant_id=v_tid;
    IF v_count < 22 THEN RAISE EXCEPTION '[280] FAIL: expected >= 22 profit centers, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.site WHERE tenant_id=v_tid;
    IF v_count <> 4 THEN RAISE EXCEPTION '[280] FAIL: expected 4 sites, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.warehouse WHERE tenant_id=v_tid;
    IF v_count <> 4 THEN RAISE EXCEPTION '[280] FAIL: expected 4 warehouses, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.fiscal_period WHERE tenant_id=v_tid;
    IF v_count < 104 THEN RAISE EXCEPTION '[280] FAIL: expected >= 104 fiscal periods, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.ledger_book WHERE tenant_id=v_tid;
    IF v_count <> 4 THEN RAISE EXCEPTION '[280] FAIL: expected 4 books, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.company_code_book_assignment WHERE tenant_id=v_tid;
    IF v_count <> 11 THEN RAISE EXCEPTION '[280] FAIL: expected 11 book assignments, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.company_code_chart_assignment WHERE tenant_id=v_tid;
    IF v_count <> 12 THEN RAISE EXCEPTION '[280] FAIL: expected 12 chart assignments, got %', v_count; END IF;

    -- Tax: 2 jurisdictions, 4 types (INDIRECT+WITHHOLDING only)
    SELECT count(*) INTO v_count FROM master.tax_jurisdiction WHERE tenant_id=v_tid;
    IF v_count <> 2 THEN RAISE EXCEPTION '[280] FAIL: expected 2 tax jurisdictions, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.tax_type WHERE tenant_id=v_tid;
    IF v_count <> 4 THEN RAISE EXCEPTION '[280] FAIL: expected 4 tax types, got %', v_count; END IF;

    -- FX: master.fx_rate (not exchange_rate)
    SELECT count(*) INTO v_count FROM master.fx_rate WHERE tenant_id=v_tid;
    IF v_count < 7 THEN RAISE EXCEPTION '[280] FAIL: expected >= 7 FX rates, got %', v_count; END IF;

    -- Payment terms: master.payment_term with DDL structure
    SELECT count(*) INTO v_count FROM master.payment_term WHERE tenant_id=v_tid;
    IF v_count < 10 THEN RAISE EXCEPTION '[280] FAIL: expected >= 10 payment terms, got %', v_count; END IF;

    -- RBAC: 8 groups, 8 principals, 8 memberships
    SELECT count(*) INTO v_count FROM master.principal WHERE tenant_id=v_tid AND id <> '00000000-0000-0000-0000-000000000000';
    IF v_count < 8 THEN RAISE EXCEPTION '[280] FAIL: expected >= 8 principals, got %', v_count; END IF;

    SELECT count(*) INTO v_count FROM master.auth_group WHERE tenant_id=v_tid;
    IF v_count <> 8 THEN RAISE EXCEPTION '[280] FAIL: expected 8 auth groups, got %', v_count; END IF;

    -- TEGY fiscal variant check
    IF NOT EXISTS (SELECT 1 FROM master.company_code WHERE tenant_id=v_tid AND code='TEGY' AND fiscal_year_variant='jul_jun') THEN
        RAISE EXCEPTION '[280] FAIL: TEGY fiscal_year_variant should be jul_jun'; END IF;

    -- Every CC has primary book + chart assignment
    -- company_code_book_assignment uses priority (not is_primary); priority=1 = primary book
    IF EXISTS (
        SELECT cc.code FROM master.company_code cc
        LEFT JOIN master.company_code_book_assignment ba ON ba.company_code_id=cc.id AND ba.tenant_id=cc.tenant_id AND ba.priority=1
        WHERE cc.tenant_id=v_tid AND ba.id IS NULL
    ) THEN RAISE EXCEPTION '[280] FAIL: some CCs missing primary book assignment'; END IF;

    IF EXISTS (
        SELECT cc.code FROM master.company_code cc
        LEFT JOIN master.company_code_chart_assignment ca ON ca.company_code_id=cc.id AND ca.tenant_id=cc.tenant_id AND ca.is_primary=true
        WHERE cc.tenant_id=v_tid AND ca.id IS NULL
    ) THEN RAISE EXCEPTION '[280] FAIL: some CCs missing primary chart assignment'; END IF;

    RAISE NOTICE '══════════════════════════════════════════════════════';
    RAISE NOTICE '[280] ALL ASSERTIONS PASSED — technosat-test ready';
    RAISE NOTICE '══════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '  1. Run technosat_test_ict_gl_robust.sql for COA-IFRS GL accounts';
    RAISE NOTICE '  2. Seed COA-SOCPA GL accounts for SSK1';
    RAISE NOTICE '  3. Seed COA-EAS GL accounts for TEGY/SDTX';
    RAISE NOTICE '  4. Seed master.address + address_link for LEs and sites';
    RAISE NOTICE '  5. Wire auth_group_role if platform roles not yet seeded';
END $validate$;


-- ════════════════════════════════════════════════════════════════════════════
-- WORKSPACE → GROUP → USER MAPPING REFERENCE
-- ════════════════════════════════════════════════════════════════════════════
-- ┌──────────────────┬───────────────────┬──────────────────────┬────────────┐
-- │ Workspace        │ Auth Group        │ User                 │ Scope      │
-- ├──────────────────┼───────────────────┼──────────────────────┼────────────┤
-- │ * (all)          │ GRP-ADMIN         │ admin@technostat.net │ tenant     │
-- │ Finance          │ GRP-FINANCE       │ cfo@technostat.net   │ tenant     │
-- │ Procurement      │ GRP-PROCUREMENT   │ procurement@...      │ tenant     │
-- │ Projects         │ GRP-PROJECTS      │ pm.sdtx@...          │ SDTX (CC)  │
-- │ HR               │ GRP-HR            │ hr@technostat.net    │ tenant     │
-- │ IT Operations    │ GRP-IT-OPS        │ noc@technostat.net   │ SDTX (CC)  │
-- │ Sales            │ GRP-SALES         │ sales@technostat.net │ tenant     │
-- │ Executive        │ GRP-EXEC          │ ceo@technostat.net   │ tenant (RO)│
-- └──────────────────┴───────────────────┴──────────────────────┴────────────┘
-- ════════════════════════════════════════════════════════════════════════════
