-- ============================================================================
-- UNIVERSAL — BASE BUSINESS INTENTS
-- ============================================================================
-- File:     021_business_intents.sql
-- Schema:   master.business_intent
-- Purpose:  8 domain roots + 36 generic leaves = 44 intents with:
--           • IFRS COA GL account defaults (resolved from COA-IFRS)
--           • Asset profile codes for all 9 CAPEX intents
--           • Visibility classification (STANDARD / RESTRICTED)
-- Depends:  010_platform/099_tenant_bootstrap (tenant must exist)
--           020_universal/200_coa_frameworks/211_framework_ifrs_accounts.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §5 Business Intent Taxonomy
-- ============================================================================
-- PACK OWNS: BI-OPEX, BI-CAPEX, BI-COGS, BI-ADMIN, BI-REG, BI-TRANSFER,
--            BI-REV, BI-DEFREV and all BI-*-* leaf codes created by this file
-- ============================================================================
-- GL MAPPING STRATEGY (COA-IFRS L3 posting accounts):
--   OPEX  → IFRS-E-GA-* / IFRS-E-HR-* / IFRS-E-SELL-* / IFRS-E-OTHER-*
--   CAPEX → IFRS-A-FA-* / IFRS-A-ROU-* (asset GP side; AP side is IFRS-L-AP-TRADE)
--   COGS  → IFRS-E-COGS-*
--   ADMIN → IFRS-E-GA-LEGAL / IFRS-E-GA-AUDIT / IFRS-E-GA-OFFICE
--   REG   → IFRS-E-TAX-CIT / IFRS-E-GA-LICENSE / IFRS-E-OTHER-ENVIRO
--   XFER  → IFRS-E-ICE-MGMT / IFRS-E-ICE-SVCS  (RESTRICTED visibility)
-- GL defaults resolve gracefully to NULL if COA-IFRS has not yet been seeded.
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '021_base';
    v_version text := '1.2.0';
    v_coa_id  uuid;
    v_gl_ok   int;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Resolve COA-IFRS; NULL here is safe — GL subqueries will return NULL
    -- rather than failing. Run 211_framework_ifrs_accounts.sql first to get
    -- full GL defaults populated on first load.
    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS';

    IF v_coa_id IS NULL THEN
        RAISE WARNING '[021_base] COA-IFRS not found — GL account defaults will be NULL. '
                      'Run 200_chart_catalog.sql + 211_framework_ifrs_accounts.sql first, '
                      'then re-run this file to populate default_gl_account_id.';
    END IF;

    -- ── STAGE B: Stage intent data ───────────────────────────────────────
    CREATE TEMP TABLE tmp_bi (
        seed_id            uuid    DEFAULT shared.uuidv7(),
        code               text    NOT NULL,
        name               text    NOT NULL,
        description        text,
        domain             text    NOT NULL,
        subtype            text,
        parent_code        text,                   -- NULL for domain roots
        sort_order         smallint NOT NULL DEFAULT 0,
        is_container       boolean  NOT NULL DEFAULT false,
        gl_account_code    text,                   -- L3 IFRS posting account code
        asset_profile_code text,                   -- master.asset_class code (CAPEX only)
        intent_visibility  text     NOT NULL DEFAULT 'STANDARD'
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- DOMAIN ROOTS (8) — containers; no direct GL (posting is leaf-only)
    -- TRANSFER root is RESTRICTED — not surfaced in supplier-facing UIs
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, sort_order, is_container, intent_visibility) VALUES
    ('BI-OPEX',     'Operating Expenditure',      'Day-to-day operational spending',                                'OPEX',             10, true, 'STANDARD'),
    ('BI-CAPEX',    'Capital Expenditure',         'Long-term asset acquisition and improvement',                    'CAPEX',            20, true, 'STANDARD'),
    ('BI-COGS',     'Cost of Sales',               'Direct costs of goods sold or services delivered',               'COST_OF_SALES',    30, true, 'STANDARD'),
    ('BI-ADMIN',    'Administrative Expense',      'General and administrative overhead',                            'ADMIN',            40, true, 'STANDARD'),
    ('BI-REG',      'Regulatory & Compliance',     'Taxes, statutory fees, and compliance-driven costs',             'REGULATORY',       50, true, 'STANDARD'),
    ('BI-TRANSFER', 'Internal Transfer',           'Inter-company charges and cost re-allocations',                  'TRANSFER',         60, true, 'RESTRICTED'),
    ('BI-REV',      'Revenue',                     'Earned income and revenue recognition intents',                  'REVENUE',          70, true, 'STANDARD'),
    ('BI-DEFREV',   'Deferred Revenue',            'Customer billings and contract liabilities deferred to revenue', 'DEFERRED_REVENUE', 80, true, 'STANDARD');

    -- ══════════════════════════════════════════════════════════════════════
    -- OPEX LEAVES (14)
    -- GL: L3 expense posting accounts from IFRS-E-GA-*, IFRS-E-HR-*,
    --     IFRS-E-SELL-*, IFRS-E-OTHER-*
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order, gl_account_code) VALUES
    -- IT opex → IT & Software (covers SaaS, cloud, licensing, support)
    ('BI-OPEX-IT',     'IT Operating Expense',          'IT hardware, software, cloud, and support costs',               'OPEX', 'IT',           'BI-OPEX', 11, 'IFRS-E-GA-IT'),
    -- HR opex → Salaries & Wages (primary payroll entry point; bonuses, benefits posted to sub-codes)
    ('BI-OPEX-HR',     'HR & People Operating Expense', 'Recruitment, training, benefits, and welfare costs',            'OPEX', 'HR',           'BI-OPEX', 12, 'IFRS-E-HR-SAL'),
    -- Facilities → Rent & Occupancy
    ('BI-OPEX-FAC',    'Facilities Operating Expense',  'Rent, maintenance, cleaning, and facility management',          'OPEX', 'FACILITIES',   'BI-OPEX', 13, 'IFRS-E-GA-RENT'),
    -- Utilities → Utilities (electricity, water, gas)
    ('BI-OPEX-UTIL',   'Utilities Operating Expense',   'Electricity, water, gas consumption costs',                     'OPEX', 'UTILITIES',    'BI-OPEX', 14, 'IFRS-E-GA-UTIL'),
    -- Fuel → Vehicle Running Costs (fleet fuel; process energy uses UTIL)
    ('BI-OPEX-FUEL',   'Fuel & Energy Expense',         'Fleet fuel and non-process energy costs',                       'OPEX', 'FUEL',         'BI-OPEX', 15, 'IFRS-E-GA-VEHICLE'),
    -- Insurance → Insurance
    ('BI-OPEX-INS',    'Insurance Expense',             'Property, liability, and employee insurance premiums',          'OPEX', 'INSURANCE',    'BI-OPEX', 16, 'IFRS-E-GA-INS'),
    -- Professional services → Consulting Fees (covers legal, advisory; pure legal uses ADMIN-LEGAL)
    ('BI-OPEX-PROF',   'Professional Services Expense', 'Legal, audit, consulting, and advisory fees',                   'OPEX', 'PROFESSIONAL', 'BI-OPEX', 17, 'IFRS-E-GA-CONSULT'),
    -- Marketing → Advertising & Promotion
    ('BI-OPEX-MKTG',   'Marketing & Comms Expense',     'Marketing campaigns, PR, and customer experience costs',        'OPEX', 'MARKETING',    'BI-OPEX', 18, 'IFRS-E-SELL-ADVERT'),
    -- Fleet opex → Vehicle Running Costs (lease, fuel, maintenance combined)
    ('BI-OPEX-FLEET',  'Fleet Operating Expense',       'Vehicle lease, fuel, and fleet maintenance costs',              'OPEX', 'FLEET',        'BI-OPEX', 19, 'IFRS-E-GA-VEHICLE'),
    -- Safety/Security → Security Services (HSE monitoring, guard services)
    ('BI-OPEX-SAFETY', 'Safety & Security Expense',     'Security services, HSE, and compliance monitoring',             'OPEX', 'SAFETY',       'BI-OPEX', 20, 'IFRS-E-GA-SECURITY'),
    -- Environmental → Environmental Costs (ESG, waste, remediation)
    ('BI-OPEX-ENV',    'Environmental Expense',         'ESG, waste management, and remediation costs',                  'OPEX', 'ENVIRONMENT',  'BI-OPEX', 21, 'IFRS-E-OTHER-ENVIRO'),
    -- MRO → Repairs & Maintenance (spares, consumables, tools expensed not capitalised)
    ('BI-OPEX-MRO',    'MRO Expense',                  'Maintenance parts, tools, and repair supplies',                 'OPEX', 'MRO',          'BI-OPEX', 22, 'IFRS-E-GA-REPAIR'),
    -- Maintenance services → Repairs & Maintenance (planned/reactive service contracts)
    ('BI-OPEX-MAINT',  'Maintenance Services Expense',  'Planned and reactive maintenance service contracts',            'OPEX', 'MAINTENANCE',  'BI-OPEX', 23, 'IFRS-E-GA-REPAIR'),
    -- Outsourcing → Consulting Fees (BPO, managed services, temp staffing)
    ('BI-OPEX-OUTSRC', 'Outsourcing Expense',           'BPO, shared services, and temporary staffing costs',           'OPEX', 'OUTSOURCING',  'BI-OPEX', 24, 'IFRS-E-GA-CONSULT');

    -- ══════════════════════════════════════════════════════════════════════
    -- CAPEX LEAVES (9) — GL = asset balance-sheet account (AP side = IFRS-L-AP-TRADE)
    --                     asset_profile_code = master.asset_class.code
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order, gl_account_code, asset_profile_code) VALUES
    -- IT CAPEX → IT Equipment / IT-EQUIP class
    ('BI-CAPEX-IT',    'IT Capital Expenditure',             'Servers, network infrastructure, and major software',            'CAPEX', 'IT',             'BI-CAPEX', 21, 'IFRS-A-FA-IT',    'IT-EQUIP'),
    -- Plant CAPEX → Plant & Machinery / PLANT class (facility upgrades, civil construction)
    ('BI-CAPEX-PLANT', 'Plant Capital Expenditure',          'New plant construction and major facility upgrades',             'CAPEX', 'PLANT',          'BI-CAPEX', 22, 'IFRS-A-FA-PLANT', 'PLANT'),
    -- Equipment CAPEX → Plant & Machinery / PLANT class (production lines, systems)
    ('BI-CAPEX-EQUIP', 'Equipment Capital Expenditure',      'Production equipment, lines, and equipment systems',             'CAPEX', 'EQUIPMENT',      'BI-CAPEX', 23, 'IFRS-A-FA-PLANT', 'PLANT'),
    -- Machinery CAPEX → Plant & Machinery / PLANT class (CNC, heavy machinery)
    ('BI-CAPEX-MACH',  'Machinery Capital Expenditure',      'Heavy machinery, CNC, and automated systems',                    'CAPEX', 'MACHINERY',      'BI-CAPEX', 24, 'IFRS-A-FA-PLANT', 'PLANT'),
    -- Fleet CAPEX → Vehicles / VEHICLES class
    ('BI-CAPEX-FLEET', 'Fleet Capital Expenditure',          'Vehicle purchases and fleet expansion',                          'CAPEX', 'FLEET',          'BI-CAPEX', 25, 'IFRS-A-FA-VEH',   'VEHICLES'),
    -- Tooling CAPEX → Tools & Dies / TOOLS class (dies, moulds, jigs)
    ('BI-CAPEX-TOOL',  'Tooling Capital Expenditure',        'Dies, moulds, jigs, and special-purpose tooling',                'CAPEX', 'TOOLING',        'BI-CAPEX', 26, 'IFRS-A-FA-TOOLS', 'TOOLS'),
    -- Lease CAPEX → ROU Equipment (IFRS 16 capitalised finance leases → ROU asset)
    ('BI-CAPEX-LEASE', 'Lease Capital Expenditure',          'Finance leases capitalised under IFRS 16',                       'CAPEX', 'LEASE',          'BI-CAPEX', 27, 'IFRS-A-ROU-EQUIP','ROU-EQUIP'),
    -- Property CAPEX → Buildings / BUILDINGS class (land + buildings split at asset level)
    ('BI-CAPEX-PROP',  'Property Capital Expenditure',       'Land, buildings, and major property renovations',                'CAPEX', 'PROPERTY',       'BI-CAPEX', 28, 'IFRS-A-FA-BLDG',  'BUILDINGS'),
    -- Infrastructure CAPEX → CWIP during construction; reclassified to PLANT on completion
    ('BI-CAPEX-INFRA', 'Infrastructure Capital Expenditure', 'Roads, bridges, utilities, and civil infrastructure',            'CAPEX', 'INFRASTRUCTURE', 'BI-CAPEX', 29, 'IFRS-A-FA-CWIP',  'PLANT');

    -- ══════════════════════════════════════════════════════════════════════
    -- COST_OF_SALES LEAVES (5)
    -- GL: IFRS-E-COGS-* L3 posting accounts
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order, gl_account_code) VALUES
    ('BI-COGS-MAT',     'Material Cost of Sales',       'Raw materials and components consumed in production',            'COST_OF_SALES', 'MATERIAL',    'BI-COGS', 31, 'IFRS-E-COGS-MAT'),
    ('BI-COGS-SUB',     'Subcontracting Cost of Sales', 'Contract manufacturing and assembly outsourcing costs',          'COST_OF_SALES', 'SUBCONTRACT', 'BI-COGS', 32, 'IFRS-E-COGS-SUB'),
    ('BI-COGS-LABOUR',  'Direct Labour Cost of Sales',  'Production wages, overtime, and shift allowances',               'COST_OF_SALES', 'LABOUR',      'BI-COGS', 33, 'IFRS-E-COGS-LABOUR'),
    ('BI-COGS-OH',      'Overhead Cost of Sales',       'Factory overhead, depreciation, and indirect production costs',  'COST_OF_SALES', 'OVERHEAD',    'BI-COGS', 34, 'IFRS-E-COGS-OH'),
    ('BI-COGS-FREIGHT', 'Freight Cost of Sales',        'Inbound/outbound freight directly tied to sales',               'COST_OF_SALES', 'FREIGHT',     'BI-COGS', 35, 'IFRS-E-COGS-FREIGHT');

    -- ══════════════════════════════════════════════════════════════════════
    -- ADMIN LEAVES (3)
    -- GL: IFRS-E-GA-OFFICE / LEGAL / AUDIT
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order, gl_account_code) VALUES
    ('BI-ADMIN-GEN',   'General Admin Expense',      'Office supplies, travel, and miscellaneous admin costs',         'ADMIN', 'GENERAL', 'BI-ADMIN', 41, 'IFRS-E-GA-OFFICE'),
    ('BI-ADMIN-LEGAL', 'Legal & Governance Expense', 'In-house legal, board costs, and governance overhead',           'ADMIN', 'LEGAL',   'BI-ADMIN', 42, 'IFRS-E-GA-LEGAL'),
    ('BI-ADMIN-AUDIT', 'Audit & Assurance Expense',  'Internal audit, external audit, and compliance assurance',       'ADMIN', 'AUDIT',   'BI-ADMIN', 43, 'IFRS-E-GA-AUDIT');

    -- ══════════════════════════════════════════════════════════════════════
    -- REGULATORY LEAVES (3)
    -- GL: CIT for tax, LICENSE for statutory fees, OTHER-ENVIRO for env orders
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order, gl_account_code) VALUES
    -- Tax & Duties → Income Tax Expense (CIT is the primary; VAT/customs cleared via subledger)
    ('BI-REG-TAX',  'Tax & Duties',                 'Corporate tax, VAT, withholding tax, and customs duties',        'REGULATORY', 'TAX',         'BI-REG', 51, 'IFRS-E-TAX-CIT'),
    -- Compliance → Licence & Permit Fees (regulatory filings, certifications)
    ('BI-REG-COMP', 'Compliance Cost',              'Regulatory filings, certifications, and licence fees',           'REGULATORY', 'COMPLIANCE',  'BI-REG', 52, 'IFRS-E-GA-LICENSE'),
    -- Environmental compliance → Environmental Costs
    ('BI-REG-ENV',  'Environmental Compliance Cost','Environmental permits, monitoring, and remediation orders',       'REGULATORY', 'ENVIRONMENT', 'BI-REG', 53, 'IFRS-E-OTHER-ENVIRO');

    -- ══════════════════════════════════════════════════════════════════════
    -- TRANSFER LEAVES (2) — RESTRICTED visibility; not shown in standard UIs
    -- GL: IC Management Fee / IC Service Expense (intercompany clearing family)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_bi (code, name, description, domain, subtype, parent_code, sort_order, gl_account_code, intent_visibility) VALUES
    -- Inter-company transfer → IC Management Fee Expense (arms-length transfer pricing)
    ('BI-TRANSFER-IC',   'Inter-company Transfer',      'Cross-entity charges at arms-length transfer pricing',        'TRANSFER', 'INTERCOMPANY',  'BI-TRANSFER', 61, 'IFRS-E-ICE-MGMT', 'RESTRICTED'),
    -- Cost reallocation → IC Service Expense (internal cost reclassification clearing)
    ('BI-TRANSFER-RECL', 'Cost Reclass / Reallocation', 'Internal cost reallocation between cost centres',             'TRANSFER', 'REALLOCATION',  'BI-TRANSFER', 62, 'IFRS-E-ICE-SVCS', 'RESTRICTED');

    -- Preferred US GAAP mappings for mixed-framework tenants. Runtime/company
    -- onboarding can still fall back through _group_map when a country pack
    -- adds a different local operating chart.
    CREATE TEMP TABLE tmp_bi_gaap_override (
        ifrs_account_code  text PRIMARY KEY,
        gaap_account_code  text NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_bi_gaap_override (ifrs_account_code, gaap_account_code) VALUES
    ('IFRS-E-GA-IT',        'USGAAP-E-GA-IT'),
    ('IFRS-E-HR-SAL',       'USGAAP-E-PAYROLL-WAGE'),
    ('IFRS-E-GA-RENT',      'USGAAP-E-GA-RENT'),
    ('IFRS-E-GA-UTIL',      'USGAAP-E-GA-UTIL'),
    ('IFRS-E-GA-VEHICLE',   'USGAAP-E-GA-MISC'),
    ('IFRS-E-GA-INS',       'USGAAP-E-GA-INS'),
    ('IFRS-E-GA-CONSULT',   'USGAAP-E-GA-CONSULT'),
    ('IFRS-E-SELL-ADVERT',  'USGAAP-E-SALES-ADVERT'),
    ('IFRS-E-GA-SECURITY',  'USGAAP-E-GA-OFFICE'),
    ('IFRS-E-OTHER-ENVIRO', 'USGAAP-E-OTHER-MISC'),
    ('IFRS-E-GA-REPAIR',    'USGAAP-E-GA-REPAIR'),
    ('IFRS-A-FA-IT',        'USGAAP-A-FA-IT'),
    ('IFRS-A-FA-PLANT',     'USGAAP-A-FA-MACH'),
    ('IFRS-A-FA-VEH',       'USGAAP-A-FA-VEH'),
    ('IFRS-A-FA-TOOLS',     'USGAAP-A-FA-MACH'),
    ('IFRS-A-ROU-EQUIP',    'USGAAP-A-ROU-EQUIP'),
    ('IFRS-A-FA-BLDG',      'USGAAP-A-FA-BLDG'),
    ('IFRS-A-FA-CWIP',      'USGAAP-A-FA-CIP'),
    ('IFRS-E-COGS-MAT',     'USGAAP-E-COGS-MAT'),
    ('IFRS-E-COGS-SUB',     'USGAAP-E-COGS-SUB'),
    ('IFRS-E-COGS-LABOUR',  'USGAAP-E-COGS-LABOR'),
    ('IFRS-E-COGS-OH',      'USGAAP-E-COGS-OH'),
    ('IFRS-E-COGS-FREIGHT', 'USGAAP-E-COGS-FREIGHT'),
    ('IFRS-E-GA-OFFICE',    'USGAAP-E-GA-OFFICE'),
    ('IFRS-E-GA-LEGAL',     'USGAAP-E-GA-LEGAL'),
    ('IFRS-E-GA-AUDIT',     'USGAAP-E-GA-AUDIT'),
    ('IFRS-E-TAX-CIT',      'USGAAP-E-TAX-FED'),
    ('IFRS-E-GA-LICENSE',   'USGAAP-E-GA-DUES'),
    ('IFRS-E-ICE-MGMT',     'USGAAP-E-ICE-MGMT'),
    ('IFRS-E-ICE-SVCS',     'USGAAP-E-ICE-SVC');

    -- ── STAGE C: UPSERT domain roots ─────────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order,
        default_gl_account_id, default_asset_profile_code,
        visibility,
        metadata, status, created_by
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
        (SELECT a.id FROM master.gl_account a
         WHERE a.tenant_id              = v_tid
           AND a.chart_of_account_id   = v_coa_id
           AND a.code                  = s.gl_account_code
           AND a.is_active             = true
           AND a.node_type             = 'posting'
           AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true),
        s.asset_profile_code,
        s.intent_visibility,
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
        name                       = EXCLUDED.name,
        description                = EXCLUDED.description,
        domain                     = EXCLUDED.domain,
        sort_order                 = EXCLUDED.sort_order,
        -- COALESCE: keep an existing value if seed resolves to NULL (COA not yet seeded)
        default_gl_account_id      = COALESCE(EXCLUDED.default_gl_account_id,
                                              master.business_intent.default_gl_account_id),
        default_asset_profile_code = COALESCE(EXCLUDED.default_asset_profile_code,
                                              master.business_intent.default_asset_profile_code),
        visibility                 = EXCLUDED.visibility,
        metadata                   = master.business_intent.metadata
                                     || jsonb_build_object('_seed', jsonb_build_object(
                                            'pack',      v_pack,
                                            'version',   v_version,
                                            'seeded_at', now()::text,
                                            'container', true
                                        )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.business_intent.name,
           master.business_intent.description,
           master.business_intent.domain,
           master.business_intent.sort_order,
           master.business_intent.default_gl_account_id,
           master.business_intent.default_asset_profile_code,
           master.business_intent.visibility)
       IS DISTINCT FROM
          (EXCLUDED.name,
           EXCLUDED.description,
           EXCLUDED.domain,
           EXCLUDED.sort_order,
           COALESCE(EXCLUDED.default_gl_account_id,      master.business_intent.default_gl_account_id),
           COALESCE(EXCLUDED.default_asset_profile_code, master.business_intent.default_asset_profile_code),
           EXCLUDED.visibility);

    -- ── STAGE D: UPSERT intent leaves ────────────────────────────────────
    INSERT INTO master.business_intent (
        id, tenant_id, code, name, description, domain, subtype,
        parent_id, depth, sort_order,
        default_gl_account_id, default_asset_profile_code,
        visibility,
        metadata, status, created_by
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
        (SELECT a.id FROM master.gl_account a
         WHERE a.tenant_id              = v_tid
           AND a.chart_of_account_id   = v_coa_id
           AND a.code                  = s.gl_account_code
           AND a.is_active             = true
           AND a.node_type             = 'posting'
           AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true),
        s.asset_profile_code,
        s.intent_visibility,
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
        name                       = EXCLUDED.name,
        description                = EXCLUDED.description,
        domain                     = EXCLUDED.domain,
        subtype                    = EXCLUDED.subtype,
        parent_id                  = EXCLUDED.parent_id,
        depth                      = EXCLUDED.depth,
        sort_order                 = EXCLUDED.sort_order,
        default_gl_account_id      = COALESCE(EXCLUDED.default_gl_account_id,
                                              master.business_intent.default_gl_account_id),
        default_asset_profile_code = COALESCE(EXCLUDED.default_asset_profile_code,
                                              master.business_intent.default_asset_profile_code),
        visibility                 = EXCLUDED.visibility,
        metadata                   = master.business_intent.metadata
                                     || jsonb_build_object('_seed', jsonb_build_object(
                                            'pack',      v_pack,
                                            'version',   v_version,
                                            'seeded_at', now()::text
                                        )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.business_intent.name,
           master.business_intent.description,
           master.business_intent.domain,
           master.business_intent.subtype,
           master.business_intent.parent_id,
           master.business_intent.depth,
           master.business_intent.sort_order,
           master.business_intent.default_gl_account_id,
           master.business_intent.default_asset_profile_code,
           master.business_intent.visibility)
       IS DISTINCT FROM
          (EXCLUDED.name,
           EXCLUDED.description,
           EXCLUDED.domain,
           EXCLUDED.subtype,
           EXCLUDED.parent_id,
           EXCLUDED.depth,
           EXCLUDED.sort_order,
           COALESCE(EXCLUDED.default_gl_account_id,      master.business_intent.default_gl_account_id),
           COALESCE(EXCLUDED.default_asset_profile_code, master.business_intent.default_asset_profile_code),
           EXCLUDED.visibility);

    -- Framework-neutral defaults for onboarding/runtime. The physical GL UUID is
    -- company-scoped; these semantic codes are safe at tenant intent scope.
    CREATE TEMP TABLE tmp_bi_coa_defaults ON COMMIT DROP AS
    WITH charts AS (
        SELECT
            (SELECT id
             FROM master.chart_of_account
             WHERE tenant_id = v_tid AND code = 'COA-IFRS'
             LIMIT 1) AS ifrs_coa_id,
            (SELECT id
             FROM master.chart_of_account
             WHERE tenant_id = v_tid AND code = 'COA-GAAP'
             LIMIT 1) AS gaap_coa_id
    )
    SELECT
        s.code AS bi_code,
        s.gl_account_code AS ifrs_account_code,
        gaap.code AS gaap_account_code,
        ifrs.metadata->>'_group_map' AS group_account_code
    FROM tmp_bi s
    CROSS JOIN charts c
    LEFT JOIN master.gl_account ifrs
      ON ifrs.tenant_id = v_tid
     AND ifrs.chart_of_account_id = c.ifrs_coa_id
     AND ifrs.code = s.gl_account_code
     AND ifrs.is_active = true
     AND ifrs.node_type = 'posting'
     AND COALESCE((ifrs.metadata->>'_journal_postable')::boolean, true) = true
    LEFT JOIN tmp_bi_gaap_override o
      ON o.ifrs_account_code = s.gl_account_code
    LEFT JOIN LATERAL (
        SELECT a.code
        FROM master.gl_account a
        WHERE a.tenant_id = v_tid
          AND a.chart_of_account_id = c.gaap_coa_id
          AND a.is_active = true
          AND a.node_type = 'posting'
          AND COALESCE((a.metadata->>'_journal_postable')::boolean, true) = true
          AND (
              a.code = o.gaap_account_code
              OR (
                  o.gaap_account_code IS NULL
                  AND ifrs.metadata ? '_group_map'
                  AND a.metadata->>'_group_map' = ifrs.metadata->>'_group_map'
              )
          )
        ORDER BY CASE WHEN a.code = o.gaap_account_code THEN 0 ELSE 1 END,
                 a.sort_order,
                 a.code
        LIMIT 1
    ) gaap ON true
    WHERE s.gl_account_code IS NOT NULL;

    UPDATE master.business_intent bi
    SET metadata = bi.metadata
                   || jsonb_build_object(
                        '_coa_defaults',
                        jsonb_strip_nulls(jsonb_build_object(
                            'ifrs_code',     d.ifrs_account_code,
                            'usgaap_code',   d.gaap_account_code,
                            'group_map',     d.group_account_code,
                            'asset_profile', bi.default_asset_profile_code
                        ))
                      )
                   || CASE WHEN bi.code = 'BI-REG-TAX' THEN
                        jsonb_build_object(
                            '_tax_policy',
                            jsonb_build_object(
                                'tax_context_required', true,
                                'recommendation', 'Resolve tax_group at company, party, jurisdiction, and document-line context; do not use a tenant-global tax group for BI-REG-TAX.',
                                'purchase_tax_source', 'company_code_spend_policy.default_tax_group_id or supplier profile tax_group_id',
                                'withholding_tax_source', 'company_code_supplier_profile.default_wht_tax_group_id',
                                'expense_gl_role', 'corporate_income_tax_expense'
                            )
                        )
                      ELSE '{}'::jsonb END,
        updated_at = now(),
        updated_by = v_su
    FROM tmp_bi_coa_defaults d
    WHERE bi.tenant_id = v_tid
      AND bi.code = d.bi_code
      AND (
          bi.metadata->'_coa_defaults' IS DISTINCT FROM
              jsonb_strip_nulls(jsonb_build_object(
                  'ifrs_code',     d.ifrs_account_code,
                  'usgaap_code',   d.gaap_account_code,
                  'group_map',     d.group_account_code,
                  'asset_profile', bi.default_asset_profile_code
              ))
          OR (
              bi.code = 'BI-REG-TAX'
              AND NOT (bi.metadata ? '_tax_policy')
          )
      );

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid
          AND code = ANY(ARRAY[
            'BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV',
            'BI-OPEX-IT','BI-OPEX-HR','BI-OPEX-FAC','BI-OPEX-UTIL','BI-OPEX-FUEL','BI-OPEX-INS',
            'BI-OPEX-PROF','BI-OPEX-MKTG','BI-OPEX-FLEET','BI-OPEX-SAFETY','BI-OPEX-ENV',
            'BI-OPEX-MRO','BI-OPEX-MAINT','BI-OPEX-OUTSRC',
            'BI-CAPEX-IT','BI-CAPEX-PLANT','BI-CAPEX-EQUIP','BI-CAPEX-MACH','BI-CAPEX-FLEET',
            'BI-CAPEX-TOOL','BI-CAPEX-LEASE','BI-CAPEX-PROP','BI-CAPEX-INFRA',
            'BI-COGS-MAT','BI-COGS-SUB','BI-COGS-LABOUR','BI-COGS-OH','BI-COGS-FREIGHT',
            'BI-ADMIN-GEN','BI-ADMIN-LEGAL','BI-ADMIN-AUDIT',
            'BI-REG-TAX','BI-REG-COMP','BI-REG-ENV',
            'BI-TRANSFER-IC','BI-TRANSFER-RECL'
          ])) <> 44 THEN
        RAISE EXCEPTION '[021_base] Business intent load incomplete: expected 44 codes, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid
               AND code = ANY(ARRAY[
                 'BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV',
                 'BI-OPEX-IT','BI-OPEX-HR','BI-OPEX-FAC','BI-OPEX-UTIL','BI-OPEX-FUEL','BI-OPEX-INS',
                 'BI-OPEX-PROF','BI-OPEX-MKTG','BI-OPEX-FLEET','BI-OPEX-SAFETY','BI-OPEX-ENV',
                 'BI-OPEX-MRO','BI-OPEX-MAINT','BI-OPEX-OUTSRC',
                 'BI-CAPEX-IT','BI-CAPEX-PLANT','BI-CAPEX-EQUIP','BI-CAPEX-MACH','BI-CAPEX-FLEET',
                 'BI-CAPEX-TOOL','BI-CAPEX-LEASE','BI-CAPEX-PROP','BI-CAPEX-INFRA',
                 'BI-COGS-MAT','BI-COGS-SUB','BI-COGS-LABOUR','BI-COGS-OH','BI-COGS-FREIGHT',
                 'BI-ADMIN-GEN','BI-ADMIN-LEGAL','BI-ADMIN-AUDIT',
                 'BI-REG-TAX','BI-REG-COMP','BI-REG-ENV',
                 'BI-TRANSFER-IC','BI-TRANSFER-RECL'
               ]));
    END IF;

    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id  = v_tid
          AND parent_id IS NULL
          AND code = ANY(ARRAY[
            'BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV'
          ])) <> 8 THEN
        RAISE EXCEPTION '[021_base] Expected 8 domain roots, got %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id  = v_tid
               AND parent_id IS NULL
               AND code = ANY(ARRAY[
                 'BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV'
               ]));
    END IF;

    -- Assert all 9 CAPEX leaves have asset_profile_code set
    IF (SELECT count(*) FROM master.business_intent
        WHERE tenant_id = v_tid
          AND default_asset_profile_code IS NOT NULL
          AND code = ANY(ARRAY[
            'BI-CAPEX-IT','BI-CAPEX-PLANT','BI-CAPEX-EQUIP','BI-CAPEX-MACH','BI-CAPEX-FLEET',
            'BI-CAPEX-TOOL','BI-CAPEX-LEASE','BI-CAPEX-PROP','BI-CAPEX-INFRA'
          ])) <> 9 THEN
        RAISE EXCEPTION '[021_base] Expected 9 CAPEX intents with asset_profile_code, found only %',
            (SELECT count(*) FROM master.business_intent
             WHERE tenant_id = v_tid
               AND default_asset_profile_code IS NOT NULL
               AND code = ANY(ARRAY[
                 'BI-CAPEX-IT','BI-CAPEX-PLANT','BI-CAPEX-EQUIP','BI-CAPEX-MACH','BI-CAPEX-FLEET',
                 'BI-CAPEX-TOOL','BI-CAPEX-LEASE','BI-CAPEX-PROP','BI-CAPEX-INFRA'
               ]));
    END IF;

    -- Warn (not fail) if COA not seeded and GL defaults are missing
    IF v_coa_id IS NOT NULL THEN
        SELECT count(*) INTO v_gl_ok
        FROM master.business_intent
        WHERE tenant_id = v_tid
          AND default_gl_account_id IS NOT NULL
          AND code = ANY(ARRAY[
            'BI-OPEX-IT','BI-OPEX-HR','BI-OPEX-FAC','BI-OPEX-UTIL','BI-OPEX-FUEL',
            'BI-OPEX-INS','BI-OPEX-PROF','BI-OPEX-MKTG','BI-OPEX-FLEET','BI-OPEX-SAFETY',
            'BI-OPEX-ENV','BI-OPEX-MRO','BI-OPEX-MAINT','BI-OPEX-OUTSRC',
            'BI-CAPEX-IT','BI-CAPEX-PLANT','BI-CAPEX-EQUIP','BI-CAPEX-MACH','BI-CAPEX-FLEET',
            'BI-CAPEX-TOOL','BI-CAPEX-LEASE','BI-CAPEX-PROP','BI-CAPEX-INFRA',
            'BI-COGS-MAT','BI-COGS-SUB','BI-COGS-LABOUR','BI-COGS-OH','BI-COGS-FREIGHT',
            'BI-ADMIN-GEN','BI-ADMIN-LEGAL','BI-ADMIN-AUDIT',
            'BI-REG-TAX','BI-REG-COMP','BI-REG-ENV',
            'BI-TRANSFER-IC','BI-TRANSFER-RECL'
          ]);
        IF v_gl_ok < 36 THEN
            RAISE WARNING '[021_base] COA-IFRS found but only % of 36 leaf intents resolved a GL account. '
                          'Check that 211_framework_ifrs_accounts.sql ran to completion.',
                v_gl_ok;
        END IF;
    END IF;

    RAISE NOTICE '[021_base] Business intents loaded: 44 total (8 roots, 36 leaves). '
                 'GL defaults resolved: %. Asset profiles set: 9 CAPEX intents.',
        CASE WHEN v_coa_id IS NULL THEN 'SKIPPED (COA-IFRS not found)'
             ELSE v_gl_ok::text || '/36 leaves'
        END;

END $seed$;
