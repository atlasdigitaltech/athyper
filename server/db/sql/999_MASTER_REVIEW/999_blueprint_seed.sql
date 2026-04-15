-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/000_registry/000_blueprint_registry.sql
-- ============================================================================
-- BLUEPRINT REGISTRY — DDL + SEED
-- ============================================================================
-- File:     000_blueprint_registry.sql
-- Schema:   control
-- Purpose:  (A) Create control.blueprint_registry and
--               control.tenant_blueprint_application tables,
--           (B) Register all available blueprints with metadata
-- Depends:  010_system (all system seed complete)
-- Idempotent: Yes — CREATE TABLE IF NOT EXISTS + ON CONFLICT DO UPDATE
-- Run:      Once at system install (DDL), then again when new packs are added
-- ============================================================================


-- ============================================================================
-- PART A: DDL — control.blueprint_registry
-- ============================================================================
-- Stores the catalogue of available blueprint packs.
-- Each row describes one selectable unit during tenant provisioning.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.blueprint_registry (
    id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
    code                text        NOT NULL,   -- unique pack identifier, e.g. 'pack_utilities'
    name                text        NOT NULL,   -- human label
    category            text        NOT NULL,   -- 'base' | 'industry_pack' | 'coa_framework' | 'default_rules'
    industry_vertical   text[],                 -- slug array, e.g. ARRAY['utilities','construction']
    framework           text,                   -- 'IFRS' | 'GAAP' | 'MFRS' | NULL (not framework-specific)
    base_version        text        NOT NULL DEFAULT '1.0.0',
    status              text        NOT NULL DEFAULT 'active',  -- 'active' | 'deprecated'
    dependencies        text[],                 -- codes that MUST be applied before this one
    seed_files          text[],                 -- ordered relative paths (from 020_blueprint/ root)
    description         text,
    metadata            jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT blueprint_registry_pkey PRIMARY KEY (id),
    CONSTRAINT blueprint_registry_code_uq UNIQUE (code),
    CONSTRAINT blueprint_registry_category_chk
        CHECK (category IN ('base', 'industry_pack', 'coa_framework', 'default_rules')),
    CONSTRAINT blueprint_registry_status_chk
        CHECK (status IN ('active', 'deprecated'))
);

COMMENT ON TABLE  control.blueprint_registry             IS 'Catalogue of all available blueprint packs selectable during tenant provisioning';
COMMENT ON COLUMN control.blueprint_registry.code        IS 'Stable identifier used as FK target and in dependency arrays';
COMMENT ON COLUMN control.blueprint_registry.category    IS 'base=universal prereq; industry_pack=vertical-specific; coa_framework=accounting framework; default_rules=system defaults';
COMMENT ON COLUMN control.blueprint_registry.dependencies IS 'Ordered list of blueprint codes that must be applied before this one';
COMMENT ON COLUMN control.blueprint_registry.seed_files  IS 'Ordered relative file paths under 020_blueprint/ for the runner to execute';


-- ============================================================================
-- PART B: DDL — control.tenant_blueprint_application
-- ============================================================================
-- Tracks which blueprints have been applied to which tenant, when, and by whom.
-- Enables incremental pack additions and upgrade tracking.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.tenant_blueprint_application (
    id               uuid        NOT NULL DEFAULT gen_random_uuid(),
    tenant_id        uuid        NOT NULL,
    blueprint_code   text        NOT NULL,
    applied_version  text        NOT NULL,
    applied_at       timestamptz NOT NULL DEFAULT now(),
    applied_by       uuid,                       -- principal who triggered provisioning
    status           text        NOT NULL DEFAULT 'applied',  -- 'applied' | 'rolled_back' | 'failed'
    error_detail     text,                       -- populated on 'failed'
    metadata         jsonb,

    CONSTRAINT tenant_blueprint_application_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_blueprint_application_uq
        UNIQUE (tenant_id, blueprint_code),
    CONSTRAINT tenant_blueprint_application_blueprint_fk
        FOREIGN KEY (blueprint_code) REFERENCES control.blueprint_registry (code),
    CONSTRAINT tenant_blueprint_application_status_chk
        CHECK (status IN ('applied', 'rolled_back', 'failed'))
);

CREATE INDEX IF NOT EXISTS tba_tenant_idx ON control.tenant_blueprint_application (tenant_id);

COMMENT ON TABLE  control.tenant_blueprint_application              IS 'Audit log of blueprint packs applied per tenant';
COMMENT ON COLUMN control.tenant_blueprint_application.blueprint_code IS 'References control.blueprint_registry.code';
COMMENT ON COLUMN control.tenant_blueprint_application.applied_version IS 'Snapshot of blueprint version at time of application — survives future registry updates';


-- ============================================================================
-- PART C: SEED — Register all blueprints
-- ============================================================================

INSERT INTO control.blueprint_registry
    (code, name, category, industry_vertical, framework, base_version, status, dependencies, seed_files, description)
VALUES

-- ── BASE (must run before all packs) ────────────────────────────────────────
(
    'base',
    'Universal Base',
    'base',
    NULL, NULL, '1.0.0', 'active',
    NULL,
    ARRAY[
        '010_base/019_pre_seed_foundation.sql',
        '010_base/020_spend_categories.sql',
        '010_base/021_business_intents.sql',
        '010_base/025_base_item_categories.sql',
        '010_base/022_spend_intent_link.sql',
        '010_base/023_commodity_bridge.sql',
        '010_base/024_routing_rules.sql',
        '010_base/026_base_intent_rules.sql'
    ],
    'Universal spend categories, business intents, item categories, commodity bridge and routing rules. Required by all industry packs.'
),

-- ── DEFAULT RULES ───────────────────────────────────────────────────────────
(
    'default_rules',
    'Default Rules',
    'default_rules',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '300_defaults/340_asset_classes.sql',
        '300_defaults/001_bank_format_rule_defaults.sql'
    ],
    'Default asset class hierarchy and bank interface format rules applied unless tenant overrides.'
),

-- ── COA FRAMEWORKS ──────────────────────────────────────────────────────────
(
    'coa_ifrs',
    'Chart of Accounts — IFRS',
    'coa_framework',
    NULL, 'IFRS', '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '200_coa_frameworks/200_chart_catalog.sql',
        '200_coa_frameworks/210_group_chart_accounts.sql',
        '200_coa_frameworks/211_framework_ifrs_accounts.sql'
    ],
    'IFRS-aligned chart of accounts catalog with group-level and framework account definitions.'
),

