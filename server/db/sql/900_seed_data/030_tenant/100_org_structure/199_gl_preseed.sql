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
