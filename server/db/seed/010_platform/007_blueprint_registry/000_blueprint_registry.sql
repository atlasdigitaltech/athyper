-- ============================================================================
-- BLUEPRINT REGISTRY — SEED DATA
-- ============================================================================
-- File:     020_universal/000_registry/000_blueprint_registry.sql
-- Schema:   control
-- Purpose:  Register all available blueprints with metadata.
--           DDL for control.blueprint_registry and
--           control.tenant_blueprint_application lives in:
--             server/db/sql/control/01_tables.sql  (§PROV-1, §PROV-2)
--           The v_blueprint_catalogue view lives in:
--             server/db/sql/control/07_views.sql   (§V3)
-- Depends:  control.blueprint_registry table (created by 01_tables.sql)
-- Idempotent: Yes — ON CONFLICT (code) DO UPDATE
-- Run:      Once at system install, then again when new packs are added.
-- seed_files paths: relative to 900_seed_data/ root
-- ============================================================================
--
-- ── Blueprint Tier Model ─────────────────────────────────────────────────────
--
--   TIER 1 — Foundation  (category: 'base' | 'foundation')
--             Applied automatically to EVERY new tenant, in dependency order.
--             No selection required.
--             Execution sequence:
--               1. base              — universal spend taxonomy (prerequisite)
--               2. foundation_tax    — tax jurisdictions, types, rates, FX
--               3. foundation_pay    — holiday calendars, payment terms
--               4. foundation_assets — asset class hierarchy + book policies
--               5. foundation_bank   — payment rail format rules
--               6. org_foundation    — post-company org structure
--
--   TIER 2a — COA Framework  (category: 'coa_framework')
--             Tenant selects exactly one accounting framework at onboarding.
--             Options: coa_ifrs, coa_gaap
--
--   TIER 2b — Industry Packs  (category: 'industry_pack')
--             Tenant selects one or more verticals at onboarding.
--             Can be added incrementally after provisioning.
--             16 packs: utilities → healthcare
--             Taxonomy files live in: 030_industry/100_industry_packs/
--             Org extension templates live in: 030_industry/200_org_structure/
--
--   TIER 3  — Module Packs  (category: 'module_pack')
--             Optional; activated per subscription tier or explicit request.
--             Registered in separate 001_*_registry.sql files (this directory).
--             Files live in: 030_industry/600_modules/
--             Current: pack_ap_non_po (→ see 001_ap_non_po_registry.sql)
--
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN

-- Remove legacy 'default_rules' entry replaced by 'foundation_bank'
DELETE FROM control.blueprint_registry WHERE code = 'default_rules';

INSERT INTO control.blueprint_registry
    (code, name, category, industry_vertical, framework,
     base_version, status, dependencies, seed_files, description,
     created_by)
VALUES

-- ════════════════════════════════════════════════════════════════════════════
-- TIER 1 — FOUNDATION  (always applied to every new tenant, in this order)
-- ════════════════════════════════════════════════════════════════════════════

-- [1/6] Universal spend taxonomy - prerequisite for every other pack
(
    'base',
    'Universal Base',
    'base',
    NULL, NULL, '1.0.0', 'active',
    NULL,
    ARRAY[
        '020_universal/010_spend_taxonomy/019_pre_seed_foundation.sql',
        '020_universal/010_spend_taxonomy/020_spend_categories.sql',
        '020_universal/010_spend_taxonomy/021_business_intents.sql',
        '020_universal/010_spend_taxonomy/022_spend_intent_link.sql',
        '020_universal/010_spend_taxonomy/027_commodity_bridge.sql',
        '020_universal/010_spend_taxonomy/024_routing_rules.sql',
        '020_universal/010_spend_taxonomy/026_base_intent_rules.sql'
    ],
    'Universal spend categories, business intents, commodity-to-intent bridge and routing rules. Applied first; required by all other packs.',
    v_sys
),

-- [2/6] Tax jurisdictions, types, rate schedules, group compositions and FX rates
(
    'foundation_tax',
    'Tax Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '020_universal/020_tax/320_tax_jurisdictions.sql',
        '020_universal/020_tax/321_tax_types.sql',
        '020_universal/020_tax/322_tax_rate_schedules.sql',
        '020_universal/020_tax/323_tax_groups.sql',
        '020_universal/020_tax/330_fx_rates.sql'
    ],
    'Tax jurisdictions (14 countries), types (indirect/WHT/customs/surcharge), effective-dated rate schedules, group compositions (input + output pairs) and FX spot/period-end rates. Replicated to every tenant on provisioning.',
    v_sys
),

