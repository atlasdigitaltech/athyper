-- ============================================================================
-- TECHNOSTAT GROUP — PRODUCTION TENANT SEED
-- ============================================================================
-- File:     003_technostat_production_seed.sql
-- Tenant:   technostat  (KC realm: athyper)
-- Version:  1.0.0
-- ============================================================================
--
-- EXECUTION ORDER:
--   PRE:   Lookup extension  — jul_jun FY variant
--   P01:   Tenant            — technostat
--   P02:   Legal entities    — 4 LEs (hierarchical)
--   P03:   Company codes     — TKSA · SSK · TEGY · SDTX
--   P04:   COA framework     — COA-IFRS-GROUP · COA-IFRS · COA-SOCPA · COA-EAS
--   P05:   GL pre-seed       — retained earnings + IC suspense per CC
--   P06:   Chart assignments — operating + group + local
--   P07:   Cost centres      — per company
--   P08:   Profit centres    — per company
--   P09:   Sites             — Riyadh · Cairo
--   P10:   Warehouses        — Riyadh · Cairo
--   P11:   Fiscal periods    — FY2025 (open) · FY2026 (future) per CC
--   P12:   Ledger books      — IFRS · SOCPA · EAS
--   P13:   Tax setup         — KSA VAT 15 % · EG VAT 14 % · WHT
--   P14:   FX rates          — SAR · EGP baseline
--   P15:   Payment terms     — Net30 · Net60 · Net90 · Retention
--   P16:   Asset classes     — IT-specific hierarchy
--   P17:   Principals        — 5 KC-compatible admin users (cc001000-… UUIDs)
--   P18:   Auth bindings     — keycloak identity bindings (stable KC UUIDs)
--   P19:   RBAC groups       — OWNER + ADMIN per tenant + per CC
--   P20:   Role assignments  — owner-* → OWNER groups · admin-* → ADMIN groups
--   P21:   Group members     — admin users → groups
--   P22:   Validation        — assertion checks
--
-- GROUP STRUCTURE:
--   Technostat Group (TKSA)       SA · SAR · IFRS   · Jan-Dec
--   ├── SSK Saudi (SSK)           SA · SAR · SOCPA  · Jan-Dec
--   ├── Technostat Egypt (TEGY)   EG · EGP · EAS    · Jul-Jun
--   │   └── Satellites DT (SDTX) EG · EGP · IFRS   · Jan-Dec
--
-- STABLE UUIDs:
--   KC org IDs  : bb000022 … bb000025 (continues from demo series)
--   KC user IDs : cc001000-0000-0000-0000-000000000001 … 000005
--     001 tksa.owner · 002 tksa.admin · 003 ssk.admin
--     004 tegy.admin · 005 sdtx.admin
--
-- Idempotent: ON CONFLICT DO UPDATE / DO NOTHING throughout.
-- Depends on: system bootstrap, universal platform seeds (currencies, countries,
--             shared.role codes, master.chart_of_account framework).
-- ============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PRE: LOOKUP EXTENSION — jul_jun FY variant                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

INSERT INTO control.lookup_value (domain_code, code, name, sort_order, created_by)
SELECT 'master.company_code_fy_variant', 'jul_jun', 'July–June', 60,
       '00000000-0000-0000-0000-000000000000'::uuid
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value
    WHERE domain_code = 'master.company_code_fy_variant' AND code = 'jul_jun'
);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P01: TENANT                                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p01$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    INSERT INTO master.tenant (
        code, name, display_name, realm_key, region, subscription,
        status, metadata, created_by
    ) VALUES (
        'technostat',
        'Technostat Group',
        'Technostat Group Holdings',
        'athyper',
        'MEA',
        'enterprise',
        'active',
        jsonb_build_object(
            '_seed', jsonb_build_object('pack', '003_prod', 'version', '1.0.0', 'seeded_at', now()::text),
            'group', jsonb_build_object(
                'subsidiary_count', 3,
                'countries', ARRAY['SA', 'EG'],
                'industries', ARRAY['ict', 'digital_transformation', 'construction'],
                'hq', jsonb_build_object(
                    'address', 'P.O. Box 305099 Riyadh 11361 Saudi Arabia',
                    'phone',   '+966 11 24 555 34',
                    'email',   'contactus@technostat.net',
                    'website', 'https://www.technostat.net'
                )
            )
        ),
        v_su
    )
    ON CONFLICT (realm_key, code) DO UPDATE SET
        name         = EXCLUDED.name,
        display_name = EXCLUDED.display_name,
        region       = EXCLUDED.region,
        subscription = EXCLUDED.subscription,
        status       = EXCLUDED.status,
        metadata     = master.tenant.metadata
                       || jsonb_build_object('_seed', (EXCLUDED.metadata->'_seed')),
        updated_at   = now(), updated_by = v_su
    WHERE (master.tenant.name, master.tenant.status)
       IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.status);

    RAISE NOTICE '[P01] technostat tenant ready (id=%)',
        (SELECT id FROM master.tenant WHERE code = 'technostat');