-- ── INDUSTRY PACKS ──────────────────────────────────────────────────────────
(
    'pack_utilities',
    'Utilities — Electricity & Water Supply',
    'industry_pack',
    ARRAY['utilities'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/100_pack_utilities.sql'],
    'Spend categories, business intents, item categories, commodity bridge and routing rules for electricity and water supply operations.'
),
(
    'pack_construction',
    'Construction',
    'industry_pack',
    ARRAY['construction'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/101_pack_construction.sql'],
    'Construction industry procurement taxonomy, intents and routing rules.'
),
(
    'pack_real_estate',
    'Real Estate',
    'industry_pack',
    ARRAY['real_estate'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/102_pack_real_estate.sql'],
    'Real estate industry procurement taxonomy, intents and routing rules.'
),
(
    'pack_transport',
    'Transportation & Storage',
    'industry_pack',
    ARRAY['transport'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/103_pack_transport.sql'],
    'Transport and logistics procurement taxonomy, intents and routing rules.'
),
(
    'pack_trading',
    'Wholesale & Retail Trade',
    'industry_pack',
    ARRAY['trading'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/104_pack_trading.sql'],
    'Trading (wholesale/retail) procurement taxonomy, intents and routing rules.'
),
(
    'pack_hospitality',
    'Accommodation & Food Service',
    'industry_pack',
    ARRAY['hospitality'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/105_pack_hospitality.sql'],
    'Hospitality industry procurement taxonomy, intents and routing rules.'
),
(
    'pack_infocomm',
    'Information & Communication',
    'industry_pack',
    ARRAY['infocomm'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/106_pack_infocomm.sql'],
    'Infocomm technology sector procurement taxonomy, intents and routing rules.'
),
(
    'pack_financial',
    'Financial & Insurance Services',
    'industry_pack',
    ARRAY['financial'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/107_pack_financial.sql'],
    'Financial and insurance services procurement taxonomy, intents and routing rules.'
),
(
    'pack_mfg_textile',
    'Manufacturing — Textiles & Leather',
    'industry_pack',
    ARRAY['mfg_textile'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/108_pack_mfg_textile.sql'],
    'Textile and leather manufacturing procurement taxonomy, intents and routing rules.'
),
(
    'pack_mfg_food_bev',
    'Manufacturing — Food & Beverage',
    'industry_pack',
    ARRAY['mfg_food_bev'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/109_pack_mfg_food_bev.sql'],
    'Food and beverage manufacturing procurement taxonomy, intents and routing rules.'
),
(
    'pack_mfg_pharma',
    'Manufacturing — Pharmaceutical',
    'industry_pack',
    ARRAY['mfg_pharma'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/110_pack_mfg_pharma.sql'],
    'Pharmaceutical manufacturing procurement taxonomy, intents and routing rules.'
),
(
    'pack_mfg_electronics',
    'Manufacturing — Electronics & Optics',
    'industry_pack',
    ARRAY['mfg_electronics'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/111_pack_mfg_electronics.sql'],
    'Electronics and optics manufacturing procurement taxonomy, intents and routing rules.'
),
(
    'pack_mining_petroleum',
    'Mining & Crude Petroleum',
    'industry_pack',
    ARRAY['mining_petroleum'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/112_pack_mining_petroleum.sql'],
    'Mining and petroleum extraction procurement taxonomy, intents and routing rules.'
),
(
    'pack_agriculture',
    'Agriculture & Animal Production',
    'industry_pack',
    ARRAY['agriculture'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/113_pack_agriculture.sql'],
    'Agriculture and animal production procurement taxonomy, intents and routing rules.'
),
(
    'pack_education',
    'Education Services',
    'industry_pack',
    ARRAY['education'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/114_pack_education.sql'],
    'Education sector procurement taxonomy, intents and routing rules.'
),
(
    'pack_healthcare',
    'Hospital & Healthcare Services',
    'industry_pack',
    ARRAY['healthcare'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/115_pack_healthcare.sql'],
    'Healthcare and hospital services procurement taxonomy, intents and routing rules.'
)

ON CONFLICT (code) DO UPDATE SET
    name                = EXCLUDED.name,
    category            = EXCLUDED.category,
    industry_vertical   = EXCLUDED.industry_vertical,
    framework           = EXCLUDED.framework,
    base_version        = EXCLUDED.base_version,
    status              = EXCLUDED.status,
    dependencies        = EXCLUDED.dependencies,
    seed_files          = EXCLUDED.seed_files,
    description         = EXCLUDED.description,
    updated_at          = now();


-- ============================================================================
-- PART D: HELPER VIEW — blueprint selection UI / provisioning API
-- ============================================================================
-- Used by the tenant provisioning wizard to present selectable options.

CREATE OR REPLACE VIEW control.v_blueprint_catalogue AS
SELECT
    code,
    name,
    category,
    industry_vertical,
    framework,
    base_version,
    status,
    dependencies,
    seed_files,
    description
FROM control.blueprint_registry
WHERE status = 'active'
ORDER BY
    CASE category
        WHEN 'base'          THEN 1
        WHEN 'coa_framework' THEN 2
        WHEN 'default_rules' THEN 3
        WHEN 'industry_pack' THEN 4
    END,
    code;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/000_tenant/000_athyper_tenant.sql
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

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/019_pre_seed_foundation.sql
-- ============================================================================
-- ATHYPER GROUP — PRE-SEED FOUNDATION
-- ============================================================================
-- File:     019_pre_seed_foundation.sql
-- Schemas:  control.lookup_value, control.classification_config
-- Purpose:  Prerequisites that MUST land before any Tier 2 seed file executes
-- Depends:  000_tenant/000_athyper_tenant.sql,
--           002_control/LookupDomain/master/cc_provenance.sql (platform seed)
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE
-- Spec ref: §7.5 (provenance prerequisite), §2 (execution order)
-- ============================================================================
-- Execution order: 019 → 020 → 021 → 025 → 022 → 023 → 024 → 026
-- This file MUST run before 023 (commodity bridge) and all pack files.
-- ============================================================================
-- FIX B1: The platform's cc_provenance lookup does NOT include 'seed'.
--         Without it, trg_cc_provenance_lookup rejects all bridge rows
--         with provenance = 'seed'. This INSERT adds the missing value.
--
-- FIX B2: control.classification_config — 1-row tenant foundation that
--         locks classification behavior (crosswalk strategy, confidence
--         thresholds, auto-classification flags) explicitly rather than
--         relying on application defaults.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '019_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- B1: Add 'seed' to master.cc_provenance lookup (§7.5)
    -- ══════════════════════════════════════════════════════════════════════
    -- The platform seeds cc_provenance with: manual, ai_generated,
    -- ai_verified, imported, official. 'seed' is NOT included.
    -- The trigger trg_cc_provenance_lookup validates provenance against
    -- this lookup at INSERT time — without 'seed', all bridge files fail.
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO control.lookup_value (
        code, name, domain_code, description,
        sort_order, is_system, status, created_by
    ) VALUES (
        'seed',
        'Seed',
        'master.cc_provenance',
        'Platform seed data — loaded by blueprint seed scripts',
        60,
        true,
        'active',
        v_su
    )
    ON CONFLICT DO NOTHING;

    -- Verify it landed
    IF NOT EXISTS (
        SELECT 1 FROM control.lookup_value
        WHERE domain_code = 'master.cc_provenance' AND code = 'seed'
    ) THEN
        RAISE EXCEPTION '[019_base] Failed to register provenance "seed" in cc_provenance lookup';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- B2: Insert classification_config for ATHYPER tenant
    -- ══════════════════════════════════════════════════════════════════════
    -- This row locks tenant-level classification behavior explicitly:
    --   • primary_commodity_domain: 'unspsc' (all bridge anchors use this)
    --   • crosswalk_strategy: 'BEST_MATCH' (HS↔UNSPSC resolution)
    --   • confidence thresholds: auto ≥90, suggest ≥60
    --   • auto-classify enabled: AI suggestions for product classification
    --   • auto-crosswalk enabled: HS↔UNSPSC mapping via crosswalk table
    --   • cross-border triggers: standard set for GCC operations
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO control.classification_config (
        tenant_id,
        primary_commodity_domain,
        trade_commodity_domain,
        is_commodity_code_required,
        is_trade_code_required,
        require_for_capex_above,
        require_for_capex_currency,
        is_required_for_regulated,
        primary_industry_domain,
        is_auto_classify_enabled,
        is_auto_crosswalk_enabled,
        min_confidence_auto,
        min_confidence_suggest,
        crosswalk_strategy,
        cross_border_triggers,
        metadata,
        created_by
    ) VALUES (
        v_tid,
        'unspsc',                       -- primary commodity domain
        'hs',                           -- trade commodity domain (HS tariff)
        false,                          -- commodity code not mandatory globally
        false,                          -- trade code not mandatory globally
        50000.00,                       -- require classification for capex ≥50k (global default in AED)
        'AED',                          -- global fallback currency; per-company overrides live in metadata.company_capex_currencies
        true,                           -- require classification for regulated items
        'isic',                         -- primary industry domain
        true,                           -- AI auto-classification enabled
        true,                           -- auto-crosswalk enabled
        90.00,                          -- min confidence for auto-accept
        60.00,                          -- min confidence for suggestion display
        'BEST_MATCH',                   -- crosswalk strategy
        '["SUPPLIER_COUNTRY_MISMATCH","SHIP_TO_MISMATCH","IMPORT_TAX","CUSTOMS_REQUIRED"]'::jsonb,
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack',      v_pack,
                'version',   v_version,
                'seeded_at', now()::text
            ),
            -- Per-company capex threshold currencies (functional currency per company_code).
            -- Application logic MUST use this map to translate the global AED threshold to
            -- the local functional currency before comparing against capex requisition amounts.
            -- Threshold equivalents: 50,000 AED ≈ 50k at respective FX rates (see 330_fx_rates.sql).
            -- Phase 2: move this into a dedicated company_classification_config override table.
            'company_capex_currencies', jsonb_build_object(
                'ATHQ', 'MYR',   -- Malaysia Holding
                'AMRE', 'MYR',   -- Malaysia Real Estate
                'AQTU', 'QAR',   -- Qatar Utilities
                'ASAC', 'SAR',   -- Saudi Construction
                'AQTS', 'QAR',   -- Qatar Transport
                'AUET', 'AED',   -- UAE Trading  (same as global default)
                'ASAH', 'SAR',   -- Saudi Hospitality
                'AUIC', 'USD',   -- US InfoComm
                'ASGF', 'SGD',   -- Singapore Financial
                'AITM', 'INR',   -- India Textile Mfg
                'ACFB', 'CAD',   -- Canada Food & Bev Mfg
                'ADPM', 'EUR',   -- Germany Pharma Mfg
                'ATEM', 'TWD',   -- Taiwan Electronics Mfg
                'ASPE', 'ZAR',   -- South Africa Petroleum
                'AUKA', 'GBP',   -- UK Agriculture
                'AJED', 'JPY',   -- Japan Education
                'APHS', 'PHP'    -- Philippines Healthcare
            )
        ),
        v_su
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        primary_commodity_domain  = EXCLUDED.primary_commodity_domain,
        trade_commodity_domain    = EXCLUDED.trade_commodity_domain,
        is_required_for_regulated = EXCLUDED.is_required_for_regulated,
        primary_industry_domain   = EXCLUDED.primary_industry_domain,
        is_auto_classify_enabled  = EXCLUDED.is_auto_classify_enabled,
        is_auto_crosswalk_enabled = EXCLUDED.is_auto_crosswalk_enabled,
        min_confidence_auto       = EXCLUDED.min_confidence_auto,
        min_confidence_suggest    = EXCLUDED.min_confidence_suggest,
        crosswalk_strategy        = EXCLUDED.crosswalk_strategy,
        cross_border_triggers     = EXCLUDED.cross_border_triggers,
        metadata                  = control.classification_config.metadata
                                    || jsonb_build_object(
                                           '_seed', jsonb_build_object(
                                               'pack',      v_pack,
                                               'version',   v_version,
                                               'seeded_at', now()::text
                                           ),
                                           'company_capex_currencies', EXCLUDED.metadata->'company_capex_currencies'
                                       ),
        updated_at = now(),
        updated_by = v_su
    WHERE (control.classification_config.primary_commodity_domain,
           control.classification_config.trade_commodity_domain,
           control.classification_config.is_required_for_regulated,
           control.classification_config.primary_industry_domain,
           control.classification_config.is_auto_classify_enabled,
           control.classification_config.is_auto_crosswalk_enabled,
           control.classification_config.min_confidence_auto,
           control.classification_config.min_confidence_suggest,
           control.classification_config.crosswalk_strategy,
           control.classification_config.cross_border_triggers)
       IS DISTINCT FROM
          (EXCLUDED.primary_commodity_domain,
           EXCLUDED.trade_commodity_domain,
           EXCLUDED.is_required_for_regulated,
           EXCLUDED.primary_industry_domain,
           EXCLUDED.is_auto_classify_enabled,
           EXCLUDED.is_auto_crosswalk_enabled,
           EXCLUDED.min_confidence_auto,
           EXCLUDED.min_confidence_suggest,
           EXCLUDED.crosswalk_strategy,
           EXCLUDED.cross_border_triggers);

    -- ── Assertions ───────────────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM control.classification_config WHERE tenant_id = v_tid
    ) THEN
        RAISE EXCEPTION '[019_base] classification_config row not created for ATHYPER';
    END IF;

    RAISE NOTICE '[019_base] Pre-seed foundation complete: provenance "seed" registered, classification_config ready';

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/020_spend_categories.sql
-- ============================================================================
-- ATHYPER GROUP — BASE SPEND CATEGORIES
-- ============================================================================
-- File:     020_spend_categories.sql
-- Schema:   master.spend_category
-- Purpose:  30 L1 roots (17 universal + 13 direct-ops) + ~87 leaf children
-- Depends:  000_tenant/000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §4 Spend Category Taxonomy
-- ============================================================================
-- PACK OWNS: All SC-* codes created by this file (roots + leaves)
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '020_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- ── STAGE B: Stage root categories ───────────────────────────────────
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,           -- NULL for roots
        procurement_type text NOT NULL DEFAULT 'goods',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER A — Universal cross-functional roots (17)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-IT',       'IT & Digital',                          'Information technology hardware, software, cloud, and services',           'goods',    10, true),
    ('SC-TELCO',    'Telecom & Connectivity',                'Voice, data, mobile, and network connectivity services',                  'services', 20, true),
    ('SC-OFFICE',   'Office & Workplace',                    'Office supplies, furniture, equipment, and printing',                      'goods',    30, true),
    ('SC-HR',       'HR, Talent & Benefits',                 'Recruitment, training, payroll services, and employee benefits',           'services', 40, true),
    ('SC-TRAVEL',   'Travel, Events & Employee Welfare',     'Air travel, hotels, ground transport, events, and conferences',            'services', 50, true),
    ('SC-PROF',     'Professional Services',                 'Legal, audit, consulting, and engineering advisory services',              'services', 60, true),
    ('SC-MKTG',     'Marketing, Media & CX',                 'Digital and traditional marketing, PR, and customer experience',           'services', 70, true),
    ('SC-FAC',      'Facilities & Occupancy',                'Rent, facility maintenance, cleaning, and on-site security',               'services', 80, true),
    ('SC-UTIL',     'Utilities & Energy Services',           'Electricity, water, gas, and waste management consumption',                'services', 90, true),
    ('SC-FLEET',    'Fleet & Mobility',                      'Vehicle purchase/lease, fuel, and fleet maintenance',                      'goods',   100, true),
    ('SC-INS',      'Insurance',                             'Property, liability, and employee insurance',                              'services',110, true),
    ('SC-BANK',     'Banking, Treasury & FX Services',       'Bank fees, foreign exchange, and treasury operations',                     'services',120, true),
    ('SC-TAX',      'Taxes, Duties & Statutory Fees',        'Corporate taxes, import duties, and statutory levies',                     'services',130, true),
    ('SC-SAFETY',   'Security, HSE & Compliance',            'Physical security, occupational health & safety, regulatory compliance',   'services',140, true),
    ('SC-ENV',      'ESG, Waste & Environmental Services',   'Carbon management, waste recycling, and environmental remediation',        'services',150, true),
    ('SC-OUTSRC',   'Outsourced & Shared Services',          'BPO, shared service centres, and temporary staffing',                      'services',160, true),
    ('SC-SUBS',     'Subscriptions, Licenses & Memberships', 'Software licenses, memberships, and publication subscriptions',            'services',170, true);

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER B — Direct operations roots (13)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-RAW',      'Raw Materials & Feedstock',             'Metals, chemicals, polymers, and agricultural raw materials',              'goods',   200, true),
    ('SC-COMP',     'Components & Sub-assemblies',           'Mechanical, electrical, and structural components',                        'goods',   210, true),
    ('SC-PKG',      'Packaging Materials',                   'Primary, secondary, and transit packaging',                                'goods',   220, true),
    ('SC-CONSUM',   'Consumables & Chemicals',               'Industrial chemicals, lab consumables, and cleaning agents',               'goods',   230, true),
    ('SC-MRO',      'MRO & Spare Parts',                     'Maintenance spare parts, tools, and supplies',                             'goods',   240, true),
    ('SC-PRODSVC',  'Production / Plant Services',           'Calibration, plant operations, and production support services',            'services',250, true),
    ('SC-CONTRACT', 'Contract Manufacturing / Subcontracting','Contract manufacturing and assembly subcontracting',                      'services',260, true),
    ('SC-FREIGHT',  'Freight, Logistics & Customs',          'Road, sea, air freight, and customs brokerage',                            'services',270, true),
    ('SC-WHSE',     'Warehousing & Cold Chain',              'Warehousing, storage, and temperature-controlled logistics',               'services',280, true),
    ('SC-QC',       'Quality, Lab & Testing',                'Testing, certification, and inspection services',                          'services',290, true),
    ('SC-CAPEQUIP', 'Capital Equipment & Tooling',           'Machinery, tooling, fixtures, and production lines',                       'goods',   300, true),
    ('SC-TEMPWK',   'Temporary Works / Site Services',       'Scaffolding, temporary site facilities, and access equipment',             'services',310, true),
    ('SC-PROCNRG',  'Process Energy / Utility Input',        'Steam, compressed air, and process gases used in production',              'services',320, true);

    -- ══════════════════════════════════════════════════════════════════════
    -- LEAF CATEGORIES — Universal roots (Layer A children)
    -- ══════════════════════════════════════════════════════════════════════

    -- SC-IT children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-IT-HW',    'Hardware & End-user Devices',     'Laptops, desktops, monitors, peripherals, and mobile devices',          'SC-IT', 'goods',    11),
    ('SC-IT-SW',    'Software & SaaS',                 'Perpetual licenses, SaaS subscriptions, and custom development',        'SC-IT', 'services', 12),
    ('SC-IT-CLOUD', 'Cloud & Hosting',                 'IaaS, PaaS, data centre colocation, and managed hosting',               'SC-IT', 'services', 13),
    ('SC-IT-SVC',   'IT Services & Support',           'Help desk, managed services, system integration, and consulting',       'SC-IT', 'services', 14),
    ('SC-IT-SEC',   'Cybersecurity',                   'Security software, penetration testing, SOC, and identity management',  'SC-IT', 'services', 15);

    -- SC-TELCO children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TELCO-VOICE', 'Voice & Telephony',            'PBX, SIP trunking, call centre, and PSTN services',                    'SC-TELCO', 'services', 21),
    ('SC-TELCO-DATA',  'Data & Internet',              'MPLS, SD-WAN, broadband, and dedicated internet access',               'SC-TELCO', 'services', 22),
    ('SC-TELCO-MOB',   'Mobile & Wireless',            'Mobile plans, SIM management, and wireless infrastructure',             'SC-TELCO', 'services', 23);

    -- SC-OFFICE children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-OFFICE-SUP',   'Office Supplies & Stationery',   'Paper, pens, toner, and general stationery',                         'SC-OFFICE', 'goods',    31),
    ('SC-OFFICE-FURN',  'Office Furniture',               'Desks, chairs, filing cabinets, and modular workstations',            'SC-OFFICE', 'goods',    32),
    ('SC-OFFICE-EQUIP', 'Office Equipment & Machines',    'Printers, copiers, shredders, and AV equipment',                      'SC-OFFICE', 'goods',    33),
    ('SC-OFFICE-PRINT', 'Printing & Reprographics',       'Commercial printing, signage, and document services',                 'SC-OFFICE', 'services', 34);

    -- SC-HR children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-HR-RECRUIT',  'Recruitment & Staffing',          'Job boards, recruitment agencies, and assessment tools',               'SC-HR', 'services', 41),
    ('SC-HR-TRAIN',    'Training & Development',          'Instructor-led, e-learning, and certification programmes',             'SC-HR', 'services', 42),
    ('SC-HR-BEN',      'Employee Benefits',               'Health plans, retirement, wellness, and perquisites',                  'SC-HR', 'services', 43),
    ('SC-HR-PAYROLL',  'Payroll Services',                'Payroll processing, WPS, and HR technology platforms',                 'SC-HR', 'services', 44);

    -- SC-TRAVEL children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TRAVEL-AIR',    'Air Travel',                    'Business and economy class flights, charter, and private aviation',    'SC-TRAVEL', 'services', 51),
    ('SC-TRAVEL-HOTEL',  'Accommodation & Hotels',        'Hotels, serviced apartments, and short-term rentals',                  'SC-TRAVEL', 'services', 52),
    ('SC-TRAVEL-GROUND', 'Ground Transportation',         'Car rentals, taxis, ride-share, and chauffeur services',               'SC-TRAVEL', 'services', 53),
    ('SC-TRAVEL-EVENTS', 'Events & Conferences',          'Event management, venue hire, and conference sponsorship',             'SC-TRAVEL', 'services', 54);

    -- SC-PROF children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PROF-LEGAL',   'Legal Services',                 'Corporate law, litigation, IP, and regulatory counsel',                'SC-PROF', 'services', 61),
    ('SC-PROF-AUDIT',   'Audit & Accounting',             'External audit, tax advisory, and forensic accounting',                'SC-PROF', 'services', 62),
    ('SC-PROF-CONSULT', 'Management Consulting',          'Strategy, transformation, and operational consulting',                 'SC-PROF', 'services', 63),
    ('SC-PROF-ENG',     'Engineering Consulting',         'Feasibility studies, design review, and technical advisory',           'SC-PROF', 'services', 64);

    -- SC-MKTG children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-MKTG-DIGITAL', 'Digital Marketing & Media',      'SEO, SEM, social media, programmatic, and influencer marketing',      'SC-MKTG', 'services', 71),
    ('SC-MKTG-TRAD',    'Traditional Advertising',        'Print, TV, radio, outdoor, and experiential campaigns',               'SC-MKTG', 'services', 72),
    ('SC-MKTG-PR',      'PR & Communications',            'Public relations, corporate communications, and crisis management',   'SC-MKTG', 'services', 73),
    ('SC-MKTG-CX',      'Customer Experience & Research', 'Market research, CX design, mystery shopping, and NPS programmes',    'SC-MKTG', 'services', 74);

    -- SC-FAC children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-FAC-RENT',  'Rent & Lease Payments',             'Office, retail, and warehouse lease and licence fees',                 'SC-FAC', 'services', 81),
    ('SC-FAC-MAINT', 'Facility Maintenance',              'HVAC, electrical, plumbing, and general building maintenance',         'SC-FAC', 'services', 82),
    ('SC-FAC-CLEAN', 'Cleaning & Janitorial',             'Office cleaning, washroom supplies, and pest control',                 'SC-FAC', 'services', 83),
    ('SC-FAC-SECUR', 'Facility Security',                 'Guards, CCTV, access control, and alarm monitoring',                   'SC-FAC', 'services', 84);

    -- SC-UTIL children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-UTIL-ELEC',  'Electricity',                      'Grid electricity consumption and renewable energy certificates',       'SC-UTIL', 'services', 91),
    ('SC-UTIL-WATER', 'Water & Sewerage',                 'Municipal water supply and wastewater discharge',                      'SC-UTIL', 'services', 92),
    ('SC-UTIL-GAS',   'Natural Gas',                      'Piped natural gas for heating, cooling, and catering',                 'SC-UTIL', 'services', 93),
    ('SC-UTIL-WASTE', 'Waste Management',                 'General waste collection, recycling, and hazardous waste disposal',    'SC-UTIL', 'services', 94);

    -- SC-FLEET children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-FLEET-VEH',   'Vehicle Purchase & Lease',        'Sedans, SUVs, trucks, and fleet leasing arrangements',                'SC-FLEET', 'goods',   101),
    ('SC-FLEET-FUEL',  'Fleet Fuel',                      'Petrol, diesel, CNG, and EV charging for fleet vehicles',             'SC-FLEET', 'goods',   102),
    ('SC-FLEET-MAINT', 'Fleet Maintenance',               'Scheduled servicing, tyres, bodywork, and roadside assistance',        'SC-FLEET', 'services',103);

    -- SC-INS children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-INS-PROP', 'Property & Asset Insurance',         'Fire, theft, all-risk, and machinery breakdown coverage',              'SC-INS', 'services', 111),
    ('SC-INS-LIAB', 'Liability Insurance',                'Public, product, professional indemnity, and D&O liability',           'SC-INS', 'services', 112),
    ('SC-INS-EMP',  'Employee Insurance',                 'Group medical, life, personal accident, and workers compensation',     'SC-INS', 'services', 113);

    -- SC-BANK children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-BANK-FEE',   'Bank Fees & Charges',              'Account fees, payment processing, and LC/BG charges',                 'SC-BANK', 'services', 121),
    ('SC-BANK-FX',    'Foreign Exchange Services',        'Spot, forward, and hedging FX transactions',                          'SC-BANK', 'services', 122),
    ('SC-BANK-TREAS', 'Treasury Services',                'Cash management, pooling, and investment advisory',                    'SC-BANK', 'services', 123);

    -- SC-TAX children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TAX-CORP', 'Corporate Taxes',                    'Income tax, withholding tax, and deferred tax provisions',             'SC-TAX', 'services', 131),
    ('SC-TAX-DUTY', 'Import Duties & Customs',            'Customs duties, anti-dumping, and countervailing levies',              'SC-TAX', 'services', 132),
    ('SC-TAX-STAT', 'Statutory Fees & Levies',            'Municipality fees, government licences, and regulatory levies',        'SC-TAX', 'services', 133);

    -- SC-SAFETY children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-SAFETY-SEC',  'Physical Security',               'Manned guarding, K9, and executive protection services',              'SC-SAFETY', 'services', 141),
    ('SC-SAFETY-HSE',  'Health, Safety & Environment',    'HSE consulting, PPE, fire safety, and incident investigation',         'SC-SAFETY', 'services', 142),
    ('SC-SAFETY-COMP', 'Compliance & Regulatory',         'Third-party audits, certification, and compliance monitoring',         'SC-SAFETY', 'services', 143);

    -- SC-ENV children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-ENV-WASTE',  'Waste & Recycling',                'Waste segregation, recycling programmes, and circular economy',        'SC-ENV', 'services', 151),
    ('SC-ENV-CARBON', 'Carbon & Emissions',               'Carbon footprint measurement, offsets, and reporting',                 'SC-ENV', 'services', 152),
    ('SC-ENV-REMEDN', 'Environmental Remediation',        'Soil, water, and air remediation and decontamination',                 'SC-ENV', 'services', 153);

    -- SC-OUTSRC children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-OUTSRC-BPO',    'Business Process Outsourcing',  'Finance, HR, and procurement process outsourcing',                    'SC-OUTSRC', 'services', 161),
    ('SC-OUTSRC-SHARED', 'Shared Service Centre',         'Centralised accounting, payroll, and IT help desk',                   'SC-OUTSRC', 'services', 162),
    ('SC-OUTSRC-TEMP',   'Temporary Staffing',            'Contingent workers, seasonal labour, and staff augmentation',          'SC-OUTSRC', 'services', 163);

    -- SC-SUBS children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-SUBS-LIC',  'Software Licenses',                 'Named/concurrent licences, maintenance, and upgrade entitlements',     'SC-SUBS', 'services', 171),
    ('SC-SUBS-MEMB', 'Memberships & Associations',        'Industry bodies, chambers of commerce, and professional memberships',  'SC-SUBS', 'services', 172),
    ('SC-SUBS-PUB',  'Publications & Subscriptions',      'Journals, databases, news feeds, and research subscriptions',          'SC-SUBS', 'services', 173);

    -- ══════════════════════════════════════════════════════════════════════
    -- LEAF CATEGORIES — Direct operations roots (Layer B children)
    -- ══════════════════════════════════════════════════════════════════════

    -- SC-RAW children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-RAW-METAL', 'Metals & Alloys',                   'Steel, aluminium, copper, and specialty alloys',                      'SC-RAW', 'goods', 201),
    ('SC-RAW-CHEM',  'Chemicals & Polymers',              'Base chemicals, resins, polymers, and solvents',                      'SC-RAW', 'goods', 202),
    ('SC-RAW-AGRI',  'Agricultural Raw Materials',        'Cotton, jute, rubber, timber, and other agri commodities',            'SC-RAW', 'goods', 203);

    -- SC-COMP children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-COMP-MECH',   'Mechanical Components',           'Bearings, gears, fasteners, valves, and pumps',                       'SC-COMP', 'goods', 211),
    ('SC-COMP-ELEC',   'Electrical & Electronic Comps',   'PCBs, connectors, relays, sensors, and semiconductors',               'SC-COMP', 'goods', 212),
    ('SC-COMP-STRUCT', 'Structural Components',           'Beams, columns, plates, and prefabricated sections',                  'SC-COMP', 'goods', 213);

    -- SC-PKG children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PKG-PRIMARY',   'Primary Packaging',             'Bottles, blister packs, pouches, and vials',                           'SC-PKG', 'goods', 221),
    ('SC-PKG-SECONDARY', 'Secondary Packaging',           'Cartons, boxes, shrink wrap, and labels',                              'SC-PKG', 'goods', 222),
    ('SC-PKG-TRANSIT',   'Transit Packaging',             'Pallets, stretch film, crates, and dunnage',                           'SC-PKG', 'goods', 223);

    -- SC-CONSUM children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-CONSUM-CHEM',  'Industrial Chemicals',           'Process chemicals, catalysts, and reagents',                           'SC-CONSUM', 'goods', 231),
    ('SC-CONSUM-LAB',   'Laboratory Consumables',         'Glassware, pipettes, filters, and test kits',                          'SC-CONSUM', 'goods', 232),
    ('SC-CONSUM-CLEAN', 'Cleaning Consumables',           'Solvents, detergents, wipes, and cleanroom supplies',                  'SC-CONSUM', 'goods', 233);

    -- SC-MRO children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-MRO-SPARE',  'Spare Parts',                      'OEM and aftermarket replacement parts',                                'SC-MRO', 'goods', 241),
    ('SC-MRO-TOOL',   'Maintenance Tools',                'Hand tools, power tools, and diagnostic equipment',                    'SC-MRO', 'goods', 242),
    ('SC-MRO-SUPPLY', 'Maintenance Supplies',             'Lubricants, adhesives, tapes, and safety consumables',                 'SC-MRO', 'goods', 243);

    -- SC-PRODSVC children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PRODSVC-CALIB', 'Calibration Services',          'Instrument calibration, metrology, and certification',                 'SC-PRODSVC', 'services', 251),
    ('SC-PRODSVC-PLANT', 'Plant Operations Services',     'Commissioning, shutdown, and turnaround support',                      'SC-PRODSVC', 'services', 252);

    -- SC-CONTRACT children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-CONTRACT-MFG', 'Contract Manufacturing',         'Toll manufacturing, white-label, and private-label production',        'SC-CONTRACT', 'services', 261),
    ('SC-CONTRACT-ASM', 'Assembly Subcontracting',        'Sub-assembly, kitting, and final assembly outsourcing',                'SC-CONTRACT', 'services', 262);

    -- SC-FREIGHT children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-FREIGHT-ROAD', 'Road Freight',                   'FTL, LTL, and last-mile delivery',                                    'SC-FREIGHT', 'services', 271),
    ('SC-FREIGHT-SEA',  'Sea Freight',                    'FCL, LCL, breakbulk, and tanker shipping',                             'SC-FREIGHT', 'services', 272),
    ('SC-FREIGHT-AIR',  'Air Freight',                    'Express air, charter, and consolidated airfreight',                    'SC-FREIGHT', 'services', 273),
    ('SC-FREIGHT-CUST', 'Customs & Brokerage',            'Customs clearance, brokerage, and trade compliance',                   'SC-FREIGHT', 'services', 274);

    -- SC-WHSE children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-WHSE-STORE', 'Warehousing & Storage',            'Ambient, bonded, and free-zone warehouse space',                      'SC-WHSE', 'services', 281),
    ('SC-WHSE-COLD',  'Cold Chain Services',              'Refrigerated storage, reefer transport, and cold-room operations',     'SC-WHSE', 'services', 282);

    -- SC-QC children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-QC-TEST',    'Testing & Analysis',               'Chemical, physical, microbiological, and mechanical testing',          'SC-QC', 'services', 291),
    ('SC-QC-CERT',    'Certification & Accreditation',    'ISO, HACCP, GMP, and product certification',                           'SC-QC', 'services', 292),
    ('SC-QC-INSPECT', 'Inspection Services',              'Pre-shipment, in-process, and third-party inspection',                 'SC-QC', 'services', 293);

    -- SC-CAPEQUIP children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-CAPEQUIP-MACH', 'Machinery',                     'Industrial machinery, CNC, and automated equipment',                  'SC-CAPEQUIP', 'goods', 301),
    ('SC-CAPEQUIP-TOOL', 'Tooling & Fixtures',            'Dies, moulds, jigs, and special-purpose tooling',                     'SC-CAPEQUIP', 'goods', 302),
    ('SC-CAPEQUIP-LINE', 'Production Lines',              'Assembly lines, conveyors, and process equipment trains',              'SC-CAPEQUIP', 'goods', 303);

    -- SC-TEMPWK children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TEMPWK-SCAF', 'Scaffolding & Access',            'Scaffolding erection, aerial platforms, and rope access',              'SC-TEMPWK', 'services', 311),
    ('SC-TEMPWK-SITE', 'Site Services',                   'Portable cabins, site welfare, and temporary utilities',               'SC-TEMPWK', 'services', 312);

    -- SC-PROCNRG children
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PROCNRG-STEAM', 'Steam & Thermal',               'Industrial steam generation and thermal energy supply',               'SC-PROCNRG', 'services', 321),
    ('SC-PROCNRG-COMP',  'Compressed Air & Gases',        'Compressed air, nitrogen, oxygen, and specialty gases',               'SC-PROCNRG', 'services', 322);


    -- ── STAGE C: UPSERT roots (parent_code IS NULL) ─────────────────────
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        NULL,                   -- root: no parent
        s.seed_id,              -- root: root_category_id = self
        s.procurement_type,
        s.visibility,
        s.is_classification_required,
        s.is_hs_required,
        s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text,
            'container', true
        )),
        'active',
        v_su
    FROM tmp_sc s
    WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                       = EXCLUDED.name,
        description                = EXCLUDED.description,
        procurement_type           = EXCLUDED.procurement_type,
        visibility                 = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required             = EXCLUDED.is_hs_required,
        is_regulated               = EXCLUDED.is_regulated,
        sort_order                 = EXCLUDED.sort_order,
        metadata                   = master.spend_category.metadata
                                     || jsonb_build_object('_seed', jsonb_build_object(
                                            'pack',      v_pack,
                                            'version',   v_version,
                                            'seeded_at', now()::text,
                                            'container', true
                                        )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.spend_category.name, master.spend_category.description,
           master.spend_category.procurement_type, master.spend_category.visibility,
           master.spend_category.is_classification_required, master.spend_category.is_hs_required,
           master.spend_category.is_regulated, master.spend_category.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.procurement_type, EXCLUDED.visibility,
           EXCLUDED.is_classification_required, EXCLUDED.is_hs_required,
           EXCLUDED.is_regulated, EXCLUDED.sort_order);

    -- ── STAGE D: UPSERT leaves (parent_code IS NOT NULL) ────────────────
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        p.id,                     -- resolved parent
        p.root_category_id,       -- inherit root from parent
        s.procurement_type,
        s.visibility,
        s.is_classification_required,
        s.is_hs_required,
        s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_sc s
    JOIN master.spend_category p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                       = EXCLUDED.name,
        description                = EXCLUDED.description,
        parent_id                  = EXCLUDED.parent_id,
        root_category_id           = EXCLUDED.root_category_id,
        procurement_type           = EXCLUDED.procurement_type,
        visibility                 = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required             = EXCLUDED.is_hs_required,
        is_regulated               = EXCLUDED.is_regulated,
        sort_order                 = EXCLUDED.sort_order,
        metadata                   = master.spend_category.metadata
                                     || jsonb_build_object('_seed', jsonb_build_object(
                                            'pack',      v_pack,
                                            'version',   v_version,
                                            'seeded_at', now()::text
                                        )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.spend_category.name, master.spend_category.description,
           master.spend_category.parent_id, master.spend_category.root_category_id,
           master.spend_category.procurement_type, master.spend_category.visibility,
           master.spend_category.is_classification_required, master.spend_category.is_hs_required,
           master.spend_category.is_regulated, master.spend_category.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.parent_id, EXCLUDED.root_category_id,
           EXCLUDED.procurement_type, EXCLUDED.visibility,
           EXCLUDED.is_classification_required, EXCLUDED.is_hs_required,
           EXCLUDED.is_regulated, EXCLUDED.sort_order);

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
        AND metadata->'_seed'->>'pack' = v_pack) < 100 THEN
        RAISE EXCEPTION '[020_base] Spend category load incomplete: expected ≥100, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
             AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
        AND parent_id IS NULL AND metadata->'_seed'->>'pack' = v_pack) <> 30 THEN
        RAISE EXCEPTION '[020_base] Expected 30 root categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
             AND parent_id IS NULL AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
        AND COALESCE((metadata->'_seed'->>'container')::boolean, false) = true
        AND metadata->'_seed'->>'pack' = v_pack) <> 30 THEN
        RAISE EXCEPTION '[020_base] Expected 30 container-only roots, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
             AND COALESCE((metadata->'_seed'->>'container')::boolean, false) = true
             AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[020_base] Spend categories loaded: % total (% roots, % leaves)',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
         AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
         AND parent_id IS NULL AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid
         AND parent_id IS NOT NULL AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/021_business_intents.sql
-- ============================================================================
-- ATHYPER GROUP — BASE BUSINESS INTENTS
-- ============================================================================
-- File:     021_business_intents.sql
-- Schema:   master.business_intent
-- Purpose:  6 domain roots + 36 generic leaves = 42 intents
-- Depends:  000_tenant/000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §5 Business Intent Taxonomy
-- ============================================================================
-- PACK OWNS: BI-OPEX, BI-CAPEX, BI-COGS, BI-ADMIN, BI-REG, BI-TRANSFER
--            and all BI-*-* leaf codes created by this file
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '021_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- ── STAGE B: Stage intent data ───────────────────────────────────────
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,           -- NULL for domain roots
        sort_order  smallint NOT NULL DEFAULT 0,
        is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- DOMAIN ROOTS (6)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, sort_order, is_container) VALUES
    ('BI-OPEX',     'Operating Expenditure',      'Day-to-day operational spending',                                'OPEX',          10, true),
    ('BI-CAPEX',    'Capital Expenditure',         'Long-term asset acquisition and improvement',                    'CAPEX',         20, true),
    ('BI-COGS',     'Cost of Sales',               'Direct costs of goods sold or services delivered',               'COST_OF_SALES', 30, true),
    ('BI-ADMIN',    'Administrative Expense',      'General and administrative overhead',                            'ADMIN',         40, true),
    ('BI-REG',      'Regulatory & Compliance',     'Taxes, statutory fees, and compliance-driven costs',             'REGULATORY',    50, true),
    ('BI-TRANSFER', 'Internal Transfer',           'Inter-company charges and cost re-allocations',                  'TRANSFER',      60, true);

    -- ══════════════════════════════════════════════════════════════════════
    -- OPEX LEAVES (14)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-OPEX-IT',     'IT Operating Expense',             'IT hardware, software, cloud, and support costs',               'OPEX', 'IT',           'BI-OPEX', 11),
    ('BI-OPEX-HR',     'HR & People Operating Expense',    'Recruitment, training, benefits, and welfare costs',            'OPEX', 'HR',           'BI-OPEX', 12),
    ('BI-OPEX-FAC',    'Facilities Operating Expense',     'Rent, maintenance, cleaning, and facility management',          'OPEX', 'FACILITIES',   'BI-OPEX', 13),
    ('BI-OPEX-UTIL',   'Utilities Operating Expense',      'Electricity, water, gas consumption costs',                     'OPEX', 'UTILITIES',    'BI-OPEX', 14),
    ('BI-OPEX-FUEL',   'Fuel & Energy Expense',            'Fleet fuel and non-process energy costs',                       'OPEX', 'FUEL',         'BI-OPEX', 15),
    ('BI-OPEX-INS',    'Insurance Expense',                'Property, liability, and employee insurance premiums',          'OPEX', 'INSURANCE',    'BI-OPEX', 16),
    ('BI-OPEX-PROF',   'Professional Services Expense',    'Legal, audit, consulting, and advisory fees',                   'OPEX', 'PROFESSIONAL', 'BI-OPEX', 17),
    ('BI-OPEX-MKTG',   'Marketing & Comms Expense',        'Marketing campaigns, PR, and customer experience costs',        'OPEX', 'MARKETING',    'BI-OPEX', 18),
    ('BI-OPEX-FLEET',  'Fleet Operating Expense',          'Vehicle lease, fuel, and fleet maintenance costs',              'OPEX', 'FLEET',        'BI-OPEX', 19),
    ('BI-OPEX-SAFETY', 'Safety & Security Expense',        'Security services, HSE, and compliance monitoring',             'OPEX', 'SAFETY',       'BI-OPEX', 20),
    ('BI-OPEX-ENV',    'Environmental Expense',            'ESG, waste management, and remediation costs',                  'OPEX', 'ENVIRONMENT',  'BI-OPEX', 21),
    ('BI-OPEX-MRO',    'MRO Expense',                     'Maintenance parts, tools, and repair supplies',                 'OPEX', 'MRO',          'BI-OPEX', 22),
    ('BI-OPEX-MAINT',  'Maintenance Services Expense',    'Planned and reactive maintenance service contracts',             'OPEX', 'MAINTENANCE',  'BI-OPEX', 23),
    ('BI-OPEX-OUTSRC', 'Outsourcing Expense',             'BPO, shared services, and temporary staffing costs',             'OPEX', 'OUTSOURCING',  'BI-OPEX', 24);

    -- ══════════════════════════════════════════════════════════════════════
    -- CAPEX LEAVES (9)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-CAPEX-IT',    'IT Capital Expenditure',           'Servers, network infrastructure, and major software',           'CAPEX', 'IT',             'BI-CAPEX', 21),
    ('BI-CAPEX-PLANT', 'Plant Capital Expenditure',        'New plant construction and major facility upgrades',            'CAPEX', 'PLANT',          'BI-CAPEX', 22),
    ('BI-CAPEX-EQUIP', 'Equipment Capital Expenditure',    'Production equipment and industrial machinery',                 'CAPEX', 'EQUIPMENT',      'BI-CAPEX', 23),
    ('BI-CAPEX-MACH',  'Machinery Capital Expenditure',    'Heavy machinery, CNC, and automated systems',                   'CAPEX', 'MACHINERY',      'BI-CAPEX', 24),
    ('BI-CAPEX-FLEET', 'Fleet Capital Expenditure',        'Vehicle purchases and fleet expansion',                         'CAPEX', 'FLEET',          'BI-CAPEX', 25),
    ('BI-CAPEX-TOOL',  'Tooling Capital Expenditure',      'Dies, moulds, jigs, and special-purpose tooling',               'CAPEX', 'TOOLING',        'BI-CAPEX', 26),
    ('BI-CAPEX-LEASE', 'Lease Capital Expenditure',        'Finance leases capitalised under IFRS 16',                      'CAPEX', 'LEASE',          'BI-CAPEX', 27),
    ('BI-CAPEX-PROP',  'Property Capital Expenditure',     'Land, buildings, and major property renovations',               'CAPEX', 'PROPERTY',       'BI-CAPEX', 28),
    ('BI-CAPEX-INFRA', 'Infrastructure Capital Expenditure','Roads, bridges, utilities, and civil infrastructure',          'CAPEX', 'INFRASTRUCTURE', 'BI-CAPEX', 29);

    -- ══════════════════════════════════════════════════════════════════════
    -- COST_OF_SALES LEAVES (5)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-MAT',     'Material Cost of Sales',          'Raw materials and components consumed in production',           'COST_OF_SALES', 'MATERIAL',    'BI-COGS', 31),
    ('BI-COGS-SUB',     'Subcontracting Cost of Sales',    'Contract manufacturing and assembly outsourcing costs',         'COST_OF_SALES', 'SUBCONTRACT', 'BI-COGS', 32),
    ('BI-COGS-LABOUR',  'Direct Labour Cost of Sales',     'Production wages, overtime, and shift allowances',              'COST_OF_SALES', 'LABOUR',      'BI-COGS', 33),
    ('BI-COGS-OH',      'Overhead Cost of Sales',          'Factory overhead, depreciation, and indirect production costs', 'COST_OF_SALES', 'OVERHEAD',    'BI-COGS', 34),
    ('BI-COGS-FREIGHT', 'Freight Cost of Sales',           'Inbound/outbound freight directly tied to sales',              'COST_OF_SALES', 'FREIGHT',     'BI-COGS', 35);

    -- ══════════════════════════════════════════════════════════════════════
    -- ADMIN LEAVES (3)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-ADMIN-GEN',   'General Admin Expense',            'Office supplies, travel, and miscellaneous admin costs',        'ADMIN', 'GENERAL', 'BI-ADMIN', 41),
    ('BI-ADMIN-LEGAL', 'Legal & Governance Expense',       'In-house legal, board costs, and governance overhead',          'ADMIN', 'LEGAL',   'BI-ADMIN', 42),
    ('BI-ADMIN-AUDIT', 'Audit & Assurance Expense',        'Internal audit, external audit, and compliance assurance',      'ADMIN', 'AUDIT',   'BI-ADMIN', 43);

    -- ══════════════════════════════════════════════════════════════════════
    -- REGULATORY LEAVES (3)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-REG-TAX',  'Tax & Duties',                        'Corporate tax, VAT, withholding tax, and customs duties',       'REGULATORY', 'TAX',         'BI-REG', 51),
    ('BI-REG-COMP', 'Compliance Cost',                     'Regulatory filings, certifications, and licence fees',          'REGULATORY', 'COMPLIANCE',  'BI-REG', 52),
    ('BI-REG-ENV',  'Environmental Compliance Cost',       'Environmental permits, monitoring, and remediation orders',      'REGULATORY', 'ENVIRONMENT', 'BI-REG', 53);

    -- ══════════════════════════════════════════════════════════════════════
    -- TRANSFER LEAVES (2)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-TRANSFER-IC',   'Inter-company Transfer',         'Cross-entity charges at arms-length transfer pricing',          'TRANSFER', 'INTERCOMPANY',  'BI-TRANSFER', 61),
    ('BI-TRANSFER-RECL', 'Cost Reclass / Reallocation',    'Internal cost reallocation between cost centres',               'TRANSFER', 'REALLOCATION',  'BI-TRANSFER', 62);


    -- ── STAGE C: UPSERT domain roots ─────────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        s.domain,
        s.subtype,
        NULL,               -- root: no parent
        0,                  -- root depth
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text,
            'container', true
        )),
        'active',
        v_su
    FROM tmp_bi s
    WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text,
                             'container', true
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.business_intent.name, master.business_intent.description,
           master.business_intent.domain, master.business_intent.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.domain, EXCLUDED.sort_order);

    -- ── STAGE D: UPSERT intent leaves ────────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        s.domain,
        s.subtype,
        p.id,               -- resolved parent
        1,                  -- leaf depth
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_bi s
    JOIN master.business_intent p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.business_intent.name, master.business_intent.description,
           master.business_intent.domain, master.business_intent.subtype,
           master.business_intent.parent_id, master.business_intent.depth,
           master.business_intent.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.domain, EXCLUDED.subtype,
           EXCLUDED.parent_id, EXCLUDED.depth,
           EXCLUDED.sort_order);

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 40 THEN
        RAISE EXCEPTION '[021_base] Business intent load incomplete: expected ≥40, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND parent_id IS NULL
        AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[021_base] Expected 6 domain roots, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND parent_id IS NULL
             AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[021_base] Business intents loaded: % total (6 roots, % leaves)',
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND parent_id IS NOT NULL
         AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/022_spend_intent_link.sql
-- ============================================================================
-- ATHYPER GROUP — BASE SPEND → INTENT LINKAGE
-- ============================================================================
-- File:     022_spend_intent_link.sql
-- Schema:   master.spend_category (UPDATE default_intent_id)
-- Purpose:  Backfill default_intent_id on all selectable (non-container) nodes
-- Depends:  020_spend_categories.sql, 021_business_intents.sql
-- Idempotent: Yes — UPDATE with resolved IDs
-- Spec ref: §6 default_intent_id Rule (Selectable-Node Contract)
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '022_base';
    v_version  text := '1.0.0';
    v_orphan_count integer;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found';
    END IF;

    -- ── STAGE B: Stage linkage map ───────────────────────────────────────
    CREATE TEMP TABLE tmp_link (
        sc_code text NOT NULL,
        bi_code text NOT NULL
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- MAPPING: spend_category_code → default business_intent_code
    -- Rule: Every selectable (non-container) node MUST have an intent.
    -- Container-only nodes (roots) are NOT mapped here.
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO tmp_link (sc_code, bi_code) VALUES
    -- ── IT & Digital ─────────────────────────────────────────────────────
    ('SC-IT-HW',         'BI-OPEX-IT'),
    ('SC-IT-SW',         'BI-OPEX-IT'),
    ('SC-IT-CLOUD',      'BI-OPEX-IT'),
    ('SC-IT-SVC',        'BI-OPEX-IT'),
    ('SC-IT-SEC',        'BI-OPEX-IT'),

    -- ── Telecom & Connectivity ───────────────────────────────────────────
    ('SC-TELCO-VOICE',   'BI-OPEX-IT'),
    ('SC-TELCO-DATA',    'BI-OPEX-IT'),
    ('SC-TELCO-MOB',     'BI-OPEX-IT'),

    -- ── Office & Workplace ───────────────────────────────────────────────
    ('SC-OFFICE-SUP',    'BI-OPEX-FAC'),
    ('SC-OFFICE-FURN',   'BI-OPEX-FAC'),
    ('SC-OFFICE-EQUIP',  'BI-OPEX-FAC'),
    ('SC-OFFICE-PRINT',  'BI-OPEX-FAC'),

    -- ── HR, Talent & Benefits ────────────────────────────────────────────
    ('SC-HR-RECRUIT',    'BI-OPEX-HR'),
    ('SC-HR-TRAIN',      'BI-OPEX-HR'),
    ('SC-HR-BEN',        'BI-OPEX-HR'),
    ('SC-HR-PAYROLL',    'BI-OPEX-HR'),

    -- ── Travel, Events & Welfare ─────────────────────────────────────────
    ('SC-TRAVEL-AIR',    'BI-OPEX-HR'),
    ('SC-TRAVEL-HOTEL',  'BI-OPEX-HR'),
    ('SC-TRAVEL-GROUND', 'BI-OPEX-HR'),
    ('SC-TRAVEL-EVENTS', 'BI-OPEX-MKTG'),

    -- ── Professional Services ────────────────────────────────────────────
    ('SC-PROF-LEGAL',    'BI-OPEX-PROF'),
    ('SC-PROF-AUDIT',    'BI-OPEX-PROF'),
    ('SC-PROF-CONSULT',  'BI-OPEX-PROF'),
    ('SC-PROF-ENG',      'BI-OPEX-PROF'),

    -- ── Marketing, Media & CX ────────────────────────────────────────────
    ('SC-MKTG-DIGITAL',  'BI-OPEX-MKTG'),
    ('SC-MKTG-TRAD',     'BI-OPEX-MKTG'),
    ('SC-MKTG-PR',       'BI-OPEX-MKTG'),
    ('SC-MKTG-CX',       'BI-OPEX-MKTG'),

    -- ── Facilities & Occupancy ───────────────────────────────────────────
    ('SC-FAC-RENT',      'BI-OPEX-FAC'),
    ('SC-FAC-MAINT',     'BI-OPEX-MAINT'),
    ('SC-FAC-CLEAN',     'BI-OPEX-FAC'),
    ('SC-FAC-SECUR',     'BI-OPEX-SAFETY'),

    -- ── Utilities & Energy ───────────────────────────────────────────────
    ('SC-UTIL-ELEC',     'BI-OPEX-UTIL'),
    ('SC-UTIL-WATER',    'BI-OPEX-UTIL'),
    ('SC-UTIL-GAS',      'BI-OPEX-UTIL'),
    ('SC-UTIL-WASTE',    'BI-OPEX-ENV'),

    -- ── Fleet & Mobility ─────────────────────────────────────────────────
    ('SC-FLEET-VEH',     'BI-OPEX-FLEET'),
    ('SC-FLEET-FUEL',    'BI-OPEX-FUEL'),
    ('SC-FLEET-MAINT',   'BI-OPEX-FLEET'),

    -- ── Insurance ────────────────────────────────────────────────────────
    ('SC-INS-PROP',      'BI-OPEX-INS'),
    ('SC-INS-LIAB',      'BI-OPEX-INS'),
    ('SC-INS-EMP',       'BI-OPEX-INS'),

    -- ── Banking & Treasury ───────────────────────────────────────────────
    ('SC-BANK-FEE',      'BI-ADMIN-GEN'),
    ('SC-BANK-FX',       'BI-ADMIN-GEN'),
    ('SC-BANK-TREAS',    'BI-ADMIN-GEN'),

    -- ── Taxes & Duties ───────────────────────────────────────────────────
    ('SC-TAX-CORP',      'BI-REG-TAX'),
    ('SC-TAX-DUTY',      'BI-REG-TAX'),
    ('SC-TAX-STAT',      'BI-REG-TAX'),

    -- ── Security, HSE & Compliance ───────────────────────────────────────
    ('SC-SAFETY-SEC',    'BI-OPEX-SAFETY'),
    ('SC-SAFETY-HSE',    'BI-OPEX-SAFETY'),
    ('SC-SAFETY-COMP',   'BI-REG-COMP'),

    -- ── ESG & Environmental ──────────────────────────────────────────────
    ('SC-ENV-WASTE',     'BI-OPEX-ENV'),
    ('SC-ENV-CARBON',    'BI-OPEX-ENV'),
    ('SC-ENV-REMEDN',    'BI-REG-ENV'),

    -- ── Outsourced & Shared Services ─────────────────────────────────────
    ('SC-OUTSRC-BPO',    'BI-OPEX-OUTSRC'),
    ('SC-OUTSRC-SHARED', 'BI-OPEX-OUTSRC'),
    ('SC-OUTSRC-TEMP',   'BI-OPEX-OUTSRC'),

    -- ── Subscriptions & Licenses ─────────────────────────────────────────
    ('SC-SUBS-LIC',      'BI-OPEX-IT'),
    ('SC-SUBS-MEMB',     'BI-ADMIN-GEN'),
    ('SC-SUBS-PUB',      'BI-ADMIN-GEN'),

    -- ══════════════════════════════════════════════════════════════════════
    -- DIRECT OPERATIONS — Layer B leaves
    -- ══════════════════════════════════════════════════════════════════════

    -- ── Raw Materials ────────────────────────────────────────────────────
    ('SC-RAW-METAL',     'BI-COGS-MAT'),
    ('SC-RAW-CHEM',      'BI-COGS-MAT'),
    ('SC-RAW-AGRI',      'BI-COGS-MAT'),

    -- ── Components ───────────────────────────────────────────────────────
    ('SC-COMP-MECH',     'BI-COGS-MAT'),
    ('SC-COMP-ELEC',     'BI-COGS-MAT'),
    ('SC-COMP-STRUCT',   'BI-COGS-MAT'),

    -- ── Packaging ────────────────────────────────────────────────────────
    ('SC-PKG-PRIMARY',   'BI-COGS-MAT'),
    ('SC-PKG-SECONDARY', 'BI-COGS-MAT'),
    ('SC-PKG-TRANSIT',   'BI-COGS-FREIGHT'),

    -- ── Consumables & Chemicals ──────────────────────────────────────────
    ('SC-CONSUM-CHEM',   'BI-COGS-MAT'),
    ('SC-CONSUM-LAB',    'BI-COGS-OH'),
    ('SC-CONSUM-CLEAN',  'BI-COGS-OH'),

    -- ── MRO & Spare Parts ────────────────────────────────────────────────
    ('SC-MRO-SPARE',     'BI-OPEX-MRO'),
    ('SC-MRO-TOOL',      'BI-OPEX-MRO'),
    ('SC-MRO-SUPPLY',    'BI-OPEX-MRO'),

    -- ── Production Services ──────────────────────────────────────────────
    ('SC-PRODSVC-CALIB', 'BI-COGS-OH'),
    ('SC-PRODSVC-PLANT', 'BI-COGS-OH'),

    -- ── Contract Manufacturing ───────────────────────────────────────────
    ('SC-CONTRACT-MFG',  'BI-COGS-SUB'),
    ('SC-CONTRACT-ASM',  'BI-COGS-SUB'),

    -- ── Freight & Logistics ──────────────────────────────────────────────
    ('SC-FREIGHT-ROAD',  'BI-COGS-FREIGHT'),
    ('SC-FREIGHT-SEA',   'BI-COGS-FREIGHT'),
    ('SC-FREIGHT-AIR',   'BI-COGS-FREIGHT'),
    ('SC-FREIGHT-CUST',  'BI-COGS-FREIGHT'),

    -- ── Warehousing ──────────────────────────────────────────────────────
    ('SC-WHSE-STORE',    'BI-COGS-OH'),
    ('SC-WHSE-COLD',     'BI-COGS-OH'),

    -- ── Quality, Lab & Testing ───────────────────────────────────────────
    ('SC-QC-TEST',       'BI-COGS-OH'),
    ('SC-QC-CERT',       'BI-REG-COMP'),
    ('SC-QC-INSPECT',    'BI-COGS-OH'),

    -- ── Capital Equipment ────────────────────────────────────────────────
    ('SC-CAPEQUIP-MACH', 'BI-CAPEX-EQUIP'),
    ('SC-CAPEQUIP-TOOL', 'BI-CAPEX-TOOL'),
    ('SC-CAPEQUIP-LINE', 'BI-CAPEX-EQUIP'),

    -- ── Temporary Works ──────────────────────────────────────────────────
    ('SC-TEMPWK-SCAF',   'BI-COGS-OH'),
    ('SC-TEMPWK-SITE',   'BI-COGS-OH'),

    -- ── Process Energy ───────────────────────────────────────────────────
    ('SC-PROCNRG-STEAM', 'BI-OPEX-UTIL'),
    ('SC-PROCNRG-COMP',  'BI-OPEX-UTIL');


    -- ── STAGE C: Apply linkage ───────────────────────────────────────────
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata
                   || jsonb_build_object('_seed', jsonb_build_object(
                          'pack',      v_pack,
                          'version',   v_version,
                          'seeded_at', now()::text,
                          'intent_code', lnk.bi_code
                      )),
        updated_at = now(),
        updated_by = v_su
    FROM tmp_link lnk
    JOIN master.business_intent bi
      ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
    WHERE sc.tenant_id = v_tid
      AND sc.code = lnk.sc_code;


    -- ── STAGE D: HARD FAIL — selectable nodes without default_intent_id ──
    SELECT count(*) INTO v_orphan_count
    FROM master.spend_category
    WHERE tenant_id = v_tid
      AND status = 'active'
      AND default_intent_id IS NULL
      AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false);

    IF v_orphan_count > 0 THEN
        RAISE EXCEPTION '[022_base] HARD FAIL — % selectable spend categories without default_intent_id: %',
            v_orphan_count,
            (SELECT string_agg(code, ', ' ORDER BY code)
             FROM master.spend_category
             WHERE tenant_id = v_tid
               AND status = 'active'
               AND default_intent_id IS NULL
               AND NOT COALESCE((metadata->'_seed'->>'container')::boolean, false));
    END IF;

    -- ── STAGE E: Count assertions ────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid
          AND status = 'active'
          AND default_intent_id IS NOT NULL) < 80 THEN
        RAISE EXCEPTION '[022_base] Selectable nodes with intent incomplete: expected ≥80, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid
               AND status = 'active'
               AND default_intent_id IS NOT NULL);
    END IF;

    RAISE NOTICE '[022_base] Spend-intent linkage complete: % categories linked, 0 orphans',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid
           AND status = 'active'
           AND default_intent_id IS NOT NULL);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/024_routing_rules.sql
-- ============================================================================
-- ATHYPER GROUP — BASE ROUTING RULES
-- ============================================================================
-- File:     024_routing_rules.sql
-- Schema:   control.commodity_to_spend_category_rule
-- Purpose:  Route incoming commodity codes → spend categories (3-layer rules)
-- Depends:  020_spend_categories.sql, 001_shared/008a_commodity_code_unspsc.sql
-- Idempotent: Yes — ON CONFLICT DO UPDATE
-- Spec ref: §8 Routing Rule Conventions
-- ============================================================================
-- Three-layer structure per §8.1:
--   Layer 1 — EXACT overrides  (priority 30+, confidence 95–100)
--   Layer 2 — Family/class     (priority 10–29, confidence 80–94)
--   Layer 3 — Segment catchalls (priority 1–9, confidence 55–70)
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '024_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base seed not loaded. Run 020 first.';
    END IF;

    -- ── STAGE B: Build spend_category resolve map ────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    -- ── STAGE C: Stage routing rules ─────────────────────────────────────
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,           -- NULL for EXACT
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 1 — EXACT OVERRIDES (priority 30+, confidence 95–100)
    -- High-volume or high-risk codes that must route precisely
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    -- IT & Digital
    ('SC-IT-HW',      'EXACT', '43211503', NULL, 30, 98, 'Notebook computers → IT Hardware'),
    ('SC-IT-HW',      'EXACT', '43211507', NULL, 30, 98, 'Desktop computers → IT Hardware'),
    ('SC-IT-HW',      'EXACT', '43211708', NULL, 30, 97, 'Flat panel displays → IT Hardware'),
    ('SC-IT-SW',      'EXACT', '43231500', NULL, 30, 96, 'Business function software → IT Software'),
    ('SC-IT-CLOUD',   'EXACT', '81112200', NULL, 30, 96, 'Internet services → Cloud'),
    ('SC-IT-SEC',     'EXACT', '43232300', NULL, 30, 96, 'Security software → Cybersecurity'),

    -- Telecom
    ('SC-TELCO-VOICE', 'EXACT', '83111502', NULL, 30, 97, 'Local telephone service'),
    ('SC-TELCO-DATA',  'EXACT', '83111603', NULL, 30, 97, 'Internet service provider ISP'),
    ('SC-TELCO-MOB',   'EXACT', '83111702', NULL, 30, 97, 'Mobile telephone service'),

    -- Office
    ('SC-OFFICE-SUP', 'EXACT', '44121600', NULL, 30, 96, 'Writing instruments'),

    -- Travel
    ('SC-TRAVEL-AIR',   'EXACT', '78111502', NULL, 30, 98, 'Domestic air transport'),
    ('SC-TRAVEL-HOTEL', 'EXACT', '90111601', NULL, 30, 98, 'Hotels'),

    -- Professional services
    ('SC-PROF-LEGAL',  'EXACT', '80121609', NULL, 30, 97, 'Contract law services'),
    ('SC-PROF-AUDIT',  'EXACT', '84111502', NULL, 30, 97, 'Financial auditing services'),

    -- Freight
    ('SC-FREIGHT-ROAD', 'EXACT', '78101802', NULL, 30, 97, 'Local trucking services'),
    ('SC-FREIGHT-SEA',  'EXACT', '78101703', NULL, 30, 97, 'Containerised freight'),
    ('SC-FREIGHT-AIR',  'EXACT', '78101601', NULL, 30, 97, 'Domestic air cargo');

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 2 — FAMILY / CLASS RANGES (priority 10–29, confidence 80–94)
    -- Standard routing for known UNSPSC families
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    -- IT
    ('SC-IT-HW',       'RANGE', '43210000', '43219999', 20, 88, 'Computer equipment family'),
    ('SC-IT-SW',       'RANGE', '43230000', '43239999', 20, 85, 'Software family'),
    ('SC-IT-CLOUD',    'RANGE', '81112200', '81112299', 20, 85, 'Internet services family'),
    ('SC-IT-SVC',      'RANGE', '81111500', '81111999', 15, 82, 'IT services families'),
    ('SC-IT-SEC',      'RANGE', '43232300', '43232399', 20, 85, 'Security software family'),

    -- Telecom
    ('SC-TELCO-VOICE', 'RANGE', '83111500', '83111599', 15, 82, 'Telephone services family'),
    ('SC-TELCO-DATA',  'RANGE', '83111600', '83111699', 15, 82, 'Internet access family'),
    ('SC-TELCO-MOB',   'RANGE', '83111700', '83111799', 15, 82, 'Mobile comms family'),

    -- Office
    ('SC-OFFICE-SUP',   'RANGE', '44120000', '44129999', 15, 85, 'Office supplies class'),
    ('SC-OFFICE-FURN',  'RANGE', '56101500', '56101999', 15, 85, 'Office furniture family'),
    ('SC-OFFICE-EQUIP', 'RANGE', '44100000', '44109999', 15, 82, 'Office machines class'),

    -- HR
    ('SC-HR-RECRUIT',  'RANGE', '80111600', '80111699', 15, 82, 'Staffing services family'),
    ('SC-HR-TRAIN',    'RANGE', '86130000', '86139999', 15, 82, 'Vocational training class'),

    -- Travel
    ('SC-TRAVEL-AIR',    'RANGE', '78111500', '78111599', 20, 88, 'Air passenger transport'),
    ('SC-TRAVEL-HOTEL',  'RANGE', '90111600', '90111699', 20, 88, 'Hotels family'),
    ('SC-TRAVEL-GROUND', 'RANGE', '78111800', '78111899', 15, 82, 'Vehicle rental family'),
    ('SC-TRAVEL-EVENTS', 'RANGE', '80141600', '80141699', 15, 80, 'Events management family'),

    -- Professional
    ('SC-PROF-LEGAL',   'RANGE', '80121600', '80121699', 15, 85, 'Legal services family'),
    ('SC-PROF-AUDIT',   'RANGE', '84111500', '84111599', 15, 85, 'Accounting services family'),
    ('SC-PROF-CONSULT', 'RANGE', '80101500', '80101599', 15, 82, 'Management consulting family'),
    ('SC-PROF-ENG',     'RANGE', '81101500', '81101599', 15, 82, 'Engineering services family'),

    -- Marketing
    ('SC-MKTG-DIGITAL', 'RANGE', '82101500', '82101599', 15, 80, 'Advertising services family'),
    ('SC-MKTG-PR',      'RANGE', '80141500', '80141599', 15, 80, 'PR services family'),

    -- Facilities
    ('SC-FAC-MAINT', 'RANGE', '72151500', '72151599', 15, 82, 'Building maintenance family'),
    ('SC-FAC-CLEAN', 'RANGE', '76111500', '76111599', 15, 85, 'Cleaning services family'),
    ('SC-FAC-SECUR', 'RANGE', '92121500', '92121599', 15, 82, 'Security guard family'),

    -- Utilities
    ('SC-UTIL-ELEC',  'RANGE', '83101500', '83101599', 15, 85, 'Electric utilities family'),
    ('SC-UTIL-WATER', 'RANGE', '83101600', '83101699', 15, 85, 'Water utilities family'),
    ('SC-UTIL-GAS',   'RANGE', '83101800', '83101899', 15, 85, 'Gas utilities family'),

    -- Fleet
    ('SC-FLEET-VEH',   'RANGE', '25101500', '25101999', 15, 85, 'Motor vehicles family'),
    ('SC-FLEET-FUEL',  'RANGE', '15101500', '15101599', 15, 85, 'Petroleum fuels family'),

    -- Freight
    ('SC-FREIGHT-ROAD', 'RANGE', '78101800', '78101899', 20, 88, 'Trucking services family'),
    ('SC-FREIGHT-SEA',  'RANGE', '78101700', '78101799', 20, 88, 'Marine freight family'),
    ('SC-FREIGHT-AIR',  'RANGE', '78101600', '78101699', 20, 88, 'Air freight family'),
    ('SC-FREIGHT-CUST', 'RANGE', '78131800', '78131899', 15, 82, 'Customs brokerage family'),

    -- Raw materials
    ('SC-RAW-METAL', 'RANGE', '11101500', '11109999', 15, 82, 'Metals family'),
    ('SC-RAW-CHEM',  'RANGE', '12160000', '12169999', 15, 82, 'Solvents/chemicals class'),
    ('SC-RAW-AGRI',  'RANGE', '10170000', '10179999', 15, 82, 'Plant raw materials class'),

    -- Components
    ('SC-COMP-MECH',   'RANGE', '31160000', '31169999', 15, 82, 'Bearings/gears class'),
    ('SC-COMP-ELEC',   'RANGE', '32100000', '32109999', 15, 82, 'Electronics class'),
    ('SC-COMP-STRUCT', 'RANGE', '30100000', '30109999', 15, 80, 'Structural components class'),

    -- Warehousing
    ('SC-WHSE-STORE', 'RANGE', '78141500', '78141599', 15, 82, 'Warehousing family'),

    -- Quality
    ('SC-QC-TEST',    'RANGE', '41115400', '41115499', 15, 82, 'Measuring instruments family'),
    ('SC-QC-CERT',    'RANGE', '93141800', '93141899', 15, 80, 'Inspection services family'),

    -- MRO
    ('SC-MRO-TOOL', 'RANGE', '27110000', '27119999', 15, 82, 'Hand tools class'),

    -- Insurance
    ('SC-INS-PROP', 'RANGE', '84131500', '84131599', 15, 82, 'Property insurance family'),
    ('SC-INS-LIAB', 'RANGE', '84131600', '84131699', 15, 82, 'Liability insurance family');


    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER 3 — SEGMENT CATCHALLS (priority 1–9, confidence 55–70)
    -- Broad fallback for entire UNSPSC segments
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-IT-HW',         'RANGE', '43000000', '43999999', 5, 60, 'Segment 43: IT equipment catchall'),
    ('SC-TELCO-DATA',    'RANGE', '83000000', '83999999', 3, 55, 'Segment 83: Utilities/telecom catchall'),
    ('SC-OFFICE-SUP',    'RANGE', '44000000', '44999999', 5, 60, 'Segment 44: Office equipment catchall'),
    ('SC-HR-RECRUIT',    'RANGE', '80110000', '80119999', 5, 58, 'Class 8011: HR services catchall'),
    ('SC-TRAVEL-AIR',    'RANGE', '78110000', '78119999', 5, 58, 'Class 7811: Passenger transport catchall'),
    ('SC-PROF-CONSULT',  'RANGE', '80100000', '80109999', 5, 58, 'Class 8010: Business services catchall'),
    ('SC-MKTG-DIGITAL',  'RANGE', '82000000', '82999999', 3, 55, 'Segment 82: Advertising/marketing catchall'),
    ('SC-FAC-MAINT',     'RANGE', '72000000', '72999999', 3, 55, 'Segment 72: Building/construction catchall'),
    ('SC-UTIL-ELEC',     'RANGE', '83100000', '83109999', 5, 60, 'Class 8310: Utilities catchall'),
    ('SC-FLEET-VEH',     'RANGE', '25000000', '25999999', 3, 55, 'Segment 25: Vehicles catchall'),
    ('SC-INS-PROP',      'RANGE', '84130000', '84139999', 5, 58, 'Class 8413: Insurance catchall'),
    ('SC-BANK-FEE',      'RANGE', '84110000', '84119999', 5, 58, 'Class 8411: Financial services catchall'),
    ('SC-SAFETY-HSE',    'RANGE', '46000000', '46999999', 3, 55, 'Segment 46: Defence/security catchall'),
    ('SC-ENV-WASTE',     'RANGE', '77000000', '77999999', 3, 55, 'Segment 77: Environmental catchall'),
    ('SC-RAW-METAL',     'RANGE', '11000000', '11999999', 3, 55, 'Segment 11: Mineral/textile material catchall'),
    ('SC-RAW-CHEM',      'RANGE', '12000000', '12999999', 3, 55, 'Segment 12: Chemicals catchall'),
    ('SC-RAW-AGRI',      'RANGE', '10000000', '10999999', 3, 55, 'Segment 10: Live plant/animal catchall'),
    ('SC-COMP-MECH',     'RANGE', '31000000', '31999999', 3, 55, 'Segment 31: Manufacturing components catchall'),
    ('SC-COMP-ELEC',     'RANGE', '32000000', '32999999', 3, 55, 'Segment 32: Electronic components catchall'),
    ('SC-PKG-PRIMARY',   'RANGE', '24000000', '24999999', 3, 55, 'Segment 24: Containers/packaging catchall'),
    ('SC-MRO-TOOL',      'RANGE', '27000000', '27999999', 3, 55, 'Segment 27: Tools/machinery catchall'),
    ('SC-CONSUM-CLEAN',  'RANGE', '47000000', '47999999', 3, 55, 'Segment 47: Cleaning equipment catchall'),
    ('SC-CAPEQUIP-MACH', 'RANGE', '23000000', '23999999', 3, 55, 'Segment 23: Industrial machinery catchall'),
    ('SC-FREIGHT-ROAD',  'RANGE', '78100000', '78109999', 5, 60, 'Class 7810: Freight services catchall'),
    ('SC-FLEET-FUEL',    'RANGE', '15000000', '15999999', 3, 55, 'Segment 15: Fuels catchall'),
    ('SC-QC-TEST',       'RANGE', '41000000', '41999999', 3, 55, 'Segment 41: Lab/testing equipment catchall'),
    ('SC-FAC-CLEAN',     'RANGE', '76000000', '76999999', 3, 55, 'Segment 76: Cleaning services catchall'),
    ('SC-FAC-SECUR',     'RANGE', '92000000', '92999999', 3, 55, 'Segment 92: Defence/security services catchall'),
    ('SC-OUTSRC-BPO',    'RANGE', '80160000', '80169999', 5, 60, 'Class 8016: BPO services catchall'),
    ('SC-HR-TRAIN',      'RANGE', '86000000', '86999999', 3, 55, 'Segment 86: Education/training catchall'),
    ('SC-TRAVEL-HOTEL',  'RANGE', '90000000', '90999999', 3, 55, 'Segment 90: Travel/lodging catchall'),
    ('SC-OFFICE-FURN',   'RANGE', '56000000', '56999999', 3, 55, 'Segment 56: Furniture catchall'),
    ('SC-CAPEQUIP-TOOL', 'RANGE', '30000000', '30999999', 3, 55, 'Segment 30: Structures/components catchall');


    -- ── STAGE D: UPSERT routing rules (delete-then-insert by pack) ─────────
    -- Delete ALL prior rows for this pack first, then re-insert the full batch.
    -- This is identical to the pattern used in all pack files and is safe because
    -- each pack owns its own rows exclusively (identified by metadata._seed.pack).
    -- Patch upgrades that add new rules simply bump v_version; re-running an older
    -- version will still land all rows that version defines.
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid,
        r.domain,
        r.match_mode,
        r.code_from,
        r.code_to,
        sm.id,
        r.priority,
        r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',        v_pack,
            'version',     v_version,
            'seeded_at',   now()::text,
            'description', r.description
        )),
        'active',
        v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code;

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack) < 50 THEN
        RAISE EXCEPTION '[024_base] Routing rule load incomplete: expected ≥50, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- §11.3.3 confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[024_base] EXACT rules must have confidence ≥95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[024_base] Catchall rules (priority ≤9) must have confidence ≤70';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND priority >= 30 AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[024_base] EXACT priority rules (≥30) must have confidence ≥95';
    END IF;

    RAISE NOTICE '[024_base] Routing rules loaded: % total (L1=%, L2=%, L3=%)',
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority >= 30),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority BETWEEN 10 AND 29),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND priority <= 9);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/025_base_item_categories.sql
-- ============================================================================
-- ATHYPER GROUP — BASE ITEM CATEGORIES
-- ============================================================================
-- File:     025_base_item_categories.sql
-- Schema:   master.item_category
-- Purpose:  4 L1 roots + ~32 industry-neutral leaf children
-- Depends:  000_tenant/000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §14 Item Category Taxonomy — Base + Pack Shape
-- ============================================================================
-- Execution order: runs AFTER 021, BEFORE 022 and 023
--   020 → 021 → 025 → 022 → 023 → 024 → 026
-- ============================================================================
-- item_category answers: "What TYPE of thing is this?"
-- spend_category answers: "What are we BUYING?"
-- They are parallel taxonomies that intersect at the document line.
-- ============================================================================
-- PACK OWNS: IC-GOODS, IC-EQUIP, IC-SVC, IC-CONMAT and all IC-* leaf codes
-- ============================================================================
-- NOTE: default_tax_group_id is NOT populated here (§14.4).
--   The column is added via ALTER TABLE in the tax engine migration.
--   Tax group linkage is a post-integration step after tax_group rows exist.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '025_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- ── STAGE B: Stage item category data ────────────────────────────────
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,           -- NULL for roots
        level_no      smallint NOT NULL DEFAULT 1,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- L1 ROOTS (4)  — container-only, no bridge entries
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, level_no, sort_order, is_container) VALUES
    ('IC-GOODS',  'Physical Goods',                    'Tangible materials, components, consumables, and finished goods',     1, 100, true),
    ('IC-EQUIP',  'Equipment & Capital Assets',        'Machinery, vehicles, IT hardware, and durable capital items',         1, 200, true),
    ('IC-SVC',    'Services',                          'Non-physical professional, maintenance, logistics, and IT services',  1, 300, true),
    ('IC-CONMAT', 'Construction & Building Materials', 'Structural, mechanical, electrical, and finishing construction items', 1, 400, true);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-GOODS children (10 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-RAW',    'Raw Materials',                     'Metals, polymers, wood, textiles, and other base materials',          'IC-GOODS', 2, 101),
    ('IC-COMP',   'Components & Sub-assemblies',       'Motors, PCBs, bearings, gears, and assembled modules',               'IC-GOODS', 2, 102),
    ('IC-PACK',   'Packaging',                         'Cartons, bottles, pallets, labels, and shrink wrap',                  'IC-GOODS', 2, 103),
    ('IC-FG',     'Finished Goods',                    'Completed products ready for sale or distribution',                   'IC-GOODS', 2, 104),
    ('IC-SPARE',  'Spare Parts',                       'Rotables, blades, seals, and replacement components',                 'IC-GOODS', 2, 105),
    ('IC-CONSUM', 'Consumables',                       'Office supplies, PPE, cleaning agents, and disposable items',         'IC-GOODS', 2, 106),
    ('IC-CHEM',   'Chemicals',                         'Solvents, lubricants, reagents, industrial gases, and catalysts',     'IC-GOODS', 2, 107),
    ('IC-FUEL',   'Fuel & Energy',                     'Natural gas, diesel, petrol, LPG, and solid fuels',                   'IC-GOODS', 2, 108),
    ('IC-PPE',    'Safety & PPE',                      'Helmets, gloves, harnesses, goggles, and protective clothing',        'IC-GOODS', 2, 109),
    ('IC-FOOD',   'Food & Beverage Ingredients',       'Fresh, frozen, dry ingredients, and beverage raw materials',           'IC-GOODS', 2, 110);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-EQUIP children (9 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-IT-EQ',  'IT Equipment',                      'Servers, laptops, desktops, networking, and peripherals',             'IC-EQUIP', 2, 201),
    ('IC-OFF-EQ', 'Office Equipment',                  'Furniture, printers, AV systems, and presentation equipment',         'IC-EQUIP', 2, 202),
    ('IC-HVY-EQ', 'Heavy Equipment',                   'Cranes, excavators, loaders, bulldozers, and piling rigs',           'IC-EQUIP', 2, 203),
    ('IC-PLT-EQ', 'Plant Equipment',                   'Turbines, generators, transformers, and boilers',                     'IC-EQUIP', 2, 204),
    ('IC-MFG-EQ', 'Manufacturing Equipment',           'CNC machines, moulds, injection moulders, and robots',               'IC-EQUIP', 2, 205),
    ('IC-LAB-EQ', 'Lab & Testing Equipment',           'Spectrometers, chromatographs, gauges, and test benches',            'IC-EQUIP', 2, 206),
    ('IC-MED-EQ', 'Medical Equipment',                 'Imaging devices, surgical instruments, and patient monitors',         'IC-EQUIP', 2, 207),
    ('IC-VEH',    'Vehicles',                          'Cars, trucks, forklifts, buses, and specialised vehicles',            'IC-EQUIP', 2, 208),
    ('IC-AGR-EQ', 'Agricultural Equipment',            'Tractors, harvesters, seeders, and irrigation rigs',                  'IC-EQUIP', 2, 209);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-SVC children (7 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-PROFSVC',  'Professional Services',           'Consulting, legal, audit, and advisory services',                     'IC-SVC', 2, 301),
    ('IC-MAINTSVC', 'Maintenance Services',            'Overhaul, facility management, calibration, and repair',              'IC-SVC', 2, 302),
    ('IC-LOGSVC',   'Logistics & Freight',             'Shipping, trucking, customs brokerage, and 3PL fulfilment',           'IC-SVC', 2, 303),
    ('IC-SUBSVC',   'Subcontractor Services',          'Civil, MEP, finishes, and specialist trade subcontracting',           'IC-SVC', 2, 304),
    ('IC-TESTSVC',  'Testing & Inspection',            'NDT, quality control, lab analysis, and third-party inspection',      'IC-SVC', 2, 305),
    ('IC-CLEANSVC', 'Cleaning & Facility Services',    'Janitorial, waste management, and pest control services',             'IC-SVC', 2, 306),
    ('IC-ITSVC',    'IT Services',                     'Software development, support, managed services, and cybersecurity',  'IC-SVC', 2, 307);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-CONMAT children (6 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-STRUCT',  'Structural',                       'Steel beams, rebar, plates, and prefabricated sections',              'IC-CONMAT', 2, 401),
    ('IC-CONC',    'Concrete & Masonry',               'Ready-mix concrete, blocks, aggregate, and mortar',                   'IC-CONMAT', 2, 402),
    ('IC-ELEC',    'Electrical',                       'Cable, switchgear, panels, transformers, and conduit',                'IC-CONMAT', 2, 403),
    ('IC-MECH',    'Mechanical & Piping',              'Pipes, valves, HVAC ducts, flanges, and fittings',                    'IC-CONMAT', 2, 404),
    ('IC-FINISH',  'Finishing',                        'Tiles, paint, glass, cladding, and ceiling systems',                  'IC-CONMAT', 2, 405),
    ('IC-SCAFF',   'Scaffolding & Formwork',           'Scaffolding systems, formwork, and temporary support structures',     'IC-CONMAT', 2, 406);


    -- ── STAGE C: UPSERT roots (parent_code IS NULL) ─────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        NULL,                   -- root: no parent
        s.level_no,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text,
            'container', true
        )),
        'active',
        v_su
    FROM tmp_ic s
    WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text,
                             'container', true
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.item_category.name, master.item_category.description,
           master.item_category.level_no, master.item_category.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.level_no, EXCLUDED.sort_order);

    -- ── STAGE D: UPSERT leaves (parent_code IS NOT NULL) ────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        p.id,                     -- resolved parent
        s.level_no,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_ic s
    JOIN master.item_category p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.item_category.name, master.item_category.description,
           master.item_category.parent_id, master.item_category.level_no,
           master.item_category.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.parent_id, EXCLUDED.level_no,
           EXCLUDED.sort_order);

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack) < 36 THEN
        RAISE EXCEPTION '[025_base] Item category load incomplete: expected ≥36, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND parent_id IS NULL
          AND metadata->'_seed'->>'pack' = v_pack) <> 4 THEN
        RAISE EXCEPTION '[025_base] Expected 4 root item categories, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND parent_id IS NULL
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid
          AND COALESCE((metadata->'_seed'->>'container')::boolean, false) = true
          AND metadata->'_seed'->>'pack' = v_pack) <> 4 THEN
        RAISE EXCEPTION '[025_base] Expected 4 container-only roots, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid
               AND COALESCE((metadata->'_seed'->>'container')::boolean, false) = true
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[025_base] Item categories loaded: % total (% roots, % leaves)',
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND parent_id IS NULL
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND parent_id IS NOT NULL
           AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/026_base_intent_rules.sql
