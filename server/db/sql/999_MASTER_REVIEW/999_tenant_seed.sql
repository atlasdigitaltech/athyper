-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/000_tenant/000_athyper_tenant.sql
-- ============================================================================
-- ATHYPER GROUP — BLUEPRINT TENANT SETUP
-- ============================================================================
-- File:     000_athyper_tenant.sql
-- Schema:   master.tenant
-- Purpose:  Ensure the ATHYPER blueprint tenant exists before any Tier 2/3 seed
-- Depends:  000_public/000_bootstrap.sql (system principal)
-- Idempotent: Yes — ON CONFLICT DO UPDATE
-- ============================================================================

DO $tenant$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';  -- system principal
BEGIN

    INSERT INTO master.tenant (
        code, name, display_name, realm_key, region, subscription,
        status, metadata, created_by
    ) VALUES (
        'athyper',
        'Athyper Group',
        'Athyper Group Holdings',
        'athyper',
        'GCC',
        'enterprise',
        'active',
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack',      '000_tenant',
                'version',   '1.0.0',
                'seeded_at', now()::text
            ),
            'group', jsonb_build_object(
                'subsidiary_count', 16,
                'industries', ARRAY[
                    'utilities', 'construction', 'real_estate', 'transport',
                    'trading', 'hospitality', 'infocomm', 'financial',
                    'mfg_textile', 'mfg_food_bev', 'mfg_pharma', 'mfg_electronics',
                    'mining_petroleum', 'agriculture', 'education', 'healthcare'
                ]
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
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack',      '000_tenant',
                              'version',   '1.0.0',
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.tenant.realm_key, master.tenant.name, master.tenant.display_name,
           master.tenant.region, master.tenant.subscription,
           master.tenant.status)
       IS DISTINCT FROM
          (EXCLUDED.realm_key, EXCLUDED.name, EXCLUDED.display_name,
           EXCLUDED.region, EXCLUDED.subscription,
           EXCLUDED.status);

    RAISE NOTICE '[000_tenant] ATHYPER tenant ready (id=%)',
        (SELECT id FROM master.tenant WHERE code = 'athyper');

END $tenant$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/000_tenant/001_athyper_tenant_profile.sql
-- ============================================================================
-- ATHYPER GROUP — TENANT PROFILE SEED
-- ============================================================================
-- File:     001_athyper_tenant_profile.sql
-- Schema:   master.tenant_profile
-- Purpose:  Seed locale, fiscal, and formatting defaults for the ATHYPER
--           blueprint tenant. All values can be overridden by principal_ui_profile.
-- Depends:  000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id) DO UPDATE
-- ============================================================================

DO $tenant_profile$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
BEGIN

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[001_athyper_tenant_profile] ATHYPER tenant not found — run 000_athyper_tenant.sql first';
    END IF;

    INSERT INTO master.tenant_profile (
        tenant_id,
        country_code,
        currency_code,
        reporting_currency_code,
        locale_code,
        timezone_code,
        language_code,
        fiscal_year_start_month,
        date_format,
        number_format,
        week_start,
        weekend_days,
        created_by
    ) VALUES (
        v_tenant_id,
        'AE',           -- UAE (primary HQ)
        'AED',          -- UAE Dirham
        'USD',          -- Report in USD
        'en',
        'Asia/Dubai',
        'en',
        1,              -- Fiscal year starts January
        '%d/%m/%Y',     -- DD/MM/YYYY
        '#,##0.00',
        6,              -- Week starts Saturday (0=Sun…6=Sat)
        ARRAY[5, 6]::smallint[],  -- Fri + Sat weekend (GCC standard)
        v_su
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        country_code            = EXCLUDED.country_code,
        currency_code           = EXCLUDED.currency_code,
        reporting_currency_code = EXCLUDED.reporting_currency_code,
        locale_code             = EXCLUDED.locale_code,
        timezone_code           = EXCLUDED.timezone_code,
        language_code           = EXCLUDED.language_code,
        fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
        date_format             = EXCLUDED.date_format,
        number_format           = EXCLUDED.number_format,
        week_start              = EXCLUDED.week_start,
        weekend_days            = EXCLUDED.weekend_days,
        updated_at              = now(),
        updated_by              = v_su
    WHERE (
        master.tenant_profile.country_code,
        master.tenant_profile.currency_code,
        master.tenant_profile.locale_code,
        master.tenant_profile.timezone_code,
        master.tenant_profile.fiscal_year_start_month
    ) IS DISTINCT FROM (
        EXCLUDED.country_code,
        EXCLUDED.currency_code,
        EXCLUDED.locale_code,
        EXCLUDED.timezone_code,
        EXCLUDED.fiscal_year_start_month
    );

    RAISE NOTICE '[001_athyper_tenant_profile] ATHYPER tenant_profile seeded (id=%)', v_tenant_id;

END $tenant_profile$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/000_tenant/002_demo_tenants.sql
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

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/199_gl_preseed.sql
-- ============================================================================
-- ATHYPER GROUP — GL PRE-SEED: INDEX, LEGAL ENTITIES & COMPANY CODES
-- ============================================================================
-- File:     199_gl_preseed.sql
-- Schemas:  master.gl_account (index), master.legal_entity, master.company_code
-- Purpose:  (A) Tenant-wide unique index on gl_account for resolver safety,
--           (B) MV redefinition with display_no column (§17.4),
--           (C) 17 legal entities (1 holding + 16 subsidiaries),
--           (D) 17 company codes (all posting companies incl. group HQ)
-- Depends:  000_tenant/000_athyper_tenant.sql
-- Idempotent: Yes — CREATE INDEX IF NOT EXISTS + ON CONFLICT DO UPDATE
-- Spec ref: §17.2 (GL index), §17.4 (MV display_no), §18.2 (entities & cos)
-- ============================================================================

-- §17.2 Tenant-wide unique GL account code (resolver safety net)
-- DDL must live outside DO blocks.
CREATE UNIQUE INDEX IF NOT EXISTS gl_account_tenant_code_uq
    ON master.gl_account (tenant_id, code);

-- §17.4 MV redefinition — add display_no column for hybrid code strategy.
-- The live DDL baseline only exposes account_code + account_name.
-- The hybrid strategy requires display_no (local statutory number) for UI/reports.
-- This MUST land before any GL seed is consumed by the UI/runtime.
DROP MATERIALIZED VIEW IF EXISTS master.mv_company_postable_account;

CREATE MATERIALIZED VIEW master.mv_company_postable_account AS
SELECT
    cc.id           AS company_code_id,
    cc.tenant_id,
    cc.code         AS company_code,
    ga.id           AS gl_account_id,
    ga.code         AS account_code,
    ga.name         AS account_name,
    (ga.metadata->>'_display_no')  AS display_no,
    ga.account_class,
    ga.normal_balance,
    ga.subledger_type,
    COALESCE(ccga.posting_allowed, true)          AS posting_allowed,
    COALESCE(ccga.blocked_for_manual, false)      AS blocked_for_manual,
    COALESCE(ccga.blocked_for_auto, false)        AS blocked_for_auto,
    COALESCE(ccga.requires_cost_center, false)    AS requires_cost_center,
    COALESCE(ccga.requires_profit_center, false)  AS requires_profit_center,
    COALESCE(ccga.requires_project, false)        AS requires_project,
    ccga.default_cost_center_id,
    ccga.default_site_id,
    ccga.tax_category,
    ccga.reconciliation_type
FROM master.company_code cc
JOIN master.company_code_chart_assignment cca
    ON cca.company_code_id = cc.id
    AND cca.assignment_type = 'operating'
    AND cca.status = 'active'
JOIN master.gl_account ga
    ON ga.chart_of_account_id = cca.chart_of_account_id
    AND ga.is_active = true
    AND ga.node_type = 'posting'
LEFT JOIN master.company_code_gl_account ccga
    ON ccga.company_code_id = cc.id
    AND ccga.gl_account_id = ga.id
WHERE cc.is_active = true
  AND COALESCE(ccga.posting_allowed, true) = true
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_cpa_lookup_idx
    ON master.mv_company_postable_account (tenant_id, company_code_id, account_code);
CREATE INDEX IF NOT EXISTS mv_cpa_account_idx
    ON master.mv_company_postable_account (tenant_id, company_code_id, gl_account_id);
CREATE INDEX IF NOT EXISTS mv_cpa_class_idx
    ON master.mv_company_postable_account (tenant_id, company_code_id, account_class);

COMMENT ON MATERIALIZED VIEW master.mv_company_postable_account IS
    'Cached set of GL accounts postable per company_code. '
    'Includes display_no (metadata._display_no) for hybrid code strategy. '
    'REFRESH MATERIALIZED VIEW CONCURRENTLY after chart/account/ccga changes.';

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '199_gl_preseed';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_le_count int;
    v_cc_count int;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Legal Entities (17 rows)
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_le (
        seed_id               uuid DEFAULT shared.uuidv7(),
        code                  text NOT NULL,
        name                  text NOT NULL,
        description           text,
        country_code          char(2) NOT NULL,
        functional_currency   char(3) NOT NULL,
        reporting_currency    char(3) NOT NULL,
        entity_type           text NOT NULL,
        parent_code           text,            -- NULL for holding
        consolidation_method  text NOT NULL DEFAULT 'full',
        ownership_pct         numeric NOT NULL DEFAULT 100.00,
        regulatory_framework  text NOT NULL
    ) ON COMMIT DROP;

    -- B1: Holding (root)
    INSERT INTO tmp_le (code, name, description, country_code, functional_currency, reporting_currency, entity_type, parent_code, regulatory_framework, ownership_pct) VALUES
    ('LE-ATHQ', 'Athyper Group Holdings',                      'Group holding company',                                'MY', 'MYR', 'MYR', 'parent',     NULL,      'ifrs',       100.00);

    -- B2: Subsidiaries (16)
    INSERT INTO tmp_le (code, name, description, country_code, functional_currency, reporting_currency, entity_type, parent_code, regulatory_framework) VALUES
    ('LE-AMRE', 'Athyper Malaysia Real Estate',                'Malaysia real estate subsidiary',                       'MY', 'MYR', 'MYR', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-AQTU', 'Athyper Qatar Utilities',                     'Qatar utilities subsidiary',                            'QA', 'QAR', 'QAR', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-ASAC', 'Athyper Saudi Construction',                  'Saudi construction subsidiary',                         'SA', 'SAR', 'SAR', 'subsidiary', 'LE-ATHQ', 'local_gaap'),
    ('LE-AQTS', 'Athyper Qatar Transport & Storage',           'Qatar transport & storage subsidiary',                  'QA', 'QAR', 'QAR', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-AUET', 'Athyper UAE Trading',                         'UAE trading subsidiary',                                'AE', 'AED', 'AED', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-ASAH', 'Athyper Saudi Hospitality',                   'Saudi hospitality subsidiary',                          'SA', 'SAR', 'SAR', 'subsidiary', 'LE-ATHQ', 'local_gaap'),
    ('LE-AUIC', 'Athyper US Information & Communication',      'US information & communication subsidiary',             'US', 'USD', 'USD', 'subsidiary', 'LE-ATHQ', 'us_gaap'),
    ('LE-ASGF', 'Athyper Singapore Financial Services',        'Singapore financial services subsidiary',               'SG', 'SGD', 'SGD', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-AITM', 'Athyper India Textile & Leather Mfg',         'India textile & leather manufacturing subsidiary',      'IN', 'INR', 'INR', 'subsidiary', 'LE-ATHQ', 'local_gaap'),
    ('LE-ACFB', 'Athyper Canada Food & Beverage Mfg',          'Canada food & beverage manufacturing subsidiary',       'CA', 'CAD', 'CAD', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-ADPM', 'Athyper Germany Pharmaceutical Mfg',          'Germany pharmaceutical manufacturing subsidiary',       'DE', 'EUR', 'EUR', 'subsidiary', 'LE-ATHQ', 'local_gaap'),
    ('LE-ATEM', 'Athyper Taiwan Electronics Mfg',              'Taiwan electronics manufacturing subsidiary',           'TW', 'TWD', 'TWD', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-ASPE', 'Athyper South Africa Petroleum Extraction',   'South Africa petroleum extraction subsidiary',          'ZA', 'ZAR', 'ZAR', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-AUKA', 'Athyper UK Agriculture',                      'UK agriculture subsidiary',                             'GB', 'GBP', 'GBP', 'subsidiary', 'LE-ATHQ', 'ifrs'),
    ('LE-AJED', 'Athyper Japan Education Services',            'Japan education services subsidiary',                   'JP', 'JPY', 'JPY', 'subsidiary', 'LE-ATHQ', 'local_gaap'),
    ('LE-APHS', 'Athyper Philippines Hospital Services',       'Philippines hospital services subsidiary',              'PH', 'PHP', 'PHP', 'subsidiary', 'LE-ATHQ', 'ifrs');

    -- B3: UPSERT holding (root — parent_entity_id = NULL)
    INSERT INTO master.legal_entity (
        id, tenant_id, code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct, regulatory_framework,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, t.code, t.name, t.description,
        t.country_code, t.functional_currency, t.reporting_currency,
        t.entity_type, NULL,
        t.consolidation_method, t.ownership_pct, t.regulatory_framework,
        v_meta, 'active', v_su
    FROM tmp_le t
    WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                 = EXCLUDED.name,
        description          = EXCLUDED.description,
        country_code         = EXCLUDED.country_code,
        functional_currency  = EXCLUDED.functional_currency,
        reporting_currency   = EXCLUDED.reporting_currency,
        entity_type          = EXCLUDED.entity_type,
        parent_entity_id     = EXCLUDED.parent_entity_id,
        consolidation_method = EXCLUDED.consolidation_method,
        ownership_pct        = EXCLUDED.ownership_pct,
        regulatory_framework = EXCLUDED.regulatory_framework,
        metadata             = master.legal_entity.metadata
                               || jsonb_build_object('_seed', jsonb_build_object(
                                      'pack',      v_pack,
                                      'version',   v_version,
                                      'seeded_at', now()::text
                                  )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.legal_entity.name, master.legal_entity.description,
           master.legal_entity.country_code, master.legal_entity.functional_currency,
           master.legal_entity.reporting_currency, master.legal_entity.entity_type,
           master.legal_entity.parent_entity_id, master.legal_entity.consolidation_method,
           master.legal_entity.ownership_pct, master.legal_entity.regulatory_framework)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.country_code, EXCLUDED.functional_currency,
           EXCLUDED.reporting_currency, EXCLUDED.entity_type,
           EXCLUDED.parent_entity_id, EXCLUDED.consolidation_method,
           EXCLUDED.ownership_pct, EXCLUDED.regulatory_framework);

    -- B4: UPSERT subsidiaries (resolve parent via JOIN)
    INSERT INTO master.legal_entity (
        id, tenant_id, code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct, regulatory_framework,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, t.code, t.name, t.description,
        t.country_code, t.functional_currency, t.reporting_currency,
        t.entity_type, p.id,
        t.consolidation_method, t.ownership_pct, t.regulatory_framework,
        v_meta, 'active', v_su
    FROM tmp_le t
    JOIN master.legal_entity p
      ON p.tenant_id = v_tid AND p.code = t.parent_code
    WHERE t.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                 = EXCLUDED.name,
        description          = EXCLUDED.description,
        country_code         = EXCLUDED.country_code,
        functional_currency  = EXCLUDED.functional_currency,
        reporting_currency   = EXCLUDED.reporting_currency,
        entity_type          = EXCLUDED.entity_type,
        parent_entity_id     = EXCLUDED.parent_entity_id,
        consolidation_method = EXCLUDED.consolidation_method,
        ownership_pct        = EXCLUDED.ownership_pct,
        regulatory_framework = EXCLUDED.regulatory_framework,
        metadata             = master.legal_entity.metadata
                               || jsonb_build_object('_seed', jsonb_build_object(
                                      'pack',      v_pack,
                                      'version',   v_version,
                                      'seeded_at', now()::text
                                  )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.legal_entity.name, master.legal_entity.description,
           master.legal_entity.country_code, master.legal_entity.functional_currency,
           master.legal_entity.reporting_currency, master.legal_entity.entity_type,
           master.legal_entity.parent_entity_id, master.legal_entity.consolidation_method,
           master.legal_entity.ownership_pct, master.legal_entity.regulatory_framework)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.country_code, EXCLUDED.functional_currency,
           EXCLUDED.reporting_currency, EXCLUDED.entity_type,
           EXCLUDED.parent_entity_id, EXCLUDED.consolidation_method,
           EXCLUDED.ownership_pct, EXCLUDED.regulatory_framework);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: Company Codes (17 rows — all posting companies incl. group HQ)
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_cc (
        seed_id                  uuid DEFAULT shared.uuidv7(),
        code                     text NOT NULL,
        name                     text NOT NULL,
        le_code                  text NOT NULL,       -- resolve to legal_entity.id
        functional_currency      char(3) NOT NULL,
        fiscal_year_start_month  smallint NOT NULL DEFAULT 1,
        fiscal_year_variant      text NOT NULL DEFAULT 'calendar',
        regulatory_framework     text NOT NULL,
        is_intercompany_enabled  boolean NOT NULL DEFAULT true
    ) ON COMMIT DROP;

    INSERT INTO tmp_cc (code, name, le_code, functional_currency, fiscal_year_start_month, regulatory_framework) VALUES
    ('ATHQ', 'Athyper Group Holdings',            'LE-ATHQ', 'MYR',  1, 'ifrs'),
    ('AMRE', 'Athyper Malaysia Real Estate',       'LE-AMRE', 'MYR',  1, 'ifrs'),
    ('AQTU', 'Athyper Qatar Utilities',            'LE-AQTU', 'QAR',  4, 'ifrs'),
    ('ASAC', 'Athyper Saudi Construction',         'LE-ASAC', 'SAR',  1, 'local_gaap'),
    ('AQTS', 'Athyper Qatar Transport',            'LE-AQTS', 'QAR',  4, 'ifrs'),
    ('AUET', 'Athyper UAE Trading',                'LE-AUET', 'AED',  1, 'ifrs'),
    ('ASAH', 'Athyper Saudi Hospitality',          'LE-ASAH', 'SAR',  1, 'local_gaap'),
    ('AUIC', 'Athyper US InfoComm',                'LE-AUIC', 'USD',  1, 'us_gaap'),
    ('ASGF', 'Athyper Singapore Financial',        'LE-ASGF', 'SGD',  1, 'ifrs'),
    ('AITM', 'Athyper India Textile Mfg',          'LE-AITM', 'INR',  4, 'local_gaap'),
    ('ACFB', 'Athyper Canada Food & Bev Mfg',      'LE-ACFB', 'CAD',  1, 'ifrs'),
    ('ADPM', 'Athyper Germany Pharma Mfg',         'LE-ADPM', 'EUR',  1, 'local_gaap'),
    ('ATEM', 'Athyper Taiwan Electronics Mfg',     'LE-ATEM', 'TWD',  1, 'ifrs'),
    ('ASPE', 'Athyper SA Petroleum Extraction',    'LE-ASPE', 'ZAR',  3, 'ifrs'),
    ('AUKA', 'Athyper UK Agriculture',             'LE-AUKA', 'GBP',  4, 'ifrs'),
    ('AJED', 'Athyper Japan Education',            'LE-AJED', 'JPY',  4, 'local_gaap'),
    ('APHS', 'Athyper Philippines Hospital',       'LE-APHS', 'PHP',  1, 'ifrs');

    -- C1: UPSERT company codes (resolve legal_entity_id via JOIN)
    INSERT INTO master.company_code (
        id, tenant_id, code, name,
        legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant,
        regulatory_framework, is_intercompany_enabled,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, t.code, t.name,
        le.id, t.functional_currency,
        t.fiscal_year_start_month, t.fiscal_year_variant,
        t.regulatory_framework, t.is_intercompany_enabled,
        v_meta, 'active', v_su
    FROM tmp_cc t
    JOIN master.legal_entity le
      ON le.tenant_id = v_tid AND le.code = t.le_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                     = EXCLUDED.name,
        legal_entity_id          = EXCLUDED.legal_entity_id,
        functional_currency      = EXCLUDED.functional_currency,
        fiscal_year_start_month  = EXCLUDED.fiscal_year_start_month,
        fiscal_year_variant      = EXCLUDED.fiscal_year_variant,
        regulatory_framework     = EXCLUDED.regulatory_framework,
        is_intercompany_enabled  = EXCLUDED.is_intercompany_enabled,
        metadata                 = master.company_code.metadata
                                   || jsonb_build_object('_seed', jsonb_build_object(
                                          'pack',      v_pack,
                                          'version',   v_version,
                                          'seeded_at', now()::text
                                      )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.company_code.name, master.company_code.legal_entity_id,
           master.company_code.functional_currency, master.company_code.fiscal_year_start_month,
           master.company_code.fiscal_year_variant, master.company_code.regulatory_framework,
           master.company_code.is_intercompany_enabled)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.legal_entity_id,
           EXCLUDED.functional_currency, EXCLUDED.fiscal_year_start_month,
           EXCLUDED.fiscal_year_variant, EXCLUDED.regulatory_framework,
           EXCLUDED.is_intercompany_enabled);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_le_count
    FROM master.legal_entity
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    IF v_le_count <> 17 THEN
        RAISE EXCEPTION '[199_gl_preseed] Expected 17 legal entities, got %', v_le_count;
    END IF;

    SELECT count(*) INTO v_cc_count
    FROM master.company_code
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    IF v_cc_count <> 17 THEN
        RAISE EXCEPTION '[199_gl_preseed] Expected 17 company codes, got %', v_cc_count;
    END IF;

    RAISE NOTICE '[199_gl_preseed] GL pre-seed complete: % legal entities, % company codes, gl_account_tenant_code_uq index ensured',
        v_le_count, v_cc_count;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/200_demo_legal_entities.sql
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

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/201_athyper_subsidiaries.sql
-- ============================================================================
-- ATHYPER GROUP — SUBSIDIARY LEGAL ENTITIES & COMPANY CODES
-- ============================================================================
-- File:     201_athyper_subsidiaries.sql
-- Schemas:  master.legal_entity, master.company_code
-- Purpose:  Seed the 16 subsidiary entities of the Athyper Group under the
--           'athyper' master tenant.  Each KC org alias athyper--{code}
--           (e.g. athyper--amre) resolves to tenant code 'athyper' and must
--           find a matching company_code row in that tenant.
--
-- KC org alias format: {tenant_code}--{entity_code_lowercase}
--   e.g. athyper--amre  → tenant='athyper', entity_code='AMRE'
-- The session service normalises entity_code to UPPER before lookup.
--
-- Depends:  000_athyper_tenant.sql, 200_demo_legal_entities.sql (ATHQ parent)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO NOTHING throughout
--
-- Stable UUID series:
--   Legal entities : dd000015-… dd000030-0000-0000-0000-000000000001
--   Company codes  : ee000015-… ee000030-0000-0000-0000-000000000001
--   Parent ATHQ LE : dd000014-0000-0000-0000-000000000001
-- ============================================================================

DO $athyper_subs$
DECLARE
    v_su        uuid  := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    v_parent_le uuid  := 'dd000014-0000-0000-0000-000000000001';  -- ATHQ holding LE
    v_meta      jsonb := jsonb_build_object('_seed', jsonb_build_object(
        'pack', '201_athyper_subsidiaries', 'version', '1.0.0', 'seeded_at', now()::text
    ));
BEGIN

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[201_athyper_subsidiaries] athyper tenant not found — run 000_athyper_tenant.sql first';
    END IF;

    -- ── Legal Entities (16 subsidiaries) ─────────────────────────────────────
    --
    -- Column order: id, tenant_id, code, name, description,
    --               country_code, functional_currency, reporting_currency,
    --               entity_type, parent_entity_id,
    --               consolidation_method, ownership_pct,
    --               regulatory_framework, metadata, status, created_by

    INSERT INTO master.legal_entity (
        id, tenant_id,
        code, name, description,
        country_code, functional_currency, reporting_currency,
        entity_type, parent_entity_id,
        consolidation_method, ownership_pct,
        regulatory_framework, metadata, status, created_by
    ) VALUES

    -- 1. AMRE — Athyper Malaysia Real Estate (MY, MYR)
    ('dd000015-0000-0000-0000-000000000001', v_tenant_id,
     'AMRE', 'Athyper Malaysia Real Estate', 'Athyper Group subsidiary — Malaysia Real Estate',
     'MY', 'MYR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 2. AQTU — Athyper Qatar Utilities (QA, QAR)
    ('dd000016-0000-0000-0000-000000000001', v_tenant_id,
     'AQTU', 'Athyper Qatar Utilities', 'Athyper Group subsidiary — Qatar Utilities',
     'QA', 'QAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 3. ASAC — Athyper Saudi Construction (SA, SAR)
    ('dd000017-0000-0000-0000-000000000001', v_tenant_id,
     'ASAC', 'Athyper Saudi Construction', 'Athyper Group subsidiary — Saudi Construction',
     'SA', 'SAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 4. AQTS — Athyper Qatar Transport (QA, QAR)
    ('dd000018-0000-0000-0000-000000000001', v_tenant_id,
     'AQTS', 'Athyper Qatar Transport', 'Athyper Group subsidiary — Qatar Transport',
     'QA', 'QAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 5. AUET — Athyper UAE Trading (AE, AED)
    ('dd000019-0000-0000-0000-000000000001', v_tenant_id,
     'AUET', 'Athyper UAE Trading', 'Athyper Group subsidiary — UAE Trading',
     'AE', 'AED', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 6. ASAH — Athyper Saudi Hospitality (SA, SAR)
    ('dd000020-0000-0000-0000-000000000001', v_tenant_id,
     'ASAH', 'Athyper Saudi Hospitality', 'Athyper Group subsidiary — Saudi Hospitality',
     'SA', 'SAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 7. AUIC — Athyper US InfoComm (US, USD)
    ('dd000021-0000-0000-0000-000000000001', v_tenant_id,
     'AUIC', 'Athyper US InfoComm', 'Athyper Group subsidiary — US Information & Communication',
     'US', 'USD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'us_gaap',
     v_meta, 'active', v_su),

    -- 8. ASGF — Athyper Singapore Financial (SG, SGD)
    ('dd000022-0000-0000-0000-000000000001', v_tenant_id,
     'ASGF', 'Athyper Singapore Financial', 'Athyper Group subsidiary — Singapore Financial Services',
     'SG', 'SGD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 9. AITM — Athyper India Textile Mfg (IN, INR, fiscal=April)
    ('dd000023-0000-0000-0000-000000000001', v_tenant_id,
     'AITM', 'Athyper India Textile Mfg', 'Athyper Group subsidiary — India Textile Manufacturing',
     'IN', 'INR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 10. ACFB — Athyper Canada Food & Bev (CA, CAD)
    ('dd000024-0000-0000-0000-000000000001', v_tenant_id,
     'ACFB', 'Athyper Canada Food & Bev', 'Athyper Group subsidiary — Canada Food & Beverage',
     'CA', 'CAD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 11. ADPM — Athyper Germany Pharma (DE, EUR)
    ('dd000025-0000-0000-0000-000000000001', v_tenant_id,
     'ADPM', 'Athyper Germany Pharma', 'Athyper Group subsidiary — Germany Pharmaceuticals',
     'DE', 'EUR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 12. ATEM — Athyper Taiwan Electronics (TW, TWD)
    ('dd000026-0000-0000-0000-000000000001', v_tenant_id,
     'ATEM', 'Athyper Taiwan Electronics', 'Athyper Group subsidiary — Taiwan Electronics Manufacturing',
     'TW', 'TWD', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 13. ASPE — Athyper SA Petroleum (ZA, ZAR)
    ('dd000027-0000-0000-0000-000000000001', v_tenant_id,
     'ASPE', 'Athyper SA Petroleum', 'Athyper Group subsidiary — South Africa Petroleum',
     'ZA', 'ZAR', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 14. AUKA — Athyper UK Agriculture (GB, GBP)
    ('dd000028-0000-0000-0000-000000000001', v_tenant_id,
     'AUKA', 'Athyper UK Agriculture', 'Athyper Group subsidiary — UK Agriculture',
     'GB', 'GBP', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su),

    -- 15. AJED — Athyper Japan Education (JP, JPY)
    ('dd000029-0000-0000-0000-000000000001', v_tenant_id,
     'AJED', 'Athyper Japan Education', 'Athyper Group subsidiary — Japan Education',
     'JP', 'JPY', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'local_gaap',
     v_meta, 'active', v_su),

    -- 16. APHS — Athyper Philippines Hospital (PH, PHP)
    ('dd000030-0000-0000-0000-000000000001', v_tenant_id,
     'APHS', 'Athyper Philippines Hospital', 'Athyper Group subsidiary — Philippines Healthcare',
     'PH', 'PHP', 'USD', 'subsidiary', v_parent_le, 'full', 100.00, 'ifrs',
     v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[201_athyper_subsidiaries] 16 legal entities inserted (or already present)';

    -- ── Company Codes (16 subsidiaries) ──────────────────────────────────────
    --
    -- One company_code per subsidiary.  The code must match KC org
    -- attribute entity_code (UPPERCASE).  fiscal_year_start_month = 4
    -- for India (AITM), 1 for all others.
    --
    -- Column order: id, tenant_id, code, name, legal_entity_id,
    --               functional_currency, fiscal_year_start_month,
    --               fiscal_year_variant, regulatory_framework,
    --               is_intercompany_enabled, metadata, status, created_by

    INSERT INTO master.company_code (
        id, tenant_id,
        code, name, legal_entity_id, functional_currency,
        fiscal_year_start_month, fiscal_year_variant,
        regulatory_framework, is_intercompany_enabled,
        metadata, status, created_by
    ) VALUES

    ('ee000015-0000-0000-0000-000000000001', v_tenant_id,
     'AMRE', 'Athyper Malaysia Real Estate',
     'dd000015-0000-0000-0000-000000000001',
     'MYR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000016-0000-0000-0000-000000000001', v_tenant_id,
     'AQTU', 'Athyper Qatar Utilities',
     'dd000016-0000-0000-0000-000000000001',
     'QAR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000017-0000-0000-0000-000000000001', v_tenant_id,
     'ASAC', 'Athyper Saudi Construction',
     'dd000017-0000-0000-0000-000000000001',
     'SAR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000018-0000-0000-0000-000000000001', v_tenant_id,
     'AQTS', 'Athyper Qatar Transport',
     'dd000018-0000-0000-0000-000000000001',
     'QAR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000019-0000-0000-0000-000000000001', v_tenant_id,
     'AUET', 'Athyper UAE Trading',
     'dd000019-0000-0000-0000-000000000001',
     'AED', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000020-0000-0000-0000-000000000001', v_tenant_id,
     'ASAH', 'Athyper Saudi Hospitality',
     'dd000020-0000-0000-0000-000000000001',
     'SAR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000021-0000-0000-0000-000000000001', v_tenant_id,
     'AUIC', 'Athyper US InfoComm',
     'dd000021-0000-0000-0000-000000000001',
     'USD', 1, 'calendar', 'us_gaap',    true, v_meta, 'active', v_su),

    ('ee000022-0000-0000-0000-000000000001', v_tenant_id,
     'ASGF', 'Athyper Singapore Financial',
     'dd000022-0000-0000-0000-000000000001',
     'SGD', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000023-0000-0000-0000-000000000001', v_tenant_id,
     'AITM', 'Athyper India Textile Mfg',
     'dd000023-0000-0000-0000-000000000001',
     'INR', 4, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000024-0000-0000-0000-000000000001', v_tenant_id,
     'ACFB', 'Athyper Canada Food & Bev',
     'dd000024-0000-0000-0000-000000000001',
     'CAD', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000025-0000-0000-0000-000000000001', v_tenant_id,
     'ADPM', 'Athyper Germany Pharma',
     'dd000025-0000-0000-0000-000000000001',
     'EUR', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000026-0000-0000-0000-000000000001', v_tenant_id,
     'ATEM', 'Athyper Taiwan Electronics',
     'dd000026-0000-0000-0000-000000000001',
     'TWD', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000027-0000-0000-0000-000000000001', v_tenant_id,
     'ASPE', 'Athyper SA Petroleum',
     'dd000027-0000-0000-0000-000000000001',
     'ZAR', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000028-0000-0000-0000-000000000001', v_tenant_id,
     'AUKA', 'Athyper UK Agriculture',
     'dd000028-0000-0000-0000-000000000001',
     'GBP', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su),

    ('ee000029-0000-0000-0000-000000000001', v_tenant_id,
     'AJED', 'Athyper Japan Education',
     'dd000029-0000-0000-0000-000000000001',
     'JPY', 1, 'calendar', 'local_gaap', true, v_meta, 'active', v_su),

    ('ee000030-0000-0000-0000-000000000001', v_tenant_id,
     'APHS', 'Athyper Philippines Hospital',
     'dd000030-0000-0000-0000-000000000001',
     'PHP', 1, 'calendar', 'ifrs',       true, v_meta, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[201_athyper_subsidiaries] 16 company codes inserted (or already present)';

END $athyper_subs$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/300_operating_units.sql
-- ============================================================================
-- 300_operating_units.sql — REMOVED (company_code migration)
-- ============================================================================
-- master.operating_unit table has been dropped. Scoping is now handled
-- entirely by master.company_code. This file is retained as a no-op
-- placeholder to preserve execution-order numbering in the seed run.
-- See 13_patches/002_drop_operating_unit.sql for the authoritative DROP.
-- ============================================================================

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/301_cost_centers.sql
-- ============================================================================
-- 301_cost_centers.sql — Base cost center hierarchy (universal only)
-- ============================================================================
-- Structure: L1 root → L2 functional headers → L3 posting leaves
-- Base scope: ADMIN, COMMERCIAL, SUPPORT, OPS (1 generic leaf)
-- Industry-specific OPS leaves deferred to extension packs
-- Code convention: {COMP}-CC-{HEADER}-{LEAF}
-- Per company: 1 root + 4 headers + 9 posting = 14 nodes
-- Depends:  199_gl_preseed.sql (company codes must exist)
-- ============================================================================

DO $seed$
DECLARE
    v_tid   uuid;
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_meta  jsonb := '{"_seed": {"pack": "301_org", "version": "2.0.0"}}'::jsonb;
    v_cc    record;
    v_root  uuid;
    v_admin uuid;
    v_comm  uuid;
    v_supp  uuid;
    v_ops   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    FOR v_cc IN
        SELECT id, code, name FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active' ORDER BY code
    LOOP
        -- L1: Company root
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata)
        VALUES (v_tid, v_cc.id,
             v_cc.code || '-CC', v_cc.name || ' Cost Centers',
             'header', 'admin', 1, NULL,
             '2020-01-01'::date, 0, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, updated_at = now(), updated_by = v_su
        WHERE master.cost_center.name IS DISTINCT FROM EXCLUDED.name;

        SELECT id INTO v_root FROM master.cost_center
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id
          AND code = v_cc.code || '-CC';

        -- L2: 4 functional headers
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid, v_cc.id, v_cc.code||'-CC-ADMIN',   'Administration',    'header','admin',     2, v_root,'2020-01-01'::date, 100,'active',v_su,v_meta),
        (v_tid, v_cc.id, v_cc.code||'-CC-COMM',    'Commercial',        'header','sales',     2, v_root,'2020-01-01'::date, 200,'active',v_su,v_meta),
        (v_tid, v_cc.id, v_cc.code||'-CC-SUPPORT', 'Support Services',  'header','shared',    2, v_root,'2020-01-01'::date, 300,'active',v_su,v_meta),
        (v_tid, v_cc.id, v_cc.code||'-CC-OPS',     'Operations',        'header','production',2, v_root,'2020-01-01'::date, 400,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            updated_at = now(), updated_by = v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        SELECT id INTO v_admin FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-ADMIN';
        SELECT id INTO v_comm  FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-COMM';
        SELECT id INTO v_supp  FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-SUPPORT';
        SELECT id INTO v_ops   FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-OPS';

        -- L3: Posting leaves under ADMIN (4)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-FIN',  'Finance & Accounting','posting','admin',3,v_admin,'2020-01-01'::date,110,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-HR',   'Human Resources',     'posting','admin',3,v_admin,'2020-01-01'::date,120,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-IT',   'Information Technology','posting','admin',3,v_admin,'2020-01-01'::date,130,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-LEGAL','Legal & Compliance',  'posting','admin',3,v_admin,'2020-01-01'::date,140,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        -- L3: Posting leaves under COMMERCIAL (2)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-COMM-SALES','Sales',          'posting','sales',3,v_comm,'2020-01-01'::date,210,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-COMM-MKTG', 'Marketing & BD','posting','sales',3,v_comm,'2020-01-01'::date,220,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        -- L3: Posting leaves under SUPPORT (2)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-SUPPORT-PROC','Procurement',     'posting','admin', 3,v_supp,'2020-01-01'::date,310,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-SUPPORT-SVC', 'Shared Services','posting','shared',3,v_supp,'2020-01-01'::date,320,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        -- L3: ONE generic operations leaf (packs add industry leaves here)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-OPS-GEN','General Operations','posting','production',3,v_ops,'2020-01-01'::date,410,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS (5 checks)
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Every company has exactly 1 L1 root
    IF EXISTS (
        SELECT company_code_id FROM master.cost_center
        WHERE tenant_id = v_tid AND level_no = 1
        GROUP BY company_code_id HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '301 FAIL: company with != 1 CC root'; END IF;

    -- A2: No posting node has NULL parent
    IF EXISTS (
        SELECT id FROM master.cost_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND parent_id IS NULL
    ) THEN RAISE EXCEPTION '301 FAIL: posting CC with NULL parent'; END IF;

    -- A3: Every company has at least 9 base posting leaves
    -- (packs may add more — check minimum, not exact)
    IF EXISTS (
        SELECT company_code_id, count(*) FROM master.cost_center
        WHERE tenant_id = v_tid AND node_type = 'posting'
        GROUP BY company_code_id HAVING count(*) < 9
    ) THEN RAISE EXCEPTION '301 FAIL: company with < 9 posting CCs'; END IF;

    -- A4: No posting node at L1 or L2
    IF EXISTS (
        SELECT id FROM master.cost_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND level_no < 3
    ) THEN RAISE EXCEPTION '301 FAIL: posting CC at level < 3'; END IF;

    -- A5: All active companies represented (dynamic — not hard-coded)
    IF (SELECT count(DISTINCT company_code_id) FROM master.cost_center
        WHERE tenant_id = v_tid)
       !=
       (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active')
    THEN RAISE EXCEPTION '301 FAIL: CC company count != active company_code count'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CROSS-LINK NOTE (for extension packs / post-seed mapping):
    -- cost_center.profit_center_id is intentionally NULL in the base seed.
    -- Extension packs or a post-seed mapping file should populate it for
    -- operational cost centers where managerial reporting needs a default
    -- P&L owner. The DDL validates same-company integrity on this FK.
    -- ══════════════════════════════════════════════════════════════════════

    RAISE NOTICE '301: % cost centers across % companies (14 per company: 1+4+9)',
        (SELECT count(*) FROM master.cost_center WHERE tenant_id = v_tid),
        (SELECT count(DISTINCT company_code_id) FROM master.cost_center WHERE tenant_id = v_tid);
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/301_demo_operating_units.sql
-- ============================================================================
-- 301_demo_operating_units.sql — REMOVED (company_code migration)
-- ============================================================================
-- master.operating_unit table has been dropped. Demo tenant org structure is
-- represented solely through master.company_code rows. This file is retained
-- as a no-op placeholder to preserve seed execution-order numbering.
-- See 13_patches/002_drop_operating_unit.sql for the authoritative DROP.
-- ============================================================================

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/302_profit_centers.sql
-- ============================================================================
-- 302_profit_centers.sql — Base profit center hierarchy (universal only)
-- ============================================================================
-- Structure: L1 root → L2 type headers → L3 posting leaves
-- L2 headers: EXT (external revenue), IC (intercompany), INV (investment),
--             SVC (shared/internal service)
-- Code convention: {COMP}-PC-{HEADER}-{LEAF}
-- Industry-specific revenue lines deferred to extension packs
-- Depends:  199_gl_preseed.sql (company codes must exist)
-- ============================================================================

DO $seed$
DECLARE
    v_tid   uuid;
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_meta  jsonb := '{"_seed": {"pack": "302_org", "version": "2.0.0"}}'::jsonb;
    v_cc    record;
    v_root  uuid;
    v_ext   uuid;
    v_ic    uuid;
    v_inv   uuid;
    v_svc   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    -- Industry → company mapping for base posting leaves
    CREATE TEMP TABLE tmp_pc_leaves (
        company_code  text NOT NULL,
        header        text NOT NULL,   -- EXT, IC, INV, SVC
        suffix        text NOT NULL,
        pc_name       text NOT NULL,
        pc_type       text NOT NULL,   -- revenue, service, investment, shared
        sort_order    smallint NOT NULL,
        PRIMARY KEY (company_code, header, suffix)
    ) ON COMMIT DROP;

    INSERT INTO tmp_pc_leaves VALUES
    -- ─── HQ (holding — investment + services, minimal external) ─────────
    ('ATHQ', 'SVC', 'MGMT',    'Group Management Fees',     'service',    10),
    ('ATHQ', 'IC',  'INCOME',   'Intercompany Income',      'shared',     10),
    ('ATHQ', 'INV', 'RETURNS',  'Investment Returns',       'investment', 10),
    ('ATHQ', 'SVC', 'AUDIT',    'Internal Audit Services',  'service',    20),
    -- ─── Real Estate ────────────────────────────────────────────────────
    ('AMRE', 'EXT', 'RENTAL',   'Rental Income',            'revenue',    10),
    ('AMRE', 'EXT', 'PRODEV',   'Property Development',     'revenue',    20),
    ('AMRE', 'EXT', 'PROPSAL',  'Property Sales',           'revenue',    30),
    -- ─── Utilities ──────────────────────────────────────────────────────
    ('AQTU', 'EXT', 'ELEC',     'Electricity Sales',        'revenue',    10),
    ('AQTU', 'EXT', 'WATER',    'Water Supply',             'revenue',    20),
    ('AQTU', 'EXT', 'CONNECT',  'Connection Fees',          'revenue',    30),
    -- ─── Construction ───────────────────────────────────────────────────
    ('ASAC', 'EXT', 'BLDG',     'Building Construction',    'revenue',    10),
    ('ASAC', 'EXT', 'CIVIL',    'Civil Engineering',        'revenue',    20),
    ('ASAC', 'EXT', 'MEP',      'MEP Contracting',          'revenue',    30),
    -- ─── Transport ──────────────────────────────────────────────────────
    ('AQTS', 'EXT', 'FREIGHT',  'Freight & Haulage',        'revenue',    10),
    ('AQTS', 'EXT', 'WHSE',     'Warehousing & Storage',    'revenue',    20),
    ('AQTS', 'EXT', 'LASTMILE', 'Last Mile Delivery',       'revenue',    30),
    -- ─── Trading ────────────────────────────────────────────────────────
    ('AUET', 'EXT', 'WHLSALE',  'Wholesale',                'revenue',    10),
    ('AUET', 'EXT', 'RETAIL',   'Retail',                   'revenue',    20),
    ('AUET', 'EXT', 'ECOMM',    'E-Commerce',               'revenue',    30),
    -- ─── Hospitality ────────────────────────────────────────────────────
    ('ASAH', 'EXT', 'ROOMS',    'Rooms Revenue',            'revenue',    10),
    ('ASAH', 'EXT', 'FB',       'Food & Beverage Revenue',  'revenue',    20),
    ('ASAH', 'EXT', 'EVENTS',   'Events & Banqueting',      'revenue',    30),
    ('ASAH', 'EXT', 'SPA',      'Spa & Recreation',         'revenue',    40),
    -- ─── InfoComm ───────────────────────────────────────────────────────
    ('AUIC', 'EXT', 'SAAS',     'SaaS Recurring',           'revenue',    10),
    ('AUIC', 'EXT', 'CONSULT',  'Consulting & Implementation','revenue',  20),
    ('AUIC', 'EXT', 'LICENSE',  'License & IP',             'revenue',    30),
    -- ─── Financial ──────────────────────────────────────────────────────
    ('ASGF', 'EXT', 'LENDING',  'Lending & Interest',       'revenue',    10),
    ('ASGF', 'EXT', 'FEES',     'Fees & Commissions',       'revenue',    20),
    ('ASGF', 'INV', 'TRADING',  'Trading & Markets',        'investment', 10),
    ('ASGF', 'SVC', 'INSURANCE','Insurance Premiums',        'service',   10),
    -- ─── Textiles ───────────────────────────────────────────────────────
    ('AITM', 'EXT', 'GARMENT',  'Garments & Apparel',       'revenue',    10),
    ('AITM', 'EXT', 'FABRIC',   'Fabric Sales',             'revenue',    20),
    ('AITM', 'EXT', 'LEATHER',  'Leather Goods',            'revenue',    30),
    -- ─── F&B Manufacturing ──────────────────────────────────────────────
    ('ACFB', 'EXT', 'PACKAGED', 'Packaged Food',            'revenue',    10),
    ('ACFB', 'EXT', 'BEVERAGE', 'Beverages',                'revenue',    20),
    ('ACFB', 'EXT', 'INGREDNT', 'Ingredient / B2B',         'revenue',    30),
    -- ─── Pharma ─────────────────────────────────────────────────────────
    ('ADPM', 'EXT', 'BRANDED',  'Branded Products',         'revenue',    10),
    ('ADPM', 'EXT', 'GENERIC',  'Generic Products',         'revenue',    20),
    ('ADPM', 'EXT', 'API',      'API Third-Party Sales',    'revenue',    30),
    ('ADPM', 'SVC', 'LICENSING','Licensing & Royalties',     'service',   10),
    -- ─── Electronics ────────────────────────────────────────────────────
    ('ATEM', 'EXT', 'OEM',      'OEM Components',           'revenue',    10),
    ('ATEM', 'EXT', 'MODULE',   'Module Assembly',          'revenue',    20),
    ('ATEM', 'EXT', 'AFTERMKT', 'Aftermarket & Spares',     'revenue',    30),
    -- ─── Mining ─────────────────────────────────────────────────────────
    ('ASPE', 'EXT', 'CRUDE',    'Crude Oil Sales',          'revenue',    10),
    ('ASPE', 'EXT', 'GAS',      'Natural Gas Sales',        'revenue',    20),
    ('ASPE', 'EXT', 'NGL',      'NGL & Condensate',         'revenue',    30),
    -- ─── Agriculture ────────────────────────────────────────────────────
    ('AUKA', 'EXT', 'CROP',     'Crop Sales',               'revenue',    10),
    ('AUKA', 'EXT', 'LIVESTOCK','Livestock Sales',           'revenue',    20),
    ('AUKA', 'EXT', 'DAIRY',    'Dairy & Produce',          'revenue',    30),
    -- ─── Education ──────────────────────────────────────────────────────
    ('AJED', 'EXT', 'TUITION',  'Tuition Fees',             'revenue',    10),
    ('AJED', 'EXT', 'RESEARCH', 'Research Grants',          'revenue',    20),
    ('AJED', 'SVC', 'EXEC',     'Executive Education',       'service',   10),
    -- ─── Hospital ───────────────────────────────────────────────────────
    ('APHS', 'EXT', 'INPAT',    'Inpatient Services',       'revenue',    10),
    ('APHS', 'EXT', 'OUTPAT',   'Outpatient & Clinics',     'revenue',    20),
    ('APHS', 'EXT', 'PHARM',    'Pharmacy Revenue',         'revenue',    30),
    ('APHS', 'EXT', 'DIAG',     'Diagnostics Revenue',      'revenue',    40);

    FOR v_cc IN
        SELECT id, code, name FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active' ORDER BY code
    LOOP
        -- L1: Company root
        INSERT INTO master.profit_center
            (tenant_id, company_code_id, code, name,
             node_type, profit_center_type, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata)
        VALUES (v_tid, v_cc.id,
             v_cc.code || '-PC', v_cc.name || ' Profit Centers',
             'header', 'revenue', 1, NULL,
             '2020-01-01'::date, 0, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, updated_at = now(), updated_by = v_su
        WHERE master.profit_center.name IS DISTINCT FROM EXCLUDED.name;

        SELECT id INTO v_root FROM master.profit_center
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id
          AND code = v_cc.code || '-PC';

        -- L2: 4 type headers (always created — gives structure even if no L3 yet)
        INSERT INTO master.profit_center
            (tenant_id, company_code_id, code, name,
             node_type, profit_center_type, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id, v_cc.code||'-PC-EXT','External Business', 'header','revenue',   2,v_root,'2020-01-01'::date,100,'active',v_su,v_meta),
        (v_tid,v_cc.id, v_cc.code||'-PC-IC', 'Intercompany',     'header','shared',     2,v_root,'2020-01-01'::date,200,'active',v_su,v_meta),
        (v_tid,v_cc.id, v_cc.code||'-PC-INV','Investment',        'header','investment', 2,v_root,'2020-01-01'::date,300,'active',v_su,v_meta),
        (v_tid,v_cc.id, v_cc.code||'-PC-SVC','Internal Services', 'header','service',    2,v_root,'2020-01-01'::date,400,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            profit_center_type = EXCLUDED.profit_center_type,
            updated_at = now(), updated_by = v_su
        WHERE (master.profit_center.name, master.profit_center.parent_id,
               master.profit_center.profit_center_type)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id, EXCLUDED.profit_center_type);

        SELECT id INTO v_ext FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-EXT';
        SELECT id INTO v_ic  FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-IC';
        SELECT id INTO v_inv FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-INV';
        SELECT id INTO v_svc FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-SVC';

        -- L3: Posting leaves from temp table
        INSERT INTO master.profit_center
            (tenant_id, company_code_id, code, name,
             node_type, profit_center_type, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata)
        SELECT
            v_tid, v_cc.id,
            v_cc.code || '-PC-' || p.header || '-' || p.suffix,
            p.pc_name,
            'posting', p.pc_type, 3,
            CASE p.header
                WHEN 'EXT' THEN v_ext
                WHEN 'IC'  THEN v_ic
                WHEN 'INV' THEN v_inv
                WHEN 'SVC' THEN v_svc
            END,
            '2020-01-01'::date,
            p.sort_order, 'active', v_su, v_meta
        FROM tmp_pc_leaves p
        WHERE p.company_code = v_cc.code
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            profit_center_type = EXCLUDED.profit_center_type,
            updated_at = now(), updated_by = v_su
        WHERE (master.profit_center.name, master.profit_center.parent_id,
               master.profit_center.profit_center_type)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id, EXCLUDED.profit_center_type);

    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Every company has exactly 1 L1 root
    IF EXISTS (
        SELECT company_code_id FROM master.profit_center
        WHERE tenant_id = v_tid AND level_no = 1
        GROUP BY company_code_id HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '302 FAIL: company with != 1 PC root'; END IF;

    -- A2: No posting node has NULL parent
    IF EXISTS (
        SELECT id FROM master.profit_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND parent_id IS NULL
    ) THEN RAISE EXCEPTION '302 FAIL: posting PC with NULL parent'; END IF;

    -- A3: Every company has at least 1 posting PC
    IF EXISTS (
        SELECT id FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM master.profit_center pc
              WHERE pc.tenant_id = v_tid AND pc.company_code_id = cc.id
                AND pc.node_type = 'posting')
    ) THEN RAISE EXCEPTION '302 FAIL: company with 0 posting PCs'; END IF;

    -- A4: No posting at L1 or L2
    IF EXISTS (
        SELECT id FROM master.profit_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND level_no < 3
    ) THEN RAISE EXCEPTION '302 FAIL: posting PC at level < 3'; END IF;

    -- A5: HQ has at least 1 investment or service PC
    IF NOT EXISTS (
        SELECT 1 FROM master.profit_center
        WHERE tenant_id = v_tid AND node_type = 'posting'
          AND profit_center_type IN ('investment', 'service')
          AND company_code_id = (SELECT id FROM master.company_code WHERE tenant_id = v_tid AND code = 'ATHQ')
    ) THEN RAISE EXCEPTION '302 FAIL: HQ missing investment/service PCs'; END IF;

    -- A6: All active companies represented (dynamic — not hard-coded)
    IF (SELECT count(DISTINCT company_code_id) FROM master.profit_center
        WHERE tenant_id = v_tid)
       !=
       (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active')
    THEN RAISE EXCEPTION '302 FAIL: PC company count != active company_code count'; END IF;

    RAISE NOTICE '302: % profit centers across % companies (L1→L2→L3, multi-type)',
        (SELECT count(*) FROM master.profit_center WHERE tenant_id = v_tid),
        (SELECT count(DISTINCT company_code_id) FROM master.profit_center WHERE tenant_id = v_tid);
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/303_sites.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — SITE SEED: Physical locations across all companies
-- ============================================================================
-- File:     303_sites.sql
-- Schema:   master.site
-- Purpose:  Seed 32 sites across 17 company codes — lean but realistic set
--           covering HQ offices, plants, yards, depots, stores, and branches.
-- Depends:  000_athyper_tenant.sql    (tenant)
--           199_gl_preseed.sql        (legal_entity + company_code)
--           199_gl_preseed.sql        (company_code — replaces operating_unit dependency)
--           shared.country, shared.timezone (reference data)
-- Replaces: 303_sites_warehouses.sql  (split into 303 + 304)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Notes:
--   • entity_code  — column removed from master.site (no longer used)
--   • level_no     — omitted from tmp; trigger trg_site_level handles it
--   • site_type    — validated by trigger trg_site_type_lookup against master.site_type
--   • status       — validated by trigger trg_site_status_lookup against master.site_status
--   • parent_code  — resolved in two-pass insert (roots first, children second)
--   • manager_id   — left NULL; principal seeds not yet stable
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '340_org';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_expected int;
    v_actual   int;
    v_bad      int;
    v_stale    int;
BEGIN
    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE A: Resolve tenant & verify prerequisites
    -- ════════════════════════════════════════════════════════════════════════

    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[303_sites] Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- Verify company codes exist
    IF (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active') < 17 THEN
        RAISE EXCEPTION '[303_sites] Expected ≥17 active company codes — run 199_gl_preseed.sql first';
    END IF;

    -- ── Full lookup validation: all site_type values used by this seed ───
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('plant'), ('office'), ('depot'), ('yard'), ('store'), ('branch')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM control.lookup_value lv
            WHERE lv.domain_code = 'master.site_type'
              AND lv.code = v.code
              AND lv.tenant_id IS NULL
        )
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing site_type lookup value(s) — need: plant, office, depot, yard, store, branch';
    END IF;

    -- ── Full lookup validation: site_status 'active' ────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.site_status' AND code = 'active' AND tenant_id IS NULL
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing site_status lookup value: active';
    END IF;

    -- ── Reference data: all country codes used by this seed ─────────────
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('MY'), ('QA'), ('SA'), ('AE'), ('US'), ('SG'),
            ('IN'), ('CA'), ('DE'), ('TW'), ('ZA'), ('GB'), ('JP'), ('PH')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM shared.country c WHERE c.code = v.code
        )
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing shared.country row(s) — check reference data seed';
    END IF;

    -- ── Reference data: all timezone codes used by this seed ────────────
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('Asia/Kuala_Lumpur'), ('Asia/Qatar'), ('Asia/Riyadh'), ('Asia/Dubai'),
            ('America/New_York'), ('Asia/Singapore'), ('Asia/Kolkata'), ('America/Toronto'),
            ('Europe/Berlin'), ('Asia/Taipei'), ('Africa/Johannesburg'), ('Europe/London'),
            ('Asia/Tokyo'), ('Asia/Manila')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM shared.timezone tz WHERE tz.code = v.code
        )
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing shared.timezone row(s) — check reference data seed';
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE B: Temp table (no entity_code, no level_no — triggers handle both)
    -- ════════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_site (
        seed_id         uuid DEFAULT shared.uuidv7(),
        company_code    text    NOT NULL,
        code            text    NOT NULL,
        name            text    NOT NULL,
        description     text,
        site_type       text    NOT NULL,
        parent_code     text,
        sort_order      smallint NOT NULL DEFAULT 0,
        country_code    character(2) NOT NULL,
        timezone_code   text,
        capacity_uom    text,
        capacity_value  numeric(12,2)
    ) ON COMMIT DROP;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE C: Insert site data
    -- Code convention: {COMPANY_CODE}-SITE-{DESCRIPTOR}
    -- All codes are tenant-wide unique per UNIQUE (tenant_id, code)
    -- ════════════════════════════════════════════════════════════════════════

    -- ── ATHQ — Group Holdings (Malaysia) ────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('ATHQ', 'ATHQ-SITE-HQ', 'Group Headquarters',
     'Athyper Group corporate headquarters, Kuala Lumpur',
     'office', 'MY', 'Asia/Kuala_Lumpur');

    -- ── AMRE — Malaysia Real Estate ─────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('AMRE', 'AMRE-SITE-HQ', 'Real Estate HQ',
     'Corporate office, Kuala Lumpur',
     'office', 'MY', 'Asia/Kuala_Lumpur'),
    ('AMRE', 'AMRE-SITE-PROP-OPS', 'Property Operations Centre',
     'Facility management and maintenance hub',
     'depot', 'MY', 'Asia/Kuala_Lumpur');

    -- ── AQTU — Qatar Utilities ──────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AQTU', 'AQTU-SITE-HQ', 'Utilities HQ',
     'Corporate office, Doha',
     'office', 'QA', 'Asia/Qatar', NULL, NULL),
    ('AQTU', 'AQTU-SITE-PLANT-01', 'Main Generation Plant',
     'Primary power generation and water desalination plant',
     'plant', 'QA', 'Asia/Qatar', 'MW', 500.00);

    -- ── ASAC — Saudi Construction ───────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('ASAC', 'ASAC-SITE-HQ', 'Construction HQ',
     'Corporate office, Riyadh',
     'office', 'SA', 'Asia/Riyadh'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'Main Equipment Yard',
     'Heavy equipment staging, materials storage, and prefabrication',
     'yard', 'SA', 'Asia/Riyadh'),
    ('ASAC', 'ASAC-SITE-PROJ-BASE-01', 'Project Base Camp',
     'Field operations base for active project sites',
     'yard', 'SA', 'Asia/Riyadh');

    -- ── AQTS — Qatar Transport & Storage ────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AQTS', 'AQTS-SITE-HQ', 'Transport HQ',
     'Corporate office, Doha',
     'office', 'QA', 'Asia/Qatar', NULL, NULL),
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'Main Fleet Depot',
     'Primary fleet maintenance, parking, and dispatch depot',
     'depot', 'QA', 'Asia/Qatar', 'vehicles', 200.00),
    ('AQTS', 'AQTS-SITE-HUB-01', 'Logistics Hub',
     'Cross-docking and distribution hub',
     'depot', 'QA', 'Asia/Qatar', 'sqm', 12000.00);

    -- ── AUET — UAE Trading ──────────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AUET', 'AUET-SITE-HQ', 'Trading HQ',
     'Corporate office, Dubai',
     'office', 'AE', 'Asia/Dubai', NULL, NULL),
    ('AUET', 'AUET-SITE-DC-01', 'Distribution Centre',
     'Main warehouse and distribution centre, Jebel Ali',
     'depot', 'AE', 'Asia/Dubai', 'sqm', 8000.00),
    ('AUET', 'AUET-SITE-STORE-01', 'Retail Showroom',
     'Customer-facing retail and display showroom',
     'store', 'AE', 'Asia/Dubai', NULL, NULL);

    -- ── ASAH — Saudi Hospitality ────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ASAH', 'ASAH-SITE-HQ', 'Hospitality HQ',
     'Corporate office, Riyadh',
     'office', 'SA', 'Asia/Riyadh', NULL, NULL),
    ('ASAH', 'ASAH-SITE-HOTEL-01', 'Flagship Hotel',
     'Full-service hotel and conference centre',
     'branch', 'SA', 'Asia/Riyadh', 'rooms', 350.00);

    -- ── AUIC — US Information & Communication ───────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('AUIC', 'AUIC-SITE-HQ', 'InfoComm HQ',
     'Corporate and engineering office, New York',
     'office', 'US', 'America/New_York');

    -- ── ASGF — Singapore Financial Services ─────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('ASGF', 'ASGF-SITE-HQ', 'Financial Services HQ',
     'Corporate office, Singapore CBD',
     'office', 'SG', 'Asia/Singapore');

    -- ── AITM — India Textile & Leather Manufacturing ────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AITM', 'AITM-SITE-HQ', 'Textile Mfg HQ',
     'Corporate office, Mumbai',
     'office', 'IN', 'Asia/Kolkata', NULL, NULL),
    ('AITM', 'AITM-SITE-PLANT-01', 'Main Textile Mill',
     'Spinning, weaving, dyeing, and finishing plant',
     'plant', 'IN', 'Asia/Kolkata', 'spindles', 25000.00);

    -- ── ACFB — Canada Food & Beverage Manufacturing ─────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ACFB', 'ACFB-SITE-HQ', 'Food & Bev HQ',
     'Corporate office, Toronto',
     'office', 'CA', 'America/Toronto', NULL, NULL),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'Main Processing Plant',
     'Food processing, packaging, and cold storage facility',
     'plant', 'CA', 'America/Toronto', 'tonnes_day', 120.00);

    -- ── ADPM — Germany Pharmaceutical Manufacturing ─────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ADPM', 'ADPM-SITE-HQ', 'Pharma HQ',
     'Corporate and R&D office, Frankfurt',
     'office', 'DE', 'Europe/Berlin', NULL, NULL),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'GMP Manufacturing Plant',
     'GMP-certified pharmaceutical production and packaging',
     'plant', 'DE', 'Europe/Berlin', 'units_day', 500000.00);

    -- ── ATEM — Taiwan Electronics Manufacturing ─────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ATEM', 'ATEM-SITE-HQ', 'Electronics HQ',
     'Corporate office, Taipei',
     'office', 'TW', 'Asia/Taipei', NULL, NULL),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'SMT Assembly Plant',
     'Surface-mount assembly, testing, and packaging',
     'plant', 'TW', 'Asia/Taipei', 'units_day', 80000.00);

    -- ── ASPE — South Africa Crude Petroleum Extraction ──────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ASPE', 'ASPE-SITE-HQ', 'Petroleum HQ',
     'Corporate office, Johannesburg',
     'office', 'ZA', 'Africa/Johannesburg', NULL, NULL),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'Primary Extraction Field',
     'Wellhead operations, field storage, and pump stations',
     'yard', 'ZA', 'Africa/Johannesburg', 'bpd', 15000.00);

    -- ── AUKA — UK Agriculture ───────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AUKA', 'AUKA-SITE-HQ', 'Agriculture HQ',
     'Corporate office, London',
     'office', 'GB', 'Europe/London', NULL, NULL),
    ('AUKA', 'AUKA-SITE-FARM-01', 'Main Farm Estate',
     'Arable and livestock operations, grain storage, and cold store',
     'yard', 'GB', 'Europe/London', 'hectares', 850.00);

    -- ── AJED — Japan Education Services ─────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AJED', 'AJED-SITE-CAMPUS-01', 'Main Campus',
     'Primary teaching campus, lecture halls, and administration',
     'branch', 'JP', 'Asia/Tokyo', 'students', 5000.00);

    -- ── APHS — Philippines Hospital Services ────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'Main Hospital',
     'General hospital with emergency, surgical, and outpatient services',
     'branch', 'PH', 'Asia/Manila', 'beds', 400.00);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D-pre: Unmatched temp row detection (fail fast, not silent skip)
    -- ════════════════════════════════════════════════════════════════════════

    -- D-pre-1: Every company_code in tmp must resolve
    SELECT count(*) INTO v_bad
    FROM tmp_site t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.code = t.company_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[303_sites] % tmp_site row(s) have unresolvable company_code', v_bad;
    END IF;

    -- D-pre-2: Every parent_code in tmp must resolve to an existing tmp root
    SELECT count(*) INTO v_bad
    FROM tmp_site t
    WHERE t.parent_code IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM tmp_site p
          WHERE p.code = t.parent_code AND p.parent_code IS NULL
      );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[303_sites] % tmp_site child row(s) reference non-root parent_code', v_bad;
    END IF;

    -- Capture expected count before insert
    SELECT count(*) INTO v_expected FROM tmp_site;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT — Pass 1: Root sites (parent_code IS NULL)
    -- Triggers fire on each INSERT:
    --   trg_site_level         — sets level_no = 1 (no parent)
    --   trg_site_status_lookup — validates 'active' against master.site_status
    --   trg_site_type_lookup   — validates site_type against master.site_type
    -- ════════════════════════════════════════════════════════════════════════

    INSERT INTO master.site (
        id, tenant_id, code, name, description,
        company_code_id, site_type,
        parent_site_id, sort_order,
        country_code, timezone_code,
        capacity_uom, capacity_value,
        metadata, status, created_by
    )
    SELECT
        t.seed_id,
        v_tid,
        t.code,
        t.name,
        t.description,
        cc.id,
        t.site_type,
        NULL,                             -- root: no parent
        t.sort_order,
        t.country_code,
        t.timezone_code,
        t.capacity_uom,
        t.capacity_value,
        v_meta,
        'active',
        v_su
    FROM tmp_site t
    JOIN master.company_code cc
      ON cc.tenant_id = v_tid AND cc.code = t.company_code
    WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        description     = EXCLUDED.description,
        company_code_id = EXCLUDED.company_code_id,
        site_type       = EXCLUDED.site_type,
        sort_order      = EXCLUDED.sort_order,
        country_code    = EXCLUDED.country_code,
        timezone_code   = EXCLUDED.timezone_code,
        capacity_uom    = EXCLUDED.capacity_uom,
        capacity_value  = EXCLUDED.capacity_value,
        status          = EXCLUDED.status,
        metadata        = master.site.metadata
                          || jsonb_build_object('_seed', jsonb_build_object(
                                 'pack',      v_pack,
                                 'version',   v_version,
                                 'seeded_at', now()::text
                             )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.site.name, master.site.description, master.site.company_code_id,
           master.site.site_type, master.site.sort_order, master.site.country_code,
           master.site.timezone_code, master.site.capacity_uom, master.site.capacity_value,
           master.site.status)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.company_code_id,
           EXCLUDED.site_type, EXCLUDED.sort_order, EXCLUDED.country_code,
           EXCLUDED.timezone_code, EXCLUDED.capacity_uom, EXCLUDED.capacity_value,
           EXCLUDED.status);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE E: UPSERT — Pass 2: Child sites (parent_code IS NOT NULL)
    -- Additional triggers:
    --   trg_site_parent_co — enforces parent belongs to same company_code_id
    --   trg_site_level     — sets level_no = parent.level_no + 1
    -- Parent join tightened: ps.company_code_id = cc.id (fail in SQL, not trigger)
    -- ════════════════════════════════════════════════════════════════════════

    INSERT INTO master.site (
        id, tenant_id, code, name, description,
        company_code_id, site_type,
        parent_site_id, sort_order,
        country_code, timezone_code,
        capacity_uom, capacity_value,
        metadata, status, created_by
    )
    SELECT
        t.seed_id,
        v_tid,
        t.code,
        t.name,
        t.description,
        cc.id,
        t.site_type,
        ps.id,                            -- resolved parent
        t.sort_order,
        t.country_code,
        t.timezone_code,
        t.capacity_uom,
        t.capacity_value,
        v_meta,
        'active',
        v_su
    FROM tmp_site t
    JOIN master.company_code cc
      ON cc.tenant_id = v_tid AND cc.code = t.company_code
    JOIN master.site ps
      ON ps.tenant_id = v_tid
     AND ps.code = t.parent_code
     AND ps.company_code_id = cc.id       -- parent must belong to same company
    WHERE t.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        description     = EXCLUDED.description,
        company_code_id = EXCLUDED.company_code_id,
        site_type       = EXCLUDED.site_type,
        parent_site_id  = EXCLUDED.parent_site_id,
        sort_order      = EXCLUDED.sort_order,
        country_code    = EXCLUDED.country_code,
        timezone_code   = EXCLUDED.timezone_code,
        capacity_uom    = EXCLUDED.capacity_uom,
        capacity_value  = EXCLUDED.capacity_value,
        status          = EXCLUDED.status,
        metadata        = master.site.metadata
                          || jsonb_build_object('_seed', jsonb_build_object(
                                 'pack',      v_pack,
                                 'version',   v_version,
                                 'seeded_at', now()::text
                             )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.site.name, master.site.description, master.site.company_code_id,
           master.site.site_type, master.site.parent_site_id, master.site.sort_order,
           master.site.country_code, master.site.timezone_code,
           master.site.capacity_uom, master.site.capacity_value, master.site.status)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.company_code_id,
           EXCLUDED.site_type, EXCLUDED.parent_site_id, EXCLUDED.sort_order,
           EXCLUDED.country_code, EXCLUDED.timezone_code,
           EXCLUDED.capacity_uom, EXCLUDED.capacity_value, EXCLUDED.status);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE F: Stale-code cleanup
    -- Deactivate any rows in the same pack whose code no longer appears in
    -- tmp_site. Also deactivates leftover rows from the old 303_org pack.
    -- Preserves FK integrity (no DELETE), but removes stale rows from the
    -- active set so exact-count assertions stay correct on rerun.
    -- ════════════════════════════════════════════════════════════════════════

    -- Deactivate stale rows from current pack
    UPDATE master.site
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  tenant_id = v_tid
      AND  metadata->'_seed'->>'pack' = v_pack
      AND  status = 'active'
      AND  code NOT IN (SELECT t.code FROM tmp_site t);

    GET DIAGNOSTICS v_stale = ROW_COUNT;

    -- Deactivate leftover rows from the old 303_org pack (migration cleanup)
    UPDATE master.site
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  tenant_id = v_tid
      AND  metadata->'_seed'->>'pack' = '303_org'
      AND  status = 'active'
      AND  code NOT IN (SELECT t.code FROM tmp_site t);

    GET DIAGNOSTICS v_bad = ROW_COUNT;
    v_stale := v_stale + v_bad;

    IF v_stale > 0 THEN
        RAISE NOTICE '[303_sites] Deactivated % stale site(s) from previous seed run', v_stale;
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE G: Assertions
    -- Count only active rows in pack (stale rows are now inactive).
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_actual
    FROM master.site
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND status = 'active';

    -- Exact count: active seeded rows must equal tmp_site rows
    IF v_actual != v_expected THEN
        RAISE EXCEPTION '[303_sites] Row count mismatch: expected % (from tmp_site), got % active in master.site',
            v_expected, v_actual;
    END IF;

    -- Every active company_code has at least one active site
    IF EXISTS (
        SELECT cc.code
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM master.site s
              WHERE s.tenant_id = v_tid AND s.company_code_id = cc.id
                AND s.status = 'active'
          )
    ) THEN
        RAISE EXCEPTION '[303_sites] Orphan company_code found — every active company must have ≥1 active site';
    END IF;

    -- No self-referencing sites (DDL CHECK but verify seed correctness)
    IF EXISTS (
        SELECT 1 FROM master.site
        WHERE tenant_id = v_tid AND parent_site_id = id
    ) THEN
        RAISE EXCEPTION '[303_sites] Self-referencing site detected';
    END IF;

    RAISE NOTICE '[303_sites] Seed complete: % active sites across % companies (expected: %, stale deactivated: %)',
        v_actual,
        (SELECT count(DISTINCT company_code_id) FROM master.site
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND status = 'active'),
        v_expected,
        v_stale;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/304_warehouses.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — WAREHOUSE SEED: Inventory storage nodes
-- ============================================================================
-- File:     304_warehouses.sql
-- Schema:   master.warehouse
-- Purpose:  Seed 50 warehouses selectively — only where stock, receiving,
--           dispatch, spares, pharmacy, cold-chain, or transit storage are
--           real business objects. No warehouses for pure corporate / services /
--           financial / IT / education companies.
-- Depends:  303_sites.sql              (master.site must exist)
--           199_gl_preseed.sql         (company codes for cross-validation)
-- Replaces: 303_sites_warehouses.sql   (split into 303 + 304)
-- Idempotent: Yes — ON CONFLICT (tenant_id, site_id, code) DO UPDATE
-- Notes:
--   • warehouse_type  — validated by trigger trg_wh_type_lookup against
--                        master.warehouse_type (raw, finished_goods, spares,
--                        transit, returns)
--   • status          — validated by trigger trg_wh_status_lookup against
--                        master.warehouse_status (draft, active, inactive)
--   • manager_id      — left NULL; principal seeds not yet stable
--   • company_code    — included in tmp for cross-validation join through
--                        site → company_code chain
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '340_org';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_expected int;
    v_actual   int;
    v_bad      int;
    v_stale    int;
BEGIN
    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE A: Resolve tenant & verify prerequisites
    -- ════════════════════════════════════════════════════════════════════════

    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[304_warehouses] Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- Verify sites are loaded (from 303_sites.sql with pack 340_org)
    IF (SELECT count(*) FROM master.site
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND status = 'active') < 30 THEN
        RAISE EXCEPTION '[304_warehouses] Sites not loaded — run 303_sites.sql first';
    END IF;

    -- ── Full lookup validation: all warehouse_type values used by this seed
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('raw'), ('finished_goods'), ('spares'), ('transit'), ('returns')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM control.lookup_value lv
            WHERE lv.domain_code = 'master.warehouse_type'
              AND lv.code = v.code
              AND lv.tenant_id IS NULL
        )
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Missing warehouse_type lookup value(s) — need: raw, finished_goods, spares, transit, returns';
    END IF;

    -- ── Full lookup validation: warehouse_status 'active' ───────────────
    IF NOT EXISTS (
        SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.warehouse_status' AND code = 'active' AND tenant_id IS NULL
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Missing warehouse_status lookup value: active';
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE B: Temp table (includes company_code for cross-validation)
    -- ════════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_wh (
        seed_id                   uuid DEFAULT shared.uuidv7(),
        company_code              text    NOT NULL,
        site_code                 text    NOT NULL,
        code                      text    NOT NULL,
        name                      text    NOT NULL,
        description               text,
        warehouse_type            text    NOT NULL DEFAULT 'finished_goods',
        is_negative_stock_allowed boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE C: Insert warehouse data
    --
    -- Selection rule:
    --   NO warehouse:  ATHQ, AUIC, ASGF, AJED (pure corporate/services)
    --   BASIC:         AMRE (1), ASAH (2)
    --   OPERATIONAL:   everything else (3-6 per company)
    --
    -- warehouse_type values: raw, finished_goods, spares, transit, returns
    -- ════════════════════════════════════════════════════════════════════════

    -- ── AMRE — Malaysia Real Estate (1 warehouse) ───────────────────────
    -- Maintenance spares and consumables at the property operations centre
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AMRE', 'AMRE-SITE-PROP-OPS', 'WH-MAINT',
     'Maintenance Store',
     'Building maintenance spares, tools, and consumables',
     'spares');

    -- ── AQTU — Qatar Utilities (3 warehouses) ───────────────────────────
    -- Plant spares, consumables, and a returns/defect bay
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AQTU', 'AQTU-SITE-PLANT-01', 'WH-SPARES',
     'Plant Spares',
     'Critical and rotable spares for generation equipment',
     'spares'),
    ('AQTU', 'AQTU-SITE-PLANT-01', 'WH-CONSUM',
     'Consumables',
     'Chemicals, lubricants, filters, and operational consumables',
     'raw'),
    ('AQTU', 'AQTU-SITE-PLANT-01', 'WH-RETURNS',
     'Returns & Defects',
     'Defective parts pending supplier return or disposal',
     'returns');

    -- ── ASAC — Saudi Construction (4 warehouses) ────────────────────────
    -- Materials, tooling, spares, and returns at the main equipment yard
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-MAT',
     'Construction Materials',
     'Bulk materials — cement, rebar, aggregates, timber',
     'raw'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-TOOLS',
     'Tools & Small Equipment',
     'Power tools, hand tools, PPE, and small plant',
     'spares'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-SPARES',
     'Equipment Spares',
     'Spare parts for heavy plant and vehicles',
     'spares'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-RETURNS',
     'Returns & Salvage',
     'Damaged materials and salvage pending disposition',
     'returns');

    -- ── AQTS — Qatar Transport & Storage (3 warehouses) ─────────────────
    -- Transit, cross-dock, and fleet spares at the main depot
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type, is_negative_stock_allowed) VALUES
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'WH-TRANSIT',
     'In-Transit Store',
     'Goods in transit between origin and destination',
     'transit', true),
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'WH-CROSSDOCK',
     'Cross-Dock',
     'Short-hold cross-docking area for same-day dispatch',
     'transit', true),
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'WH-SPARES',
     'Fleet Spares',
     'Tyres, brake components, and vehicle parts',
     'spares', false);

    -- ── AUET — UAE Trading (3 warehouses) ───────────────────────────────
    -- Finished goods, returns, and transit at the distribution centre
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type, is_negative_stock_allowed) VALUES
    ('AUET', 'AUET-SITE-DC-01', 'WH-FG',
     'Finished Goods',
     'Pick-pack-ship warehouse for customer orders',
     'finished_goods', false),
    ('AUET', 'AUET-SITE-DC-01', 'WH-RETURNS',
     'Customer Returns',
     'Returns processing — inspection, restock, or disposal',
     'returns', false),
    ('AUET', 'AUET-SITE-DC-01', 'WH-TRANSIT',
     'In-Transit Store',
     'Goods awaiting customs clearance or onward shipment',
     'transit', true);

    -- ── ASAH — Saudi Hospitality (2 warehouses) ─────────────────────────
    -- Food & beverage and housekeeping at the hotel
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ASAH', 'ASAH-SITE-HOTEL-01', 'WH-FB',
     'Food & Beverage Store',
     'Dry goods, perishables, and beverage inventory for kitchen and bar',
     'raw'),
    ('ASAH', 'ASAH-SITE-HOTEL-01', 'WH-HK',
     'Housekeeping Store',
     'Linen, cleaning supplies, amenities, and guest consumables',
     'spares');

    -- ── AITM — India Textile & Leather Mfg (5 warehouses) ──────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-RAW',
     'Raw Materials',
     'Cotton bales, yarn, dyes, chemicals, and leather hides',
     'raw'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-WIP',
     'Work-in-Progress',
     'Partially processed goods between production stages',
     'raw'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Finished textiles and leather goods ready for dispatch',
     'finished_goods'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-SPARES',
     'Machine Spares',
     'Spare parts for looms, spinning frames, and dyeing equipment',
     'spares'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-QC',
     'Quality Hold',
     'Materials or products held pending quality inspection',
     'raw');

    -- ── ACFB — Canada Food & Beverage Mfg (6 warehouses) ───────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-RAW',
     'Raw Ingredients',
     'Flour, sugar, oils, flavourings, and agricultural inputs',
     'raw'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-PACK',
     'Packaging Materials',
     'Cartons, labels, shrink-wrap, and bottles',
     'raw'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Shelf-stable finished products ready for dispatch',
     'finished_goods'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-COLD',
     'Cold Store',
     'Temperature-controlled storage for perishable products',
     'finished_goods'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-QC',
     'Quality Hold',
     'Products held for lab testing, batch release, or recall',
     'raw'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-RETURNS',
     'Returns & Recall',
     'Customer returns and product recall staging',
     'returns');

    -- ── ADPM — Germany Pharmaceutical Mfg (6 warehouses) ────────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-RAW',
     'Raw Materials',
     'APIs, excipients, and raw pharma materials',
     'raw'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-QC',
     'QC Laboratory Hold',
     'Samples and batches under quality control testing',
     'raw'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-QUAR',
     'Quarantine',
     'Incoming materials in quarantine pending release',
     'raw'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Released pharmaceutical products awaiting dispatch',
     'finished_goods'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-SPARES',
     'Equipment Spares',
     'GMP-grade spare parts for clean-room and packaging machinery',
     'spares'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-RETURNS',
     'Returns & Expired',
     'Returned or expired products pending destruction or credit',
     'returns');

    -- ── ATEM — Taiwan Electronics Mfg (5 warehouses) ────────────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-RAW',
     'Raw Components',
     'PCBs, ICs, resistors, capacitors, and connectors',
     'raw'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-WIP',
     'Work-in-Progress',
     'Partially assembled boards and sub-assemblies',
     'raw'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Tested and packaged electronic assemblies',
     'finished_goods'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-SPARES',
     'Line Spares',
     'Nozzles, feeders, and spare parts for SMT lines',
     'spares'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-RMA',
     'RMA Returns',
     'Customer returns for rework, repair, or scrap',
     'returns');

    -- ── ASPE — South Africa Crude Petroleum (4 warehouses) ──────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-SPARES',
     'Field Spares',
     'Wellhead valves, pipe fittings, and pump parts',
     'spares'),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-CHEM',
     'Chemicals & Fluids',
     'Drilling fluids, corrosion inhibitors, and treatment chemicals',
     'raw'),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-FIELD',
     'Field Equipment',
     'Rotable equipment, casings, and drilling tools',
     'spares'),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-RETURNS',
     'Returns & Scrap',
     'Worn parts and scrap metal pending disposal or reclaim',
     'returns');

    -- ── AUKA — UK Agriculture (4 warehouses) ────────────────────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-INPUT',
     'Farm Inputs',
     'Seeds, fertiliser, pesticides, and animal feed',
     'raw'),
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-HARVEST',
     'Harvest Store',
     'Grain silos and bulk crop storage',
     'finished_goods'),
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-COLD',
     'Cold Store',
     'Chilled and frozen storage for dairy, meat, and produce',
     'finished_goods'),
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-SPARES',
     'Machinery Spares',
     'Tractor, combine, and irrigation spares',
     'spares');

    -- ── APHS — Philippines Hospital Services (4 warehouses) ─────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-PHARM',
     'Pharmacy',
     'Controlled and non-controlled pharmaceutical inventory',
     'finished_goods'),
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-MEDSUP',
     'Medical Supplies',
     'Disposables, PPE, syringes, catheters, and surgical supplies',
     'spares'),
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-STERILE',
     'Sterile Store',
     'Sterilised instruments and implants',
     'spares'),
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-GEN',
     'General Store',
     'Linen, cleaning supplies, office consumables, and maintenance spares',
     'spares');

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D-pre: Unmatched temp row detection (fail fast, not silent skip)
    -- ════════════════════════════════════════════════════════════════════════

    -- D-pre-1: Every company_code in tmp must resolve
    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.code = t.company_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have unresolvable company_code', v_bad;
    END IF;

    -- D-pre-2: Every site_code in tmp must resolve
    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.site s
        WHERE s.tenant_id = v_tid AND s.code = t.site_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have unresolvable site_code', v_bad;
    END IF;

    -- D-pre-3: Every site_code must belong to the stated company_code
    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    JOIN master.site s ON s.tenant_id = v_tid AND s.code = t.site_code
    JOIN master.company_code cc ON cc.tenant_id = v_tid AND cc.code = t.company_code
    WHERE s.company_code_id != cc.id;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have site/company mismatch', v_bad;
    END IF;

    -- Capture expected count before insert
    SELECT count(*) INTO v_expected FROM tmp_wh;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT with company cross-validation
    -- JOIN path: tmp_wh → master.site (on site_code)
    --                    → master.company_code (on company_code)
    --          and verify site.company_code_id = company_code.id
    --
    -- Triggers fire on each INSERT:
    --   trg_wh_status_lookup — validates 'active' against master.warehouse_status
    --   trg_wh_type_lookup   — validates warehouse_type against master.warehouse_type
    -- ════════════════════════════════════════════════════════════════════════

    INSERT INTO master.warehouse (
        id, tenant_id, code, name, description,
        site_id, warehouse_type, is_negative_stock_allowed,
        metadata, status, created_by
    )
    SELECT
        t.seed_id,
        v_tid,
        t.code,
        t.name,
        t.description,
        s.id,
        t.warehouse_type,
        t.is_negative_stock_allowed,
        v_meta,
        'active',
        v_su
    FROM tmp_wh t
    JOIN master.site s
      ON s.tenant_id = v_tid AND s.code = t.site_code
    JOIN master.company_code cc
      ON cc.tenant_id = v_tid AND cc.code = t.company_code
    WHERE s.company_code_id = cc.id
    ON CONFLICT (tenant_id, site_id, code) DO UPDATE SET
        name                      = EXCLUDED.name,
        description               = EXCLUDED.description,
        warehouse_type            = EXCLUDED.warehouse_type,
        is_negative_stock_allowed = EXCLUDED.is_negative_stock_allowed,
        status                    = EXCLUDED.status,
        metadata                  = master.warehouse.metadata
                                    || jsonb_build_object('_seed', jsonb_build_object(
                                           'pack',      v_pack,
                                           'version',   v_version,
                                           'seeded_at', now()::text
                                       )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.warehouse.name, master.warehouse.description,
           master.warehouse.warehouse_type, master.warehouse.is_negative_stock_allowed,
           master.warehouse.status)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.warehouse_type, EXCLUDED.is_negative_stock_allowed,
           EXCLUDED.status);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE E: Stale-code cleanup
    -- Deactivate any rows in the same pack whose (site_id, code) combination
    -- no longer appears in tmp_wh. Also deactivates leftover rows from the
    -- old 303_org pack. Preserves FK integrity (no DELETE), but removes stale
    -- rows from the active set so exact-count assertions stay correct on
    -- rerun after code renames.
    -- ════════════════════════════════════════════════════════════════════════

    -- Deactivate stale rows from current pack
    UPDATE master.warehouse w
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  w.tenant_id = v_tid
      AND  w.metadata->'_seed'->>'pack' = v_pack
      AND  w.status = 'active'
      AND  NOT EXISTS (
               SELECT 1
               FROM tmp_wh t
               JOIN master.site s
                 ON s.tenant_id = v_tid AND s.code = t.site_code
               WHERE s.id = w.site_id AND t.code = w.code
           );

    GET DIAGNOSTICS v_stale = ROW_COUNT;

    -- Deactivate leftover rows from the old 303_org pack (migration cleanup)
    UPDATE master.warehouse w
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  w.tenant_id = v_tid
      AND  w.metadata->'_seed'->>'pack' = '303_org'
      AND  w.status = 'active'
      AND  NOT EXISTS (
               SELECT 1
               FROM tmp_wh t
               JOIN master.site s
                 ON s.tenant_id = v_tid AND s.code = t.site_code
               WHERE s.id = w.site_id AND t.code = w.code
           );

    GET DIAGNOSTICS v_bad = ROW_COUNT;
    v_stale := v_stale + v_bad;

    IF v_stale > 0 THEN
        RAISE NOTICE '[304_warehouses] Deactivated % stale warehouse(s) from previous seed run', v_stale;
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE F: Assertions
    -- Count only active rows in pack (stale rows are now inactive).
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_actual
    FROM master.warehouse
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND status = 'active';

    -- Exact count: active seeded rows must equal tmp_wh rows
    IF v_actual != v_expected THEN
        RAISE EXCEPTION '[304_warehouses] Row count mismatch: expected % (from tmp_wh), got % active in master.warehouse',
            v_expected, v_actual;
    END IF;

    -- No warehouses for pure-services companies
    IF EXISTS (
        SELECT 1 FROM master.warehouse w
        JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        JOIN master.company_code cc ON cc.tenant_id = s.tenant_id AND cc.id = s.company_code_id
        WHERE w.tenant_id = v_tid
          AND w.metadata->'_seed'->>'pack' = v_pack
          AND w.status = 'active'
          AND cc.code IN ('ATHQ', 'AUIC', 'ASGF', 'AJED')
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Unexpected warehouse on pure-services company';
    END IF;

    -- Company cross-validation: every active warehouse's site belongs to a real company
    IF EXISTS (
        SELECT w.id
        FROM master.warehouse w
        JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = v_tid
          AND w.metadata->'_seed'->>'pack' = v_pack
          AND w.status = 'active'
          AND s.company_code_id IS NULL
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Active warehouse linked to site with no company';
    END IF;

    -- Negative stock only on transit warehouses (active set only)
    IF EXISTS (
        SELECT 1 FROM master.warehouse
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND status = 'active'
          AND is_negative_stock_allowed = true
          AND warehouse_type != 'transit'
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Negative stock allowed on non-transit warehouse';
    END IF;

    RAISE NOTICE '[304_warehouses] Seed complete: % active warehouses across % sites (% companies, expected: %, stale deactivated: %)',
        v_actual,
        (SELECT count(DISTINCT w.site_id) FROM master.warehouse w
         WHERE w.tenant_id = v_tid AND w.metadata->'_seed'->>'pack' = v_pack
           AND w.status = 'active'),
        (SELECT count(DISTINCT s.company_code_id)
         FROM master.warehouse w
         JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
         WHERE w.tenant_id = v_tid AND w.metadata->'_seed'->>'pack' = v_pack
           AND w.status = 'active'),
        v_expected,
        v_stale;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/310_fiscal_periods.sql
-- ============================================================================
-- 310_fiscal_periods.sql — Fiscal periods for all companies
-- ============================================================================
-- Generates per (company, fiscal_year):
--   Period 0:  opening balance (single day = FY start)
--   Period 1-12: normal monthly
--   Period 13: year-end adjustment (single day = FY end)
-- FY start months: Jan(11 cos), Mar(1 co — ZA), Apr(3 cos — QA×2,IN,GB,JP)
-- Status: FY2025 = 'open', FY2026 = 'future'
-- Depends: 199 (company_codes with fiscal_year_start_month)
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_meta    jsonb := '{"_seed": {"pack": "310_org", "version": "2.0.0"}}'::jsonb;
    v_cc      record;
    v_fy      int;
    v_fy_start date;   -- first day of fiscal year
    v_fy_end   date;   -- last day of fiscal year
    v_pstart   date;
    v_pend     date;
    v_pnum     int;
    v_status   text;
    v_active_cos int;
    v_expected   int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    SELECT count(*) INTO v_active_cos FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    FOR v_cc IN
        SELECT id, code, name, fiscal_year_start_month
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        FOR v_fy IN 2025..2026 LOOP
            -- ──────────────────────────────────────────────────────────
            -- Compute FY boundaries
            -- FY start = 1st of start_month in the anchor year
            -- For Jan start: anchor = v_fy (Jan 2025 → Dec 2025)
            -- For non-Jan: anchor = v_fy - 1 (Apr 2024 → Mar 2025 = FY2025)
            -- ──────────────────────────────────────────────────────────
            v_fy_start := make_date(
                CASE WHEN v_cc.fiscal_year_start_month = 1 THEN v_fy
                     ELSE v_fy - 1 END,
                v_cc.fiscal_year_start_month, 1
            );
            v_fy_end := (v_fy_start + interval '12 months' - interval '1 day')::date;

            -- FY2025 periods = open (demo), FY2026 = future
            v_status := CASE WHEN v_fy = 2025 THEN 'open' ELSE 'future' END;

            -- Period 0: opening balance (single day = FY start)
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name,
                 fiscal_year, period_number, period_type,
                 start_date, end_date, sort_order,
                 status, created_by, metadata)
            VALUES
                (v_tid, v_cc.id,
                 v_cc.code || '-' || v_fy || '-P00',
                 'FY' || v_fy || ' Opening Balance',
                 v_fy, 0, 'opening',
                 v_fy_start, v_fy_start, 0,
                 v_status, v_su, v_meta)
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
            DO UPDATE SET start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date, status = EXCLUDED.status,
                updated_at = now(), updated_by = v_su;

            -- Periods 1-12: normal monthly
            FOR v_pnum IN 1..12 LOOP
                v_pstart := (v_fy_start + (v_pnum - 1) * interval '1 month')::date;
                v_pend   := (v_pstart + interval '1 month' - interval '1 day')::date;

                INSERT INTO master.fiscal_period
                    (tenant_id, company_code_id, code, name,
                     fiscal_year, period_number, period_type,
                     start_date, end_date, sort_order,
                     status, created_by, metadata)
                VALUES
                    (v_tid, v_cc.id,
                     v_cc.code || '-' || v_fy || '-P' || lpad(v_pnum::text, 2, '0'),
                     'FY' || v_fy || ' Period ' || v_pnum
                         || ' (' || to_char(v_pstart, 'Mon YYYY') || ')',
                     v_fy, v_pnum, 'normal',
                     v_pstart, v_pend, v_pnum,
                     v_status, v_su, v_meta)
                ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
                DO UPDATE SET start_date = EXCLUDED.start_date,
                    end_date = EXCLUDED.end_date, name = EXCLUDED.name,
                    status = EXCLUDED.status,
                    updated_at = now(), updated_by = v_su;
            END LOOP;

            -- Period 13: year-end adjustment (single day = FY end)
            INSERT INTO master.fiscal_period
                (tenant_id, company_code_id, code, name,
                 fiscal_year, period_number, period_type,
                 start_date, end_date, sort_order,
                 status, created_by, metadata)
            VALUES
                (v_tid, v_cc.id,
                 v_cc.code || '-' || v_fy || '-P13',
                 'FY' || v_fy || ' Year-End Adjustment',
                 v_fy, 13, 'adjustment',
                 v_fy_end, v_fy_end, 13,
                 'future', v_su, v_meta)  -- adjustment always starts as future
            ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
            DO UPDATE SET start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                updated_at = now(), updated_by = v_su;
        END LOOP;
    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════
    v_expected := v_active_cos * 2 * 14;  -- companies × FYs × (0+12+13)

    -- A1: Total row count
    IF (SELECT count(*) FROM master.fiscal_period WHERE tenant_id = v_tid) != v_expected
    THEN RAISE EXCEPTION '310 FAIL: expected % periods, got %', v_expected,
        (SELECT count(*) FROM master.fiscal_period WHERE tenant_id = v_tid);
    END IF;

    -- A2: Exactly 1 period 0 and 1 period 13 per (company, FY)
    IF EXISTS (
        SELECT company_code_id, fiscal_year, count(*)
        FROM master.fiscal_period
        WHERE tenant_id = v_tid AND period_number = 0
        GROUP BY company_code_id, fiscal_year HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '310 FAIL: company/FY with != 1 opening period'; END IF;

    IF EXISTS (
        SELECT company_code_id, fiscal_year, count(*)
        FROM master.fiscal_period
        WHERE tenant_id = v_tid AND period_number = 13
        GROUP BY company_code_id, fiscal_year HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '310 FAIL: company/FY with != 1 adjustment period'; END IF;

    -- A3: No date gaps or overlaps within normal periods (1-12)
    IF EXISTS (
        WITH ordered AS (
            SELECT company_code_id, fiscal_year,
                   end_date,
                   LEAD(start_date) OVER (
                       PARTITION BY company_code_id, fiscal_year
                       ORDER BY period_number
                   ) AS next_start
            FROM master.fiscal_period
            WHERE tenant_id = v_tid AND period_number BETWEEN 1 AND 12
        )
        SELECT 1 FROM ordered
        WHERE next_start IS NOT NULL AND next_start != end_date + 1
    ) THEN RAISE EXCEPTION '310 FAIL: date gap or overlap in normal periods'; END IF;

    -- A4: Period 13 end_date = FY end (matches Period 12 end_date)
    IF EXISTS (
        SELECT p13.company_code_id, p13.fiscal_year
        FROM master.fiscal_period p13
        JOIN master.fiscal_period p12
            ON p12.tenant_id = p13.tenant_id
            AND p12.company_code_id = p13.company_code_id
            AND p12.fiscal_year = p13.fiscal_year
            AND p12.period_number = 12
        WHERE p13.tenant_id = v_tid AND p13.period_number = 13
          AND p13.end_date != p12.end_date
    ) THEN RAISE EXCEPTION '310 FAIL: Period 13 end_date != Period 12 end_date'; END IF;

    RAISE NOTICE '310: % fiscal periods (% companies × 2 FYs × 14 periods)',
        (SELECT count(*) FROM master.fiscal_period WHERE tenant_id = v_tid),
        v_active_cos;
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/100_org_structure/311_ledger_books.sql
-- ============================================================================
-- 311_ledger_books.sql — Ledger books + company-book assignments
-- ============================================================================
-- Design: One statutory book per company (correct currency + framework)
--         One shared group management book (MYR, IFRS, for consolidation)
-- Each company gets: 1 statutory assignment + 1 management assignment = 2
-- Total: 17 statutory books + 1 management = 18 books, 34 assignments
-- Depends: 199 (company_codes with functional_currency, regulatory_framework)
-- ============================================================================

DO $seed$
DECLARE
    v_tid    uuid;
    v_su     uuid := '00000000-0000-0000-0000-000000000000';
    v_meta   jsonb := '{"_seed": {"pack": "311_org", "version": "2.0.0"}}'::jsonb;
    v_cc     record;
    v_mgmt   uuid;
    v_book   uuid;
    v_active_cos int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    SELECT count(*) INTO v_active_cos FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    -- ══════════════════════════════════════════════════════════════════════
    -- PREREQUISITE: Verify lookup values exist (hard fail — triggers will
    -- reject the INSERT anyway, so fail early with a clear message)
    -- ══════════════════════════════════════════════════════════════════════
    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_category' AND code = 'statutory')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_category "statutory" missing from lookup'; END IF;

    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_category' AND code = 'management')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_category "management" missing from lookup'; END IF;

    IF NOT EXISTS (SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.ledger_book_close_mode' AND code = 'unified')
    THEN RAISE EXCEPTION '311 FAIL: ledger_book_close_mode "unified" missing from lookup'; END IF;

    -- Verify every company's regulatory_framework is accepted by
    -- the ledger_book_standard lookup before we use it as reporting_standard
    IF EXISTS (
        SELECT cc.code, COALESCE(cc.regulatory_framework, 'ifrs') AS fw
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM control.lookup_value lv
              WHERE lv.domain_code = 'master.ledger_book_standard'
                AND lv.code = COALESCE(cc.regulatory_framework, 'ifrs'))
    ) THEN RAISE EXCEPTION '311 FAIL: company regulatory_framework value not in ledger_book_standard lookup: %',
        (SELECT string_agg(DISTINCT COALESCE(cc.regulatory_framework, 'ifrs'), ', ')
         FROM master.company_code cc
         WHERE cc.tenant_id = v_tid AND cc.status = 'active'
           AND NOT EXISTS (
               SELECT 1 FROM control.lookup_value lv
               WHERE lv.domain_code = 'master.ledger_book_standard'
                 AND lv.code = COALESCE(cc.regulatory_framework, 'ifrs')));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE A: Group management book (shared, MYR, IFRS)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO master.ledger_book
        (tenant_id, code, name, description, category, reporting_standard,
         base_currency_code, is_primary, is_auto_post, is_manual_je_allowed,
         is_reversal_allowed, close_mode, sort_order, status, created_by, metadata)
    VALUES
        (v_tid, 'BOOK-MGMT-GROUP', 'Group Management', 'Management reporting in MYR',
         'management', 'ifrs', 'MYR', false, true, true, true, 'unified',
         900, 'active', v_su, v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, base_currency_code = EXCLUDED.base_currency_code,
        updated_at = now(), updated_by = v_su
    WHERE (master.ledger_book.name, master.ledger_book.base_currency_code)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.base_currency_code);

    SELECT id INTO v_mgmt FROM master.ledger_book
    WHERE tenant_id = v_tid AND code = 'BOOK-MGMT-GROUP';

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Per-company statutory books
    -- One book per company, using company's functional_currency and framework
    -- Code: {COMPANY}-BOOK-STAT
    -- ══════════════════════════════════════════════════════════════════════
    FOR v_cc IN
        SELECT id, code, name, functional_currency,
               COALESCE(regulatory_framework, 'ifrs') AS framework
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        INSERT INTO master.ledger_book
            (tenant_id, code, name, description, category, reporting_standard,
             base_currency_code, is_primary, is_auto_post, is_manual_je_allowed,
             is_reversal_allowed, close_mode, sort_order, status, created_by, metadata)
        VALUES
            (v_tid,
             v_cc.code || '-BOOK-STAT',
             v_cc.name || ' Statutory',
             'Statutory book for ' || v_cc.code || ' (' || v_cc.functional_currency || ')',
             'statutory', v_cc.framework, v_cc.functional_currency,
             false, true, true, true, 'unified',
             10, 'active', v_su,
             jsonb_build_object('_seed', jsonb_build_object(
                 'pack', '311_org', 'version', '2.0.0',
                 'company_code', v_cc.code, 'seeded_at', now()::text
             )))
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            base_currency_code = EXCLUDED.base_currency_code,
            reporting_standard = EXCLUDED.reporting_standard,
            updated_at = now(), updated_by = v_su
        WHERE (master.ledger_book.name, master.ledger_book.description,
               master.ledger_book.base_currency_code, master.ledger_book.reporting_standard)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.description,
               EXCLUDED.base_currency_code, EXCLUDED.reporting_standard);

        -- Statutory book assignment (priority 10)
        SELECT id INTO v_book FROM master.ledger_book
        WHERE tenant_id = v_tid AND code = v_cc.code || '-BOOK-STAT';

        INSERT INTO master.company_code_book_assignment
            (tenant_id, company_code_id, book_id,
             effective_from, priority, status, created_by, metadata)
        VALUES
            (v_tid, v_cc.id, v_book,
             '2025-01-01', 10, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
            priority = EXCLUDED.priority,
            updated_at = now(), updated_by = v_su
        WHERE master.company_code_book_assignment.priority
           IS DISTINCT FROM EXCLUDED.priority;

        -- Group management book assignment (priority 5)
        INSERT INTO master.company_code_book_assignment
            (tenant_id, company_code_id, book_id,
             effective_from, priority, status, created_by, metadata)
        VALUES
            (v_tid, v_cc.id, v_mgmt,
             '2025-01-01', 5, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, book_id) DO UPDATE SET
            priority = EXCLUDED.priority,
            updated_at = now(), updated_by = v_su
        WHERE master.company_code_book_assignment.priority
           IS DISTINCT FROM EXCLUDED.priority;
    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Statutory book count = active companies (one per company)
    IF (SELECT count(*) FROM master.ledger_book
        WHERE tenant_id = v_tid AND category = 'statutory')
       != v_active_cos
    THEN RAISE EXCEPTION '311 FAIL: expected % statutory books, got %',
        v_active_cos,
        (SELECT count(*) FROM master.ledger_book
         WHERE tenant_id = v_tid AND category = 'statutory');
    END IF;

    -- A1b: Exactly 1 management book
    IF (SELECT count(*) FROM master.ledger_book
        WHERE tenant_id = v_tid AND category = 'management') != 1
    THEN RAISE EXCEPTION '311 FAIL: expected 1 management book'; END IF;

    -- A2: Every active company has exactly 1 statutory book assignment
    IF EXISTS (
        SELECT ba.company_code_id, count(*)
        FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE ba.tenant_id = v_tid AND lb.category = 'statutory'
        GROUP BY ba.company_code_id HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '311 FAIL: company with != 1 statutory book assignment'; END IF;

    -- A3: Every active company has the management book assignment
    IF EXISTS (
        SELECT cc.code FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM master.company_code_book_assignment ba
              WHERE ba.tenant_id = v_tid AND ba.company_code_id = cc.id
                AND ba.book_id = v_mgmt)
    ) THEN RAISE EXCEPTION '311 FAIL: company missing management book assignment'; END IF;

    -- A4: Every statutory book's currency matches its company's functional_currency
    IF EXISTS (
        SELECT lb.code, lb.base_currency_code, cc.functional_currency
        FROM master.ledger_book lb
        JOIN master.company_code_book_assignment ba
            ON ba.book_id = lb.id AND ba.tenant_id = lb.tenant_id
        JOIN master.company_code cc
            ON cc.id = ba.company_code_id AND cc.tenant_id = ba.tenant_id
        WHERE lb.tenant_id = v_tid AND lb.category = 'statutory'
          AND lb.base_currency_code != cc.functional_currency
    ) THEN RAISE EXCEPTION '311 FAIL: statutory book currency mismatch with company'; END IF;

    -- A5: Statutory + management assignments = expected
    IF (SELECT count(*) FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
        WHERE ba.tenant_id = v_tid AND lb.category IN ('statutory', 'management'))
       != v_active_cos * 2
    THEN RAISE EXCEPTION '311 FAIL: expected % statutory+management assignments, got %',
        v_active_cos * 2,
        (SELECT count(*) FROM master.company_code_book_assignment ba
         JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
         WHERE ba.tenant_id = v_tid AND lb.category IN ('statutory', 'management'));
    END IF;

    RAISE NOTICE '311: % books (% statutory + 1 management), % assignments (2 per company)',
        (SELECT count(*) FROM master.ledger_book WHERE tenant_id = v_tid),
        v_active_cos,
        (SELECT count(*) FROM master.company_code_book_assignment WHERE tenant_id = v_tid);
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/200_finance/201_company_chart_assignments.sql
-- ============================================================================
-- ATHYPER GROUP — COMPANY CODE CHART ASSIGNMENTS
-- ============================================================================
-- File:     201_company_chart_assignments.sql
-- Schema:   master.company_code_chart_assignment
-- Purpose:  35 assignment rows linking company codes to charts of account
--           (17 operating, 17 group, 1 local) per §18.2
-- Depends:  199_gl_preseed.sql (company codes), 200_chart_catalog.sql (charts)
-- Idempotent: Yes — ON CONFLICT (tenant_id, company_code_id, chart_of_account_id, assignment_type) DO UPDATE
-- Spec ref: §18.2 Company Code Chart Assignments
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '201_company_assignments';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_total    int;
    v_oper     int;
    v_grp      int;
    v_loc      int;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Build resolver maps
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_cc_map AS
    SELECT code, id FROM master.company_code WHERE tenant_id = v_tid;

    CREATE TEMP TABLE tmp_coa_map AS
    SELECT code, id FROM master.chart_of_account WHERE tenant_id = v_tid;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: Stage assignment data
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_assign (
        cc_code     text NOT NULL,
        coa_code    text NOT NULL,
        assign_type text NOT NULL,
        is_primary  boolean NOT NULL
    ) ON COMMIT DROP;

    -- C1: Operating assignments (17) — is_primary = true
    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary) VALUES
    ('ATHQ', 'COA-IFRS',   'operating', true),
    ('AMRE', 'COA-IFRS',   'operating', true),
    ('AQTU', 'COA-IFRS',   'operating', true),
    ('ASAC', 'COA-SOCPA',  'operating', true),
    ('AQTS', 'COA-IFRS',   'operating', true),
    ('AUET', 'COA-IFRS',   'operating', true),
    ('ASAH', 'COA-SOCPA',  'operating', true),
    ('AUIC', 'COA-USGAAP', 'operating', true),
    ('ASGF', 'COA-IFRS',   'operating', true),
    ('AITM', 'COA-INDAS',  'operating', true),
    ('ACFB', 'COA-IFRS',   'operating', true),
    ('ADPM', 'COA-HGB',    'operating', true),
    ('ATEM', 'COA-IFRS',   'operating', true),
    ('ASPE', 'COA-IFRS',   'operating', true),
    ('AUKA', 'COA-IFRS',   'operating', true),
    ('AJED', 'COA-JGAAP',  'operating', true),
    ('APHS', 'COA-IFRS',   'operating', true);

    -- C2: Group assignments (17) — all companies → COA-IFRS-GROUP, is_primary = false
    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary) VALUES
    ('ATHQ', 'COA-IFRS-GROUP', 'group', false),
    ('AMRE', 'COA-IFRS-GROUP', 'group', false),
    ('AQTU', 'COA-IFRS-GROUP', 'group', false),
    ('ASAC', 'COA-IFRS-GROUP', 'group', false),
    ('AQTS', 'COA-IFRS-GROUP', 'group', false),
    ('AUET', 'COA-IFRS-GROUP', 'group', false),
    ('ASAH', 'COA-IFRS-GROUP', 'group', false),
    ('AUIC', 'COA-IFRS-GROUP', 'group', false),
    ('ASGF', 'COA-IFRS-GROUP', 'group', false),
    ('AITM', 'COA-IFRS-GROUP', 'group', false),
    ('ACFB', 'COA-IFRS-GROUP', 'group', false),
    ('ADPM', 'COA-IFRS-GROUP', 'group', false),
    ('ATEM', 'COA-IFRS-GROUP', 'group', false),
    ('ASPE', 'COA-IFRS-GROUP', 'group', false),
    ('AUKA', 'COA-IFRS-GROUP', 'group', false),
    ('AJED', 'COA-IFRS-GROUP', 'group', false),
    ('APHS', 'COA-IFRS-GROUP', 'group', false);

    -- C3: Local assignment (1) — ADPM dual-reporting, is_primary = false
    INSERT INTO tmp_assign (cc_code, coa_code, assign_type, is_primary) VALUES
    ('ADPM', 'COA-IFRS', 'local', false);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT into master.company_code_chart_assignment
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.company_code_chart_assignment (
        tenant_id, company_code_id, chart_of_account_id,
        assignment_type, is_primary, effective_from,
        metadata, status, created_by
    )
    SELECT
        v_tid, cc.id, coa.id,
        a.assign_type, a.is_primary, CURRENT_DATE,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_assign a
    JOIN tmp_cc_map cc  ON cc.code  = a.cc_code
    JOIN tmp_coa_map coa ON coa.code = a.coa_code
    ON CONFLICT (tenant_id, company_code_id, chart_of_account_id, assignment_type)
    DO UPDATE SET
        is_primary     = EXCLUDED.is_primary,
        effective_from = EXCLUDED.effective_from,
        metadata       = master.company_code_chart_assignment.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.company_code_chart_assignment.is_primary,
           master.company_code_chart_assignment.effective_from)
       IS DISTINCT FROM
          (EXCLUDED.is_primary, EXCLUDED.effective_from);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE E: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_total
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_oper
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND assignment_type = 'operating';

    SELECT count(*) INTO v_grp
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND assignment_type = 'group';

    SELECT count(*) INTO v_loc
    FROM master.company_code_chart_assignment
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND assignment_type = 'local';

    IF v_total <> 35 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 35 total assignments, got %', v_total;
    END IF;

    IF v_oper <> 17 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 17 operating assignments, got %', v_oper;
    END IF;

    IF v_grp <> 17 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 17 group assignments, got %', v_grp;
    END IF;

    IF v_loc <> 1 THEN
        RAISE EXCEPTION '[201_company_assignments] Expected 1 local assignment, got %', v_loc;
    END IF;

    RAISE NOTICE '[201_company_assignments] Chart assignments seeded: % total (% operating, % group, % local)',
        v_total, v_oper, v_grp, v_loc;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/200_finance/270_refresh_mv.sql
-- ============================================================================
-- ATHYPER GROUP — REFRESH MATERIALIZED VIEW
-- ============================================================================
-- File:     270_refresh_mv.sql
-- Purpose:  Refresh mv_company_postable_account after all GL seeds complete
-- Depends:  199-250 (all GL layers)
-- Spec ref: §24 COA/GL Execution Order
-- ============================================================================
-- This MUST run after all Layer 1-4 files and company_gl_controls.
-- The MV starts WITH NO DATA — this is the first population.
-- ============================================================================

REFRESH MATERIALIZED VIEW master.mv_company_postable_account;

-- Verify the MV has data
DO $check$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count FROM master.mv_company_postable_account;
    IF v_count = 0 THEN
        RAISE WARNING '[270_refresh_mv] MV has 0 rows — check chart assignments and GL account status';
    ELSE
        RAISE NOTICE '[270_refresh_mv] MV refreshed: % postable account rows', v_count;
    END IF;
END $check$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/200_finance/280_validation_assertions.sql
-- ============================================================================
-- ATHYPER GROUP — COA/GL VALIDATION ASSERTIONS
-- ============================================================================
-- File:     280_validation_assertions.sql
-- Purpose:  Full validation suite for the COA/GL seed data
-- Depends:  270_refresh_mv.sql (MV must be populated)
-- Spec ref: §23 COA/GL Validation Suite
-- ============================================================================

DO $validate$
DECLARE
    v_tid uuid;
    v_errors text[] := '{}';
    v_count bigint;
    v_msg text;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1a  One active operating assignment per company
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT company_code_id
        FROM master.company_code_chart_assignment
        WHERE tenant_id = v_tid AND assignment_type = 'operating' AND is_active = true
        GROUP BY company_code_id HAVING count(*) != 1
    ) dups;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.1a FAIL: %s companies with !=1 operating assignment', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1b  One group assignment per company
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT company_code_id
        FROM master.company_code_chart_assignment
        WHERE tenant_id = v_tid AND assignment_type = 'group' AND is_active = true
        GROUP BY company_code_id HAVING count(*) != 1
    ) dups;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.1b FAIL: %s companies with !=1 group assignment', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1c  No orphan GL accounts (referencing non-existent chart)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.gl_account ga
    LEFT JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
    WHERE ga.tenant_id = v_tid AND coa.id IS NULL;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.1c FAIL: %s GL accounts reference non-existent chart', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.1e  No duplicate account codes within tenant
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT code FROM master.gl_account
        WHERE tenant_id = v_tid
        GROUP BY code HAVING count(*) > 1
    ) dups;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('§23.1e FAIL: %s duplicate GL account codes: %s', v_count,
                (SELECT string_agg(code, ', ') FROM (
                    SELECT code FROM master.gl_account WHERE tenant_id = v_tid
                    GROUP BY code HAVING count(*) > 1 LIMIT 10
                ) d)));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.2g  Every company has ≥50 postable accounts
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT company_code_id
        FROM master.mv_company_postable_account
        WHERE tenant_id = v_tid
        GROUP BY company_code_id HAVING count(*) < 50
    ) sparse;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors, format('§23.2g FAIL: %s companies with <50 postable accounts', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- §23.3i  Every operating posting account has a group mapping
    --         (Phase 1: check metadata._group_map)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.gl_account ga
    JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
    WHERE ga.tenant_id = v_tid
      AND ga.node_type = 'posting'
      AND ga.is_active = true
      AND coa.code != 'COA-IFRS-GROUP'   -- skip group chart itself
      AND ga.metadata->>'_group_map' IS NULL;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('§23.3i FAIL: %s posting accounts missing _group_map: %s', v_count,
                (SELECT string_agg(ga.code, ', ') FROM master.gl_account ga
                 JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
                 WHERE ga.tenant_id = v_tid AND ga.node_type = 'posting' AND ga.is_active = true
                   AND coa.code != 'COA-IFRS-GROUP' AND ga.metadata->>'_group_map' IS NULL
                 LIMIT 15)));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: Chart catalog completeness
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.chart_of_account WHERE tenant_id = v_tid AND is_active = true;
    IF v_count < 7 THEN
        v_errors := array_append(v_errors, format('CUSTOM FAIL: Expected ≥7 active charts, got %s', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: Every active chart has ≥20 GL accounts
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM (
        SELECT coa.id, coa.code
        FROM master.chart_of_account coa
        WHERE coa.tenant_id = v_tid AND coa.is_active = true
        GROUP BY coa.id, coa.code
        HAVING (SELECT count(*) FROM master.gl_account ga
                WHERE ga.chart_of_account_id = coa.id AND ga.is_active = true) BETWEEN 1 AND 19
    ) empty_charts;
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('CUSTOM FAIL: %s active charts with between 1 and 19 GL accounts (incomplete)', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: GL account normal_balance ↔ account_class correctness
    --   Debit-normal  : asset, expense, contra_liability, contra_equity, contra_revenue
    --   Credit-normal : liability, equity, revenue, contra_asset, contra_expense
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.gl_account ga
    JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
    WHERE ga.tenant_id = v_tid
      AND ga.is_active = true
      AND ga.node_type = 'posting'
      AND (
          -- Debit classes must NOT have credit normal balance
          (ga.account_class IN ('asset', 'expense', 'contra_liability', 'contra_equity', 'contra_revenue')
           AND ga.normal_balance = 'credit')
          OR
          -- Credit classes must NOT have debit normal balance
          (ga.account_class IN ('liability', 'equity', 'revenue', 'contra_asset', 'contra_expense')
           AND ga.normal_balance = 'debit')
      );
    IF v_count > 0 THEN
        v_errors := array_append(v_errors,
            format('CUSTOM FAIL: %s GL accounts have incorrect normal_balance for their account_class: %s',
                v_count,
                (SELECT string_agg(ga.code || '(' || ga.account_class || '/' || ga.normal_balance || ')', ', ')
                 FROM master.gl_account ga
                 JOIN master.chart_of_account coa ON ga.chart_of_account_id = coa.id
                 WHERE ga.tenant_id = v_tid AND ga.is_active = true AND ga.node_type = 'posting'
                   AND (
                       (ga.account_class IN ('asset', 'expense', 'contra_liability', 'contra_equity', 'contra_revenue') AND ga.normal_balance = 'credit')
                       OR (ga.account_class IN ('liability', 'equity', 'revenue', 'contra_asset', 'contra_expense') AND ga.normal_balance = 'debit')
                   )
                 LIMIT 10)));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CUSTOM: Company code completeness
    -- ══════════════════════════════════════════════════════════════════════
    SELECT count(*) INTO v_count
    FROM master.company_code WHERE tenant_id = v_tid AND status = 'active';
    IF v_count < 17 THEN
        v_errors := array_append(v_errors, format('CUSTOM FAIL: Expected ≥17 active companies, got %s', v_count));
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- REPORT
    -- ══════════════════════════════════════════════════════════════════════
    IF array_length(v_errors, 1) > 0 THEN
        RAISE EXCEPTION E'[280_validation] VALIDATION FAILED (%s errors):\n%',
            array_length(v_errors, 1),
            array_to_string(v_errors, E'\n');
    END IF;

    RAISE NOTICE '[280_validation] All COA/GL assertions passed';

END $validate$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/300_tax/320_tax_jurisdictions.sql
-- ============================================================================
-- 320_tax_jurisdictions.sql — Tax jurisdictions (13 countries + sub-jurisdictions)
-- ============================================================================
-- Tables: master.tax_jurisdiction
-- Phase 1 base: federal/country level for all 13 ATHYPER jurisdictions
--   Sub-jurisdictions only where structurally needed (India SGST, US state tax)
-- Future phases may add: DE municipal trade tax, CA provincial, IN more states
-- Depends: master.tenant
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "320_org", "version": "2.0.0"}}'::jsonb;
    v_in   uuid;  -- India parent for sub-jurisdictions
    v_us   uuid;  -- US parent for sub-jurisdictions
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- L1: Federal / country jurisdictions (13 countries)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, description, country_code,
         jurisdiction_type, level_no, parent_id,
         authority_name, registration_required, filing_frequency,
         currency_code, sort_order, status, created_by, metadata)
    VALUES
    (v_tid,'TJ-MY','Malaysia',           'Malaysian federal tax authority',      'MY','COUNTRY',1,NULL,'Lembaga Hasil Dalam Negeri (LHDN)',true, 'MONTHLY',   'MYR', 10,'active',v_su,v_meta),
    (v_tid,'TJ-QA','Qatar',              'Qatar federal — limited tax regime',   'QA','COUNTRY',1,NULL,'General Tax Authority (GTA)',       false,'ANNUAL',    'QAR', 20,'active',v_su,v_meta),
    (v_tid,'TJ-SA','Saudi Arabia',       'Saudi tax + zakat authority',          'SA','COUNTRY',1,NULL,'ZATCA',                            true, 'MONTHLY',   'SAR', 30,'active',v_su,v_meta),
    (v_tid,'TJ-AE','United Arab Emirates','UAE federal tax authority',           'AE','COUNTRY',1,NULL,'Federal Tax Authority (FTA)',       true, 'QUARTERLY', 'AED', 40,'active',v_su,v_meta),
    (v_tid,'TJ-US','United States',      'US federal tax (IRS)',                 'US','COUNTRY',1,NULL,'Internal Revenue Service (IRS)',    true, 'QUARTERLY', 'USD', 50,'active',v_su,v_meta),
    (v_tid,'TJ-SG','Singapore',          'Singapore single-tier tax',            'SG','COUNTRY',1,NULL,'IRAS',                             true, 'QUARTERLY', 'SGD', 60,'active',v_su,v_meta),
    (v_tid,'TJ-IN','India',              'India central government taxes',        'IN','COUNTRY',1,NULL,'CBIC',                             true, 'MONTHLY',   'INR', 70,'active',v_su,v_meta),
    (v_tid,'TJ-CA','Canada',             'Canada federal (CRA)',                  'CA','COUNTRY',1,NULL,'Canada Revenue Agency (CRA)',       true, 'QUARTERLY', 'CAD', 80,'active',v_su,v_meta),
    (v_tid,'TJ-DE','Germany',            'German federal tax office',             'DE','COUNTRY',1,NULL,'Bundeszentralamt für Steuern',      true, 'MONTHLY',   'EUR', 90,'active',v_su,v_meta),
    (v_tid,'TJ-TW','Taiwan',             'Taiwan Ministry of Finance',            'TW','COUNTRY',1,NULL,'National Taxation Bureau',          true, 'BIMONTHLY', 'TWD',100,'active',v_su,v_meta),
    (v_tid,'TJ-ZA','South Africa',       'South African Revenue Service',         'ZA','COUNTRY',1,NULL,'SARS',                             true, 'MONTHLY',   'ZAR',110,'active',v_su,v_meta),
    (v_tid,'TJ-GB','United Kingdom',     'HMRC',                                  'GB','COUNTRY',1,NULL,'HM Revenue & Customs (HMRC)',       true, 'QUARTERLY', 'GBP',120,'active',v_su,v_meta),
    (v_tid,'TJ-JP','Japan',              'Japan National Tax Agency',              'JP','COUNTRY',1,NULL,'National Tax Agency (NTA)',         true, 'MONTHLY',   'JPY',130,'active',v_su,v_meta),
    (v_tid,'TJ-PH','Philippines',        'Bureau of Internal Revenue',             'PH','COUNTRY',1,NULL,'Bureau of Internal Revenue (BIR)', true, 'MONTHLY',   'PHP',140,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, authority_name = EXCLUDED.authority_name,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_jurisdiction.name, master.tax_jurisdiction.authority_name)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.authority_name);

    -- ══════════════════════════════════════════════════════════════════════
    -- L2: Sub-jurisdictions (only where structurally needed)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT id INTO v_in FROM master.tax_jurisdiction
    WHERE tenant_id = v_tid AND code = 'TJ-IN';
    SELECT id INTO v_us FROM master.tax_jurisdiction
    WHERE tenant_id = v_tid AND code = 'TJ-US';

    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, description, country_code,
         state_region_code, jurisdiction_type, level_no, parent_id,
         authority_name, registration_required, filing_frequency,
         currency_code, sort_order, status, created_by, metadata)
    VALUES
    -- India states for SGST split
    (v_tid,'TJ-IN-TN','India — Tamil Nadu',  'SGST jurisdiction','IN','TN','STATE',2,v_in,'TN Commercial Tax Dept',true,'MONTHLY','INR',71,'active',v_su,v_meta),
    (v_tid,'TJ-IN-MH','India — Maharashtra', 'SGST jurisdiction','IN','MH','STATE',2,v_in,'MH GST Dept',          true,'MONTHLY','INR',72,'active',v_su,v_meta),
    -- US state for sales tax
    (v_tid,'TJ-US-CA','United States — California','California state tax','US','CA','STATE',2,v_us,'California FTB',true,'QUARTERLY','USD',51,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Exactly 14 L1 country jurisdictions
    IF (SELECT count(*) FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid AND level_no = 1) != 14
    THEN RAISE EXCEPTION '320 FAIL: expected 14 L1 country jurisdictions, got %',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid AND level_no = 1);
    END IF;

    -- A2: Every L2 jurisdiction has a valid L1 parent
    IF EXISTS (
        SELECT id FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid AND level_no = 2
          AND (parent_id IS NULL OR parent_id NOT IN (
              SELECT id FROM master.tax_jurisdiction
              WHERE tenant_id = v_tid AND level_no = 1))
    ) THEN RAISE EXCEPTION '320 FAIL: L2 jurisdiction with missing or invalid parent'; END IF;

    -- A3: No duplicate country_codes at L1
    IF EXISTS (
        SELECT country_code, count(*) FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid AND level_no = 1
        GROUP BY country_code HAVING count(*) > 1
    ) THEN RAISE EXCEPTION '320 FAIL: duplicate country_code at L1'; END IF;

    -- A4: Minimum jurisdiction count
    IF (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid) < 17
    THEN RAISE EXCEPTION '320 FAIL: expected ≥17 jurisdictions (14 L1 + 3 L2), got %',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid);
    END IF;

    RAISE NOTICE '320: % jurisdictions (14 L1 countries + 3 L2 states)',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid);
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/300_tax/321_tax_types.sql
-- ============================================================================
-- 321_tax_types.sql — Tax type catalog per jurisdiction
-- ============================================================================
-- Tables: master.tax_type
-- DDL category constraint: INDIRECT, WITHHOLDING, CUSTOMS_DUTY, SURCHARGE
-- Scope: Transactional taxes only. CIT/income tax is period-end JE, not
--        per-document tax calculation — intentionally excluded.
-- Depends: 320 (tax_jurisdictions)
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "321_org", "version": "2.0.0"}}'::jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    INSERT INTO master.tax_type
        (tenant_id, code, name, category,
         is_recoverable, is_deducted_at_source, is_included_in_price,
         sort_order, status, created_by, metadata)
    VALUES
    -- ─── MALAYSIA ────────────────────────────────────────────────────────
    (v_tid, 'MY-SST-SALES',  'MY Sales Tax (SST)',          'INDIRECT',     false, false, false, 10, 'active', v_su, v_meta),
    (v_tid, 'MY-SST-SVC',    'MY Service Tax (SST)',         'INDIRECT',     false, false, false, 11, 'active', v_su, v_meta),
    (v_tid, 'MY-WHT',        'MY Withholding Tax',           'WITHHOLDING',  false, true,  false, 12, 'active', v_su, v_meta),
    -- ─── QATAR ──────────────────────────────────────────────────────────
    (v_tid, 'QA-WHT',        'QA Withholding Tax',           'WITHHOLDING',  false, true,  false, 20, 'active', v_su, v_meta),
    -- ─── SAUDI ARABIA ───────────────────────────────────────────────────
    (v_tid, 'SA-VAT',        'SA Value Added Tax',           'INDIRECT',     true,  false, false, 30, 'active', v_su, v_meta),
    (v_tid, 'SA-WHT',        'SA Withholding Tax',           'WITHHOLDING',  false, true,  false, 31, 'active', v_su, v_meta),
    (v_tid, 'SA-ZAKAT',      'SA Zakat',                     'SURCHARGE',    false, false, false, 32, 'active', v_su, v_meta),
    -- ─── UAE ────────────────────────────────────────────────────────────
    (v_tid, 'AE-VAT',        'AE Value Added Tax',           'INDIRECT',     true,  false, false, 40, 'active', v_su, v_meta),
    -- ─── UNITED STATES ──────────────────────────────────────────────────
    (v_tid, 'US-SALES',      'US State Sales Tax',           'INDIRECT',     false, false, false, 50, 'active', v_su, v_meta),
    (v_tid, 'US-WHT',        'US Federal WHT (Chapter 3)',   'WITHHOLDING',  false, true,  false, 51, 'active', v_su, v_meta),
    -- ─── SINGAPORE ──────────────────────────────────────────────────────
    (v_tid, 'SG-GST',        'SG Goods & Services Tax',      'INDIRECT',     true,  false, false, 60, 'active', v_su, v_meta),
    (v_tid, 'SG-WHT',        'SG Withholding Tax',           'WITHHOLDING',  false, true,  false, 61, 'active', v_su, v_meta),
    -- ─── INDIA ──────────────────────────────────────────────────────────
    (v_tid, 'IN-CGST',       'IN Central GST',               'INDIRECT',     true,  false, false, 70, 'active', v_su, v_meta),
    (v_tid, 'IN-SGST',       'IN State GST',                 'INDIRECT',     true,  false, false, 71, 'active', v_su, v_meta),
    (v_tid, 'IN-IGST',       'IN Integrated GST',            'INDIRECT',     true,  false, false, 72, 'active', v_su, v_meta),
    (v_tid, 'IN-TDS',        'IN Tax Deducted at Source',    'WITHHOLDING',  false, true,  false, 73, 'active', v_su, v_meta),
    (v_tid, 'IN-TCS',        'IN Tax Collected at Source',   'WITHHOLDING',  false, true,  false, 74, 'active', v_su, v_meta),
    (v_tid, 'IN-CUSTOMS',    'IN Customs Duty',              'CUSTOMS_DUTY', false, false, false, 75, 'active', v_su, v_meta),
    (v_tid, 'IN-CESS',       'IN Compensation Cess',         'SURCHARGE',    false, false, false, 76, 'active', v_su, v_meta),
    -- ─── CANADA ─────────────────────────────────────────────────────────
    (v_tid, 'CA-GST',        'CA Goods & Services Tax',      'INDIRECT',     true,  false, false, 80, 'active', v_su, v_meta),
    (v_tid, 'CA-PST',        'CA Provincial Sales Tax',      'INDIRECT',     false, false, false, 81, 'active', v_su, v_meta),
    (v_tid, 'CA-HST',        'CA Harmonized Sales Tax',      'INDIRECT',     true,  false, false, 82, 'active', v_su, v_meta),
    (v_tid, 'CA-WHT',        'CA Withholding Tax',           'WITHHOLDING',  false, true,  false, 83, 'active', v_su, v_meta),
    -- ─── GERMANY ────────────────────────────────────────────────────────
    (v_tid, 'DE-UST',        'DE Umsatzsteuer (VAT)',        'INDIRECT',     true,  false, false, 90, 'active', v_su, v_meta),
    (v_tid, 'DE-WHT',        'DE Kapitalertragsteuer (WHT)', 'WITHHOLDING',  false, true,  false, 91, 'active', v_su, v_meta),
    (v_tid, 'DE-CUSTOMS',    'DE EU Customs Duty',           'CUSTOMS_DUTY', false, false, false, 92, 'active', v_su, v_meta),
    -- ─── TAIWAN ─────────────────────────────────────────────────────────
    (v_tid, 'TW-VAT',        'TW Business Tax (VAT)',        'INDIRECT',     true,  false, false,100, 'active', v_su, v_meta),
    (v_tid, 'TW-WHT',        'TW Withholding Tax',           'WITHHOLDING',  false, true,  false,101, 'active', v_su, v_meta),
    -- ─── SOUTH AFRICA ───────────────────────────────────────────────────
    (v_tid, 'ZA-VAT',        'ZA Value Added Tax',           'INDIRECT',     true,  false, false,110, 'active', v_su, v_meta),
    (v_tid, 'ZA-WHT',        'ZA Dividends / Interest WHT',  'WITHHOLDING',  false, true,  false,111, 'active', v_su, v_meta),
    (v_tid, 'ZA-MINING-ROY', 'ZA Mining Royalty',            'SURCHARGE',    false, false, false,112, 'active', v_su, v_meta),
    -- ─── UNITED KINGDOM ─────────────────────────────────────────────────
    (v_tid, 'GB-VAT',        'GB Value Added Tax',           'INDIRECT',     true,  false, false,120, 'active', v_su, v_meta),
    (v_tid, 'GB-WHT',        'GB Income Tax (WHT)',          'WITHHOLDING',  false, true,  false,121, 'active', v_su, v_meta),
    (v_tid, 'GB-CUSTOMS',    'GB Customs Duty',              'CUSTOMS_DUTY', false, false, false,122, 'active', v_su, v_meta),
    -- ─── JAPAN ──────────────────────────────────────────────────────────
    (v_tid, 'JP-CT',         'JP Consumption Tax',           'INDIRECT',     true,  false, false,130, 'active', v_su, v_meta),
    (v_tid, 'JP-WHT',        'JP Withholding Tax',           'WITHHOLDING',  false, true,  false,131, 'active', v_su, v_meta),
    -- ─── PHILIPPINES ────────────────────────────────────────────────────
    (v_tid, 'PH-VAT',        'PH Value Added Tax',           'INDIRECT',     true,  false, false,140, 'active', v_su, v_meta),
    (v_tid, 'PH-EWT',        'PH Expanded WHT',              'WITHHOLDING',  false, true,  false,141, 'active', v_su, v_meta),
    (v_tid, 'PH-FWT',        'PH Final WHT',                 'WITHHOLDING',  false, true,  false,142, 'active', v_su, v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, category = EXCLUDED.category,
        is_recoverable = EXCLUDED.is_recoverable,
        is_deducted_at_source = EXCLUDED.is_deducted_at_source,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_type.name, master.tax_type.category,
           master.tax_type.is_recoverable, master.tax_type.is_deducted_at_source)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.category,
           EXCLUDED.is_recoverable, EXCLUDED.is_deducted_at_source);

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Total type count
    IF (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid) < 38
    THEN RAISE EXCEPTION '321 FAIL: expected ≥38 tax types, got %',
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid);
    END IF;

    -- A2: All 4 categories represented
    IF (SELECT count(DISTINCT category) FROM master.tax_type WHERE tenant_id = v_tid) != 4
    THEN RAISE EXCEPTION '321 FAIL: expected 4 categories, got %',
        (SELECT count(DISTINCT category) FROM master.tax_type WHERE tenant_id = v_tid);
    END IF;

    -- A3: Every recoverable type is INDIRECT
    IF EXISTS (
        SELECT code FROM master.tax_type
        WHERE tenant_id = v_tid AND is_recoverable AND category != 'INDIRECT'
    ) THEN RAISE EXCEPTION '321 FAIL: recoverable non-INDIRECT type found'; END IF;

    -- A4: Every deducted-at-source type is WITHHOLDING
    IF EXISTS (
        SELECT code FROM master.tax_type
        WHERE tenant_id = v_tid AND is_deducted_at_source AND category != 'WITHHOLDING'
    ) THEN RAISE EXCEPTION '321 FAIL: deducted-at-source non-WITHHOLDING type found'; END IF;

    RAISE NOTICE '321: % tax types across 4 categories (INDIRECT: %, WHT: %, CUSTOMS: %, SURCHARGE: %)',
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'INDIRECT'),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'WITHHOLDING'),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'CUSTOMS_DUTY'),
        (SELECT count(*) FROM master.tax_type WHERE tenant_id = v_tid AND category = 'SURCHARGE');
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/300_tax/322_tax_rate_schedules.sql
-- ============================================================================
-- 322_tax_rate_schedules.sql — Tax rate schedules (effective-dated)
-- ============================================================================
-- Tables: control.tax_rate_schedule
-- Fix 1: Proper UPSERT (delete-owned-then-reinsert) — seed corrections land
-- Fix 2: Both SALE and PURCHASE schedules for recoverable indirect taxes
-- Fix 3: Strong assertions
-- ============================================================================
-- CRITICAL DDL NOTE:
-- DDL CHECK constraint trs_direction_chk allows:
--   'PURCHASE','SALE','PAYMENT','IMPORT','EXPORT','BOTH'
-- The source spec used OUTPUT/INPUT — corrected here to SALE/PURCHASE.
-- SALE  = output direction (charged to customers)
-- PURCHASE = input direction (recoverable from suppliers)
-- ============================================================================
-- Depends: 320 (jurisdictions), 321 (tax_types)
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "322_org", "version": "2.0.0"}}'::jsonb;
    v_inserted int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    CREATE TEMP TABLE tmp_tj AS SELECT code, id FROM master.tax_jurisdiction WHERE tenant_id = v_tid;
    CREATE TEMP TABLE tmp_tt AS SELECT code, id FROM master.tax_type WHERE tenant_id = v_tid;

    -- ══════════════════════════════════════════════════════════════════════
    -- Rate seed table: one row per (jurisdiction, type, direction, component)
    -- For recoverable indirect taxes: SALE + PURCHASE pairs are both required
    -- ══════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_rates (
        tj_code      text NOT NULL,
        tt_code      text NOT NULL,
        direction    text NOT NULL,       -- SALE or PURCHASE (DDL-valid values)
        component    text,
        rate         numeric(18,6) NOT NULL,
        recover_mode text NOT NULL DEFAULT 'NONE',
        recover_pct  numeric(5,2),
        reverse_mode text NOT NULL DEFAULT 'NONE',
        priority     smallint NOT NULL DEFAULT 10
    ) ON COMMIT DROP;

    INSERT INTO tmp_rates VALUES
    -- ─── MALAYSIA (SST — not recoverable, sale only) ────────────────────
    ('TJ-MY', 'MY-SST-SALES', 'SALE',     NULL,        10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-MY', 'MY-SST-SVC',   'SALE',     NULL,         6.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-MY', 'MY-WHT',       'SALE',     'standard',  10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-MY', 'MY-WHT',       'SALE',     'royalty',   10.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-MY', 'MY-WHT',       'SALE',     'interest',  15.00, 'NONE', NULL, 'NONE', 12),

    -- ─── QATAR ──────────────────────────────────────────────────────────
    ('TJ-QA', 'QA-WHT',       'SALE',     'standard',   5.00, 'NONE', NULL, 'NONE', 10),

    -- ─── SAUDI ARABIA (VAT recoverable — SALE + PURCHASE pair) ──────────
    ('TJ-SA', 'SA-VAT',       'SALE',     NULL,         15.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-SA', 'SA-VAT',       'PURCHASE', NULL,         15.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-SA', 'SA-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-SA', 'SA-WHT',       'SALE',     'standard',    5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-SA', 'SA-WHT',       'SALE',     'management', 20.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-SA', 'SA-ZAKAT',     'SALE',     NULL,          2.50, 'NONE', NULL, 'NONE', 10),

    -- ─── UAE (VAT recoverable) ──────────────────────────────────────────
    ('TJ-AE', 'AE-VAT',       'SALE',     NULL,          5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-AE', 'AE-VAT',       'PURCHASE', NULL,          5.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-AE', 'AE-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),

    -- ─── UNITED STATES (sales tax — not recoverable) ────────────────────
    ('TJ-US-CA','US-SALES',    'SALE',     NULL,          7.25, 'NONE', NULL, 'NONE', 10),
    ('TJ-US',   'US-WHT',     'SALE',     'standard',   30.00, 'NONE', NULL, 'NONE', 10),

    -- ─── SINGAPORE (GST recoverable) ────────────────────────────────────
    ('TJ-SG', 'SG-GST',       'SALE',     NULL,          9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-SG', 'SG-GST',       'PURCHASE', NULL,          9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-SG', 'SG-GST',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-SG', 'SG-WHT',       'SALE',     'standard',   15.00, 'NONE', NULL, 'NONE', 10),

    -- ─── INDIA (GST recoverable — CGST/SGST/IGST all with PURCHASE) ────
    -- Standard 18% (CGST 9% + SGST 9% intra-state, or IGST 18% inter-state)
    ('TJ-IN',    'IN-CGST',   'SALE',     'std-18',      9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-CGST',   'PURCHASE', 'std-18',      9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-IN-TN', 'IN-SGST',  'SALE',     'std-18',      9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN-TN', 'IN-SGST',  'PURCHASE', 'std-18',      9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-IN-MH', 'IN-SGST',  'SALE',     'std-18',      9.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN-MH', 'IN-SGST',  'PURCHASE', 'std-18',      9.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-IGST',   'SALE',     'std-18',     18.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-IGST',   'PURCHASE', 'std-18',     18.00, 'FULL', NULL, 'NONE', 10),
    -- Reduced 5% (CGST 2.5% + SGST 2.5%)
    ('TJ-IN',    'IN-CGST',   'SALE',     'red-5',       2.50, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN',    'IN-CGST',   'PURCHASE', 'red-5',       2.50, 'FULL', NULL, 'NONE', 11),
    ('TJ-IN-TN', 'IN-SGST',  'SALE',     'red-5',       2.50, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN-TN', 'IN-SGST',  'PURCHASE', 'red-5',       2.50, 'FULL', NULL, 'NONE', 11),
    ('TJ-IN-MH', 'IN-SGST',  'SALE',     'red-5',       2.50, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN-MH', 'IN-SGST',  'PURCHASE', 'red-5',       2.50, 'FULL', NULL, 'NONE', 11),
    -- TDS
    ('TJ-IN',    'IN-TDS',    'SALE',     'standard',   10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-IN',    'IN-TDS',    'SALE',     'rent',       10.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-IN',    'IN-TDS',    'SALE',     'professional',10.00,'NONE', NULL, 'NONE', 12),
    ('TJ-IN',    'IN-TDS',    'SALE',     'contractor',  1.00, 'NONE', NULL, 'NONE', 13),

    -- ─── CANADA (GST + HST recoverable) ────────────────────────────────
    ('TJ-CA', 'CA-GST',       'SALE',     NULL,          5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-GST',       'PURCHASE', NULL,          5.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-HST',       'SALE',     'standard',   13.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-HST',       'PURCHASE', 'standard',   13.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-CA', 'CA-WHT',       'SALE',     'standard',   25.00, 'NONE', NULL, 'NONE', 10),

    -- ─── GERMANY (USt recoverable) ──────────────────────────────────────
    ('TJ-DE', 'DE-UST',       'SALE',     'standard',   19.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-DE', 'DE-UST',       'PURCHASE', 'standard',   19.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-DE', 'DE-UST',       'SALE',     'reduced',     7.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-DE', 'DE-UST',       'PURCHASE', 'reduced',     7.00, 'FULL', NULL, 'NONE', 11),
    ('TJ-DE', 'DE-WHT',       'SALE',     'standard',   25.00, 'NONE', NULL, 'NONE', 10),

    -- ─── TAIWAN (VAT recoverable) ───────────────────────────────────────
    ('TJ-TW', 'TW-VAT',       'SALE',     NULL,          5.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-TW', 'TW-VAT',       'PURCHASE', NULL,          5.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-TW', 'TW-WHT',       'SALE',     'standard',   20.00, 'NONE', NULL, 'NONE', 10),

    -- ─── SOUTH AFRICA (VAT recoverable) ─────────────────────────────────
    ('TJ-ZA', 'ZA-VAT',       'SALE',     NULL,         15.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-ZA', 'ZA-VAT',       'PURCHASE', NULL,         15.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-ZA', 'ZA-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-ZA', 'ZA-WHT',       'SALE',     'dividends',  20.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-ZA', 'ZA-WHT',       'SALE',     'interest',   15.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-ZA', 'ZA-MINING-ROY','SALE',     'crude',       5.00, 'NONE', NULL, 'NONE', 10),

    -- ─── UNITED KINGDOM (VAT recoverable) ───────────────────────────────
    ('TJ-GB', 'GB-VAT',       'SALE',     'standard',   20.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-GB', 'GB-VAT',       'PURCHASE', 'standard',   20.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-GB', 'GB-VAT',       'SALE',     'reduced',     5.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-GB', 'GB-VAT',       'PURCHASE', 'reduced',     5.00, 'FULL', NULL, 'NONE', 11),
    ('TJ-GB', 'GB-VAT',       'SALE',     'zero',        0.00, 'NONE', NULL, 'NONE', 12),
    ('TJ-GB', 'GB-WHT',       'SALE',     'standard',   20.00, 'NONE', NULL, 'NONE', 10),

    -- ─── JAPAN (consumption recoverable) ─────────────────────────────────
    ('TJ-JP', 'JP-CT',        'SALE',     'standard',   10.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-JP', 'JP-CT',        'PURCHASE', 'standard',   10.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-JP', 'JP-CT',        'SALE',     'reduced',     8.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-JP', 'JP-CT',        'PURCHASE', 'reduced',     8.00, 'FULL', NULL, 'NONE', 11),
    ('TJ-JP', 'JP-WHT',       'SALE',     'standard',   20.42, 'NONE', NULL, 'NONE', 10),

    -- ─── PHILIPPINES (VAT recoverable) ──────────────────────────────────
    ('TJ-PH', 'PH-VAT',       'SALE',     NULL,         12.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-PH', 'PH-VAT',       'PURCHASE', NULL,         12.00, 'FULL', NULL, 'NONE', 10),
    ('TJ-PH', 'PH-EWT',       'SALE',     'goods',       1.00, 'NONE', NULL, 'NONE', 10),
    ('TJ-PH', 'PH-EWT',       'SALE',     'services',    2.00, 'NONE', NULL, 'NONE', 11),
    ('TJ-PH', 'PH-EWT',       'SALE',     'professional',10.00,'NONE', NULL, 'NONE', 12),
    ('TJ-PH', 'PH-FWT',       'SALE',     'interest',   20.00, 'NONE', NULL, 'NONE', 10);

    -- ══════════════════════════════════════════════════════════════════════
    -- SEED UPDATE STRATEGY: delete-owned-then-reinsert
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM control.tax_rate_schedule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = '322_org';

    WITH ins AS (
        INSERT INTO control.tax_rate_schedule
            (tenant_id, jurisdiction_id, tax_type_id,
             tax_direction, component_code,
             rate_kind, rate_value,
             recoverability_mode, recoverability_percent,
             reverse_charge_mode, calculation_basis,
             effective_from, priority,
             status, created_by, metadata)
        SELECT
            v_tid, tj.id, tt.id,
            r.direction, r.component,
            'PERCENT', r.rate,
            r.recover_mode, r.recover_pct,
            r.reverse_mode, 'LINE_NET',
            '2025-01-01'::date, r.priority,
            'active', v_su, v_meta
        FROM tmp_rates r
        JOIN tmp_tj tj ON tj.code = r.tj_code
        JOIN tmp_tt tt ON tt.code = r.tt_code
        RETURNING id
    )
    SELECT count(*) INTO v_inserted FROM ins;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Minimum rate count
    IF (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid) < 70
    THEN RAISE EXCEPTION '322 FAIL: expected ≥70 rate schedules, got %',
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid);
    END IF;

    -- A2: Every recoverable indirect tax type has at least 1 SALE schedule
    IF EXISTS (
        SELECT tt.code FROM master.tax_type tt
        WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_rate_schedule trs
              WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                AND trs.tax_direction = 'SALE')
    ) THEN RAISE EXCEPTION '322 FAIL: recoverable tax type with no SALE schedule: %',
        (SELECT string_agg(tt.code, ', ') FROM master.tax_type tt
         WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
           AND NOT EXISTS (
               SELECT 1 FROM control.tax_rate_schedule trs
               WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                 AND trs.tax_direction = 'SALE'));
    END IF;

    -- A3: Every recoverable indirect tax type has at least 1 PURCHASE schedule
    IF EXISTS (
        SELECT tt.code FROM master.tax_type tt
        WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_rate_schedule trs
              WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                AND trs.tax_direction = 'PURCHASE')
    ) THEN RAISE EXCEPTION '322 FAIL: recoverable tax type with no PURCHASE schedule: %',
        (SELECT string_agg(tt.code, ', ') FROM master.tax_type tt
         WHERE tt.tenant_id = v_tid AND tt.is_recoverable = true
           AND NOT EXISTS (
               SELECT 1 FROM control.tax_rate_schedule trs
               WHERE trs.tenant_id = v_tid AND trs.tax_type_id = tt.id
                 AND trs.tax_direction = 'PURCHASE'));
    END IF;

    -- A4: No schedule references a missing jurisdiction or type
    IF EXISTS (
        SELECT trs.id FROM control.tax_rate_schedule trs
        WHERE trs.tenant_id = v_tid
          AND NOT EXISTS (SELECT 1 FROM master.tax_jurisdiction tj WHERE tj.id = trs.jurisdiction_id)
    ) THEN RAISE EXCEPTION '322 FAIL: schedule references missing jurisdiction'; END IF;

    RAISE NOTICE '322: % rate schedules (% SALE, % PURCHASE)',
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid AND tax_direction = 'SALE'),
        (SELECT count(*) FROM control.tax_rate_schedule WHERE tenant_id = v_tid AND tax_direction = 'PURCHASE');
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/300_tax/323_tax_groups.sql
-- ============================================================================
-- 323_tax_groups.sql — Tax groups + components
-- ============================================================================
-- Fix 1: SALE + PURCHASE paired groups for recoverable VAT/GST countries
-- Fix 2: Zero/exempt groups explicitly flagged (metadata._seed.zero_rated)
-- Fix 3: India GST groups are state-specific (TG-IN-TN-*, TG-IN-MH-*)
-- Each country gets: sales group(s), purchase group(s), WHT group(s),
--   zero/exempt where applicable
-- Depends: 322 (tax_rate_schedules)
-- ============================================================================
-- NOTE: Component trs_key format matches 322's direction values:
--   SALE (not OUTPUT), PURCHASE (not INPUT) — per DDL trs_direction_chk
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "323_org", "version": "2.0.0"}}'::jsonb;
    v_zero jsonb;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    v_zero := '{"_seed": {"pack": "323_org", "version": "2.0.0", "zero_rated": true}}'::jsonb;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE A: Tax group headers
    -- Convention: -OUT = sales/output, -IN = purchase/input recovery
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO control.tax_group
        (tenant_id, code, name, description, is_compound, status, created_by, metadata)
    VALUES
    -- ─── MALAYSIA (SST — not recoverable, sale only) ────────────────────
    (v_tid, 'TG-MY-SST-SALES-10','MY SST Sales 10%',    'Sales tax on goods',     false,'active',v_su,v_meta),
    (v_tid, 'TG-MY-SST-SVC-6',   'MY SST Service 6%',   'Service tax',            false,'active',v_su,v_meta),
    (v_tid, 'TG-MY-EXEMPT',       'MY Exempt',            'No SST applicable',     false,'active',v_su,v_zero),
    (v_tid, 'TG-MY-WHT-10',       'MY WHT Standard 10%', 'Standard withholding',   false,'active',v_su,v_meta),

    -- ─── QATAR ──────────────────────────────────────────────────────────
    (v_tid, 'TG-QA-EXEMPT',       'QA No Tax',            'Qatar — no indirect',   false,'active',v_su,v_zero),
    (v_tid, 'TG-QA-WHT-5',        'QA WHT 5%',           'Qatar withholding',      false,'active',v_su,v_meta),

    -- ─── SAUDI ARABIA (paired sale + purchase) ──────────────────────────
    (v_tid, 'TG-SA-VAT-15-OUT',   'SA VAT 15% Output',   'Sales VAT 15%',          false,'active',v_su,v_meta),
    (v_tid, 'TG-SA-VAT-15-IN',    'SA VAT 15% Input',    'Purchase VAT 15% recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-SA-VAT-ZERO',     'SA VAT Zero-rated',   'Zero-rated exports',     false,'active',v_su,v_zero),
    (v_tid, 'TG-SA-ZAKAT',        'SA Zakat 2.5%',       'Annual zakat',           false,'active',v_su,v_meta),
    (v_tid, 'TG-SA-WHT-5',        'SA WHT Standard 5%',  'Standard WHT',           false,'active',v_su,v_meta),

    -- ─── UAE (paired) ───────────────────────────────────────────────────
    (v_tid, 'TG-AE-VAT-5-OUT',    'AE VAT 5% Output',    'Sales VAT 5%',           false,'active',v_su,v_meta),
    (v_tid, 'TG-AE-VAT-5-IN',     'AE VAT 5% Input',     'Purchase VAT 5% recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-AE-VAT-ZERO',     'AE VAT Zero-rated',   'Zero-rated',             false,'active',v_su,v_zero),

    -- ─── US ─────────────────────────────────────────────────────────────
    (v_tid, 'TG-US-CA-SALES',     'US CA Sales Tax 7.25%','California sales tax',   false,'active',v_su,v_meta),
    (v_tid, 'TG-US-WHT-30',       'US Federal WHT 30%',  'Federal WHT non-resident',false,'active',v_su,v_meta),

    -- ─── SINGAPORE (paired) ────────────────────────────────────────────
    (v_tid, 'TG-SG-GST-9-OUT',    'SG GST 9% Output',    'Sales GST 9%',           false,'active',v_su,v_meta),
    (v_tid, 'TG-SG-GST-9-IN',     'SG GST 9% Input',     'Purchase GST 9% recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-SG-GST-ZERO',     'SG GST Zero-rated',   'Zero-rated exports',     false,'active',v_su,v_zero),
    (v_tid, 'TG-SG-WHT-15',       'SG WHT 15%',          'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── INDIA (state-specific compound groups) ─────────────────────────
    -- Tamil Nadu intra-state
    (v_tid, 'TG-IN-TN-GST-18-OUT','IN TN GST 18% Output','CGST 9% + TN SGST 9% output', true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TN-GST-18-IN', 'IN TN GST 18% Input', 'CGST 9% + TN SGST 9% input',  true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TN-GST-5-OUT', 'IN TN GST 5% Output', 'CGST 2.5% + TN SGST 2.5% output',true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TN-GST-5-IN',  'IN TN GST 5% Input',  'CGST 2.5% + TN SGST 2.5% input', true,'active',v_su,v_meta),
    -- Maharashtra intra-state
    (v_tid, 'TG-IN-MH-GST-18-OUT','IN MH GST 18% Output','CGST 9% + MH SGST 9% output', true,'active',v_su,v_meta),
    (v_tid, 'TG-IN-MH-GST-18-IN', 'IN MH GST 18% Input', 'CGST 9% + MH SGST 9% input',  true,'active',v_su,v_meta),
    -- Inter-state (no SGST, single IGST)
    (v_tid, 'TG-IN-IGST-18-OUT',  'IN IGST 18% Output',  'Inter-state output',     false,'active',v_su,v_meta),
    (v_tid, 'TG-IN-IGST-18-IN',   'IN IGST 18% Input',   'Inter-state input',      false,'active',v_su,v_meta),
    (v_tid, 'TG-IN-TDS-10',       'IN TDS Standard 10%', 'TDS professional svc',   false,'active',v_su,v_meta),

    -- ─── CANADA (paired) ───────────────────────────────────────────────
    (v_tid, 'TG-CA-GST-5-OUT',    'CA GST 5% Output',    'Sales GST',              false,'active',v_su,v_meta),
    (v_tid, 'TG-CA-GST-5-IN',     'CA GST 5% Input',     'Purchase GST recovery',  false,'active',v_su,v_meta),
    (v_tid, 'TG-CA-WHT-25',       'CA WHT 25%',          'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── GERMANY (paired) ──────────────────────────────────────────────
    (v_tid, 'TG-DE-UST-19-OUT',   'DE USt 19% Output',   'Standard Vorsteuer output',false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-UST-19-IN',    'DE USt 19% Input',    'Standard Vorsteuer input', false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-UST-7-OUT',    'DE USt 7% Output',    'Reduced output',         false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-UST-7-IN',     'DE USt 7% Input',     'Reduced input',          false,'active',v_su,v_meta),
    (v_tid, 'TG-DE-WHT-25',       'DE KESt 25%',         'Capital gains WHT',      false,'active',v_su,v_meta),

    -- ─── TAIWAN (paired) ───────────────────────────────────────────────
    (v_tid, 'TG-TW-VAT-5-OUT',    'TW VAT 5% Output',    'Business tax output',    false,'active',v_su,v_meta),
    (v_tid, 'TG-TW-VAT-5-IN',     'TW VAT 5% Input',     'Business tax input',     false,'active',v_su,v_meta),
    (v_tid, 'TG-TW-WHT-20',       'TW WHT 20%',          'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── SOUTH AFRICA (paired) ──────────────────────────────────────────
    (v_tid, 'TG-ZA-VAT-15-OUT',   'ZA VAT 15% Output',   'Standard output',        false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-VAT-15-IN',    'ZA VAT 15% Input',    'Standard input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-VAT-ZERO',     'ZA VAT Zero-rated',   'Zero-rated exports/food',false,'active',v_su,v_zero),
    (v_tid, 'TG-ZA-MINING-5',     'ZA Mining Royalty 5%', 'Crude petroleum royalty', false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-WHT-DIV',      'ZA WHT Dividends 20%','Dividends tax WHT',       false,'active',v_su,v_meta),
    (v_tid, 'TG-ZA-WHT-INT',      'ZA WHT Interest 15%', 'Interest WHT',            false,'active',v_su,v_meta),

    -- ─── UK (paired) ───────────────────────────────────────────────────
    (v_tid, 'TG-GB-VAT-20-OUT',   'GB VAT 20% Output',   'Standard output',        false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-20-IN',    'GB VAT 20% Input',    'Standard input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-5-OUT',    'GB VAT 5% Output',    'Reduced output',         false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-5-IN',     'GB VAT 5% Input',     'Reduced input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-GB-VAT-ZERO',     'GB VAT Zero-rated',   'Zero-rated exports/food',false,'active',v_su,v_zero),
    (v_tid, 'TG-GB-WHT-20',       'GB Income Tax WHT 20%','Non-resident income WHT', false,'active',v_su,v_meta),

    -- ─── JAPAN (paired) ────────────────────────────────────────────────
    (v_tid, 'TG-JP-CT-10-OUT',    'JP CT 10% Output',    'Standard output',        false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-CT-10-IN',     'JP CT 10% Input',     'Standard input recovery', false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-CT-8-OUT',     'JP CT 8% Output',     'Reduced output (food)',  false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-CT-8-IN',      'JP CT 8% Input',      'Reduced input (food)',   false,'active',v_su,v_meta),
    (v_tid, 'TG-JP-WHT-20',       'JP WHT 20.42%',       'Non-resident WHT',       false,'active',v_su,v_meta),

    -- ─── PHILIPPINES (paired) ──────────────────────────────────────────
    (v_tid, 'TG-PH-VAT-12-OUT',   'PH VAT 12% Output',   'Standard output',       false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-VAT-12-IN',    'PH VAT 12% Input',    'Standard input recovery',false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-EWT-GOODS',    'PH EWT Goods 1%',     'Expanded WHT on goods', false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-EWT-SVC',      'PH EWT Services 2%',  'Expanded WHT on services',false,'active',v_su,v_meta),
    (v_tid, 'TG-PH-FWT-INT',      'PH FWT Interest 20%', 'Final WHT on interest income',false,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        is_compound = EXCLUDED.is_compound, metadata = EXCLUDED.metadata,
        updated_at = now(), updated_by = v_su
    WHERE (control.tax_group.name, control.tax_group.description,
           control.tax_group.is_compound, control.tax_group.metadata)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.is_compound, EXCLUDED.metadata);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Tax group components (group → rate_schedule)
    -- ══════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_tg AS SELECT code, id FROM control.tax_group WHERE tenant_id = v_tid;

    -- Build schedule lookup: tj_code|tt_code|direction|component → id
    CREATE TEMP TABLE tmp_trs AS
    SELECT
        tj.code || '|' || tt.code || '|' || trs.tax_direction
            || '|' || COALESCE(trs.component_code, '') AS key,
        trs.id
    FROM control.tax_rate_schedule trs
    JOIN master.tax_jurisdiction tj ON tj.id = trs.jurisdiction_id
    JOIN master.tax_type tt ON tt.id = trs.tax_type_id
    WHERE trs.tenant_id = v_tid AND trs.is_active = true;

    INSERT INTO control.tax_group_component
        (tenant_id, tax_group_id, tax_rate_schedule_id, calculation_seq,
         status, created_by, metadata)
    SELECT v_tid, tg.id, trs.id, v.seq, 'active', v_su, v_meta
    FROM (VALUES
    -- MY (sale only — SST not recoverable)
    ('TG-MY-SST-SALES-10','TJ-MY|MY-SST-SALES|SALE|',           1),
    ('TG-MY-SST-SVC-6',   'TJ-MY|MY-SST-SVC|SALE|',             1),
    ('TG-MY-WHT-10',      'TJ-MY|MY-WHT|SALE|standard',          1),
    -- QA
    ('TG-QA-WHT-5',       'TJ-QA|QA-WHT|SALE|standard',          1),
    -- SA (sale + purchase paired)
    ('TG-SA-VAT-15-OUT',  'TJ-SA|SA-VAT|SALE|',                   1),
    ('TG-SA-VAT-15-IN',   'TJ-SA|SA-VAT|PURCHASE|',               1),
    ('TG-SA-ZAKAT',        'TJ-SA|SA-ZAKAT|SALE|',                 1),
    ('TG-SA-WHT-5',       'TJ-SA|SA-WHT|SALE|standard',           1),
    -- AE
    ('TG-AE-VAT-5-OUT',   'TJ-AE|AE-VAT|SALE|',                  1),
    ('TG-AE-VAT-5-IN',    'TJ-AE|AE-VAT|PURCHASE|',              1),
    -- US
    ('TG-US-CA-SALES',    'TJ-US-CA|US-SALES|SALE|',              1),
    ('TG-US-WHT-30',      'TJ-US|US-WHT|SALE|standard',           1),
    -- SG
    ('TG-SG-GST-9-OUT',   'TJ-SG|SG-GST|SALE|',                  1),
    ('TG-SG-GST-9-IN',    'TJ-SG|SG-GST|PURCHASE|',              1),
    ('TG-SG-WHT-15',      'TJ-SG|SG-WHT|SALE|standard',          1),
    -- IN Tamil Nadu compound (CGST seq 1 + TN-SGST seq 2)
    ('TG-IN-TN-GST-18-OUT','TJ-IN|IN-CGST|SALE|std-18',          1),
    ('TG-IN-TN-GST-18-OUT','TJ-IN-TN|IN-SGST|SALE|std-18',       2),
    ('TG-IN-TN-GST-18-IN', 'TJ-IN|IN-CGST|PURCHASE|std-18',      1),
    ('TG-IN-TN-GST-18-IN', 'TJ-IN-TN|IN-SGST|PURCHASE|std-18',   2),
    ('TG-IN-TN-GST-5-OUT', 'TJ-IN|IN-CGST|SALE|red-5',           1),
    ('TG-IN-TN-GST-5-OUT', 'TJ-IN-TN|IN-SGST|SALE|red-5',        2),
    ('TG-IN-TN-GST-5-IN',  'TJ-IN|IN-CGST|PURCHASE|red-5',       1),
    ('TG-IN-TN-GST-5-IN',  'TJ-IN-TN|IN-SGST|PURCHASE|red-5',    2),
    -- IN Maharashtra compound
    ('TG-IN-MH-GST-18-OUT','TJ-IN|IN-CGST|SALE|std-18',          1),
    ('TG-IN-MH-GST-18-OUT','TJ-IN-MH|IN-SGST|SALE|std-18',       2),
    ('TG-IN-MH-GST-18-IN', 'TJ-IN|IN-CGST|PURCHASE|std-18',      1),
    ('TG-IN-MH-GST-18-IN', 'TJ-IN-MH|IN-SGST|PURCHASE|std-18',   2),
    -- IN inter-state
    ('TG-IN-IGST-18-OUT',  'TJ-IN|IN-IGST|SALE|std-18',          1),
    ('TG-IN-IGST-18-IN',   'TJ-IN|IN-IGST|PURCHASE|std-18',      1),
    ('TG-IN-TDS-10',       'TJ-IN|IN-TDS|SALE|standard',          1),
    -- CA
    ('TG-CA-GST-5-OUT',   'TJ-CA|CA-GST|SALE|',                   1),
    ('TG-CA-GST-5-IN',    'TJ-CA|CA-GST|PURCHASE|',               1),
    ('TG-CA-WHT-25',      'TJ-CA|CA-WHT|SALE|standard',           1),
    -- DE
    ('TG-DE-UST-19-OUT',  'TJ-DE|DE-UST|SALE|standard',           1),
    ('TG-DE-UST-19-IN',   'TJ-DE|DE-UST|PURCHASE|standard',       1),
    ('TG-DE-UST-7-OUT',   'TJ-DE|DE-UST|SALE|reduced',            1),
    ('TG-DE-UST-7-IN',    'TJ-DE|DE-UST|PURCHASE|reduced',        1),
    ('TG-DE-WHT-25',      'TJ-DE|DE-WHT|SALE|standard',           1),
    -- TW
    ('TG-TW-VAT-5-OUT',   'TJ-TW|TW-VAT|SALE|',                  1),
    ('TG-TW-VAT-5-IN',    'TJ-TW|TW-VAT|PURCHASE|',              1),
    ('TG-TW-WHT-20',      'TJ-TW|TW-WHT|SALE|standard',          1),
    -- ZA
    ('TG-ZA-VAT-15-OUT',  'TJ-ZA|ZA-VAT|SALE|',                  1),
    ('TG-ZA-VAT-15-IN',   'TJ-ZA|ZA-VAT|PURCHASE|',              1),
    ('TG-ZA-MINING-5',    'TJ-ZA|ZA-MINING-ROY|SALE|crude',       1),
    ('TG-ZA-WHT-DIV',     'TJ-ZA|ZA-WHT|SALE|dividends',          1),
    ('TG-ZA-WHT-INT',     'TJ-ZA|ZA-WHT|SALE|interest',           1),
    -- GB
    ('TG-GB-VAT-20-OUT',  'TJ-GB|GB-VAT|SALE|standard',           1),
    ('TG-GB-VAT-20-IN',   'TJ-GB|GB-VAT|PURCHASE|standard',       1),
    ('TG-GB-VAT-5-OUT',   'TJ-GB|GB-VAT|SALE|reduced',            1),
    ('TG-GB-VAT-5-IN',    'TJ-GB|GB-VAT|PURCHASE|reduced',        1),
    ('TG-GB-WHT-20',      'TJ-GB|GB-WHT|SALE|standard',           1),
    -- JP
    ('TG-JP-CT-10-OUT',   'TJ-JP|JP-CT|SALE|standard',            1),
    ('TG-JP-CT-10-IN',    'TJ-JP|JP-CT|PURCHASE|standard',        1),
    ('TG-JP-CT-8-OUT',    'TJ-JP|JP-CT|SALE|reduced',             1),
    ('TG-JP-CT-8-IN',     'TJ-JP|JP-CT|PURCHASE|reduced',         1),
    ('TG-JP-WHT-20',      'TJ-JP|JP-WHT|SALE|standard',           1),
    -- PH
    ('TG-PH-VAT-12-OUT',  'TJ-PH|PH-VAT|SALE|',                  1),
    ('TG-PH-VAT-12-IN',   'TJ-PH|PH-VAT|PURCHASE|',              1),
    ('TG-PH-EWT-GOODS',   'TJ-PH|PH-EWT|SALE|goods',             1),
    ('TG-PH-EWT-SVC',     'TJ-PH|PH-EWT|SALE|services',          1),
    ('TG-PH-FWT-INT',     'TJ-PH|PH-FWT|SALE|interest',          1)
    ) AS v(tg_code, trs_key, seq)
    JOIN tmp_tg tg ON tg.code = v.tg_code
    JOIN tmp_trs trs ON trs.key = v.trs_key
    ON CONFLICT (tax_group_id, tax_rate_schedule_id) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Every non-zero-rated group has at least 1 component
    IF EXISTS (
        SELECT tg.code FROM control.tax_group tg
        WHERE tg.tenant_id = v_tid
          AND NOT COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_group_component tgc
              WHERE tgc.tax_group_id = tg.id AND tgc.tenant_id = tg.tenant_id)
    ) THEN RAISE EXCEPTION '323 FAIL: non-zero group with no components: %',
        (SELECT string_agg(tg.code, ', ') FROM control.tax_group tg
         WHERE tg.tenant_id = v_tid
           AND NOT COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)
           AND NOT EXISTS (
               SELECT 1 FROM control.tax_group_component tgc
               WHERE tgc.tax_group_id = tg.id AND tgc.tenant_id = tg.tenant_id));
    END IF;

    -- A2: Every zero-rated group has NO components
    IF EXISTS (
        SELECT tg.code FROM control.tax_group tg
        WHERE tg.tenant_id = v_tid
          AND COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)
          AND EXISTS (
              SELECT 1 FROM control.tax_group_component tgc
              WHERE tgc.tax_group_id = tg.id AND tgc.tenant_id = tg.tenant_id)
    ) THEN RAISE EXCEPTION '323 FAIL: zero-rated group should have no components'; END IF;

    -- A3: No component references a missing schedule
    IF EXISTS (
        SELECT tgc.id FROM control.tax_group_component tgc
        WHERE tgc.tenant_id = v_tid
          AND NOT EXISTS (
              SELECT 1 FROM control.tax_rate_schedule trs
              WHERE trs.id = tgc.tax_rate_schedule_id AND trs.tenant_id = tgc.tenant_id)
    ) THEN RAISE EXCEPTION '323 FAIL: component references missing schedule'; END IF;

    -- A4: India compound groups have exactly 2 components each
    IF EXISTS (
        SELECT tg.code, count(tgc.id) FROM control.tax_group tg
        JOIN control.tax_group_component tgc ON tgc.tax_group_id = tg.id
        WHERE tg.tenant_id = v_tid AND tg.is_compound = true
        GROUP BY tg.code HAVING count(tgc.id) != 2
    ) THEN RAISE EXCEPTION '323 FAIL: compound group without exactly 2 components'; END IF;

    RAISE NOTICE '323: % groups (% with components, % zero-rated), % components total',
        (SELECT count(*) FROM control.tax_group WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.tax_group tg WHERE tg.tenant_id = v_tid
           AND NOT COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)),
        (SELECT count(*) FROM control.tax_group tg WHERE tg.tenant_id = v_tid
           AND COALESCE((tg.metadata->'_seed'->>'zero_rated')::boolean, false)),
        (SELECT count(*) FROM control.tax_group_component WHERE tenant_id = v_tid);
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/300_tax/330_fx_rates.sql
-- ============================================================================
-- 330_fx_rates.sql — FX rates: 13 currencies → MYR (group reporting)
-- ============================================================================
-- Tables: master.fx_rate
-- Scope: Selected key month-end PERIOD_END rates (not full monthly series)
--        FY2025: quarterly closing (Jan, Mar, Jun, Sep, Dec)
--        FY2026: Q1 closing (Jan, Feb, Mar)
--        SPOT rates for current date only
-- All rates: 1 unit of foreign currency = X MYR (approximate demo values)
-- Idempotency: delete-owned-then-reinsert (metadata._seed.pack = '330_org')
-- Depends: master.tenant, shared.currency
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "330_org", "version": "2.0.0"}}'::jsonb;
    v_inserted int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- PREREQUISITE: Verify all 13 source currencies + MYR exist
    -- ══════════════════════════════════════════════════════════════════════
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('USD'),('QAR'),('SAR'),('AED'),('SGD'),('INR'),('CAD'),
            ('EUR'),('TWD'),('ZAR'),('GBP'),('JPY'),('PHP')
        ) AS v(code)
        WHERE NOT EXISTS (SELECT 1 FROM shared.currency c WHERE c.code = v.code)
    ) THEN RAISE EXCEPTION '330 FAIL: missing currency in shared.currency: %',
        (SELECT string_agg(v.code, ', ') FROM (VALUES
            ('USD'),('QAR'),('SAR'),('AED'),('SGD'),('INR'),('CAD'),
            ('EUR'),('TWD'),('ZAR'),('GBP'),('JPY'),('PHP')
        ) AS v(code)
        WHERE NOT EXISTS (SELECT 1 FROM shared.currency c WHERE c.code = v.code));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM shared.currency WHERE code = 'MYR')
    THEN RAISE EXCEPTION '330 FAIL: MYR not in shared.currency'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- SEED UPDATE STRATEGY: delete-owned-then-reinsert
    -- fx_rate has no natural unique constraint beyond PK, so ON CONFLICT
    -- would create duplicates on rerun. Delete seed-owned rows first.
    -- ══════════════════════════════════════════════════════════════════════
    DELETE FROM master.fx_rate
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = '330_org';

    -- ══════════════════════════════════════════════════════════════════════
    -- RATES: 1 unit of foreign currency = X MYR (approximate mid-market)
    -- ══════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_fx (
        from_curr character(3) NOT NULL,
        rate      numeric(18,10) NOT NULL,
        eff_date  date NOT NULL,
        rate_type text NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_fx VALUES
    -- ─── 2025 PERIOD_END — quarterly key dates ──────────────────────────
    -- USD → MYR
    ('USD', 4.4700, '2025-01-31', 'PERIOD_END'), ('USD', 4.4500, '2025-03-31', 'PERIOD_END'),
    ('USD', 4.4300, '2025-06-30', 'PERIOD_END'), ('USD', 4.4100, '2025-09-30', 'PERIOD_END'),
    ('USD', 4.4000, '2025-12-31', 'PERIOD_END'),
    -- QAR → MYR
    ('QAR', 1.2280, '2025-01-31', 'PERIOD_END'), ('QAR', 1.2230, '2025-03-31', 'PERIOD_END'),
    ('QAR', 1.2175, '2025-06-30', 'PERIOD_END'), ('QAR', 1.2120, '2025-09-30', 'PERIOD_END'),
    ('QAR', 1.2088, '2025-12-31', 'PERIOD_END'),
    -- SAR → MYR
    ('SAR', 1.1920, '2025-01-31', 'PERIOD_END'), ('SAR', 1.1870, '2025-03-31', 'PERIOD_END'),
    ('SAR', 1.1815, '2025-06-30', 'PERIOD_END'), ('SAR', 1.1760, '2025-09-30', 'PERIOD_END'),
    ('SAR', 1.1733, '2025-12-31', 'PERIOD_END'),
    -- AED → MYR
    ('AED', 1.2170, '2025-01-31', 'PERIOD_END'), ('AED', 1.2120, '2025-03-31', 'PERIOD_END'),
    ('AED', 1.2065, '2025-06-30', 'PERIOD_END'), ('AED', 1.2010, '2025-09-30', 'PERIOD_END'),
    ('AED', 1.1981, '2025-12-31', 'PERIOD_END'),
    -- SGD → MYR
    ('SGD', 3.3200, '2025-01-31', 'PERIOD_END'), ('SGD', 3.3100, '2025-03-31', 'PERIOD_END'),
    ('SGD', 3.3000, '2025-06-30', 'PERIOD_END'), ('SGD', 3.2900, '2025-09-30', 'PERIOD_END'),
    ('SGD', 3.2800, '2025-12-31', 'PERIOD_END'),
    -- INR → MYR
    ('INR', 0.0530, '2025-01-31', 'PERIOD_END'), ('INR', 0.0528, '2025-03-31', 'PERIOD_END'),
    ('INR', 0.0526, '2025-06-30', 'PERIOD_END'), ('INR', 0.0524, '2025-09-30', 'PERIOD_END'),
    ('INR', 0.0522, '2025-12-31', 'PERIOD_END'),
    -- CAD → MYR
    ('CAD', 3.2500, '2025-01-31', 'PERIOD_END'), ('CAD', 3.2400, '2025-03-31', 'PERIOD_END'),
    ('CAD', 3.2300, '2025-06-30', 'PERIOD_END'), ('CAD', 3.2200, '2025-09-30', 'PERIOD_END'),
    ('CAD', 3.2100, '2025-12-31', 'PERIOD_END'),
    -- EUR → MYR
    ('EUR', 4.8500, '2025-01-31', 'PERIOD_END'), ('EUR', 4.8300, '2025-03-31', 'PERIOD_END'),
    ('EUR', 4.8100, '2025-06-30', 'PERIOD_END'), ('EUR', 4.7900, '2025-09-30', 'PERIOD_END'),
    ('EUR', 4.7700, '2025-12-31', 'PERIOD_END'),
    -- TWD → MYR
    ('TWD', 0.1380, '2025-01-31', 'PERIOD_END'), ('TWD', 0.1375, '2025-03-31', 'PERIOD_END'),
    ('TWD', 0.1370, '2025-06-30', 'PERIOD_END'), ('TWD', 0.1365, '2025-09-30', 'PERIOD_END'),
    ('TWD', 0.1360, '2025-12-31', 'PERIOD_END'),
    -- ZAR → MYR
    ('ZAR', 0.2450, '2025-01-31', 'PERIOD_END'), ('ZAR', 0.2440, '2025-03-31', 'PERIOD_END'),
    ('ZAR', 0.2430, '2025-06-30', 'PERIOD_END'), ('ZAR', 0.2420, '2025-09-30', 'PERIOD_END'),
    ('ZAR', 0.2410, '2025-12-31', 'PERIOD_END'),
    -- GBP → MYR
    ('GBP', 5.6200, '2025-01-31', 'PERIOD_END'), ('GBP', 5.6000, '2025-03-31', 'PERIOD_END'),
    ('GBP', 5.5800, '2025-06-30', 'PERIOD_END'), ('GBP', 5.5600, '2025-09-30', 'PERIOD_END'),
    ('GBP', 5.5400, '2025-12-31', 'PERIOD_END'),
    -- JPY → MYR (per 1 JPY)
    ('JPY', 0.0298, '2025-01-31', 'PERIOD_END'), ('JPY', 0.0296, '2025-03-31', 'PERIOD_END'),
    ('JPY', 0.0294, '2025-06-30', 'PERIOD_END'), ('JPY', 0.0292, '2025-09-30', 'PERIOD_END'),
    ('JPY', 0.0290, '2025-12-31', 'PERIOD_END'),
    -- PHP → MYR
    ('PHP', 0.0780, '2025-01-31', 'PERIOD_END'), ('PHP', 0.0778, '2025-03-31', 'PERIOD_END'),
    ('PHP', 0.0776, '2025-06-30', 'PERIOD_END'), ('PHP', 0.0774, '2025-09-30', 'PERIOD_END'),
    ('PHP', 0.0772, '2025-12-31', 'PERIOD_END'),

    -- ─── 2026 Q1 PERIOD_END ─────────────────────────────────────────────
    ('USD', 4.3800, '2026-01-31', 'PERIOD_END'), ('USD', 4.3600, '2026-02-28', 'PERIOD_END'),
    ('USD', 4.3500, '2026-03-31', 'PERIOD_END'),
    ('QAR', 1.2030, '2026-03-31', 'PERIOD_END'), ('SAR', 1.1600, '2026-03-31', 'PERIOD_END'),
    ('AED', 1.1850, '2026-03-31', 'PERIOD_END'), ('SGD', 3.2600, '2026-03-31', 'PERIOD_END'),
    ('INR', 0.0520, '2026-03-31', 'PERIOD_END'), ('CAD', 3.2000, '2026-03-31', 'PERIOD_END'),
    ('EUR', 4.7500, '2026-03-31', 'PERIOD_END'), ('TWD', 0.1355, '2026-03-31', 'PERIOD_END'),
    ('ZAR', 0.2400, '2026-03-31', 'PERIOD_END'), ('GBP', 5.5200, '2026-03-31', 'PERIOD_END'),
    ('JPY', 0.0288, '2026-03-31', 'PERIOD_END'), ('PHP', 0.0770, '2026-03-31', 'PERIOD_END'),

    -- ─── SPOT — current transaction rate (today) ────────────────────────
    ('USD', 4.3500, '2026-03-31', 'SPOT'), ('QAR', 1.2030, '2026-03-31', 'SPOT'),
    ('SAR', 1.1600, '2026-03-31', 'SPOT'), ('AED', 1.1850, '2026-03-31', 'SPOT'),
    ('SGD', 3.2600, '2026-03-31', 'SPOT'), ('INR', 0.0520, '2026-03-31', 'SPOT'),
    ('CAD', 3.2000, '2026-03-31', 'SPOT'), ('EUR', 4.7500, '2026-03-31', 'SPOT'),
    ('TWD', 0.1355, '2026-03-31', 'SPOT'), ('ZAR', 0.2400, '2026-03-31', 'SPOT'),
    ('GBP', 5.5200, '2026-03-31', 'SPOT'), ('JPY', 0.0288, '2026-03-31', 'SPOT'),
    ('PHP', 0.0770, '2026-03-31', 'SPOT');

    -- ══════════════════════════════════════════════════════════════════════
    -- INSERT (clean — no conflict possible after delete-owned)
    -- ══════════════════════════════════════════════════════════════════════
    WITH ins AS (
        INSERT INTO master.fx_rate
            (tenant_id, from_currency, to_currency, rate, rate_type,
             effective_date, source, status, created_by, metadata)
        SELECT
            v_tid, f.from_curr, 'MYR', f.rate, f.rate_type,
            f.eff_date, 'CUSTOM', 'active', v_su, v_meta
        FROM tmp_fx f
        RETURNING id
    )
    SELECT count(*) INTO v_inserted FROM ins;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: All 13 currency pairs present
    IF (SELECT count(DISTINCT from_currency) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org') != 13
    THEN RAISE EXCEPTION '330 FAIL: expected 13 source currencies, got %',
        (SELECT count(DISTINCT from_currency) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org');
    END IF;

    -- A2: No from = to currency rows
    IF EXISTS (
        SELECT id FROM master.fx_rate
        WHERE tenant_id = v_tid AND from_currency = to_currency
          AND metadata->'_seed'->>'pack' = '330_org'
    ) THEN RAISE EXCEPTION '330 FAIL: fx_rate row with from = to currency'; END IF;

    -- A3: No duplicate natural keys within seed
    IF EXISTS (
        SELECT from_currency, to_currency, rate_type, effective_date, count(*)
        FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
        GROUP BY from_currency, to_currency, rate_type, effective_date
        HAVING count(*) > 1
    ) THEN RAISE EXCEPTION '330 FAIL: duplicate FX rate natural key in seed'; END IF;

    -- A4: Exact row count (93 = 80 PERIOD_END + 13 SPOT)
    IF v_inserted != 93
    THEN RAISE EXCEPTION '330 FAIL: expected exactly 93 FX rates, inserted %', v_inserted; END IF;

    -- A5: Sub-counts by rate_type
    IF (SELECT count(*) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
          AND rate_type = 'PERIOD_END') != 80
    THEN RAISE EXCEPTION '330 FAIL: expected 80 PERIOD_END rates'; END IF;

    IF (SELECT count(*) FROM master.fx_rate
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
          AND rate_type = 'SPOT') != 13
    THEN RAISE EXCEPTION '330 FAIL: expected 13 SPOT rates'; END IF;

    RAISE NOTICE '330: % FX rates (% PERIOD_END, % SPOT) across 13 currencies → MYR',
        v_inserted,
        (SELECT count(*) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
           AND rate_type = 'PERIOD_END'),
        (SELECT count(*) FROM master.fx_rate
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '330_org'
           AND rate_type = 'SPOT');
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/400_payments/340_holiday_calendars.sql
-- ============================================================================
-- 340_holiday_calendars.sql — Holiday calendars + days for 14 ATHYPER jurisdictions
-- ============================================================================
-- Tables: master.holiday_calendar, master.holiday_calendar_day
-- Scope: 1 tenant-default calendar + 14 country-level calendars
--        Public holidays for 2025 and 2026 (5-10 per country per year)
-- Idempotency: UPSERT headers; delete-owned-then-reinsert days
-- Depends: master.tenant, shared.country
-- ============================================================================

DO $seed$
DECLARE
    v_tid   uuid;
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_pack  text := '340_org';
    v_ver   text := '2.0.0';
    v_meta  jsonb := '{"_seed": {"pack": "340_org", "version": "2.0.0"}}'::jsonb;
    v_cal_count  int;
    v_day_count  int;
    v_min_days   int;
    v_bad_wkend  int;
    r            record;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '340 FAIL: Tenant ATHYPER not found'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 1. UPSERT HOLIDAY CALENDAR HEADERS (15 total)
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_cal (
        code            text     NOT NULL,
        name            text     NOT NULL,
        country_code    character(2),
        weekend_pattern text     NOT NULL DEFAULT 'SAT_SUN',
        is_default      boolean  NOT NULL DEFAULT false,
        sort_order      smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_cal (code, name, country_code, weekend_pattern, is_default, sort_order) VALUES
        ('HC-DEFAULT', 'Default Calendar',  NULL, 'SAT_SUN', true,  0),
        ('HC-MY',      'Malaysia',          'MY', 'SAT_SUN', false, 10),
        ('HC-QA',      'Qatar',             'QA', 'FRI_SAT', false, 20),
        ('HC-SA',      'Saudi Arabia',      'SA', 'FRI_SAT', false, 30),
        ('HC-AE',      'UAE',               'AE', 'SAT_SUN', false, 40),
        ('HC-US',      'United States',     'US', 'SAT_SUN', false, 50),
        ('HC-SG',      'Singapore',         'SG', 'SAT_SUN', false, 60),
        ('HC-IN',      'India',             'IN', 'SAT_SUN', false, 70),
        ('HC-CA',      'Canada',            'CA', 'SAT_SUN', false, 80),
        ('HC-DE',      'Germany',           'DE', 'SAT_SUN', false, 90),
        ('HC-TW',      'Taiwan',            'TW', 'SAT_SUN', false, 100),
        ('HC-ZA',      'South Africa',      'ZA', 'SAT_SUN', false, 110),
        ('HC-GB',      'United Kingdom',    'GB', 'SAT_SUN', false, 120),
        ('HC-JP',      'Japan',             'JP', 'SAT_SUN', false, 130),
        ('HC-PH',      'Philippines',       'PH', 'SAT_SUN', false, 140);

    INSERT INTO master.holiday_calendar
        (tenant_id, code, name, country_code, weekend_pattern, is_default, sort_order,
         metadata, status, created_by)
    SELECT
        v_tid, t.code, t.name, t.country_code, t.weekend_pattern, t.is_default, t.sort_order,
        v_meta, 'active', v_su
    FROM tmp_cal t
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        country_code    = EXCLUDED.country_code,
        weekend_pattern = EXCLUDED.weekend_pattern,
        is_default      = EXCLUDED.is_default,
        sort_order      = EXCLUDED.sort_order,
        metadata        = EXCLUDED.metadata,
        updated_at      = now(),
        updated_by      = v_su
    WHERE (master.holiday_calendar.name, master.holiday_calendar.country_code,
           master.holiday_calendar.weekend_pattern, master.holiday_calendar.is_default,
           master.holiday_calendar.sort_order, master.holiday_calendar.metadata)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.country_code,
           EXCLUDED.weekend_pattern, EXCLUDED.is_default,
           EXCLUDED.sort_order, EXCLUDED.metadata);

    -- ══════════════════════════════════════════════════════════════════════
    -- 2. BUILD RESOLVE MAP: calendar code -> id
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_cal_map (
        code text PRIMARY KEY,
        cal_id uuid NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_cal_map (code, cal_id)
    SELECT hc.code, hc.id
    FROM master.holiday_calendar hc
    WHERE hc.tenant_id = v_tid
      AND hc.code IN (SELECT t.code FROM tmp_cal t);

    -- ══════════════════════════════════════════════════════════════════════
    -- 3. STAGE ALL HOLIDAYS IN TEMP TABLE
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_hol (
        cal_code  text    NOT NULL,
        cal_year  smallint NOT NULL,
        hol_date  date    NOT NULL,
        hol_name  text    NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_hol (cal_code, cal_year, hol_date, hol_name) VALUES

    -- ─── MALAYSIA (HC-MY) ──────────────────────────────────────────────
    -- 2025
    ('HC-MY', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-MY', 2025, '2025-01-29', 'Thaipusam'),
    ('HC-MY', 2025, '2025-02-01', 'Federal Territory Day'),
    ('HC-MY', 2025, '2025-03-30', 'Hari Raya Aidilfitri'),
    ('HC-MY', 2025, '2025-03-31', 'Hari Raya Aidilfitri (2nd Day)'),
    ('HC-MY', 2025, '2025-05-01', 'Labour Day'),
    ('HC-MY', 2025, '2025-06-06', 'Hari Raya Haji'),
    ('HC-MY', 2025, '2025-08-31', 'Merdeka Day'),
    ('HC-MY', 2025, '2025-09-16', 'Malaysia Day'),
    ('HC-MY', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-MY', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-MY', 2026, '2026-01-17', 'Thaipusam'),
    ('HC-MY', 2026, '2026-02-01', 'Federal Territory Day'),
    ('HC-MY', 2026, '2026-03-20', 'Hari Raya Aidilfitri'),
    ('HC-MY', 2026, '2026-03-21', 'Hari Raya Aidilfitri (2nd Day)'),
    ('HC-MY', 2026, '2026-05-01', 'Labour Day'),
    ('HC-MY', 2026, '2026-05-27', 'Hari Raya Haji'),
    ('HC-MY', 2026, '2026-08-31', 'Merdeka Day'),
    ('HC-MY', 2026, '2026-09-16', 'Malaysia Day'),
    ('HC-MY', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── QATAR (HC-QA) ────────────────────────────────────────────────
    -- 2025
    ('HC-QA', 2025, '2025-02-09', 'Sports Day'),
    ('HC-QA', 2025, '2025-03-30', 'Eid al-Fitr'),
    ('HC-QA', 2025, '2025-03-31', 'Eid al-Fitr (2nd Day)'),
    ('HC-QA', 2025, '2025-04-01', 'Eid al-Fitr (3rd Day)'),
    ('HC-QA', 2025, '2025-06-06', 'Eid al-Adha'),
    ('HC-QA', 2025, '2025-06-07', 'Eid al-Adha (2nd Day)'),
    ('HC-QA', 2025, '2025-06-08', 'Eid al-Adha (3rd Day)'),
    ('HC-QA', 2025, '2025-12-18', 'Qatar National Day'),
    -- 2026
    ('HC-QA', 2026, '2026-02-09', 'Sports Day'),
    ('HC-QA', 2026, '2026-03-19', 'Eid al-Fitr'),
    ('HC-QA', 2026, '2026-03-20', 'Eid al-Fitr (2nd Day)'),
    ('HC-QA', 2026, '2026-03-21', 'Eid al-Fitr (3rd Day)'),
    ('HC-QA', 2026, '2026-05-26', 'Eid al-Adha'),
    ('HC-QA', 2026, '2026-05-27', 'Eid al-Adha (2nd Day)'),
    ('HC-QA', 2026, '2026-05-28', 'Eid al-Adha (3rd Day)'),
    ('HC-QA', 2026, '2026-12-18', 'Qatar National Day'),

    -- ─── SAUDI ARABIA (HC-SA) ─────────────────────────────────────────
    -- 2025
    ('HC-SA', 2025, '2025-02-22', 'Founding Day'),
    ('HC-SA', 2025, '2025-03-30', 'Eid al-Fitr'),
    ('HC-SA', 2025, '2025-03-31', 'Eid al-Fitr (2nd Day)'),
    ('HC-SA', 2025, '2025-04-01', 'Eid al-Fitr (3rd Day)'),
    ('HC-SA', 2025, '2025-06-05', 'Eid al-Adha Eve'),
    ('HC-SA', 2025, '2025-06-06', 'Eid al-Adha'),
    ('HC-SA', 2025, '2025-06-07', 'Eid al-Adha (2nd Day)'),
    ('HC-SA', 2025, '2025-09-23', 'Saudi National Day'),
    -- 2026
    ('HC-SA', 2026, '2026-02-22', 'Founding Day'),
    ('HC-SA', 2026, '2026-03-19', 'Eid al-Fitr'),
    ('HC-SA', 2026, '2026-03-20', 'Eid al-Fitr (2nd Day)'),
    ('HC-SA', 2026, '2026-03-21', 'Eid al-Fitr (3rd Day)'),
    ('HC-SA', 2026, '2026-05-26', 'Eid al-Adha'),
    ('HC-SA', 2026, '2026-05-27', 'Eid al-Adha (2nd Day)'),
    ('HC-SA', 2026, '2026-05-28', 'Eid al-Adha (3rd Day)'),
    ('HC-SA', 2026, '2026-09-23', 'Saudi National Day'),

    -- ─── UAE (HC-AE) ──────────────────────────────────────────────────
    -- 2025
    ('HC-AE', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-AE', 2025, '2025-03-30', 'Eid al-Fitr'),
    ('HC-AE', 2025, '2025-03-31', 'Eid al-Fitr (2nd Day)'),
    ('HC-AE', 2025, '2025-04-01', 'Eid al-Fitr (3rd Day)'),
    ('HC-AE', 2025, '2025-06-05', 'Arafat Day'),
    ('HC-AE', 2025, '2025-06-06', 'Eid al-Adha'),
    ('HC-AE', 2025, '2025-06-07', 'Eid al-Adha (2nd Day)'),
    ('HC-AE', 2025, '2025-07-08', 'Al Hijra (Islamic New Year)'),
    ('HC-AE', 2025, '2025-12-02', 'National Day'),
    ('HC-AE', 2025, '2025-12-03', 'National Day (2nd Day)'),
    -- 2026
    ('HC-AE', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-AE', 2026, '2026-03-19', 'Eid al-Fitr'),
    ('HC-AE', 2026, '2026-03-20', 'Eid al-Fitr (2nd Day)'),
    ('HC-AE', 2026, '2026-03-21', 'Eid al-Fitr (3rd Day)'),
    ('HC-AE', 2026, '2026-05-26', 'Eid al-Adha'),
    ('HC-AE', 2026, '2026-05-27', 'Eid al-Adha (2nd Day)'),
    ('HC-AE', 2026, '2026-06-27', 'Al Hijra (Islamic New Year)'),
    ('HC-AE', 2026, '2026-12-02', 'National Day'),
    ('HC-AE', 2026, '2026-12-03', 'National Day (2nd Day)'),

    -- ─── UNITED STATES (HC-US) ────────────────────────────────────────
    -- 2025
    ('HC-US', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-US', 2025, '2025-01-20', 'Martin Luther King Jr. Day'),
    ('HC-US', 2025, '2025-02-17', 'Presidents'' Day'),
    ('HC-US', 2025, '2025-05-26', 'Memorial Day'),
    ('HC-US', 2025, '2025-07-04', 'Independence Day'),
    ('HC-US', 2025, '2025-09-01', 'Labor Day'),
    ('HC-US', 2025, '2025-11-27', 'Thanksgiving Day'),
    ('HC-US', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-US', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-US', 2026, '2026-01-19', 'Martin Luther King Jr. Day'),
    ('HC-US', 2026, '2026-02-16', 'Presidents'' Day'),
    ('HC-US', 2026, '2026-05-25', 'Memorial Day'),
    ('HC-US', 2026, '2026-07-04', 'Independence Day'),
    ('HC-US', 2026, '2026-09-07', 'Labor Day'),
    ('HC-US', 2026, '2026-11-26', 'Thanksgiving Day'),
    ('HC-US', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── SINGAPORE (HC-SG) ────────────────────────────────────────────
    -- 2025
    ('HC-SG', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-SG', 2025, '2025-01-29', 'Chinese New Year'),
    ('HC-SG', 2025, '2025-03-31', 'Hari Raya Puasa'),
    ('HC-SG', 2025, '2025-04-18', 'Good Friday'),
    ('HC-SG', 2025, '2025-05-01', 'Labour Day'),
    ('HC-SG', 2025, '2025-05-12', 'Vesak Day'),
    ('HC-SG', 2025, '2025-06-07', 'Hari Raya Haji'),
    ('HC-SG', 2025, '2025-08-09', 'National Day'),
    ('HC-SG', 2025, '2025-10-20', 'Deepavali'),
    ('HC-SG', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-SG', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-SG', 2026, '2026-02-17', 'Chinese New Year'),
    ('HC-SG', 2026, '2026-03-20', 'Hari Raya Puasa'),
    ('HC-SG', 2026, '2026-04-03', 'Good Friday'),
    ('HC-SG', 2026, '2026-05-01', 'Labour Day'),
    ('HC-SG', 2026, '2026-05-31', 'Vesak Day'),
    ('HC-SG', 2026, '2026-05-27', 'Hari Raya Haji'),
    ('HC-SG', 2026, '2026-08-09', 'National Day'),
    ('HC-SG', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── INDIA (HC-IN) ────────────────────────────────────────────────
    -- 2025
    ('HC-IN', 2025, '2025-01-26', 'Republic Day'),
    ('HC-IN', 2025, '2025-03-14', 'Holi'),
    ('HC-IN', 2025, '2025-03-31', 'Eid ul-Fitr'),
    ('HC-IN', 2025, '2025-04-18', 'Good Friday'),
    ('HC-IN', 2025, '2025-05-01', 'May Day'),
    ('HC-IN', 2025, '2025-06-07', 'Eid ul-Adha'),
    ('HC-IN', 2025, '2025-08-15', 'Independence Day'),
    ('HC-IN', 2025, '2025-10-02', 'Gandhi Jayanti'),
    ('HC-IN', 2025, '2025-10-20', 'Dussehra'),
    ('HC-IN', 2025, '2025-11-12', 'Diwali'),
    ('HC-IN', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-IN', 2026, '2026-01-26', 'Republic Day'),
    ('HC-IN', 2026, '2026-03-04', 'Holi'),
    ('HC-IN', 2026, '2026-03-20', 'Eid ul-Fitr'),
    ('HC-IN', 2026, '2026-04-03', 'Good Friday'),
    ('HC-IN', 2026, '2026-05-01', 'May Day'),
    ('HC-IN', 2026, '2026-05-27', 'Eid ul-Adha'),
    ('HC-IN', 2026, '2026-08-15', 'Independence Day'),
    ('HC-IN', 2026, '2026-10-02', 'Gandhi Jayanti'),
    ('HC-IN', 2026, '2026-11-01', 'Diwali'),
    ('HC-IN', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── CANADA (HC-CA) ──────────────────────────────────────────────
    -- 2025
    ('HC-CA', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-CA', 2025, '2025-02-17', 'Family Day'),
    ('HC-CA', 2025, '2025-04-18', 'Good Friday'),
    ('HC-CA', 2025, '2025-05-19', 'Victoria Day'),
    ('HC-CA', 2025, '2025-07-01', 'Canada Day'),
    ('HC-CA', 2025, '2025-09-01', 'Labour Day'),
    ('HC-CA', 2025, '2025-10-13', 'Thanksgiving Day'),
    ('HC-CA', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-CA', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-CA', 2026, '2026-02-16', 'Family Day'),
    ('HC-CA', 2026, '2026-04-03', 'Good Friday'),
    ('HC-CA', 2026, '2026-05-18', 'Victoria Day'),
    ('HC-CA', 2026, '2026-07-01', 'Canada Day'),
    ('HC-CA', 2026, '2026-09-07', 'Labour Day'),
    ('HC-CA', 2026, '2026-10-12', 'Thanksgiving Day'),
    ('HC-CA', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── GERMANY (HC-DE) ─────────────────────────────────────────────
    -- 2025
    ('HC-DE', 2025, '2025-01-01', 'Neujahr'),
    ('HC-DE', 2025, '2025-04-18', 'Karfreitag'),
    ('HC-DE', 2025, '2025-04-21', 'Ostermontag'),
    ('HC-DE', 2025, '2025-05-01', 'Tag der Arbeit'),
    ('HC-DE', 2025, '2025-05-29', 'Christi Himmelfahrt'),
    ('HC-DE', 2025, '2025-06-09', 'Pfingstmontag'),
    ('HC-DE', 2025, '2025-10-03', 'Tag der Deutschen Einheit'),
    ('HC-DE', 2025, '2025-12-25', 'Erster Weihnachtstag'),
    ('HC-DE', 2025, '2025-12-26', 'Zweiter Weihnachtstag'),
    -- 2026
    ('HC-DE', 2026, '2026-01-01', 'Neujahr'),
    ('HC-DE', 2026, '2026-04-03', 'Karfreitag'),
    ('HC-DE', 2026, '2026-04-06', 'Ostermontag'),
    ('HC-DE', 2026, '2026-05-01', 'Tag der Arbeit'),
    ('HC-DE', 2026, '2026-05-14', 'Christi Himmelfahrt'),
    ('HC-DE', 2026, '2026-05-25', 'Pfingstmontag'),
    ('HC-DE', 2026, '2026-10-03', 'Tag der Deutschen Einheit'),
    ('HC-DE', 2026, '2026-12-25', 'Erster Weihnachtstag'),
    ('HC-DE', 2026, '2026-12-26', 'Zweiter Weihnachtstag'),

    -- ─── TAIWAN (HC-TW) ──────────────────────────────────────────────
    -- 2025
    ('HC-TW', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-TW', 2025, '2025-01-28', 'Lunar New Year Eve'),
    ('HC-TW', 2025, '2025-01-29', 'Lunar New Year'),
    ('HC-TW', 2025, '2025-01-30', 'Lunar New Year (2nd Day)'),
    ('HC-TW', 2025, '2025-01-31', 'Lunar New Year (3rd Day)'),
    ('HC-TW', 2025, '2025-02-28', 'Peace Memorial Day'),
    ('HC-TW', 2025, '2025-04-04', 'Tomb Sweeping Day'),
    ('HC-TW', 2025, '2025-05-01', 'Labour Day'),
    ('HC-TW', 2025, '2025-06-02', 'Dragon Boat Festival'),
    ('HC-TW', 2025, '2025-10-06', 'Mid-Autumn Festival'),
    ('HC-TW', 2025, '2025-10-10', 'National Day'),
    -- 2026
    ('HC-TW', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-TW', 2026, '2026-02-16', 'Lunar New Year Eve'),
    ('HC-TW', 2026, '2026-02-17', 'Lunar New Year'),
    ('HC-TW', 2026, '2026-02-18', 'Lunar New Year (2nd Day)'),
    ('HC-TW', 2026, '2026-02-19', 'Lunar New Year (3rd Day)'),
    ('HC-TW', 2026, '2026-02-28', 'Peace Memorial Day'),
    ('HC-TW', 2026, '2026-04-05', 'Tomb Sweeping Day'),
    ('HC-TW', 2026, '2026-05-01', 'Labour Day'),
    ('HC-TW', 2026, '2026-06-19', 'Dragon Boat Festival'),
    ('HC-TW', 2026, '2026-09-25', 'Mid-Autumn Festival'),
    ('HC-TW', 2026, '2026-10-10', 'National Day'),

    -- ─── SOUTH AFRICA (HC-ZA) ────────────────────────────────────────
    -- 2025
    ('HC-ZA', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-ZA', 2025, '2025-03-21', 'Human Rights Day'),
    ('HC-ZA', 2025, '2025-04-18', 'Good Friday'),
    ('HC-ZA', 2025, '2025-04-21', 'Family Day'),
    ('HC-ZA', 2025, '2025-04-27', 'Freedom Day'),
    ('HC-ZA', 2025, '2025-05-01', 'Workers'' Day'),
    ('HC-ZA', 2025, '2025-06-16', 'Youth Day'),
    ('HC-ZA', 2025, '2025-08-09', 'National Women''s Day'),
    ('HC-ZA', 2025, '2025-09-24', 'Heritage Day'),
    ('HC-ZA', 2025, '2025-12-16', 'Day of Reconciliation'),
    ('HC-ZA', 2025, '2025-12-25', 'Christmas Day'),
    ('HC-ZA', 2025, '2025-12-26', 'Day of Goodwill'),
    -- 2026
    ('HC-ZA', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-ZA', 2026, '2026-03-21', 'Human Rights Day'),
    ('HC-ZA', 2026, '2026-04-03', 'Good Friday'),
    ('HC-ZA', 2026, '2026-04-06', 'Family Day'),
    ('HC-ZA', 2026, '2026-04-27', 'Freedom Day'),
    ('HC-ZA', 2026, '2026-05-01', 'Workers'' Day'),
    ('HC-ZA', 2026, '2026-06-16', 'Youth Day'),
    ('HC-ZA', 2026, '2026-08-09', 'National Women''s Day'),
    ('HC-ZA', 2026, '2026-09-24', 'Heritage Day'),
    ('HC-ZA', 2026, '2026-12-16', 'Day of Reconciliation'),
    ('HC-ZA', 2026, '2026-12-25', 'Christmas Day'),
    ('HC-ZA', 2026, '2026-12-26', 'Day of Goodwill'),

    -- ─── UNITED KINGDOM (HC-GB) ──────────────────────────────────────
    -- 2025
    ('HC-GB', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-GB', 2025, '2025-04-18', 'Good Friday'),
    ('HC-GB', 2025, '2025-04-21', 'Easter Monday'),
    ('HC-GB', 2025, '2025-05-05', 'Early May Bank Holiday'),
    ('HC-GB', 2025, '2025-05-26', 'Spring Bank Holiday'),
    ('HC-GB', 2025, '2025-08-25', 'Summer Bank Holiday'),
    ('HC-GB', 2025, '2025-12-25', 'Christmas Day'),
    ('HC-GB', 2025, '2025-12-26', 'Boxing Day'),
    -- 2026
    ('HC-GB', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-GB', 2026, '2026-04-03', 'Good Friday'),
    ('HC-GB', 2026, '2026-04-06', 'Easter Monday'),
    ('HC-GB', 2026, '2026-05-04', 'Early May Bank Holiday'),
    ('HC-GB', 2026, '2026-05-25', 'Spring Bank Holiday'),
    ('HC-GB', 2026, '2026-08-31', 'Summer Bank Holiday'),
    ('HC-GB', 2026, '2026-12-25', 'Christmas Day'),
    ('HC-GB', 2026, '2026-12-26', 'Boxing Day'),

    -- ─── JAPAN (HC-JP) ───────────────────────────────────────────────
    -- 2025
    ('HC-JP', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-JP', 2025, '2025-01-02', 'New Year Holiday (2nd)'),
    ('HC-JP', 2025, '2025-01-03', 'New Year Holiday (3rd)'),
    ('HC-JP', 2025, '2025-01-13', 'Coming of Age Day'),
    ('HC-JP', 2025, '2025-02-11', 'National Foundation Day'),
    ('HC-JP', 2025, '2025-02-23', 'Emperor''s Birthday'),
    ('HC-JP', 2025, '2025-03-20', 'Vernal Equinox Day'),
    ('HC-JP', 2025, '2025-04-29', 'Showa Day'),
    ('HC-JP', 2025, '2025-05-03', 'Constitution Memorial Day'),
    ('HC-JP', 2025, '2025-05-04', 'Greenery Day'),
    ('HC-JP', 2025, '2025-05-05', 'Children''s Day'),
    ('HC-JP', 2025, '2025-07-21', 'Marine Day'),
    ('HC-JP', 2025, '2025-08-11', 'Mountain Day'),
    ('HC-JP', 2025, '2025-09-15', 'Respect for the Aged Day'),
    ('HC-JP', 2025, '2025-09-23', 'Autumnal Equinox Day'),
    ('HC-JP', 2025, '2025-10-13', 'Sports Day'),
    ('HC-JP', 2025, '2025-11-03', 'Culture Day'),
    ('HC-JP', 2025, '2025-11-23', 'Labour Thanksgiving Day'),
    -- 2026
    ('HC-JP', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-JP', 2026, '2026-01-02', 'New Year Holiday (2nd)'),
    ('HC-JP', 2026, '2026-01-03', 'New Year Holiday (3rd)'),
    ('HC-JP', 2026, '2026-01-12', 'Coming of Age Day'),
    ('HC-JP', 2026, '2026-02-11', 'National Foundation Day'),
    ('HC-JP', 2026, '2026-02-23', 'Emperor''s Birthday'),
    ('HC-JP', 2026, '2026-03-20', 'Vernal Equinox Day'),
    ('HC-JP', 2026, '2026-04-29', 'Showa Day'),
    ('HC-JP', 2026, '2026-05-03', 'Constitution Memorial Day'),
    ('HC-JP', 2026, '2026-05-04', 'Greenery Day'),
    ('HC-JP', 2026, '2026-05-05', 'Children''s Day'),
    ('HC-JP', 2026, '2026-07-20', 'Marine Day'),
    ('HC-JP', 2026, '2026-08-11', 'Mountain Day'),
    ('HC-JP', 2026, '2026-09-21', 'Respect for the Aged Day'),
    ('HC-JP', 2026, '2026-09-23', 'Autumnal Equinox Day'),
    ('HC-JP', 2026, '2026-10-12', 'Sports Day'),
    ('HC-JP', 2026, '2026-11-03', 'Culture Day'),
    ('HC-JP', 2026, '2026-11-23', 'Labour Thanksgiving Day'),

    -- ─── PHILIPPINES (HC-PH) ─────────────────────────────────────────
    -- 2025
    ('HC-PH', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-PH', 2025, '2025-02-25', 'EDSA People Power Anniversary'),
    ('HC-PH', 2025, '2025-04-09', 'Araw ng Kagitingan'),
    ('HC-PH', 2025, '2025-04-17', 'Maundy Thursday'),
    ('HC-PH', 2025, '2025-04-18', 'Good Friday'),
    ('HC-PH', 2025, '2025-05-01', 'Labour Day'),
    ('HC-PH', 2025, '2025-06-12', 'Independence Day'),
    ('HC-PH', 2025, '2025-08-21', 'Ninoy Aquino Day'),
    ('HC-PH', 2025, '2025-08-25', 'National Heroes Day'),
    ('HC-PH', 2025, '2025-11-30', 'Bonifacio Day'),
    ('HC-PH', 2025, '2025-12-25', 'Christmas Day'),
    ('HC-PH', 2025, '2025-12-30', 'Rizal Day'),
    -- 2026
    ('HC-PH', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-PH', 2026, '2026-02-25', 'EDSA People Power Anniversary'),
    ('HC-PH', 2026, '2026-04-02', 'Maundy Thursday'),
    ('HC-PH', 2026, '2026-04-03', 'Good Friday'),
    ('HC-PH', 2026, '2026-04-09', 'Araw ng Kagitingan'),
    ('HC-PH', 2026, '2026-05-01', 'Labour Day'),
    ('HC-PH', 2026, '2026-06-12', 'Independence Day'),
    ('HC-PH', 2026, '2026-08-21', 'Ninoy Aquino Day'),
    ('HC-PH', 2026, '2026-08-31', 'National Heroes Day'),
    ('HC-PH', 2026, '2026-11-30', 'Bonifacio Day'),
    ('HC-PH', 2026, '2026-12-25', 'Christmas Day'),
    ('HC-PH', 2026, '2026-12-30', 'Rizal Day');

    -- ══════════════════════════════════════════════════════════════════════
    -- 4. DELETE SEED-OWNED HOLIDAY DAYS, THEN INSERT FRESH
    -- ══════════════════════════════════════════════════════════════════════

    DELETE FROM master.holiday_calendar_day
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO master.holiday_calendar_day
        (tenant_id, holiday_calendar_id, calendar_year, holiday_date,
         name, day_type, observance_type, is_half_day,
         metadata, created_by)
    SELECT
        v_tid,
        m.cal_id,
        h.cal_year,
        h.hol_date,
        h.hol_name,
        'HOLIDAY',
        'MANDATORY',
        false,
        v_meta,
        v_su
    FROM tmp_hol h
    JOIN tmp_cal_map m ON m.code = h.cal_code;

    -- ══════════════════════════════════════════════════════════════════════
    -- 5. ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- 5a. Exactly 15 calendars (1 default + 14 country)
    SELECT count(*) INTO v_cal_count
    FROM master.holiday_calendar
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    IF v_cal_count <> 15 THEN
        RAISE EXCEPTION '340 FAIL: expected 15 calendars, found %', v_cal_count;
    END IF;

    -- 5b. Every country calendar has >= 5 holidays per year
    FOR r IN
        SELECT hc.code, hcd.calendar_year, count(*) AS cnt
        FROM master.holiday_calendar hc
        JOIN master.holiday_calendar_day hcd ON hcd.holiday_calendar_id = hc.id
        WHERE hc.tenant_id = v_tid
          AND hc.metadata->'_seed'->>'pack' = v_pack
          AND hc.code <> 'HC-DEFAULT'
        GROUP BY hc.code, hcd.calendar_year
        HAVING count(*) < 5
    LOOP
        RAISE EXCEPTION '340 FAIL: calendar % year % has only % holidays (need >= 5)',
            r.code, r.calendar_year, r.cnt;
    END LOOP;

    -- 5c. HC-QA and HC-SA use FRI_SAT weekend pattern
    IF EXISTS (
        SELECT 1 FROM master.holiday_calendar
        WHERE tenant_id = v_tid
          AND code IN ('HC-QA', 'HC-SA')
          AND weekend_pattern <> 'FRI_SAT'
    ) THEN
        RAISE EXCEPTION '340 FAIL: HC-QA and HC-SA must use FRI_SAT weekend pattern';
    END IF;

    -- 5d. Warning: check if any holiday falls on the calendar''s own weekend
    --     (SAT_SUN = dow 0,6; FRI_SAT = dow 5,6)
    SELECT count(*) INTO v_bad_wkend
    FROM master.holiday_calendar hc
    JOIN master.holiday_calendar_day hcd ON hcd.holiday_calendar_id = hc.id
    WHERE hc.tenant_id = v_tid
      AND hc.metadata->'_seed'->>'pack' = v_pack
      AND (
          (hc.weekend_pattern = 'SAT_SUN' AND EXTRACT(DOW FROM hcd.holiday_date) IN (0, 6))
          OR
          (hc.weekend_pattern = 'FRI_SAT' AND EXTRACT(DOW FROM hcd.holiday_date) IN (5, 6))
      );

    IF v_bad_wkend > 0 THEN
        RAISE WARNING '340 WARN: % holiday(s) fall on their calendar''s weekend days (acceptable for observed holidays)',
            v_bad_wkend;
    END IF;

    -- 5e. Total holiday days sanity check
    SELECT count(*) INTO v_day_count
    FROM master.holiday_calendar_day
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    RAISE NOTICE '340 OK: % calendars, % holiday days seeded', v_cal_count, v_day_count;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/400_payments/341_payment_terms.sql
-- ============================================================================
-- 341_payment_terms.sql — Payment term catalog with clauses & discount tiers
-- ============================================================================
-- Tables: master.payment_term, master.payment_term_clause,
--         master.payment_term_discount_tier
-- Scope:  25 terms covering standard, construction, trade, government, lease,
--         subscription, and advanced scenarios (multi-tier discounts,
--         flexible clauses, compound advance+retention, partial release)
-- Depends: 000_athyper_tenant.sql (tenant must exist)
-- ============================================================================
-- DDL CONSTRAINT REMINDERS (bugs found and fixed from v1):
--   due_date_flexibility: 'FIXED' | 'FLEXIBLE' (NOT 'STRICT')
--   base_event: INVOICE_DATE|GR_DATE|SERVICE_ENTRY_DATE|DELIVERY_DATE|
--               CERTIFIED_DATE|CONTRACT_DATE (NOT 'ORDER_DATE')
--   term_category: standard|construction|government|subscription|lease|trade
--   trigger_event: on_po_approval|on_contract_signing|on_mobilization|
--                  on_first_delivery|on_invoice|on_payment|on_final_acceptance
--   release_event: practical_completion|final_acceptance|dlp_expiry|
--                  warranty_expiry|custom_milestone|gazette_notification
--   recovery_method: pro_rata|lump_sum_first|milestone_based|equal_installment
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_meta    jsonb := '{"_seed": {"pack": "341_org", "version": "2.0.0"}}'::jsonb;
    v_pt_id   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 1. PAYMENT TERM HEADERS (25 terms)
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE _pt (
        code text, name text, description text,
        applicable_to text, base_event text, due_rule_type text,
        due_days int, due_day_of_month int, grace_days int,
        due_date_flexibility text, business_day_convention text,
        month_offset int, term_category text, installment_count int,
        sort_order int
    ) ON COMMIT DROP;

    INSERT INTO _pt VALUES
    -- ─── IMMEDIATE / CASH ───────────────────────────────────────────────
    ('PT-IMMEDIATE', 'Immediate Payment',        'Due on invoice date (0 days)',
     'BOTH','INVOICE_DATE','NET_DAYS', 0, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 10),
    ('PT-COD',       'Cash on Delivery',         'Due on delivery of goods/services',
     'BOTH','DELIVERY_DATE','COD',     NULL,NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 20),
    ('PT-PREPAID',   'Prepaid / Advance Payment','Full payment before contract execution',
     'PURCHASE','CONTRACT_DATE','PREPAID',NULL,NULL,0,'FIXED',NULL,      NULL,'standard', NULL, 30),
    ('PT-CIA',       'Cash in Advance',          'Payment due before shipment',
     'PURCHASE','INVOICE_DATE','NET_DAYS', 0, NULL, 0,'FIXED',NULL,      NULL,'standard', NULL, 35),

    -- ─── STANDARD NET TERMS ─────────────────────────────────────────────
    ('PT-NET7',      'Net 7 Days',               'Payment due 7 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS', 7, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 100),
    ('PT-NET14',     'Net 14 Days',              'Payment due 14 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS',14, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 105),
    ('PT-NET30',     'Net 30 Days',              'Standard 30-day payment term',
     'BOTH','INVOICE_DATE','NET_DAYS',30, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 110),
    ('PT-NET45',     'Net 45 Days',              'Payment due 45 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS',45, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 115),
    ('PT-NET60',     'Net 60 Days',              'Payment due 60 days from invoice',
     'BOTH','INVOICE_DATE','NET_DAYS',60, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 120),
    ('PT-NET90',     'Net 90 Days',              'Extended 90-day term for key suppliers',
     'BOTH','INVOICE_DATE','NET_DAYS',90, NULL, 0,'FIXED','FOLLOWING', NULL,'standard', NULL, 130),
    ('PT-NET120',    'Net 120 Days',             'Extended term for large capital purchases',
     'PURCHASE','INVOICE_DATE','NET_DAYS',120,NULL,0,'FIXED','FOLLOWING',NULL,'standard', NULL, 140),

    -- ─── END-OF-MONTH TERMS ─────────────────────────────────────────────
    ('PT-EOM',       'End of Month',             'Due at end of invoice month',
     'BOTH','INVOICE_DATE','EOM',     NULL,NULL, 0,'FIXED','FOLLOWING', 0,  'standard', NULL, 200),
    ('PT-EOM30',     'End of Month + 30',        'Due 30 days after end of invoice month',
     'BOTH','INVOICE_DATE','EOM',      30, NULL, 0,'FIXED','FOLLOWING', 0,  'standard', NULL, 210),
    ('PT-EOM60',     'End of Month + 60',        'Due 60 days after end of invoice month',
     'BOTH','INVOICE_DATE','EOM',      60, NULL, 0,'FIXED','FOLLOWING', 0,  'standard', NULL, 220),

    -- ─── FIXED DAY TERMS ────────────────────────────────────────────────
    ('PT-FIXED15',   'Due 15th Next Month',      'Due on 15th of following month',
     'BOTH','INVOICE_DATE','FIXED_DAY',NULL,15,  0,'FIXED','FOLLOWING', 1,  'standard', NULL, 250),

    -- ─── DISCOUNT TERMS (multi-tier) ────────────────────────────────────
    ('PT-2-10-N30',  '2/10 Net 30',             'Classic: 2% discount if paid in 10 days, else net 30',
     'BOTH','INVOICE_DATE','NET_DAYS',30, NULL, 0,'FIXED','FOLLOWING', NULL,'trade',    NULL, 300),
    ('PT-3TIER-N60', '3-Tier Discount Net 60',  '3%/10d, 2%/20d, 1%/30d — else net 60',
     'BOTH','INVOICE_DATE','NET_DAYS',60, NULL, 0,'FIXED','FOLLOWING', NULL,'trade',    NULL, 310),

    -- ─── CONSTRUCTION TERMS (retention + advance) ───────────────────────
    ('PT-CONST-60',  'Construction Net 60',      'Net 60 from certified date, 10% retention → DLP release',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',60,NULL,0,'FIXED','FOLLOWING',NULL,'construction',NULL,400),
    ('PT-CONST-ADV', 'Construction Advance + Retention','15% mobilization advance + 5% retention, both clauses',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',45,NULL,0,'FIXED','FOLLOWING',NULL,'construction',NULL,410),
    ('PT-CONST-GOV', 'Construction Government', 'Net 60 from certified, 10% retention, partial 50% at practical completion',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',60,NULL,7,'FIXED','FOLLOWING',NULL,'construction',NULL,420),
    ('PT-CONST-2TR','Construction 2-Tranche Retention',
     'Net 45 from certified, 10% retention: 50% released at PC, 50% released 1yr after PC due 1st of month',
     'PURCHASE','CERTIFIED_DATE','NET_DAYS',45,NULL,0,'FIXED','FOLLOWING',NULL,'construction',NULL,430),

    -- ─── PAYMENT ON START OF MONTH ──────────────────────────────────────
    ('PT-SOM',       'Start of Month',           'Due on 1st of current month (prepay-style for recurring services)',
     'BOTH','INVOICE_DATE','FIXED_DAY',NULL, 1,  0,'FIXED','PRECEDING', 0,  'standard',    NULL, 155),

    -- ─── MANUFACTURING ADVANCE TERMS ────────────────────────────────────
    ('PT-MFG-ADV',   'Manufacturing 20% Advance','Net 30, 20% advance on PO approval, pro-rata recovery',
     'PURCHASE','INVOICE_DATE','NET_DAYS',30,NULL, 0,'FIXED','FOLLOWING',NULL,'standard',  NULL,500),
    ('PT-MFG-ADV-FLEX','Manufacturing Flexible Advance','Net 30, 10-30% flexible advance, milestone recovery',
     'PURCHASE','INVOICE_DATE','NET_DAYS',30,NULL, 0,'FLEXIBLE','FOLLOWING',NULL,'standard',NULL,510),

    -- ─── GOVERNMENT TERMS ───────────────────────────────────────────────
    ('PT-GOV-60',    'Government Net 60',        'Net 60 from certified date with 7-day grace',
     'BOTH','CERTIFIED_DATE','NET_DAYS',60,NULL, 7,'FIXED','FOLLOWING', NULL,'government', NULL,600),
    ('PT-GOV-90',    'Government Net 90',        'Extended government term with 14-day grace',
     'BOTH','CERTIFIED_DATE','NET_DAYS',90,NULL,14,'FIXED','FOLLOWING', NULL,'government', NULL,610),

    -- ─── LEASE TERMS ────────────────────────────────────────────────────
    ('PT-LEASE-MTH', 'Monthly Lease',            'Due 1st of each month, starting next month',
     'BOTH','INVOICE_DATE','FIXED_DAY',NULL, 1,  0,'FIXED','FOLLOWING', 1,  'lease',      NULL,700),

    -- ─── SUBSCRIPTION TERMS ─────────────────────────────────────────────
    ('PT-SUB-ANNUAL','Annual Subscription',      'Due on invoice date, single payment, NET 0',
     'SALE','INVOICE_DATE','NET_DAYS',  0, NULL, 0,'FIXED',NULL,        NULL,'subscription',1,  800);


    -- UPSERT into master.payment_term
    INSERT INTO master.payment_term
        (tenant_id, code, name, description,
         applicable_to, base_event, due_rule_type,
         due_days, due_day_of_month, grace_days,
         due_date_flexibility, business_day_convention, holiday_calendar_id,
         month_offset, term_category, installment_count,
         version, is_current_version, effective_from,
         sort_order, metadata, status, created_by)
    SELECT
        v_tid, s.code, s.name, s.description,
        s.applicable_to, s.base_event, s.due_rule_type,
        s.due_days, s.due_day_of_month, s.grace_days,
        s.due_date_flexibility, s.business_day_convention, NULL,
        COALESCE(s.month_offset, 0), s.term_category, s.installment_count,
        1, true, '2025-01-01'::date,
        s.sort_order, v_meta, 'active', v_su
    FROM _pt s
    ON CONFLICT ON CONSTRAINT pt_tenant_code_ver_uq DO UPDATE SET
        name                    = EXCLUDED.name,
        description             = EXCLUDED.description,
        applicable_to           = EXCLUDED.applicable_to,
        base_event              = EXCLUDED.base_event,
        due_rule_type           = EXCLUDED.due_rule_type,
        due_days                = EXCLUDED.due_days,
        due_day_of_month        = EXCLUDED.due_day_of_month,
        grace_days              = EXCLUDED.grace_days,
        due_date_flexibility    = EXCLUDED.due_date_flexibility,
        business_day_convention = EXCLUDED.business_day_convention,
        month_offset            = EXCLUDED.month_offset,
        term_category           = EXCLUDED.term_category,
        installment_count       = EXCLUDED.installment_count,
        sort_order              = EXCLUDED.sort_order,
        metadata                = EXCLUDED.metadata,
        updated_at              = now(),
        updated_by              = v_su
    WHERE (master.payment_term.name, master.payment_term.description,
           master.payment_term.applicable_to, master.payment_term.base_event,
           master.payment_term.due_rule_type, master.payment_term.due_days,
           master.payment_term.due_day_of_month, master.payment_term.grace_days,
           master.payment_term.due_date_flexibility, master.payment_term.business_day_convention,
           master.payment_term.month_offset, master.payment_term.term_category,
           master.payment_term.installment_count, master.payment_term.sort_order,
           master.payment_term.metadata)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.applicable_to, EXCLUDED.base_event,
           EXCLUDED.due_rule_type, EXCLUDED.due_days,
           EXCLUDED.due_day_of_month, EXCLUDED.grace_days,
           EXCLUDED.due_date_flexibility, EXCLUDED.business_day_convention,
           EXCLUDED.month_offset, EXCLUDED.term_category,
           EXCLUDED.installment_count, EXCLUDED.sort_order,
           EXCLUDED.metadata);


    -- ══════════════════════════════════════════════════════════════════════
    -- 2. CLAUSES — Phase A: ADVANCE and RETENTION (no settles reference)
    -- ══════════════════════════════════════════════════════════════════════

    -- ── PT-CONST-60: 10% retention ──────────────────────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-60' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-10', 'RETENTION', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 10.00, 'FIXED',
         'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        default_pct = EXCLUDED.default_pct, updated_at = now(), updated_by = v_su
    WHERE master.payment_term_clause.default_pct IS DISTINCT FROM EXCLUDED.default_pct;

    -- ── PT-CONST-ADV: 15% mobilization advance + 5% retention ──────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES
    (v_tid, v_pt_id, 'ADV-15', 'ADVANCE', 1,
     NULL, 'HEADER', 'GROSS', 'PERCENT', 15.00, 'FIXED',
     'on_mobilization', v_meta, true, v_su),
    (v_tid, v_pt_id, 'RET-5', 'RETENTION', 2,
     NULL, 'HEADER', 'GROSS', 'PERCENT', 5.00, 'FIXED',
     'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        default_pct = EXCLUDED.default_pct, updated_at = now(), updated_by = v_su
    WHERE master.payment_term_clause.default_pct IS DISTINCT FROM EXCLUDED.default_pct;

    -- ── PT-CONST-GOV: 10% retention with 50% partial release ───────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-GOV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-10-GOV', 'RETENTION', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 10.00, 'FIXED',
         'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        default_pct = EXCLUDED.default_pct, updated_at = now(), updated_by = v_su
    WHERE master.payment_term_clause.default_pct IS DISTINCT FROM EXCLUDED.default_pct;

    -- ── PT-CONST-2TR: 10% retention ────────────────────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-2TR' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-10-2TR', 'RETENTION', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 10.00, 'FIXED',
         'on_invoice', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        default_pct = EXCLUDED.default_pct, updated_at = now(), updated_by = v_su
    WHERE master.payment_term_clause.default_pct IS DISTINCT FROM EXCLUDED.default_pct;

    -- ── PT-MFG-ADV: 20% advance ────────────────────────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-20', 'ADVANCE', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 20.00, 'FIXED',
         'on_po_approval', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        default_pct = EXCLUDED.default_pct, updated_at = now(), updated_by = v_su
    WHERE master.payment_term_clause.default_pct IS DISTINCT FROM EXCLUDED.default_pct;

    -- ── PT-MFG-ADV-FLEX: 10-30% flexible advance ───────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV-FLEX' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         min_pct, max_pct,
         trigger_event, metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-FLEX', 'ADVANCE', 1,
         NULL, 'HEADER', 'GROSS', 'PERCENT', 20.00, 'FLEXIBLE',
         10.00, 30.00,
         'on_po_approval', v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        default_pct = EXCLUDED.default_pct,
        min_pct = EXCLUDED.min_pct, max_pct = EXCLUDED.max_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.default_pct,
           master.payment_term_clause.min_pct, master.payment_term_clause.max_pct)
       IS DISTINCT FROM
          (EXCLUDED.default_pct, EXCLUDED.min_pct, EXCLUDED.max_pct);


    -- ══════════════════════════════════════════════════════════════════════
    -- 3. CLAUSES — Phase B: RECOVERY and RELEASE (settles references)
    -- ══════════════════════════════════════════════════════════════════════

    -- ── PT-CONST-60: retention release at DLP expiry (180 days) ─────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-60' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE', 'RETENTION_RELEASE', 2,
         'RET-10', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'dlp_expiry', 180,
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code,
           EXCLUDED.release_event,
           EXCLUDED.release_delay_days);

    -- ── PT-CONST-ADV: advance recovery (pro-rata) + retention release ───
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         recovery_method,
         recovery_start_after_pct, recovery_end_before_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-RECOVER', 'ADVANCE_RECOVERY', 3,
         'ADV-15', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'pro_rata',
         10.00, 90.00,  -- recover between 10% and 90% completion
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        recovery_method = EXCLUDED.recovery_method,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.recovery_method)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.recovery_method);

    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE-ADV', 'RETENTION_RELEASE', 4,
         'RET-5', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'warranty_expiry', 365,  -- 1 year warranty period
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code,
           EXCLUDED.release_event,
           EXCLUDED.release_delay_days);

    -- ── PT-CONST-GOV: Two-tranche retention release ───────────────────
    -- Tranche A: 50% of retention released at practical completion (immediate)
    -- Tranche B: 50% of retention released 1 year after practical completion,
    --            due on 1st of the following month
    -- Both settle the same RET-10-GOV retention clause.
    -- The engine sums released amounts across tranches — total cannot exceed
    -- the original retained amount (enforced by cumulative_cap_pct = 50 each).
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-GOV' AND version = 1;

    -- Tranche A: 50% at practical completion
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE-50A', 'RETENTION_RELEASE', 2,
         'RET-10-GOV', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 0,   -- immediate release at PC
         50.00,                       -- cap: cannot exceed 50% of retained amount
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct);

    -- Tranche B: 50% at 1 year after practical completion, 1st of month
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-RELEASE-50B', 'RETENTION_RELEASE', 3,
         'RET-10-GOV', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 365, -- 1 year after practical completion
         100.00,                      -- cumulative cap: full retention now released
         jsonb_build_object(
             '_seed', jsonb_build_object(
                 'pack', '341_org', 'version', '2.0.0', 'seeded_at', now()::text,
                 'due_day_rule', 'first_of_following_month'
                 -- Engine resolves: release_date + 365 days → round to 1st of next month
                 -- e.g. PC = 2026-03-15 → +365 = 2027-03-15 → due 2027-04-01
             )
         ),
         true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        metadata = EXCLUDED.metadata,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct,
           master.payment_term_clause.metadata)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct, EXCLUDED.metadata);

    -- ── PT-CONST-2TR: Two-tranche retention release ────────────────────
    -- Tranche A: 50% of retention released at practical completion
    -- Tranche B: 50% released 1 year after PC, due 1st of following month
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-2TR' AND version = 1;

    -- Tranche A: 50% at practical completion (immediate)
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-REL-PC', 'RETENTION_RELEASE', 2,
         'RET-10-2TR', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 0,
         50.00,
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct);

    -- Tranche B: 50% at 1 year after PC, due 1st of following month
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         release_event, release_delay_days,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'RET-REL-1YR', 'RETENTION_RELEASE', 3,
         'RET-10-2TR', 'HEADER', 'GROSS', 'PERCENT', 50.00, 'FIXED',
         'practical_completion', 365,
         100.00,
         jsonb_build_object(
             '_seed', jsonb_build_object(
                 'pack', '341_org', 'version', '2.0.0', 'seeded_at', now()::text,
                 'due_day_rule', 'first_of_following_month'
                 -- Engine: PC date + 365 days → round to 1st of next month
                 -- e.g. PC = 2026-06-20 → +365 = 2027-06-20 → due 2027-07-01
             )
         ),
         true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        default_pct = EXCLUDED.default_pct,
        release_event = EXCLUDED.release_event,
        release_delay_days = EXCLUDED.release_delay_days,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        metadata = EXCLUDED.metadata,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.default_pct,
           master.payment_term_clause.release_event,
           master.payment_term_clause.release_delay_days,
           master.payment_term_clause.cumulative_cap_pct,
           master.payment_term_clause.metadata)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.default_pct,
           EXCLUDED.release_event, EXCLUDED.release_delay_days,
           EXCLUDED.cumulative_cap_pct, EXCLUDED.metadata);

    -- ── PT-MFG-ADV: advance recovery (pro-rata from each invoice) ───────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         recovery_method,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-RECOVER', 'ADVANCE_RECOVERY', 2,
         'ADV-20', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'pro_rata',
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        recovery_method = EXCLUDED.recovery_method,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.recovery_method)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.recovery_method);

    -- ── PT-MFG-ADV-FLEX: milestone-based recovery ──────────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV-FLEX' AND version = 1;
    INSERT INTO master.payment_term_clause
        (tenant_id, payment_term_id, clause_code, clause_type, sequence_no,
         settles_clause_code, application_scope, basis_amount_mode,
         calc_mode, default_pct, flexibility_mode,
         recovery_method,
         cumulative_cap_pct,
         metadata, is_active, created_by)
    VALUES (v_tid, v_pt_id, 'ADV-RECOVER-FLEX', 'ADVANCE_RECOVERY', 2,
         'ADV-FLEX', 'HEADER', 'GROSS', 'PERCENT', 100.00, 'FIXED',
         'milestone_based',
         100.00,  -- cap at 100% of advance
         v_meta, true, v_su)
    ON CONFLICT (tenant_id, payment_term_id, clause_code) DO UPDATE SET
        settles_clause_code = EXCLUDED.settles_clause_code,
        recovery_method = EXCLUDED.recovery_method,
        cumulative_cap_pct = EXCLUDED.cumulative_cap_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_clause.settles_clause_code,
           master.payment_term_clause.recovery_method,
           master.payment_term_clause.cumulative_cap_pct)
       IS DISTINCT FROM
          (EXCLUDED.settles_clause_code, EXCLUDED.recovery_method,
           EXCLUDED.cumulative_cap_pct);


    -- ══════════════════════════════════════════════════════════════════════
    -- 4. DISCOUNT TIERS
    -- ══════════════════════════════════════════════════════════════════════

    -- ── PT-2-10-N30: single tier — 2% within 10 days ───────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-2-10-N30' AND version = 1;
    INSERT INTO master.payment_term_discount_tier
        (tenant_id, payment_term_id, tier_no, qualify_within_days,
         discount_pct, discount_fixed, discount_basis_mode, is_best_only,
         metadata, created_by)
    VALUES (v_tid, v_pt_id, 1, 10, 2.00, NULL, 'GROSS', true, v_meta, v_su)
    ON CONFLICT (payment_term_id, tier_no) DO UPDATE SET
        qualify_within_days = EXCLUDED.qualify_within_days,
        discount_pct = EXCLUDED.discount_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_discount_tier.qualify_within_days,
           master.payment_term_discount_tier.discount_pct)
       IS DISTINCT FROM
          (EXCLUDED.qualify_within_days, EXCLUDED.discount_pct);

    -- ── PT-3TIER-N60: 3 tiers — 3%/10d, 2%/20d, 1%/30d ────────────────
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-3TIER-N60' AND version = 1;
    INSERT INTO master.payment_term_discount_tier
        (tenant_id, payment_term_id, tier_no, qualify_within_days,
         discount_pct, discount_fixed, discount_basis_mode, is_best_only,
         metadata, created_by)
    VALUES
    (v_tid, v_pt_id, 1, 10, 3.00, NULL, 'GROSS', true, v_meta, v_su),
    (v_tid, v_pt_id, 2, 20, 2.00, NULL, 'GROSS', true, v_meta, v_su),
    (v_tid, v_pt_id, 3, 30, 1.00, NULL, 'GROSS', true, v_meta, v_su)
    ON CONFLICT (payment_term_id, tier_no) DO UPDATE SET
        qualify_within_days = EXCLUDED.qualify_within_days,
        discount_pct = EXCLUDED.discount_pct,
        updated_at = now(), updated_by = v_su
    WHERE (master.payment_term_discount_tier.qualify_within_days,
           master.payment_term_discount_tier.discount_pct)
       IS DISTINCT FROM
          (EXCLUDED.qualify_within_days, EXCLUDED.discount_pct);


    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Total payment terms >= 28
    IF (SELECT count(*) FROM master.payment_term
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org') < 28
    THEN RAISE EXCEPTION '341 FAIL: expected >= 25 payment terms, got %',
        (SELECT count(*) FROM master.payment_term
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org');
    END IF;

    -- A2: All seeded terms are version 1, current, active
    IF EXISTS (
        SELECT code FROM master.payment_term
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org'
          AND (version != 1 OR is_current_version != true OR status != 'active')
    ) THEN RAISE EXCEPTION '341 FAIL: seeded term not v1/current/active'; END IF;

    -- A3: PT-CONST-60 has exactly 2 clauses (RETENTION + RETENTION_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-60' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 2
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-60 expected 2 clauses'; END IF;

    -- A4: PT-CONST-ADV has 4 clauses (ADV + RET + ADV_RECOVER + RET_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-ADV' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 4
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-ADV expected 4 clauses, got %',
        (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id);
    END IF;

    -- A5: PT-CONST-GOV has 3 clauses (RETENTION + 2 tranche RETENTION_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-GOV' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 3
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-GOV expected 3 clauses, got %',
        (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id);
    END IF;

    -- A5b: PT-CONST-2TR has 3 clauses (RETENTION + 2 tranche RETENTION_RELEASE)
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-CONST-2TR' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 3
    THEN RAISE EXCEPTION '341 FAIL: PT-CONST-2TR expected 3 clauses, got %',
        (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id);
    END IF;

    -- A6: PT-MFG-ADV has 2 clauses, PT-MFG-ADV-FLEX has 2 clauses
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 2
    THEN RAISE EXCEPTION '341 FAIL: PT-MFG-ADV expected 2 clauses'; END IF;

    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-MFG-ADV-FLEX' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_clause WHERE payment_term_id = v_pt_id) != 2
    THEN RAISE EXCEPTION '341 FAIL: PT-MFG-ADV-FLEX expected 2 clauses'; END IF;

    -- A7: PT-2-10-N30 has 1 tier, PT-3TIER-N60 has 3 tiers
    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-2-10-N30' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_discount_tier WHERE payment_term_id = v_pt_id) != 1
    THEN RAISE EXCEPTION '341 FAIL: PT-2-10-N30 expected 1 tier'; END IF;

    SELECT id INTO v_pt_id FROM master.payment_term WHERE tenant_id = v_tid AND code = 'PT-3TIER-N60' AND version = 1;
    IF (SELECT count(*) FROM master.payment_term_discount_tier WHERE payment_term_id = v_pt_id) != 3
    THEN RAISE EXCEPTION '341 FAIL: PT-3TIER-N60 expected 3 tiers'; END IF;

    -- A8: Every ADVANCE_RECOVERY settles an ADVANCE, every RETENTION_RELEASE settles a RETENTION
    IF EXISTS (
        SELECT c.clause_code FROM master.payment_term_clause c
        JOIN master.payment_term_clause s
          ON s.payment_term_id = c.payment_term_id AND s.clause_code = c.settles_clause_code
        JOIN master.payment_term p ON p.id = c.payment_term_id
        WHERE p.tenant_id = v_tid
          AND c.clause_type = 'ADVANCE_RECOVERY' AND s.clause_type != 'ADVANCE'
    ) THEN RAISE EXCEPTION '341 FAIL: ADVANCE_RECOVERY settles non-ADVANCE'; END IF;

    IF EXISTS (
        SELECT c.clause_code FROM master.payment_term_clause c
        JOIN master.payment_term_clause s
          ON s.payment_term_id = c.payment_term_id AND s.clause_code = c.settles_clause_code
        JOIN master.payment_term p ON p.id = c.payment_term_id
        WHERE p.tenant_id = v_tid
          AND c.clause_type = 'RETENTION_RELEASE' AND s.clause_type != 'RETENTION'
    ) THEN RAISE EXCEPTION '341 FAIL: RETENTION_RELEASE settles non-RETENTION'; END IF;

    -- A9: Flexible advance has min_pct < max_pct
    IF EXISTS (
        SELECT clause_code FROM master.payment_term_clause c
        JOIN master.payment_term p ON p.id = c.payment_term_id
        WHERE p.tenant_id = v_tid AND c.flexibility_mode = 'FLEXIBLE'
          AND (c.min_pct IS NULL OR c.max_pct IS NULL OR c.min_pct >= c.max_pct)
    ) THEN RAISE EXCEPTION '341 FAIL: FLEXIBLE clause with invalid min/max bounds'; END IF;

    -- A10: DDL constraint compliance
    IF EXISTS (
        SELECT code FROM master.payment_term
        WHERE tenant_id = v_tid AND status = 'active'
          AND due_rule_type = 'NET_DAYS' AND due_days IS NULL
    ) THEN RAISE EXCEPTION '341 FAIL: NET_DAYS with NULL due_days'; END IF;

    IF EXISTS (
        SELECT code FROM master.payment_term
        WHERE tenant_id = v_tid AND status = 'active'
          AND due_rule_type IN ('COD','PREPAID') AND due_days IS NOT NULL
    ) THEN RAISE EXCEPTION '341 FAIL: COD/PREPAID with due_days set'; END IF;

    RAISE NOTICE '341: % payment terms, % clauses, % discount tiers',
        (SELECT count(*) FROM master.payment_term WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = '341_org'),
        (SELECT count(*) FROM master.payment_term_clause c
         JOIN master.payment_term p ON c.payment_term_id = p.id
         WHERE p.tenant_id = v_tid AND p.metadata->'_seed'->>'pack' = '341_org'),
        (SELECT count(*) FROM master.payment_term_discount_tier d
         JOIN master.payment_term p ON d.payment_term_id = p.id
         WHERE p.tenant_id = v_tid AND p.metadata->'_seed'->>'pack' = '341_org');
END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/500_asset/340_asset_classes.sql
-- ============================================================================
-- 340_asset_classes.sql  Asset class + book policy seed (v3)
-- ============================================================================
-- Seeds 16 asset class templates per company code (4 L1 headers + 12 L2 leaves)
-- and 2 book policies per leaf class (statutory + management) = 24 policies/company.
--
-- Prerequisites: 311_ledger_books.sql (company books + BOOK-MGMT-GROUP)
-- Depends on:    master.asset_class, control.asset_class_book_policy
--
-- Fixes from review:
--   FIX-1: book_code = real ledger_book.code ('{CC}-BOOK-STAT', 'BOOK-MGMT-GROUP')
--   FIX-2: ON CONFLICT uses (..., effective_from) for true versioning
--   REC-1: asset_class.code = bare codes ('PLANT' not 'ATHQ-AC-PLANT')
--   REC-3: TOOLS uses straight_line (units_of_production deferred)
-- ============================================================================

DO $seed$
DECLARE
    v_tid       uuid;
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_pack      text := '340_asset';
    v_version   text := '3.0.0';
    v_meta      jsonb;
    v_cc        record;
    v_class_id  uuid;
    v_stat_book text;
    v_mgmt_book text := 'BOOK-MGMT-GROUP';
    v_count     int;
    v_unmapped_count int;
    v_mapped_count   int;
    v_total_roles    int;
    v_sample_cc_id   uuid;
    v_sample_book    text;
    v_role_code      text;
    v_resolved_gl    uuid;
    v_unmapped_list  text[];
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[340] Tenant ATHYPER not found'; END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', v_pack, 'version', v_version, 'seeded_at', now()::text));

    -- Verify prerequisites
    IF (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active') < 17 THEN
        RAISE EXCEPTION '[340] Expected >=17 active company codes';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.ledger_book
        WHERE tenant_id = v_tid AND code = v_mgmt_book) THEN
        RAISE EXCEPTION '[340] Management book % not found -- run 311 first', v_mgmt_book;
    END IF;

    -- ================================================================
    -- STAGE A: Asset class templates (identity only)
    -- ================================================================

    CREATE TEMP TABLE tmp_ac (
        code            text NOT NULL PRIMARY KEY,
        name            text NOT NULL,
        description     text,
        parent_code     text,
        level_no        smallint NOT NULL,
        is_leaf         boolean NOT NULL,
        asset_nature    text NOT NULL,
        is_depreciable  boolean NOT NULL DEFAULT true,
        is_componentization_required boolean NOT NULL DEFAULT false,
        revaluation_allowed boolean NOT NULL DEFAULT false,
        useful_life_override_policy text NOT NULL DEFAULT 'allow',
        threshold_mult  numeric(5,2) NOT NULL DEFAULT 1.0,
        sort_order      smallint NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_ac VALUES
    -- L1 Headers (is_leaf=false)
    ('TANGIBLE',   'Tangible Fixed Assets',    'IAS 16 PPE',                     NULL,       1, false, 'tangible',   true,  false, false, 'allow',  0,    100),
    ('INTANGIBLE', 'Intangible Assets',        'IAS 38 intangibles',             NULL,       1, false, 'intangible', true,  false, false, 'allow',  0,    200),
    ('ROU',        'Right-of-Use Assets',      'IFRS 16 leased assets',          NULL,       1, false, 'rou',        true,  false, false, 'forbid', 0,    300),
    ('CWIP',       'Capital Work in Progress', 'Under construction',             NULL,       1, false, 'cwip',       false, false, false, 'forbid', 0,    400),
    -- L2 Tangible
    ('LAND',       'Land',                     'Non-depreciable (IAS 16)',        'TANGIBLE', 2, true,  'land',       false, false, true,  'forbid', 10.0, 110),
    ('BUILDINGS',  'Buildings',                'Office, warehouse, plant',        'TANGIBLE', 2, true,  'tangible',   true,  true,  true,  'allow',  5.0,  120),
    ('PLANT',      'Plant & Machinery',        'Production equipment',            'TANGIBLE', 2, true,  'tangible',   true,  true,  false, 'allow',  2.0,  130),
    ('VEHICLES',   'Vehicles',                 'Fleet, cars, forklifts',          'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  1.0,  140),
    ('IT-EQUIP',   'IT Equipment',             'Servers, network, desktops',      'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  0.5,  150),
    ('FURNITURE',  'Furniture & Fixtures',     'Office furniture, fittings',      'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  0.5,  160),
    ('LHI',        'Leasehold Improvements',   'Tenant improvements',             'TANGIBLE', 2, true,  'leasehold_improvement', true, false, false, 'allow', 1.0, 170),
    ('TOOLS',      'Tools & Dies',             'Specialised tooling',             'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  0.5,  180),
    -- L2 Intangible
    ('SOFTWARE',   'Software & Licences',      'Purchased/developed software',    'INTANGIBLE',2,true,  'intangible', true,  false, false, 'allow',  0.5,  210),
    -- L2 ROU
    ('ROU-PROP',   'ROU - Property',           'IFRS 16 leased buildings',        'ROU',      2, true,  'rou',        true,  false, false, 'forbid', 1.0,  310),
    ('ROU-EQUIP',  'ROU - Equipment',          'IFRS 16 leased equipment',        'ROU',      2, true,  'rou',        true,  false, false, 'forbid', 0.5,  320),
    -- L2 CWIP
    ('CWIP-GEN',   'General CWIP',             'Reclassified on capitalization',  'CWIP',     2, true,  'cwip',       false, false, false, 'forbid', 0,    410);

    -- ================================================================
    -- STAGE B: Book policy templates
    -- ================================================================

    CREATE TEMP TABLE tmp_policy (
        class_code      text NOT NULL,
        book_key        text NOT NULL,  -- 'STAT' or 'MGMT' (resolved per company)
        is_depreciable  boolean NOT NULL DEFAULT true,
        depr_method     text,
        life_months     integer,
        residual_mode   text NOT NULL DEFAULT 'zero',
        residual_pct    numeric(9,4),
        convention      text,
        prorate_basis   text NOT NULL DEFAULT 'monthly',
        start_rule      text NOT NULL DEFAULT 'in_service_date',
        acq_role        text,
        accum_role      text,
        expense_role    text,
        gainloss_role   text,
        cwip_role       text,
        impair_exp_role text,
        impair_rsv_role text,
        reval_surp_role text,
        reval_loss_role text,
        PRIMARY KEY (class_code, book_key)
    ) ON COMMIT DROP;

    -- Statutory book policies
    INSERT INTO tmp_policy VALUES
    ('LAND',      'STAT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',       'fa_acq_land',NULL,NULL,'fa_gainloss_disposal','fa_cwip',NULL,NULL,'fa_reval_surplus_land','fa_reval_loss_land'),
    ('BUILDINGS', 'STAT', true, 'straight_line',  480, 'percent',5.0,'full_month','monthly','in_service_date', 'fa_acq_bldg','fa_accum_bldg','fa_depr_bldg','fa_gainloss_disposal','fa_cwip','fa_impair_exp','fa_impair_rsv','fa_reval_surplus_bldg','fa_reval_loss_bldg'),
    ('PLANT',     'STAT', true, 'straight_line',  120, 'percent',5.0,'half_year','monthly','in_service_date',  'fa_acq_plant','fa_accum_plant','fa_depr_plant','fa_gainloss_disposal','fa_cwip','fa_impair_exp','fa_impair_rsv',NULL,NULL),
    ('VEHICLES',  'STAT', true, 'straight_line',   60, 'percent',10.0,'half_month','monthly','in_service_date', 'fa_acq_veh','fa_accum_veh','fa_depr_veh','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('IT-EQUIP',  'STAT', true, 'straight_line',   36, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_it','fa_accum_it','fa_depr_it','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('FURNITURE', 'STAT', true, 'straight_line',   84, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_furn','fa_accum_furn','fa_depr_furn','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('LHI',       'STAT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_lhi','fa_accum_lhi','fa_depr_lhi','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('TOOLS',     'STAT', true, 'straight_line',   48, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_tools','fa_accum_tools','fa_depr_tools','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('SOFTWARE',  'STAT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','capitalization_date','fa_acq_sw','fa_amort_sw','fa_depr_amort','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('ROU-PROP',  'STAT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_prop','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('ROU-EQUIP', 'STAT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_equip','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('CWIP-GEN',  'STAT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',           'fa_cwip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);

    -- Management book policies (shorter lives, vehicles use declining_balance)
    INSERT INTO tmp_policy VALUES
    ('LAND',      'MGMT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',       'fa_acq_land',NULL,NULL,'fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('BUILDINGS', 'MGMT', true, 'straight_line',  360, 'percent',5.0,'full_month','monthly','in_service_date', 'fa_acq_bldg','fa_accum_bldg','fa_depr_bldg','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('PLANT',     'MGMT', true, 'straight_line',   96, 'percent',5.0,'half_year','monthly','in_service_date',  'fa_acq_plant','fa_accum_plant','fa_depr_plant','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('VEHICLES',  'MGMT', true, 'declining_balance',48,'percent',10.0,'half_month','monthly','in_service_date', 'fa_acq_veh','fa_accum_veh','fa_depr_veh','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('IT-EQUIP',  'MGMT', true, 'straight_line',   36, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_it','fa_accum_it','fa_depr_it','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('FURNITURE', 'MGMT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_furn','fa_accum_furn','fa_depr_furn','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('LHI',       'MGMT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_lhi','fa_accum_lhi','fa_depr_lhi','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('TOOLS',     'MGMT', true, 'straight_line',   36, 'zero',NULL,'half_month','monthly','in_service_date',    'fa_acq_tools','fa_accum_tools','fa_depr_tools','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('SOFTWARE',  'MGMT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','capitalization_date','fa_acq_sw','fa_amort_sw','fa_depr_amort','fa_gainloss_disposal','fa_cwip',NULL,NULL,NULL,NULL),
    ('ROU-PROP',  'MGMT', true, 'straight_line',   60, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_prop','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('ROU-EQUIP', 'MGMT', true, 'straight_line',   36, 'zero',NULL,'full_month','monthly','in_service_date',   'fa_acq_rou_equip','fa_accum_rou','fa_depr_rou','fa_gainloss_disposal',NULL,NULL,NULL,NULL,NULL),
    ('CWIP-GEN',  'MGMT', false,'no_depreciation',NULL,'zero',NULL,NULL,'monthly','in_service_date',           'fa_cwip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);

    -- ================================================================
    -- STAGE C: Currency thresholds
    -- ================================================================

    CREATE TEMP TABLE tmp_threshold (
        currency_code character(3) PRIMARY KEY,
        base_threshold numeric(18,4) NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_threshold VALUES
    ('MYR',5000),('QAR',5000),('SAR',5000),('AED',5000),('USD',1000),('SGD',1500),
    ('INR',50000),('CAD',1000),('EUR',1000),('TWD',30000),('ZAR',10000),('GBP',1000),
    ('JPY',100000),('PHP',50000);

    -- ================================================================
    -- STAGE D: Per-company insert
    -- ================================================================

    FOR v_cc IN
        SELECT id, code, name, functional_currency
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        v_stat_book := v_cc.code || '-BOOK-STAT';

        -- Verify statutory book exists
        IF NOT EXISTS (SELECT 1 FROM master.ledger_book
            WHERE tenant_id = v_tid AND code = v_stat_book) THEN
            RAISE EXCEPTION '[340] Statutory book % not found for company %',
                v_stat_book, v_cc.code;
        END IF;

        -- D1: L1 headers
        INSERT INTO master.asset_class (
            tenant_id, company_code_id,
            code, name, description,
            parent_id, level_no, path, is_leaf,
            asset_nature, is_depreciable,
            capitalization_threshold, capitalization_currency,
            is_componentization_required, revaluation_allowed,
            useful_life_override_policy,
            sort_order, metadata, status, created_by
        )
        SELECT v_tid, v_cc.id,
            t.code, t.name, t.description,
            NULL, t.level_no, t.code, t.is_leaf,
            t.asset_nature, t.is_depreciable,
            0, v_cc.functional_currency,
            t.is_componentization_required, t.revaluation_allowed,
            t.useful_life_override_policy,
            t.sort_order, v_meta, 'active', v_su
        FROM tmp_ac t WHERE t.parent_code IS NULL
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, asset_nature = EXCLUDED.asset_nature,
            is_depreciable = EXCLUDED.is_depreciable, is_leaf = EXCLUDED.is_leaf,
            updated_at = now(), updated_by = v_su
        WHERE (master.asset_class.name, master.asset_class.asset_nature,
               master.asset_class.is_depreciable, master.asset_class.is_leaf)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.asset_nature,
               EXCLUDED.is_depreciable, EXCLUDED.is_leaf);

        -- D2: L2 leaves
        INSERT INTO master.asset_class (
            tenant_id, company_code_id,
            code, name, description,
            parent_id, level_no, path, is_leaf,
            asset_nature, is_depreciable,
            capitalization_threshold, capitalization_currency,
            is_componentization_required, revaluation_allowed,
            useful_life_override_policy,
            sort_order, metadata, status, created_by
        )
        SELECT v_tid, v_cc.id,
            t.code, t.name, t.description,
            p.id, t.level_no, p.path || '/' || t.code, t.is_leaf,
            t.asset_nature, t.is_depreciable,
            COALESCE(ct.base_threshold, 1000) * t.threshold_mult,
            v_cc.functional_currency,
            t.is_componentization_required, t.revaluation_allowed,
            t.useful_life_override_policy,
            t.sort_order, v_meta, 'active', v_su
        FROM tmp_ac t
        JOIN master.asset_class p
          ON p.tenant_id = v_tid AND p.company_code_id = v_cc.id
         AND p.code = t.parent_code
        LEFT JOIN tmp_threshold ct ON ct.currency_code = v_cc.functional_currency
        WHERE t.parent_code IS NOT NULL
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            asset_nature = EXCLUDED.asset_nature, is_depreciable = EXCLUDED.is_depreciable,
            is_leaf = EXCLUDED.is_leaf,
            capitalization_threshold = EXCLUDED.capitalization_threshold,
            capitalization_currency = EXCLUDED.capitalization_currency,
            updated_at = now(), updated_by = v_su
        WHERE (master.asset_class.name, master.asset_class.parent_id,
               master.asset_class.asset_nature, master.asset_class.is_depreciable,
               master.asset_class.is_leaf,
               master.asset_class.capitalization_threshold,
               master.asset_class.capitalization_currency)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id,
               EXCLUDED.asset_nature, EXCLUDED.is_depreciable,
               EXCLUDED.is_leaf,
               EXCLUDED.capitalization_threshold,
               EXCLUDED.capitalization_currency);

        -- D3: Book policies
        INSERT INTO control.asset_class_book_policy (
            tenant_id, company_code_id, asset_class_id,
            book_code,
            priority, effective_from,
            is_depreciable, depreciation_method, useful_life_months,
            residual_value_mode, residual_value_pct,
            convention, prorate_basis, depreciation_start_rule,
            acquisition_posting_role_code, accum_depr_posting_role_code,
            depr_expense_posting_role_code, gain_loss_posting_role_code,
            cwip_posting_role_code,
            impairment_expense_posting_role_code, impairment_reserve_posting_role_code,
            revaluation_surplus_posting_role_code, revaluation_loss_posting_role_code,
            metadata, status, created_by
        )
        SELECT
            v_tid, v_cc.id, ac.id,
            CASE pol.book_key
                WHEN 'STAT' THEN v_stat_book
                WHEN 'MGMT' THEN v_mgmt_book
            END,
            50, '2025-01-01',
            pol.is_depreciable, pol.depr_method, pol.life_months,
            pol.residual_mode, pol.residual_pct,
            pol.convention, pol.prorate_basis, pol.start_rule,
            pol.acq_role, pol.accum_role, pol.expense_role, pol.gainloss_role,
            pol.cwip_role, pol.impair_exp_role, pol.impair_rsv_role,
            pol.reval_surp_role, pol.reval_loss_role,
            v_meta, 'active', v_su
        FROM tmp_policy pol
        JOIN master.asset_class ac
          ON ac.tenant_id = v_tid AND ac.company_code_id = v_cc.id
         AND ac.code = pol.class_code
        ON CONFLICT (tenant_id, company_code_id, asset_class_id, book_code, effective_from)
        DO UPDATE SET
            is_depreciable = EXCLUDED.is_depreciable,
            depreciation_method = EXCLUDED.depreciation_method,
            useful_life_months = EXCLUDED.useful_life_months,
            residual_value_mode = EXCLUDED.residual_value_mode,
            residual_value_pct = EXCLUDED.residual_value_pct,
            convention = EXCLUDED.convention,
            acquisition_posting_role_code = EXCLUDED.acquisition_posting_role_code,
            accum_depr_posting_role_code = EXCLUDED.accum_depr_posting_role_code,
            depr_expense_posting_role_code = EXCLUDED.depr_expense_posting_role_code,
            gain_loss_posting_role_code = EXCLUDED.gain_loss_posting_role_code,
            cwip_posting_role_code = EXCLUDED.cwip_posting_role_code,
            updated_at = now(), updated_by = v_su
        WHERE (control.asset_class_book_policy.is_depreciable,
               control.asset_class_book_policy.depreciation_method,
               control.asset_class_book_policy.useful_life_months,
               control.asset_class_book_policy.residual_value_mode,
               control.asset_class_book_policy.residual_value_pct,
               control.asset_class_book_policy.convention,
               control.asset_class_book_policy.acquisition_posting_role_code,
               control.asset_class_book_policy.accum_depr_posting_role_code,
               control.asset_class_book_policy.depr_expense_posting_role_code,
               control.asset_class_book_policy.gain_loss_posting_role_code,
               control.asset_class_book_policy.cwip_posting_role_code)
           IS DISTINCT FROM
              (EXCLUDED.is_depreciable,
               EXCLUDED.depreciation_method,
               EXCLUDED.useful_life_months,
               EXCLUDED.residual_value_mode,
               EXCLUDED.residual_value_pct,
               EXCLUDED.convention,
               EXCLUDED.acquisition_posting_role_code,
               EXCLUDED.accum_depr_posting_role_code,
               EXCLUDED.depr_expense_posting_role_code,
               EXCLUDED.gain_loss_posting_role_code,
               EXCLUDED.cwip_posting_role_code);
    END LOOP;

    -- ================================================================
    -- STAGE E: Assertions
    -- ================================================================

    -- A1: Asset class count = 272 (17 companies x 16 classes)
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 272 THEN
        RAISE EXCEPTION '[340] Expected 272 asset classes, got %', v_count;
    END IF;

    -- A2: 4 L1 headers per company
    IF EXISTS (
        SELECT company_code_id FROM master.asset_class
        WHERE tenant_id = v_tid AND level_no = 1 AND metadata->'_seed'->>'pack' = v_pack
        GROUP BY company_code_id HAVING count(*) != 4
    ) THEN RAISE EXCEPTION '[340] Company with != 4 L1 headers'; END IF;

    -- A3: 12 L2 leaves per company
    IF EXISTS (
        SELECT company_code_id FROM master.asset_class
        WHERE tenant_id = v_tid AND level_no = 2 AND metadata->'_seed'->>'pack' = v_pack
        GROUP BY company_code_id HAVING count(*) != 12
    ) THEN RAISE EXCEPTION '[340] Company with != 12 L2 leaves'; END IF;

    -- A4: Land/CWIP not depreciable
    IF EXISTS (
        SELECT id FROM master.asset_class
        WHERE tenant_id = v_tid AND asset_nature IN ('land','cwip') AND is_depreciable = true
    ) THEN RAISE EXCEPTION '[340] Land/CWIP marked as depreciable'; END IF;

    -- A5: Policy count = 408 (17 x 12 x 2)
    SELECT count(*) INTO v_count FROM control.asset_class_book_policy
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 408 THEN
        RAISE EXCEPTION '[340] Expected 408 book policies, got %', v_count;
    END IF;

    -- A6: Every policy book_code exists in master.ledger_book
    IF EXISTS (
        SELECT p.id, p.book_code
        FROM control.asset_class_book_policy p
        WHERE p.tenant_id = v_tid
          AND NOT EXISTS (
              SELECT 1 FROM master.ledger_book lb
              WHERE lb.tenant_id = p.tenant_id AND lb.code = p.book_code
          )
    ) THEN RAISE EXCEPTION '[340] Policy references non-existent ledger book code'; END IF;

    -- A7: No depreciable policy missing core posting roles
    IF EXISTS (
        SELECT id FROM control.asset_class_book_policy
        WHERE tenant_id = v_tid AND is_depreciable = true
          AND depreciation_method != 'no_depreciation'
          AND (acquisition_posting_role_code IS NULL
               OR accum_depr_posting_role_code IS NULL
               OR depr_expense_posting_role_code IS NULL)
    ) THEN RAISE EXCEPTION '[340] Depreciable policy missing core posting roles'; END IF;

    -- A8: No units_of_production in seed (REC-3)
    IF EXISTS (
        SELECT id FROM control.asset_class_book_policy
        WHERE tenant_id = v_tid AND depreciation_method = 'units_of_production'
          AND metadata->'_seed'->>'pack' = v_pack
    ) THEN RAISE EXCEPTION '[340] units_of_production found -- deferred until method_params ready'; END IF;

    -- A9: Bare class codes (no company prefix)
    IF EXISTS (
        SELECT id FROM master.asset_class
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND code LIKE '%-%-%'
          AND code NOT IN ('IT-EQUIP','ROU-PROP','ROU-EQUIP','CWIP-GEN')
    ) THEN RAISE EXCEPTION '[340] Asset class code contains company prefix -- should be bare'; END IF;

    -- A10: Every policy book_code is assigned to its company
    IF EXISTS (
        SELECT p.id, p.book_code, p.company_code_id
        FROM control.asset_class_book_policy p
        WHERE p.tenant_id = v_tid AND p.metadata->'_seed'->>'pack' = v_pack
          AND NOT EXISTS (
              SELECT 1
              FROM master.company_code_book_assignment ba
              JOIN master.ledger_book lb ON lb.id = ba.book_id AND lb.tenant_id = ba.tenant_id
              WHERE ba.tenant_id = p.tenant_id
                AND ba.company_code_id = p.company_code_id
                AND lb.code = p.book_code
                AND ba.status = 'active'
          )
    ) THEN RAISE EXCEPTION '[340] Policy book_code not assigned to its company via book_assignment'; END IF;

    -- A11: Posting role spot-check
    SELECT id, code || '-BOOK-STAT'
    INTO v_sample_cc_id, v_sample_book
    FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active'
    ORDER BY code LIMIT 1;

    v_mapped_count   := 0;
    v_unmapped_count := 0;
    v_total_roles    := 0;
    v_unmapped_list  := '{}';

    FOR v_role_code IN
        SELECT DISTINCT role FROM (
            SELECT acquisition_posting_role_code AS role FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND acquisition_posting_role_code IS NOT NULL
            UNION SELECT accum_depr_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND accum_depr_posting_role_code IS NOT NULL
            UNION SELECT depr_expense_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND depr_expense_posting_role_code IS NOT NULL
            UNION SELECT gain_loss_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND gain_loss_posting_role_code IS NOT NULL
            UNION SELECT cwip_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND cwip_posting_role_code IS NOT NULL
            UNION SELECT impairment_expense_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND impairment_expense_posting_role_code IS NOT NULL
            UNION SELECT impairment_reserve_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND impairment_reserve_posting_role_code IS NOT NULL
            UNION SELECT revaluation_surplus_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND revaluation_surplus_posting_role_code IS NOT NULL
            UNION SELECT revaluation_loss_posting_role_code FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND revaluation_loss_posting_role_code IS NOT NULL
        ) sub ORDER BY role
    LOOP
        v_total_roles := v_total_roles + 1;

        BEGIN
            v_resolved_gl := control.resolve_posting_role_account(
                v_tid, v_role_code, v_sample_cc_id, v_sample_book, '2025-01-01'::date
            );
        EXCEPTION WHEN OTHERS THEN
            v_resolved_gl := NULL;
        END;

        IF v_resolved_gl IS NOT NULL THEN
            v_mapped_count := v_mapped_count + 1;
        ELSE
            v_unmapped_count := v_unmapped_count + 1;
            v_unmapped_list := v_unmapped_list || v_role_code;
        END IF;
    END LOOP;

    RAISE NOTICE '[340] Posting role spot-check (sample: %, book: %): % total, % mapped, % unmapped',
        v_sample_cc_id, v_sample_book, v_total_roles, v_mapped_count, v_unmapped_count;

    IF v_unmapped_count > 0 THEN
        RAISE NOTICE '[340] ACTION REQUIRED: % unmapped role codes need 341_asset_posting_role_map.sql: %',
            v_unmapped_count, array_to_string(v_unmapped_list, ', ');
    END IF;

    -- Summary
    RAISE NOTICE '[340] Asset classes: % (% L1 + % L2) across % companies',
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND level_no = 1 AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND level_no = 2 AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(DISTINCT company_code_id) FROM master.asset_class WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

    RAISE NOTICE '[340] Book policies: % (stat: %, mgmt: %). All book_codes validated against ledger_book.',
        (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND book_code LIKE '%-BOOK-STAT' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.asset_class_book_policy WHERE tenant_id = v_tid AND book_code = 'BOOK-MGMT-GROUP' AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/800_subscriptions/001_demo_module_subscriptions.sql
-- 900_seed_data/030_tenant/800_subscriptions/001_demo_module_subscriptions.sql
-- Seed: Subscribe all tenants to all modules
-- Schema: master | Table: tenant_module_subscription
-- Strategy: cross-join all tenants × all modules, status = 'active'
-- Updated: PRM workspace added (PCON, OMI, IMO, CCON, SOO, SII, LOGX)
-- Idempotent: ON CONFLICT (tenant_id, module_id) DO NOTHING

INSERT INTO master.tenant_module_subscription (id, tenant_id, module_id, status, created_by)
SELECT
  gen_random_uuid(),
  t.id,
  m.id,
  'active',
  '00000000-0000-0000-0000-000000000000'
FROM master.tenant t
CROSS JOIN shared.module m
ON CONFLICT (tenant_id, module_id) DO NOTHING;

DO $$ DECLARE cnt int; BEGIN
  SELECT count(*) INTO cnt FROM master.tenant_module_subscription;
  RAISE NOTICE 'master.tenant_module_subscription: % rows total', cnt;
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/900_principals/001_demo_principals.sql
-- ============================================================================
-- DEMO PRINCIPALS — PRINCIPAL + PROFILE + AUTH BINDING
-- ============================================================================
-- File:     001_demo_principals.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding
-- Purpose:  Pre-seed all 17 human demo users so the KC → DB identity
--           resolution works on first login without a JIT create.
--
-- KEY DESIGN: KC user UUID == DB principal UUID == principal_identity_binding.subject_id
--   The auth adapter looks up (tenant_id, provider_code, subject_id) on every
--   authenticated request. With this seed, that binding exists before first login.
--
-- All 17 demo users belong to the 'athyper' tenant.
-- KC org claims (ATHQ, AQTU, ASAC, etc.) provide business-unit scope within
-- that tenant — they are NOT separate DB tenants.
--
-- UUID series (aa001000-…):
--   aa001000-0000-0000-0000-000000000001  athq.viewer
--   aa001000-0000-0000-0000-000000000002  athq.reporter
--   aa001000-0000-0000-0000-000000000003  athq.requester
--   aa001000-0000-0000-0000-000000000004  athq.agent
--   aa001000-0000-0000-0000-000000000005  athq.manager
--   aa001000-0000-0000-0000-000000000006  athq.owner
--   aa001000-0000-0000-0000-000000000007  athq.admin
--   aa001000-0000-0000-0000-000000000008  aqtu.manager
--   aa001000-0000-0000-0000-000000000009  asac.manager
--   aa001000-0000-0000-0000-00000000000a  auic.manager
--   aa001000-0000-0000-0000-00000000000b  asgf.manager
--   aa001000-0000-0000-0000-00000000000c  athq.cfo
--   aa001000-0000-0000-0000-00000000000d  partner.viewer
--   aa001000-0000-0000-0000-00000000000e  partner.agent
--   aa001000-0000-0000-0000-00000000000f  partner.manager
--   aa001000-0000-0000-0000-000000000010  partner.owner
--   aa001000-0000-0000-0000-000000000011  karim.dual
-- ============================================================================

DO $demo_principals$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    v_stable_ids uuid[] := ARRAY[
        'aa001000-0000-0000-0000-000000000001'::uuid,
        'aa001000-0000-0000-0000-000000000002'::uuid,
        'aa001000-0000-0000-0000-000000000003'::uuid,
        'aa001000-0000-0000-0000-000000000004'::uuid,
        'aa001000-0000-0000-0000-000000000005'::uuid,
        'aa001000-0000-0000-0000-000000000006'::uuid,
        'aa001000-0000-0000-0000-000000000007'::uuid,
        'aa001000-0000-0000-0000-000000000008'::uuid,
        'aa001000-0000-0000-0000-000000000009'::uuid,
        'aa001000-0000-0000-0000-00000000000a'::uuid,
        'aa001000-0000-0000-0000-00000000000b'::uuid,
        'aa001000-0000-0000-0000-00000000000c'::uuid,
        'aa001000-0000-0000-0000-00000000000d'::uuid,
        'aa001000-0000-0000-0000-00000000000e'::uuid,
        'aa001000-0000-0000-0000-00000000000f'::uuid,
        'aa001000-0000-0000-0000-000000000010'::uuid,
        'aa001000-0000-0000-0000-000000000011'::uuid
    ];
BEGIN

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE 0: Remove JIT-created demo principals that conflict with stable UUIDs
    -- Targets only principals created by oidc_jit whose keycloak_id matches one
    -- of our stable UUIDs but whose principal.id is different (JIT random UUID).
    -- CASCADE removes profile + auth_binding + persona + auth_group_member.
    -- Skips principals that already use the stable UUID (re-run safe).
    -- ══════════════════════════════════════════════════════════════════════════
    DELETE FROM master.principal p
    USING master.principal_profile pp
    WHERE pp.principal_id = p.id
      AND p.tenant_id     = v_tenant_id
      AND p.principal_source = 'oidc_jit'
      AND pp.keycloak_id::uuid = ANY(v_stable_ids)
      AND p.id           <> ALL(v_stable_ids);

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    ) VALUES
    ('aa001000-0000-0000-0000-000000000001', v_tenant_id, 'athq.viewer',    'ATHQ Viewer',    'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000002', v_tenant_id, 'athq.reporter',  'ATHQ Reporter',  'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000003', v_tenant_id, 'athq.requester', 'ATHQ Requester', 'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000004', v_tenant_id, 'athq.agent',     'ATHQ Agent',     'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000005', v_tenant_id, 'athq.manager',   'ATHQ Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000006', v_tenant_id, 'athq.owner',     'ATHQ Owner',     'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000007', v_tenant_id, 'athq.admin',     'ATHQ Admin',     'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000008', v_tenant_id, 'aqtu.manager',   'AQTU Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000009', v_tenant_id, 'asac.manager',   'ASAC Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000a', v_tenant_id, 'auic.manager',   'AUIC Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000b', v_tenant_id, 'asgf.manager',   'ASGF Manager',   'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000c', v_tenant_id, 'athq.cfo',       'ATHQ CFO',       'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000d', v_tenant_id, 'partner.viewer', 'Partner Viewer', 'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000e', v_tenant_id, 'partner.agent',  'Partner Agent',  'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-00000000000f', v_tenant_id, 'partner.manager','Partner Manager','user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000010', v_tenant_id, 'partner.owner',  'Partner Owner',  'user', false, false, 'oidc_jit', 'active', v_su),
    ('aa001000-0000-0000-0000-000000000011', v_tenant_id, 'karim.dual',     'Karim Dual',     'user', false, false, 'oidc_jit', 'active', v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal_profile
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    ) VALUES
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000001', 'ATHQ',    'Viewer',    'ATHQ Viewer',    'aa001000-0000-0000-0000-000000000001', 'athq.viewer',    'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000002', 'ATHQ',    'Reporter',  'ATHQ Reporter',  'aa001000-0000-0000-0000-000000000002', 'athq.reporter',  'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000003', 'ATHQ',    'Requester', 'ATHQ Requester', 'aa001000-0000-0000-0000-000000000003', 'athq.requester', 'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000004', 'ATHQ',    'Agent',     'ATHQ Agent',     'aa001000-0000-0000-0000-000000000004', 'athq.agent',     'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000005', 'ATHQ',    'Manager',   'ATHQ Manager',   'aa001000-0000-0000-0000-000000000005', 'athq.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000006', 'ATHQ',    'Owner',     'ATHQ Owner',     'aa001000-0000-0000-0000-000000000006', 'athq.owner',     'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000007', 'ATHQ',    'Admin',     'ATHQ Admin',     'aa001000-0000-0000-0000-000000000007', 'athq.admin',     'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000008', 'AQTU',    'Manager',   'AQTU Manager',   'aa001000-0000-0000-0000-000000000008', 'aqtu.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000009', 'ASAC',    'Manager',   'ASAC Manager',   'aa001000-0000-0000-0000-000000000009', 'asac.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000a', 'AUIC',    'Manager',   'AUIC Manager',   'aa001000-0000-0000-0000-00000000000a', 'auic.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000b', 'ASGF',    'Manager',   'ASGF Manager',   'aa001000-0000-0000-0000-00000000000b', 'asgf.manager',   'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000c', 'ATHQ',    'CFO',       'ATHQ CFO',       'aa001000-0000-0000-0000-00000000000c', 'athq.cfo',       'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000d', 'Partner', 'Viewer',    'Partner Viewer', 'aa001000-0000-0000-0000-00000000000d', 'partner.viewer', 'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000e', 'Partner', 'Agent',     'Partner Agent',  'aa001000-0000-0000-0000-00000000000e', 'partner.agent',  'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000f', 'Partner', 'Manager',   'Partner Manager','aa001000-0000-0000-0000-00000000000f', 'partner.manager','synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000010', 'Partner', 'Owner',     'Partner Owner',  'aa001000-0000-0000-0000-000000000010', 'partner.owner',  'synced', v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000011', 'Karim',   'Dual',      'Karim Dual',     'aa001000-0000-0000-0000-000000000011', 'karim.dual',     'synced', v_su)
    ON CONFLICT (tenant_id, principal_id) DO UPDATE
        SET given_name           = EXCLUDED.given_name,
            family_name          = EXCLUDED.family_name,
            display_name         = EXCLUDED.display_name,
            keycloak_id          = EXCLUDED.keycloak_id,
            keycloak_username    = EXCLUDED.keycloak_username,
            keycloak_sync_status = EXCLUDED.keycloak_sync_status;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE C: master.principal_identity_binding
    -- provider_code = 'keycloak', subject_id = KC UUID (= principal.id)
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000001', 'keycloak', 'aa001000-0000-0000-0000-000000000001', 'athq.viewer',    'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000002', 'keycloak', 'aa001000-0000-0000-0000-000000000002', 'athq.reporter',  'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000003', 'keycloak', 'aa001000-0000-0000-0000-000000000003', 'athq.requester', 'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000004', 'keycloak', 'aa001000-0000-0000-0000-000000000004', 'athq.agent',     'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000005', 'keycloak', 'aa001000-0000-0000-0000-000000000005', 'athq.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000006', 'keycloak', 'aa001000-0000-0000-0000-000000000006', 'athq.owner',     'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000007', 'keycloak', 'aa001000-0000-0000-0000-000000000007', 'athq.admin',     'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000008', 'keycloak', 'aa001000-0000-0000-0000-000000000008', 'aqtu.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000009', 'keycloak', 'aa001000-0000-0000-0000-000000000009', 'asac.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000a', 'keycloak', 'aa001000-0000-0000-0000-00000000000a', 'auic.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000b', 'keycloak', 'aa001000-0000-0000-0000-00000000000b', 'asgf.manager',   'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000c', 'keycloak', 'aa001000-0000-0000-0000-00000000000c', 'athq.cfo',       'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000d', 'keycloak', 'aa001000-0000-0000-0000-00000000000d', 'partner.viewer', 'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000e', 'keycloak', 'aa001000-0000-0000-0000-00000000000e', 'partner.agent',  'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-00000000000f', 'keycloak', 'aa001000-0000-0000-0000-00000000000f', 'partner.manager','synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000010', 'keycloak', 'aa001000-0000-0000-0000-000000000010', 'partner.owner',  'synced', true, true, now(), v_su),
    (v_tenant_id, 'aa001000-0000-0000-0000-000000000011', 'keycloak', 'aa001000-0000-0000-0000-000000000011', 'karim.dual',     'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING;

    RAISE NOTICE '[001_demo_principals] 17 principals + profiles + auth bindings seeded';

END $demo_principals$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/900_principals/002_demo_principal_personas.sql
-- ============================================================================
-- DEMO PRINCIPALS — PERSONA ASSIGNMENTS
-- ============================================================================
-- File:     002_demo_principal_personas.sql
-- Schema:   master.principal_persona
-- Purpose:  Assign one persona per demo principal (17 rows).
--           Constraint: UNIQUE (tenant_id, principal_id) — one persona per user.
-- Depends:  001_demo_principals.sql, 010_persona.sql (shared.persona seeded)
-- Idempotent: ON CONFLICT (tenant_id, principal_id) DO UPDATE persona_id
--
-- ── Persona policy ──────────────────────────────────────────────────────────
-- Two tiers: owner (full operational access) and admin (restricted access).
--
--   owner  → athq.owner, athq.cfo, athq.manager,
--             aqtu.manager, asac.manager, auic.manager, asgf.manager,
--             partner.owner, partner.manager, karim.dual
--
--   admin  → athq.admin, athq.viewer, athq.reporter,
--             athq.requester, athq.agent,
--             partner.viewer, partner.agent
-- ============================================================================

DO $demo_personas$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    ALTER TABLE master.principal_persona
        DISABLE TRIGGER trg_principal_persona_iam_outbox;

    INSERT INTO master.principal_persona (
        tenant_id, principal_id, persona_id,
        assigned_by, created_by
    )
    SELECT
        p.tenant_id,
        p.id        AS principal_id,
        per.id      AS persona_id,
        v_su        AS assigned_by,
        v_su        AS created_by
    FROM (VALUES
        -- (principal_uuid, persona_code)
        ('aa001000-0000-0000-0000-000000000001'::uuid, 'admin'),   -- athq.viewer
        ('aa001000-0000-0000-0000-000000000002'::uuid, 'admin'),   -- athq.reporter
        ('aa001000-0000-0000-0000-000000000003'::uuid, 'admin'),   -- athq.requester
        ('aa001000-0000-0000-0000-000000000004'::uuid, 'admin'),   -- athq.agent
        ('aa001000-0000-0000-0000-000000000005'::uuid, 'owner'),   -- athq.manager
        ('aa001000-0000-0000-0000-000000000006'::uuid, 'owner'),   -- athq.owner
        ('aa001000-0000-0000-0000-000000000007'::uuid, 'admin'),   -- athq.admin
        ('aa001000-0000-0000-0000-000000000008'::uuid, 'owner'),   -- aqtu.manager
        ('aa001000-0000-0000-0000-000000000009'::uuid, 'owner'),   -- asac.manager
        ('aa001000-0000-0000-0000-00000000000a'::uuid, 'owner'),   -- auic.manager
        ('aa001000-0000-0000-0000-00000000000b'::uuid, 'owner'),   -- asgf.manager
        ('aa001000-0000-0000-0000-00000000000c'::uuid, 'owner'),   -- athq.cfo
        ('aa001000-0000-0000-0000-00000000000d'::uuid, 'admin'),   -- partner.viewer
        ('aa001000-0000-0000-0000-00000000000e'::uuid, 'admin'),   -- partner.agent
        ('aa001000-0000-0000-0000-00000000000f'::uuid, 'owner'),   -- partner.manager
        ('aa001000-0000-0000-0000-000000000010'::uuid, 'owner'),   -- partner.owner
        ('aa001000-0000-0000-0000-000000000011'::uuid, 'owner')    -- karim.dual
    ) AS v(principal_uuid, persona_code)
    JOIN master.principal p  ON p.id = v.principal_uuid
    JOIN shared.persona per  ON per.code = v.persona_code
    ON CONFLICT (tenant_id, principal_id)
        DO UPDATE SET persona_id = excluded.persona_id;

    ALTER TABLE master.principal_persona
        ENABLE TRIGGER trg_principal_persona_iam_outbox;

    RAISE NOTICE '[002_demo_principal_personas] 17 persona assignments seeded (owner/admin)';

END $demo_personas$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/900_principals/003_demo_delegation_grants.sql
-- ============================================================================
-- SEED 003 — Demo Delegation Grants
-- ============================================================================
-- Idempotent: ON CONFLICT DO NOTHING on stable UUIDs.
--
-- Scenario A: athq.owner delegates to athq.manager (approve, create)
--   scoped to company_code ATHQ — expires 90 days from seed date.
--
-- Scenario B: athq.admin delegates to athq.cfo (export)
--   company_code ATHQ scope — expires 30 days from seed date.
--
-- These are pre-configured for demo users whose principals already exist via
-- seed 001_demo_principals.sql.
-- ============================================================================

-- ─── Scenario A ──────────────────────────────────────────────────────────────
-- Delegator : athq.owner   (aa001000-0000-0000-0000-000000000006)
-- Delegate  : athq.manager (aa001000-0000-0000-0000-000000000005)
-- Scope     : company_code → ATHQ
-- Permissions: approve, create
-- Purpose   : athq.manager can approve + create invoices on ATHQ while owner is away.

INSERT INTO master.delegation_grant (
  id,
  tenant_id,
  delegator_id,
  delegate_id,
  permissions,
  scope_type,
  scope_ref,
  expires_at,
  is_revoked,
  created_by
)
VALUES (
  'ff100001-0000-0000-0000-000000000001',
  (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
  'aa001000-0000-0000-0000-000000000006',  -- athq.owner (delegator)
  'aa001000-0000-0000-0000-000000000005',  -- athq.manager (delegate)
  ARRAY['approve', 'create'],
  'entity',
  'ATHQ',
  NOW() + INTERVAL '90 days',
  false,
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Scenario B ──────────────────────────────────────────────────────────────
-- Delegator : athq.admin (aa001000-0000-0000-0000-000000000007)
-- Delegate  : athq.cfo   (aa001000-0000-0000-0000-00000000000c)
-- Scope     : company_code → ATHQ
-- Permissions: export
-- Purpose   : athq.cfo can export reports on ATHQ entities (admin's privilege).

INSERT INTO master.delegation_grant (
  id,
  tenant_id,
  delegator_id,
  delegate_id,
  permissions,
  scope_type,
  scope_ref,
  expires_at,
  is_revoked,
  created_by
)
VALUES (
  'ff100002-0000-0000-0000-000000000001',
  (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
  'aa001000-0000-0000-0000-000000000007',  -- athq.admin (delegator)
  'aa001000-0000-0000-0000-00000000000c',  -- athq.cfo (delegate)
  ARRAY['export'],
  'entity',
  'ATHQ',
  NOW() + INTERVAL '30 days',
  false,
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/900_principals/003_principal_users.sql
-- ============================================================================
-- PRINCIPAL SYSTEM USERS — OWNER & ADMIN PER TENANT / COMPANY CODE
-- ============================================================================
-- File:     003_principal_users.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding
-- Purpose:  Pre-seed two system principal accounts per organisational unit:
--             • <TenantCode>.OWNER — full operational control
--             • <TenantCode>.ADMIN — administrative access
--           For tenants with multiple legal entities (athyper only, 17 CCs):
--             • <CCCode>.OWNER   — CC-scoped operational control
--             • <CCCode>.ADMIN   — CC-scoped administrative access
--
-- UUID series:
--   Tenant-level:   bb001000-0000-0000-0000-{seq:012x}  (01..1c, 28 users)
--   CC-level:       bb002000-0000-0000-0000-{seq:012x}  (01..22, 34 users)
--
-- Tenant mapping (seq → tenant code):
--   01-02  athyper         09-0a  demo_fr        11-12  demo_sa
--   03-04  demo_ca         0b-0c  demo_in        13-14  demo_us
--   05-06  demo_ch         0d-0e  demo_my        15-16  athyper-hq1
--   07-08  demo_de         0f-10  demo_qa        17-18  pepsi
--   (odd=OWNER, even=ADMIN)                      19-1a  coke
--                                                1b-1c  maaza
--
-- athyper CC mapping (seq → CC code):
--   01-02 ACFB  03-04 ADPM  05-06 AITM  07-08 AJED  09-0a AMRE
--   0b-0c APHS  0d-0e AQTS  0f-10 AQTU  11-12 ASAC  13-14 ASAH
--   15-16 ASGF  17-18 ASPE  19-1a ATEM  1b-1c ATHQ  1d-1e AUET
--   1f-20 AUIC  21-22 AUKA
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE
-- ============================================================================

DO $principal_users$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE 0: Remove any JIT principals that conflict with our stable UUIDs
    -- ══════════════════════════════════════════════════════════════════════

    DELETE FROM master.principal p
    USING master.principal_profile pp
    WHERE pp.principal_id = p.id
      AND p.principal_source = 'oidc_jit'
      AND pp.keycloak_id::uuid IN (
          -- Tenant-level UUIDs
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
          'bb001000-0000-0000-0000-00000000001c'::uuid,
          -- CC-level UUIDs
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
      AND p.id <> pp.keycloak_id::uuid;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal — tenant-level principal users (28)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id, t.id, v.code, v.name,
           'user', false, false, 'internal', 'active', v_su
    FROM (VALUES
        ('bb001000-0000-0000-0000-000000000001'::uuid, 'athyper',     'athyper.OWNER',     'Athyper Group Owner'),
        ('bb001000-0000-0000-0000-000000000002'::uuid, 'athyper',     'athyper.ADMIN',     'Athyper Group Admin'),
        ('bb001000-0000-0000-0000-000000000003'::uuid, 'demo_ca',     'demo_ca.OWNER',     'Demo Canada Owner'),
        ('bb001000-0000-0000-0000-000000000004'::uuid, 'demo_ca',     'demo_ca.ADMIN',     'Demo Canada Admin'),
        ('bb001000-0000-0000-0000-000000000005'::uuid, 'demo_ch',     'demo_ch.OWNER',     'Demo Switzerland Owner'),
        ('bb001000-0000-0000-0000-000000000006'::uuid, 'demo_ch',     'demo_ch.ADMIN',     'Demo Switzerland Admin'),
        ('bb001000-0000-0000-0000-000000000007'::uuid, 'demo_de',     'demo_de.OWNER',     'Demo Germany Owner'),
        ('bb001000-0000-0000-0000-000000000008'::uuid, 'demo_de',     'demo_de.ADMIN',     'Demo Germany Admin'),
        ('bb001000-0000-0000-0000-000000000009'::uuid, 'demo_fr',     'demo_fr.OWNER',     'Demo France Owner'),
        ('bb001000-0000-0000-0000-00000000000a'::uuid, 'demo_fr',     'demo_fr.ADMIN',     'Demo France Admin'),
        ('bb001000-0000-0000-0000-00000000000b'::uuid, 'demo_in',     'demo_in.OWNER',     'Demo India Owner'),
        ('bb001000-0000-0000-0000-00000000000c'::uuid, 'demo_in',     'demo_in.ADMIN',     'Demo India Admin'),
        ('bb001000-0000-0000-0000-00000000000d'::uuid, 'demo_my',     'demo_my.OWNER',     'Demo Malaysia Owner'),
        ('bb001000-0000-0000-0000-00000000000e'::uuid, 'demo_my',     'demo_my.ADMIN',     'Demo Malaysia Admin'),
        ('bb001000-0000-0000-0000-00000000000f'::uuid, 'demo_qa',     'demo_qa.OWNER',     'Demo Qatar Owner'),
        ('bb001000-0000-0000-0000-000000000010'::uuid, 'demo_qa',     'demo_qa.ADMIN',     'Demo Qatar Admin'),
        ('bb001000-0000-0000-0000-000000000011'::uuid, 'demo_sa',     'demo_sa.OWNER',     'Demo Saudi Arabia Owner'),
        ('bb001000-0000-0000-0000-000000000012'::uuid, 'demo_sa',     'demo_sa.ADMIN',     'Demo Saudi Arabia Admin'),
        ('bb001000-0000-0000-0000-000000000013'::uuid, 'demo_us',     'demo_us.OWNER',     'Demo United States Owner'),
        ('bb001000-0000-0000-0000-000000000014'::uuid, 'demo_us',     'demo_us.ADMIN',     'Demo United States Admin'),
        ('bb001000-0000-0000-0000-000000000015'::uuid, 'athyper-hq1', 'athyper-hq1.OWNER', 'Athyper HQ 1 Owner'),
        ('bb001000-0000-0000-0000-000000000016'::uuid, 'athyper-hq1', 'athyper-hq1.ADMIN', 'Athyper HQ 1 Admin'),
        ('bb001000-0000-0000-0000-000000000017'::uuid, 'pepsi',       'pepsi.OWNER',       'Pepsi Owner'),
        ('bb001000-0000-0000-0000-000000000018'::uuid, 'pepsi',       'pepsi.ADMIN',       'Pepsi Admin'),
        ('bb001000-0000-0000-0000-000000000019'::uuid, 'coke',        'coke.OWNER',        'Coke Owner'),
        ('bb001000-0000-0000-0000-00000000001a'::uuid, 'coke',        'coke.ADMIN',        'Coke Admin'),
        ('bb001000-0000-0000-0000-00000000001b'::uuid, 'maaza',       'maaza.OWNER',       'Maaza Owner'),
        ('bb001000-0000-0000-0000-00000000001c'::uuid, 'maaza',       'maaza.ADMIN',       'Maaza Admin')
    ) AS v(id, tenant_code, code, name)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal — CC-level principal users (34, all in athyper)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id,
           (SELECT id FROM master.tenant WHERE code = 'athyper' AND realm_key = 'athyper'),
           v.code, v.name,
           'user', false, false, 'internal', 'active', v_su
    FROM (VALUES
        ('bb002000-0000-0000-0000-000000000001'::uuid, 'ACFB.OWNER', 'ACFB Owner'),
        ('bb002000-0000-0000-0000-000000000002'::uuid, 'ACFB.ADMIN', 'ACFB Admin'),
        ('bb002000-0000-0000-0000-000000000003'::uuid, 'ADPM.OWNER', 'ADPM Owner'),
        ('bb002000-0000-0000-0000-000000000004'::uuid, 'ADPM.ADMIN', 'ADPM Admin'),
        ('bb002000-0000-0000-0000-000000000005'::uuid, 'AITM.OWNER', 'AITM Owner'),
        ('bb002000-0000-0000-0000-000000000006'::uuid, 'AITM.ADMIN', 'AITM Admin'),
        ('bb002000-0000-0000-0000-000000000007'::uuid, 'AJED.OWNER', 'AJED Owner'),
        ('bb002000-0000-0000-0000-000000000008'::uuid, 'AJED.ADMIN', 'AJED Admin'),
        ('bb002000-0000-0000-0000-000000000009'::uuid, 'AMRE.OWNER', 'AMRE Owner'),
        ('bb002000-0000-0000-0000-00000000000a'::uuid, 'AMRE.ADMIN', 'AMRE Admin'),
        ('bb002000-0000-0000-0000-00000000000b'::uuid, 'APHS.OWNER', 'APHS Owner'),
        ('bb002000-0000-0000-0000-00000000000c'::uuid, 'APHS.ADMIN', 'APHS Admin'),
        ('bb002000-0000-0000-0000-00000000000d'::uuid, 'AQTS.OWNER', 'AQTS Owner'),
        ('bb002000-0000-0000-0000-00000000000e'::uuid, 'AQTS.ADMIN', 'AQTS Admin'),
        ('bb002000-0000-0000-0000-00000000000f'::uuid, 'AQTU.OWNER', 'AQTU Owner'),
        ('bb002000-0000-0000-0000-000000000010'::uuid, 'AQTU.ADMIN', 'AQTU Admin'),
        ('bb002000-0000-0000-0000-000000000011'::uuid, 'ASAC.OWNER', 'ASAC Owner'),
        ('bb002000-0000-0000-0000-000000000012'::uuid, 'ASAC.ADMIN', 'ASAC Admin'),
        ('bb002000-0000-0000-0000-000000000013'::uuid, 'ASAH.OWNER', 'ASAH Owner'),
        ('bb002000-0000-0000-0000-000000000014'::uuid, 'ASAH.ADMIN', 'ASAH Admin'),
        ('bb002000-0000-0000-0000-000000000015'::uuid, 'ASGF.OWNER', 'ASGF Owner'),
        ('bb002000-0000-0000-0000-000000000016'::uuid, 'ASGF.ADMIN', 'ASGF Admin'),
        ('bb002000-0000-0000-0000-000000000017'::uuid, 'ASPE.OWNER', 'ASPE Owner'),
        ('bb002000-0000-0000-0000-000000000018'::uuid, 'ASPE.ADMIN', 'ASPE Admin'),
        ('bb002000-0000-0000-0000-000000000019'::uuid, 'ATEM.OWNER', 'ATEM Owner'),
        ('bb002000-0000-0000-0000-00000000001a'::uuid, 'ATEM.ADMIN', 'ATEM Admin'),
        ('bb002000-0000-0000-0000-00000000001b'::uuid, 'ATHQ.OWNER', 'ATHQ Owner'),
        ('bb002000-0000-0000-0000-00000000001c'::uuid, 'ATHQ.ADMIN', 'ATHQ Admin'),
        ('bb002000-0000-0000-0000-00000000001d'::uuid, 'AUET.OWNER', 'AUET Owner'),
        ('bb002000-0000-0000-0000-00000000001e'::uuid, 'AUET.ADMIN', 'AUET Admin'),
        ('bb002000-0000-0000-0000-00000000001f'::uuid, 'AUIC.OWNER', 'AUIC Owner'),
        ('bb002000-0000-0000-0000-000000000020'::uuid, 'AUIC.ADMIN', 'AUIC Admin'),
        ('bb002000-0000-0000-0000-000000000021'::uuid, 'AUKA.OWNER', 'AUKA Owner'),
        ('bb002000-0000-0000-0000-000000000022'::uuid, 'AUKA.ADMIN', 'AUKA Admin')
    ) AS v(id, code, name)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: master.principal_profile — all 62 principal users
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        CASE WHEN p.principal_source = 'internal' THEN split_part(p.code, '.', 1) ELSE '' END,
        CASE
            WHEN p.code LIKE '%.OWNER' THEN 'Owner'
            WHEN p.code LIKE '%.ADMIN' THEN 'Admin'
            ELSE '' END,
        p.name,
        p.id,           -- KC UUID = principal UUID
        p.code,         -- KC username = principal code
        'synced',
        v_su
    FROM master.principal p
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
        'bb001000-0000-0000-0000-00000000001c'::uuid,
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
    AND p.principal_source = 'internal'
    ON CONFLICT (tenant_id, principal_id) DO UPDATE
        SET keycloak_sync_status = 'synced',
            updated_at = now();

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: master.principal_identity_binding — all 62 principal users
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    )
    SELECT
        p.tenant_id,
        p.id,
        'keycloak',
        p.id::text,
        p.code,
        'synced', true, true, now(), v_su
    FROM master.principal p
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
        'bb001000-0000-0000-0000-00000000001c'::uuid,
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
    AND p.principal_source = 'internal'
    ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING;

    RAISE NOTICE '[003_principal_users] 62 principal users seeded (28 tenant-level + 34 CC-level)';

END $principal_users$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/900_principals/004_athq_principals.sql
-- ============================================================================
-- ATHQ PRINCIPALS (principal + profile only — NO auth binding)
-- ============================================================================
-- File:     004_athq_principals.sql
-- Schemas:  master.principal, master.principal_profile
-- Purpose:  Pre-seed ATHQ entity users (principal + profile only).
--
-- WHY no auth binding here:
--   principal_identity_binding.subject_id must equal the Keycloak user's UUID
--   (the `sub` JWT claim). For users created manually in Keycloak the UUID
--   is auto-generated and NOT predictable at seed time.
--   The JIT service (jit.service.ts) creates/updates the binding on first
--   login using the real KC sub. Seeding a wrong subject_id here would block
--   JIT from working due to a UNIQUE(tenant_id, principal_id, provider_code)
--   constraint conflict.
--
--   001_demo_principals.sql IS safe to include bindings because those users
--   are created in Keycloak via realm-import with explicit UUIDs that match.
--
-- Depends:  002_demo_tenants.sql
-- Idempotent: Yes — ON CONFLICT DO NOTHING throughout
--
-- Stable UUID series (continuing from 001_demo_principals.sql):
--   aa000015-…001  → athq.agent  (athyper tenant)
-- ============================================================================

DO $athq_principals$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal
    -- Column order: id, tenant_id, code, name, principal_type, is_locked,
    --               is_service_account, principal_source, status, created_by
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    ) VALUES

    -- athyper tenant — ATHQ entity agent user
    ('aa000015-0000-0000-0000-000000000001',
     (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper'),
     'athq.agent', 'ATHQ Agent',
     'user', false, false, 'oidc_jit', 'active', v_su)

    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal_profile
    -- keycloak_id is intentionally left as the placeholder UUID here.
    -- JIT will overwrite it with the real KC sub on first login.
    -- Column order: tenant_id, principal_id, given_name, family_name,
    --               display_name, keycloak_id, keycloak_username,
    --               keycloak_sync_status, created_by
    -- ══════════════════════════════════════════════════════════════════════════

    -- Use a SELECT-based insert to resolve the actual principal UUID at runtime.
    -- The principal may already exist (from 001_demo_principals.sql) with a
    -- different UUID, so hardcoding the UUID here would cause an FK violation.
    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id, p.id,
        'ATHQ', 'Agent', 'ATHQ Agent',
        p.id, 'athq.agent', 'pending', v_su
    FROM master.principal p
    JOIN master.tenant t ON t.id = p.tenant_id
    WHERE t.realm_key = 'athyper' AND t.code = 'athyper' AND p.code = 'athq.agent'
    ON CONFLICT (tenant_id, principal_id) DO NOTHING;

    RAISE NOTICE '[004_athq_principals] ATHQ Agent principal + profile seeded (auth binding created by JIT on first login)';

END $athq_principals$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/900_principals/005_named_tenant_principals.sql
-- ============================================================================
-- NAMED & DEMO TENANT PERSONA USERS — PRINCIPAL + PROFILE + AUTH BINDING
-- ============================================================================
-- File:     005_named_tenant_principals.sql
-- Schemas:  master.principal, master.principal_profile,
--           master.principal_identity_binding
-- Purpose:  Pre-seed persona users so that KC → DB identity resolution works
--           on first login without JIT.
--
-- KEY DESIGN: KC user UUID == DB principal UUID == subject_id in auth binding.
--   These users are imported into KC via realm-demosetup.json with explicit
--   UUIDs that match the values here.
--
-- Series aa000001 — extra athyper/ATHQ users:
--   athyper  athyper--athq  kumar           aa000001-…001
--   athyper  athyper--athq  raja            aa000001-…002
--   athyper  athyper--athq  rama            aa000001-…003
--   athyper  athyper--athq  laks            aa000001-…004
--
-- Series aa000002-aa000014 — named/demo tenant persona users:
--   athyper-hq1  athyper-hq1--athq  siti.aminah   aa000002-…001
--   pepsi        pepsi--pepsi        michael.torres aa000003-…001
--   coke         coke--coke          sarah.johnson  aa000004-…001
--   maaza        maaza--maaza        rahul.gupta    aa000005-…001
--   demo_ca      demo_ca--democa     david.chen     aa000006-…001
--   demo_ch      demo_ch--democh     sophie.mueller aa000007-…001
--   demo_de      demo_de--demode     hans.weber     aa000008-…001
--   demo_fr      demo_fr--demofr     pierre.dupont  aa000009-…001
--   demo_in      demo_in--demoin     priya.sharma   aa000010-…001
--   demo_my      demo_my--demomy     ahmad.razak    aa000011-…001
--   demo_qa      demo_qa--demoqa     khalid.althani aa000012-…001
--   demo_sa      demo_sa--demosa     omar.hassan    aa000013-…001
--   demo_us      demo_us--demous     jennifer.smith aa000014-…001
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $named_tenant_principals$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE A: master.principal
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal (
        id, tenant_id, code, name,
        principal_type, is_locked, is_service_account,
        principal_source, status, created_by
    )
    SELECT v.id, t.id, v.code, v.name,
           'user', false, false, 'oidc_jit', 'active', v_su
    FROM (VALUES
        -- aa000001 series — extra athyper/ATHQ users
        ('aa000001-0000-0000-0000-000000000001'::uuid, 'athyper', 'kumar', 'Kumar Rajan'),
        ('aa000001-0000-0000-0000-000000000002'::uuid, 'athyper', 'raja',  'Raja Krishnan'),
        ('aa000001-0000-0000-0000-000000000003'::uuid, 'athyper', 'rama',  'Rama Subramaniam'),
        ('aa000001-0000-0000-0000-000000000004'::uuid, 'athyper', 'laks',  'Lakshmi Narayanan'),
        -- aa000002-aa000014 series — named/demo tenant persona users
        ('aa000002-0000-0000-0000-000000000001'::uuid, 'athyper-hq1', 'siti.aminah',    'Siti Aminah'),
        ('aa000003-0000-0000-0000-000000000001'::uuid, 'pepsi',       'michael.torres', 'Michael Torres'),
        ('aa000004-0000-0000-0000-000000000001'::uuid, 'coke',        'sarah.johnson',  'Sarah Johnson'),
        ('aa000005-0000-0000-0000-000000000001'::uuid, 'maaza',       'rahul.gupta',    'Rahul Gupta'),
        ('aa000006-0000-0000-0000-000000000001'::uuid, 'demo_ca',     'david.chen',     'David Chen'),
        ('aa000007-0000-0000-0000-000000000001'::uuid, 'demo_ch',     'sophie.mueller', 'Sophie Mueller'),
        ('aa000008-0000-0000-0000-000000000001'::uuid, 'demo_de',     'hans.weber',     'Hans Weber'),
        ('aa000009-0000-0000-0000-000000000001'::uuid, 'demo_fr',     'pierre.dupont',  'Pierre Dupont'),
        ('aa000010-0000-0000-0000-000000000001'::uuid, 'demo_in',     'priya.sharma',   'Priya Sharma'),
        ('aa000011-0000-0000-0000-000000000001'::uuid, 'demo_my',     'ahmad.razak',    'Ahmad Razak'),
        ('aa000012-0000-0000-0000-000000000001'::uuid, 'demo_qa',     'khalid.althani', 'Khalid Al-Thani'),
        ('aa000013-0000-0000-0000-000000000001'::uuid, 'demo_sa',     'omar.hassan',    'Omar Hassan'),
        ('aa000014-0000-0000-0000-000000000001'::uuid, 'demo_us',     'jennifer.smith', 'Jennifer Smith')
    ) AS v(id, tenant_code, code, name)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[005_named_tenant_principals] Stage A: 17 principals seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE B: master.principal_profile
    -- keycloak_id = principal UUID (matches KC import UUID in realm-demosetup.json)
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_profile (
        tenant_id, principal_id,
        given_name, family_name, display_name,
        keycloak_id, keycloak_username, keycloak_sync_status,
        created_by
    )
    SELECT
        p.tenant_id, p.id,
        v.given_name, v.family_name, p.name,
        p.id,       -- KC UUID = principal UUID
        p.code,     -- KC username = principal code
        'synced',
        v_su
    FROM (VALUES
        -- aa000001 series
        ('aa000001-0000-0000-0000-000000000001'::uuid, 'Kumar',    'Rajan'),
        ('aa000001-0000-0000-0000-000000000002'::uuid, 'Raja',     'Krishnan'),
        ('aa000001-0000-0000-0000-000000000003'::uuid, 'Rama',     'Subramaniam'),
        ('aa000001-0000-0000-0000-000000000004'::uuid, 'Lakshmi',  'Narayanan'),
        -- aa000002-aa000014 series
        ('aa000002-0000-0000-0000-000000000001'::uuid, 'Siti',     'Aminah'),
        ('aa000003-0000-0000-0000-000000000001'::uuid, 'Michael',  'Torres'),
        ('aa000004-0000-0000-0000-000000000001'::uuid, 'Sarah',    'Johnson'),
        ('aa000005-0000-0000-0000-000000000001'::uuid, 'Rahul',    'Gupta'),
        ('aa000006-0000-0000-0000-000000000001'::uuid, 'David',    'Chen'),
        ('aa000007-0000-0000-0000-000000000001'::uuid, 'Sophie',   'Mueller'),
        ('aa000008-0000-0000-0000-000000000001'::uuid, 'Hans',     'Weber'),
        ('aa000009-0000-0000-0000-000000000001'::uuid, 'Pierre',   'Dupont'),
        ('aa000010-0000-0000-0000-000000000001'::uuid, 'Priya',    'Sharma'),
        ('aa000011-0000-0000-0000-000000000001'::uuid, 'Ahmad',    'Razak'),
        ('aa000012-0000-0000-0000-000000000001'::uuid, 'Khalid',   'Al-Thani'),
        ('aa000013-0000-0000-0000-000000000001'::uuid, 'Omar',     'Hassan'),
        ('aa000014-0000-0000-0000-000000000001'::uuid, 'Jennifer', 'Smith')
    ) AS v(principal_id, given_name, family_name)
    JOIN master.principal p ON p.id = v.principal_id
    ON CONFLICT (tenant_id, principal_id) DO UPDATE
        SET given_name           = EXCLUDED.given_name,
            family_name          = EXCLUDED.family_name,
            display_name         = EXCLUDED.display_name,
            keycloak_id          = EXCLUDED.keycloak_id,
            keycloak_username    = EXCLUDED.keycloak_username,
            keycloak_sync_status = EXCLUDED.keycloak_sync_status;

    RAISE NOTICE '[005_named_tenant_principals] Stage B: 17 principal profiles seeded';

    -- ══════════════════════════════════════════════════════════════════════════
    -- STAGE C: master.principal_identity_binding
    -- provider_code = 'keycloak', subject_id = KC UUID (= principal.id)
    -- ══════════════════════════════════════════════════════════════════════════

    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    )
    SELECT
        p.tenant_id, p.id,
        'keycloak',
        p.id::text,
        p.code,
        'synced', true, true, now(), v_su
    FROM master.principal p
    WHERE p.id IN (
        'aa000001-0000-0000-0000-000000000001'::uuid,
        'aa000001-0000-0000-0000-000000000002'::uuid,
        'aa000001-0000-0000-0000-000000000003'::uuid,
        'aa000001-0000-0000-0000-000000000004'::uuid,
        'aa000002-0000-0000-0000-000000000001'::uuid,
        'aa000003-0000-0000-0000-000000000001'::uuid,
        'aa000004-0000-0000-0000-000000000001'::uuid,
        'aa000005-0000-0000-0000-000000000001'::uuid,
        'aa000006-0000-0000-0000-000000000001'::uuid,
        'aa000007-0000-0000-0000-000000000001'::uuid,
        'aa000008-0000-0000-0000-000000000001'::uuid,
        'aa000009-0000-0000-0000-000000000001'::uuid,
        'aa000010-0000-0000-0000-000000000001'::uuid,
        'aa000011-0000-0000-0000-000000000001'::uuid,
        'aa000012-0000-0000-0000-000000000001'::uuid,
        'aa000013-0000-0000-0000-000000000001'::uuid,
        'aa000014-0000-0000-0000-000000000001'::uuid
    )
    ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING;

    RAISE NOTICE '[005_named_tenant_principals] Stage C: 17 auth bindings seeded';
    RAISE NOTICE '[005_named_tenant_principals] Complete — 17 persona users ready (4 athyper/ATHQ + 13 named/demo tenant)';

END $named_tenant_principals$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/950_rbac/001_demo_rbac.sql
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
-- Tenant-level groups: 14 tenants × 2 = 28 groups
-- CC-level groups (athyper only): 17 CCs × 2 = 34 groups
-- Total: 62 groups
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
        ('athyper',     'ATHYPER-OWNER',     'Athyper Group Owner',          'Full operational control for Athyper Group. Assigned all owner-* roles.'),
        ('athyper',     'ATHYPER-ADMIN',     'Athyper Group Administrator',  'Administrative access for Athyper Group. Assigned all admin-* roles.'),
        -- demo_ca
        ('demo_ca',     'DEMO_CA-OWNER',     'Demo Canada Owner',            'Full operational control for Demo Canada.'),
        ('demo_ca',     'DEMO_CA-ADMIN',     'Demo Canada Administrator',    'Administrative access for Demo Canada.'),
        -- demo_ch
        ('demo_ch',     'DEMO_CH-OWNER',     'Demo Switzerland Owner',       'Full operational control for Demo Switzerland.'),
        ('demo_ch',     'DEMO_CH-ADMIN',     'Demo Switzerland Administrator','Administrative access for Demo Switzerland.'),
        -- demo_de
        ('demo_de',     'DEMO_DE-OWNER',     'Demo Germany Owner',           'Full operational control for Demo Germany.'),
        ('demo_de',     'DEMO_DE-ADMIN',     'Demo Germany Administrator',   'Administrative access for Demo Germany.'),
        -- demo_fr
        ('demo_fr',     'DEMO_FR-OWNER',     'Demo France Owner',            'Full operational control for Demo France.'),
        ('demo_fr',     'DEMO_FR-ADMIN',     'Demo France Administrator',    'Administrative access for Demo France.'),
        -- demo_in
        ('demo_in',     'DEMO_IN-OWNER',     'Demo India Owner',             'Full operational control for Demo India.'),
        ('demo_in',     'DEMO_IN-ADMIN',     'Demo India Administrator',     'Administrative access for Demo India.'),
        -- demo_my
        ('demo_my',     'DEMO_MY-OWNER',     'Demo Malaysia Owner',          'Full operational control for Demo Malaysia.'),
        ('demo_my',     'DEMO_MY-ADMIN',     'Demo Malaysia Administrator',  'Administrative access for Demo Malaysia.'),
        -- demo_qa
        ('demo_qa',     'DEMO_QA-OWNER',     'Demo Qatar Owner',             'Full operational control for Demo Qatar.'),
        ('demo_qa',     'DEMO_QA-ADMIN',     'Demo Qatar Administrator',     'Administrative access for Demo Qatar.'),
        -- demo_sa
        ('demo_sa',     'DEMO_SA-OWNER',     'Demo Saudi Arabia Owner',      'Full operational control for Demo Saudi Arabia.'),
        ('demo_sa',     'DEMO_SA-ADMIN',     'Demo Saudi Arabia Administrator','Administrative access for Demo Saudi Arabia.'),
        -- demo_us
        ('demo_us',     'DEMO_US-OWNER',     'Demo United States Owner',     'Full operational control for Demo United States.'),
        ('demo_us',     'DEMO_US-ADMIN',     'Demo United States Administrator','Administrative access for Demo United States.'),
        -- athyper-hq1
        ('athyper-hq1', 'ATHYPER_HQ1-OWNER', 'Athyper HQ 1 Owner',          'Full operational control for Athyper HQ 1.'),
        ('athyper-hq1', 'ATHYPER_HQ1-ADMIN', 'Athyper HQ 1 Administrator',  'Administrative access for Athyper HQ 1.'),
        -- pepsi
        ('pepsi',       'PEPSI-OWNER',       'Pepsi Owner',                  'Full operational control for Pepsi.'),
        ('pepsi',       'PEPSI-ADMIN',       'Pepsi Administrator',          'Administrative access for Pepsi.'),
        -- coke
        ('coke',        'COKE-OWNER',        'Coke Owner',                   'Full operational control for Coke.'),
        ('coke',        'COKE-ADMIN',        'Coke Administrator',           'Administrative access for Coke.'),
        -- maaza
        ('maaza',       'MAAZA-OWNER',       'Maaza Owner',                  'Full operational control for Maaza.'),
        ('maaza',       'MAAZA-ADMIN',       'Maaza Administrator',          'Administrative access for Maaza.')
    ) AS v(tenant_code, grp_code, grp_name, grp_desc)
    JOIN master.tenant t ON t.code = v.tenant_code AND t.realm_key = 'athyper'
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[001_demo_rbac] Step 1 complete — 28 tenant-level groups created';

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
    RAISE NOTICE '  Total groups:              %   (expected 62)', v_groups;
    RAISE NOTICE '  OWNER group role links:    %', v_agr_owner;
    RAISE NOTICE '  ADMIN group role links:    %', v_agr_admin;
END $verify$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/950_rbac/002_demo_group_members.sql
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
-- Tier 1 — Principal system users (62 users from 003_principal_users.sql):
--   Each *.OWNER user → their tenant/CC OWNER group
--   Each *.ADMIN user → their tenant/CC ADMIN group
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
 
    -- ── Step 1: Assign principal system users (tenant-level, 28 users) ───────
    --
    -- *.OWNER  → <TENANT_CODE_UPPER>-OWNER group in their tenant
    -- *.ADMIN  → <TENANT_CODE_UPPER>-ADMIN group in their tenant
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
 
    RAISE NOTICE '[002_demo_auth_group_members] Step 1 complete — 28 tenant-level principal users assigned';
 
    -- ── Step 2: Assign CC-level principals (athyper, 34 users) ───────────────
    --
    -- <CC>.OWNER → <CC>-OWNER group
    -- <CC>.ADMIN → <CC>-ADMIN group
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
 
    RAISE NOTICE '[002_demo_auth_group_members] Step 2 complete — 34 CC-level principals assigned';
 
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
 
    -- ── Step 4: Assign named/demo tenant persona users to their ADMIN groups ────
    --
    -- One persona user per tenant (from 005_named_tenant_principals.sql).
    -- Each is assigned to the ADMIN group of their own tenant.
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
    JOIN master.auth_group pg
        ON pg.tenant_id = t.id AND pg.code = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;
 
    RAISE NOTICE '[002_demo_auth_group_members] Step 4 complete — 13 named/demo tenant persona users assigned';
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
-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/entity_engine/010_entity_policies.sql
-- 030_tenant/entity_engine/010_entity_policies.sql
-- Seeds control.entity_policy rows for the Athyper blueprint tenant.
-- entity_policy is globally unique per entity (UNIQUE on entity_id, entity_version_id)
-- so this file seeds system-level policies owned by the Athyper tenant.
-- Idempotent: ON CONFLICT (entity_id, entity_version_id) DO NOTHING
-- Run AFTER: 010_system/entity_engine/020_entities/*.sql + 030_tenant/000_tenant/000_athyper_tenant.sql

DO $$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    cnt         int  := 0;
    r           record;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE code = 'athyper';
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Athyper tenant not found — run 030_tenant/000_tenant/000_athyper_tenant.sql first';
    END IF;

    -- ── Seed one entity_policy per master.* entity using defaults ────────────
    -- access_mode    : 'default_deny'   — safe default; tenants override per entity
    -- audit_mode     : 'enabled'        — full audit trail for all entities
    -- company_scope  : 'none'           — no company-code scoping by default
    -- Highly sensitive entities get audit_mode='enabled'; LOG/RELATION entities get 'disabled'
    FOR r IN
        SELECT e.id AS entity_id, e.entity_class
        FROM   control.entity e
        WHERE  e.table_schema = 'master'
          AND  e.ownership_model = 'system'
          AND  NOT EXISTS (
              SELECT 1 FROM control.entity_policy ep
              WHERE  ep.entity_id = e.id AND ep.entity_version_id IS NULL
          )
        ORDER BY e.name
    LOOP
        INSERT INTO control.entity_policy (
            tenant_id, entity_id, entity_version_id,
            access_mode, company_scope_mode, audit_mode,
            retention_policy, default_filters, cache_flags,
            created_by
        ) VALUES (
            v_tenant_id,
            r.entity_id,
            NULL,  -- applies to all versions
            'default_deny',
            CASE r.entity_class
                WHEN 'DOCUMENT' THEN 'single'  -- documents are company-code scoped
                WHEN 'LOG'      THEN 'single'
                ELSE 'none'
            END,
            CASE r.entity_class
                WHEN 'LOG'      THEN 'sampling'  -- logs use sampling to reduce noise
                WHEN 'RELATION' THEN 'disabled'  -- pure join tables skip audit
                ELSE 'enabled'
            END,
            '{}',  -- retention_policy: no expiry by default
            '{}',  -- default_filters:  no static filters
            '{}',  -- cache_flags:      no caching hints
            v_su
        );
        cnt := cnt + 1;
    END LOOP;

    RAISE NOTICE 'control.entity_policy: % rows inserted for tenant %', cnt, v_tenant_id;
END $$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/030_tenant/entity_engine/020_field_security_policies.sql
-- 030_tenant/entity_engine/020_field_security_policies.sql
-- Seeds PII/masking policies for known sensitive canonical and entity fields.
-- Covers: tax_id, national_id, iban, account_no, email, phone, date_of_birth, salary.
-- Idempotent: checked via existence test (no single unique key across all columns).
-- Run AFTER: 030_tenant/000_tenant/000_athyper_tenant.sql + system entity registration.

DO $$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    cnt         int  := 0;

    -- Entity IDs (resolved by name)
    v_eid_principal          uuid;
    v_eid_employee           uuid;
    v_eid_customer           uuid;
    v_eid_supplier           uuid;
    v_eid_contact_email      uuid;
    v_eid_contact_phone      uuid;
    v_eid_bank_account       uuid;
    v_eid_bank_party         uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM master.tenant WHERE code = 'athyper';
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Athyper tenant not found — run 030_tenant/000_tenant/000_athyper_tenant.sql first';
    END IF;

    -- Resolve entity IDs
    SELECT id INTO v_eid_principal     FROM control.entity WHERE name = 'principal'     AND table_schema = 'master';
    SELECT id INTO v_eid_employee      FROM control.entity WHERE name = 'employee'      AND table_schema = 'master';
    SELECT id INTO v_eid_customer      FROM control.entity WHERE name = 'customer'      AND table_schema = 'master';
    SELECT id INTO v_eid_supplier      FROM control.entity WHERE name = 'supplier'      AND table_schema = 'master';
    SELECT id INTO v_eid_contact_email FROM control.entity WHERE name = 'contact_email' AND table_schema = 'master';
    SELECT id INTO v_eid_contact_phone FROM control.entity WHERE name = 'contact_phone' AND table_schema = 'master';
    SELECT id INTO v_eid_bank_account  FROM control.entity WHERE name = 'bank_account'  AND table_schema = 'master';
    SELECT id INTO v_eid_bank_party    FROM control.entity WHERE name = 'bank_party'    AND table_schema = 'master';

    -- ── Helper: only insert if not already seeded ─────────────────────────────
    -- (no single unique key; guard by counting matching rows)

    -- ── principal: email / phone ──────────────────────────────────────────────
    IF v_eid_principal IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_principal AND field_path = 'email' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_principal, 'email',         'mask', 'partial',  'direct',           100, v_su),
            (v_tenant_id, v_eid_principal, 'phone',         'mask', 'partial',  'direct',           100, v_su),
            (v_tenant_id, v_eid_principal, 'date_of_birth', 'mask', 'null',     'quasi',            100, v_su),
            (v_tenant_id, v_eid_principal, 'national_id',   'mask', 'hash',     'sensitive',        100, v_su);
        cnt := cnt + 4;
    END IF;

    -- ── employee: salary / national_id / date_of_birth ───────────────────────
    IF v_eid_employee IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_employee AND field_path = 'national_id' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_employee, 'national_id',   'mask', 'hash',     'sensitive',        100, v_su),
            (v_tenant_id, v_eid_employee, 'date_of_birth', 'mask', 'null',     'quasi',            100, v_su),
            (v_tenant_id, v_eid_employee, 'salary',        'mask', 'null',     'special_category', 100, v_su),
            (v_tenant_id, v_eid_employee, 'tax_id',        'mask', 'hash',     'sensitive',        100, v_su);
        cnt := cnt + 4;
    END IF;

    -- ── customer / supplier: tax_id ───────────────────────────────────────────
    IF v_eid_customer IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_customer AND field_path = 'tax_id' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_customer, 'tax_id', 'mask', 'hash', 'sensitive', 100, v_su);
        cnt := cnt + 1;
    END IF;

    IF v_eid_supplier IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_supplier AND field_path = 'tax_id' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_supplier, 'tax_id', 'mask', 'hash', 'sensitive', 100, v_su);
        cnt := cnt + 1;
    END IF;

    -- ── contact_email: email_address ──────────────────────────────────────────
    IF v_eid_contact_email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_contact_email AND field_path = 'email_address' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_contact_email, 'email_address', 'mask', 'partial', 'direct', 100, v_su);
        cnt := cnt + 1;
    END IF;

    -- ── contact_phone: phone_number ───────────────────────────────────────────
    IF v_eid_contact_phone IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_contact_phone AND field_path = 'phone_number' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_contact_phone, 'phone_number', 'mask', 'partial', 'direct', 100, v_su);
        cnt := cnt + 1;
    END IF;

    -- ── bank_account: iban / account_number ───────────────────────────────────
    IF v_eid_bank_account IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_bank_account AND field_path = 'iban' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_bank_account, 'iban',           'mask', 'partial', 'sensitive', 100, v_su),
            (v_tenant_id, v_eid_bank_account, 'account_number', 'mask', 'partial', 'sensitive', 100, v_su);
        cnt := cnt + 2;
    END IF;

    RAISE NOTICE 'control.field_security_policy: % rows inserted for tenant %', cnt, v_tenant_id;
END $$;