END $p01$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P02: LEGAL ENTITIES                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p02$
DECLARE
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_tid      uuid;
    v_le_tksa  uuid;
    v_le_tegy  uuid;
    v_meta     jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[P02] technostat tenant not found'; END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod', 'version', '1.0.0', 'seeded_at', now()::text));

    -- L1: Technostat Group KSA (holding)
    INSERT INTO master.legal_entity (
        tenant_id, code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct, regulatory_framework,
        incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-TKSA', 'Technostat Group',
        'Group holding — Riyadh. P.O. Box 305099, Riyadh 11361. +966 11 24 555 34. contactus@technostat.net',
        'SA', 'SAR', 'SAR', 'parent', NULL, 'full', 100.00, 'ifrs',
        '2000-01-01', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, metadata = master.legal_entity.metadata || (EXCLUDED.metadata->'_seed'),
        updated_at = now(), updated_by = v_su
    WHERE master.legal_entity.name IS DISTINCT FROM EXCLUDED.name;

    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TKSA';

    -- L2: SSK Saudi (construction subsidiary under TKSA)
    INSERT INTO master.legal_entity (
        tenant_id, code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct, regulatory_framework,
        incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-SSK', 'SSK Saudi',
        'Construction subsidiary — Riyadh. P.O. Box 305099, Riyadh 11361.',
        'SA', 'SAR', 'SAR', 'subsidiary', v_le_tksa, 'full', 100.00, 'local_gaap',
        '2017-06-01', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- L2: Technostat Egypt (trading subsidiary under TKSA)
    INSERT INTO master.legal_entity (
        tenant_id, code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct, regulatory_framework,
        incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-TEGY', 'Technostat Egypt',
        '1st District Services Zone, 5th Compound, New Cairo, Cairo, Egypt.',
        'EG', 'EGP', 'SAR', 'subsidiary', v_le_tksa, 'full', 100.00, 'local_gaap',
        '2018-09-20', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TEGY';

    -- L3: Satellites for Digital Transformation (subsidiary under TEGY)
    INSERT INTO master.legal_entity (
        tenant_id, code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct, regulatory_framework,
        incorporation_date, metadata, status, created_by)
    VALUES (v_tid, 'LE-SDTX', 'Satellites for Digital Transformation',
        'ICT & digital transformation — Cairo. IC service provider to Technostat Group.',
        'EG', 'EGP', 'SAR', 'subsidiary', v_le_tegy, 'full', 100.00, 'ifrs',
        '2022-01-10', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P02] 4 legal entities seeded for technostat';
END $p02$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P03: COMPANY CODES                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p03$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tid       uuid;
    v_le_tksa   uuid; v_le_ssk  uuid;
    v_le_tegy   uuid; v_le_sdtx uuid;
    v_meta      jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TKSA';
    SELECT id INTO v_le_ssk  FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SSK';
    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TEGY';
    SELECT id INTO v_le_sdtx FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod', 'version', '1.0.0', 'seeded_at', now()::text));

    INSERT INTO master.company_code (
        tenant_id, code, name, legal_entity_id,
        functional_currency, fiscal_year_start_month, fiscal_year_variant,
        regulatory_framework, is_intercompany_enabled,
        metadata, status, created_by)
    VALUES
    -- TKSA: Group HQ (SAR, Jan-Dec, IFRS)
    (v_tid, 'TKSA', 'Technostat Group HQ',
        v_le_tksa, 'SAR', 1, 'calendar', 'ifrs', true, v_meta, 'active', v_su),
    -- SSK: SSK Saudi (SAR, Jan-Dec, SOCPA)
    (v_tid, 'SSK',  'SSK Saudi Operations',
        v_le_ssk,  'SAR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),
    -- TEGY: Technostat Egypt (EGP, Jul-Jun, EAS)
    (v_tid, 'TEGY', 'Technostat Egypt Ops',
        v_le_tegy, 'EGP', 7, 'jul_jun', 'local_gaap', true, v_meta, 'active', v_su),
    -- SDTX: Satellites DT (EGP, Jan-Dec, IFRS)
    (v_tid, 'SDTX', 'Satellites Digital Transformation',
        v_le_sdtx, 'EGP', 1, 'calendar', 'ifrs', true, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P03] 4 company codes seeded: TKSA, SSK, TEGY, SDTX';
END $p03$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P04: CHART OF ACCOUNTS FRAMEWORK                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p04$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod', 'version', '1.0.0', 'seeded_at', now()::text));

    INSERT INTO master.chart_of_account (tenant_id, code, name, description, framework, country_code, metadata, status, created_by)
    VALUES
    (v_tid, 'COA-IFRS-GROUP', 'IFRS Group Consolidated',    'Group consolidation chart — maps to all IFRS companies.',           'ifrs',       NULL, v_meta, 'active', v_su),
    (v_tid, 'COA-IFRS',       'IFRS Operating Chart',       'Primary operating chart for TKSA (group HQ) and SDTX (ICT).',      'ifrs',       NULL, v_meta, 'active', v_su),
    (v_tid, 'COA-SOCPA',      'SOCPA Operating Chart',      'Saudi accounting standards chart for SSK construction operations.', 'local_gaap', 'SA', v_meta, 'active', v_su),
    (v_tid, 'COA-EAS',        'Egyptian Accounting Standards', 'EAS/local GAAP chart for Technostat Egypt trading operations.', 'local_gaap', 'EG', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, updated_at = now(), updated_by = v_su
    WHERE master.chart_of_account.name IS DISTINCT FROM EXCLUDED.name;

    RAISE NOTICE '[P04] 4 COA frameworks seeded for technostat';
END $p04$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P05: GL PRE-SEED — retained earnings + IC suspense per CC              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p05$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc   record;
    v_coa  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_gl', 'version', '1.0.0', 'seeded_at', now()::text));

    FOR v_cc IN
        SELECT cc.code AS cc_code, cc.regulatory_framework
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
    LOOP
        -- Resolve the operating COA for this CC
        SELECT coa.id INTO v_coa
        FROM master.chart_of_account coa
        WHERE coa.tenant_id = v_tid
          AND coa.code = CASE v_cc.regulatory_framework
                            WHEN 'ifrs'       THEN 'COA-IFRS'
                            WHEN 'us_gaap'    THEN 'COA-IFRS'
                            ELSE CASE WHEN v_cc.cc_code IN ('SSK') THEN 'COA-SOCPA'
                                      WHEN v_cc.cc_code IN ('TEGY') THEN 'COA-EAS'
                                      ELSE 'COA-IFRS'
                                 END
                         END;

        IF v_coa IS NULL THEN CONTINUE; END IF;

        -- Retained earnings (equity)
        INSERT INTO master.gl_account (
            tenant_id, chart_of_account_id,
            code, name, account_class, normal_balance, node_type,
            metadata, status, created_by)
        VALUES (v_tid, v_coa,
            v_cc.cc_code || '-3000', 'Retained Earnings',
            'equity', 'credit', 'posting', v_meta, 'active', v_su)
        ON CONFLICT (tenant_id, chart_of_account_id, code) DO NOTHING;

        -- IC suspense (asset)
        INSERT INTO master.gl_account (
            tenant_id, chart_of_account_id,
            code, name, account_class, normal_balance, node_type,
            metadata, status, created_by)
        VALUES (v_tid, v_coa,
            v_cc.cc_code || '-1999', 'Intercompany Suspense',
            'asset', 'debit', 'posting', v_meta, 'active', v_su)
        ON CONFLICT (tenant_id, chart_of_account_id, code) DO NOTHING;
    END LOOP;

    RAISE NOTICE '[P05] GL pre-seed (retained earnings + IC suspense) complete for technostat';
END $p05$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P06: CHART ASSIGNMENTS                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p06$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_charts', 'version', '1.0.0', 'seeded_at', now()::text));

    CREATE TEMP TABLE tmp_tstat_assign (
        cc_code     text NOT NULL,
        coa_code    text NOT NULL,
        assign_type text NOT NULL,
        is_primary  boolean NOT NULL
    ) ON COMMIT DROP;

    -- Operating (primary per CC)
    INSERT INTO tmp_tstat_assign VALUES
    ('TKSA', 'COA-IFRS',       'operating', true),
    ('SSK',  'COA-SOCPA',      'operating', true),
    ('TEGY', 'COA-EAS',        'operating', true),
    ('SDTX', 'COA-IFRS',       'operating', true);

    -- Group (all CCs → group chart)
    INSERT INTO tmp_tstat_assign VALUES
    ('TKSA', 'COA-IFRS-GROUP', 'group', false),
    ('SSK',  'COA-IFRS-GROUP', 'group', false),
    ('TEGY', 'COA-IFRS-GROUP', 'group', false),
    ('SDTX', 'COA-IFRS-GROUP', 'group', false);

    -- Local overlay: TKSA dual-reports under SOCPA (Saudi group disclosure)
    INSERT INTO tmp_tstat_assign VALUES
    ('TKSA', 'COA-SOCPA', 'local', false);

    INSERT INTO master.company_code_chart_assignment (
        tenant_id, company_code_id, chart_of_account_id,
        assignment_type, is_primary, effective_from,
        metadata, status, created_by)
    SELECT v_tid, cc.id, coa.id,
           a.assign_type, a.is_primary, CURRENT_DATE,
           v_meta, 'active', v_su
    FROM tmp_tstat_assign a
    JOIN master.company_code     cc  ON cc.tenant_id  = v_tid AND cc.code  = a.cc_code
    JOIN master.chart_of_account coa ON coa.tenant_id = v_tid AND coa.code = a.coa_code
    ON CONFLICT (tenant_id, company_code_id, chart_of_account_id, assignment_type)
    DO UPDATE SET
        is_primary     = EXCLUDED.is_primary,
        effective_from = EXCLUDED.effective_from,
        updated_at     = now(),
        updated_by     = v_su
    WHERE (master.company_code_chart_assignment.is_primary,
           master.company_code_chart_assignment.effective_from)
       IS DISTINCT FROM (EXCLUDED.is_primary, EXCLUDED.effective_from);

    RAISE NOTICE '[P06] 9 chart assignments seeded (4 operating, 4 group, 1 local)';
END $p06$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P07: COST CENTRES                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p07$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_tksa uuid; v_cc_ssk uuid; v_cc_tegy uuid; v_cc_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_cc', 'version', '1.0.0', 'seeded_at', now()::text));

    -- TKSA Group HQ cost centres
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description, node_type, cost_center_category, sort_order, metadata, status, created_by)
    VALUES
    (v_tid, v_cc_tksa, 'CC-TKSA',       'Technostat Group HQ',     'Root rollup',                              'header',  'admin',      10, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-EXEC',  'Executive Office',         'CEO, board, strategy',                     'posting', 'admin',      11, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-FIN',   'Group Finance & Treasury', 'CFO, consolidation, treasury, IC',         'posting', 'admin',      12, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-HR',    'Group HR & Admin',         'Recruitment, payroll, admin, facilities',  'posting', 'admin',      13, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-LEGAL', 'Group Legal & Compliance', 'Legal, regulatory, governance',            'posting', 'admin',      14, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-PROC',  'Group Procurement',        'Central sourcing, vendor management',      'posting', 'admin',      15, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'CC-TKSA-IT',    'Group IT',                 'Internal IT, infrastructure, support',     'posting', 'production', 16, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO NOTHING;

    UPDATE master.cost_center
    SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CC-TKSA'),
        path = 'CC-TKSA/' || code, level_no = 2
    WHERE tenant_id = v_tid AND company_code_id = v_cc_tksa AND code LIKE 'CC-TKSA-%' AND code <> 'CC-TKSA';

    -- SSK Saudi construction cost centres
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description, node_type, cost_center_category, sort_order, metadata, status, created_by)
    VALUES
    (v_tid, v_cc_ssk, 'CC-SSK',      'SSK Saudi',              'Root rollup',                                           'header',  'production', 20, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk, 'CC-SSK-OPS',  'Operations & Engineering','Project delivery, site operations, engineering',        'posting', 'production', 21, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk, 'CC-SSK-EQUIP','Equipment & Fleet',       'Heavy equipment, vehicles, maintenance yard',           'posting', 'production', 22, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk, 'CC-SSK-BD',   'Business Development',   'Sales, tenders, estimation',                            'posting', 'sales',      23, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk, 'CC-SSK-ADM',  'Administration',         'Finance, HR, admin',                                    'posting', 'admin',      24, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk, 'CC-SSK-HSE',  'HSE & Quality',          'Health, safety, environment, QA/QC',                   'posting', 'admin',      25, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO NOTHING;

    UPDATE master.cost_center
    SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CC-SSK'),
        path = 'CC-SSK/' || code, level_no = 2
    WHERE tenant_id = v_tid AND company_code_id = v_cc_ssk AND code LIKE 'CC-SSK-%' AND code <> 'CC-SSK';

    -- TEGY Egypt trading cost centres
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description, node_type, cost_center_category, sort_order, metadata, status, created_by)
    VALUES
    (v_tid, v_cc_tegy, 'CC-TEGY',      'Technostat Egypt',    'Root rollup',                                    'header',  'admin',      30, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-OPS',  'Trading Operations',  'Import/export, distribution, local trading',     'posting', 'production', 31, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-SALES','Sales & Marketing',   'Sales, customer relations',                      'posting', 'sales',      32, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-ADM',  'Administration',      'Finance, HR, admin',                             'posting', 'admin',      33, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'CC-TEGY-WHSE', 'Warehouse Operations','Receiving, storage, dispatch',                   'posting', 'production', 34, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO NOTHING;

    UPDATE master.cost_center
    SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CC-TEGY'),
        path = 'CC-TEGY/' || code, level_no = 2
    WHERE tenant_id = v_tid AND company_code_id = v_cc_tegy AND code LIKE 'CC-TEGY-%' AND code <> 'CC-TEGY';

    -- SDTX ICT/DT cost centres
    INSERT INTO master.cost_center (tenant_id, company_code_id, code, name, description, node_type, cost_center_category, sort_order, metadata, status, created_by)
    VALUES
    (v_tid, v_cc_sdtx, 'CC-SDTX',         'Satellites DT',             'Root rollup',                                                     'header',  'admin',      40, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-INFRA',   'Infrastructure Solutions',  'DC, network, NOC/SOC delivery',                                   'posting', 'production', 41, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-SOFT',    'Software & Apps',           'SW dev, mobile, ERP, SaaS products',                             'posting', 'production', 42, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-CONSULT', 'Consulting & ITIL',         'IT strategy, architecture, ITIL, cybersecurity advisory',        'posting', 'production', 43, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-SMART',   'Smart Solutions',           'IoT, BMS, smart city, surveillance',                             'posting', 'production', 44, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-HWRES',   'Hardware Resale',           'Servers, network gear, end-user devices',                        'posting', 'production', 45, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-BD',      'Business Development',      'Sales, pre-sales, proposals, client relations',                  'posting', 'sales',      46, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-PMO',     'PMO & Delivery',            'Project management, QA, delivery governance',                    'posting', 'admin',      47, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-RESRC',   'Resourcing & Outsourcing',  'Staff augmentation pool, managed outsourcing teams',             'posting', 'production', 48, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'CC-SDTX-ADM',     'Administration',            'Finance, HR, admin, facilities',                                 'posting', 'admin',      49, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO NOTHING;

    UPDATE master.cost_center
    SET parent_id = (SELECT id FROM master.cost_center WHERE tenant_id = v_tid AND code = 'CC-SDTX'),
        path = 'CC-SDTX/' || code, level_no = 2
    WHERE tenant_id = v_tid AND company_code_id = v_cc_sdtx AND code LIKE 'CC-SDTX-%' AND code <> 'CC-SDTX';

    RAISE NOTICE '[P07] Cost centres seeded for all 4 company codes';
END $p07$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P08: PROFIT CENTRES                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p08$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_meta jsonb;
    v_cc_tksa uuid; v_cc_ssk uuid; v_cc_tegy uuid; v_cc_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_pc', 'version', '1.0.0', 'seeded_at', now()::text));

    INSERT INTO master.profit_center (tenant_id, company_code_id, code, name, description, node_type, sort_order, metadata, status, created_by)
    VALUES
    -- TKSA
    (v_tid, v_cc_tksa, 'PC-TKSA',      'Technostat Group',         'Group consolidation profit centre',        'header',  10, v_meta, 'active', v_su),
    (v_tid, v_cc_tksa, 'PC-TKSA-CORP', 'Corporate & Treasury',     'HQ overhead, treasury income/expense',     'posting', 11, v_meta, 'active', v_su),
    -- SSK
    (v_tid, v_cc_ssk,  'PC-SSK',       'SSK Saudi',                'Construction division profit centre',      'header',  20, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk,  'PC-SSK-PROJ',  'Project Construction',     'Active project P&L',                       'posting', 21, v_meta, 'active', v_su),
    (v_tid, v_cc_ssk,  'PC-SSK-EQUIP', 'Equipment Rental',         'Equipment hire-out revenue',               'posting', 22, v_meta, 'active', v_su),
    -- TEGY
    (v_tid, v_cc_tegy, 'PC-TEGY',      'Technostat Egypt',         'Egypt trading profit centre',              'header',  30, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'PC-TEGY-TRAD', 'Trading Operations',       'Product trading P&L',                      'posting', 31, v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'PC-TEGY-DIST', 'Distribution',             'Logistics & distribution margin',          'posting', 32, v_meta, 'active', v_su),
    -- SDTX
    (v_tid, v_cc_sdtx, 'PC-SDTX',      'Satellites DT',            'ICT/DT division profit centre',            'header',  40, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-PROJ', 'Project Services',         'DC, network, NOC/SOC, consulting projects','posting', 41, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-MSVC', 'Managed Services',         'Recurring managed service contracts',      'posting', 42, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-SAAS', 'SaaS Products',            'Software subscription revenue',            'posting', 43, v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'PC-SDTX-HW',   'Hardware & Resale',        'Hardware sales and supply',                'posting', 44, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, company_code_id, code) DO NOTHING;

    RAISE NOTICE '[P08] Profit centres seeded for all 4 company codes';
END $p08$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P09: SITES                                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p09$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_tksa uuid; v_cc_ssk uuid; v_cc_tegy uuid; v_cc_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_sites', 'version', '1.0.0', 'seeded_at', now()::text));

    -- site_tenant_code_uq UNIQUE (tenant_id, code) — code is globally unique within tenant
    INSERT INTO master.site (tenant_id, company_code_id, code, name, site_type, country_code, timezone_code, metadata, status, created_by)
    VALUES
    (v_tid, v_cc_tksa, 'SITE-RUH-HQ',  'Riyadh Group HQ',        'office',     'SA', 'Asia/Riyadh',  v_meta, 'active', v_su),
    (v_tid, v_cc_ssk,  'SITE-RUH-SSK', 'Riyadh SSK Office',      'office',     'SA', 'Asia/Riyadh',  v_meta, 'active', v_su),
    (v_tid, v_cc_ssk,  'SITE-JED-SSK', 'Jeddah SSK Site',        'yard',       'SA', 'Asia/Riyadh',  v_meta, 'active', v_su),
    (v_tid, v_cc_tegy, 'SITE-CAI-TEGY','Cairo Technostat Office', 'office',     'EG', 'Africa/Cairo', v_meta, 'active', v_su),
    (v_tid, v_cc_sdtx, 'SITE-CAI-SDTX','Cairo SDTX Operations',  'office',     'EG', 'Africa/Cairo', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P09] 5 sites seeded (Riyadh + Jeddah + Cairo)';
END $p09$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P10: WAREHOUSES                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p10$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc_ssk uuid; v_cc_tegy uuid; v_cc_sdtx uuid;
    v_site_ruh_ssk uuid; v_site_cai_tegy uuid; v_site_cai_sdtx uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    SELECT id INTO v_cc_ssk   FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy  FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';
    SELECT id INTO v_site_ruh_ssk   FROM master.site WHERE tenant_id = v_tid AND code = 'SITE-RUH-SSK';
    SELECT id INTO v_site_cai_tegy  FROM master.site WHERE tenant_id = v_tid AND code = 'SITE-CAI-TEGY';
    SELECT id INTO v_site_cai_sdtx  FROM master.site WHERE tenant_id = v_tid AND code = 'SITE-CAI-SDTX';

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_wh', 'version', '1.0.0', 'seeded_at', now()::text));

    INSERT INTO master.warehouse (tenant_id, site_id, code, name, description, warehouse_type, metadata, status, created_by)
    VALUES
    (v_tid, v_site_ruh_ssk,  'WH-RUH-MAT', 'Riyadh Materials Store', 'Construction materials and equipment yard.',     'raw',           v_meta, 'active', v_su),
    (v_tid, v_site_ruh_ssk,  'WH-RUH-EQP', 'Riyadh Equipment Yard',  'Network, DC, and smart solution staging.',       'finished_goods', v_meta, 'active', v_su),
    (v_tid, v_site_cai_tegy, 'WH-CAI-TEGY','Cairo Trading Warehouse', 'Trading goods and IT equipment.',                'finished_goods', v_meta, 'active', v_su),
    (v_tid, v_site_cai_sdtx, 'WH-CAI-SDTX','Cairo ICT Stock Room',   'Equipment staging for DT project installations.','finished_goods', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, site_id, code) DO NOTHING;

    RAISE NOTICE '[P10] 4 warehouses seeded';
END $p10$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P11: FISCAL PERIODS — FY2025 (open) + FY2026 (future) per CC           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p11$
DECLARE
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_tid      uuid;
    v_meta     jsonb := '{"_seed": {"pack": "003_prod_fp", "version": "1.0.0"}}'::jsonb;
    v_cc       record;
    v_fy       int;
    v_fy_start date;
    v_fy_end   date;
    v_pstart   date;
    v_pend     date;
    v_pnum     int;
    v_status   text;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    FOR v_cc IN
        SELECT id, code, fiscal_year_start_month
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        FOR v_fy IN 2025..2026 LOOP
            v_fy_start := make_date(
                CASE WHEN v_cc.fiscal_year_start_month = 1 THEN v_fy ELSE v_fy - 1 END,
                v_cc.fiscal_year_start_month, 1);
            v_fy_end := (v_fy_start + interval '12 months' - interval '1 day')::date;
            v_status := CASE WHEN v_fy = 2025 THEN 'open' ELSE 'future' END;

            -- Period 0: opening balance
            INSERT INTO master.fiscal_period (tenant_id, company_code_id, code, name, fiscal_year, period_number, period_type, start_date, end_date, sort_order, status, created_by, metadata)
            VALUES (v_tid, v_cc.id, v_cc.code || '-' || v_fy || '-P00', 'FY' || v_fy || ' Opening Balance',
                    v_fy, 0, 'opening', v_fy_start, v_fy_start, 0, v_status, v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
            DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = EXCLUDED.status, updated_at = now(), updated_by = v_su;

            -- Periods 1-12: monthly
            FOR v_pnum IN 1..12 LOOP
                v_pstart := (v_fy_start + (v_pnum - 1) * interval '1 month')::date;
                v_pend   := (v_pstart + interval '1 month' - interval '1 day')::date;
                INSERT INTO master.fiscal_period (tenant_id, company_code_id, code, name, fiscal_year, period_number, period_type, start_date, end_date, sort_order, status, created_by, metadata)
                VALUES (v_tid, v_cc.id,
                        v_cc.code || '-' || v_fy || '-P' || lpad(v_pnum::text, 2, '0'),
                        'FY' || v_fy || ' Period ' || v_pnum || ' (' || to_char(v_pstart, 'Mon YYYY') || ')',
                        v_fy, v_pnum, 'normal', v_pstart, v_pend, v_pnum, v_status, v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
                DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now(), updated_by = v_su;
            END LOOP;

            -- Period 13: year-end adjustment
            INSERT INTO master.fiscal_period (tenant_id, company_code_id, code, name, fiscal_year, period_number, period_type, start_date, end_date, sort_order, status, created_by, metadata)
            VALUES (v_tid, v_cc.id, v_cc.code || '-' || v_fy || '-P13', 'FY' || v_fy || ' Year-End Adjustment',
                    v_fy, 13, 'adjustment', v_fy_end, v_fy_end, 13, 'future', v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
            DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, updated_at = now(), updated_by = v_su;
        END LOOP;
    END LOOP;

    RAISE NOTICE '[P11] Fiscal periods seeded: FY2025 (open) + FY2026 (future) for 4 company codes';
END $p11$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P12: LEDGER BOOKS + ASSIGNMENTS  (DDL-aligned)                          ║
-- ║  ledger_book:               category, base_currency_code, is_primary,    ║
-- ║                             close_mode, sort_order                        ║
-- ║  company_code_book_assignment: effective_from, priority,                 ║
-- ║                             conflict_strategy (all NOT NULL)              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p12$
DECLARE
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_tid      uuid;
    v_meta     jsonb;
    v_b_ifrs   uuid; v_b_socpa uuid; v_b_eas uuid; v_b_mgmt uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_lb', 'version', '2.0.0', 'seeded_at', now()::text));

    -- category: 'statutory' | 'management' | 'tax' | 'consolidation'
    -- close_mode: 'unified' | 'standalone'
    INSERT INTO master.ledger_book (tenant_id, code, name, description, category,
        base_currency_code, is_primary, close_mode, sort_order, metadata, status, created_by)
    VALUES
    (v_tid, 'BOOK-IFRS',  'IFRS Ledger',      'Primary IFRS reporting book — TKSA + SDTX',   'statutory',  'SAR', true,  'unified', 10, v_meta, 'active', v_su),
    (v_tid, 'BOOK-SOCPA', 'SOCPA Ledger',      'Saudi GAAP / SOCPA statutory book — SSK',     'statutory',  'SAR', false, 'unified', 20, v_meta, 'active', v_su),
    (v_tid, 'BOOK-EAS',   'EAS Ledger',        'Egyptian Accounting Standards — TEGY/SDTX',   'statutory',  'EGP', false, 'unified', 30, v_meta, 'active', v_su),
    (v_tid, 'BOOK-MGMT',  'Management Book',   'Group management reporting and analytics',    'management', 'SAR', false, 'unified', 40, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    SELECT id INTO v_b_ifrs  FROM master.ledger_book WHERE tenant_id = v_tid AND code = 'BOOK-IFRS';
    SELECT id INTO v_b_socpa FROM master.ledger_book WHERE tenant_id = v_tid AND code = 'BOOK-SOCPA';
    SELECT id INTO v_b_eas   FROM master.ledger_book WHERE tenant_id = v_tid AND code = 'BOOK-EAS';
    SELECT id INTO v_b_mgmt  FROM master.ledger_book WHERE tenant_id = v_tid AND code = 'BOOK-MGMT';

    -- effective_from, priority (lower = higher priority), conflict_strategy — all NOT NULL
    INSERT INTO master.company_code_book_assignment (tenant_id, company_code_id, book_id,
        effective_from, priority, conflict_strategy, metadata, status, created_by)
    SELECT v_tid, cc.id, book.id, '2025-01-01'::date, v.priority, 'highest_priority', v_meta, 'active', v_su
    FROM (VALUES
        ('TKSA', 'BOOK-IFRS',  1::smallint),
        ('TKSA', 'BOOK-SOCPA', 2::smallint),
        ('TKSA', 'BOOK-MGMT',  3::smallint),
        ('SSK',  'BOOK-SOCPA', 1::smallint),
        ('SSK',  'BOOK-IFRS',  2::smallint),
        ('SSK',  'BOOK-MGMT',  3::smallint),
        ('TEGY', 'BOOK-EAS',   1::smallint),
        ('TEGY', 'BOOK-IFRS',  2::smallint),
        ('SDTX', 'BOOK-IFRS',  1::smallint),
        ('SDTX', 'BOOK-EAS',   2::smallint),
        ('SDTX', 'BOOK-MGMT',  3::smallint)
    ) AS v(cc_code, book_code, priority)
    JOIN master.company_code cc   ON cc.tenant_id   = v_tid AND cc.code   = v.cc_code
    JOIN master.ledger_book  book ON book.tenant_id = v_tid AND book.code = v.book_code
    ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
        priority=EXCLUDED.priority, updated_at=now(), updated_by=v_su;

    RAISE NOTICE '[P12] 4 ledger books + 11 assignments seeded (DDL-aligned)';
END $p12$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P13: TAX SETUP — KSA VAT 15% · Egypt VAT 14% · WHT  (DDL-aligned)     ║
-- ║  tax_jurisdiction:   jurisdiction_type NOT NULL, level_no               ║
-- ║  tax_type:           category IN ('INDIRECT','WITHHOLDING',...)          ║
-- ║  control.tax_rate_schedule: structured identity, ON CONFLICT DO NOTHING  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p13$
DECLARE
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_tid      uuid;
    v_meta     jsonb;
    v_tj_sa    uuid; v_tj_eg   uuid;
    v_tt_vatsa uuid; v_tt_whtsa uuid;
    v_tt_vateg uuid; v_tt_whteg uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_tax', 'version', '2.0.0', 'seeded_at', now()::text));

    -- ── Tax Jurisdictions ────────────────────────────────────────────────────
    -- jurisdiction_type NOT NULL: COUNTRY | STATE | PROVINCE | CITY | DISTRICT | SPECIAL_ZONE | TREATY
    INSERT INTO master.tax_jurisdiction (tenant_id, code, name, description, country_code,
        jurisdiction_type, level_no, metadata, status, created_by)
    VALUES
    (v_tid, 'TJ-SA', 'Saudi Arabia', 'Kingdom of Saudi Arabia — ZATCA jurisdiction', 'SA', 'COUNTRY', 1, v_meta, 'active', v_su),
    (v_tid, 'TJ-EG', 'Egypt',        'Arab Republic of Egypt — ETA jurisdiction',    'EG', 'COUNTRY', 1, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=v_su;

    SELECT id INTO v_tj_sa FROM master.tax_jurisdiction WHERE tenant_id = v_tid AND code = 'TJ-SA';
    SELECT id INTO v_tj_eg FROM master.tax_jurisdiction WHERE tenant_id = v_tid AND code = 'TJ-EG';

    -- ── Tax Types (category CHECK: 'INDIRECT' | 'WITHHOLDING' | 'CUSTOMS_DUTY' | 'SURCHARGE') ─
    INSERT INTO master.tax_type (tenant_id, code, name, description,
        category, is_recoverable, is_deducted_at_source,
        is_included_in_price, is_compound_eligible, sort_order,
        metadata, status, created_by)
    VALUES
    (v_tid, 'VAT-SA', 'KSA VAT',   'Saudi VAT per ZATCA. Standard 15%, zero-rated 0%.',
     'INDIRECT',    true,  false, false, false, 10, v_meta, 'active', v_su),
    (v_tid, 'WHT-SA', 'KSA WHT',   'KSA WHT on non-resident payments. Art 68: 5/15/20%.',
     'WITHHOLDING', false, true,  false, false, 20, v_meta, 'active', v_su),
    (v_tid, 'VAT-EG', 'Egypt VAT', 'Egyptian VAT per ETA. Standard 14%.',
     'INDIRECT',    true,  false, false, false, 30, v_meta, 'active', v_su),
    (v_tid, 'WHT-EG', 'Egypt WHT', 'Egyptian WHT on services/royalties.',
     'WITHHOLDING', false, true,  false, false, 40, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        category=EXCLUDED.category, is_recoverable=EXCLUDED.is_recoverable,
        is_deducted_at_source=EXCLUDED.is_deducted_at_source,
        updated_at=now(), updated_by=v_su;

    SELECT id INTO v_tt_vatsa FROM master.tax_type WHERE tenant_id = v_tid AND code = 'VAT-SA';
    SELECT id INTO v_tt_whtsa FROM master.tax_type WHERE tenant_id = v_tid AND code = 'WHT-SA';
    SELECT id INTO v_tt_vateg FROM master.tax_type WHERE tenant_id = v_tid AND code = 'VAT-EG';
    SELECT id INTO v_tt_whteg FROM master.tax_type WHERE tenant_id = v_tid AND code = 'WHT-EG';

    -- ── Tax Rate Schedules (control schema; structured identity — no code/name cols) ─
    INSERT INTO control.tax_rate_schedule (
        tenant_id, jurisdiction_id, tax_type_id,
        tax_direction, rate_kind, rate_value,
        recoverability_mode, calculation_basis, rounding_stage,
        priority, description, effective_from,
        metadata, status, created_by)
    VALUES
    (v_tid, v_tj_sa, v_tt_vatsa, 'SALE',     'PERCENT', 15.00, 'NONE', 'LINE_NET', 'LINE',  0, 'KSA VAT 15% on sales',                   '2020-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_vatsa, 'PURCHASE', 'PERCENT', 15.00, 'FULL', 'LINE_NET', 'LINE',  0, 'KSA VAT 15% on purchases (recoverable)',  '2020-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_vatsa, 'SALE',     'PERCENT',  0.00, 'NONE', 'LINE_NET', 'LINE', 10, 'KSA VAT zero-rated/exempt',               '2020-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_whtsa, 'PAYMENT',  'PERCENT',  5.00, 'NONE', 'LINE_NET', 'LINE',  0, 'KSA WHT 5% technical services',          '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_whtsa, 'PAYMENT',  'PERCENT', 15.00, 'NONE', 'LINE_NET', 'LINE', 10, 'KSA WHT 15% royalties',                  '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_sa, v_tt_whtsa, 'PAYMENT',  'PERCENT', 20.00, 'NONE', 'LINE_NET', 'LINE', 20, 'KSA WHT 20% management fees',            '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_vateg, 'SALE',     'PERCENT', 14.00, 'NONE', 'LINE_NET', 'LINE',  0, 'Egypt VAT 14% on sales',                 '2017-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_vateg, 'PURCHASE', 'PERCENT', 14.00, 'FULL', 'LINE_NET', 'LINE',  0, 'Egypt VAT 14% on purchases (recoverable)','2017-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_vateg, 'SALE',     'PERCENT',  0.00, 'NONE', 'LINE_NET', 'LINE', 10, 'Egypt VAT exempt',                       '2017-07-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_whteg, 'PAYMENT',  'PERCENT',  5.00, 'NONE', 'LINE_NET', 'LINE',  0, 'Egypt WHT 5% domestic services',         '2020-01-01', v_meta, 'active', v_su),
    (v_tid, v_tj_eg, v_tt_whteg, 'PAYMENT',  'PERCENT', 20.00, 'NONE', 'LINE_NET', 'LINE', 10, 'Egypt WHT 20% non-resident royalties',   '2020-01-01', v_meta, 'active', v_su)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '[P13] 2 jurisdictions, 4 tax types, 11 rate schedules seeded (DDL-aligned)';
END $p13$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P14: FX RATES — SAR · EGP baseline  (DDL-aligned)                      ║
-- ║  rate_type: SPOT | PERIOD_AVG | PERIOD_END  (uppercase CHECK)            ║
-- ║  source: NOT NULL ('MANUAL' for seed data)                               ║
-- ║  inverse_rate: GENERATED ALWAYS — do not insert                          ║
-- ║  No unique index → ON CONFLICT DO NOTHING                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p14$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_fx', 'version', '2.0.0', 'seeded_at', now()::text));

    INSERT INTO master.fx_rate (tenant_id, from_currency, to_currency,
        rate, rate_type, effective_date, source, metadata, status, created_by)
    VALUES
    (v_tid, 'USD', 'SAR',  3.75000, 'SPOT',       '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'EGP', 'SAR',  0.07500, 'SPOT',       '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'USD', 'EGP', 48.75000, 'SPOT',       '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'USD', 'SAR',  3.75000, 'PERIOD_AVG', '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'EGP', 'SAR',  0.07800, 'PERIOD_AVG', '2025-01-01', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'USD', 'SAR',  3.75000, 'PERIOD_END', '2025-12-31', 'MANUAL', v_meta, 'active', v_su),
    (v_tid, 'EGP', 'SAR',  0.07500, 'PERIOD_END', '2025-12-31', 'MANUAL', v_meta, 'active', v_su)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '[P14] 7 FX rates seeded (SPOT + PERIOD_AVG + PERIOD_END)';
END $p14$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P15: PAYMENT TERMS  (DDL-aligned)                                       ║
-- ║  Requires: applicable_to, base_event, due_rule_type, term_category       ║
-- ║  ON CONFLICT: (tenant_id, code, version)                                 ║
-- ║  Discounts → master.payment_term_discount_tier (child table, seeded for  ║
-- ║  2/10 Net 30 only)                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p15$
DECLARE
    v_su     uuid := '00000000-0000-0000-0000-000000000000';
    v_tid    uuid;
    v_meta   jsonb;
    v_pt_210 uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_pt', 'version', '2.0.0', 'seeded_at', now()::text));

    -- Remove stale rows before re-seeding: DELETE bypasses the immutability BEFORE UPDATE
    -- trigger and avoids CHECK constraint violations on pre-existing rows with legacy values.
    DELETE FROM master.payment_term_discount_tier
    WHERE tenant_id = v_tid;

    DELETE FROM master.payment_term
    WHERE tenant_id = v_tid;

    INSERT INTO master.payment_term (tenant_id, code, name, description,
        applicable_to, base_event, due_rule_type, due_days,
        grace_days, term_category, sort_order,
        metadata, status, created_by)
    VALUES
    (v_tid, 'ADVANCE', 'Advance Payment',  '100% upfront before delivery',              'BOTH', 'CONTRACT_DATE', 'PREPAID',  NULL, 0, 'standard',  5, v_meta, 'active', v_su),
    (v_tid, 'NET-30',  'Net 30',           '30 days from invoice date',                 'BOTH', 'INVOICE_DATE',  'NET_DAYS',   30, 0, 'standard', 20, v_meta, 'active', v_su),
    (v_tid, 'NET-45',  'Net 45',           '45 days from invoice date',                 'BOTH', 'INVOICE_DATE',  'NET_DAYS',   45, 0, 'standard', 25, v_meta, 'active', v_su),
    (v_tid, 'NET-60',  'Net 60',           '60 days from invoice date',                 'BOTH', 'INVOICE_DATE',  'NET_DAYS',   60, 0, 'standard', 30, v_meta, 'active', v_su),
    (v_tid, 'NET-90',  'Net 90',           '90 days — typical government contracts',    'SALE', 'INVOICE_DATE',  'NET_DAYS',   90, 0, 'standard', 40, v_meta, 'active', v_su),
    (v_tid, 'NET-120', 'Net 120',          '120 days — extended gov/SOE terms',         'SALE', 'INVOICE_DATE',  'NET_DAYS',  120, 0, 'standard', 45, v_meta, 'active', v_su),
    (v_tid, '2-10-30', '2/10 Net 30',      '2% discount if paid within 10 days, net 30','BOTH', 'INVOICE_DATE', 'NET_DAYS',   30, 0, 'standard', 50, v_meta, 'active', v_su),
    (v_tid, 'EOM-30',  'End of Month +30', 'Due 30d after end of invoice month',        'BOTH', 'INVOICE_DATE',  'EOM',      NULL, 0, 'standard', 55, v_meta, 'active', v_su),
    (v_tid, 'MILEST',  'Milestone',        'Payment on project milestone completion',   'SALE', 'CONTRACT_DATE', 'COD',       NULL, 0, 'construction', 60, v_meta, 'active', v_su),
    (v_tid, 'RET-5',   '5% Retention',     '5% retention held until defects cleared',  'SALE', 'INVOICE_DATE',  'NET_DAYS',   30, 0, 'construction', 70, v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code, version) DO NOTHING;

    -- 2/10 Net 30 discount tier
    SELECT id INTO v_pt_210 FROM master.payment_term
    WHERE tenant_id = v_tid AND code = '2-10-30' AND is_current_version = true;
    IF v_pt_210 IS NOT NULL THEN
        INSERT INTO master.payment_term_discount_tier (tenant_id, payment_term_id, tier_no,
            qualify_within_days, discount_pct, discount_basis_mode, metadata, created_by)
        VALUES (v_tid, v_pt_210, 1, 10, 2.00, 'GROSS', v_meta, v_su)
        ON CONFLICT (payment_term_id, tier_no) DO UPDATE SET discount_pct=EXCLUDED.discount_pct;
    END IF;

    RAISE NOTICE '[P15] 10 payment terms + 1 discount tier seeded (DDL-aligned)';
END $p15$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P16: ASSET CLASSES — ICT-specific  (DDL-aligned)                        ║
-- ║  No parent_id column; company_code_id NOT NULL → loop per CC             ║
-- ║  useful_life_months + residual_pct go into depreciation_defaults JSONB   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p16$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_cc   record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_ac', 'version', '2.0.0', 'seeded_at', now()::text));

    FOR v_cc IN
        SELECT id AS cc_id, code AS cc_code, functional_currency AS ccy
        FROM master.company_code WHERE tenant_id = v_tid AND status = 'active'
    LOOP
        INSERT INTO master.asset_class (
            tenant_id, company_code_id, code, name, description,
            asset_nature, is_depreciable, currency_code,
            depreciation_defaults, sort_order, metadata, status, created_by)
        VALUES
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-IT',     'IT Equipment',             'Laptops, desktops, monitors, printers',      'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 36,  'residual_pct', 5.00),  10, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-SERVER',  'Servers & Storage',        'Rack servers, blades, NAS/SAN',              'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 60,  'residual_pct', 10.00), 12, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-NETWORK', 'Network Equipment',        'Switches, routers, firewalls, WLC',          'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 60,  'residual_pct', 5.00),  14, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-MOBILE',  'Mobile Devices',           'Phones, tablets for field engineers',        'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 24,  'residual_pct', 0.00),  20, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-FURN',    'Furniture & Fixtures',     'Office furniture, workstations',             'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 60,  'residual_pct', 10.00), 30, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-VEH',     'Vehicles',                 'Company vehicles and fleet',                 'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 60,  'residual_pct', 15.00), 35, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-LHI',     'Leasehold Improvements',   'Office fit-out, partitions, electrical',     'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 60,  'residual_pct', 0.00),  40, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-SWPROD',  'Capitalised Product Dev',  'IAS 38 capitalised software products',       'intangible', true,  v_cc.ccy, jsonb_build_object('useful_life_months', 60,  'residual_pct', 0.00),  50, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-LICACQ',  'Acquired Licences',        '3rd-party perpetual software licences',      'intangible', true,  v_cc.ccy, jsonb_build_object('useful_life_months', 36,  'residual_pct', 0.00),  55, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-PATENT',  'Patents & Trademarks',     'Registered IP assets',                       'intangible', true,  v_cc.ccy, jsonb_build_object('useful_life_months', 120, 'residual_pct', 0.00),  60, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-LAB',     'Lab & Demo Equipment',     'Demo racks, test servers, POC equipment',    'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 36,  'residual_pct', 5.00),  65, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-TOOLS',   'Tools & Test Equipment',   'Cable testers, OTDR, crimpers, meters',      'tangible',   true,  v_cc.ccy, jsonb_build_object('useful_life_months', 48,  'residual_pct', 5.00),  70, v_meta, 'active', v_su),
        (v_tid, v_cc.cc_id, v_cc.cc_code||'-AC-CWIP',    'Capital Work in Progress', 'Assets under construction / deployment',     'cwip',       false, v_cc.ccy, jsonb_build_object('useful_life_months', null,'residual_pct', null),  90, v_meta, 'active', v_su)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, depreciation_defaults=EXCLUDED.depreciation_defaults,
            updated_at=now(), updated_by=v_su;
    END LOOP;

    RAISE NOTICE '[P16] 13 asset classes × 4 company codes seeded (DDL-aligned)';
END $p16$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P17: KC-COMPATIBLE PRINCIPALS (5 admin users)                           ║
-- ║                                                                          ║
-- ║  KEY DESIGN: KC user UUID == DB principal UUID == subject_id             ║
-- ║  These principals are imported into KC via realm JSON with these exact   ║
-- ║  UUIDs, enabling zero-JIT binding on first login.                        ║
-- ║                                                                          ║
-- ║  UUID series (cc001000-…):                                               ║
-- ║    cc001000-0000-0000-0000-000000000001  tksa.owner                      ║
-- ║    cc001000-0000-0000-0000-000000000002  tksa.admin                      ║
-- ║    cc001000-0000-0000-0000-000000000003  ssk.admin                       ║
-- ║    cc001000-0000-0000-0000-000000000004  tegy.admin                      ║
-- ║    cc001000-0000-0000-0000-000000000005  sdtx.admin                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p17$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
    v_meta jsonb;
    v_stable_ids uuid[] := ARRAY[
        'cc001000-0000-0000-0000-000000000001'::uuid,
        'cc001000-0000-0000-0000-000000000002'::uuid,
        'cc001000-0000-0000-0000-000000000003'::uuid,
        'cc001000-0000-0000-0000-000000000004'::uuid,
        'cc001000-0000-0000-0000-000000000005'::uuid
    ];
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', '003_prod_principals', 'version', '1.0.0', 'seeded_at', now()::text));

    -- Remove any JIT-created principals that conflict with stable UUIDs
    DELETE FROM master.principal p
    USING master.principal_profile pp
    WHERE pp.principal_id = p.id
      AND p.tenant_id     = v_tid
      AND p.principal_source = 'oidc_jit'
      AND pp.keycloak_id::uuid = ANY(v_stable_ids)
      AND p.id            <> ALL(v_stable_ids);

    -- STAGE A: master.principal
    INSERT INTO master.principal (id, tenant_id, code, name, login_email,
        principal_type, is_locked, is_service_account,
        principal_source, metadata, status, created_by)
    VALUES
    ('cc001000-0000-0000-0000-000000000001', v_tid,
     'tksa.owner', 'Technostat Group Owner', 'tksa.owner@technostat.net',
     'user', false, false, 'oidc_jit', v_meta, 'active', v_su),

    ('cc001000-0000-0000-0000-000000000002', v_tid,
     'tksa.admin', 'Technostat Group Admin', 'tksa.admin@technostat.net',
     'user', false, false, 'oidc_jit', v_meta, 'active', v_su),

    ('cc001000-0000-0000-0000-000000000003', v_tid,
     'ssk.admin', 'SSK Saudi Admin', 'ssk.admin@technostat.net',
     'user', false, false, 'oidc_jit', v_meta, 'active', v_su),

    ('cc001000-0000-0000-0000-000000000004', v_tid,
     'tegy.admin', 'Technostat Egypt Admin', 'tegy.admin@technostat.net',
     'user', false, false, 'oidc_jit', v_meta, 'active', v_su),

    ('cc001000-0000-0000-0000-000000000005', v_tid,
     'sdtx.admin', 'Satellites DT Admin', 'sdtx.admin@technostat.net',
     'user', false, false, 'oidc_jit', v_meta, 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- STAGE B: master.principal_profile
    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by)
    VALUES
    (v_tid, 'cc001000-0000-0000-0000-000000000001',
     'Technostat', 'Group Owner', 'Technostat Group Owner',
     'cc001000-0000-0000-0000-000000000001', 'tksa.owner', 'synced', v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000002',
     'Technostat', 'Group Admin', 'Technostat Group Admin',
     'cc001000-0000-0000-0000-000000000002', 'tksa.admin', 'synced', v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000003',
     'SSK', 'Admin', 'SSK Saudi Admin',
     'cc001000-0000-0000-0000-000000000003', 'ssk.admin',  'synced', v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000004',
     'Technostat', 'Egypt Admin', 'Technostat Egypt Admin',
     'cc001000-0000-0000-0000-000000000004', 'tegy.admin', 'synced', v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000005',
     'Satellites', 'DT Admin', 'Satellites DT Admin',
     'cc001000-0000-0000-0000-000000000005', 'sdtx.admin', 'synced', v_su)
    ON CONFLICT (tenant_id, principal_id) DO UPDATE SET
        keycloak_id          = EXCLUDED.keycloak_id,
        keycloak_sync_status = EXCLUDED.keycloak_sync_status,
        given_name           = EXCLUDED.given_name,
        family_name          = EXCLUDED.family_name,
        display_name         = EXCLUDED.display_name;

    -- STAGE C: master.principal_identity_binding
    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by)
    VALUES
    (v_tid, 'cc001000-0000-0000-0000-000000000001', 'keycloak', 'cc001000-0000-0000-0000-000000000001', 'tksa.owner', 'synced', true, true, now(), v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000002', 'keycloak', 'cc001000-0000-0000-0000-000000000002', 'tksa.admin', 'synced', true, true, now(), v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000003', 'keycloak', 'cc001000-0000-0000-0000-000000000003', 'ssk.admin',  'synced', true, true, now(), v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000004', 'keycloak', 'cc001000-0000-0000-0000-000000000004', 'tegy.admin', 'synced', true, true, now(), v_su),
    (v_tid, 'cc001000-0000-0000-0000-000000000005', 'keycloak', 'cc001000-0000-0000-0000-000000000005', 'sdtx.admin', 'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING;

    RAISE NOTICE '[P17] 5 KC-compatible principals seeded: tksa.owner, tksa.admin, ssk.admin, tegy.admin, sdtx.admin';
END $p17$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P18 + P19: RBAC GROUPS + ROLE ASSIGNMENTS                               ║
-- ║                                                                          ║
-- ║  Pattern mirrors athyper demo:                                           ║
-- ║    TECHNOSTAT-OWNER / TECHNOSTAT-ADMIN  — tenant-wide scope              ║
-- ║    TKSA-OWNER / TKSA-ADMIN              — CC scope (TKSA)                ║
-- ║    SSK-OWNER  / SSK-ADMIN               — CC scope (SSK)                 ║
-- ║    TEGY-OWNER / TEGY-ADMIN              — CC scope (TEGY)                ║
-- ║    SDTX-OWNER / SDTX-ADMIN              — CC scope (SDTX)                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p18_p19$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    -- ── Tenant-level groups (2) ──────────────────────────────────────────────
    INSERT INTO master.auth_group (tenant_id, code, name, description, is_system, is_self_service_eligible, created_by)
    VALUES
    (v_tid, 'TECHNOSTAT-OWNER', 'Technostat Group Owner',
     'Full operational control for Technostat Group. Assigned all owner-* roles.',
     true, false, v_su),
    (v_tid, 'TECHNOSTAT-ADMIN', 'Technostat Group Administrator',
     'Administrative access for Technostat Group. Assigned all admin-* roles.',
     true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ── CC-level groups (8) ──────────────────────────────────────────────────
    INSERT INTO master.auth_group (tenant_id, code, name, description, is_system, is_self_service_eligible, created_by)
    VALUES
    (v_tid, 'TKSA-OWNER', 'TKSA Owner', 'Full operational control for TKSA (Technostat Group HQ).',   true, false, v_su),
    (v_tid, 'TKSA-ADMIN', 'TKSA Administrator', 'Administrative access for TKSA.',                    true, false, v_su),
    (v_tid, 'SSK-OWNER',  'SSK Owner',  'Full operational control for SSK (SSK Saudi).',              true, false, v_su),
    (v_tid, 'SSK-ADMIN',  'SSK Administrator',  'Administrative access for SSK.',                     true, false, v_su),
    (v_tid, 'TEGY-OWNER', 'TEGY Owner', 'Full operational control for TEGY (Technostat Egypt).',      true, false, v_su),
    (v_tid, 'TEGY-ADMIN', 'TEGY Administrator', 'Administrative access for TEGY.',                    true, false, v_su),
    (v_tid, 'SDTX-OWNER', 'SDTX Owner', 'Full operational control for SDTX (Satellites DT).',        true, false, v_su),
    (v_tid, 'SDTX-ADMIN', 'SDTX Administrator', 'Administrative access for SDTX.',                   true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[P18] 10 RBAC groups created (2 tenant-level + 8 CC-level)';

    -- ── P19a: owner-* roles → tenant-level OWNER group (scope=tenant) ────────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, created_by)
    SELECT
        pg.tenant_id, pg.id, r.id,
        'all', 'tenant', v_su
    FROM master.auth_group pg
    CROSS JOIN shared.role r
    WHERE pg.tenant_id = v_tid
      AND pg.code = 'TECHNOSTAT-OWNER'
      AND r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants)
    DO NOTHING;

    -- ── P19b: admin-* roles → tenant-level ADMIN group (scope=tenant) ────────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, created_by)
    SELECT
        pg.tenant_id, pg.id, r.id,
        'all', 'tenant', v_su
    FROM master.auth_group pg
    CROSS JOIN shared.role r
    WHERE pg.tenant_id = v_tid
      AND pg.code = 'TECHNOSTAT-ADMIN'
      AND r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants)
    DO NOTHING;

    -- ── P19c: owner-* roles → CC-level OWNER groups (scope=company_code) ─────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        created_by)
    SELECT
        pg.tenant_id, pg.id, r.id,
        'all', 'company_code',
        cc.id,
        v_su
    FROM master.auth_group pg
    JOIN master.company_code cc
        ON cc.tenant_id = pg.tenant_id
       AND cc.code = split_part(pg.code, '-OWNER', 1)
    CROSS JOIN shared.role r
    WHERE pg.tenant_id = v_tid
      AND pg.code IN ('TKSA-OWNER', 'SSK-OWNER', 'TEGY-OWNER', 'SDTX-OWNER')
      AND r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants)
    DO NOTHING;

    -- ── P19d: admin-* roles → CC-level ADMIN groups (scope=company_code) ─────
    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        created_by)
    SELECT
        pg.tenant_id, pg.id, r.id,
        'all', 'company_code',
        cc.id,
        v_su
    FROM master.auth_group pg
    JOIN master.company_code cc
        ON cc.tenant_id = pg.tenant_id
       AND cc.code = split_part(pg.code, '-ADMIN', 1)
    CROSS JOIN shared.role r
    WHERE pg.tenant_id = v_tid
      AND pg.code IN ('TKSA-ADMIN', 'SSK-ADMIN', 'TEGY-ADMIN', 'SDTX-ADMIN')
      AND r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants)
    DO NOTHING;

    RAISE NOTICE '[P19] Role assignments complete (owner-*/admin-* → all groups)';
END $p18_p19$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P20: GROUP MEMBERSHIPS                                                  ║
-- ║                                                                          ║
-- ║    tksa.owner → TECHNOSTAT-OWNER  (tenant-wide)                         ║
-- ║    tksa.admin → TECHNOSTAT-ADMIN  (tenant-wide)                         ║
-- ║    tksa.admin → TKSA-ADMIN        (CC scope)                            ║
-- ║    ssk.admin  → SSK-ADMIN         (CC scope)                            ║
-- ║    tegy.admin → TEGY-ADMIN        (CC scope)                            ║
-- ║    sdtx.admin → SDTX-ADMIN        (CC scope)                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p20$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';

    INSERT INTO master.auth_group_member (tenant_id, principal_id, group_id, joined_at, added_by, created_by)
    SELECT
        v_tid, p.id, pg.id,
        now(), v_su, v_su
    FROM (VALUES
        ('tksa.owner', 'TECHNOSTAT-OWNER'),
        ('tksa.admin', 'TECHNOSTAT-ADMIN'),
        ('tksa.admin', 'TKSA-ADMIN'),
        ('ssk.admin',  'SSK-ADMIN'),
        ('tegy.admin', 'TEGY-ADMIN'),
        ('sdtx.admin', 'SDTX-ADMIN')
    ) AS v(principal_code, group_code)
    JOIN master.principal  p  ON p.tenant_id  = v_tid AND p.code  = v.principal_code
    JOIN master.auth_group pg ON pg.tenant_id = v_tid AND pg.code = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[P20] 6 group memberships seeded for Technostat principals';
END $p20$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  P22: VALIDATION                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $p22$
DECLARE
    v_tid    uuid;
    v_les    int; v_ccs    int; v_fps  int;
    v_princs int; v_binds  int; v_grps int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[P22] technostat tenant missing'; END IF;

    SELECT count(*) INTO v_les   FROM master.legal_entity   WHERE tenant_id = v_tid;
    SELECT count(*) INTO v_ccs   FROM master.company_code   WHERE tenant_id = v_tid;
    SELECT count(*) INTO v_fps   FROM master.fiscal_period  WHERE tenant_id = v_tid;
    SELECT count(*) INTO v_princs FROM master.principal     WHERE tenant_id = v_tid
        AND id IN (
            'cc001000-0000-0000-0000-000000000001'::uuid,
            'cc001000-0000-0000-0000-000000000002'::uuid,
            'cc001000-0000-0000-0000-000000000003'::uuid,
            'cc001000-0000-0000-0000-000000000004'::uuid,
            'cc001000-0000-0000-0000-000000000005'::uuid
        );
    SELECT count(*) INTO v_binds FROM master.principal_identity_binding pib
        JOIN master.principal p ON p.id = pib.principal_id
        WHERE p.tenant_id = v_tid AND pib.provider_code = 'keycloak';
    SELECT count(*) INTO v_grps  FROM master.auth_group  WHERE tenant_id = v_tid;

    IF v_les   <  4 THEN RAISE EXCEPTION '[P22] Expected ≥4 legal entities, got %', v_les; END IF;
    IF v_ccs   <  4 THEN RAISE EXCEPTION '[P22] Expected ≥4 company codes, got %',  v_ccs; END IF;
    IF v_fps   < 56 THEN RAISE EXCEPTION '[P22] Expected ≥56 fiscal periods (4 CCs × 14), got %', v_fps; END IF;
    IF v_princs < 5 THEN RAISE EXCEPTION '[P22] Expected 5 KC-compatible principals, got %', v_princs; END IF;
    IF v_binds  < 5 THEN RAISE EXCEPTION '[P22] Expected 5 KC identity bindings, got %', v_binds; END IF;
    IF v_grps  < 10 THEN RAISE EXCEPTION '[P22] Expected ≥10 RBAC groups, got %', v_grps; END IF;

    RAISE NOTICE '=== [P22] Technostat Production Seed Validated ===';
    RAISE NOTICE '  Legal entities:   %', v_les;
    RAISE NOTICE '  Company codes:    %', v_ccs;
    RAISE NOTICE '  Fiscal periods:   %', v_fps;
    RAISE NOTICE '  KC principals:    %', v_princs;
    RAISE NOTICE '  KC auth bindings: %', v_binds;
    RAISE NOTICE '  RBAC groups:      %', v_grps;
    RAISE NOTICE '  Tenant ID:        %', v_tid;
END $p22$;