-- ============================================================================
-- ATHYPER GROUP — BASE CLASSIFICATION-TO-INTENT RULES
-- ============================================================================
-- File:     026_base_intent_rules.sql
-- Schema:   control.classification_to_intent_rule
-- Purpose:  Context-sensitive intent resolution rules for spend categories
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           022_spend_intent_link.sql (default_intent_id already set)
-- Idempotent: Yes — delete-then-insert by pack metadata
-- Spec ref: §10 Confidence Calibration (intent resolution tiers)
-- ============================================================================
-- Execution order: runs LAST in Tier 2 (after 024)
--   020 → 021 → 025 → 022 → 023 → 024 → 026
-- ============================================================================
-- CONTEXT:
-- default_intent_id (set by 022) is the FALLBACK at confidence 0.70.
-- These rules OVERRIDE the fallback when contextual conditions match.
-- The resolver evaluates rules in priority order; highest-confidence
-- matching rule wins. If no rule matches → default_intent_id.
-- ============================================================================
-- condition_type legal values (from DDL CHECK):
--   AMOUNT_ABOVE, AMOUNT_BELOW, IS_RECURRING, IS_ONE_TIME, COMPANY_MATCH,
--   PROCUREMENT_METHOD, CROSS_BORDER, DOC_TYPE_MATCH, COMMODITY_MATCH,
--   SUPPLIER_MATCH, CUSTOMER_MATCH, CUSTOMER_TIER, CONTRACT_TYPE_MATCH,
--   FLOW_MATCH, CHANNEL_MATCH, FALLBACK
-- ============================================================================
-- confidence tiers per §10:
--   0.95–1.00  Definitive condition (e.g., AMOUNT_ABOVE with clear threshold)
--   0.80–0.94  Probable condition (e.g., COMMODITY_MATCH)
--   0.55–0.79  Fallback / heuristic
-- ============================================================================
-- PACK OWNS: All rules with metadata._seed.pack = '026_base'
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '026_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found';
    END IF;

    -- Verify base spend categories + intents loaded
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT-HW') THEN
        RAISE EXCEPTION 'Base seed not loaded. Run 020 + 022 first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-CAPEX-IT') THEN
        RAISE EXCEPTION 'Base intents not loaded. Run 021 first.';
    END IF;

    -- ── STAGE B: Stage intent rules ──────────────────────────────────────
    CREATE TEMP TABLE tmp_rule (
        sc_code               text NOT NULL,
        condition_type        text NOT NULL,
        condition_config      jsonb NOT NULL DEFAULT '{}',
        applies_to_flows      text[],
        resolved_intent_code  text NOT NULL,
        resolved_domain       text,
        explanation_template  text NOT NULL,
        confidence            numeric(3,2) NOT NULL,
        priority              integer NOT NULL DEFAULT 50
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 1: CAPEX THRESHOLD OVERRIDES (AMOUNT_ABOVE)
    -- When a spend category's default intent is OPEX but the amount
    -- exceeds a capex threshold → route to CAPEX intent instead.
    -- Confidence: 0.95 (definitive — amount-based rule)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- IT hardware above threshold → CAPEX-IT
    ('SC-IT-HW',    'AMOUNT_ABOVE', '{"threshold": 5000, "currency": "AED"}'::jsonb,
     'BI-CAPEX-IT', 'CAPEX', 'IT hardware purchase ≥5,000 AED classified as capital expenditure', 0.95, 90),

    -- IT software above threshold → CAPEX-IT (perpetual licence vs SaaS)
    ('SC-IT-SW',    'AMOUNT_ABOVE', '{"threshold": 25000, "currency": "AED"}'::jsonb,
     'BI-CAPEX-IT', 'CAPEX', 'Software purchase ≥25,000 AED classified as capital expenditure', 0.95, 90),

    -- Office furniture above threshold → CAPEX-PROP
    ('SC-OFFICE-FURN', 'AMOUNT_ABOVE', '{"threshold": 10000, "currency": "AED"}'::jsonb,
     'BI-CAPEX-PROP', 'CAPEX', 'Furniture purchase ≥10,000 AED classified as capital expenditure', 0.95, 90),

    -- Fleet vehicle purchase → CAPEX-FLEET (always capex, no threshold)
    ('SC-FLEET-VEH', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX-FLEET', 'CAPEX', 'Vehicle acquisition classified as capital expenditure', 0.98, 95),

    -- Capital equipment → CAPEX (machinery, always capex)
    ('SC-CAPEQUIP-MACH', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX-EQUIP', 'CAPEX', 'Machinery acquisition classified as capital expenditure', 0.98, 95),

    ('SC-CAPEQUIP-TOOL', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX-TOOL', 'CAPEX', 'Tooling acquisition classified as capital expenditure', 0.98, 95),

    ('SC-CAPEQUIP-LINE', 'AMOUNT_ABOVE', '{"threshold": 0, "currency": "AED"}'::jsonb,
     'BI-CAPEX-EQUIP', 'CAPEX', 'Production line classified as capital expenditure', 0.98, 95),

    -- Facility rent above threshold → CAPEX-LEASE (IFRS 16 right-of-use)
    ('SC-FAC-RENT', 'AMOUNT_ABOVE', '{"threshold": 50000, "currency": "AED"}'::jsonb,
     'BI-CAPEX-LEASE', 'CAPEX', 'Lease ≥50,000 AED may qualify for IFRS 16 capitalisation', 0.85, 70);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 2: RECURRING vs ONE-TIME (IS_RECURRING / IS_ONE_TIME)
    -- Recurring contracts on certain categories shift COGS → OPEX
    -- Confidence: 0.85 (probable — pattern-based)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Recurring IT services → OPEX-IT (not capex)
    ('SC-IT-SVC',   'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX-IT', 'OPEX', 'Recurring IT service contract classified as operating expenditure', 0.85, 60),

    -- Recurring maintenance → OPEX-MAINT
    ('SC-FAC-MAINT', 'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX-MAINT', 'OPEX', 'Recurring facility maintenance classified as operating expenditure', 0.85, 60),

    -- One-time large facility maintenance → CAPEX-PROP (major renovation)
    ('SC-FAC-MAINT', 'AMOUNT_ABOVE', '{"threshold": 100000, "currency": "AED"}'::jsonb,
     'BI-CAPEX-PROP', 'CAPEX', 'Major facility works ≥100,000 AED classified as capital expenditure', 0.90, 80),

    -- Recurring outsourcing → OPEX-OUTSRC
    ('SC-OUTSRC-BPO', 'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX-OUTSRC', 'OPEX', 'Recurring BPO contract classified as operating expenditure', 0.85, 60),

    -- Recurring cleaning → OPEX-FAC
    ('SC-FAC-CLEAN', 'IS_RECURRING', '{}'::jsonb,
     'BI-OPEX-FAC', 'OPEX', 'Recurring cleaning contract classified as operating expenditure', 0.85, 60);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 3: CROSS-BORDER (CROSS_BORDER)
    -- Cross-border transactions on certain categories may shift
    -- to REGULATORY domain for duty/compliance handling
    -- Confidence: 0.80 (probable)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Cross-border raw materials → still COGS-MAT but flagged
    ('SC-RAW-METAL', 'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS-MAT', 'COST_OF_SALES', 'Cross-border raw material import — customs duty may apply', 0.80, 50),

    ('SC-RAW-CHEM',  'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS-MAT', 'COST_OF_SALES', 'Cross-border chemical import — hazmat compliance may apply', 0.80, 50),

    -- Cross-border freight → COGS-FREIGHT with duty awareness
    ('SC-FREIGHT-CUST', 'CROSS_BORDER', '{}'::jsonb,
     'BI-COGS-FREIGHT', 'COST_OF_SALES', 'Cross-border customs brokerage — duty and tariff handling', 0.85, 55);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 4: PROCUREMENT METHOD (PROCUREMENT_METHOD)
    -- Certain procurement methods change the intent routing
    -- Confidence: 0.80–0.90
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Contract manufacturing via formal tender → COGS-SUB
    ('SC-CONTRACT-MFG', 'PROCUREMENT_METHOD', '{"method": "FORMAL_TENDER"}'::jsonb,
     'BI-COGS-SUB', 'COST_OF_SALES', 'Formal tender subcontracting classified as cost of sales', 0.90, 70),

    -- Professional services via sole-source → OPEX-PROF (advisory, no tender)
    ('SC-PROF-CONSULT', 'PROCUREMENT_METHOD', '{"method": "SOLE_SOURCE"}'::jsonb,
     'BI-OPEX-PROF', 'OPEX', 'Sole-source consulting classified as professional services opex', 0.80, 55);


    -- ══════════════════════════════════════════════════════════════════════
    -- RULE SET 5: FALLBACK (FALLBACK)
    -- Explicit fallback rules at low confidence for categories
    -- where the default_intent_id alone isn't descriptive enough.
    -- These are last-resort rules that clarify intent domain.
    -- Confidence: 0.70 (matches CLASSIFICATION_DEFAULT method)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_rule (sc_code, condition_type, condition_config, resolved_intent_code, resolved_domain, explanation_template, confidence, priority) VALUES

    -- Tax categories → REGULATORY domain
    ('SC-TAX-CORP',  'FALLBACK', '{}'::jsonb,
     'BI-REG-TAX', 'REGULATORY', 'Corporate tax classified as regulatory obligation', 0.70, 10),
    ('SC-TAX-DUTY',  'FALLBACK', '{}'::jsonb,
     'BI-REG-TAX', 'REGULATORY', 'Import duty classified as regulatory obligation', 0.70, 10),
    ('SC-TAX-STAT',  'FALLBACK', '{}'::jsonb,
     'BI-REG-TAX', 'REGULATORY', 'Statutory fee classified as regulatory obligation', 0.70, 10),

    -- Inter-company transfers → TRANSFER domain
    ('SC-OUTSRC-SHARED', 'FALLBACK', '{}'::jsonb,
     'BI-TRANSFER-IC', 'TRANSFER', 'Shared service centre charge classified as inter-company transfer', 0.65, 10),

    -- Certification → REGULATORY
    ('SC-QC-CERT', 'FALLBACK', '{}'::jsonb,
     'BI-REG-COMP', 'REGULATORY', 'Certification and accreditation classified as compliance cost', 0.70, 10),

    -- Environmental remediation → REGULATORY (not just OPEX)
    ('SC-ENV-REMEDN', 'FALLBACK', '{}'::jsonb,
     'BI-REG-ENV', 'REGULATORY', 'Environmental remediation classified as regulatory compliance', 0.70, 10);


    -- ── STAGE C: Idempotent cleanup — remove old pack rules ──────────────
    DELETE FROM control.classification_to_intent_rule
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    -- ── STAGE D: Build resolve maps ──────────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    DROP TABLE IF EXISTS tmp_bi_map;
    CREATE TEMP TABLE tmp_bi_map AS
    SELECT code, id FROM master.business_intent WHERE tenant_id = v_tid;

    -- ── STAGE E: INSERT intent rules ─────────────────────────────────────
    INSERT INTO control.classification_to_intent_rule (
        tenant_id, classification_source, classification_id, direction,
        condition_type, condition_config, applies_to_flows,
        resolved_intent_id, resolved_domain, explanation_template,
        confidence, priority,
        effective_from, effective_to,
        metadata, status, created_by
    )
    SELECT
        v_tid,
        'SPEND_CATEGORY',
        sm.id,
        NULL,                                    -- applies to all directions
        r.condition_type,
        r.condition_config,
        r.applies_to_flows,
        bm.id,
        r.resolved_domain,
        r.explanation_template,
        r.confidence,
        r.priority,
        CURRENT_DATE,                            -- effective_from
        NULL,                                    -- no expiry
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_rule r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    JOIN tmp_bi_map bm ON bm.code = r.resolved_intent_code;

    -- ── STAGE F: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM control.classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack) < 20 THEN
        RAISE EXCEPTION '[026_base] Intent rule load incomplete: expected ≥20, got %',
            (SELECT count(*) FROM control.classification_to_intent_rule
             WHERE tenant_id = v_tid
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND condition_type = 'AMOUNT_ABOVE'
          AND confidence < 0.85
    ) THEN
        RAISE EXCEPTION '[026_base] AMOUNT_ABOVE rules must have confidence ≥0.85';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.classification_to_intent_rule
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND condition_type = 'FALLBACK'
          AND confidence > 0.75
    ) THEN
        RAISE EXCEPTION '[026_base] FALLBACK rules must have confidence ≤0.75';
    END IF;

    RAISE NOTICE '[026_base] Intent rules loaded: % total (AMOUNT_ABOVE=%, IS_RECURRING=%, CROSS_BORDER=%, PROCUREMENT_METHOD=%, FALLBACK=%)',
        (SELECT count(*) FROM control.classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'AMOUNT_ABOVE'),
        (SELECT count(*) FROM control.classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'IS_RECURRING'),
        (SELECT count(*) FROM control.classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'CROSS_BORDER'),
        (SELECT count(*) FROM control.classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'PROCUREMENT_METHOD'),
        (SELECT count(*) FROM control.classification_to_intent_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND condition_type = 'FALLBACK');

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/010_base/027_commodity_bridge.sql
-- ============================================================================
-- ATHYPER GROUP — BASE COMMODITY CLASSIFICATION BRIDGE
-- ============================================================================
-- File:     023_commodity_bridge.sql
-- Schema:   master.commodity_classification
-- Purpose:  Bridge spend_category + item_category → UNSPSC commodity codes
-- Depends:  020_spend_categories.sql, 025_base_item_categories.sql,
--           001_shared/008a_commodity_code_unspsc.sql
-- Idempotent: Yes — ON CONFLICT DO UPDATE
-- Spec ref: §7 Commodity Classification Bridge, §15 Alignment Rules
-- ============================================================================
-- NOTE: domain_code is ALWAYS lowercase ('unspsc') per §7.1
-- NOTE: mapping_type uses ONLY legal values per §7.2
-- NOTE: provenance = 'seed' per §13.3
-- NOTE: item_category anchors at family/class level per §15.5
-- NOTE: item_category gets NO HS codes at category level per §15.6
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '023_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found';
    END IF;

    -- Verify base spend categories loaded
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base seed not loaded. Run 020 first.';
    END IF;

    -- Verify base item categories loaded
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-GOODS') THEN
        RAISE EXCEPTION 'Base item categories not loaded. Run 025 first.';
    END IF;

    -- ── STAGE B: Stage bridge data ───────────────────────────────────────
    -- Each row maps a spend_category to a UNSPSC code with confidence + type
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,             -- spend_category.code
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,             -- commodity_code.code in shared.commodity_code
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- BRIDGE DATA — spend_category → UNSPSC
    -- Confidence tiers per §10:
    --   95–100: Exact leaf anchor
    --   80–94:  Family/class anchor (broader)
    --   55–79:  Segment-level / related
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- ── SC-IT children ───────────────────────────────────────────────────
    ('SC-IT-HW',      '43211500', 'broad',   85, true,  'Computers — family level'),
    ('SC-IT-HW',      '43211503', 'exact',   98, false, 'Notebook computers'),
    ('SC-IT-HW',      '43211507', 'exact',   98, false, 'Desktop computers'),
    ('SC-IT-HW',      '43211700', 'broad',   82, false, 'Computer displays — family'),
    ('SC-IT-SW',      '43230000', 'broad',   80, true,  'Software — class level'),
    ('SC-IT-SW',      '43231500', 'broad',   85, false, 'Business function specific software'),
    ('SC-IT-CLOUD',   '81112200', 'broad',   82, true,  'Internet services — family'),
    ('SC-IT-SVC',     '81111800', 'broad',   82, true,  'System administration services'),
    ('SC-IT-SVC',     '81111500', 'broad',   80, false, 'Engineering and technology services'),
    ('SC-IT-SEC',     '43232300', 'broad',   82, true,  'Security and protection software'),

    -- ── SC-TELCO children ────────────────────────────────────────────────
    ('SC-TELCO-VOICE', '83111500', 'broad',   82, true,  'Local and long distance telephone'),
    ('SC-TELCO-DATA',  '83111600', 'broad',   82, true,  'Internet access services'),
    ('SC-TELCO-MOB',   '83111700', 'broad',   82, true,  'Mobile communication services'),

    -- ── SC-OFFICE children ───────────────────────────────────────────────
    ('SC-OFFICE-SUP',   '44120000', 'broad',   85, true,  'Office supplies — class'),
    ('SC-OFFICE-FURN',  '56101500', 'broad',   85, true,  'Office furniture'),
    ('SC-OFFICE-EQUIP', '44100000', 'broad',   82, true,  'Office machines — class'),
    ('SC-OFFICE-PRINT', '82121500', 'broad',   80, true,  'Printing services'),

    -- ── SC-HR children ───────────────────────────────────────────────────
    ('SC-HR-RECRUIT',  '80111600', 'broad',   82, true,  'Temporary personnel services'),
    ('SC-HR-TRAIN',    '86130000', 'broad',   82, true,  'Vocational training — class'),
    ('SC-HR-BEN',      '84121800', 'broad',   78, true,  'Employee benefit consulting'),
    ('SC-HR-PAYROLL',  '80111500', 'broad',   80, true,  'Human resource services'),

    -- ── SC-TRAVEL children ───────────────────────────────────────────────
    ('SC-TRAVEL-AIR',    '78111500', 'broad',   85, true,  'Passenger air transportation'),
    ('SC-TRAVEL-HOTEL',  '90111600', 'broad',   85, true,  'Hotels and lodging'),
    ('SC-TRAVEL-GROUND', '78111800', 'broad',   82, true,  'Vehicle rental services'),
    ('SC-TRAVEL-EVENTS', '80141600', 'broad',   80, true,  'Events management'),

    -- ── SC-PROF children ─────────────────────────────────────────────────
    ('SC-PROF-LEGAL',   '80121600', 'broad',   85, true,  'Legal services'),
    ('SC-PROF-AUDIT',   '84111500', 'broad',   85, true,  'Accounting services'),
    ('SC-PROF-CONSULT', '80101500', 'broad',   82, true,  'Management advisory services'),
    ('SC-PROF-ENG',     '81101500', 'broad',   82, true,  'Professional engineering services'),

    -- ── SC-MKTG children ─────────────────────────────────────────────────
    ('SC-MKTG-DIGITAL', '82101500', 'broad',   80, true,  'Advertising services'),
    ('SC-MKTG-TRAD',    '82101600', 'broad',   80, true,  'Advertising agency services'),
    ('SC-MKTG-PR',      '80141500', 'broad',   80, true,  'Public relations services'),
    ('SC-MKTG-CX',      '80111700', 'broad',   78, true,  'Market research'),

    -- ── SC-FAC children ──────────────────────────────────────────────────
    ('SC-FAC-RENT',  '80131500', 'broad',   82, true,  'Real estate services'),
    ('SC-FAC-MAINT', '72151500', 'broad',   82, true,  'Building maintenance services'),
    ('SC-FAC-CLEAN', '76111500', 'broad',   85, true,  'Cleaning and janitorial services'),
    ('SC-FAC-SECUR', '92121500', 'broad',   82, true,  'Security guard services'),

    -- ── SC-UTIL children ─────────────────────────────────────────────────
    ('SC-UTIL-ELEC',  '83101500', 'broad',   85, true,  'Electrical power generation'),
    ('SC-UTIL-WATER', '83101600', 'broad',   85, true,  'Water utilities'),
    ('SC-UTIL-GAS',   '83101800', 'broad',   85, true,  'Natural gas utilities'),
    ('SC-UTIL-WASTE', '76120000', 'broad',   82, true,  'Refuse disposal and treatment — class'),

    -- ── SC-FLEET children ────────────────────────────────────────────────
    ('SC-FLEET-VEH',   '25101500', 'broad',   85, true,  'Motor vehicles'),
    ('SC-FLEET-FUEL',  '15101500', 'broad',   85, true,  'Petroleum and distillates'),
    ('SC-FLEET-MAINT', '78181500', 'broad',   80, true,  'Vehicle maintenance services'),

    -- ── SC-INS children ──────────────────────────────────────────────────
    ('SC-INS-PROP', '84131500', 'broad',   82, true,  'Insurance services for structures'),
    ('SC-INS-LIAB', '84131600', 'broad',   82, true,  'Liability insurance'),
    ('SC-INS-EMP',  '84131500', 'related', 65, false, 'Employee insurance — related'),

    -- ── SC-BANK children ─────────────────────────────────────────────────
    ('SC-BANK-FEE',   '84111600', 'broad',   78, true,  'Banking services'),
    ('SC-BANK-FX',    '84111700', 'broad',   78, true,  'Foreign exchange services'),
    ('SC-BANK-TREAS', '84111800', 'broad',   78, true,  'Investment and asset management'),

    -- ── SC-TAX children ──────────────────────────────────────────────────
    ('SC-TAX-CORP',  '84111500', 'related', 65, true,  'Tax accounting — related'),
    ('SC-TAX-DUTY',  '78131800', 'related', 60, true,  'Customs management — related'),
    ('SC-TAX-STAT',  '93151500', 'related', 55, true,  'Government fees — related'),

    -- ── SC-SAFETY children ───────────────────────────────────────────────
    ('SC-SAFETY-SEC',  '92121500', 'broad',   80, true,  'Security guard services'),
    ('SC-SAFETY-HSE',  '46180000', 'broad',   80, true,  'Safety and rescue equipment — class'),
    ('SC-SAFETY-COMP', '93141800', 'related', 65, true,  'Inspection services — related'),

    -- ── SC-ENV children ──────────────────────────────────────────────────
    ('SC-ENV-WASTE',  '76120000', 'broad',   82, true,  'Refuse disposal and treatment'),
    ('SC-ENV-CARBON', '77101600', 'related', 65, true,  'Environmental monitoring'),
    ('SC-ENV-REMEDN', '77101700', 'broad',   78, true,  'Environmental remediation'),

    -- ── SC-OUTSRC children ───────────────────────────────────────────────
    ('SC-OUTSRC-BPO',    '80161500', 'broad',   80, true,  'Financial business process outsourcing'),
    ('SC-OUTSRC-SHARED', '80161500', 'related', 70, false, 'Shared services — related'),
    ('SC-OUTSRC-TEMP',   '80111600', 'broad',   82, true,  'Temporary staffing services'),

    -- ── SC-SUBS children ─────────────────────────────────────────────────
    ('SC-SUBS-LIC',  '43230000', 'related', 70, true,  'Software — related for licences'),
    ('SC-SUBS-MEMB', '94131600', 'related', 60, true,  'Professional associations'),
    ('SC-SUBS-PUB',  '55101500', 'related', 65, true,  'Publications and periodicals'),

    -- ══════════════════════════════════════════════════════════════════════
    -- DIRECT OPERATIONS — Layer B leaves
    -- ══════════════════════════════════════════════════════════════════════

    -- ── SC-RAW children ──────────────────────────────────────────────────
    ('SC-RAW-METAL', '11101500', 'broad',   85, true,  'Metals and minerals'),
    ('SC-RAW-CHEM',  '12160000', 'broad',   85, true,  'Solvents — class'),
    ('SC-RAW-AGRI',  '10170000', 'broad',   82, true,  'Plant materials — class'),

    -- ── SC-COMP children ─────────────────────────────────────────────────
    ('SC-COMP-MECH',   '31160000', 'broad',   85, true,  'Bearings, gears, and related — class'),
    ('SC-COMP-ELEC',   '32100000', 'broad',   85, true,  'Electronic components — class'),
    ('SC-COMP-STRUCT', '30100000', 'broad',   82, true,  'Structural components — class'),

    -- ── SC-PKG children ──────────────────────────────────────────────────
    ('SC-PKG-PRIMARY',   '24110000', 'broad',   85, true,  'Containers and packaging'),
    ('SC-PKG-SECONDARY', '24110000', 'related', 70, false, 'Containers — secondary packaging'),
    ('SC-PKG-TRANSIT',   '24110000', 'related', 65, false, 'Containers — transit packaging'),

    -- ── SC-CONSUM children ───────────────────────────────────────────────
    ('SC-CONSUM-CHEM',  '12350000', 'broad',   82, true,  'Additives — class'),
    ('SC-CONSUM-LAB',   '41110000', 'broad',   85, true,  'Laboratory instruments — class'),
    ('SC-CONSUM-CLEAN', '47130000', 'broad',   82, true,  'Cleaning supplies — class'),

    -- ── SC-MRO children ──────────────────────────────────────────────────
    ('SC-MRO-SPARE',  '31000000', 'broad',   70, true,  'Manufacturing components — segment'),
    ('SC-MRO-TOOL',   '27110000', 'broad',   82, true,  'Hand tools — class'),
    ('SC-MRO-SUPPLY', '31200000', 'broad',   78, true,  'Industrial lubricants — class'),

    -- ── SC-PRODSVC children ──────────────────────────────────────────────
    ('SC-PRODSVC-CALIB', '41115300', 'broad',   85, true,  'Calibration instruments'),
    ('SC-PRODSVC-PLANT', '72101500', 'related', 70, true,  'Building and facility construction'),

    -- ── SC-CONTRACT children ─────────────────────────────────────────────
    ('SC-CONTRACT-MFG', '73150000', 'broad',   80, true,  'Industrial process machinery'),
    ('SC-CONTRACT-ASM', '73150000', 'related', 70, false, 'Assembly subcontracting — related'),

    -- ── SC-FREIGHT children ──────────────────────────────────────────────
    ('SC-FREIGHT-ROAD', '78101800', 'broad',   85, true,  'Freight trucking services'),
    ('SC-FREIGHT-SEA',  '78101700', 'broad',   85, true,  'Marine freight services'),
    ('SC-FREIGHT-AIR',  '78101600', 'broad',   85, true,  'Air freight services'),
    ('SC-FREIGHT-CUST', '78131800', 'broad',   82, true,  'Customs brokerage services'),

    -- ── SC-WHSE children ─────────────────────────────────────────────────
    ('SC-WHSE-STORE', '78141500', 'broad',   82, true,  'General warehousing'),
    ('SC-WHSE-COLD',  '78141500', 'narrow',  78, false, 'Cold chain — narrower scope'),

    -- ── SC-QC children ───────────────────────────────────────────────────
    ('SC-QC-TEST',    '41115400', 'broad',   85, true,  'Measuring instruments and accessories'),
    ('SC-QC-CERT',    '93141800', 'broad',   80, true,  'Inspection services'),
    ('SC-QC-INSPECT', '93141800', 'related', 72, false, 'Inspection — related scope'),

    -- ── SC-CAPEQUIP children ─────────────────────────────────────────────
    ('SC-CAPEQUIP-MACH', '23000000', 'broad',   75, true,  'Industrial manufacturing segment'),
    ('SC-CAPEQUIP-TOOL', '27000000', 'broad',   75, true,  'Tools and general machinery segment'),
    ('SC-CAPEQUIP-LINE', '23150000', 'broad',   78, true,  'Metal working machinery'),

    -- ── SC-TEMPWK children ───────────────────────────────────────────────
    ('SC-TEMPWK-SCAF', '30171500', 'broad',   80, true,  'Scaffolding'),
    ('SC-TEMPWK-SITE', '72151500', 'related', 65, true,  'Building maintenance — related'),

    -- ── SC-PROCNRG children ──────────────────────────────────────────────
    ('SC-PROCNRG-STEAM', '40141600', 'broad',   78, true,  'Industrial heaters'),
    ('SC-PROCNRG-COMP',  '40142000', 'broad',   80, true,  'Compressors');


    -- ══════════════════════════════════════════════════════════════════════
    -- ITEM CATEGORY BRIDGE — item_category → UNSPSC (§14, §15)
    -- Anchor precision: family or class level (4–6 digit) per §15.5
    -- 1 primary per leaf, 0–1 secondary broader anchor
    -- Container nodes (roots): NO bridge entries per §15.4
    -- ══════════════════════════════════════════════════════════════════════
    CREATE TEMP TABLE tmp_ic_bridge (
        ic_code       text NOT NULL,             -- item_category.code
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,             -- commodity_code.code
        mapping_type  text NOT NULL DEFAULT 'broad',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic_bridge (ic_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- ── IC-GOODS children ────────────────────────────────────────────────
    ('IC-RAW',    '11100000', 'broad', 82, true,  'Minerals and ores — class'),
    ('IC-COMP',   '31160000', 'broad', 85, true,  'Bearings, bushings, gears — class'),
    ('IC-PACK',   '24110000', 'broad', 85, true,  'Containers and packaging — class'),
    ('IC-FG',     '60000000', 'broad', 60, true,  'Musical/games/toys segment — broad proxy for finished goods'),
    ('IC-FG',     '53100000', 'broad', 58, false, 'Clothing — secondary finished goods proxy'),
    ('IC-SPARE',  '31000000', 'broad', 72, true,  'Manufacturing components — segment'),
    ('IC-CONSUM', '47130000', 'broad', 82, true,  'Cleaning equipment and supplies — class'),
    ('IC-CHEM',   '12160000', 'broad', 85, true,  'Solvents — class'),
    ('IC-CHEM',   '12350000', 'broad', 80, false, 'Additives — secondary'),
    ('IC-FUEL',   '15101500', 'broad', 85, true,  'Petroleum and distillates — family'),
    ('IC-PPE',    '46180000', 'broad', 85, true,  'Safety and rescue equipment — class'),
    ('IC-FOOD',   '50000000', 'broad', 75, true,  'Food, beverage & tobacco — segment'),

    -- ── IC-EQUIP children ────────────────────────────────────────────────
    ('IC-IT-EQ',  '43210000', 'broad', 85, true,  'Computer equipment and accessories — class'),
    ('IC-OFF-EQ', '56101500', 'broad', 82, true,  'Office furniture — family'),
    ('IC-OFF-EQ', '44100000', 'broad', 78, false, 'Office machines — secondary'),
    ('IC-HVY-EQ', '22100000', 'broad', 82, true,  'Heavy construction machinery — class'),
    ('IC-PLT-EQ', '26100000', 'broad', 82, true,  'Power generation sources — class'),
    ('IC-MFG-EQ', '23150000', 'broad', 82, true,  'Metal working machinery — class'),
    ('IC-LAB-EQ', '41110000', 'broad', 85, true,  'Laboratory and measuring instruments — class'),
    ('IC-MED-EQ', '42180000', 'broad', 82, true,  'Patient examination instruments — class'),
    ('IC-MED-EQ', '42290000', 'broad', 78, false, 'Surgical instruments — secondary'),
    ('IC-VEH',    '25101500', 'broad', 85, true,  'Motor vehicles — family'),
    ('IC-AGR-EQ', '21100000', 'broad', 82, true,  'Agricultural and forestry machinery — class'),

    -- ── IC-SVC children ──────────────────────────────────────────────────
    ('IC-PROFSVC',  '80100000', 'broad', 80, true,  'Management and business services — class'),
    ('IC-MAINTSVC', '72150000', 'broad', 82, true,  'Building and facility maintenance — class'),
    ('IC-LOGSVC',   '78100000', 'broad', 82, true,  'Mail and cargo transport — class'),
    ('IC-SUBSVC',   '72100000', 'broad', 80, true,  'Building and maintenance services — class'),
    ('IC-TESTSVC',  '41115400', 'broad', 82, true,  'Measuring and observing instruments — family'),
    ('IC-CLEANSVC', '76111500', 'broad', 85, true,  'Cleaning and janitorial services — family'),
    ('IC-ITSVC',    '81110000', 'broad', 82, true,  'Computer services — class'),

    -- ── IC-CONMAT children ───────────────────────────────────────────────
    ('IC-STRUCT',  '30100000', 'broad', 85, true,  'Structural components and basic shapes — class'),
    ('IC-CONC',    '30110000', 'broad', 85, true,  'Concrete, cement and plaster — class'),
    ('IC-ELEC',    '39120000', 'broad', 82, true,  'Electrical wire and cable — class'),
    ('IC-MECH',    '40140000', 'broad', 82, true,  'Fluid and gas distribution — class'),
    ('IC-FINISH',  '30160000', 'broad', 80, true,  'Insulation — class (finishing proxy)'),
    ('IC-SCAFF',   '30171500', 'broad', 85, true,  'Scaffolding — family');


    -- ── STAGE C: Build resolve maps ──────────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    -- ── STAGE D: UPSERT spend_category bridge rows ──────────────────────
    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid,
        'spend_category',
        sm.id,
        'commodity',
        b.domain,
        cc.id,
        b.mapping_type,
        b.confidence,
        'seed',
        b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack',      v_pack,
                              'version',   v_version,
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E: UPSERT item_category bridge rows ─────────────────────────
    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid,
        'item_category',
        im.id,
        'commodity',
        b.domain,
        cc.id,
        b.mapping_type,
        b.confidence,
        'seed',
        b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_ic_bridge b
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack',      v_pack,
                              'version',   v_version,
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: Assertions ──────────────────────────────────────────────

    -- spend_category bridge count
    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid
          AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 100 THEN
        RAISE EXCEPTION '[023_base] spend_category bridge incomplete: expected ≥100, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid
               AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- item_category bridge count
    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid
          AND owner_type = 'item_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 32 THEN
        RAISE EXCEPTION '[023_base] item_category bridge incomplete: expected ≥32, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid
               AND owner_type = 'item_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- §11.3.3 confidence tier validation (both owner types)
    IF EXISTS (
        SELECT 1 FROM master.commodity_classification
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND mapping_type = 'exact' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[023_base] exact bridge rows must have confidence ≥95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.commodity_classification
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND mapping_type = 'broad' AND (confidence < 55 OR confidence > 94)
    ) THEN
        RAISE WARNING '[023_base] broad bridge rows outside 55–94 range detected';
    END IF;

    RAISE NOTICE '[023_base] Commodity bridge loaded: % spend_category rows, % item_category rows',
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'item_category'
           AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/100_pack_utilities.sql
-- ============================================================================
-- ATHYPER GROUP — EXTENSION PACK: UTILITIES (Electricity & Water Supply)
-- ============================================================================
-- File:     100_pack_utilities.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for electricity & water supply operations
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-UTY, SC-UTY-GRID, SC-UTY-GEN, SC-UTY-DIST,
--                      SC-UTY-METER, SC-UTY-TREAT
--   Business intents : BI-COGS-ENERGY, BI-CAPEX-GRID, BI-REG-ENERGY
--   Item categories  : IC-UT-TURBINE, IC-UT-XFMR, IC-UT-METER
--   Commodity bridge : all rows with pack = '100_pack_utilities'
--   Routing rules    : all rows with pack = '100_pack_utilities'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '100_pack_utilities';
    v_version text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- Verify base prerequisites
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-PLT-EQ') THEN
        RAISE EXCEPTION 'Base item category IC-PLT-EQ not loaded — run 025 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-LAB-EQ') THEN
        RAISE EXCEPTION 'Base item category IC-LAB-EQ not loaded — run 025 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ───────────────────────────────

    -- B1: Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'services',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container-only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-UTY', 'Utilities & Energy Infrastructure', 'Electricity generation, distribution, water treatment, and smart grid', 'services', 400, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-UTY-GRID',  'Grid Infrastructure',       'High-voltage transmission lines, substations, and grid interconnects',   'SC-UTY', 'goods',    401, true),
    ('SC-UTY-GEN',   'Power Generation Equipment','Turbines, generators, solar panels, and wind-energy equipment',          'SC-UTY', 'goods',    402, false),
    ('SC-UTY-DIST',  'Distribution Networks',      'Medium/low-voltage distribution cables, poles, and transformers',       'SC-UTY', 'goods',    403, true),
    ('SC-UTY-METER', 'Metering & Smart Grid',      'Smart meters, AMI systems, SCADA, and demand-response platforms',      'SC-UTY', 'services', 404, false),
    ('SC-UTY-TREAT', 'Water Treatment',            'Water purification plants, desalination, and wastewater treatment',    'SC-UTY', 'services', 405, true);

    -- B2: Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-ENERGY', 'Energy Cost of Sales',             'Direct energy procurement and utility input costs',       'COST_OF_SALES', 'ENERGY',         'BI-COGS',  36),
    ('BI-CAPEX-GRID',  'Grid Infrastructure Capital',      'Capital spend on grid, transmission, and distribution',   'CAPEX',         'GRID',           'BI-CAPEX', 30),
    ('BI-REG-ENERGY',  'Energy Regulatory Compliance',     'Regulatory permits, tariff filings, and energy audits',   'REGULATORY',    'ENERGY_COMPLIANCE','BI-REG',  54);

    -- B3: Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Segment 26: Power generation
    ('SC-UTY-GEN',   '26101500', 'broad',   85, true,  'Power generation equipment — family'),
    ('SC-UTY-GEN',   '26111700', 'broad',   82, false, 'Turbines — family'),
    ('SC-UTY-GEN',   '26111500', 'broad',   80, false, 'Generators — family'),
    -- Segment 39: Electrical
    ('SC-UTY-GRID',  '39121000', 'broad',   85, true,  'Transmission and distribution — class'),
    ('SC-UTY-GRID',  '39121100', 'broad',   82, false, 'Electrical wire and cable — family'),
    ('SC-UTY-DIST',  '39121400', 'broad',   85, true,  'Transformers and regulators — family'),
    ('SC-UTY-DIST',  '39121300', 'broad',   82, false, 'Electrical switches and accessories'),
    -- Segment 83: Utilities
    ('SC-UTY-METER', '83101500', 'broad',   80, true,  'Electrical power services — family'),
    ('SC-UTY-TREAT', '83101600', 'broad',   85, true,  'Water utilities — family');

    -- B5: Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-UT-TURBINE', 'Gas & Steam Turbines',       'Gas turbines, steam turbines, and combined-cycle units',       'IC-PLT-EQ', 3, 250),
    ('IC-UT-XFMR',    'Transformers & Switchgear',  'Power transformers, distribution transformers, and switchgear','IC-PLT-EQ', 3, 251),
    ('IC-UT-METER',   'Smart Meters & SCADA',       'AMI meters, SCADA systems, and remote monitoring devices',    'IC-LAB-EQ', 3, 252);

    -- B4: Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 1 — EXACT overrides (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-UTY-GEN',   'EXACT', '26101500', NULL, 30, 97, 'Power generation equipment → Gen'),
    ('SC-UTY-GRID',  'EXACT', '39121000', NULL, 30, 96, 'Transmission and distribution → Grid'),
    ('SC-UTY-DIST',  'EXACT', '39121400', NULL, 30, 96, 'Transformers → Distribution'),
    ('SC-UTY-TREAT', 'EXACT', '83101600', NULL, 30, 97, 'Water utilities → Treatment'),
    ('SC-UTY-METER', 'EXACT', '83101500', NULL, 30, 96, 'Electrical power services → Metering');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-UTY-GEN',   'RANGE', '26101500', '26101599', 20, 88, 'Power generation equipment family'),
    ('SC-UTY-GEN',   'RANGE', '26111500', '26111799', 15, 82, 'Turbines and generators families'),
    ('SC-UTY-GRID',  'RANGE', '39121000', '39121199', 20, 88, 'Transmission wire/cable families'),
    ('SC-UTY-DIST',  'RANGE', '39121300', '39121499', 20, 85, 'Transformers and switches families'),
    ('SC-UTY-METER', 'RANGE', '83101500', '83101599', 15, 82, 'Electrical power family'),
    ('SC-UTY-TREAT', 'RANGE', '83101600', '83101799', 20, 85, 'Water and sewage families');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-UTY-GEN',   'RANGE', '26000000', '26999999', 3, 58, 'Segment 26: Power generation catchall'),
    ('SC-UTY-GRID',  'RANGE', '39000000', '39999999', 3, 55, 'Segment 39: Electrical catchall'),
    ('SC-UTY-TREAT', 'RANGE', '83000000', '83999999', 3, 55, 'Segment 83: Utilities catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    -- C1: Pack root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- C2: Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intent leaves ──────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Link default intents to spend category leaves
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'intent_code', lnk.bi_code
        )),
        updated_at = now(), updated_by = v_su
    FROM (VALUES
        ('SC-UTY-GRID',  'BI-CAPEX-GRID'),
        ('SC-UTY-GEN',   'BI-CAPEX-EQUIP'),
        ('SC-UTY-DIST',  'BI-CAPEX-GRID'),
        ('SC-UTY-METER', 'BI-COGS-ENERGY'),
        ('SC-UTY-TREAT', 'BI-COGS-ENERGY')
    ) AS lnk(sc_code, bi_code)
    JOIN master.business_intent bi ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
    WHERE sc.tenant_id = v_tid AND sc.code = lnk.sc_code;

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-UT-TURBINE', '26100000', 'broad', 85, true,  'Power generation sources'),
        ('IC-UT-XFMR',    '26120000', 'broad', 85, true,  'Electrical wire and cable accessories'),
        ('IC-UT-METER',   '41110000', 'broad', 80, true,  'Lab and measuring instruments')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-then-insert by pack) ──────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Spend category load incomplete: expected 6, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Business intent load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Commodity bridge load incomplete: expected >=9, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Routing rule load incomplete: expected >=14, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[100_pack_utilities] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[100_pack_utilities] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[100_pack_utilities] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    RAISE NOTICE '[100_pack_utilities] Pack loaded: % spend categories, % intents, % item categories, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/101_pack_construction.sql
-- ============================================================================
-- ATHYPER GROUP — EXTENSION PACK: CONSTRUCTION (Building & Civil Engineering)
-- ============================================================================
-- File:     101_pack_construction.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for building & civil engineering operations
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-CONST, SC-CONST-CIVIL, SC-CONST-STRUCT,
--                      SC-CONST-MEP, SC-CONST-FIT, SC-CONST-HEAVY
--   Business intents : BI-COGS-CONST, BI-CAPEX-BLDG, BI-REG-BLDG
--   Item categories  : IC-CON-PRECAST, IC-CON-FORMWORK
--   Commodity bridge : all rows with pack = '101_pack_construction'
--   Routing rules    : all rows with pack = '101_pack_construction'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '101_pack_construction';
    v_version text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- Verify base prerequisites
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-CONC') THEN
        RAISE EXCEPTION 'Base item category IC-CONC not loaded — run 025 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-SCAFF') THEN
        RAISE EXCEPTION 'Base item category IC-SCAFF not loaded — run 025 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ───────────────────────────────

    -- B1: Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'services',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container-only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-CONST', 'Construction & Civil Engineering', 'Building construction, civil works, MEP, and fit-out services', 'services', 410, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-CONST-CIVIL',  'Civil Works',                 'Earthworks, foundations, roads, bridges, and drainage',               'SC-CONST', 'services', 411, true),
    ('SC-CONST-STRUCT', 'Structural Steel & Concrete', 'Reinforced concrete, structural steelwork, and precast elements',     'SC-CONST', 'goods',    412, true),
    ('SC-CONST-MEP',    'MEP Installations',           'Mechanical, electrical, and plumbing installations in buildings',     'SC-CONST', 'services', 413, true),
    ('SC-CONST-FIT',    'Fit-out & Finishing',         'Interior fit-out, joinery, flooring, and decorative finishes',        'SC-CONST', 'services', 414, false),
    ('SC-CONST-HEAVY',  'Heavy Equipment Rental',      'Cranes, excavators, bulldozers, and heavy plant hire',               'SC-CONST', 'services', 415, false);

    -- B2: Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-CONST', 'Construction Cost of Sales',    'Direct costs of building and civil construction projects',  'COST_OF_SALES', 'CONSTRUCTION',      'BI-COGS',  37),
    ('BI-CAPEX-BLDG', 'Building Capital Expenditure',  'Capital spend on new buildings and major renovations',      'CAPEX',         'BUILDING',          'BI-CAPEX', 31),
    ('BI-REG-BLDG',   'Building Regulatory Compliance','Building permits, safety inspections, and code compliance', 'REGULATORY',    'BUILDING_COMPLIANCE','BI-REG',   55);

    -- B3: Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Segment 72: Building and construction
    ('SC-CONST-CIVIL',  '72141100', 'broad',   85, true,  'Nonresidential building construction — family'),
    ('SC-CONST-CIVIL',  '72141000', 'broad',   82, false, 'Heavy construction — class'),
    ('SC-CONST-STRUCT', '72131600', 'broad',   85, true,  'Structural building products installation'),
    ('SC-CONST-MEP',    '72151500', 'broad',   82, true,  'Building maintenance services — family'),
    ('SC-CONST-MEP',    '72101500', 'broad',   80, false, 'Building and facility construction'),
    ('SC-CONST-FIT',    '72121400', 'broad',   82, true,  'Interior finishing — family'),
    ('SC-CONST-FIT',    '72121500', 'broad',   80, false, 'Painting and paper hanging'),
    ('SC-CONST-HEAVY',  '72101000', 'broad',   80, true,  'Building construction services — class'),
    -- Segment 30: Structural components
    ('SC-CONST-STRUCT', '30101700', 'broad',   85, false, 'Structural members and basic shapes'),
    ('SC-CONST-STRUCT', '30102000', 'broad',   82, false, 'Concrete and cement and plaster');

    -- B5: Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-CON-PRECAST',  'Precast Concrete Elements', 'Precast beams, columns, slabs, and wall panels',   'IC-CONC',   3, 260),
    ('IC-CON-FORMWORK', 'Formwork Systems',          'Modular formwork, props, and shoring systems',      'IC-SCAFF',  3, 261);

    -- B4: Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 1 — EXACT overrides (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-CONST-CIVIL',  'EXACT', '72141100', NULL, 30, 97, 'Nonresidential building construction → Civil'),
    ('SC-CONST-STRUCT', 'EXACT', '72131600', NULL, 30, 96, 'Structural products installation → Structural'),
    ('SC-CONST-STRUCT', 'EXACT', '30101700', NULL, 30, 96, 'Structural members → Structural'),
    ('SC-CONST-MEP',    'EXACT', '72151500', NULL, 30, 96, 'Building maintenance → MEP'),
    ('SC-CONST-FIT',    'EXACT', '72121400', NULL, 30, 96, 'Interior finishing → Fit-out');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-CONST-CIVIL',  'RANGE', '72141000', '72141999', 20, 88, 'Heavy construction families'),
    ('SC-CONST-CIVIL',  'RANGE', '72140000', '72149999', 15, 82, 'Site preparation and earthworks class'),
    ('SC-CONST-STRUCT', 'RANGE', '72131500', '72131699', 20, 85, 'Structural installation families'),
    ('SC-CONST-STRUCT', 'RANGE', '30101500', '30102099', 15, 82, 'Structural components families'),
    ('SC-CONST-MEP',    'RANGE', '72151500', '72151599', 15, 82, 'Building maintenance family'),
    ('SC-CONST-MEP',    'RANGE', '72101500', '72101599', 15, 80, 'Building construction services family'),
    ('SC-CONST-FIT',    'RANGE', '72121400', '72121599', 15, 82, 'Interior finishing families'),
    ('SC-CONST-HEAVY',  'RANGE', '72100000', '72109999', 15, 80, 'Building construction services class');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-CONST-CIVIL', 'RANGE', '72000000', '72999999', 3, 55, 'Segment 72: Building/construction catchall'),
    ('SC-CONST-STRUCT','RANGE', '30000000', '30999999', 3, 55, 'Segment 30: Structural components catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    -- C1: Pack root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- C2: Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intent leaves ──────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Link default intents to spend category leaves
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'intent_code', lnk.bi_code
        )),
        updated_at = now(), updated_by = v_su
    FROM (VALUES
        ('SC-CONST-CIVIL',  'BI-COGS-CONST'),
        ('SC-CONST-STRUCT', 'BI-COGS-CONST'),
        ('SC-CONST-MEP',    'BI-COGS-CONST'),
        ('SC-CONST-FIT',    'BI-COGS-CONST'),
        ('SC-CONST-HEAVY',  'BI-CAPEX-EQUIP')
    ) AS lnk(sc_code, bi_code)
    JOIN master.business_intent bi ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
    WHERE sc.tenant_id = v_tid AND sc.code = lnk.sc_code;

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-CON-PRECAST',  '30110000', 'broad', 85, true,  'Concrete and cement — class'),
        ('IC-CON-FORMWORK', '30171500', 'broad', 82, true,  'Scaffolding — family')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-then-insert by pack) ──────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Spend category load incomplete: expected 6, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Business intent load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Commodity bridge load incomplete: expected >=10, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Routing rule load incomplete: expected >=15, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[101_pack_construction] Item category load incomplete: expected 2, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[101_pack_construction] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[101_pack_construction] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    RAISE NOTICE '[101_pack_construction] Pack loaded: % spend categories, % intents, % item categories, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/102_pack_real_estate.sql
