-- ============================================================================
-- BLUEPRINT REGISTRY — SEED DATA
-- ============================================================================
-- File:     000_blueprint_registry.sql
-- Schema:   control
-- Purpose:  Register all available blueprints with metadata.
--           DDL for control.blueprint_registry and
--           control.tenant_blueprint_application has moved to:
--             server/db/sql/control/01_tables.sql  (§PROV-1, §PROV-2)
--           The v_blueprint_catalogue view has moved to:
--             server/db/sql/control/07_views.sql   (§V3)
-- Depends:  control.blueprint_registry table (created by 01_tables.sql)
-- Idempotent: Yes — ON CONFLICT (code) DO UPDATE
-- Run:      Once at system install, then again when new packs are added.
-- ============================================================================

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.blueprint_registry
    (code, name, category, industry_vertical, framework,
     base_version, status, dependencies, seed_files, description,
     created_by)
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
    'Universal spend categories, business intents, item categories, commodity bridge and routing rules. Required by all industry packs.',
    v_sys
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
    'Default asset class hierarchy and bank interface format rules applied unless tenant overrides.',
    v_sys
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
    'IFRS-aligned chart of accounts catalog with group-level and framework account definitions.',
    v_sys
),

-- ── INDUSTRY PACKS ──────────────────────────────────────────────────────────
(
    'pack_utilities',
    'Utilities — Electricity & Water Supply',
    'industry_pack',
    ARRAY['utilities'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/100_pack_utilities.sql'],
    'Spend categories, business intents, item categories, commodity bridge and routing rules for electricity and water supply operations.',
    v_sys
),
(
    'pack_construction',
    'Construction',
    'industry_pack',
    ARRAY['construction'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/101_pack_construction.sql'],
    'Construction industry procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_real_estate',
    'Real Estate',
    'industry_pack',
    ARRAY['real_estate'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/102_pack_real_estate.sql'],
    'Real estate industry procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_transport',
    'Transportation & Storage',
    'industry_pack',
    ARRAY['transport'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/103_pack_transport.sql'],
    'Transport and logistics procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_trading',
    'Wholesale & Retail Trade',
    'industry_pack',
    ARRAY['trading'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/104_pack_trading.sql'],
    'Trading (wholesale/retail) procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_hospitality',
    'Accommodation & Food Service',
    'industry_pack',
    ARRAY['hospitality'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/105_pack_hospitality.sql'],
    'Hospitality industry procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_infocomm',
    'Information & Communication',
    'industry_pack',
    ARRAY['infocomm'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/106_pack_infocomm.sql'],
    'Infocomm technology sector procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_financial',
    'Financial & Insurance Services',
    'industry_pack',
    ARRAY['financial'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/107_pack_financial.sql'],
    'Financial and insurance services procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_mfg_textile',
    'Manufacturing — Textiles & Leather',
    'industry_pack',
    ARRAY['mfg_textile'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/108_pack_mfg_textile.sql'],
    'Textile and leather manufacturing procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_mfg_food_bev',
    'Manufacturing — Food & Beverage',
    'industry_pack',
    ARRAY['mfg_food_bev'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/109_pack_mfg_food_bev.sql'],
    'Food and beverage manufacturing procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_mfg_pharma',
    'Manufacturing — Pharmaceutical',
    'industry_pack',
    ARRAY['mfg_pharma'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/110_pack_mfg_pharma.sql'],
    'Pharmaceutical manufacturing procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_mfg_electronics',
    'Manufacturing — Electronics & Optics',
    'industry_pack',
    ARRAY['mfg_electronics'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/111_pack_mfg_electronics.sql'],
    'Electronics and optics manufacturing procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_mining_petroleum',
    'Mining & Crude Petroleum',
    'industry_pack',
    ARRAY['mining_petroleum'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/112_pack_mining_petroleum.sql'],
    'Mining and petroleum extraction procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_agriculture',
    'Agriculture & Animal Production',
    'industry_pack',
    ARRAY['agriculture'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/113_pack_agriculture.sql'],
    'Agriculture and animal production procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_education',
    'Education Services',
    'industry_pack',
    ARRAY['education'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/114_pack_education.sql'],
    'Education sector procurement taxonomy, intents and routing rules.',
    v_sys
),
(
    'pack_healthcare',
    'Hospital & Healthcare Services',
    'industry_pack',
    ARRAY['healthcare'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['100_industry_packs/115_pack_healthcare.sql'],
    'Healthcare and hospital services procurement taxonomy, intents and routing rules.',
    v_sys
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
    description         = EXCLUDED.description;
    -- created_by intentionally excluded from UPDATE: preserves original creator.

END $$;
