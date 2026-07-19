-- Blueprint tier model:
--   TIER 1 Foundation (base / foundation): applied to every new tenant, in dependency order
--     base â†’ foundation_tax â†’ foundation_pay â†’ foundation_assets â†’ foundation_bank â†’ org_foundation
--   TIER 2a COA framework (coa_framework): pick exactly one â€” coa_ifrs / coa_gaap
--   TIER 2b Industry packs (industry_pack): 16 packs, additive
--   TIER 3  Module packs (module_pack): registered in 001/002_*_registry.sql siblings
-- seed_files paths are relative to the seed-data root.

DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN

-- 'default_rules' was renamed to 'foundation_bank'; drop the legacy code first.
DELETE FROM control.blueprint_registry WHERE code = 'default_rules';

INSERT INTO control.blueprint_registry
    (code, name, category, industry_vertical, framework,
     base_version, status, dependencies, seed_files, description,
     created_by)
VALUES

-- TIER 1 â€” Foundation

-- [1/6] base â€” universal spend taxonomy, prerequisite for every other pack
(
    'base',
    'Universal Base',
    'base',
    NULL, NULL, '1.0.0', 'active',
    NULL,
    ARRAY[
        'blueprints/universal/010_spend_taxonomy/019_pre_seed_foundation.sql',
        'blueprints/universal/010_spend_taxonomy/020_spend_categories.sql',
        'blueprints/universal/010_spend_taxonomy/021_business_intents.sql',
        'blueprints/universal/010_spend_taxonomy/022_spend_intent_link.sql',
        'blueprints/universal/010_spend_taxonomy/027_commodity_bridge.sql',
        'blueprints/universal/010_spend_taxonomy/024_routing_rules.sql',
        'blueprints/universal/010_spend_taxonomy/026_base_intent_rules.sql'
    ],
    'Universal spend categories, business intents, commodity-to-intent bridge and routing rules. Applied first; required by all other packs.',
    v_sys
),

-- [2/6] foundation_tax
(
    'foundation_tax',
    'Tax Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        'blueprints/universal/020_tax/320_tax_jurisdictions.sql',
        'blueprints/universal/020_tax/321_tax_types.sql',
        'blueprints/universal/020_tax/322_tax_rate_schedules.sql',
        'blueprints/universal/020_tax/323_tax_groups.sql',
        'blueprints/universal/020_tax/330_fx_rates.sql'
    ],
    'Tax jurisdictions (14 countries), types (indirect/WHT/customs/surcharge), effective-dated rate schedules, group compositions (input + output pairs) and FX spot/period-end rates. Replicated to every tenant on provisioning.',
    v_sys
),

-- [3/6] foundation_pay
(
    'foundation_pay',
    'Payment Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        'blueprints/universal/030_payments/340_holiday_calendars.sql',
        'blueprints/universal/030_payments/341_payment_terms.sql'
    ],
    'Public holiday calendars for 14 jurisdictions (2025â€“2026) and 25 payment term definitions covering standard, construction, government, lease, trade and digital scenarios. Replicated to every tenant on provisioning.',
    v_sys
),

-- [4/6] foundation_assets (tenant-scoped, shared across all company codes)
(
    'foundation_assets',
    'Asset Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        'blueprints/universal/040_assets/340_asset_classes.sql',
        'blueprints/universal/040_assets/341_asset_class_book_policy_templates.sql'
    ],
    '16 IAS 16/IFRS asset class templates (4 L1 headers + 12 L2 leaves: LAND, BUILDINGS, PLANT, VEHICLES, IT-EQUIP, FURNITURE, LHI, TOOLS, SOFTWARE, ROU-PROP, ROU-EQUIP, CWIP-GEN), plus IFRS_DEFAULT policy templates for statutory and management books. Tenant-scoped taxonomy is shared by all company codes; concrete per-company policies are provisioned from templates after ledger books exist.',
    v_sys
),

-- [5/6] foundation_bank
(
    'foundation_bank',
    'Bank & Payment Rail Rules',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        'blueprints/universal/050_bank/001_bank_format_rule_defaults.sql'
    ],
    'Payment rail format and validation rules for 12+ countries (SWIFT, ACH/wire, SEPA, BACS, BSB, IFSC, sort-code) and digital rails (UPI, M-Pesa). Applied globally; tenant or entity may override per payment method.',
    v_sys
),

-- TIER 2a â€” COA framework (pick one)

-- [6/6] org_foundation runs after tenant company_code rows exist (provisioner treats
-- blueprints/universal/060_org_structure as a post-company group).
(
    'org_foundation',
    'Universal Org Foundation',
    'foundation',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        'blueprints/universal/060_org_structure/300_org_units.sql',
        'blueprints/universal/060_org_structure/301_cost_centers.sql',
        'blueprints/universal/060_org_structure/302_profit_centers.sql',
        'blueprints/universal/060_org_structure/303_company_code_tax_fx_links.sql'
    ],
    'Simple general-purpose org units, cost centers and profit centers per active company code, plus company-code tax jurisdiction and FX coverage checks. Run after tenant legal entities and company codes exist; industry org leaves are additive.',
    v_sys
),