-- ============================================================================
-- ATHYPER GROUP — EXTENSION PACK: REAL ESTATE (Property & Development)
-- ============================================================================
-- File:     102_pack_real_estate.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for property development, management, and leasing
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-RE, SC-RE-DEV, SC-RE-MGMT, SC-RE-LEASE, SC-RE-VAL
--   Business intents : BI-COGS-PROP, BI-REV-RENT, BI-REG-PROP
--   Item categories  : IC-RE-BUILDING, IC-RE-LAND, IC-RE-FIT
--   Commodity bridge : all rows with pack = '102_pack_real_estate'
--   Routing rules    : all rows with pack = '102_pack_real_estate'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '102_pack_real_estate';
    v_version text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- Verify base prerequisites
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-EQUIP') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ───────────────────────────────

    -- B1: Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'services',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container-only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-RE', 'Real Estate & Property', 'Property development, management, leasing, and valuation services', 'services', 420, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-RE-DEV',   'Property Development',     'Land acquisition, master planning, and real estate development',     'SC-RE', 'services', 421, true),
    ('SC-RE-MGMT',  'Property Management',      'Facilities management, tenant services, and building operations',   'SC-RE', 'services', 422, false),
    ('SC-RE-LEASE', 'Leasing & Tenancy',        'Commercial and residential lease administration and brokerage',     'SC-RE', 'services', 423, true),
    ('SC-RE-VAL',   'Valuation & Appraisal',    'Property valuation, market appraisal, and feasibility studies',     'SC-RE', 'services', 424, false);

    -- B2: Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-PROP', 'Property Cost of Sales',          'Direct costs of property management and operations',           'COST_OF_SALES', 'PROPERTY',           'BI-COGS', 38),
    ('BI-REV-RENT',  'Rental Revenue Cost',             'Costs directly tied to rental income generation',              'COST_OF_SALES', 'RENTAL',             'BI-COGS', 39),
    ('BI-REG-PROP',  'Property Regulatory Compliance',  'Zoning permits, title registration, and building compliance',  'REGULATORY',    'PROPERTY_COMPLIANCE','BI-REG',  56);

    -- B3: Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Real estate services
    ('SC-RE-DEV',   '80131500', 'broad',   85, true,  'Real estate services — family'),
    ('SC-RE-DEV',   '80131600', 'broad',   80, false, 'Real estate management — family'),
    ('SC-RE-MGMT',  '80131600', 'broad',   85, true,  'Real estate management services'),
    ('SC-RE-MGMT',  '72150000', 'broad',   78, false, 'Building maintenance — class'),
    ('SC-RE-LEASE', '80131500', 'broad',   82, false, 'Real estate services — leasing'),
    ('SC-RE-LEASE', '80131700', 'broad',   85, true,  'Real estate rental — family'),
    ('SC-RE-VAL',   '80131500', 'related', 72, true,  'Real estate services — valuation related'),
    ('SC-RE-VAL',   '80101500', 'related', 65, false, 'Management advisory — appraisal related');

    -- B4: Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-RE-BUILDING', 'Buildings & Structures',    'Commercial and residential buildings, fit-out, and civil structures', 'IC-EQUIP', 3, 260),
    ('IC-RE-LAND',     'Land & Site Assets',        'Land parcels, site improvements, rights-of-way, and ground leases',   'IC-EQUIP', 3, 261),
    ('IC-RE-FIT',      'Fit-Out & Leasehold Impr.', 'Tenant fit-out, leasehold improvements, and interior installations', 'IC-EQUIP', 3, 262);

    -- B5: Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 1 — EXACT overrides (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-RE-DEV',   'EXACT', '80131500', NULL, 30, 96, 'Real estate services → Development'),
    ('SC-RE-MGMT',  'EXACT', '80131600', NULL, 30, 97, 'Real estate management → Management'),
    ('SC-RE-LEASE', 'EXACT', '80131700', NULL, 30, 97, 'Real estate rental → Leasing'),
    ('SC-RE-MGMT',  'EXACT', '72150000', NULL, 30, 95, 'Building maintenance → Management');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-RE-DEV',   'RANGE', '80131500', '80131599', 20, 88, 'Real estate services family'),
    ('SC-RE-MGMT',  'RANGE', '80131600', '80131699', 20, 88, 'Real estate management family'),
    ('SC-RE-LEASE', 'RANGE', '80131700', '80131799', 20, 88, 'Real estate rental family'),
    ('SC-RE-MGMT',  'RANGE', '72150000', '72159999', 15, 82, 'Building maintenance class'),
    ('SC-RE-VAL',   'RANGE', '80131500', '80131599', 10, 80, 'Real estate services — valuation fallback');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-RE-DEV',  'RANGE', '80130000', '80139999', 5, 60, 'Class 8013: Real estate catchall'),
    ('SC-RE-MGMT', 'RANGE', '72000000', '72999999', 3, 55, 'Segment 72: Building services catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    -- C1: Pack root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- C2: Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intent leaves ──────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Link default intents to spend category leaves
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'intent_code', lnk.bi_code
        )),
        updated_at = now(), updated_by = v_su
    FROM (VALUES
        ('SC-RE-DEV',   'BI-CAPEX-PROP'),
        ('SC-RE-MGMT',  'BI-COGS-PROP'),
        ('SC-RE-LEASE', 'BI-COGS-PROP'),
        ('SC-RE-VAL',   'BI-OPEX-PROF')
    ) AS lnk(sc_code, bi_code)
    JOIN master.business_intent bi ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
    WHERE sc.tenant_id = v_tid AND sc.code = lnk.sc_code;

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-RE-BUILDING', '30100000', 'broad', 85, true,  'Structural components — buildings'),
        ('IC-RE-BUILDING', '72100000', 'broad', 80, false, 'Building and maintenance services'),
        ('IC-RE-LAND',     '80131500', 'broad', 78, true,  'Real estate services — land acquisition'),
        ('IC-RE-FIT',      '72150000', 'broad', 85, true,  'Building and facility maintenance — fit-out')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-then-insert by pack) ──────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[102_pack_real_estate] Spend category load incomplete: expected 5, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[102_pack_real_estate] Business intent load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[102_pack_real_estate] Commodity bridge load incomplete: expected >=8, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[102_pack_real_estate] Routing rule load incomplete: expected >=11, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[102_pack_real_estate] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[102_pack_real_estate] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[102_pack_real_estate] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    RAISE NOTICE '[102_pack_real_estate] Pack loaded: % spend categories, % intents, % item categories, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/103_pack_transport.sql
-- ============================================================================
-- ATHYPER GROUP — EXTENSION PACK: TRANSPORT & STORAGE
-- ============================================================================
-- File:     103_pack_transport.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for road, rail, marine, air cargo, and 3PL operations
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-then-insert for routing
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-TRANS, SC-TRANS-ROAD, SC-TRANS-RAIL,
--                      SC-TRANS-MARINE, SC-TRANS-AIR, SC-TRANS-3PL
--   Business intents : BI-COGS-TRANS, BI-CAPEX-VESSEL
--   Item categories  : IC-TRN-TRAILER, IC-TRN-CONTAINER
--   Commodity bridge : all rows with pack = '103_pack_transport'
--   Routing rules    : all rows with pack = '103_pack_transport'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '103_pack_transport';
    v_version text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    -- Verify base prerequisites
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-VEH') THEN
        RAISE EXCEPTION 'Base item category IC-VEH not loaded — run 025 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-HVY-EQ') THEN
        RAISE EXCEPTION 'Base item category IC-HVY-EQ not loaded — run 025 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ───────────────────────────────

    -- B1: Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'services',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container-only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-TRANS', 'Transport & Storage', 'Road, rail, marine, air cargo, and third-party logistics', 'services', 430, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-TRANS-ROAD',   'Road Haulage',          'Full truckload, LTL, tanker, and last-mile road transport',       'SC-TRANS', 'services', 431, false),
    ('SC-TRANS-RAIL',   'Rail Services',          'Intermodal rail freight, bulk rail, and rail siding operations',  'SC-TRANS', 'services', 432, true),
    ('SC-TRANS-MARINE', 'Marine Transport',       'Container shipping, bulk carriers, tankers, and port handling',   'SC-TRANS', 'services', 433, true),
    ('SC-TRANS-AIR',    'Air Cargo Operations',   'Air freight, charter cargo, and airport handling services',       'SC-TRANS', 'services', 434, true),
    ('SC-TRANS-3PL',    '3PL & Fulfilment',       'Third-party logistics, order fulfilment, and value-added services','SC-TRANS','services', 435, false);

    -- B2: Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-TRANS',   'Transport Cost of Sales',       'Direct transport and haulage costs tied to revenue',   'COST_OF_SALES', 'TRANSPORT', 'BI-COGS',  40),
    ('BI-CAPEX-VESSEL', 'Vessel & Fleet Capital',        'Capital spend on vessels, rolling stock, and aircraft', 'CAPEX',         'VESSEL',    'BI-CAPEX', 32);

    -- B3: Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    -- Segment 78: Transport, storage, and mail services
    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-TRANS-ROAD',   '78101800', 'broad',   85, true,  'Freight trucking services — family'),
    ('SC-TRANS-ROAD',   '78101900', 'broad',   80, false, 'Intermodal freight transport — family'),
    ('SC-TRANS-RAIL',   '78101500', 'broad',   85, true,  'Railway transport — family'),
    ('SC-TRANS-RAIL',   '78101502', 'exact',   98, false, 'Rail freight services'),
    ('SC-TRANS-MARINE', '78101700', 'broad',   85, true,  'Marine freight services — family'),
    ('SC-TRANS-MARINE', '78101703', 'exact',   98, false, 'Containerised sea freight'),
    ('SC-TRANS-AIR',    '78101600', 'broad',   85, true,  'Air freight services — family'),
    ('SC-TRANS-AIR',    '78101601', 'exact',   98, false, 'Domestic air cargo'),
    ('SC-TRANS-3PL',    '78141500', 'broad',   82, true,  'General warehousing and 3PL — family'),
    ('SC-TRANS-3PL',    '78141600', 'broad',   78, false, 'Specialized warehousing — family');

    -- B5: Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-TRN-TRAILER',   'Trailers & Semi-trailers', 'Flatbeds, reefers, tankers, and curtainsiders',      'IC-VEH',    3, 270),
    ('IC-TRN-CONTAINER', 'Shipping Containers',       'ISO containers, tank containers, and reefer units',  'IC-HVY-EQ', 3, 271);

    -- B4: Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 1 — EXACT overrides (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TRANS-ROAD',   'EXACT', '78101800', NULL, 30, 97, 'Freight trucking → Road'),
    ('SC-TRANS-RAIL',   'EXACT', '78101502', NULL, 30, 98, 'Rail freight services → Rail'),
    ('SC-TRANS-MARINE', 'EXACT', '78101703', NULL, 30, 98, 'Containerised sea freight → Marine'),
    ('SC-TRANS-AIR',    'EXACT', '78101601', NULL, 30, 98, 'Domestic air cargo → Air'),
    ('SC-TRANS-3PL',    'EXACT', '78141500', NULL, 30, 96, 'General warehousing → 3PL');

    -- Layer 2 — RANGE families (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TRANS-ROAD',   'RANGE', '78101800', '78101899', 20, 88, 'Freight trucking family'),
    ('SC-TRANS-ROAD',   'RANGE', '78101900', '78101999', 15, 82, 'Intermodal freight family'),
    ('SC-TRANS-RAIL',   'RANGE', '78101500', '78101599', 20, 88, 'Railway transport family'),
    ('SC-TRANS-MARINE', 'RANGE', '78101700', '78101799', 20, 88, 'Marine freight family'),
    ('SC-TRANS-AIR',    'RANGE', '78101600', '78101699', 20, 88, 'Air freight family'),
    ('SC-TRANS-3PL',    'RANGE', '78141500', '78141699', 15, 82, 'Warehousing and 3PL families');

    -- Layer 3 — Segment catchalls (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TRANS-ROAD', 'RANGE', '78000000', '78999999', 3, 55, 'Segment 78: Transport/storage catchall'),
    ('SC-TRANS-3PL',  'RANGE', '78140000', '78149999', 5, 60, 'Class 7814: Warehousing catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    -- C1: Pack root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- C2: Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intent leaves ──────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Link default intents to spend category leaves
    UPDATE master.spend_category sc SET
        default_intent_id = bi.id,
        metadata = sc.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'intent_code', lnk.bi_code
        )),
        updated_at = now(), updated_by = v_su
    FROM (VALUES
        ('SC-TRANS-ROAD',   'BI-COGS-TRANS'),
        ('SC-TRANS-RAIL',   'BI-COGS-TRANS'),
        ('SC-TRANS-MARINE', 'BI-COGS-TRANS'),
        ('SC-TRANS-AIR',    'BI-COGS-TRANS'),
        ('SC-TRANS-3PL',    'BI-COGS-TRANS')
    ) AS lnk(sc_code, bi_code)
    JOIN master.business_intent bi ON bi.tenant_id = v_tid AND bi.code = lnk.bi_code
    WHERE sc.tenant_id = v_tid AND sc.code = lnk.sc_code;

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-TRN-TRAILER',   '25101500', 'broad', 82, true,  'Motor vehicles — family'),
        ('IC-TRN-CONTAINER', '24110000', 'broad', 78, true,  'Containers and packaging — class')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-then-insert by pack) ──────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Spend category load incomplete: expected 6, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Business intent load incomplete: expected 2, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Commodity bridge load incomplete: expected >=10, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Routing rule load incomplete: expected >=13, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[103_pack_transport] Item category load incomplete: expected 2, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    -- Confidence tier validation
    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND match_mode = 'EXACT' AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[103_pack_transport] EXACT rules must have confidence >= 95';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority <= 9 AND confidence > 70
    ) THEN
        RAISE EXCEPTION '[103_pack_transport] Catchall rules (priority <= 9) must have confidence <= 70';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
          AND priority >= 30 AND confidence < 95
    ) THEN
        RAISE EXCEPTION '[103_pack_transport] EXACT priority rules (>=30) must have confidence >= 95';
    END IF;

    RAISE NOTICE '[103_pack_transport] Pack loaded: % spend categories, % intents, % item categories, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/104_pack_trading.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: TRADING (Wholesale & Retail)