-- [3/6] Public holiday calendars and payment term definitions
(
    'foundation_pay',
    'Payment Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '020_universal/030_payments/340_holiday_calendars.sql',
        '020_universal/030_payments/341_payment_terms.sql'
    ],
    'Public holiday calendars for 14 jurisdictions (2025–2026) and 25 payment term definitions covering standard, construction, government, lease, trade and digital scenarios. Replicated to every tenant on provisioning.',
    v_sys
),

-- [4/6] Asset class taxonomy (tenant-scoped, shared across all company codes)
(
    'foundation_assets',
    'Asset Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '020_universal/040_assets/340_asset_classes.sql',
        '020_universal/040_assets/341_asset_class_book_policy_templates.sql'
    ],
    '16 IAS 16/IFRS asset class templates (4 L1 headers + 12 L2 leaves: LAND, BUILDINGS, PLANT, VEHICLES, IT-EQUIP, FURNITURE, LHI, TOOLS, SOFTWARE, ROU-PROP, ROU-EQUIP, CWIP-GEN), plus IFRS_DEFAULT policy templates for statutory and management books. Tenant-scoped taxonomy is shared by all company codes; concrete per-company policies are provisioned from templates after ledger books exist.',
    v_sys
),

-- [5/6] Payment rail format and validation rules
(
    'foundation_bank',
    'Bank & Payment Rail Rules',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '020_universal/050_bank/001_bank_format_rule_defaults.sql'
    ],
    'Payment rail format and validation rules for 12+ countries (SWIFT, ACH/wire, SEPA, BACS, BSB, IFSC, sort-code) and digital rails (UPI, M-Pesa). Applied globally; tenant or entity may override per payment method.',
    v_sys
),

-- ════════════════════════════════════════════════════════════════════════════
-- TIER 2a — COA FRAMEWORK  (select exactly one per tenant at onboarding)
-- ════════════════════════════════════════════════════════════════════════════

-- [6/6] Post-company org foundation. These files run after tenant company_code
-- rows exist; the provisioner treats 020_universal/060_org_structure as a
-- post-company blueprint group.
(
    'org_foundation',
    'Universal Org Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '020_universal/060_org_structure/300_org_units.sql',
        '020_universal/060_org_structure/301_cost_centers.sql',
        '020_universal/060_org_structure/302_profit_centers.sql',
        '020_universal/060_org_structure/303_company_code_tax_fx_links.sql'
    ],
    'Simple general-purpose org units, cost centers and profit centers per active company code, plus company-code tax jurisdiction and FX coverage checks. Run after tenant legal entities and company codes exist; industry org leaves are additive.',
    v_sys
),

(
    'coa_ifrs',
    'Chart of Accounts — IFRS',
    'coa_framework',
    NULL, 'IFRS', '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '020_universal/200_coa_frameworks/200_chart_catalog.sql',
        '020_universal/200_coa_frameworks/210_group_chart_accounts.sql',
        '020_universal/200_coa_frameworks/211_framework_ifrs_accounts.sql'
    ],
    'IFRS-aligned operating chart of accounts with posting-level codes and _group_map mappings to the internal COA-GROUP reporting taxonomy. Required before any finance document or ledger data.',
    v_sys
),
(
    'coa_gaap',
    'Chart of Accounts - US GAAP',
    'coa_framework',
    NULL, 'US GAAP', '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        '020_universal/200_coa_frameworks/200_chart_catalog.sql',
        '020_universal/200_coa_frameworks/210_group_chart_accounts.sql',
        '020_universal/200_coa_frameworks/212_framework_gaap_accounts.sql'
    ],
    'US GAAP-aligned operating chart of accounts with posting-level codes and _group_map mappings to the internal COA-GROUP reporting taxonomy. Required before any finance document or ledger data.',
    v_sys
),

-- ════════════════════════════════════════════════════════════════════════════
-- TIER 2b — INDUSTRY PACKS  (select one or more per tenant; additive)
-- ════════════════════════════════════════════════════════════════════════════

