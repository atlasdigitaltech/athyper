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