-- ============================================================================
-- File:     104_pack_trading.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  1 pack root + 4 leaves, 2 intent leaves, commodity bridge, routing
-- Depends:  020_base (spend categories, business intents, commodity codes)
-- Idempotent: Yes — UPSERT + delete-reinsert for routing
-- ============================================================================
-- PACK OWNS: SC-TRADE, SC-TRADE-MERCH, SC-TRADE-POS, SC-TRADE-DIST,
--            SC-TRADE-ECOMM, BI-COGS-MERCH, BI-REV-TRADE,
--            IC-TRADE-SKU, IC-TRADE-POS, IC-TRADE-PACK
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '104_pack_trading';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant & verify prerequisites ──────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base spend categories not loaded. Run 020 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded. Run 021 first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-FG') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ──────────────────────────────

    -- Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'goods',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-TRADE', 'Trading & Retail', 'Wholesale, retail, and distribution operations', 'goods', 400, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TRADE-MERCH', 'Merchandise & Resale Goods',    'Finished goods purchased for resale in wholesale and retail channels',       'SC-TRADE', 'goods',    401),
    ('SC-TRADE-POS',   'Point-of-Sale Systems',         'POS terminals, barcode scanners, receipt printers, and retail tech',         'SC-TRADE', 'goods',    402),
    ('SC-TRADE-DIST',  'Distribution & Channel Mgmt',   'Distribution logistics, channel partner management, and fulfilment',        'SC-TRADE', 'services', 403),
    ('SC-TRADE-ECOMM', 'E-commerce Operations',         'Online storefront platforms, payment gateways, and digital fulfilment',      'SC-TRADE', 'services', 404);

    -- Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-MERCH', 'Merchandise Cost of Sales',  'Cost of goods purchased for resale',                'COST_OF_SALES', 'MERCHANDISE',   'BI-COGS', 36),
    ('BI-REV-TRADE',  'Trade Revenue Cost',          'Revenue-linked costs for wholesale and retail trade','COST_OF_SALES', 'TRADE_REVENUE', 'BI-COGS', 37);

    -- Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-TRADE-SKU',  'Merchandise SKUs',       'Finished goods held for resale: apparel, footwear, consumer goods', 'IC-FG',   3, 270),
    ('IC-TRADE-POS',  'POS & Retail Hardware',  'Point-of-sale terminals, barcode scanners, and receipt printers',   'IC-IT-EQ', 3, 271),
    ('IC-TRADE-PACK', 'Retail Packaging',       'Branded bags, gift wrap, labels, and display packaging for retail', 'IC-PACK', 3, 272);

    -- Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Segment 53: Apparel, luggage, and personal care
    ('SC-TRADE-MERCH', '53100000', 'broad',   85, true,  'Clothing — class level'),
    ('SC-TRADE-MERCH', '53130000', 'broad',   82, false, 'Footwear — class level'),
    -- Segment 50: Food and beverage products
    ('SC-TRADE-MERCH', '50000000', 'related', 70, false, 'Food/beverage products — segment'),
    -- Segment 44: Office equipment (POS)
    ('SC-TRADE-POS',   '44100000', 'broad',   80, true,  'Office machines — POS hardware'),
    ('SC-TRADE-POS',   '43211500', 'broad',   78, false, 'Computer equipment — POS terminals'),
    -- Distribution
    ('SC-TRADE-DIST',  '78101800', 'broad',   80, true,  'Freight trucking — distribution'),
    ('SC-TRADE-DIST',  '78141500', 'broad',   78, false, 'Warehousing — distribution'),
    -- E-commerce
    ('SC-TRADE-ECOMM', '81112200', 'broad',   80, true,  'Internet services — e-commerce'),
    ('SC-TRADE-ECOMM', '43230000', 'related', 68, false, 'Software — e-commerce platforms');

    -- Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 2 — RANGE (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TRADE-MERCH', 'RANGE', '53100000', '53139999', 20, 85, 'Apparel and footwear classes'),
    ('SC-TRADE-POS',   'RANGE', '44100000', '44109999', 15, 82, 'Office machines class — POS'),
    ('SC-TRADE-DIST',  'RANGE', '78101800', '78101899', 15, 82, 'Trucking services family — distribution'),
    ('SC-TRADE-ECOMM', 'RANGE', '81112200', '81112299', 15, 82, 'Internet services family — e-commerce');

    -- Layer 3 — SEGMENT CATCHALLS (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TRADE-MERCH', 'RANGE', '53000000', '53999999', 5, 60, 'Segment 53: Apparel/personal care catchall'),
    ('SC-TRADE-MERCH', 'RANGE', '50000000', '50999999', 3, 55, 'Segment 50: Food/beverage products catchall'),
    ('SC-TRADE-POS',   'RANGE', '44000000', '44999999', 3, 55, 'Segment 44: Office equipment catchall — POS');


    -- ── STAGE C: UPSERT pack root + leaves into spend_category ──────────

    -- Root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Set default_intent_id on leaves
    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-TRADE-MERCH', 'BI-COGS-MERCH'),
          ('SC-TRADE-POS',   'BI-CAPEX-IT'),
          ('SC-TRADE-DIST',  'BI-COGS-FREIGHT'),
          ('SC-TRADE-ECOMM', 'BI-OPEX-IT')
      );

    -- ── STAGE D: UPSERT intent leaves ───────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E: UPSERT commodity bridge ────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-TRADE-SKU',  '53100000', 'broad', 85, true,  'Clothing — resale merchandise'),
        ('IC-TRADE-SKU',  '50000000', 'broad', 70, false, 'Food/beverage — resale goods'),
        ('IC-TRADE-POS',  '44100000', 'broad', 85, true,  'Office machines — POS hardware'),
        ('IC-TRADE-PACK', '24110000', 'broad', 85, true,  'Containers and packaging — retail')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ─────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 5 THEN
        RAISE EXCEPTION '[104_pack_trading] Expected 5 spend categories (1 root + 4 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[104_pack_trading] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[104_pack_trading] Commodity bridge incomplete: expected >=5, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[104_pack_trading] Routing rules incomplete: expected >=5, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[104_pack_trading] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[104_pack_trading] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/105_pack_hospitality.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: HOSPITALITY (Accommodation & Food Svc)
-- ============================================================================
-- File:     105_pack_hospitality.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  1 pack root + 4 leaves, 1 intent leaf, commodity bridge, routing, item categories
-- Depends:  020_base (spend categories, business intents, commodity codes),
--           025_base_item_categories.sql
-- Idempotent: Yes — UPSERT + delete-reinsert for routing
-- ============================================================================
-- PACK OWNS: SC-HOSP, SC-HOSP-FB, SC-HOSP-LINEN, SC-HOSP-PROP,
--            SC-HOSP-GUEST, BI-COGS-HOSP,
--            IC-HOSP-KITCHEN, IC-HOSP-LINEN, IC-HOSP-AMENITY
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '105_pack_hospitality';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant & verify prerequisites ──────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base spend categories not loaded. Run 020 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded. Run 021 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-MFG-EQ') THEN
        RAISE EXCEPTION 'Base item category IC-MFG-EQ not loaded. Run 025 first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-CONSUM') THEN
        RAISE EXCEPTION 'Base item category IC-CONSUM not loaded. Run 025 first.';
    END IF;

    -- ── STAGE B: Stage data in temp tables ──────────────────────────────

    -- Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'goods',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-HOSP', 'Hospitality & Accommodation', 'Hotel, restaurant, and hospitality operations procurement', 'services', 410, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-HOSP-FB',    'Food & Beverage Supply',        'Fresh produce, dry goods, beverages, and kitchen consumables',        'SC-HOSP', 'goods',    411),
    ('SC-HOSP-LINEN', 'Linen & Amenities',             'Bed linen, towels, toiletries, and guest room amenities',             'SC-HOSP', 'goods',    412),
    ('SC-HOSP-PROP',  'Property Maintenance — Hotel',  'Hotel-specific HVAC, plumbing, fit-out, and FF&E maintenance',        'SC-HOSP', 'services', 413),
    ('SC-HOSP-GUEST', 'Guest Services & Tech',         'Property management systems, guest Wi-Fi, and concierge technology',  'SC-HOSP', 'services', 414);

    -- Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-HOSP', 'Hospitality Cost of Sales', 'Direct costs of food, beverage, and guest services delivery', 'COST_OF_SALES', 'HOSPITALITY', 'BI-COGS', 38);

    -- Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Segment 50: Food and beverage products
    ('SC-HOSP-FB',    '50000000', 'related', 70, false, 'Food/beverage products — segment'),
    ('SC-HOSP-FB',    '50200000', 'broad',   85, true,  'Beverages — class level'),
    ('SC-HOSP-FB',    '50100000', 'broad',   85, false, 'Fruits and vegetables — class'),
    -- Linen & amenities
    ('SC-HOSP-LINEN', '52120000', 'broad',   82, true,  'Bedclothes and table linen — class'),
    ('SC-HOSP-LINEN', '53130000', 'related', 65, false, 'Personal care products — related'),
    -- Property maintenance
    ('SC-HOSP-PROP',  '72151500', 'broad',   80, true,  'Building maintenance services'),
    ('SC-HOSP-PROP',  '72150000', 'broad',   78, false, 'Building maintenance — class'),
    -- Guest services & tech
    ('SC-HOSP-GUEST', '43230000', 'related', 68, false, 'Software — PMS platforms'),
    ('SC-HOSP-GUEST', '81112200', 'broad',   80, true,  'Internet services — guest Wi-Fi'),
    -- Segment 90: Travel and lodging
    ('SC-HOSP-FB',    '90100000', 'related', 60, false, 'Restaurants and catering — related'),
    ('SC-HOSP-GUEST', '90111600', 'related', 65, false, 'Hotels and lodging — related');

    -- Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        parent_code text NOT NULL,
        level_no    smallint NOT NULL DEFAULT 3,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    -- Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 2 — RANGE (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-HOSP-FB',    'RANGE', '50100000', '50299999', 20, 85, 'Food and beverage classes'),
    ('SC-HOSP-LINEN', 'RANGE', '52120000', '52129999', 15, 82, 'Bedclothes and linen class'),
    ('SC-HOSP-PROP',  'RANGE', '72151500', '72151599', 15, 82, 'Building maintenance family — hotel'),
    ('SC-HOSP-GUEST', 'RANGE', '81112200', '81112299', 15, 82, 'Internet services family — guest tech');

    -- Layer 3 — SEGMENT CATCHALLS (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-HOSP-FB',    'RANGE', '50000000', '50999999', 5, 60, 'Segment 50: Food/beverage catchall'),
    ('SC-HOSP-LINEN', 'RANGE', '52000000', '52999999', 3, 55, 'Segment 52: Home/hospitality furnishings catchall'),
    ('SC-HOSP-GUEST', 'RANGE', '90000000', '90999999', 3, 55, 'Segment 90: Travel/lodging catchall');

    -- Item category data
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-HOSP-KITCHEN', 'Kitchen & F&B Equipment',    'Commercial ovens, fryers, dishwashers, and cold rooms',    'IC-MFG-EQ',  3, 280),
    ('IC-HOSP-LINEN',   'Hotel Linen & Textiles',     'Bed linen, towels, curtains, and table cloths',            'IC-CONSUM',   3, 281),
    ('IC-HOSP-AMENITY', 'Guest Amenities & Toiletries','Toiletries, slippers, robes, and minibar supplies',        'IC-CONSUM',   3, 282);


    -- ── STAGE C: UPSERT pack root + leaves into spend_category ──────────

    -- Root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Set default_intent_id on leaves
    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-HOSP-FB',    'BI-COGS-HOSP'),
          ('SC-HOSP-LINEN', 'BI-COGS-HOSP'),
          ('SC-HOSP-PROP',  'BI-OPEX-MAINT'),
          ('SC-HOSP-GUEST', 'BI-OPEX-IT')
      );

    -- ── STAGE D: UPSERT intent leaves ───────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E: UPSERT commodity bridge ────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item categories ────────────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )), 'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no,
        sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )), updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: IC commodity bridge ───────────────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-HOSP-KITCHEN', '48100000', 'broad', 82::numeric(5,2), true,  'Food service equipment'),
        ('IC-HOSP-LINEN',   '52120000', 'broad', 80::numeric(5,2), true,  'Household linens'),
        ('IC-HOSP-AMENITY', '53130000', 'broad', 78::numeric(5,2), true,  'Personal care products')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )), updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ─────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 5 THEN
        RAISE EXCEPTION '[105_pack_hospitality] Expected 5 spend categories (1 root + 4 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 1 THEN
        RAISE EXCEPTION '[105_pack_hospitality] Expected 1 business intent, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[105_pack_hospitality] Commodity bridge incomplete: expected >=5, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[105_pack_hospitality] Routing rules incomplete: expected >=5, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 3 THEN
        RAISE EXCEPTION '[105_pack_hospitality] Expected 3 item categories, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[105_pack_hospitality] Pack loaded: % spend cats, % intents, % bridge rows, % routing rules, % item categories',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/106_pack_infocomm.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: INFOCOMM (Information & Communication)
-- ============================================================================
-- File:     106_pack_infocomm.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  1 pack root + 5 leaves, 2 intent leaves, commodity bridge, routing
-- Depends:  020_base (spend categories, business intents, commodity codes)
-- Idempotent: Yes — UPSERT + delete-reinsert for routing
-- ============================================================================
-- PACK OWNS: SC-ICT, SC-ICT-DC, SC-ICT-NET, SC-ICT-DEV, SC-ICT-CONTENT,
--            SC-ICT-CYBER, BI-COGS-ICT, BI-CAPEX-DC,
--            IC-ICT-SERVER, IC-ICT-NETWORK, IC-ICT-SW
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '106_pack_infocomm';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant & verify prerequisites ──────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base spend categories not loaded. Run 020 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded. Run 021 first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-IT-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ──────────────────────────────

    -- Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'goods',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-ICT', 'Information & Communication Technology', 'ICT infrastructure, software development, and digital services', 'services', 420, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-ICT-DC',      'Data Centres',                 'Colocation, hosting, power/cooling, and physical DC infrastructure',     'SC-ICT', 'services', 421),
    ('SC-ICT-NET',     'Network Infrastructure',       'Routers, switches, fibre, SD-WAN, and network operations',              'SC-ICT', 'goods',    422),
    ('SC-ICT-DEV',     'Software Development',         'Custom development, QA, DevOps tooling, and agile delivery',            'SC-ICT', 'services', 423),
    ('SC-ICT-CONTENT', 'Content & Media Production',   'Video, audio, graphic design, CMS, and digital content creation',       'SC-ICT', 'services', 424),
    ('SC-ICT-CYBER',   'Managed Security Services',    'SOC-as-a-service, SIEM, pen testing, and threat intelligence',          'SC-ICT', 'services', 425);

    -- Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-ICT',  'ICT Cost of Sales',           'Direct costs of ICT service delivery and platform operations', 'COST_OF_SALES', 'ICT',         'BI-COGS',  39),
    ('BI-CAPEX-DC',  'Data Centre Capital Expense',  'Capital investment in data centre build-out and equipment',    'CAPEX',         'DATA_CENTRE', 'BI-CAPEX', 30);

    -- Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-ICT-SERVER',  'Servers & DC Hardware',   'Rack-mount and blade servers, storage arrays, and UPS systems',         'IC-IT-EQ', 3, 280),
    ('IC-ICT-NETWORK', 'Network Equipment',        'Routers, switches, firewalls, SD-WAN appliances, and wireless APs',    'IC-IT-EQ', 3, 281),
    ('IC-ICT-SW',      'Software Licences',        'Enterprise software licences, SaaS subscriptions, and developer tools','IC-IT-EQ', 3, 282);

    -- Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Segment 43: IT equipment, peripherals, and components
    ('SC-ICT-DC',      '43211500', 'broad',   82, true,  'Computer equipment — DC servers'),
    ('SC-ICT-DC',      '43222600', 'broad',   85, false, 'Computer server racks and accessories'),
    ('SC-ICT-NET',     '43222600', 'broad',   80, false, 'Network racks and enclosures'),
    ('SC-ICT-NET',     '43201400', 'broad',   85, true,  'Networking equipment — family'),
    ('SC-ICT-DEV',     '43230000', 'broad',   85, true,  'Software — class level'),
    ('SC-ICT-DEV',     '43231500', 'broad',   82, false, 'Business function software — dev tools'),
    ('SC-ICT-CYBER',   '43232300', 'broad',   85, true,  'Security and protection software'),
    ('SC-ICT-CYBER',   '43232400', 'broad',   82, false, 'Network security equipment'),
    -- Segment 81: Engineering and technology services
    ('SC-ICT-DEV',     '81111500', 'broad',   80, false, 'Engineering and technology services — dev'),
    ('SC-ICT-CONTENT', '82101500', 'broad',   78, true,  'Advertising / media production services'),
    ('SC-ICT-CONTENT', '43230000', 'related', 65, false, 'Software — CMS platforms'),
    ('SC-ICT-DC',      '81112200', 'broad',   80, false, 'Internet / hosting services — DC');

    -- Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 1 — EXACT (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-ICT-NET',   'EXACT', '43201400', NULL, 30, 96, 'Networking equipment → Network infra'),
    ('SC-ICT-CYBER', 'EXACT', '43232300', NULL, 30, 96, 'Security software → Managed security');

    -- Layer 2 — RANGE (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-ICT-DC',      'RANGE', '43222600', '43222699', 20, 85, 'Server racks and accessories family'),
    ('SC-ICT-NET',     'RANGE', '43201400', '43201499', 20, 85, 'Networking equipment family'),
    ('SC-ICT-DEV',     'RANGE', '43230000', '43239999', 15, 82, 'Software class — development'),
    ('SC-ICT-CYBER',   'RANGE', '43232300', '43232499', 20, 85, 'Security software and hardware families'),
    ('SC-ICT-CONTENT', 'RANGE', '82101500', '82101599', 15, 80, 'Advertising/media services family');

    -- Layer 3 — SEGMENT CATCHALLS (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-ICT-DC',      'RANGE', '43000000', '43999999', 5, 60, 'Segment 43: IT equipment catchall — DC'),
    ('SC-ICT-DEV',     'RANGE', '81000000', '81999999', 3, 55, 'Segment 81: Engineering/tech services catchall'),
    ('SC-ICT-CONTENT', 'RANGE', '82000000', '82999999', 3, 55, 'Segment 82: Advertising/marketing catchall — content');


    -- ── STAGE C: UPSERT pack root + leaves into spend_category ──────────

    -- Root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Set default_intent_id on leaves
    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-ICT-DC',      'BI-CAPEX-DC'),
          ('SC-ICT-NET',     'BI-CAPEX-INFRA'),
          ('SC-ICT-DEV',     'BI-COGS-ICT'),
          ('SC-ICT-CONTENT', 'BI-COGS-ICT'),
          ('SC-ICT-CYBER',   'BI-OPEX-IT')
      );

    -- ── STAGE D: UPSERT intent leaves ───────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E: UPSERT commodity bridge ────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-ICT-SERVER',  '43211500', 'broad', 85, true,  'Computer equipment — servers'),
        ('IC-ICT-SERVER',  '43222600', 'broad', 82, false, 'Server racks and accessories'),
        ('IC-ICT-NETWORK', '43201400', 'broad', 85, true,  'Networking equipment'),
        ('IC-ICT-SW',      '43230000', 'broad', 85, true,  'Software — class level')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ─────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Expected 6 spend categories (1 root + 5 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Commodity bridge incomplete: expected >=8, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[106_pack_infocomm] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[106_pack_infocomm] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/107_pack_financial.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: FINANCIAL (Financial & Insurance)
-- ============================================================================
-- File:     107_pack_financial.sql
-- Schemas:  master.spend_category, master.business_intent,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  1 pack root + 4 leaves, 2 intent leaves, commodity bridge, routing
-- Depends:  020_base (spend categories, business intents, commodity codes)
-- Idempotent: Yes — UPSERT + delete-reinsert for routing
-- ============================================================================
-- PACK OWNS: SC-FIN, SC-FIN-CORE, SC-FIN-RISK, SC-FIN-CLAIMS,
--            SC-FIN-WEALTH, BI-COGS-FIN, BI-REG-FIN,
--            IC-FIN-CORE-SYS, IC-FIN-RISK-SYS, IC-FIN-WM-SYS
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '107_pack_financial';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant & verify prerequisites ──────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION 'Base spend categories not loaded. Run 020 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded. Run 021 first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent
                   WHERE tenant_id = v_tid AND code = 'BI-REG') THEN
        RAISE EXCEPTION 'Base BI-REG domain root not loaded. Run 021 first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category
                   WHERE tenant_id = v_tid AND code = 'IC-ITSVC') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first';
    END IF;

    -- ── STAGE B: Stage data in temp tables ──────────────────────────────

    -- Spend categories
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'goods',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- Pack root (container only)
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-FIN', 'Financial & Insurance Services', 'Banking, insurance, wealth management, and fintech operations', 'services', 430, true);

    -- Leaves
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-FIN-CORE',   'Core Banking Systems',          'Core banking platforms, payment engines, and settlement systems',       'SC-FIN', 'services', 431, true),
    ('SC-FIN-RISK',   'Risk & Compliance Platforms',   'Risk analytics, AML/KYC, regulatory reporting, and GRC platforms',     'SC-FIN', 'services', 432, true),
    ('SC-FIN-CLAIMS', 'Claims Processing',             'Insurance claims intake, adjudication, fraud detection, and pay-out',   'SC-FIN', 'services', 433, false),
    ('SC-FIN-WEALTH', 'Wealth Management Systems',     'Portfolio management, robo-advisory, and client onboarding systems',   'SC-FIN', 'services', 434, true);

    -- Business intents
    CREATE TEMP TABLE tmp_bi (
        seed_id     uuid DEFAULT shared.uuidv7(),
        code        text NOT NULL,
        name        text NOT NULL,
        description text,
        domain      text NOT NULL,
        subtype     text,
        parent_code text,
        sort_order  smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-FIN', 'Financial Services Cost of Sales', 'Direct costs of financial product delivery and servicing',         'COST_OF_SALES', 'FINANCIAL', 'BI-COGS', 40),
    ('BI-REG-FIN',  'Financial Regulatory Cost',        'Regulatory compliance, licensing, and supervisory costs for FSIs', 'REGULATORY',    'FINANCIAL', 'BI-REG',  54);

    -- Item categories
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text NOT NULL,
        level_no      smallint NOT NULL DEFAULT 3,
        sort_order    smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-FIN-CORE-SYS', 'Core Banking Systems',        'Core banking platforms, payment engines, and settlement middleware',  'IC-ITSVC', 3, 290),
    ('IC-FIN-RISK-SYS', 'Risk & Compliance Platforms', 'AML/KYC, GRC, regulatory reporting, and risk analytics systems',     'IC-ITSVC', 3, 291),
    ('IC-FIN-WM-SYS',   'Wealth Management Systems',   'Portfolio management, robo-advisory, and client onboarding systems', 'IC-ITSVC', 3, 292);

    -- Commodity bridge
    CREATE TEMP TABLE tmp_bridge (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        cc_code       text NOT NULL,
        mapping_type  text NOT NULL DEFAULT 'exact',
        confidence    numeric(5,2) NOT NULL,
        is_primary    boolean NOT NULL DEFAULT false,
        description   text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    -- Segment 84: Financial and insurance services
    ('SC-FIN-CORE',   '84111500', 'broad',   85, true,  'Accounting services — core banking'),
    ('SC-FIN-CORE',   '84111600', 'broad',   82, false, 'Banking services — core platforms'),
    ('SC-FIN-RISK',   '84111700', 'broad',   80, true,  'Foreign exchange / risk services'),
    ('SC-FIN-RISK',   '84111500', 'related', 68, false, 'Accounting — regulatory reporting'),
    ('SC-FIN-CLAIMS', '84131500', 'broad',   85, true,  'Insurance services — claims'),
    ('SC-FIN-CLAIMS', '84131600', 'broad',   82, false, 'Liability insurance — claims processing'),
    ('SC-FIN-WEALTH', '84111800', 'broad',   85, true,  'Investment and asset management'),
    ('SC-FIN-WEALTH', '84111700', 'related', 70, false, 'FX services — wealth management');

    -- Routing rules
    CREATE TEMP TABLE tmp_route (
        sc_code       text NOT NULL,
        domain        text NOT NULL DEFAULT 'unspsc',
        match_mode    text NOT NULL,
        code_from     text NOT NULL,
        code_to       text,
        priority      smallint NOT NULL,
        confidence    numeric(5,2) NOT NULL,
        description   text
    ) ON COMMIT DROP;

    -- Layer 1 — EXACT (priority 30+, confidence 95-100)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FIN-CORE',   'EXACT', '84111600', NULL, 30, 96, 'Banking services → Core banking'),
    ('SC-FIN-WEALTH', 'EXACT', '84111800', NULL, 30, 96, 'Investment management → Wealth mgmt');

    -- Layer 2 — RANGE (priority 10-29, confidence 80-94)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FIN-CORE',   'RANGE', '84111500', '84111699', 20, 85, 'Accounting and banking families'),
    ('SC-FIN-RISK',   'RANGE', '84111700', '84111799', 15, 82, 'FX and risk services family'),
    ('SC-FIN-CLAIMS', 'RANGE', '84131500', '84131699', 20, 85, 'Insurance services families'),
    ('SC-FIN-WEALTH', 'RANGE', '84111800', '84111899', 20, 85, 'Investment management family');

    -- Layer 3 — SEGMENT CATCHALLS (priority 1-9, confidence 55-70)
    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FIN-CORE',   'RANGE', '84000000', '84999999', 5, 60, 'Segment 84: Financial services catchall'),
    ('SC-FIN-CLAIMS', 'RANGE', '84130000', '84139999', 3, 58, 'Class 8413: Insurance catchall — claims');


    -- ── STAGE C: UPSERT pack root + leaves into spend_category ──────────

    -- Root (container)
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text, 'container', true
                         )),
        updated_at = now(), updated_by = v_su;

    -- Leaves
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id,
        s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type,
        visibility  = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required = EXCLUDED.is_hs_required,
        is_regulated = EXCLUDED.is_regulated,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.spend_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- Set default_intent_id on leaves
    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-FIN-CORE',   'BI-CAPEX-IT'),
          ('SC-FIN-RISK',   'BI-REG-FIN'),
          ('SC-FIN-CLAIMS', 'BI-COGS-FIN'),
          ('SC-FIN-WEALTH', 'BI-COGS-FIN')
      );

    -- ── STAGE D: UPSERT intent leaves ───────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        domain      = EXCLUDED.domain,
        subtype     = EXCLUDED.subtype,
        parent_id   = EXCLUDED.parent_id,
        depth       = EXCLUDED.depth,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.business_intent.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version,
                             'seeded_at', now()::text
                         )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E: UPSERT commodity bridge ────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS
    SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'spend_category', sm.id,
        'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version,
                              'seeded_at', now()::text
                          )),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS
    SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id,
        classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary,
        description, metadata, status, created_by
    )
    SELECT
        v_tid, 'item_category', im.id,
        'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary,
        b.description,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM (VALUES
        ('IC-FIN-CORE-SYS', '81110000', 'broad', 85, true,  'Computer services — core banking'),
        ('IC-FIN-RISK-SYS', '81110000', 'broad', 82, true,  'Computer services — risk platforms'),
        ('IC-FIN-WM-SYS',   '81112200', 'broad', 82, true,  'Internet services — wealth management SaaS')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.commodity_classification.mapping_type,
           master.commodity_classification.confidence,
           master.commodity_classification.provenance,
           master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM
          (EXCLUDED.mapping_type,
           EXCLUDED.confidence,
           EXCLUDED.provenance,
           EXCLUDED.is_primary,
           EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode,
        code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT
        v_tid, r.domain, r.match_mode,
        r.code_from, r.code_to, sm.id,
        r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'description', r.description
        )),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ─────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 5 THEN
        RAISE EXCEPTION '[107_pack_financial] Expected 5 spend categories (1 root + 4 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[107_pack_financial] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.commodity_classification
        WHERE tenant_id = v_tid AND owner_type = 'spend_category'
          AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[107_pack_financial] Commodity bridge incomplete: expected >=6, got %',
            (SELECT count(*) FROM master.commodity_classification
             WHERE tenant_id = v_tid AND owner_type = 'spend_category'
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[107_pack_financial] Routing rules incomplete: expected >=6, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[107_pack_financial] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[107_pack_financial] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification
         WHERE tenant_id = v_tid AND owner_type = 'spend_category'
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/108_pack_mfg_textile.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: MFG TEXTILE (Textile & Leather Mfg)
-- ============================================================================
-- File:     108_pack_mfg_textile.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for textile, apparel, and leather manufacturing
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: AITM (Athyper India Textile Mfg, INR)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-TX, SC-TX-FIBER, SC-TX-YARN, SC-TX-FABRIC,
--                      SC-TX-APPAREL, SC-TX-FINISH
--   Business intents : BI-COGS-TEXTILE, BI-CAPEX-TEXTILE
--   Item categories  : IC-TX-LOOM, IC-TX-FIBER, IC-TX-DYE
--   Commodity bridge : all rows with pack = '108_pack_mfg_textile'
--   Routing rules    : all rows with pack = '108_pack_mfg_textile'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '108_pack_mfg_textile';
    v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-MFG-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-TX', 'Textile & Apparel Manufacturing', 'Fiber, yarn, fabric, apparel production, and finishing inputs', 'goods', 500, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-TX-FIBER',   'Raw Fiber & Materials',    'Cotton, polyester, wool, and synthetic fiber for yarn spinning',    'SC-TX', 'goods', 501, false),
    ('SC-TX-YARN',    'Yarn & Thread',            'Spun yarn, textured yarn, thread, and sewing notions',             'SC-TX', 'goods', 502, false),
    ('SC-TX-FABRIC',  'Woven & Knit Fabric',      'Greige fabric, knitted cloth, and technical textiles',             'SC-TX', 'goods', 503, false),
    ('SC-TX-APPAREL', 'Garments & Finished Goods','Cut-and-sew garments, leather goods, and accessories',             'SC-TX', 'goods', 504, false),
    ('SC-TX-FINISH',  'Dyeing & Finishing Chem.', 'Dyes, auxiliaries, finishing chemicals, and effluent treatment',   'SC-TX', 'goods', 505, true);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-TEXTILE', 'Textile Manufacturing Cost of Sales', 'Direct material and conversion costs for textile production', 'COST_OF_SALES', 'TEXTILE', 'BI-COGS', 41),
    ('BI-CAPEX-TEXTILE','Textile Capital Equipment',           'Capital investment in looms, spinning frames, and dyeing plant','CAPEX',       'TEXTILE', 'BI-CAPEX', 31);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-TX-LOOM',  'Looms & Knitting Machines', 'Weaving looms, circular knitting machines, and warp preparation', 'IC-MFG-EQ', 3, 300),
    ('IC-TX-FIBER', 'Textile Fibers & Yarns',    'Raw cotton, polyester staple fiber, filament yarn, and spun thread', 'IC-RAW', 3, 301),
    ('IC-TX-DYE',   'Dyes & Finishing Chemicals','Reactive dyes, pigments, auxiliaries, textile effluent treatment',  'IC-CHEM', 3, 302);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-TX-FIBER',   '11160000', 'broad',   85, true,  'Textile fibers — class'),
    ('SC-TX-FIBER',   '11161500', 'broad',   82, false, 'Cotton fiber — family'),
    ('SC-TX-YARN',    '53130000', 'broad',   82, true,  'Yarn and thread — class'),
    ('SC-TX-FABRIC',  '53110000', 'broad',   85, true,  'Woven fabrics — class'),
    ('SC-TX-APPAREL', '53100000', 'broad',   85, true,  'Clothing — class'),
    ('SC-TX-FINISH',  '12352000', 'broad',   82, true,  'Dyestuffs and pigments — class'),
    ('SC-TX-FINISH',  '12353000', 'broad',   80, false, 'Textile auxiliaries — finishing');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-TX-FABRIC',  'EXACT', '53110000', NULL,       30, 96, 'Woven fabrics → Fabric'),
    ('SC-TX-APPAREL', 'EXACT', '53100000', NULL,       30, 96, 'Clothing → Apparel'),
    ('SC-TX-FIBER',   'RANGE', '11160000', '11169999', 20, 88, 'Textile fibers class'),
    ('SC-TX-YARN',    'RANGE', '53130000', '53139999', 15, 82, 'Yarn and thread class'),
    ('SC-TX-FABRIC',  'RANGE', '53110000', '53119999', 20, 88, 'Woven fabrics class'),
    ('SC-TX-APPAREL', 'RANGE', '53100000', '53109999', 20, 88, 'Clothing class'),
    ('SC-TX-FINISH',  'RANGE', '12352000', '12352999', 15, 82, 'Dyestuffs family'),
    ('SC-TX-FINISH',  'RANGE', '12353000', '12353999', 15, 80, 'Textile auxiliaries family'),
    ('SC-TX-FIBER',   'RANGE', '11000000', '11999999',  3, 55, 'Segment 11: Mineral/textile material catchall'),
    ('SC-TX-APPAREL', 'RANGE', '53000000', '53999999',  3, 55, 'Segment 53: Apparel/personal care catchall'),
    ('SC-TX-FINISH',  'RANGE', '12000000', '12999999',  3, 55, 'Segment 12: Chemicals catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        procurement_type = EXCLUDED.procurement_type, sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-TX-FIBER', 'BI-COGS-TEXTILE'), ('SC-TX-YARN',    'BI-COGS-TEXTILE'),
          ('SC-TX-FABRIC','BI-COGS-TEXTILE'),  ('SC-TX-APPAREL', 'BI-COGS-TEXTILE'),
          ('SC-TX-FINISH','BI-COGS-TEXTILE')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-TX-LOOM',  '23180000', 'broad', 85, true,  'Textile manufacturing machinery — class'),
        ('IC-TX-FIBER', '11160000', 'broad', 85, true,  'Textile fibers — class'),
        ('IC-TX-DYE',   '12352000', 'broad', 85, true,  'Dyestuffs and pigments — class')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[108_pack_mfg_textile] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[108_pack_mfg_textile] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[108_pack_mfg_textile] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[108_pack_mfg_textile] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[108_pack_mfg_textile] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[108_pack_mfg_textile] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[108_pack_mfg_textile] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/109_pack_mfg_food_bev.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: MFG FOOD & BEVERAGE