(
    'coa_ifrs',
    'Chart of Accounts â€” IFRS',
    'coa_framework',
    NULL, 'IFRS', '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        'blueprints/universal/200_coa_frameworks/200_chart_catalog.sql',
        'blueprints/universal/200_coa_frameworks/210_group_chart_accounts.sql',
        'blueprints/universal/200_coa_frameworks/211_framework_ifrs_accounts.sql'
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
        'blueprints/universal/200_coa_frameworks/200_chart_catalog.sql',
        'blueprints/universal/200_coa_frameworks/210_group_chart_accounts.sql',
        'blueprints/universal/200_coa_frameworks/212_framework_gaap_accounts.sql'
    ],
    'US GAAP-aligned operating chart of accounts with posting-level codes and _group_map mappings to the internal COA-GROUP reporting taxonomy. Required before any finance document or ledger data.',
    v_sys
),

-- TIER 2b â€” Industry packs (additive)

(
    'pack_utilities',
    'Utilities â€” Electricity & Water Supply',
    'industry_pack',
    ARRAY['utilities'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/100_pack_utilities.sql'],
    'Procurement taxonomy, business intents, commodity bridge and routing rules for electricity and water supply operations.',
    v_sys
),
(
    'pack_construction',
    'Construction',
    'industry_pack',
    ARRAY['construction'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/101_pack_construction.sql'],
    'Procurement taxonomy, intents and routing rules for construction and civil engineering operations.',
    v_sys
),
(
    'pack_real_estate',
    'Real Estate',
    'industry_pack',
    ARRAY['real_estate'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/102_pack_real_estate.sql'],
    'Procurement taxonomy, intents and routing rules for real estate development and property management.',
    v_sys
),
(
    'pack_transport',
    'Transportation & Storage',
    'industry_pack',
    ARRAY['transport'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/103_pack_transport.sql'],
    'Procurement taxonomy, intents and routing rules for transport, logistics and warehousing operations.',
    v_sys
),
(
    'pack_trading',
    'Wholesale & Retail Trade',
    'industry_pack',
    ARRAY['trading'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/104_pack_trading.sql'],
    'Procurement taxonomy, intents and routing rules for wholesale and retail trading operations.',
    v_sys
),
(
    'pack_hospitality',
    'Accommodation & Food Service',
    'industry_pack',
    ARRAY['hospitality'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/105_pack_hospitality.sql'],
    'Procurement taxonomy, intents and routing rules for hospitality, hotel and food service operations.',
    v_sys
),
(
    'pack_infocomm',
    'Information & Communication',
    'industry_pack',
    ARRAY['infocomm'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/106_pack_infocomm.sql'],
    'Procurement taxonomy, intents and routing rules for ICT, software and communications operations.',
    v_sys
),
(
    'pack_financial',
    'Financial & Insurance Services',
    'industry_pack',
    ARRAY['financial'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/107_pack_financial.sql'],
    'Procurement taxonomy, intents and routing rules for banking, financial services and insurance operations.',
    v_sys
),
(
    'pack_mfg_textile',
    'Manufacturing â€” Textiles & Leather',
    'industry_pack',
    ARRAY['mfg_textile'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/108_pack_mfg_textile.sql'],
    'Procurement taxonomy, intents and routing rules for textile, apparel and leather manufacturing.',
    v_sys
),
(
    'pack_mfg_food_bev',
    'Manufacturing â€” Food & Beverage',
    'industry_pack',
    ARRAY['mfg_food_bev'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/109_pack_mfg_food_bev.sql'],
    'Procurement taxonomy, intents and routing rules for food and beverage manufacturing.',
    v_sys
),
(
    'pack_mfg_pharma',
    'Manufacturing â€” Pharmaceutical',
    'industry_pack',
    ARRAY['mfg_pharma'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/110_pack_mfg_pharma.sql'],
    'Procurement taxonomy, intents and routing rules for pharmaceutical and biotech manufacturing.',
    v_sys
),
(
    'pack_mfg_electronics',
    'Manufacturing â€” Electronics & Optics',
    'industry_pack',
    ARRAY['mfg_electronics'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/111_pack_mfg_electronics.sql'],
    'Procurement taxonomy, intents and routing rules for electronics, semiconductors and optics manufacturing.',
    v_sys
),
(
    'pack_mining_petroleum',
    'Mining & Crude Petroleum',
    'industry_pack',
    ARRAY['mining_petroleum'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/112_pack_mining_petroleum.sql'],
    'Procurement taxonomy, intents and routing rules for mining, oil and gas extraction operations.',
    v_sys
),
(
    'pack_agriculture',
    'Agriculture & Animal Production',
    'industry_pack',
    ARRAY['agriculture'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/113_pack_agriculture.sql'],
    'Procurement taxonomy, intents and routing rules for crop farming, livestock and agri-processing.',
    v_sys
),
(
    'pack_education',
    'Education Services',
    'industry_pack',
    ARRAY['education'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/114_pack_education.sql'],
    'Procurement taxonomy, intents and routing rules for schools, universities and training providers.',
    v_sys
),
(
    'pack_healthcare',
    'Hospital & Healthcare Services',
    'industry_pack',
    ARRAY['healthcare'], NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY['blueprints/industry/100_industry_packs/115_pack_healthcare.sql'],
    'Procurement taxonomy, intents and routing rules for hospitals, clinics and healthcare service providers.',
    v_sys
)

-- TIER 3 module packs are registered below in their own DO blocks.

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
    -- created_by excluded so DO UPDATE preserves the original creator id.

END $$;


-- TIER 3 module pack â€” Finance Close Governance.
DO $finance_close_governance_registry$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN

INSERT INTO control.blueprint_registry (
    code, name, category, industry_vertical, framework,
    base_version, status, dependencies, seed_files, description,
    metadata, created_by
)
VALUES (
    'pack_finance_close_governance',
    'Finance Close Governance',
    'module_pack',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base','org_foundation'],
    ARRAY[
        'blueprints/modules/governance/010_finance_close_governance_templates.sql',
        'blueprints/modules/governance/099_apply.sql'
    ],
    'Finance governance templates for posting readiness, opening balances, monthly soft close, and year-end hard close. Seeds FIN_SETUP_READINESS, OPENING_BALANCE, MONTHLY_CLOSE, and YEAR_END_CLOSE cycle types.',
    jsonb_build_object(
        'cycle_types', ARRAY['FIN_SETUP_READINESS','OPENING_BALANCE','MONTHLY_CLOSE','YEAR_END_CLOSE'],
        'period_policy', 'Open current month, soft-close prior months, hard-close at year-end',
        'finance_model', jsonb_build_object(
            'current_month', 'open',
            'prior_months_current_year', 'soft_close',
            'year_end_final', 'hard_close'
        )
    ),
    v_sys
)
ON CONFLICT (code) DO UPDATE SET
    name              = EXCLUDED.name,
    category          = EXCLUDED.category,
    industry_vertical = EXCLUDED.industry_vertical,
    framework         = EXCLUDED.framework,
    base_version      = EXCLUDED.base_version,
    status            = EXCLUDED.status,
    dependencies      = EXCLUDED.dependencies,
    seed_files        = EXCLUDED.seed_files,
    description       = EXCLUDED.description,
    metadata          = EXCLUDED.metadata;
    -- created_by excluded so DO UPDATE preserves the original creator id.

END $finance_close_governance_registry$;


-- TIER 3 module pack â€” AP Non-PO cycle.
DO $$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN

INSERT INTO control.blueprint_registry (
    code, name, category, industry_vertical, framework,
    base_version, status, dependencies, seed_files, description,
    metadata, created_by
)
VALUES (
    'pack_ap_non_po',
    'AP Non-PO Cycle',
    'module_pack',
    NULL, NULL, '1.0.0', 'active',
    ARRAY['base'],
    ARRAY[
        'blueprints/modules/ap_non_po/005_accounting_profile_ddl.sql',
        'blueprints/modules/ap_non_po/010_posting_roles.sql',
        'blueprints/modules/ap_non_po/020_accounting_profiles.sql',
        'blueprints/modules/ap_non_po/030_acct_profile_configs.sql',
        'blueprints/modules/ap_non_po/040_acct_profile_events.sql',
        'blueprints/modules/ap_non_po/050_acct_profile_entry_templates.sql',
        'blueprints/modules/ap_non_po/060_category_intent_rules.sql',
        'blueprints/modules/ap_non_po/070_intent_profile_rules.sql',
        'blueprints/modules/ap_non_po/080_payment_settlement_rules.sql',
        'blueprints/modules/ap_non_po/090_entity_operations_delta.sql',
        'blueprints/modules/ap_non_po/099_apply.sql'
    ],
    'Complete Non-PO Accounts Payable cycle: invoice capture (plain, VAT, WHT, retention, advance-recovery) through approval, GL posting, settlement, and bank clearing. Delivers 4 accounting profiles, 6 engine rules, 5 new posting roles, extended entity_operation set for purchase_invoice and payment_entry, and the master.accounting_profile identity table.',
    jsonb_build_object(
        'scenarios_covered', ARRAY['A1','A3','A4','A7','A8','supplier_advance'],
        'modules',           ARRAY['ACC','PAY','TREASURY','BUDGET','PAYG'],
        'journal_events',    ARRAY['INVOICE_RECEIVED','ORDER_APPROVAL','SETTLEMENT',
                                    'ADVANCE_PAID','ADVANCE_RECOVERED','RETENTION_RELEASED'],
        'flow_codes',        ARRAY['NON_PO','PURCHASE_CONTRACT']
    ),
    v_sys
)
ON CONFLICT (code) DO UPDATE SET
    name              = EXCLUDED.name,
    industry_vertical = EXCLUDED.industry_vertical,
    framework         = EXCLUDED.framework,
    base_version      = EXCLUDED.base_version,
    status            = EXCLUDED.status,
    dependencies      = EXCLUDED.dependencies,
    seed_files        = EXCLUDED.seed_files,
    description       = EXCLUDED.description,
    metadata          = EXCLUDED.metadata;
    -- created_by excluded so DO UPDATE preserves the original creator id.

END $$;