(
    'pack_utilities',
    'Utilities — Electricity & Water Supply',
    'industry_pack',
    ARRAY['utilities'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/100_pack_utilities.sql'],
    'Procurement taxonomy, business intents, commodity bridge and routing rules for electricity and water supply operations.',
    v_sys
),
(
    'pack_construction',
    'Construction',
    'industry_pack',
    ARRAY['construction'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/101_pack_construction.sql'],
    'Procurement taxonomy, intents and routing rules for construction and civil engineering operations.',
    v_sys
),
(
    'pack_real_estate',
    'Real Estate',
    'industry_pack',
    ARRAY['real_estate'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/102_pack_real_estate.sql'],
    'Procurement taxonomy, intents and routing rules for real estate development and property management.',
    v_sys
),
(
    'pack_transport',
    'Transportation & Storage',
    'industry_pack',
    ARRAY['transport'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/103_pack_transport.sql'],
    'Procurement taxonomy, intents and routing rules for transport, logistics and warehousing operations.',
    v_sys
),
(
    'pack_trading',
    'Wholesale & Retail Trade',
    'industry_pack',
    ARRAY['trading'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/104_pack_trading.sql'],
    'Procurement taxonomy, intents and routing rules for wholesale and retail trading operations.',
    v_sys
),
(
    'pack_hospitality',
    'Accommodation & Food Service',
    'industry_pack',
    ARRAY['hospitality'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/105_pack_hospitality.sql'],
    'Procurement taxonomy, intents and routing rules for hospitality, hotel and food service operations.',
    v_sys
),
(
    'pack_infocomm',
    'Information & Communication',
    'industry_pack',
    ARRAY['infocomm'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/106_pack_infocomm.sql'],
    'Procurement taxonomy, intents and routing rules for ICT, software and communications operations.',
    v_sys
),
(
    'pack_financial',
    'Financial & Insurance Services',
    'industry_pack',
    ARRAY['financial'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/107_pack_financial.sql'],
    'Procurement taxonomy, intents and routing rules for banking, financial services and insurance operations.',
    v_sys
),
(
    'pack_mfg_textile',
    'Manufacturing — Textiles & Leather',
    'industry_pack',
    ARRAY['mfg_textile'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/108_pack_mfg_textile.sql'],
    'Procurement taxonomy, intents and routing rules for textile, apparel and leather manufacturing.',
    v_sys
),
(
    'pack_mfg_food_bev',
    'Manufacturing — Food & Beverage',
    'industry_pack',
    ARRAY['mfg_food_bev'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/109_pack_mfg_food_bev.sql'],
    'Procurement taxonomy, intents and routing rules for food and beverage manufacturing.',
    v_sys
),
(
    'pack_mfg_pharma',
    'Manufacturing — Pharmaceutical',
    'industry_pack',
    ARRAY['mfg_pharma'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/110_pack_mfg_pharma.sql'],
    'Procurement taxonomy, intents and routing rules for pharmaceutical and biotech manufacturing.',
    v_sys
),
(
    'pack_mfg_electronics',
    'Manufacturing — Electronics & Optics',
    'industry_pack',
    ARRAY['mfg_electronics'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/111_pack_mfg_electronics.sql'],
    'Procurement taxonomy, intents and routing rules for electronics, semiconductors and optics manufacturing.',
    v_sys
),
(
    'pack_mining_petroleum',
    'Mining & Crude Petroleum',
    'industry_pack',
    ARRAY['mining_petroleum'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/112_pack_mining_petroleum.sql'],
    'Procurement taxonomy, intents and routing rules for mining, oil and gas extraction operations.',
    v_sys
),
(
    'pack_agriculture',
    'Agriculture & Animal Production',
    'industry_pack',
    ARRAY['agriculture'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/113_pack_agriculture.sql'],
    'Procurement taxonomy, intents and routing rules for crop farming, livestock and agri-processing.',
    v_sys
),
(
    'pack_education',
    'Education Services',
    'industry_pack',
    ARRAY['education'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/114_pack_education.sql'],
    'Procurement taxonomy, intents and routing rules for schools, universities and training providers.',
    v_sys
),
(
    'pack_healthcare',
    'Hospital & Healthcare Services',
    'industry_pack',
    ARRAY['healthcare'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['030_industry/100_industry_packs/115_pack_healthcare.sql'],
    'Procurement taxonomy, intents and routing rules for hospitals, clinics and healthcare service providers.',
    v_sys
)

-- ════════════════════════════════════════════════════════════════════════════
-- TIER 3 — MODULE PACKS  (registered in separate 001_*_registry.sql files)
-- ════════════════════════════════════════════════════════════════════════════
-- pack_ap_non_po  →  see 020_universal/000_registry/001_ap_non_po_registry.sql

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