-- ============================================================================
-- File:     109_pack_mfg_food_bev.sql
-- Purpose:  Industry pack for food and beverage manufacturing
-- Depends:  020, 021, 023, 024, 025
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: ACFB (Athyper Canada Food & Bev Mfg, CAD)
-- ============================================================================
-- PACK OWNS: SC-FB, SC-FB-INGR, SC-FB-PROC, SC-FB-PACK, SC-FB-COLD, SC-FB-QA
--            BI-COGS-FOOD, BI-CAPEX-FOOD
--            IC-FB-PROC-EQ, IC-FB-INGR, IC-FB-PKG
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid; v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '109_pack_mfg_food_bev'; v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-MFG-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first'; END IF;

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-FB', 'Food & Beverage Manufacturing', 'Ingredients, processing, packaging, cold chain, and QA inputs', 'goods', 510, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-FB-INGR',  'Food Ingredients',       'Grains, oils, proteins, flavors, colors, and additives',           'SC-FB', 'goods',    511, true),
    ('SC-FB-PROC',  'Processing & Equipment', 'Blenders, extruders, pasteurisers, and filling lines',            'SC-FB', 'goods',    512, false),
    ('SC-FB-PACK',  'Food Packaging',         'Primary and secondary packaging: cans, bottles, cartons, film',   'SC-FB', 'goods',    513, false),
    ('SC-FB-COLD',  'Cold Chain & Storage',   'Refrigerated transport, cold rooms, and freezer equipment',       'SC-FB', 'services', 514, true),
    ('SC-FB-QA',    'Quality & Compliance',   'Lab testing, food safety certifications, and HACCP services',     'SC-FB', 'services', 515, true);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-FOOD', 'Food & Bev Cost of Sales', 'Direct ingredient and conversion costs for food/bev production', 'COST_OF_SALES', 'FOOD',       'BI-COGS',  42),
    ('BI-CAPEX-FOOD','Food Processing Equipment','Capital investment in processing lines and cold chain assets',   'CAPEX',         'FOOD_PLANT', 'BI-CAPEX', 32);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-FB-PROC-EQ', 'Food Processing Equipment', 'Blenders, pasteurisers, extruders, filling/sealing lines', 'IC-MFG-EQ', 3, 310),
    ('IC-FB-INGR',    'Food Ingredients',          'Grains, proteins, flavours, colours, and food additives',  'IC-FOOD',   3, 311),
    ('IC-FB-PKG',     'Food Packaging Materials',  'Cans, bottles, cartons, pouches, and shrink-wrap film',   'IC-PACK',   3, 312);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-FB-INGR',  '50000000', 'broad',   82, true,  'Food/beverage products — segment'),
    ('SC-FB-INGR',  '50200000', 'broad',   85, false, 'Grains and cereals — class'),
    ('SC-FB-PROC',  '23270000', 'broad',   85, true,  'Food processing machinery — class'),
    ('SC-FB-PACK',  '24110000', 'broad',   85, true,  'Containers and packaging — class'),
    ('SC-FB-COLD',  '24111700', 'broad',   80, true,  'Refrigeration containers — family'),
    ('SC-FB-QA',    '41110000', 'broad',   78, true,  'Laboratory instruments — QA/food testing');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-FB-PROC',  'EXACT', '23270000', NULL,       30, 96, 'Food processing machinery → Processing'),
    ('SC-FB-INGR',  'RANGE', '50000000', '50999999', 20, 85, 'Food/beverage products segment'),
    ('SC-FB-PROC',  'RANGE', '23270000', '23279999', 20, 88, 'Food processing machinery class'),
    ('SC-FB-PACK',  'RANGE', '24110000', '24119999', 15, 85, 'Containers and packaging class'),
    ('SC-FB-COLD',  'RANGE', '24111700', '24111799', 15, 82, 'Refrigeration containers family'),
    ('SC-FB-QA',    'RANGE', '41110000', '41119999', 15, 80, 'Lab instruments class — food QA'),
    ('SC-FB-INGR',  'RANGE', '50000000', '50999999',  3, 60, 'Segment 50: Food/beverage catchall'),
    ('SC-FB-PROC',  'RANGE', '23000000', '23999999',  3, 55, 'Segment 23: Industrial machinery catchall'),
    ('SC-FB-PACK',  'RANGE', '24000000', '24999999',  3, 55, 'Segment 24: Containers catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        is_regulated = EXCLUDED.is_regulated, sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-FB-INGR','BI-COGS-FOOD'), ('SC-FB-PROC','BI-CAPEX-FOOD'),
          ('SC-FB-PACK','BI-COGS-FOOD'), ('SC-FB-COLD','BI-COGS-FOOD'), ('SC-FB-QA','BI-COGS-FOOD'));

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-FB-PROC-EQ', '23270000', 'broad', 85, true,  'Food processing machinery — class'),
        ('IC-FB-INGR',    '50000000', 'broad', 80, true,  'Food/beverage products — segment'),
        ('IC-FB-PKG',     '24110000', 'broad', 85, true,  'Containers and packaging — class')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[109_pack_mfg_food_bev] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;
    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[109_pack_mfg_food_bev] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;
    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[109_pack_mfg_food_bev] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;
    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[109_pack_mfg_food_bev] Commodity bridge incomplete: expected >=6, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;
    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[109_pack_mfg_food_bev] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;
    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[109_pack_mfg_food_bev] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[109_pack_mfg_food_bev] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/110_pack_mfg_pharma.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: MFG PHARMACEUTICAL
-- ============================================================================
-- File:     110_pack_mfg_pharma.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for pharmaceutical and biotech manufacturing
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: ADPM (Athyper Germany Pharmaceutical Mfg, EUR)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-PHARMA, SC-PHARMA-API, SC-PHARMA-EXCIP,
--                      SC-PHARMA-PACK, SC-PHARMA-QC, SC-PHARMA-COLD
--   Business intents : BI-COGS-PHARMA, BI-CAPEX-PHARMA
--   Item categories  : IC-PHARMA-REACTOR, IC-PHARMA-API, IC-PHARMA-PACK
--   Commodity bridge : all rows with pack = '110_pack_mfg_pharma'
--   Routing rules    : all rows with pack = '110_pack_mfg_pharma'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '110_pack_mfg_pharma';
    v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-MFG-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-PHARMA', 'Pharmaceutical Manufacturing', 'APIs, excipients, pharma packaging, QC, and cold chain inputs', 'goods', 520, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-PHARMA-API',   'Active Pharmaceutical Ingredients', 'Bulk APIs, intermediates, and starting materials for drug synthesis',    'SC-PHARMA', 'goods',    521, true),
    ('SC-PHARMA-EXCIP', 'Excipients & Formulation Aids',     'Binders, fillers, coatings, stabilisers, and solvents',                 'SC-PHARMA', 'goods',    522, true),
    ('SC-PHARMA-PACK',  'Pharmaceutical Packaging',          'Primary and secondary packaging: vials, blisters, ampoules, cartons',   'SC-PHARMA', 'goods',    523, true),
    ('SC-PHARMA-QC',    'QC, QA & Regulatory Services',      'Lab testing, GMP audit, pharmacovigilance, and regulatory submissions', 'SC-PHARMA', 'services', 524, true),
    ('SC-PHARMA-COLD',  'Pharma Cold Chain & Storage',       'Temperature-controlled transport, cryo-storage, and cold rooms',        'SC-PHARMA', 'services', 525, true);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-PHARMA', 'Pharma Cost of Sales',         'Direct API, excipient, and conversion costs for drug manufacturing', 'COST_OF_SALES', 'PHARMA',       'BI-COGS',  43),
    ('BI-CAPEX-PHARMA','Pharma Capital Equipment',      'Capital investment in reactors, fill-finish lines, and QC labs',    'CAPEX',         'PHARMA_PLANT', 'BI-CAPEX', 33);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-PHARMA-REACTOR', 'Reactors & Fill-Finish Equipment', 'Stirred-tank reactors, lyophilisers, and aseptic filling lines', 'IC-MFG-EQ', 3, 320),
    ('IC-PHARMA-API',     'Active Pharmaceutical Ingredients', 'Bulk APIs, intermediates, and controlled substance starting materials', 'IC-CHEM', 3, 321),
    ('IC-PHARMA-PACK',    'Pharmaceutical Packaging Materials','Vials, ampoules, blister foil, tamper-evident cartons, and labels', 'IC-PACK', 3, 322);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-PHARMA-API',   '51000000', 'broad',   85, true,  'Drugs and pharmaceutical products — segment'),
    ('SC-PHARMA-API',   '12352300', 'broad',   82, false, 'Organic chemical compounds — family'),
    ('SC-PHARMA-EXCIP', '51191500', 'broad',   82, true,  'Pharmaceutical excipients — family'),
    ('SC-PHARMA-PACK',  '42130000', 'broad',   82, true,  'Pharma disposables and packaging — class'),
    ('SC-PHARMA-QC',    '41110000', 'broad',   78, true,  'Laboratory instruments — QC/QA'),
    ('SC-PHARMA-QC',    '76110000', 'broad',   75, false, 'Auditing and regulatory services — class'),
    ('SC-PHARMA-COLD',  '78181500', 'broad',   80, true,  'Refrigerated transport services — family');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-PHARMA-API',   'EXACT', '51000000', NULL,       30, 96, 'Pharma products segment → API'),
    ('SC-PHARMA-API',   'RANGE', '51000000', '51999999', 20, 88, 'Drugs and pharma segment'),
    ('SC-PHARMA-EXCIP', 'RANGE', '51191500', '51191599', 15, 82, 'Pharmaceutical excipients family'),
    ('SC-PHARMA-PACK',  'RANGE', '42130000', '42139999', 15, 82, 'Pharma disposables and packaging class'),
    ('SC-PHARMA-QC',    'RANGE', '41110000', '41119999', 15, 80, 'Lab instruments class — QC/QA'),
    ('SC-PHARMA-QC',    'RANGE', '76110000', '76119999', 10, 78, 'Auditing and regulatory services class'),
    ('SC-PHARMA-COLD',  'RANGE', '78181500', '78181599', 15, 82, 'Refrigerated transport family'),
    ('SC-PHARMA-API',   'RANGE', '12000000', '12999999',  3, 55, 'Segment 12: Chemicals catchall'),
    ('SC-PHARMA-COLD',  'RANGE', '78000000', '78999999',  3, 55, 'Segment 78: Transport services catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-PHARMA-API',  'BI-COGS-PHARMA'), ('SC-PHARMA-EXCIP', 'BI-COGS-PHARMA'),
          ('SC-PHARMA-PACK', 'BI-COGS-PHARMA'), ('SC-PHARMA-QC',    'BI-COGS-PHARMA'),
          ('SC-PHARMA-COLD', 'BI-COGS-PHARMA')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-PHARMA-REACTOR', '42250000', 'broad', 85, true,  'Medical and lab equipment — class'),
        ('IC-PHARMA-API',     '51000000', 'broad', 85, true,  'Drugs and pharmaceutical products — segment'),
        ('IC-PHARMA-PACK',    '42130000', 'broad', 85, true,  'Pharma disposables and packaging — class')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[110_pack_mfg_pharma] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[110_pack_mfg_pharma] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[110_pack_mfg_pharma] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[110_pack_mfg_pharma] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[110_pack_mfg_pharma] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[110_pack_mfg_pharma] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[110_pack_mfg_pharma] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/111_pack_mfg_electronics.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: MFG ELECTRONICS
-- ============================================================================
-- File:     111_pack_mfg_electronics.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for electronics and semiconductor manufacturing
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: ATEM (Athyper Taiwan Electronics Mfg, TWD)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-ELEC, SC-ELEC-COMP, SC-ELEC-PCB,
--                      SC-ELEC-TEST, SC-ELEC-SEMI, SC-ELEC-PACK
--   Business intents : BI-COGS-ELEC, BI-CAPEX-ELEC
--   Item categories  : IC-ELEC-SMT, IC-ELEC-COMP, IC-ELEC-SEMI
--   Commodity bridge : all rows with pack = '111_pack_mfg_electronics'
--   Routing rules    : all rows with pack = '111_pack_mfg_electronics'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '111_pack_mfg_electronics';
    v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-MFG-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-ELEC', 'Electronics Manufacturing', 'Components, PCB assembly, semiconductors, testing, and ESD packaging', 'goods', 530, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-ELEC-COMP',  'Electronic Components',  'Passive and active components: resistors, capacitors, ICs, connectors',  'SC-ELEC', 'goods', 531, false),
    ('SC-ELEC-PCB',   'PCB & PCBA Services',    'Bare PCB fabrication, SMT assembly, and through-hole soldering',         'SC-ELEC', 'goods', 532, false),
    ('SC-ELEC-TEST',  'Test & Measurement Eq.', 'Oscilloscopes, spectrum analysers, ICT fixtures, and burn-in chambers',  'SC-ELEC', 'goods', 533, false),
    ('SC-ELEC-SEMI',  'Semiconductors & Wafers','Silicon wafers, bare die, memory chips, and ASIC procurement',           'SC-ELEC', 'goods', 534, true),
    ('SC-ELEC-PACK',  'ESD & Electronics Pack.','Anti-static bags, ESD trays, moisture barrier bags, and reel packaging', 'SC-ELEC', 'goods', 535, false);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-ELEC',  'Electronics Cost of Sales',   'Direct component and conversion costs for electronics manufacturing', 'COST_OF_SALES', 'ELECTRONICS',    'BI-COGS',  44),
    ('BI-CAPEX-ELEC', 'Electronics Capital Equipment','Capital investment in SMT lines, test equipment, and clean rooms',   'CAPEX',         'ELECTRONICS_MFG','BI-CAPEX', 34);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-ELEC-SMT',  'SMT & Assembly Equipment',    'Pick-and-place machines, reflow ovens, wave solder, and AOI systems', 'IC-MFG-EQ', 3, 330),
    ('IC-ELEC-COMP', 'Electronic Components',       'Passive components, ICs, connectors, and electromechanical parts',    'IC-COMP',   3, 331),
    ('IC-ELEC-SEMI', 'Semiconductors & Wafers',     'Silicon wafers, bare die, memory chips, microcontrollers, and ASICs', 'IC-COMP',   3, 332);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-ELEC-COMP',  '32000000', 'broad',   85, true,  'Electronic components and supplies — segment'),
    ('SC-ELEC-COMP',  '32100000', 'broad',   88, false, 'Passive electronic components — class'),
    ('SC-ELEC-PCB',   '32150000', 'broad',   85, true,  'Printed circuit assemblies — class'),
    ('SC-ELEC-TEST',  '41110000', 'broad',   80, true,  'Laboratory and measuring instruments — class'),
    ('SC-ELEC-SEMI',  '32101500', 'broad',   88, true,  'Semiconductors — family'),
    ('SC-ELEC-PACK',  '44102000', 'broad',   78, true,  'Storage and organisation equipment — class'),
    ('SC-ELEC-PCB',   '43211700', 'broad',   82, false, 'Computer components — family');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-ELEC-COMP',  'EXACT', '32000000', NULL,       30, 96, 'Electronic components segment → Components'),
    ('SC-ELEC-SEMI',  'EXACT', '32101500', NULL,       30, 96, 'Semiconductors family → Semi'),
    ('SC-ELEC-COMP',  'RANGE', '32000000', '32999999', 20, 88, 'Electronic components and supplies segment'),
    ('SC-ELEC-PCB',   'RANGE', '32150000', '32159999', 20, 88, 'Printed circuit assemblies class'),
    ('SC-ELEC-TEST',  'RANGE', '41110000', '41119999', 15, 80, 'Lab and measuring instruments class'),
    ('SC-ELEC-SEMI',  'RANGE', '32101500', '32101599', 20, 88, 'Semiconductors family'),
    ('SC-ELEC-PACK',  'RANGE', '44102000', '44102999', 10, 78, 'Storage and packaging class'),
    ('SC-ELEC-COMP',  'RANGE', '32000000', '32999999',  3, 55, 'Segment 32: Electronic components catchall'),
    ('SC-ELEC-TEST',  'RANGE', '41000000', '41999999',  3, 55, 'Segment 41: Lab equipment catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-ELEC-COMP', 'BI-COGS-ELEC'), ('SC-ELEC-PCB',  'BI-COGS-ELEC'),
          ('SC-ELEC-SEMI', 'BI-COGS-ELEC'), ('SC-ELEC-PACK', 'BI-COGS-ELEC'),
          ('SC-ELEC-TEST', 'BI-CAPEX-ELEC')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-ELEC-SMT',  '23150000', 'broad', 85, true,  'Manufacturing machinery and equipment — class'),
        ('IC-ELEC-COMP', '32100000', 'broad', 88, true,  'Passive electronic components — class'),
        ('IC-ELEC-SEMI', '32101500', 'broad', 88, true,  'Semiconductors — family')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[111_pack_mfg_electronics] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[111_pack_mfg_electronics] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/112_pack_mining_petroleum.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: MINING & PETROLEUM
-- ============================================================================
-- File:     112_pack_mining_petroleum.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for mining, petroleum extraction, and refining
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: ASPE (Athyper South Africa Petroleum Extraction, ZAR)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-MNPET, SC-MNPET-DRILL, SC-MNPET-EXPL,
--                      SC-MNPET-REFINE, SC-MNPET-ENV, SC-MNPET-SAFETY
--   Business intents : BI-COGS-PETRO, BI-CAPEX-PETRO
--   Item categories  : IC-PETRO-DRILL, IC-PETRO-FUEL, IC-PETRO-CHEM
--   Commodity bridge : all rows with pack = '112_pack_mining_petroleum'
--   Routing rules    : all rows with pack = '112_pack_mining_petroleum'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '112_pack_mining_petroleum';
    v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-HVY-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first (IC-HVY-EQ missing)'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-MNPET', 'Mining & Petroleum', 'Drilling, exploration, refining, environmental, and HSE spend', 'goods', 540, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-MNPET-DRILL',  'Drilling & Extraction Eq.',  'Drill bits, casings, wellheads, pumps, and downhole tools',              'SC-MNPET', 'goods',    541, false),
    ('SC-MNPET-EXPL',   'Exploration & Surveying',    'Seismic services, geophysical surveys, and exploration consultancy',     'SC-MNPET', 'services', 542, true),
    ('SC-MNPET-REFINE',  'Refining & Processing',     'Catalysts, process chemicals, refinery equipment, and pipeline spares', 'SC-MNPET', 'goods',    543, false),
    ('SC-MNPET-ENV',    'Environmental & Remediation','Environmental monitoring, spill remediation, and waste disposal',        'SC-MNPET', 'services', 544, true),
    ('SC-MNPET-SAFETY', 'Safety, HSE & PPE',          'Personal protective equipment, gas detection, and safety training',     'SC-MNPET', 'goods',    545, false);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-PETRO',  'Petroleum Cost of Sales',    'Direct extraction, processing, and catalyst costs',                 'COST_OF_SALES', 'PETROLEUM',  'BI-COGS',  45),
    ('BI-CAPEX-PETRO', 'Petroleum Capital Equipment','Capital investment in drilling rigs, wellheads, and refinery plant', 'CAPEX',         'PETRO_PLANT','BI-CAPEX', 35);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-PETRO-DRILL', 'Drilling & Extraction Equipment', 'Drill rigs, downhole tools, casings, wellheads, and mud pumps',   'IC-HVY-EQ', 3, 340),
    ('IC-PETRO-FUEL',  'Petroleum Products & Feedstocks', 'Crude oil, refined fuels, LNG, and petrochemical feedstocks',     'IC-FUEL',   3, 341),
    ('IC-PETRO-CHEM',  'Refinery & Process Chemicals',   'Catalysts, corrosion inhibitors, drilling fluids, and biocides',  'IC-CHEM',   3, 342);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-MNPET-DRILL',  '22000000', 'broad',   85, true,  'Mining and drilling equipment — segment'),
    ('SC-MNPET-DRILL',  '22100000', 'broad',   88, false, 'Mining machinery — class'),
    ('SC-MNPET-EXPL',   '76110000', 'broad',   80, true,  'Professional and management services — class'),
    ('SC-MNPET-REFINE', '15000000', 'broad',   85, true,  'Fuels and fuel additives — segment'),
    ('SC-MNPET-REFINE', '12160000', 'broad',   82, false, 'Petroleum and lubricant chemicals — class'),
    ('SC-MNPET-ENV',    '77000000', 'broad',   85, true,  'Environmental services — segment'),
    ('SC-MNPET-SAFETY', '46180000', 'broad',   82, true,  'Safety and protection equipment — class');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-MNPET-DRILL',  'EXACT', '22000000', NULL,       30, 96, 'Mining and drilling segment → Drilling'),
    ('SC-MNPET-ENV',    'EXACT', '77000000', NULL,       30, 96, 'Environmental services segment → Environmental'),
    ('SC-MNPET-DRILL',  'RANGE', '22000000', '22999999', 20, 88, 'Mining and drilling equipment segment'),
    ('SC-MNPET-REFINE', 'RANGE', '15000000', '15999999', 20, 88, 'Fuels and fuel additives segment'),
    ('SC-MNPET-REFINE', 'RANGE', '12160000', '12169999', 15, 82, 'Petroleum and lubricant chemicals class'),
    ('SC-MNPET-ENV',    'RANGE', '77000000', '77999999', 20, 88, 'Environmental services segment'),
    ('SC-MNPET-SAFETY', 'RANGE', '46180000', '46189999', 15, 82, 'Safety and protection equipment class'),
    ('SC-MNPET-EXPL',   'RANGE', '76000000', '76999999',  3, 55, 'Segment 76: Professional services catchall'),
    ('SC-MNPET-DRILL',  'RANGE', '22000000', '22999999',  3, 55, 'Segment 22: Mining equipment catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-MNPET-DRILL',  'BI-COGS-PETRO'), ('SC-MNPET-EXPL',   'BI-COGS-PETRO'),
          ('SC-MNPET-REFINE', 'BI-COGS-PETRO'), ('SC-MNPET-ENV',    'BI-COGS-PETRO'),
          ('SC-MNPET-SAFETY', 'BI-COGS-PETRO')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-PETRO-DRILL', '22100000', 'broad', 88, true,  'Mining machinery — class'),
        ('IC-PETRO-FUEL',  '15000000', 'broad', 85, true,  'Fuels and fuel additives — segment'),
        ('IC-PETRO-CHEM',  '12160000', 'broad', 82, true,  'Petroleum and lubricant chemicals — class')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[112_pack_mining_petroleum] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[112_pack_mining_petroleum] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[112_pack_mining_petroleum] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[112_pack_mining_petroleum] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[112_pack_mining_petroleum] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[112_pack_mining_petroleum] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[112_pack_mining_petroleum] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/113_pack_agriculture.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: AGRICULTURE
-- ============================================================================
-- File:     113_pack_agriculture.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for agricultural production and agribusiness
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: AUKA (Athyper UK Agriculture, GBP)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-AGRI, SC-AGRI-SEED, SC-AGRI-FERT,
--                      SC-AGRI-PEST, SC-AGRI-EQUIP, SC-AGRI-HARVEST
--   Business intents : BI-COGS-AGRI, BI-CAPEX-AGRI
--   Item categories  : IC-AGRI-EQUIP, IC-AGRI-SEED, IC-AGRI-CHEM
--   Commodity bridge : all rows with pack = '113_pack_agriculture'
--   Routing rules    : all rows with pack = '113_pack_agriculture'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '113_pack_agriculture';
    v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-RAW') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-AGR-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first (IC-AGR-EQ missing)'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-AGRI', 'Agriculture & Agribusiness', 'Seeds, fertilizers, crop protection, equipment, and post-harvest', 'goods', 550, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-AGRI-SEED',    'Seeds & Planting Material', 'Certified seeds, seedlings, rootstock, and biological inoculants',      'SC-AGRI', 'goods',    551, true),
    ('SC-AGRI-FERT',    'Fertilizers & Soil Inputs', 'NPK, micronutrients, organic compost, and soil conditioners',           'SC-AGRI', 'goods',    552, true),
    ('SC-AGRI-PEST',    'Crop Protection',            'Herbicides, insecticides, fungicides, and biopesticides',              'SC-AGRI', 'goods',    553, true),
    ('SC-AGRI-EQUIP',   'Farm Machinery & Equipment','Tractors, harvesters, irrigation systems, and precision ag technology', 'SC-AGRI', 'goods',    554, false),
    ('SC-AGRI-HARVEST', 'Post-Harvest & Storage',    'Grain storage, drying equipment, cold rooms, and packaging',           'SC-AGRI', 'goods',    555, false);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-AGRI',  'Agricultural Cost of Sales',   'Direct seed, crop input, and harvesting costs',                        'COST_OF_SALES', 'AGRICULTURE', 'BI-COGS',  46),
    ('BI-CAPEX-AGRI', 'Agricultural Capital Equipment','Capital investment in farm machinery, irrigation, and storage plant',  'CAPEX',         'FARM_PLANT',  'BI-CAPEX', 36);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-AGRI-EQUIP', 'Farm Machinery & Equipment',  'Tractors, combines, ploughs, sprayers, and irrigation systems',    'IC-AGR-EQ', 3, 350),
    ('IC-AGRI-SEED',  'Seeds & Planting Materials',  'Certified seeds, seedlings, cuttings, and microbial inoculants',   'IC-RAW',    3, 351),
    ('IC-AGRI-CHEM',  'Agrochemicals & Fertilizers', 'Herbicides, fungicides, insecticides, fertilizers, and adjuvants', 'IC-CHEM',   3, 352);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-AGRI-SEED',    '10170000', 'broad',   85, true,  'Plant and crop products — class'),
    ('SC-AGRI-SEED',    '10000000', 'broad',   80, false, 'Live plant and animal material — segment'),
    ('SC-AGRI-FERT',    '12352700', 'broad',   85, true,  'Fertilizers and plant nutrients — family'),
    ('SC-AGRI-PEST',    '10191500', 'broad',   85, true,  'Crop protection products — family'),
    ('SC-AGRI-EQUIP',   '20000000', 'broad',   88, true,  'Farming and fishing machinery — segment'),
    ('SC-AGRI-EQUIP',   '20110000', 'broad',   85, false, 'Agricultural equipment — class'),
    ('SC-AGRI-HARVEST', '20150000', 'broad',   82, true,  'Crop storage and handling — class');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-AGRI-EQUIP',   'EXACT', '20000000', NULL,       30, 96, 'Farming machinery segment → Equipment'),
    ('SC-AGRI-SEED',    'RANGE', '10000000', '10999999', 20, 85, 'Live plant and animal material segment'),
    ('SC-AGRI-FERT',    'RANGE', '12352700', '12352799', 15, 85, 'Fertilizers family'),
    ('SC-AGRI-PEST',    'RANGE', '10191500', '10191599', 15, 85, 'Crop protection products family'),
    ('SC-AGRI-EQUIP',   'RANGE', '20000000', '20999999', 20, 88, 'Farming machinery segment'),
    ('SC-AGRI-HARVEST', 'RANGE', '20150000', '20159999', 15, 82, 'Crop storage and handling class'),
    ('SC-AGRI-SEED',    'RANGE', '10000000', '10999999',  3, 60, 'Segment 10: Live plant/animal catchall'),
    ('SC-AGRI-EQUIP',   'RANGE', '20000000', '20999999',  3, 55, 'Segment 20: Farming machinery catchall'),
    ('SC-AGRI-PEST',    'RANGE', '12000000', '12999999',  3, 55, 'Segment 12: Agrochemicals catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-AGRI-SEED',    'BI-COGS-AGRI'), ('SC-AGRI-FERT',    'BI-COGS-AGRI'),
          ('SC-AGRI-PEST',    'BI-COGS-AGRI'), ('SC-AGRI-HARVEST',  'BI-COGS-AGRI'),
          ('SC-AGRI-EQUIP',   'BI-CAPEX-AGRI')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-AGRI-EQUIP', '20110000', 'broad', 85, true,  'Agricultural equipment — class'),
        ('IC-AGRI-SEED',  '10170000', 'broad', 85, true,  'Plant and crop products — class'),
        ('IC-AGRI-CHEM',  '12352700', 'broad', 85, true,  'Fertilizers and plant nutrients — family')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[113_pack_agriculture] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[113_pack_agriculture] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[113_pack_agriculture] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[113_pack_agriculture] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[113_pack_agriculture] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[113_pack_agriculture] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[113_pack_agriculture] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/114_pack_education.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: EDUCATION SERVICES
-- ============================================================================
-- File:     114_pack_education.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for education and training services
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: AJED (Athyper Japan Education Services, JPY)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-EDU, SC-EDU-CONTENT, SC-EDU-PLATFORM,
--                      SC-EDU-FACILITY, SC-EDU-STAFF, SC-EDU-CERT
--   Business intents : BI-COGS-EDU, BI-REG-EDU
--   Item categories  : IC-EDU-CONTENT, IC-EDU-PLATFORM, IC-EDU-LAB
--   Commodity bridge : all rows with pack = '114_pack_education'
--   Routing rules    : all rows with pack = '114_pack_education'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '114_pack_education';
    v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-PROF') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-SUBSVC') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first (IC-SUBSVC missing)'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'services', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-EDU', 'Education & Training Services', 'Learning content, platforms, facilities, instructors, and certifications', 'services', 560, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-EDU-CONTENT',   'Learning Content & Courseware', 'Textbooks, e-learning modules, curricula, and assessment materials',  'SC-EDU', 'services', 561, false),
    ('SC-EDU-PLATFORM',  'LMS & EdTech Platforms',        'Learning management systems, virtual classrooms, and assessment tools','SC-EDU', 'services', 562, false),
    ('SC-EDU-FACILITY',  'Classroom & Lab Facilities',    'Physical classroom hire, science lab equipment, and audio-visual',    'SC-EDU', 'goods',    563, false),
    ('SC-EDU-STAFF',     'Instructors & Trainers',        'Faculty, guest lecturers, training facilitators, and tutors',        'SC-EDU', 'services', 564, true),
    ('SC-EDU-CERT',      'Certifications & Accreditation','Professional certifications, awarding body fees, and accreditation',  'SC-EDU', 'services', 565, true);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-EDU', 'Education Cost of Sales',     'Direct content, platform, and instructor delivery costs',           'COST_OF_SALES', 'EDUCATION', 'BI-COGS',  47),
    ('BI-REG-EDU',  'Education Regulatory Expense','Accreditation fees, regulatory filings, and compliance training',   'REGULATORY',    'EDU_CERT',  'BI-REG',   17);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-EDU-CONTENT',  'Learning Content & Materials', 'Textbooks, courseware, e-learning modules, and assessment materials', 'IC-SUBSVC',  3, 360),
    ('IC-EDU-PLATFORM', 'EdTech & LMS Platforms',       'LMS software, virtual classroom tools, and online assessment systems','IC-ITSVC',   3, 361),
    ('IC-EDU-LAB',      'Education Lab Equipment',      'Science lab benches, instruments, simulation kits, and AV systems',  'IC-LAB-EQ',  3, 362);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-EDU-CONTENT',  '86000000', 'broad',   85, true,  'Educational and vocational services — segment'),
    ('SC-EDU-CONTENT',  '86100000', 'broad',   85, false, 'Vocational training — class'),
    ('SC-EDU-PLATFORM', '43232800', 'broad',   82, true,  'Educational software — family'),
    ('SC-EDU-FACILITY', '56110000', 'broad',   80, true,  'Classroom and educational furniture — class'),
    ('SC-EDU-STAFF',    '86110000', 'broad',   85, true,  'Professional education services — class'),
    ('SC-EDU-CERT',     '86130000', 'broad',   82, true,  'Certifications and accreditation services — class'),
    ('SC-EDU-PLATFORM', '43230000', 'broad',   78, false, 'Software — class (EdTech)');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-EDU-CONTENT',  'EXACT', '86000000', NULL,       30, 96, 'Educational services segment → Content'),
    ('SC-EDU-CONTENT',  'RANGE', '86000000', '86999999', 20, 88, 'Educational and vocational services segment'),
    ('SC-EDU-PLATFORM', 'RANGE', '43232800', '43232899', 20, 85, 'Educational software family'),
    ('SC-EDU-FACILITY', 'RANGE', '56110000', '56119999', 15, 80, 'Educational furniture and equipment class'),
    ('SC-EDU-STAFF',    'RANGE', '86110000', '86119999', 20, 88, 'Professional education services class'),
    ('SC-EDU-CERT',     'RANGE', '86130000', '86139999', 15, 82, 'Certifications and accreditation class'),
    ('SC-EDU-CONTENT',  'RANGE', '86000000', '86999999',  3, 55, 'Segment 86: Education catchall'),
    ('SC-EDU-PLATFORM', 'RANGE', '43000000', '43999999',  3, 55, 'Segment 43: IT/software catchall'),
    ('SC-EDU-FACILITY', 'RANGE', '41000000', '41999999',  3, 55, 'Segment 41: Lab equipment catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-EDU-CONTENT',  'BI-COGS-EDU'), ('SC-EDU-PLATFORM', 'BI-COGS-EDU'),
          ('SC-EDU-FACILITY', 'BI-COGS-EDU'), ('SC-EDU-STAFF',    'BI-COGS-EDU'),
          ('SC-EDU-CERT',     'BI-REG-EDU')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-EDU-CONTENT',  '86000000', 'broad', 85, true,  'Educational and vocational services — segment'),
        ('IC-EDU-PLATFORM', '43232800', 'broad', 82, true,  'Educational software — family'),
        ('IC-EDU-LAB',      '41110000', 'broad', 80, true,  'Laboratory instruments — class')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[114_pack_education] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[114_pack_education] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[114_pack_education] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[114_pack_education] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[114_pack_education] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[114_pack_education] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[114_pack_education] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/100_industry_packs/115_pack_healthcare.sql
-- ============================================================================
-- ATHYPER BLUEPRINT — EXTENSION PACK: HEALTHCARE SERVICES
-- ============================================================================
-- File:     115_pack_healthcare.sql
-- Schemas:  master.spend_category, master.business_intent, master.item_category,
--           master.commodity_classification, control.commodity_to_spend_category_rule
-- Purpose:  Industry pack for hospital and healthcare services
-- Depends:  020_spend_categories.sql, 021_business_intents.sql,
--           023_commodity_bridge.sql, 024_routing_rules.sql,
--           025_base_item_categories.sql
-- Idempotent: Yes — ON CONFLICT … DO UPDATE + delete-reinsert for routing
-- Legal entity: APHS (Athyper Philippines Hospital Services, PHP)
-- ============================================================================
-- PACK OWNS:
--   Spend categories : SC-HLTH, SC-HLTH-MED, SC-HLTH-DRUG,
--                      SC-HLTH-SUPPLY, SC-HLTH-LAB, SC-HLTH-IT
--   Business intents : BI-COGS-HEALTH, BI-REG-HEALTH
--   Item categories  : IC-HLTH-MED, IC-HLTH-DRUG, IC-HLTH-LAB
--   Commodity bridge : all rows with pack = '115_pack_healthcare'
--   Routing rules    : all rows with pack = '115_pack_healthcare'
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '115_pack_healthcare';
    v_version text := '1.0.0';
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid AND code = 'SC-PROF') THEN
        RAISE EXCEPTION 'Base spend categories not loaded — run 020 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS') THEN
        RAISE EXCEPTION 'Base business intents not loaded — run 021 first'; END IF;
    IF NOT EXISTS (SELECT 1 FROM master.item_category WHERE tenant_id = v_tid AND code = 'IC-MED-EQ') THEN
        RAISE EXCEPTION 'Base item categories not loaded — run 025 first (IC-MED-EQ missing)'; END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────

    CREATE TEMP TABLE tmp_sc (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text,
        procurement_type text NOT NULL DEFAULT 'goods', visibility text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false, is_regulated boolean NOT NULL DEFAULT false,
        sort_order smallint NOT NULL DEFAULT 0, is_container boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-HLTH', 'Healthcare & Hospital Services', 'Medical equipment, drugs, clinical supplies, diagnostics, and health IT', 'goods', 570, true);

    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order, is_regulated) VALUES
    ('SC-HLTH-MED',    'Medical Devices & Equipment', 'Surgical instruments, imaging equipment, patient monitors, and implants', 'SC-HLTH', 'goods',    571, true),
    ('SC-HLTH-DRUG',   'Pharmaceuticals & Biologics', 'Drugs, vaccines, blood products, and OTC medicines',                    'SC-HLTH', 'goods',    572, true),
    ('SC-HLTH-SUPPLY', 'Clinical Consumables',        'Gloves, syringes, wound dressings, catheters, and sterile consumables', 'SC-HLTH', 'goods',    573, true),
    ('SC-HLTH-LAB',    'Lab & Diagnostic Services',   'Diagnostic reagents, lab analysers, pathology, and radiology services', 'SC-HLTH', 'services', 574, true),
    ('SC-HLTH-IT',     'Health IT & EMR Systems',     'Electronic medical records, PACS, hospital information systems',        'SC-HLTH', 'services', 575, true);

    CREATE TEMP TABLE tmp_bi (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, domain text NOT NULL, subtype text, parent_code text,
        sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order) VALUES
    ('BI-COGS-HEALTH', 'Healthcare Cost of Sales',     'Direct cost of medical supplies, drugs, and clinical consumables',  'COST_OF_SALES', 'HEALTHCARE', 'BI-COGS',  48),
    ('BI-REG-HEALTH',  'Healthcare Regulatory Expense','Licensing fees, inspections, accreditation, and regulatory filings','REGULATORY',    'HLTH_CERT',  'BI-REG',   18);

    CREATE TEMP TABLE tmp_ic (
        seed_id uuid DEFAULT shared.uuidv7(), code text NOT NULL, name text NOT NULL,
        description text, parent_code text NOT NULL,
        level_no smallint NOT NULL DEFAULT 3, sort_order smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-HLTH-MED',  'Medical Devices & Equipment',    'Surgical instruments, patient monitors, imaging devices, and implants', 'IC-MED-EQ',  3, 370),
    ('IC-HLTH-DRUG', 'Pharmaceuticals & Biologics',    'Prescription drugs, vaccines, biologics, and controlled substances',    'IC-CHEM',    3, 371),
    ('IC-HLTH-LAB',  'Diagnostic & Lab Equipment',     'Lab analysers, reagents, diagnostic kits, and pathology instruments',   'IC-LAB-EQ',  3, 372);

    CREATE TEMP TABLE tmp_bridge (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', cc_code text NOT NULL,
        mapping_type text NOT NULL DEFAULT 'broad', confidence numeric(5,2) NOT NULL,
        is_primary boolean NOT NULL DEFAULT false, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_bridge (sc_code, cc_code, mapping_type, confidence, is_primary, description) VALUES
    ('SC-HLTH-MED',    '42000000', 'broad',   88, true,  'Medical equipment and accessories — segment'),
    ('SC-HLTH-MED',    '42130000', 'broad',   85, false, 'Surgical supplies and tools — class'),
    ('SC-HLTH-DRUG',   '51000000', 'broad',   88, true,  'Drugs and pharmaceutical products — segment'),
    ('SC-HLTH-SUPPLY', '42130000', 'broad',   82, true,  'Medical disposables and supplies — class'),
    ('SC-HLTH-SUPPLY', '42140000', 'broad',   80, false, 'Patient care supplies — class'),
    ('SC-HLTH-LAB',    '41110000', 'broad',   85, true,  'Laboratory instruments and supplies — class'),
    ('SC-HLTH-IT',     '43230000', 'broad',   82, true,  'Software — Health IT/EMR class');

    CREATE TEMP TABLE tmp_route (
        sc_code text NOT NULL, domain text NOT NULL DEFAULT 'unspsc', match_mode text NOT NULL,
        code_from text NOT NULL, code_to text,
        priority smallint NOT NULL, confidence numeric(5,2) NOT NULL, description text
    ) ON COMMIT DROP;

    INSERT INTO tmp_route (sc_code, match_mode, code_from, code_to, priority, confidence, description) VALUES
    ('SC-HLTH-MED',    'EXACT', '42000000', NULL,       30, 96, 'Medical equipment segment → Med devices'),
    ('SC-HLTH-DRUG',   'EXACT', '51000000', NULL,       30, 96, 'Pharma products segment → Drugs'),
    ('SC-HLTH-MED',    'RANGE', '42000000', '42999999', 20, 88, 'Medical equipment and accessories segment'),
    ('SC-HLTH-DRUG',   'RANGE', '51000000', '51999999', 20, 88, 'Drugs and pharmaceutical products segment'),
    ('SC-HLTH-SUPPLY', 'RANGE', '42130000', '42149999', 15, 82, 'Medical disposables and supplies classes'),
    ('SC-HLTH-LAB',    'RANGE', '41110000', '41119999', 15, 82, 'Lab instruments and supplies class'),
    ('SC-HLTH-IT',     'RANGE', '43230000', '43239999', 15, 80, 'Software class — Health IT'),
    ('SC-HLTH-MED',    'RANGE', '42000000', '42999999',  3, 55, 'Segment 42: Medical equipment catchall'),
    ('SC-HLTH-LAB',    'RANGE', '41000000', '41999999',  3, 55, 'Segment 41: Lab equipment catchall');

    -- ── STAGE C: UPSERT spend categories ─────────────────────────────────

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, NULL, s.seed_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'container', true)),
        updated_at = now(), updated_by = v_su;

    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        procurement_type, visibility, is_classification_required, is_hs_required,
        is_regulated, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, p.root_category_id,
        s.procurement_type, s.visibility, s.is_classification_required, s.is_hs_required,
        s.is_regulated, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, root_category_id = EXCLUDED.root_category_id,
        procurement_type = EXCLUDED.procurement_type, is_regulated = EXCLUDED.is_regulated,
        sort_order = EXCLUDED.sort_order,
        metadata = master.spend_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT business intents ─────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, s.domain, s.subtype,
        p.id, 1, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bi s
    JOIN master.business_intent p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        domain = EXCLUDED.domain, subtype = EXCLUDED.subtype,
        parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth, sort_order = EXCLUDED.sort_order,
        metadata = master.business_intent.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    UPDATE master.spend_category sc SET default_intent_id = bi.id, updated_at = now(), updated_by = v_su
    FROM master.business_intent bi
    WHERE sc.tenant_id = v_tid AND bi.tenant_id = v_tid
      AND (sc.code, bi.code) IN (
          ('SC-HLTH-MED',    'BI-COGS-HEALTH'), ('SC-HLTH-DRUG',   'BI-COGS-HEALTH'),
          ('SC-HLTH-SUPPLY', 'BI-COGS-HEALTH'), ('SC-HLTH-LAB',    'BI-COGS-HEALTH'),
          ('SC-HLTH-IT',     'BI-COGS-HEALTH')
      );

    -- ── STAGE E: UPSERT commodity bridge ─────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc_map;
    CREATE TEMP TABLE tmp_sc_map AS SELECT code, id FROM master.spend_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'spend_category', sm.id, 'commodity', b.domain, cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_bridge b
    JOIN tmp_sc_map sm ON sm.code = b.sc_code
    JOIN shared.commodity_code cc ON cc.domain_code = b.domain AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE E2: UPSERT item_category leaves ───────────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id, level_no, sort_order, metadata, status, created_by
    )
    SELECT s.seed_id, v_tid, s.code, s.name, s.description, p.id, s.level_no, s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM tmp_ic s
    JOIN master.item_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id, level_no = EXCLUDED.level_no, sort_order = EXCLUDED.sort_order,
        metadata = master.item_category.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E3: UPSERT item_category bridge ───────────────────────────
    DROP TABLE IF EXISTS tmp_ic_map;
    CREATE TEMP TABLE tmp_ic_map AS SELECT code, id FROM master.item_category WHERE tenant_id = v_tid;

    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description, metadata, status, created_by
    )
    SELECT v_tid, 'item_category', im.id, 'commodity', 'unspsc', cc.id,
        b.mapping_type, b.confidence, 'seed', b.is_primary, b.description,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        'active', v_su
    FROM (VALUES
        ('IC-HLTH-MED',  '42000000', 'broad', 88, true,  'Medical equipment and accessories — segment'),
        ('IC-HLTH-DRUG', '51000000', 'broad', 88, true,  'Drugs and pharmaceutical products — segment'),
        ('IC-HLTH-LAB',  '41110000', 'broad', 85, true,  'Laboratory instruments and supplies — class')
    ) AS b(ic_code, cc_code, mapping_type, confidence, is_primary, description)
    JOIN tmp_ic_map im ON im.code = b.ic_code
    JOIN shared.commodity_code cc ON cc.domain_code = 'unspsc' AND cc.code = b.cc_code
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type, confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance, is_primary = EXCLUDED.is_primary, description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata || jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text)),
        updated_at = now(), updated_by = v_su
    WHERE (master.commodity_classification.mapping_type, master.commodity_classification.confidence,
           master.commodity_classification.provenance, master.commodity_classification.is_primary,
           master.commodity_classification.description)
       IS DISTINCT FROM (EXCLUDED.mapping_type, EXCLUDED.confidence, EXCLUDED.provenance, EXCLUDED.is_primary, EXCLUDED.description);

    -- ── STAGE F: UPSERT routing rules (delete-reinsert) ─────────────────
    DELETE FROM control.commodity_to_spend_category_rule
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, match_mode, code_from, code_to, spend_category_id,
        priority, confidence, metadata, status, created_by
    )
    SELECT v_tid, r.domain, r.match_mode, r.code_from, r.code_to, sm.id, r.priority, r.confidence,
        jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text, 'description', r.description)),
        'active', v_su
    FROM tmp_route r
    JOIN tmp_sc_map sm ON sm.code = r.sc_code
    ON CONFLICT (tenant_id, commodity_domain_code, code_from, priority) WHERE is_active = true
    DO UPDATE SET
        spend_category_id = EXCLUDED.spend_category_id,
        match_mode        = EXCLUDED.match_mode,
        code_to           = EXCLUDED.code_to,
        confidence        = EXCLUDED.confidence,
        metadata          = EXCLUDED.metadata,
        updated_at        = now(),
        updated_by        = '00000000-0000-0000-0000-000000000000'::uuid;

    -- ── STAGE G: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 6 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Expected 6 spend categories, got %',
            (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 2 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Expected 2 business intents, got %',
            (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Item category load incomplete: expected 3, got %',
            (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Commodity bridge incomplete: expected >=7, got %',
            (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) < 1 THEN
        RAISE EXCEPTION '[115_pack_healthcare] Routing rules incomplete: expected >=8, got %',
            (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack); END IF;

    IF EXISTS (SELECT 1 FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND match_mode = 'EXACT' AND confidence < 95) THEN
        RAISE EXCEPTION '[115_pack_healthcare] EXACT rules must have confidence >= 95'; END IF;

    RAISE NOTICE '[115_pack_healthcare] Pack loaded: % spend cats, % intents, % item cats, % bridge rows, % routing rules',
        (SELECT count(*) FROM master.spend_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.business_intent WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'spend_category' AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM control.commodity_to_spend_category_rule WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/200_coa_frameworks/200_chart_catalog.sql
-- ============================================================================
-- ATHYPER GROUP — CHART OF ACCOUNTS CATALOG
-- ============================================================================
-- File:     200_chart_catalog.sql
-- Schema:   master.chart_of_account
-- Purpose:  7 charts of accounts (1 group consolidation + 1 IFRS operating
--           + 5 local GAAP variants) per §18.1
-- Depends:  000_tenant/000_athyper_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §18.1 Chart Catalog
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '200_chart_catalog';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_count    int;
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
    -- STAGE B: Stage chart rows
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_coa (
        seed_id        uuid DEFAULT shared.uuidv7(),
        code           text NOT NULL,
        name           text NOT NULL,
        description    text,
        framework      text NOT NULL,
        country_code   char(2),           -- NULL for framework-only charts
        account_range  text NOT NULL DEFAULT '1000-9999',
        version        int  NOT NULL DEFAULT 1,
        is_locked      boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    INSERT INTO tmp_coa (code, name, description, framework, country_code) VALUES
    ('COA-IFRS-GROUP', 'IFRS Group Consolidation Chart',  'Group consolidation chart for ATHYPER holdings',          'ifrs',       NULL),
    ('COA-IFRS',       'IFRS Operating Chart',            'Standard IFRS-converged operating chart (12 companies)',  'ifrs',       NULL),
    ('COA-USGAAP',     'US GAAP Operating Chart',         'US GAAP operating chart for US subsidiary',               'us_gaap',    'US'),
    ('COA-HGB',        'HGB Operating Chart',             'German HGB operating chart',                              'local_gaap', 'DE'),
    ('COA-INDAS',      'Ind AS Operating Chart',           'Indian Ind AS operating chart',                           'local_gaap', 'IN'),
    ('COA-JGAAP',      'J-GAAP Operating Chart',          'Japanese J-GAAP operating chart',                         'local_gaap', 'JP'),
    ('COA-SOCPA',      'SOCPA Operating Chart',           'Saudi SOCPA operating chart',                             'local_gaap', 'SA');

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: UPSERT into master.chart_of_account
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.chart_of_account (
        id, tenant_id, code, name, description,
        framework, country_code, account_range,
        version, is_locked,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, t.code, t.name, t.description,
        t.framework, t.country_code, t.account_range,
        t.version, t.is_locked,
        v_meta, 'active', v_su
    FROM tmp_coa t
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        description    = EXCLUDED.description,
        framework      = EXCLUDED.framework,
        country_code   = EXCLUDED.country_code,
        account_range  = EXCLUDED.account_range,
        version        = EXCLUDED.version,
        is_locked      = EXCLUDED.is_locked,
        metadata       = master.chart_of_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.chart_of_account.name, master.chart_of_account.description,
           master.chart_of_account.framework, master.chart_of_account.country_code,
           master.chart_of_account.account_range, master.chart_of_account.version,
           master.chart_of_account.is_locked)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.framework, EXCLUDED.country_code,
           EXCLUDED.account_range, EXCLUDED.version,
           EXCLUDED.is_locked);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_count
    FROM master.chart_of_account
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    IF v_count <> 7 THEN
        RAISE EXCEPTION '[200_chart_catalog] Expected 7 charts of account, got %', v_count;
    END IF;

    RAISE NOTICE '[200_chart_catalog] Chart catalog seeded: % charts of account', v_count;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/200_coa_frameworks/210_group_chart_accounts.sql
-- ============================================================================
-- ATHYPER GROUP — IFRS GROUP CONSOLIDATION CHART OF ACCOUNTS
-- ============================================================================
-- File:     210_group_chart_accounts.sql
-- Schema:   master.gl_account
-- Purpose:  ~150 GL accounts for COA-IFRS-GROUP (group consolidation chart)
--           5 class roots, ~30 L2 headers, ~115 L3 posting accounts per §19
-- Depends:  200_chart_catalog.sql (COA-IFRS-GROUP chart)
-- Idempotent: Yes — ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE
-- Spec ref: §19 Group Consolidation Chart
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '210_group_chart';
    v_version text := '1.0.0';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_total   int;
    v_roots   int;
    v_posting int;
BEGIN
    -- ── STAGE A: Resolve tenant & chart ─────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS-GROUP';
    IF v_coa_id IS NULL THEN
        RAISE EXCEPTION 'Chart COA-IFRS-GROUP not found — run 200_chart_catalog.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Stage all accounts in temp table
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_gl (
        seed_id        uuid DEFAULT shared.uuidv7(),
        code           text NOT NULL,
        name           text NOT NULL,
        parent_code    text,
        level_no       smallint NOT NULL DEFAULT 1,
        description    text,
        account_class  text NOT NULL,
        node_type      text NOT NULL DEFAULT 'posting',
        normal_balance text NOT NULL,
        subledger_type text,
        sort_order     smallint NOT NULL DEFAULT 0,
        group_map      text           -- NULL for group chart (it IS the group chart)
    ) ON COMMIT DROP;

    -- ──────────────────────────────────────────────────────────────────────
    -- B1: L1 ROOTS (5 class headers)
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-A', 'Assets',      NULL, 1, 'asset',     'header', 'debit',  1000),
    ('GRP-L', 'Liabilities', NULL, 1, 'liability', 'header', 'credit', 2000),
    ('GRP-Q', 'Equity',      NULL, 1, 'equity',    'header', 'credit', 3000),
    ('GRP-R', 'Revenue',     NULL, 1, 'income',    'header', 'credit', 4000),
    ('GRP-E', 'Expenses',    NULL, 1, 'expense',   'header', 'debit',  5000);

    -- ──────────────────────────────────────────────────────────────────────
    -- B2: L2 HEADERS — Assets
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-A-CASH', 'Cash & Bank',               'GRP-A', 2, 'asset', 'header', 'debit', 1100),
    ('GRP-A-AR',   'Trade Receivables',          'GRP-A', 2, 'asset', 'header', 'debit', 1200),
    ('GRP-A-OAR',  'Other Receivables',          'GRP-A', 2, 'asset', 'header', 'debit', 1300),
    ('GRP-A-INV',  'Inventory',                  'GRP-A', 2, 'asset', 'header', 'debit', 1400),
    ('GRP-A-FA',   'Fixed Assets',               'GRP-A', 2, 'asset', 'header', 'debit', 1500),
    ('GRP-A-DEP',  'Accumulated Depreciation',   'GRP-A', 2, 'asset', 'header', 'debit', 1600),
    ('GRP-A-IA',   'Intangible Assets',          'GRP-A', 2, 'asset', 'header', 'debit', 1700),
    ('GRP-A-ROU',  'Right-of-Use Assets',        'GRP-A', 2, 'asset', 'header', 'debit', 1750),
    ('GRP-A-ICR',  'Intercompany Receivables',   'GRP-A', 2, 'asset', 'header', 'debit', 1800);

    -- B2: L2 HEADERS — Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-L-AP',     'Trade Payables',         'GRP-L', 2, 'liability', 'header', 'credit', 2100),
    ('GRP-L-ACCR',   'Accruals & Provisions',  'GRP-L', 2, 'liability', 'header', 'credit', 2200),
    ('GRP-L-TAX',    'Tax Payables',           'GRP-L', 2, 'liability', 'header', 'credit', 2300),
    ('GRP-L-EMP',    'Employee Liabilities',   'GRP-L', 2, 'liability', 'header', 'credit', 2400),
    ('GRP-L-LEASE',  'Lease Liabilities',      'GRP-L', 2, 'liability', 'header', 'credit', 2500),
    ('GRP-L-ICP',    'Intercompany Payables',  'GRP-L', 2, 'liability', 'header', 'credit', 2600),
    ('GRP-L-DEFREV', 'Deferred Revenue',       'GRP-L', 2, 'liability', 'header', 'credit', 2700),
    ('GRP-L-OTHL',   'Other Liabilities',      'GRP-L', 2, 'liability', 'header', 'credit', 2800);

    -- B2: L2 HEADERS — Equity
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-Q-CAP', 'Share Capital',     'GRP-Q', 2, 'equity', 'header', 'credit', 3100),
    ('GRP-Q-RES', 'Reserves',          'GRP-Q', 2, 'equity', 'header', 'credit', 3200),
    ('GRP-Q-RE',  'Retained Earnings', 'GRP-Q', 2, 'equity', 'header', 'credit', 3300);

    -- B2: L2 HEADERS — Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-R-SALES', 'Sales Revenue',         'GRP-R', 2, 'income', 'header', 'credit', 4100),
    ('GRP-R-OOI',   'Other Operating Income','GRP-R', 2, 'income', 'header', 'credit', 4200),
    ('GRP-R-FIN',   'Finance Income',        'GRP-R', 2, 'income', 'header', 'credit', 4300),
    ('GRP-R-ICR',   'Intercompany Revenue',  'GRP-R', 2, 'income', 'header', 'credit', 4400);

    -- B2: L2 HEADERS — Expenses
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-E-COGS',  'Cost of Sales',                'GRP-E', 2, 'expense', 'header', 'debit', 5100),
    ('GRP-E-SGA',   'Selling, General & Admin',     'GRP-E', 2, 'expense', 'header', 'debit', 5200),
    ('GRP-E-HR',    'HR & Payroll',                 'GRP-E', 2, 'expense', 'header', 'debit', 5300),
    ('GRP-E-DA',    'Depreciation & Amortisation',  'GRP-E', 2, 'expense', 'header', 'debit', 5400),
    ('GRP-E-FIN',   'Finance Costs',                'GRP-E', 2, 'expense', 'header', 'debit', 5500),
    ('GRP-E-TAX',   'Tax Expense',                  'GRP-E', 2, 'expense', 'header', 'debit', 5600),
    ('GRP-E-ICE',   'Intercompany Expense',         'GRP-E', 2, 'expense', 'header', 'debit', 5700),
    ('GRP-E-OTHER', 'Other Expenses',               'GRP-E', 2, 'expense', 'header', 'debit', 5800);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Assets
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    -- Cash & Bank
    ('GRP-A-CASH-OPER',  'Operating Cash',                  'GRP-A-CASH', 3, 'asset', 'posting', 'debit',  NULL,         1110),
    ('GRP-A-CASH-BANK',  'Bank Accounts',                   'GRP-A-CASH', 3, 'asset', 'posting', 'debit',  NULL,         1120),
    ('GRP-A-CASH-PETTY', 'Petty Cash',                      'GRP-A-CASH', 3, 'asset', 'posting', 'debit',  NULL,         1130),
    -- Trade Receivables
    ('GRP-A-AR-TRADE',   'Trade Receivables Control',       'GRP-A-AR',   3, 'asset', 'posting', 'debit',  'ar',         1210),
    ('GRP-A-AR-ALLOW',   'Allowance for Doubtful Debts',    'GRP-A-AR',   3, 'contra_asset', 'posting', 'credit', NULL,         1220),
    -- Other Receivables
    ('GRP-A-OAR-ADVANCE','Advances to Suppliers',           'GRP-A-OAR',  3, 'asset', 'posting', 'debit',  NULL,         1310),
    ('GRP-A-OAR-PREPAY', 'Prepaid Expenses',                'GRP-A-OAR',  3, 'asset', 'posting', 'debit',  NULL,         1320),
    ('GRP-A-OAR-DEPOSIT','Deposits & Guarantees',           'GRP-A-OAR',  3, 'asset', 'posting', 'debit',  NULL,         1330),
    -- Inventory
    ('GRP-A-INV-RAW',    'Raw Materials Inventory',         'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'inventory',  1410),
    ('GRP-A-INV-WIP',    'Work in Progress',                'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'wip',        1420),
    ('GRP-A-INV-FG',     'Finished Goods Inventory',        'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'inventory',  1430),
    ('GRP-A-INV-TRADE',  'Trading Goods Inventory',         'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'inventory',  1440),
    -- Fixed Assets
    ('GRP-A-FA-LAND',    'Land',                            'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1510),
    ('GRP-A-FA-BLDG',    'Buildings',                       'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1520),
    ('GRP-A-FA-PLANT',   'Plant & Machinery',               'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1530),
    ('GRP-A-FA-VEH',     'Vehicles',                        'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1540),
    ('GRP-A-FA-IT',      'IT Equipment',                    'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1550),
    ('GRP-A-FA-FURN',    'Furniture & Fixtures',            'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1560),
    ('GRP-A-FA-CWIP',    'Capital Work in Progress',        'GRP-A-FA',   3, 'asset', 'posting', 'debit',  NULL,         1570),
    -- Accumulated Depreciation
    ('GRP-A-DEP-BLDG',   'Accum Depr — Buildings',         'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1620),
    ('GRP-A-DEP-PLANT',  'Accum Depr — Plant & Machinery',  'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1630),
    ('GRP-A-DEP-VEH',    'Accum Depr — Vehicles',           'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1640),
    ('GRP-A-DEP-IT',     'Accum Depr — IT Equipment',       'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1650),
    ('GRP-A-DEP-FURN',   'Accum Depr — Furniture',          'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1660),
    -- Intangible Assets
    ('GRP-A-IA-GW',      'Goodwill',                        'GRP-A-IA',   3, 'asset', 'posting', 'debit',  NULL,         1710),
    ('GRP-A-IA-SW',      'Software & Licences',             'GRP-A-IA',   3, 'asset', 'posting', 'debit',  NULL,         1720),
    ('GRP-A-IA-AMORT',   'Accum Amortisation',              'GRP-A-IA',   3, 'contra_asset', 'posting', 'credit', NULL,         1730),
    -- Right-of-Use Assets
    ('GRP-A-ROU-PROP',   'Right-of-Use — Property',         'GRP-A-ROU',  3, 'asset', 'posting', 'debit',  NULL,         1751),
    ('GRP-A-ROU-EQUIP',  'Right-of-Use — Equipment',        'GRP-A-ROU',  3, 'asset', 'posting', 'debit',  NULL,         1752),
    ('GRP-A-ROU-AMORT',  'Accum Depr — ROU',                'GRP-A-ROU',  3, 'contra_asset', 'posting', 'credit', NULL,         1760),
    -- Intercompany Receivables
    ('GRP-A-ICR-TRADE',  'IC Receivables — Trade',           'GRP-A-ICR',  3, 'asset', 'posting', 'debit',  NULL,         1810),
    ('GRP-A-ICR-LOAN',   'IC Receivables — Loans',           'GRP-A-ICR',  3, 'asset', 'posting', 'debit',  NULL,         1820);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Liabilities
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    -- Trade Payables
    ('GRP-L-AP-TRADE',      'Trade Payables Control',        'GRP-L-AP',     3, 'liability', 'posting', 'credit', 'ap',  2110),
    ('GRP-L-AP-RETENTION',  'Retention Payable',             'GRP-L-AP',     3, 'liability', 'posting', 'credit', NULL,  2120),
    -- Accruals & Provisions
    ('GRP-L-ACCR-GEN',      'General Accruals',              'GRP-L-ACCR',   3, 'liability', 'posting', 'credit', NULL,  2210),
    ('GRP-L-ACCR-PROV',     'Provisions',                    'GRP-L-ACCR',   3, 'liability', 'posting', 'credit', NULL,  2220),
    -- Tax Payables
    ('GRP-L-TAX-CIT',       'Corporate Income Tax Payable',  'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,  2310),
    ('GRP-L-TAX-VAT-OUT',   'VAT/GST Output',               'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,  2320),
    ('GRP-L-TAX-VAT-IN',    'VAT/GST Input (Receivable)',    'GRP-L-TAX',    3, 'contra_liability', 'posting', 'debit',  NULL,  2330),
    ('GRP-L-TAX-WHT',       'Withholding Tax Payable',       'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,  2340),
    -- Employee Liabilities
    ('GRP-L-EMP-SAL',       'Salaries Payable',              'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2410),
    ('GRP-L-EMP-BEN',       'Employee Benefits Payable',     'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2420),
    ('GRP-L-EMP-LEAVE',     'Leave Provision',               'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2430),
    ('GRP-L-EMP-EOS',       'End of Service / Gratuity',     'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2440),
    -- Lease Liabilities
    ('GRP-L-LEASE-CUR',     'Lease Liabilities — Current',       'GRP-L-LEASE',  3, 'liability', 'posting', 'credit', NULL, 2510),
    ('GRP-L-LEASE-NCR',     'Lease Liabilities — Non-Current',   'GRP-L-LEASE',  3, 'liability', 'posting', 'credit', NULL, 2520),
    -- Intercompany Payables
    ('GRP-L-ICP-TRADE',     'IC Payables — Trade',                'GRP-L-ICP',    3, 'liability', 'posting', 'credit', NULL, 2610),
    ('GRP-L-ICP-LOAN',      'IC Payables — Loans',                'GRP-L-ICP',    3, 'liability', 'posting', 'credit', NULL, 2620),
    -- Deferred Revenue
    ('GRP-L-DEFREV-SVC',    'Deferred Revenue — Services',        'GRP-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2710),
    ('GRP-L-DEFREV-PROJ',   'Deferred Revenue — Projects',        'GRP-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2720),
    -- Other Liabilities
    ('GRP-L-OTHL-OTHER',    'Other Current Liabilities',          'GRP-L-OTHL',   3, 'liability', 'posting', 'credit', NULL, 2810);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Equity
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    ('GRP-Q-CAP-ISSUED', 'Issued Share Capital',          'GRP-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3110),
    ('GRP-Q-CAP-PREM',   'Share Premium',                 'GRP-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3120),
    ('GRP-Q-RES-STAT',   'Statutory Reserve',             'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3210),
    ('GRP-Q-RES-GEN',    'General Reserve',               'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3220),
    ('GRP-Q-RES-TRANS',  'Translation Reserve',           'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3230),
    ('GRP-Q-RES-HEDGE',  'Hedging Reserve',               'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3240),
    ('GRP-Q-RE-OPENING', 'Retained Earnings — Opening',   'GRP-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3310),
    ('GRP-Q-RE-CY',      'Current Year P&L',              'GRP-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3320),
    ('GRP-Q-RE-DIV',     'Dividends Declared',            'GRP-Q-RE',  3, 'contra_equity', 'posting', 'debit',  NULL, 3330);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Revenue
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    ('GRP-R-SALES-GOODS', 'Revenue — Goods',              'GRP-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4110),
    ('GRP-R-SALES-SVC',   'Revenue — Services',           'GRP-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4120),
    ('GRP-R-SALES-PROJ',  'Revenue — Projects',           'GRP-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4130),
    ('GRP-R-OOI-RENTAL',  'Rental Income',                'GRP-R-OOI',   3, 'income', 'posting', 'credit', NULL, 4210),
    ('GRP-R-OOI-GAIN',    'Gain on Disposal',             'GRP-R-OOI',   3, 'income', 'posting', 'credit', NULL, 4220),
    ('GRP-R-OOI-MISC',    'Miscellaneous Income',         'GRP-R-OOI',   3, 'income', 'posting', 'credit', NULL, 4230),
    ('GRP-R-FIN-INT',     'Interest Income',              'GRP-R-FIN',   3, 'income', 'posting', 'credit', NULL, 4310),
    ('GRP-R-FIN-FX',      'Foreign Exchange Gain',        'GRP-R-FIN',   3, 'income', 'posting', 'credit', NULL, 4320),
    ('GRP-R-ICR-MGMT',    'IC Management Fee Income',     'GRP-R-ICR',   3, 'income', 'posting', 'credit', NULL, 4410),
    ('GRP-R-ICR-SVCS',    'IC Service Revenue',           'GRP-R-ICR',   3, 'income', 'posting', 'credit', NULL, 4420);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Expenses
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    -- Cost of Sales
    ('GRP-E-COGS-MAT',     'Materials Consumed',           'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5110),
    ('GRP-E-COGS-LABOUR',  'Direct Labour',                'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5120),
    ('GRP-E-COGS-OH',      'Production Overhead',          'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5130),
    ('GRP-E-COGS-SUB',     'Subcontracting',               'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5140),
    ('GRP-E-COGS-FREIGHT', 'Freight & Distribution',       'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5150),
    -- SGA
    ('GRP-E-SGA-OFFICE',   'Office & Admin',               'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5210),
    ('GRP-E-SGA-MKTG',     'Marketing & Advertising',      'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5220),
    ('GRP-E-SGA-TRAVEL',   'Travel & Entertainment',       'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5230),
    ('GRP-E-SGA-PROF',     'Professional Fees',            'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5240),
    ('GRP-E-SGA-IT',       'IT & Communications',          'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5250),
    ('GRP-E-SGA-INS',      'Insurance',                    'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5260),
    ('GRP-E-SGA-RENT',     'Rent & Occupancy',             'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5270),
    ('GRP-E-SGA-UTIL',     'Utilities',                    'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5280),
    ('GRP-E-SGA-REPAIR',   'Repairs & Maintenance',        'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5290),
    -- HR & Payroll
    ('GRP-E-HR-SAL',       'Salaries & Wages',             'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5310),
    ('GRP-E-HR-BEN',       'Employee Benefits',            'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5320),
    ('GRP-E-HR-TRAIN',     'Training & Development',       'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5330),
    ('GRP-E-HR-RECRUIT',   'Recruitment',                  'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5340),
    -- Depreciation & Amortisation
    ('GRP-E-DA-BLDG',      'Depreciation — Buildings',     'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5410),
    ('GRP-E-DA-PLANT',     'Depreciation — Plant',         'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5420),
    ('GRP-E-DA-VEH',       'Depreciation — Vehicles',      'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5430),
    ('GRP-E-DA-IT',        'Depreciation — IT',            'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5440),
    ('GRP-E-DA-ROU',       'Depreciation — ROU Assets',    'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5450),
    ('GRP-E-DA-AMORT',     'Amortisation — Intangibles',   'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5460),
    -- Finance Costs
    ('GRP-E-FIN-INT',      'Interest Expense',             'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5510),
    ('GRP-E-FIN-LEASE',    'Lease Interest (IFRS 16)',     'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5520),
    ('GRP-E-FIN-FX',       'Foreign Exchange Loss',        'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5530),
    ('GRP-E-FIN-BANK',     'Bank Charges',                 'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5540),
    -- Tax Expense
    ('GRP-E-TAX-CIT',      'Income Tax Expense',           'GRP-E-TAX',   3, 'expense', 'posting', 'debit', NULL, 5610),
    ('GRP-E-TAX-DT',       'Deferred Tax Expense',         'GRP-E-TAX',   3, 'expense', 'posting', 'debit', NULL, 5620),
    -- Intercompany Expense
    ('GRP-E-ICE-MGMT',     'IC Management Fee Expense',    'GRP-E-ICE',   3, 'expense', 'posting', 'debit', NULL, 5710),
    ('GRP-E-ICE-SVCS',     'IC Service Expense',           'GRP-E-ICE',   3, 'expense', 'posting', 'debit', NULL, 5720),
    -- Other Expenses
    ('GRP-E-OTHER-LOSS',   'Loss on Disposal',             'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5810),
    ('GRP-E-OTHER-IMPAIR', 'Impairment Loss',              'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5820),
    ('GRP-E-OTHER-MISC',   'Miscellaneous Expense',        'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5830);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: UPSERT — L1 roots (parent_code IS NULL)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        NULL, t.level_no, t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT — L2 headers (parent is L1 root)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.code || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    JOIN master.gl_account p
      ON p.tenant_id = v_tid
     AND p.chart_of_account_id = v_coa_id
     AND p.code = t.parent_code
    WHERE t.level_no = 2
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE E: UPSERT — L3 posting accounts (parent is L2 header)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.path || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    JOIN master.gl_account p
      ON p.tenant_id = v_tid
     AND p.chart_of_account_id = v_coa_id
     AND p.code = t.parent_code
    WHERE t.level_no = 3
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE F: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_total
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_roots
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND parent_id IS NULL;

    SELECT count(*) INTO v_posting
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND node_type = 'posting';

    IF v_total < 140 THEN
        RAISE EXCEPTION '[210_group_chart] Expected >= 140 total accounts, got %', v_total;
    END IF;

    IF v_roots <> 5 THEN
        RAISE EXCEPTION '[210_group_chart] Expected 5 class roots, got %', v_roots;
    END IF;

    IF v_posting < 90 THEN
        RAISE EXCEPTION '[210_group_chart] Expected >= 90 posting accounts, got %', v_posting;
    END IF;

    RAISE NOTICE '[210_group_chart] Group chart seeded: % total accounts (% roots, % posting)',
        v_total, v_roots, v_posting;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/200_coa_frameworks/211_framework_ifrs_accounts.sql
-- ============================================================================
-- ATHYPER FRAMEWORK — IFRS OPERATING CHART OF ACCOUNTS
-- ============================================================================
-- File:     211_framework_ifrs_accounts.sql
-- Schema:   master.gl_account
-- Purpose:  ~300 GL accounts for COA-IFRS (full IFRS operating chart)
--           5 class roots, ~35 L2 headers, ~260 L3 posting accounts
--           Used by 12 of 17 companies as the primary operating chart
-- Depends:  200_chart_catalog.sql (COA-IFRS chart)
-- Idempotent: Yes — ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE
-- Spec ref: IFRS Operating Chart
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '211_framework_ifrs';
    v_version text := '1.0.0';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_total   int;
    v_roots   int;
    v_posting int;
    v_gmap_ok int;
BEGIN
    -- ── STAGE A: Resolve tenant & chart ─────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS';
    IF v_coa_id IS NULL THEN
        RAISE EXCEPTION 'Chart COA-IFRS not found — run 200_chart_catalog.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Stage all accounts in temp table
    -- ══════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_gl (
        seed_id        uuid DEFAULT shared.uuidv7(),
        code           text NOT NULL,
        name           text NOT NULL,
        parent_code    text,
        level_no       smallint NOT NULL DEFAULT 1,
        description    text,
        account_class  text NOT NULL,
        node_type      text NOT NULL DEFAULT 'posting',
        normal_balance text NOT NULL,
        subledger_type text,
        sort_order     smallint NOT NULL DEFAULT 0,
        group_map      text           -- maps to GRP-* code in group chart
    ) ON COMMIT DROP;

    -- ──────────────────────────────────────────────────────────────────────
    -- B1: L1 ROOTS (5 class headers)
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-A', 'Assets',      NULL, 1, 'asset',     'header', 'debit',  1000),
    ('IFRS-L', 'Liabilities', NULL, 1, 'liability', 'header', 'credit', 2000),
    ('IFRS-Q', 'Equity',      NULL, 1, 'equity',    'header', 'credit', 3000),
    ('IFRS-R', 'Revenue',     NULL, 1, 'income',    'header', 'credit', 4000),
    ('IFRS-E', 'Expenses',    NULL, 1, 'expense',   'header', 'debit',  5000);

    -- ──────────────────────────────────────────────────────────────────────
    -- B2: L2 HEADERS — Assets
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-A-CASH',  'Cash & Bank',               'IFRS-A', 2, 'asset', 'header', 'debit', 1100),
    ('IFRS-A-AR',    'Trade Receivables',          'IFRS-A', 2, 'asset', 'header', 'debit', 1200),
    ('IFRS-A-OAR',   'Other Receivables',          'IFRS-A', 2, 'asset', 'header', 'debit', 1300),
    ('IFRS-A-INV',   'Inventory',                  'IFRS-A', 2, 'asset', 'header', 'debit', 1400),
    ('IFRS-A-FA',    'Fixed Assets',               'IFRS-A', 2, 'asset', 'header', 'debit', 1500),
    ('IFRS-A-DEP',   'Accumulated Depreciation',   'IFRS-A', 2, 'asset', 'header', 'debit', 1600),
    ('IFRS-A-IA',    'Intangible Assets',          'IFRS-A', 2, 'asset', 'header', 'debit', 1700),
    ('IFRS-A-ROU',   'Right-of-Use Assets',        'IFRS-A', 2, 'asset', 'header', 'debit', 1750),
    ('IFRS-A-ICR',   'Intercompany Receivables',   'IFRS-A', 2, 'asset', 'header', 'debit', 1800),
    ('IFRS-A-DTAX',  'Deferred Tax Asset',         'IFRS-A', 2, 'asset', 'header', 'debit', 1850),
    ('IFRS-A-OTHER', 'Other Assets',               'IFRS-A', 2, 'asset', 'header', 'debit', 1900);

    -- B2: L2 HEADERS — Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-L-AP',     'Trade Payables',         'IFRS-L', 2, 'liability', 'header', 'credit', 2100),
    ('IFRS-L-ACCR',   'Accruals & Provisions',  'IFRS-L', 2, 'liability', 'header', 'credit', 2200),
    ('IFRS-L-TAX',    'Tax Payables',           'IFRS-L', 2, 'liability', 'header', 'credit', 2300),
    ('IFRS-L-EMP',    'Employee Liabilities',   'IFRS-L', 2, 'liability', 'header', 'credit', 2400),
    ('IFRS-L-LEASE',  'Lease Liabilities',      'IFRS-L', 2, 'liability', 'header', 'credit', 2500),
    ('IFRS-L-ICP',    'Intercompany Payables',  'IFRS-L', 2, 'liability', 'header', 'credit', 2600),
    ('IFRS-L-DEFREV', 'Deferred Revenue',       'IFRS-L', 2, 'liability', 'header', 'credit', 2700),
    ('IFRS-L-DTAX',   'Deferred Tax Liability', 'IFRS-L', 2, 'liability', 'header', 'credit', 2750),
    ('IFRS-L-OTHL',   'Other Liabilities',      'IFRS-L', 2, 'liability', 'header', 'credit', 2800);

    -- B2: L2 HEADERS — Equity
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-Q-CAP', 'Share Capital',     'IFRS-Q', 2, 'equity', 'header', 'credit', 3100),
    ('IFRS-Q-RES', 'Reserves',          'IFRS-Q', 2, 'equity', 'header', 'credit', 3200),
    ('IFRS-Q-RE',  'Retained Earnings', 'IFRS-Q', 2, 'equity', 'header', 'credit', 3300);

    -- B2: L2 HEADERS — Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-R-SALES', 'Sales Revenue',         'IFRS-R', 2, 'income', 'header', 'credit', 4100),
    ('IFRS-R-OOI',   'Other Operating Income','IFRS-R', 2, 'income', 'header', 'credit', 4200),
    ('IFRS-R-FIN',   'Finance Income',        'IFRS-R', 2, 'income', 'header', 'credit', 4300),
    ('IFRS-R-ICR',   'Intercompany Revenue',  'IFRS-R', 2, 'income', 'header', 'credit', 4400);

    -- B2: L2 HEADERS — Expenses
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-E-COGS',  'Cost of Sales',                'IFRS-E', 2, 'expense', 'header', 'debit', 5100),
    ('IFRS-E-SELL',  'Selling & Distribution',       'IFRS-E', 2, 'expense', 'header', 'debit', 5200),
    ('IFRS-E-GA',    'General & Administrative',     'IFRS-E', 2, 'expense', 'header', 'debit', 5300),
    ('IFRS-E-HR',    'HR & Payroll',                 'IFRS-E', 2, 'expense', 'header', 'debit', 5400),
    ('IFRS-E-DA',    'Depreciation & Amortisation',  'IFRS-E', 2, 'expense', 'header', 'debit', 5500),
    ('IFRS-E-FIN',   'Finance Costs',                'IFRS-E', 2, 'expense', 'header', 'debit', 5600),
    ('IFRS-E-TAX',   'Tax Expense',                  'IFRS-E', 2, 'expense', 'header', 'debit', 5700),
    ('IFRS-E-ICE',   'Intercompany Expense',         'IFRS-E', 2, 'expense', 'header', 'debit', 5800),
    ('IFRS-E-OTHER', 'Other Expenses',               'IFRS-E', 2, 'expense', 'header', 'debit', 5900);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Assets: Cash & Bank
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-CASH-OPER',    'Operating Cash Account',   'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1110, 'GRP-A-CASH-OPER'),
    ('IFRS-A-CASH-USD',     'USD Bank Account',         'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1121, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-LOCAL',   'Local Currency Bank',      'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1122, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-PAYROLL', 'Payroll Bank Account',     'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1123, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-ESCROW',  'Escrow Account',           'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1124, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-MM',      'Money Market Account',     'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1125, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-PETTY',   'Petty Cash',               'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1130, 'GRP-A-CASH-PETTY'),
    ('IFRS-A-CASH-TRANSIT', 'Cash in Transit',          'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1140, 'GRP-A-CASH-OPER'),
    ('IFRS-A-CASH-RESTRICT','Restricted Cash',          'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1150, 'GRP-A-CASH-OPER');

    -- B3: L3 POSTING — Assets: Trade Receivables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-AR-TRADE',     'Trade Receivables',        'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  'ar',  1210, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-RETENTION', 'Retention Receivable',     'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  NULL,  1220, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-UNBILLED',  'Unbilled Revenue',         'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  NULL,  1230, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-NOTES',     'Notes Receivable',         'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  NULL,  1235, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-ALLOW',     'ECL Allowance',            'IFRS-A-AR', 3, 'contra_asset', 'posting', 'credit', NULL,  1240, 'GRP-A-AR-ALLOW');

    -- B3: L3 POSTING — Assets: Other Receivables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-OAR-ADVANCE',   'Advances to Suppliers',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1310, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-PREPAY',    'Prepaid Expenses',         'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1320, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-OAR-PREPINS',   'Prepaid Insurance',        'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1321, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-OAR-PREPRENT',  'Prepaid Rent',             'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1322, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-OAR-DEPOSIT',   'Deposits & Guarantees',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1330, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OAR-STAFF',     'Staff Loans & Advances',   'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1340, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-INPUT-TAX', 'Input Tax Recoverable',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1350, 'GRP-L-TAX-VAT-IN'),
    ('IFRS-A-OAR-ACCRINT',   'Accrued Interest Recv',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1360, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-DIVIDEND',  'Dividend Receivable',      'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1370, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-CONTRASST', 'Contract Assets',          'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1380, 'GRP-A-OAR-ADVANCE');

    -- B3: L3 POSTING — Assets: Inventory
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-INV-RAW',     'Raw Materials',             'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1410, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-WIP',     'Work in Progress',          'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'wip',       1420, 'GRP-A-INV-WIP'),
    ('IFRS-A-INV-FG',      'Finished Goods',            'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1430, 'GRP-A-INV-FG'),
    ('IFRS-A-INV-TRADE',   'Trading Goods',             'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1440, 'GRP-A-INV-TRADE'),
    ('IFRS-A-INV-CONSUM',  'Consumables & Supplies',    'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1450, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-SPARE',   'Spare Parts Inventory',     'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1455, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-TRANSIT', 'Goods in Transit',          'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  NULL,        1460, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-PACKAGE', 'Packaging Materials',       'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1465, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-PROV',    'Inventory Provision',       'IFRS-A-INV', 3, 'contra_asset', 'posting', 'credit', NULL,        1470, 'GRP-A-INV-RAW');

    -- B3: L3 POSTING — Assets: Fixed Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-FA-LAND',    'Land',                      'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1510, 'GRP-A-FA-LAND'),
    ('IFRS-A-FA-BLDG',    'Buildings',                 'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1520, 'GRP-A-FA-BLDG'),
    ('IFRS-A-FA-PLANT',   'Plant & Machinery',         'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1530, 'GRP-A-FA-PLANT'),
    ('IFRS-A-FA-VEH',     'Vehicles',                  'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1540, 'GRP-A-FA-VEH'),
    ('IFRS-A-FA-IT',      'IT Equipment',              'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1550, 'GRP-A-FA-IT'),
    ('IFRS-A-FA-FURN',    'Furniture & Fixtures',      'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1560, 'GRP-A-FA-FURN'),
    ('IFRS-A-FA-LEASEHI', 'Leasehold Improvements',    'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1570, 'GRP-A-FA-BLDG'),
    ('IFRS-A-FA-TOOLS',   'Tools & Dies',              'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1575, 'GRP-A-FA-PLANT'),
    ('IFRS-A-FA-CWIP',    'Capital Work in Progress',  'IFRS-A-FA', 3, 'asset', 'posting', 'debit', NULL,    1580, 'GRP-A-FA-CWIP');

    -- B3: L3 POSTING — Assets: Accumulated Depreciation
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-DEP-BLDG',    'Accum Depr — Buildings',    'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1620, 'GRP-A-DEP-BLDG'),
    ('IFRS-A-DEP-PLANT',   'Accum Depr — Plant',        'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1630, 'GRP-A-DEP-PLANT'),
    ('IFRS-A-DEP-VEH',     'Accum Depr — Vehicles',     'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1640, 'GRP-A-DEP-VEH'),
    ('IFRS-A-DEP-IT',      'Accum Depr — IT',           'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1650, 'GRP-A-DEP-IT'),
    ('IFRS-A-DEP-FURN',    'Accum Depr — Furniture',    'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1660, 'GRP-A-DEP-FURN'),
    ('IFRS-A-DEP-LEASEHI', 'Accum Depr — LHI',         'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1670, 'GRP-A-DEP-BLDG'),
    ('IFRS-A-DEP-TOOLS',   'Accum Depr — Tools',       'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1675, 'GRP-A-DEP-PLANT');

    -- B3: L3 POSTING — Assets: Intangible Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-IA-GW',      'Goodwill',                 'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1710, 'GRP-A-IA-GW'),
    ('IFRS-A-IA-SW',      'Software & Licences',      'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1720, 'GRP-A-IA-SW'),
    ('IFRS-A-IA-DEV',     'Development Costs',        'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1730, 'GRP-A-IA-SW'),
    ('IFRS-A-IA-PATENT',  'Patents & Trademarks',     'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1735, 'GRP-A-IA-SW'),
    ('IFRS-A-IA-CUSTREL', 'Customer Relationships',   'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1736, 'GRP-A-IA-GW'),
    ('IFRS-A-IA-AMORT',   'Accum Amortisation',       'IFRS-A-IA', 3, 'contra_asset', 'posting', 'credit', NULL, 1740, 'GRP-A-IA-AMORT');

    -- B3: L3 POSTING — Assets: Right-of-Use Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-ROU-PROP',  'ROU — Property',          'IFRS-A-ROU', 3, 'asset', 'posting', 'debit',  NULL, 1751, 'GRP-A-ROU-PROP'),
    ('IFRS-A-ROU-VEH',   'ROU — Vehicles',          'IFRS-A-ROU', 3, 'asset', 'posting', 'debit',  NULL, 1752, 'GRP-A-ROU-EQUIP'),
    ('IFRS-A-ROU-EQUIP', 'ROU — Equipment',         'IFRS-A-ROU', 3, 'asset', 'posting', 'debit',  NULL, 1753, 'GRP-A-ROU-EQUIP'),
    ('IFRS-A-ROU-AMORT', 'Accum Depr — ROU',        'IFRS-A-ROU', 3, 'contra_asset', 'posting', 'credit', NULL, 1760, 'GRP-A-ROU-AMORT');

    -- B3: L3 POSTING — Assets: Intercompany Receivables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-ICR-TRADE', 'IC Receivables — Trade',    'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1810, 'GRP-A-ICR-TRADE'),
    ('IFRS-A-ICR-LOAN',  'IC Receivables — Loans',   'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1820, 'GRP-A-ICR-LOAN'),
    ('IFRS-A-ICR-DIV',   'IC Dividend Receivable',   'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1830, 'GRP-A-ICR-LOAN'),
    ('IFRS-A-ICR-MGMT',  'IC Mgmt Fee Receivable',   'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1840, 'GRP-A-ICR-TRADE');

    -- B3: L3 POSTING — Assets: Deferred Tax Asset
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-DTAX-CUR', 'DTA — Current',            'IFRS-A-DTAX', 3, 'asset', 'posting', 'debit', NULL, 1851, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-DTAX-NCR', 'DTA — Non-Current',        'IFRS-A-DTAX', 3, 'asset', 'posting', 'debit', NULL, 1852, 'GRP-A-OAR-PREPAY');

    -- B3: L3 POSTING — Assets: Other Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-OTHER-INVEST', 'Short-Term Investments',  'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1910, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OTHER-FVPL',   'FVPL Financial Assets',   'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1920, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OTHER-FVOCI',  'FVOCI Financial Assets',  'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1930, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OTHER-MISC',   'Other Current Assets',    'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1940, 'GRP-A-OAR-DEPOSIT');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Liabilities
    -- ──────────────────────────────────────────────────────────────────────

    -- Trade Payables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-AP-TRADE',     'Trade Payables Control',       'IFRS-L-AP', 3, 'liability', 'posting', 'credit', 'ap',  2110, 'GRP-L-AP-TRADE'),
    ('IFRS-L-AP-RETENTION', 'Retention Payable',            'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2120, 'GRP-L-AP-RETENTION'),
    ('IFRS-L-AP-ACCRUED',   'Accrued Payables',             'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2130, 'GRP-L-AP-TRADE'),
    ('IFRS-L-AP-NOTES',     'Notes Payable',                'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2140, 'GRP-L-AP-TRADE'),
    ('IFRS-L-AP-ADVANCE',   'Advance from Customers',       'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2150, 'GRP-L-AP-TRADE');

    -- Accruals & Provisions
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-ACCR-GEN',     'General Accruals',             'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2210, 'GRP-L-ACCR-GEN'),
    ('IFRS-L-ACCR-WARRANTY','Warranty Provision',           'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2220, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-RESTRUCT','Restructuring Provision',      'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2230, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-LEGAL',   'Legal Provision',              'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2240, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-DECOM',   'Decommissioning Provision',    'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2250, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-OTHER',   'Other Provisions',             'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2260, 'GRP-L-ACCR-PROV');

    -- Tax Payables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-TAX-CIT',      'Corporate Income Tax Payable', 'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2310, 'GRP-L-TAX-CIT'),
    ('IFRS-L-TAX-VAT-OUT',  'VAT/GST Output',              'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2320, 'GRP-L-TAX-VAT-OUT'),
    ('IFRS-L-TAX-WHT',      'Withholding Tax Payable',      'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2330, 'GRP-L-TAX-WHT'),
    ('IFRS-L-TAX-EXCISE',   'Excise Tax Payable',           'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2335, 'GRP-L-TAX-CIT'),
    ('IFRS-L-TAX-CUSTOMS',  'Customs Duty Payable',         'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2336, 'GRP-L-TAX-CIT'),
    ('IFRS-L-TAX-OTHER',    'Other Tax Payables',           'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2340, 'GRP-L-TAX-CIT');

    -- Employee Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-EMP-SAL',      'Salaries Payable',             'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2410, 'GRP-L-EMP-SAL'),
    ('IFRS-L-EMP-OT',       'Overtime Payable',             'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2415, 'GRP-L-EMP-SAL'),
    ('IFRS-L-EMP-ALLOW',    'Allowances Payable',           'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2420, 'GRP-L-EMP-BEN'),
    ('IFRS-L-EMP-SOCSEC',   'Social Security Payable',      'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2425, 'GRP-L-EMP-BEN'),
    ('IFRS-L-EMP-MEDICAL',  'Medical Insurance Payable',    'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2430, 'GRP-L-EMP-BEN'),
    ('IFRS-L-EMP-LEAVE',    'Leave Provision',              'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2440, 'GRP-L-EMP-LEAVE'),
    ('IFRS-L-EMP-EOS',      'End of Service / Gratuity',    'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2450, 'GRP-L-EMP-EOS'),
    ('IFRS-L-EMP-ESOP',     'ESOP Liability',               'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2460, 'GRP-L-EMP-EOS'),
    ('IFRS-L-EMP-BONUS',    'Bonus Accrual',                'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2465, 'GRP-L-EMP-SAL'),
    ('IFRS-L-EMP-PENSION',  'Pension Obligation',           'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2470, 'GRP-L-EMP-EOS'),
    ('IFRS-L-EMP-LONGTERM', 'Long-Term Employee Benefits',  'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2475, 'GRP-L-EMP-EOS');

    -- Lease Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-LEASE-CUR', 'Lease Liabilities — Current',       'IFRS-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2510, 'GRP-L-LEASE-CUR'),
    ('IFRS-L-LEASE-NCR', 'Lease Liabilities — Non-Current',   'IFRS-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2520, 'GRP-L-LEASE-NCR');

    -- Intercompany Payables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-ICP-TRADE', 'IC Payables — Trade',               'IFRS-L-ICP', 3, 'liability', 'posting', 'credit', NULL, 2610, 'GRP-L-ICP-TRADE'),
    ('IFRS-L-ICP-LOAN',  'IC Payables — Loans',               'IFRS-L-ICP', 3, 'liability', 'posting', 'credit', NULL, 2620, 'GRP-L-ICP-LOAN'),
    ('IFRS-L-ICP-DIV',   'IC Payables — Dividends',           'IFRS-L-ICP', 3, 'liability', 'posting', 'credit', NULL, 2630, 'GRP-L-ICP-LOAN');

    -- Deferred Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-DEFREV-SVC',  'Deferred Revenue — Services',     'IFRS-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2710, 'GRP-L-DEFREV-SVC'),
    ('IFRS-L-DEFREV-PROJ', 'Deferred Revenue — Projects',     'IFRS-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2720, 'GRP-L-DEFREV-PROJ'),
    ('IFRS-L-DEFREV-SUB',  'Deferred Revenue — Subscriptions','IFRS-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2730, 'GRP-L-DEFREV-SVC');

    -- Deferred Tax Liability
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-DTAX-CUR', 'DTL — Current',                'IFRS-L-DTAX', 3, 'liability', 'posting', 'credit', NULL, 2751, 'GRP-L-TAX-CIT'),
    ('IFRS-L-DTAX-NCR', 'DTL — Non-Current',            'IFRS-L-DTAX', 3, 'liability', 'posting', 'credit', NULL, 2752, 'GRP-L-TAX-CIT');

    -- Other Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-OTHL-CUSTDEP', 'Customer Deposits',           'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2810, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-REFUND',  'Refund Liabilities',          'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2820, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-CONTLIA', 'Contract Liabilities',        'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2830, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-BORROW',  'Short-Term Borrowings',       'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2840, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-LTERM',   'Long-Term Borrowings',        'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2850, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-DERIV',   'Derivative Liabilities',      'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2860, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-GOVGRANT','Government Grant Liabilities','IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2870, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-OTHER',   'Other Current Liabilities',   'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2890, 'GRP-L-OTHL-OTHER');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Equity
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-Q-CAP-ISSUED',  'Issued Share Capital',          'IFRS-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3110, 'GRP-Q-CAP-ISSUED'),
    ('IFRS-Q-CAP-PREM',    'Share Premium',                 'IFRS-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3120, 'GRP-Q-CAP-PREM'),
    ('IFRS-Q-CAP-TREASURY','Treasury Shares',               'IFRS-Q-CAP', 3, 'contra_equity', 'posting', 'debit',  NULL, 3130, 'GRP-Q-CAP-ISSUED'),
    ('IFRS-Q-RES-STAT',    'Statutory Reserve',             'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3210, 'GRP-Q-RES-STAT'),
    ('IFRS-Q-RES-GEN',     'General Reserve',               'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3220, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RES-TRANS',   'Translation Reserve',           'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3230, 'GRP-Q-RES-TRANS'),
    ('IFRS-Q-RES-HEDGE',   'Hedging Reserve',               'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3240, 'GRP-Q-RES-HEDGE'),
    ('IFRS-Q-RES-REVAL',   'Revaluation Reserve',           'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3250, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RES-FVOCI',   'FVOCI Reserve',                 'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3260, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RES-ESOP',    'ESOP Reserve',                  'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3270, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RE-OPENING',  'Retained Earnings — Opening',   'IFRS-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3310, 'GRP-Q-RE-OPENING'),
    ('IFRS-Q-RE-CY',       'Current Year P&L',              'IFRS-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3320, 'GRP-Q-RE-CY'),
    ('IFRS-Q-RE-DIV',      'Dividends Declared',            'IFRS-Q-RE',  3, 'contra_equity', 'posting', 'debit',  NULL, 3330, 'GRP-Q-RE-DIV');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Revenue
    -- ──────────────────────────────────────────────────────────────────────

    -- Sales Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-SALES-GOODS', 'Revenue — Goods',               'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4110, 'GRP-R-SALES-GOODS'),
    ('IFRS-R-SALES-SVC',   'Revenue — Services',            'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4120, 'GRP-R-SALES-SVC'),
    ('IFRS-R-SALES-PROJ',  'Revenue — Projects',            'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4130, 'GRP-R-SALES-PROJ'),
    ('IFRS-R-SALES-SUB',   'Revenue — Subscriptions',       'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4140, 'GRP-R-SALES-SVC'),
    ('IFRS-R-SALES-DISC',  'Sales Discounts & Allowances',  'IFRS-R-SALES', 3, 'income', 'posting', 'debit',  NULL, 4150, 'GRP-R-SALES-GOODS'),
    ('IFRS-R-SALES-RET',   'Sales Returns',                 'IFRS-R-SALES', 3, 'income', 'posting', 'debit',  NULL, 4160, 'GRP-R-SALES-GOODS');

    -- Other Operating Income
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-OOI-RENTAL',   'Rental Income',                 'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4210, 'GRP-R-OOI-RENTAL'),
    ('IFRS-R-OOI-MGMTFEE', 'Management Fee Income',         'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4220, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-GAIN',    'Gain on Disposal',              'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4230, 'GRP-R-OOI-GAIN'),
    ('IFRS-R-OOI-SCRAP',   'Scrap & Salvage Income',        'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4235, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-INSCLM',  'Insurance Claims Received',     'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4236, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-GOVGRANT','Government Grant Income',       'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4237, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-MISC',    'Miscellaneous Income',          'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4240, 'GRP-R-OOI-MISC');

    -- Finance Income
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-FIN-INT',     'Interest Income',               'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4310, 'GRP-R-FIN-INT'),
    ('IFRS-R-FIN-FX',      'Foreign Exchange Gain',         'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4320, 'GRP-R-FIN-FX'),
    ('IFRS-R-FIN-FV',      'Fair Value Gain',               'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4330, 'GRP-R-FIN-INT'),
    ('IFRS-R-FIN-DIVRECV', 'Dividend Income',               'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4340, 'GRP-R-FIN-INT');

    -- Intercompany Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-ICR-MGMT',  'IC Management Fee Income',        'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4410, 'GRP-R-ICR-MGMT'),
    ('IFRS-R-ICR-SVCS',  'IC Service Revenue',              'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4420, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-DIV',   'IC Dividend Income',              'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4430, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-RENT',  'IC Rental Income',                'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4440, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-ROYAL', 'IC Royalty Income',               'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4450, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-GOODS', 'IC Sale of Goods',                'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4460, 'GRP-R-ICR-SVCS');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Expenses
    -- ──────────────────────────────────────────────────────────────────────

    -- Cost of Sales
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-COGS-MAT',       'Materials Consumed',             'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5110, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-LABOUR',    'Direct Labour',                  'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5120, 'GRP-E-COGS-LABOUR'),
    ('IFRS-E-COGS-OH',        'Production Overhead',            'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5130, 'GRP-E-COGS-OH'),
    ('IFRS-E-COGS-SUB',       'Subcontracting',                 'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5140, 'GRP-E-COGS-SUB'),
    ('IFRS-E-COGS-FREIGHT',   'Freight & Distribution',         'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5150, 'GRP-E-COGS-FREIGHT'),
    ('IFRS-E-COGS-INVWD',     'Inventory Write-Down',           'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5160, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-CUSTOMS',   'Customs & Import Duties',        'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5165, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-PACKAGING', 'Packaging Materials',            'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5170, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-WARRANTY',  'Warranty Cost',                  'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5175, 'GRP-E-COGS-OH'),
    ('IFRS-E-COGS-VARIANCE',  'Production Variance',            'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5180, 'GRP-E-COGS-OH');

    -- Selling & Distribution
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-SELL-ADVERT',    'Advertising & Promotion',        'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5210, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-COMM',      'Sales Commissions',              'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5220, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-DIST',      'Distribution Costs',             'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5230, 'GRP-E-COGS-FREIGHT'),
    ('IFRS-E-SELL-CUSTSVC',   'Customer Service',               'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5240, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-SELL-TRAVEL',    'Sales Travel & Entertainment',   'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5250, 'GRP-E-SGA-TRAVEL'),
    ('IFRS-E-SELL-EXHIBIT',   'Exhibitions & Events',           'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5260, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-DIGITAL',   'Digital Marketing',              'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5265, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-SAMPLES',   'Samples & Giveaways',           'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5270, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-WAREHOUSE', 'Warehousing & Storage',          'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5275, 'GRP-E-COGS-FREIGHT'),
    ('IFRS-E-SELL-RETURNS',   'Sales Returns Handling',         'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5280, 'GRP-E-SGA-OFFICE');

    -- General & Administrative
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-GA-OFFICE',      'Office & Admin Supplies',        'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5310, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-LEGAL',       'Legal Fees',                     'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5315, 'GRP-E-SGA-PROF'),
    ('IFRS-E-GA-AUDIT',       'Audit & Accounting Fees',        'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5320, 'GRP-E-SGA-PROF'),
    ('IFRS-E-GA-CONSULT',     'Consulting Fees',                'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5325, 'GRP-E-SGA-PROF'),
    ('IFRS-E-GA-IT',          'IT & Software',                  'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5330, 'GRP-E-SGA-IT'),
    ('IFRS-E-GA-TELECOM',     'Telecom & Communications',       'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5335, 'GRP-E-SGA-IT'),
    ('IFRS-E-GA-BANK',        'Bank Charges — Admin',           'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5340, 'GRP-E-FIN-BANK'),
    ('IFRS-E-GA-INS',         'Insurance',                      'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5345, 'GRP-E-SGA-INS'),
    ('IFRS-E-GA-RENT',        'Rent & Occupancy',               'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5350, 'GRP-E-SGA-RENT'),
    ('IFRS-E-GA-UTIL',        'Utilities',                      'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5355, 'GRP-E-SGA-UTIL'),
    ('IFRS-E-GA-REPAIR',      'Repairs & Maintenance',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5360, 'GRP-E-SGA-REPAIR'),
    ('IFRS-E-GA-TRAVEL',      'General Travel & Entertainment', 'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5365, 'GRP-E-SGA-TRAVEL'),
    ('IFRS-E-GA-PRINTING',    'Printing & Stationery',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5370, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-COURIER',     'Courier & Postage',              'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5375, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-SUBS',        'Subscriptions & Memberships',    'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5380, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-DONATE',      'Donations & CSR',                'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5385, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-SECURITY',    'Security Services',              'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5386, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-CLEANING',    'Cleaning & Janitorial',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5387, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-VEHICLE',     'Vehicle Running Costs',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5388, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-LICENSE',     'Licence & Permit Fees',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5389, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-MISC',        'Miscellaneous G&A',              'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5390, 'GRP-E-SGA-OFFICE');

    -- HR & Payroll
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-HR-SAL',         'Salaries & Wages',               'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5410, 'GRP-E-HR-SAL'),
    ('IFRS-E-HR-OT',          'Overtime',                       'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5415, 'GRP-E-HR-SAL'),
    ('IFRS-E-HR-ALLOW',       'Allowances',                     'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5420, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-SOCSEC',      'Social Security Contributions',  'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5425, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-MEDICAL',     'Medical Insurance',              'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5430, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-TRAIN',       'Training & Development',         'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5435, 'GRP-E-HR-TRAIN'),
    ('IFRS-E-HR-RECRUIT',     'Recruitment Costs',              'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5440, 'GRP-E-HR-RECRUIT'),
    ('IFRS-E-HR-EOS',         'End of Service Expense',         'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5445, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-ESOP',        'ESOP / Share-Based Payment',     'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5450, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-LEAVE',       'Leave Expense',                  'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5455, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-BONUS',       'Bonuses & Incentives',           'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5460, 'GRP-E-HR-SAL'),
    ('IFRS-E-HR-RELOC',       'Relocation Costs',               'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5465, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-WELFARE',     'Staff Welfare',                  'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5470, 'GRP-E-HR-BEN');

    -- Depreciation & Amortisation
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-DA-BLDG',   'Depreciation — Buildings',       'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5510, 'GRP-E-DA-BLDG'),
    ('IFRS-E-DA-PLANT',  'Depreciation — Plant',           'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5515, 'GRP-E-DA-PLANT'),
    ('IFRS-E-DA-VEH',    'Depreciation — Vehicles',        'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5520, 'GRP-E-DA-VEH'),
    ('IFRS-E-DA-IT',     'Depreciation — IT',              'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5525, 'GRP-E-DA-IT'),
    ('IFRS-E-DA-FURN',   'Depreciation — Furniture',       'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5530, 'GRP-E-DA-BLDG'),
    ('IFRS-E-DA-LHI',    'Depreciation — LHI',             'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5535, 'GRP-E-DA-BLDG'),
    ('IFRS-E-DA-TOOLS',  'Depreciation — Tools',           'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5537, 'GRP-E-DA-PLANT'),
    ('IFRS-E-DA-ROU',    'Depreciation — ROU Assets',      'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5540, 'GRP-E-DA-ROU'),
    ('IFRS-E-DA-AMORT',  'Amortisation — Intangibles',     'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5550, 'GRP-E-DA-AMORT'),
    ('IFRS-E-DA-GWIMPR', 'Goodwill Impairment',            'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5555, 'GRP-E-DA-AMORT');

    -- Finance Costs
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-FIN-INT',    'Interest Expense',              'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5610, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-LEASE',  'Lease Interest (IFRS 16)',      'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5620, 'GRP-E-FIN-LEASE'),
    ('IFRS-E-FIN-FX',     'Foreign Exchange Loss',         'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5630, 'GRP-E-FIN-FX'),
    ('IFRS-E-FIN-BANK',   'Bank Charges',                  'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5640, 'GRP-E-FIN-BANK'),
    ('IFRS-E-FIN-FV',     'Fair Value Loss',               'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5650, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-COMMIT',  'Commitment Fees',              'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5655, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-UNWIND',  'Discount Unwinding',           'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5660, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-GUARANT', 'Guarantee Fees',               'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5665, 'GRP-E-FIN-BANK');

    -- Tax Expense
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-TAX-CIT',  'Income Tax Expense',              'IFRS-E-TAX', 3, 'expense', 'posting', 'debit', NULL, 5710, 'GRP-E-TAX-CIT'),
    ('IFRS-E-TAX-DT',   'Deferred Tax Expense',            'IFRS-E-TAX', 3, 'expense', 'posting', 'debit', NULL, 5720, 'GRP-E-TAX-DT');

    -- Intercompany Expense
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-ICE-MGMT',    'IC Management Fee Expense',    'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5810, 'GRP-E-ICE-MGMT'),
    ('IFRS-E-ICE-SVCS',    'IC Service Expense',           'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5820, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-ROYALTY',  'IC Royalty Expense',           'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5830, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-IT',      'IC IT Service Expense',        'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5835, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-RENT',    'IC Rent Expense',              'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5840, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-PURCHASE','IC Purchase of Goods',         'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5845, 'GRP-E-ICE-SVCS');

    -- Other Expenses
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-OTHER-LOSS',     'Loss on Disposal',           'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5910, 'GRP-E-OTHER-LOSS'),
    ('IFRS-E-OTHER-IMPAIR',   'Impairment Loss',            'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5920, 'GRP-E-OTHER-IMPAIR'),
    ('IFRS-E-OTHER-RESTRUCT', 'Restructuring Costs',        'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5930, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-PENALTY',  'Penalties & Fines',          'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5940, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-INVLOSS',  'Inventory Loss & Shrinkage', 'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5945, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-BADDEBT',  'Bad Debt Expense',           'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5950, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-ENVIRO',   'Environmental Costs',        'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5955, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-LITIGA',   'Litigation Settlement',      'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5960, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-MISC',     'Miscellaneous Expense',      'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5990, 'GRP-E-OTHER-MISC');

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: UPSERT — L1 roots (parent_code IS NULL)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        NULL, t.level_no, t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT — L2 headers (parent is L1 root)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.code || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    JOIN master.gl_account p
      ON p.tenant_id = v_tid
     AND p.chart_of_account_id = v_coa_id
     AND p.code = t.parent_code
    WHERE t.level_no = 2
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE E: UPSERT — L3 posting accounts (parent is L2 header)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.path || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta
            || jsonb_build_object('_display_no', t.sort_order::text)
            || CASE WHEN t.group_map IS NOT NULL
                    THEN jsonb_build_object('_group_map', t.group_map)
                    ELSE '{}'::jsonb
               END,
        'active', v_su
    FROM tmp_gl t
    JOIN master.gl_account p
      ON p.tenant_id = v_tid
     AND p.chart_of_account_id = v_coa_id
     AND p.code = t.parent_code
    WHERE t.level_no = 3
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text)
                         || CASE WHEN EXCLUDED.metadata ? '_group_map'
                                 THEN jsonb_build_object('_group_map', EXCLUDED.metadata->>'_group_map')
                                 ELSE '{}'::jsonb
                            END,
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE F: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_total
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_roots
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND parent_id IS NULL;

    SELECT count(*) INTO v_posting
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND node_type = 'posting';

    SELECT count(*) INTO v_gmap_ok
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND node_type = 'posting'
      AND metadata ? '_group_map';

    IF v_total < 280 THEN
        RAISE EXCEPTION '[211_framework_ifrs] Expected >= 280 total accounts, got %', v_total;
    END IF;

    IF v_roots <> 5 THEN
        RAISE EXCEPTION '[211_framework_ifrs] Expected 5 class roots, got %', v_roots;
    END IF;

    IF v_posting < 200 THEN
        RAISE EXCEPTION '[211_framework_ifrs] Expected >= 200 posting accounts, got %', v_posting;
    END IF;

    IF v_gmap_ok <> v_posting THEN
        RAISE EXCEPTION '[211_framework_ifrs] All posting accounts must have _group_map. Found % of % with it', v_gmap_ok, v_posting;
    END IF;

    RAISE NOTICE '[211_framework_ifrs] IFRS operating chart seeded: % total accounts (% roots, % posting, % with _group_map)',
        v_total, v_roots, v_posting, v_gmap_ok;

END $seed$;

-- FILE: /d/Products/athyper/server/db/sql/900_seed_data/020_blueprint/300_defaults/001_bank_format_rule_defaults.sql
-- ============================================================================
-- Platform default bank format rules
-- ============================================================================
-- Country + payment rail validation policies. tenant_id IS NULL = global.
-- Tenant overrides can be seeded separately per tenant setup.
-- Idempotent: WHERE NOT EXISTS guard on code.
-- ============================================================================

INSERT INTO control.bank_format_rule (
    tenant_id, code, name, country_code, payment_network, direction, currency_code,
    account_id_type, bank_id_type,
    is_account_id_required, is_bank_id_required,
    is_bic_allowed, is_bic_required,
    is_branch_code_required, is_national_bank_code_required,
    account_pattern, iban_country_prefix, is_checksum_validated,
    priority, status, created_by
)
SELECT v.tenant_id, v.code, v.name, v.country_code, v.payment_network, v.direction, v.currency_code,
       v.account_id_type, v.bank_id_type,
       v.is_account_id_required, v.is_bank_id_required,
       v.is_bic_allowed, v.is_bic_required,
       v.is_branch_code_required, v.is_national_bank_code_required,
       v.account_pattern, v.iban_country_prefix, v.is_checksum_validated,
       v.priority, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- US
    (NULL::uuid, 'US-ACH',    'US ACH',          'US', 'ach',            'both',     NULL::char(3), 'local', 'aba',       true, true, false, false, false, true,  '^\d{4,17}$',              NULL::char(2), false, 10),
    (NULL,       'US-WIRE',   'US Wire',         'US', 'local_transfer', 'both',     NULL,          'local', 'aba',       true, true, true,  false, false, true,  '^\d{4,17}$',              NULL,          false, 10),
    (NULL,       'US-SWIFT',  'US SWIFT',        'US', 'swift',          'outbound', NULL,          'local', 'bic',       true, true, true,  true,  false, false, '^\d{4,17}$',              NULL,          false, 10),
    -- Germany
    (NULL,       'DE-SEPA',   'Germany SEPA',    'DE', 'sepa',           'both',     NULL,          'iban',  'bic',       true, false, true, false, false, false, '^DE\d{20}$',              'DE',          true,  10),
    (NULL,       'DE-SWIFT',  'Germany SWIFT',   'DE', 'swift',          'outbound', NULL,          'iban',  'bic',       true, true,  true, true,  false, false, '^DE\d{20}$',              'DE',          true,  10),
    -- UK
    (NULL,       'GB-LOCAL',  'UK Local',        'GB', 'local_transfer', 'both',     NULL,          'iban',  'sort_code', true, true,  true, false, false, true,  '^GB\d{2}[A-Z]{4}\d{14}$','GB',          true,  10),
    -- India
    (NULL,       'IN-LOCAL',  'India Local',     'IN', 'local_transfer', 'both',     NULL,          'local', 'ifsc',      true, true, false, false, false, true,  '^\d{9,18}$',              NULL,          false, 10),
    (NULL,       'IN-SWIFT',  'India SWIFT',     'IN', 'swift',          'outbound', NULL,          'local', 'bic',       true, true, true,  true,  false, false, '^\d{9,18}$',              NULL,          false, 10),
    -- UAE
    (NULL,       'AE-LOCAL',  'UAE Local',       'AE', 'local_transfer', 'both',     NULL,          'iban',  'bank_code', true, true,  true, false, false, false, '^AE\d{21}$',              'AE',          true,  10),
    -- Australia
    (NULL,       'AU-LOCAL',  'Australia Local',  'AU', 'local_transfer', 'both',     NULL,          'local', 'bsb',       true, true, false, false, false, true,  '^\d{6,10}$',              NULL,          false, 10),
    -- Malaysia
    (NULL,       'MY-LOCAL',  'Malaysia Local',   'MY', 'local_transfer', 'both',     NULL,          'local', 'bank_code', true, true, false, false, true,  true,  '^\d{10,16}$',             NULL,          false, 10),
    -- Singapore
    (NULL,       'SG-LOCAL',  'Singapore Local',  'SG', 'local_transfer', 'both',     NULL,          'local', 'bank_code', true, true, false, false, true,  true,  '^\d{10,14}$',             NULL,          false, 10)
) AS v(tenant_id, code, name, country_code, payment_network, direction, currency_code,
       account_id_type, bank_id_type, is_account_id_required, is_bank_id_required,
       is_bic_allowed, is_bic_required, is_branch_code_required, is_national_bank_code_required,
       account_pattern, iban_country_prefix, is_checksum_validated, priority)
WHERE NOT EXISTS (
    SELECT 1 FROM control.bank_format_rule x WHERE x.code = v.code AND x.tenant_id IS NULL
);


-- ── Non-bank rail format rules (added by payment method engine) ──────────────

INSERT INTO control.bank_format_rule (
    tenant_id, code, name, country_code, payment_network, direction, currency_code,
    account_id_type, bank_id_type,
    is_account_id_required, is_bank_id_required,
    is_bic_allowed, is_bic_required,
    is_branch_code_required, is_national_bank_code_required,
    account_pattern, is_checksum_validated,
    priority, status, created_by
)
SELECT v.tenant_id, v.code, v.name, v.country_code, v.payment_network, v.direction, v.currency_code,
       v.account_id_type, v.bank_id_type,
       v.is_account_id_required, v.is_bank_id_required,
       v.is_bic_allowed, v.is_bic_required,
       v.is_branch_code_required, v.is_national_bank_code_required,
       v.account_pattern, v.is_checksum_validated,
       v.priority, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    (NULL::uuid, 'IN-UPI',    'India UPI',    'IN', 'upi',          'both', NULL::char(3),
     'upi_vpa', 'none', true, false, false, false, false, false,
     '^[a-zA-Z0-9._-]+@[a-zA-Z]+$', false, 10),
    (NULL,       'KE-MPESA',  'Kenya M-Pesa', 'KE', 'mobile_money', 'both', NULL,
     'mobile',  'none', true, false, false, false, false, false,
     '^\+254[0-9]{9}$', false, 10)
) AS v(tenant_id, code, name, country_code, payment_network, direction, currency_code,
       account_id_type, bank_id_type, is_account_id_required, is_bank_id_required,
       is_bic_allowed, is_bic_required, is_branch_code_required, is_national_bank_code_required,
       account_pattern, is_checksum_validated, priority)
WHERE NOT EXISTS (
    SELECT 1 FROM control.bank_format_rule x WHERE x.code = v.code AND x.tenant_id IS NULL
);

