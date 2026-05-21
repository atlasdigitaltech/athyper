-- ============================================================================
-- UNIVERSAL — COMMODITY CATEGORY
-- ============================================================================
-- File:     023_commodity_category.sql
-- Schema:   master.commodity_category
-- Purpose:  Direct seed of all 125 commodity categories with full posture flags.
--           Layer A: 17 universal cross-functional roots + 60 leaves (77 total)
--           Layer B: 13 direct-operations roots + 35 leaves (48 total)
--           No dependency on master.spend_category.
-- Depends:  010_platform/099_tenant_bootstrap (tenant must exist)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- ============================================================================

-- ============================================================================
-- LAYER A: Universal cross-functional categories (77 total)
-- ============================================================================
DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '023_commodity_category';
    v_version text := '1.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── Register commodity_category owner type ────────────────────────────
    INSERT INTO master.owner_type (
        tenant_id, code, name, description,
        schema_name, table_name, pk_column,
        is_tenant_scoped, tenant_column,
        supports_address, supports_contact,
        is_system, category,
        allowed_address_purposes, allowed_contact_purposes,
        status, created_by
    ) VALUES (
        NULL, 'commodity_category', 'Commodity Category',
        'Shared commodity category. Target for commodity classification bridges across spend, sales, and inventory.',
        'master', 'commodity_category', 'id',
        true, 'tenant_id',
        false, false,
        true, 'custom',
        ARRAY[]::text[], ARRAY[]::text[],
        'active', v_su
    ) ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

    -- ── Stage data ───────────────────────────────────────────────────────
    CREATE TEMP TABLE tmp_cc (
        seed_id                    uuid         DEFAULT shared.uuidv7(),
        code                       text         NOT NULL,
        name                       text         NOT NULL,
        description                text,
        parent_code                text,
        sort_order                 smallint     NOT NULL DEFAULT 0,
        buy_allowed                boolean      NOT NULL DEFAULT true,
        sell_allowed               boolean      NOT NULL DEFAULT false,
        inventory_allowed          boolean      NOT NULL DEFAULT false,
        is_stockable               boolean      NOT NULL DEFAULT false,
        is_consumable              boolean      NOT NULL DEFAULT false,
        is_classification_required boolean      NOT NULL DEFAULT false,
        is_hs_required             boolean      NOT NULL DEFAULT false,
        is_regulated               boolean      NOT NULL DEFAULT false,
        valuation_method           text,
        lot_tracking               boolean      NOT NULL DEFAULT false,
        serial_tracking            boolean      NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER A ROOTS (17) — container categories, children carry posture flags
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_cc (code, name, description, sort_order) VALUES
    ('SC-IT',     'IT & Digital',                          'Information technology hardware, software, cloud, and services',          10),
    ('SC-TELCO',  'Telecom & Connectivity',                'Voice, data, mobile, and network connectivity services',                  20),
    ('SC-OFFICE', 'Office & Workplace',                    'Office supplies, furniture, equipment, and printing',                     30),
    ('SC-HR',     'HR, Talent & Benefits',                 'Recruitment, training, payroll services, and employee benefits',          40),
    ('SC-TRAVEL', 'Travel, Events & Employee Welfare',     'Air travel, hotels, ground transport, events, and conferences',           50),
    ('SC-PROF',   'Professional Services',                 'Legal, audit, consulting, and engineering advisory services',             60),
    ('SC-MKTG',   'Marketing, Media & CX',                 'Digital and traditional marketing, PR, and customer experience',          70),
    ('SC-FAC',    'Facilities & Occupancy',                'Rent, facility maintenance, cleaning, and on-site security',              80),
    ('SC-UTIL',   'Utilities & Energy Services',           'Electricity, water, gas, and waste management consumption',               90),
    ('SC-FLEET',  'Fleet & Mobility',                      'Vehicle purchase/lease, fuel, and fleet maintenance',                    100),
    ('SC-INS',    'Insurance',                             'Property, liability, and employee insurance',                            110),
    ('SC-BANK',   'Banking, Treasury & FX Services',       'Bank fees, foreign exchange, and treasury operations',                   120),
    ('SC-TAX',    'Taxes, Duties & Statutory Fees',        'Corporate taxes, import duties, and statutory levies',                   130),
    ('SC-SAFETY', 'Security, HSE & Compliance',            'Physical security, occupational health & safety, regulatory compliance', 140),
    ('SC-ENV',    'ESG, Waste & Environmental Services',   'Carbon management, waste recycling, and environmental remediation',      150),
    ('SC-OUTSRC', 'Outsourced & Shared Services',          'BPO, shared service centres, and temporary staffing',                   160),
    ('SC-SUBS',   'Subscriptions, Licenses & Memberships', 'Software licenses, memberships, and publication subscriptions',          170);

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER A LEAVES (60)
    -- ══════════════════════════════════════════════════════════════════════

    -- ── SC-IT leaves ─────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, valuation_method, serial_tracking) VALUES
    ('SC-IT-HW',   'Hardware & End-user Devices', 'Laptops, desktops, monitors, peripherals, and mobile devices',
     'SC-IT', 11, true,  true,  'weighted_avg', true);

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-IT-SW',    'Software & SaaS',        'Perpetual licenses, SaaS subscriptions, and custom development',  'SC-IT', 12),
    ('SC-IT-CLOUD', 'Cloud & Hosting',        'IaaS, PaaS, data centre colocation, and managed hosting',         'SC-IT', 13),
    ('SC-IT-SVC',   'IT Services & Support',  'Help desk, managed services, system integration, and consulting', 'SC-IT', 14),
    ('SC-IT-SEC',   'Cybersecurity',          'Security software, penetration testing, SOC, and identity management', 'SC-IT', 15);

    -- ── SC-TELCO leaves ───────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-TELCO-VOICE', 'Voice & Telephony', 'PBX, SIP trunking, call centre, and PSTN services',           'SC-TELCO', 21),
    ('SC-TELCO-DATA',  'Data & Internet',   'MPLS, SD-WAN, broadband, and dedicated internet access',       'SC-TELCO', 22),
    ('SC-TELCO-MOB',   'Mobile & Wireless', 'Mobile plans, SIM management, and wireless infrastructure',    'SC-TELCO', 23);

    -- ── SC-OFFICE leaves ──────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, is_consumable, valuation_method) VALUES
    ('SC-OFFICE-SUP',   'Office Supplies & Stationery', 'Paper, pens, toner, and general stationery',
     'SC-OFFICE', 31, true, true, true, 'weighted_avg');

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, valuation_method) VALUES
    ('SC-OFFICE-FURN',  'Office Furniture',             'Desks, chairs, filing cabinets, and modular workstations', 'SC-OFFICE', 32, true, true, 'weighted_avg'),
    ('SC-OFFICE-EQUIP', 'Office Equipment & Machines',  'Printers, copiers, shredders, and AV equipment',           'SC-OFFICE', 33, true, true, 'weighted_avg');

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-OFFICE-PRINT', 'Printing & Reprographics', 'Commercial printing, signage, and document services', 'SC-OFFICE', 34);

    -- ── SC-HR leaves ──────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-HR-RECRUIT',  'Recruitment & Staffing',  'Job boards, recruitment agencies, and assessment tools',               'SC-HR', 41),
    ('SC-HR-TRAIN',    'Training & Development',  'Instructor-led, e-learning, and certification programmes',             'SC-HR', 42),
    ('SC-HR-BEN',      'Employee Benefits',       'Health plans, retirement, wellness, and perquisites',                  'SC-HR', 43),
    ('SC-HR-PAYROLL',  'Payroll Services',        'Payroll processing, WPS, and HR technology platforms',                 'SC-HR', 44);

    -- ── SC-TRAVEL leaves ──────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-TRAVEL-AIR',    'Air Travel',              'Business and economy class flights, charter, and private aviation', 'SC-TRAVEL', 51),
    ('SC-TRAVEL-HOTEL',  'Accommodation & Hotels',  'Hotels, serviced apartments, and short-term rentals',               'SC-TRAVEL', 52),
    ('SC-TRAVEL-GROUND', 'Ground Transportation',   'Car rentals, taxis, ride-share, and chauffeur services',             'SC-TRAVEL', 53),
    ('SC-TRAVEL-EVENTS', 'Events & Conferences',    'Event management, venue hire, and conference sponsorship',           'SC-TRAVEL', 54);

    -- ── SC-PROF leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-PROF-LEGAL',   'Legal Services',        'Corporate law, litigation, IP, and regulatory counsel',              'SC-PROF', 61),
    ('SC-PROF-AUDIT',   'Audit & Accounting',    'External audit, tax advisory, and forensic accounting',              'SC-PROF', 62),
    ('SC-PROF-CONSULT', 'Management Consulting', 'Strategy, transformation, and operational consulting',               'SC-PROF', 63),
    ('SC-PROF-ENG',     'Engineering Consulting','Feasibility studies, design review, and technical advisory',         'SC-PROF', 64);

    -- ── SC-MKTG leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-MKTG-DIGITAL', 'Digital Marketing & Media',      'SEO, SEM, social media, programmatic, and influencer marketing', 'SC-MKTG', 71),
    ('SC-MKTG-TRAD',    'Traditional Advertising',        'Print, TV, radio, outdoor, and experiential campaigns',          'SC-MKTG', 72),
    ('SC-MKTG-PR',      'PR & Communications',            'Public relations, corporate communications, and crisis management','SC-MKTG', 73),
    ('SC-MKTG-CX',      'Customer Experience & Research', 'Market research, CX design, mystery shopping, and NPS programmes','SC-MKTG', 74);

    -- ── SC-FAC leaves ─────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-FAC-RENT',  'Rent & Lease Payments', 'Office, retail, and warehouse lease and licence fees',         'SC-FAC', 81),
    ('SC-FAC-MAINT', 'Facility Maintenance',  'HVAC, electrical, plumbing, and general building maintenance', 'SC-FAC', 82),
    ('SC-FAC-CLEAN', 'Cleaning & Janitorial', 'Office cleaning, washroom supplies, and pest control',         'SC-FAC', 83),
    ('SC-FAC-SECUR', 'Facility Security',     'Guards, CCTV, access control, and alarm monitoring',           'SC-FAC', 84);

    -- ── SC-UTIL leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-UTIL-ELEC',  'Electricity',       'Grid electricity consumption and renewable energy certificates',      'SC-UTIL', 91),
    ('SC-UTIL-WATER', 'Water & Sewerage',  'Municipal water supply and wastewater discharge',                    'SC-UTIL', 92),
    ('SC-UTIL-GAS',   'Natural Gas',       'Piped natural gas for heating, cooling, and catering',               'SC-UTIL', 93),
    ('SC-UTIL-WASTE', 'Waste Management',  'General waste collection, recycling, and hazardous waste disposal',  'SC-UTIL', 94);

    -- ── SC-FLEET leaves ───────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, valuation_method, serial_tracking) VALUES
    ('SC-FLEET-VEH', 'Vehicle Purchase & Lease', 'Vehicle purchases default to CAPEX; leases may override to OPEX',
     'SC-FLEET', 101, true, false, 'specific_id', true);

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, is_consumable, valuation_method) VALUES
    ('SC-FLEET-FUEL', 'Fleet Fuel', 'Petrol, diesel, CNG, and EV charging for fleet vehicles',
     'SC-FLEET', 102, true, true, true, 'weighted_avg');

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-FLEET-MAINT', 'Fleet Maintenance', 'Scheduled servicing, tyres, bodywork, and roadside assistance', 'SC-FLEET', 103);

    -- ── SC-INS leaves ─────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-INS-PROP', 'Property & Asset Insurance', 'Fire, theft, all-risk, and machinery breakdown coverage',           'SC-INS', 111),
    ('SC-INS-LIAB', 'Liability Insurance',         'Public, product, professional indemnity, and D&O liability',        'SC-INS', 112),
    ('SC-INS-EMP',  'Employee Insurance',          'Group medical, life, personal accident, and workers compensation',  'SC-INS', 113);

    -- ── SC-BANK leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-BANK-FEE',   'Bank Fees & Charges',   'Account fees, payment processing, and LC/BG charges',    'SC-BANK', 121),
    ('SC-BANK-FX',    'Foreign Exchange',       'Spot, forward, and hedging FX transactions',              'SC-BANK', 122),
    ('SC-BANK-TREAS', 'Treasury Services',      'Cash management, pooling, and investment advisory',       'SC-BANK', 123);

    -- ── SC-TAX leaves ─────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        is_regulated, is_hs_required, is_classification_required) VALUES
    ('SC-TAX-CORP', 'Corporate Taxes',         'Income tax, withholding tax, and deferred tax provisions',    'SC-TAX', 131, true, false, false),
    ('SC-TAX-DUTY', 'Import Duties & Customs', 'Customs duties, anti-dumping, and countervailing levies',     'SC-TAX', 132, true, true,  true),
    ('SC-TAX-STAT', 'Statutory Fees & Levies', 'Municipality fees, government licences, and regulatory levies','SC-TAX', 133, true, false, false);

    -- ── SC-SAFETY leaves ──────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order, is_regulated) VALUES
    ('SC-SAFETY-SEC',  'Physical Security',         'Manned guarding, K9, and executive protection services',          'SC-SAFETY', 141, false),
    ('SC-SAFETY-HSE',  'Health, Safety & Environment','HSE consulting, PPE, fire safety, and incident investigation',  'SC-SAFETY', 142, true),
    ('SC-SAFETY-COMP', 'Compliance & Regulatory',   'Third-party audits, certification, and compliance monitoring',    'SC-SAFETY', 143, true);

    -- ── SC-ENV leaves ─────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order, is_regulated) VALUES
    ('SC-ENV-WASTE',  'Waste & Recycling',         'Waste segregation, recycling programmes, and circular economy',    'SC-ENV', 151, true),
    ('SC-ENV-CARBON', 'Carbon & Emissions',        'Carbon footprint measurement, offsets, and reporting',             'SC-ENV', 152, true),
    ('SC-ENV-REMEDN', 'Environmental Remediation', 'Soil, water, and air remediation and decontamination',            'SC-ENV', 153, true);

    -- ── SC-OUTSRC leaves ──────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-OUTSRC-BPO',    'Business Process Outsourcing', 'Finance, HR, and procurement process outsourcing',               'SC-OUTSRC', 161),
    ('SC-OUTSRC-SHARED', 'Shared Service Centre',        'Centralised accounting, payroll, and IT help desk',              'SC-OUTSRC', 162),
    ('SC-OUTSRC-TEMP',   'Temporary Staffing',           'Contingent workers, seasonal labour, and staff augmentation',    'SC-OUTSRC', 163);

    -- ── SC-SUBS leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-SUBS-LIC',  'Software Licenses',            'Named/concurrent licences, maintenance, and upgrade entitlements',    'SC-SUBS', 171),
    ('SC-SUBS-MEMB', 'Memberships & Associations',   'Industry bodies, chambers of commerce, and professional memberships', 'SC-SUBS', 172),
    ('SC-SUBS-PUB',  'Publications & Subscriptions', 'Journals, databases, news feeds, and research subscriptions',         'SC-SUBS', 173);

    -- ── UPSERT roots (level_no = 1) ──────────────────────────────────────
    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description,
        parent_id, root_category_id, level_no, sort_order,
        buy_allowed, sell_allowed, inventory_allowed, is_stockable, is_consumable,
        is_classification_required, is_hs_required, is_regulated,
        allowed_classification_domains,
        default_valuation_method,
        is_lot_tracking_allowed, is_lot_tracking_required,
        is_serial_tracking_allowed, is_serial_tracking_required,
        metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, 1, s.sort_order,
        s.buy_allowed, s.sell_allowed, s.inventory_allowed, s.is_stockable, s.is_consumable,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        CASE WHEN s.is_hs_required THEN '["hs"]'::jsonb ELSE '[]'::jsonb END,
        s.valuation_method,
        s.lot_tracking, s.lot_tracking,
        s.serial_tracking, s.serial_tracking,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_cc s
    WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                           = EXCLUDED.name,
        description                    = EXCLUDED.description,
        parent_id                      = NULL,
        root_category_id               = master.commodity_category.id,
        level_no                       = 1,
        sort_order                     = EXCLUDED.sort_order,
        buy_allowed                    = EXCLUDED.buy_allowed,
        sell_allowed                   = EXCLUDED.sell_allowed,
        inventory_allowed              = EXCLUDED.inventory_allowed,
        is_stockable                   = EXCLUDED.is_stockable,
        is_consumable                  = EXCLUDED.is_consumable,
        is_classification_required     = EXCLUDED.is_classification_required,
        is_hs_required                 = EXCLUDED.is_hs_required,
        is_regulated                   = EXCLUDED.is_regulated,
        allowed_classification_domains = EXCLUDED.allowed_classification_domains,
        default_valuation_method       = EXCLUDED.default_valuation_method,
        is_lot_tracking_allowed        = EXCLUDED.is_lot_tracking_allowed,
        is_lot_tracking_required       = EXCLUDED.is_lot_tracking_required,
        is_serial_tracking_allowed     = EXCLUDED.is_serial_tracking_allowed,
        is_serial_tracking_required    = EXCLUDED.is_serial_tracking_required,
        metadata                       = master.commodity_category.metadata
                                         || jsonb_build_object('_seed', EXCLUDED.metadata -> '_seed'),
        updated_at                     = now(),
        updated_by                     = v_su;

    -- ── UPSERT leaves (level_no = 2) ─────────────────────────────────────
    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description,
        parent_id, root_category_id, level_no, sort_order,
        buy_allowed, sell_allowed, inventory_allowed, is_stockable, is_consumable,
        is_classification_required, is_hs_required, is_regulated,
        allowed_classification_domains,
        default_valuation_method,
        is_lot_tracking_allowed, is_lot_tracking_required,
        is_serial_tracking_allowed, is_serial_tracking_required,
        metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        parent_cc.id, parent_cc.root_category_id, 2, s.sort_order,
        s.buy_allowed, s.sell_allowed, s.inventory_allowed, s.is_stockable, s.is_consumable,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        CASE WHEN s.is_hs_required THEN '["hs"]'::jsonb ELSE '[]'::jsonb END,
        s.valuation_method,
        s.lot_tracking, s.lot_tracking,
        s.serial_tracking, s.serial_tracking,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_cc s
    JOIN master.commodity_category parent_cc
      ON parent_cc.tenant_id = v_tid AND parent_cc.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                           = EXCLUDED.name,
        description                    = EXCLUDED.description,
        parent_id                      = EXCLUDED.parent_id,
        root_category_id               = EXCLUDED.root_category_id,
        level_no                       = 2,
        sort_order                     = EXCLUDED.sort_order,
        buy_allowed                    = EXCLUDED.buy_allowed,
        sell_allowed                   = EXCLUDED.sell_allowed,
        inventory_allowed              = EXCLUDED.inventory_allowed,
        is_stockable                   = EXCLUDED.is_stockable,
        is_consumable                  = EXCLUDED.is_consumable,
        is_classification_required     = EXCLUDED.is_classification_required,
        is_hs_required                 = EXCLUDED.is_hs_required,
        is_regulated                   = EXCLUDED.is_regulated,
        allowed_classification_domains = EXCLUDED.allowed_classification_domains,
        default_valuation_method       = EXCLUDED.default_valuation_method,
        is_lot_tracking_allowed        = EXCLUDED.is_lot_tracking_allowed,
        is_lot_tracking_required       = EXCLUDED.is_lot_tracking_required,
        is_serial_tracking_allowed     = EXCLUDED.is_serial_tracking_allowed,
        is_serial_tracking_required    = EXCLUDED.is_serial_tracking_required,
        metadata                       = master.commodity_category.metadata
                                         || jsonb_build_object('_seed', EXCLUDED.metadata -> '_seed'),
        updated_at                     = now(),
        updated_by                     = v_su;

    -- ── Assertions ───────────────────────────────────────────────────────
    IF (SELECT count(*) FROM master.commodity_category
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND level_no = 1) <> 17 THEN
        RAISE EXCEPTION '[023_commodity_category] Expected 17 Layer A roots, got %',
            (SELECT count(*) FROM master.commodity_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND level_no = 1);
    END IF;

    IF (SELECT count(*) FROM master.commodity_category
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND level_no = 2) <> 60 THEN
        RAISE EXCEPTION '[023_commodity_category] Expected 60 Layer A leaves, got %',
            (SELECT count(*) FROM master.commodity_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND level_no = 2);
    END IF;

    RAISE NOTICE '[023_commodity_category] Layer A loaded: % total (17 roots, % leaves)',
        (SELECT count(*) FROM master.commodity_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND level_no = 2);

END $seed$;

-- ============================================================================
-- LAYER B: Direct-operations categories (48 total)
-- ============================================================================
DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '023_commodity_category_direct_ops';
    v_version text := '1.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.commodity_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION '[023_commodity_category] Layer A not loaded — run Layer A block first';
    END IF;

    -- ── Stage data ───────────────────────────────────────────────────────
    DROP TABLE IF EXISTS tmp_cc;
    CREATE TEMP TABLE tmp_cc (
        seed_id                    uuid         DEFAULT shared.uuidv7(),
        code                       text         NOT NULL,
        name                       text         NOT NULL,
        description                text,
        parent_code                text,
        sort_order                 smallint     NOT NULL DEFAULT 0,
        buy_allowed                boolean      NOT NULL DEFAULT true,
        sell_allowed               boolean      NOT NULL DEFAULT false,
        inventory_allowed          boolean      NOT NULL DEFAULT false,
        is_stockable               boolean      NOT NULL DEFAULT false,
        is_consumable              boolean      NOT NULL DEFAULT false,
        is_classification_required boolean      NOT NULL DEFAULT false,
        is_hs_required             boolean      NOT NULL DEFAULT false,
        is_regulated               boolean      NOT NULL DEFAULT false,
        valuation_method           text,
        lot_tracking               boolean      NOT NULL DEFAULT false,
        serial_tracking            boolean      NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER B ROOTS (13) — direct-operations container categories
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_cc (code, name, description, sort_order, inventory_allowed) VALUES
    ('SC-RAW',      'Raw Materials & Feedstock',             'Metals, chemicals, polymers, and agricultural raw materials',           200, true),
    ('SC-COMP',     'Components & Sub-assemblies',           'Mechanical, electrical, and structural components',                     210, true),
    ('SC-PKG',      'Packaging Materials',                   'Primary, secondary, and transit packaging',                             220, true),
    ('SC-CONSUM',   'Consumables & Chemicals',               'Industrial chemicals, lab consumables, and cleaning agents',            230, true),
    ('SC-MRO',      'MRO & Spare Parts',                     'Maintenance spare parts, tools, and supplies',                         240, true),
    ('SC-CAPEQUIP', 'Capital Equipment & Tooling',           'Machinery, tooling, fixtures, and production lines',                   300, true);

    INSERT INTO tmp_cc (code, name, description, sort_order) VALUES
    ('SC-PRODSVC',  'Production / Plant Services',           'Calibration, plant operations, and production support services',       250),
    ('SC-CONTRACT', 'Contract Manufacturing / Subcontracting','Contract manufacturing and assembly subcontracting',                  260),
    ('SC-FREIGHT',  'Freight, Logistics & Customs',          'Road, sea, air freight, and customs brokerage',                       270),
    ('SC-WHSE',     'Warehousing & Cold Chain',              'Warehousing, storage, and temperature-controlled logistics',           280),
    ('SC-QC',       'Quality, Lab & Testing',                'Testing, certification, and inspection services',                     290),
    ('SC-TEMPWK',   'Temporary Works / Site Services',       'Scaffolding, temporary site facilities, and access equipment',        310),
    ('SC-PROCNRG',  'Process Energy / Utility Input',        'Steam, compressed air, and process gases used in production',         320);

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER B LEAVES (35)
    -- ══════════════════════════════════════════════════════════════════════

    -- ── SC-RAW leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable,
                        is_classification_required, is_hs_required, is_regulated,
                        valuation_method, lot_tracking) VALUES
    ('SC-RAW-METAL', 'Metals & Alloys',           'Steel, aluminium, copper, and specialty alloys',
     'SC-RAW', 201, true, true, true,  true,  false, 'weighted_avg', false),
    ('SC-RAW-CHEM',  'Chemicals & Polymers',      'Base chemicals, resins, polymers, and solvents',
     'SC-RAW', 202, true, true, true,  true,  true,  'fifo',         true),
    ('SC-RAW-AGRI',  'Agricultural Raw Materials','Cotton, jute, rubber, timber, and other agri commodities',
     'SC-RAW', 203, true, true, true,  true,  false, 'fifo',         true);

    -- ── SC-COMP leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable,
                        is_classification_required, is_hs_required,
                        valuation_method) VALUES
    ('SC-COMP-MECH',   'Mechanical Components',        'Bearings, gears, fasteners, valves, and pumps',
     'SC-COMP', 211, true, true, true,  false, 'weighted_avg'),
    ('SC-COMP-ELEC',   'Electrical & Electronic Comps','PCBs, connectors, relays, sensors, and semiconductors',
     'SC-COMP', 212, true, true, true,  true,  'weighted_avg'),
    ('SC-COMP-STRUCT', 'Structural Components',        'Beams, columns, plates, and prefabricated sections',
     'SC-COMP', 213, true, true, false, false, 'weighted_avg');

    -- ── SC-PKG leaves ─────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, valuation_method) VALUES
    ('SC-PKG-PRIMARY',   'Primary Packaging',  'Bottles, blister packs, pouches, and vials',         'SC-PKG', 221, true, true, 'weighted_avg'),
    ('SC-PKG-SECONDARY', 'Secondary Packaging','Cartons, boxes, shrink wrap, and labels',             'SC-PKG', 222, true, true, 'weighted_avg'),
    ('SC-PKG-TRANSIT',   'Transit Packaging',  'Pallets, stretch film, crates, and dunnage',          'SC-PKG', 223, true, true, 'weighted_avg');

    -- ── SC-CONSUM leaves ──────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, is_consumable, is_regulated,
                        valuation_method, lot_tracking) VALUES
    ('SC-CONSUM-CHEM',  'Industrial Chemicals',   'Process chemicals, catalysts, and reagents',         'SC-CONSUM', 231, true, true, true, true,  'fifo',         true),
    ('SC-CONSUM-LAB',   'Laboratory Consumables', 'Glassware, pipettes, filters, and test kits',        'SC-CONSUM', 232, true, true, true, false, 'fifo',         true),
    ('SC-CONSUM-CLEAN', 'Cleaning Consumables',   'Solvents, detergents, wipes, and cleanroom supplies','SC-CONSUM', 233, true, true, true, false, 'weighted_avg', false);

    -- ── SC-MRO leaves ─────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, valuation_method) VALUES
    ('SC-MRO-SPARE',  'Spare Parts',          'OEM and aftermarket replacement parts',                'SC-MRO', 241, true, true, 'weighted_avg'),
    ('SC-MRO-TOOL',   'Maintenance Tools',    'Hand tools, power tools, and diagnostic equipment',    'SC-MRO', 242, true, true, 'weighted_avg');

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, is_consumable, valuation_method) VALUES
    ('SC-MRO-SUPPLY', 'Maintenance Supplies', 'Lubricants, adhesives, tapes, and safety consumables', 'SC-MRO', 243, true, true, true, 'weighted_avg');

    -- ── SC-PRODSVC leaves ─────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order, is_regulated) VALUES
    ('SC-PRODSVC-CALIB', 'Calibration Services',     'Instrument calibration, metrology, and certification', 'SC-PRODSVC', 251, true),
    ('SC-PRODSVC-PLANT', 'Plant Operations Services', 'Commissioning, shutdown, and turnaround support',      'SC-PRODSVC', 252, false);

    -- ── SC-CONTRACT leaves ────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-CONTRACT-MFG', 'Contract Manufacturing',  'Toll manufacturing, white-label, and private-label production', 'SC-CONTRACT', 261),
    ('SC-CONTRACT-ASM', 'Assembly Subcontracting', 'Sub-assembly, kitting, and final assembly outsourcing',         'SC-CONTRACT', 262);

    -- ── SC-FREIGHT leaves ─────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order, is_regulated) VALUES
    ('SC-FREIGHT-ROAD', 'Road Freight',       'FTL, LTL, and last-mile delivery',                       'SC-FREIGHT', 271, false),
    ('SC-FREIGHT-SEA',  'Sea Freight',        'FCL, LCL, breakbulk, and tanker shipping',                'SC-FREIGHT', 272, true),
    ('SC-FREIGHT-AIR',  'Air Freight',        'Express air, charter, and consolidated airfreight',        'SC-FREIGHT', 273, true);

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        is_regulated, is_hs_required, is_classification_required) VALUES
    ('SC-FREIGHT-CUST', 'Customs & Brokerage', 'Customs clearance, brokerage, and trade compliance',
     'SC-FREIGHT', 274, true, true, true);

    -- ── SC-WHSE leaves ────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-WHSE-STORE', 'Warehousing & Storage', 'Ambient, bonded, and free-zone warehouse space',           'SC-WHSE', 281),
    ('SC-WHSE-COLD',  'Cold Chain Services',   'Refrigerated storage, reefer transport, and cold-room ops','SC-WHSE', 282);

    -- ── SC-QC leaves ──────────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order, is_regulated) VALUES
    ('SC-QC-TEST',    'Testing & Analysis',         'Chemical, physical, microbiological, and mechanical testing', 'SC-QC', 291, true),
    ('SC-QC-CERT',    'Certification & Accreditation','ISO, HACCP, GMP, and product certification',               'SC-QC', 292, true),
    ('SC-QC-INSPECT', 'Inspection Services',        'Pre-shipment, in-process, and third-party inspection',        'SC-QC', 293, true);

    -- ── SC-CAPEQUIP leaves ────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, valuation_method, serial_tracking) VALUES
    ('SC-CAPEQUIP-MACH', 'Machinery',          'Industrial machinery, CNC, and automated equipment',       'SC-CAPEQUIP', 301, true, false, 'specific_id', true),
    ('SC-CAPEQUIP-LINE', 'Production Lines',   'Assembly lines, conveyors, and process equipment trains',  'SC-CAPEQUIP', 303, true, false, 'specific_id', true);

    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order,
                        inventory_allowed, is_stockable, valuation_method) VALUES
    ('SC-CAPEQUIP-TOOL', 'Tooling & Fixtures', 'Dies, moulds, jigs, and special-purpose tooling',         'SC-CAPEQUIP', 302, true, true,  'weighted_avg');

    -- ── SC-TEMPWK leaves ──────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-TEMPWK-SCAF', 'Scaffolding & Access', 'Scaffolding erection, aerial platforms, and rope access',   'SC-TEMPWK', 311),
    ('SC-TEMPWK-SITE', 'Site Services',        'Portable cabins, site welfare, and temporary utilities',     'SC-TEMPWK', 312);

    -- ── SC-PROCNRG leaves ─────────────────────────────────────────────────
    INSERT INTO tmp_cc (code, name, description, parent_code, sort_order) VALUES
    ('SC-PROCNRG-STEAM', 'Steam & Thermal',        'Industrial steam generation and thermal energy supply',   'SC-PROCNRG', 321),
    ('SC-PROCNRG-COMP',  'Compressed Air & Gases', 'Compressed air, nitrogen, oxygen, and specialty gases',  'SC-PROCNRG', 322);

    -- ── UPSERT roots (level_no = 1) ──────────────────────────────────────
    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description,
        parent_id, root_category_id, level_no, sort_order,
        buy_allowed, sell_allowed, inventory_allowed, is_stockable, is_consumable,
        is_classification_required, is_hs_required, is_regulated,
        allowed_classification_domains,
        default_valuation_method,
        is_lot_tracking_allowed, is_lot_tracking_required,
        is_serial_tracking_allowed, is_serial_tracking_required,
        metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, 1, s.sort_order,
        s.buy_allowed, s.sell_allowed, s.inventory_allowed, s.is_stockable, s.is_consumable,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        CASE WHEN s.is_hs_required THEN '["hs"]'::jsonb ELSE '[]'::jsonb END,
        s.valuation_method,
        s.lot_tracking, s.lot_tracking,
        s.serial_tracking, s.serial_tracking,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_cc s
    WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                           = EXCLUDED.name,
        description                    = EXCLUDED.description,
        parent_id                      = NULL,
        root_category_id               = master.commodity_category.id,
        level_no                       = 1,
        sort_order                     = EXCLUDED.sort_order,
        buy_allowed                    = EXCLUDED.buy_allowed,
        sell_allowed                   = EXCLUDED.sell_allowed,
        inventory_allowed              = EXCLUDED.inventory_allowed,
        is_stockable                   = EXCLUDED.is_stockable,
        is_consumable                  = EXCLUDED.is_consumable,
        is_classification_required     = EXCLUDED.is_classification_required,
        is_hs_required                 = EXCLUDED.is_hs_required,
        is_regulated                   = EXCLUDED.is_regulated,
        allowed_classification_domains = EXCLUDED.allowed_classification_domains,
        default_valuation_method       = EXCLUDED.default_valuation_method,
        is_lot_tracking_allowed        = EXCLUDED.is_lot_tracking_allowed,
        is_lot_tracking_required       = EXCLUDED.is_lot_tracking_required,
        is_serial_tracking_allowed     = EXCLUDED.is_serial_tracking_allowed,
        is_serial_tracking_required    = EXCLUDED.is_serial_tracking_required,
        metadata                       = master.commodity_category.metadata
                                         || jsonb_build_object('_seed', EXCLUDED.metadata -> '_seed'),
        updated_at                     = now(),
        updated_by                     = v_su;

    -- ── UPSERT leaves (level_no = 2) ─────────────────────────────────────
    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description,
        parent_id, root_category_id, level_no, sort_order,
        buy_allowed, sell_allowed, inventory_allowed, is_stockable, is_consumable,
        is_classification_required, is_hs_required, is_regulated,
        allowed_classification_domains,
        default_valuation_method,
        is_lot_tracking_allowed, is_lot_tracking_required,
        is_serial_tracking_allowed, is_serial_tracking_required,
        metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        parent_cc.id, parent_cc.root_category_id, 2, s.sort_order,
        s.buy_allowed, s.sell_allowed, s.inventory_allowed, s.is_stockable, s.is_consumable,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        CASE WHEN s.is_hs_required THEN '["hs"]'::jsonb ELSE '[]'::jsonb END,
        s.valuation_method,
        s.lot_tracking, s.lot_tracking,
        s.serial_tracking, s.serial_tracking,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_cc s
    JOIN master.commodity_category parent_cc
      ON parent_cc.tenant_id = v_tid AND parent_cc.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                           = EXCLUDED.name,
        description                    = EXCLUDED.description,
        parent_id                      = EXCLUDED.parent_id,
        root_category_id               = EXCLUDED.root_category_id,
        level_no                       = 2,
        sort_order                     = EXCLUDED.sort_order,
        buy_allowed                    = EXCLUDED.buy_allowed,
        sell_allowed                   = EXCLUDED.sell_allowed,
        inventory_allowed              = EXCLUDED.inventory_allowed,
        is_stockable                   = EXCLUDED.is_stockable,
        is_consumable                  = EXCLUDED.is_consumable,
        is_classification_required     = EXCLUDED.is_classification_required,
        is_hs_required                 = EXCLUDED.is_hs_required,
        is_regulated                   = EXCLUDED.is_regulated,
        allowed_classification_domains = EXCLUDED.allowed_classification_domains,
        default_valuation_method       = EXCLUDED.default_valuation_method,
        is_lot_tracking_allowed        = EXCLUDED.is_lot_tracking_allowed,
        is_lot_tracking_required       = EXCLUDED.is_lot_tracking_required,
        is_serial_tracking_allowed     = EXCLUDED.is_serial_tracking_allowed,
        is_serial_tracking_required    = EXCLUDED.is_serial_tracking_required,
        metadata                       = master.commodity_category.metadata
                                         || jsonb_build_object('_seed', EXCLUDED.metadata -> '_seed'),
        updated_at                     = now(),
        updated_by                     = v_su;

    -- ── Assertions ───────────────────────────────────────────────────────
    IF (SELECT count(*) FROM master.commodity_category
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND level_no = 1) <> 13 THEN
        RAISE EXCEPTION '[023_commodity_category] Expected 13 Layer B roots, got %',
            (SELECT count(*) FROM master.commodity_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND level_no = 1);
    END IF;

    IF (SELECT count(*) FROM master.commodity_category
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND level_no = 2) <> 35 THEN
        RAISE EXCEPTION '[023_commodity_category] Expected 35 Layer B leaves, got %',
            (SELECT count(*) FROM master.commodity_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND level_no = 2);
    END IF;

    RAISE NOTICE '[023_commodity_category] Layer B loaded: % total (13 roots, % leaves) — grand total %',
        (SELECT count(*) FROM master.commodity_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.commodity_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND level_no = 2),
        (SELECT count(*) FROM master.commodity_category WHERE tenant_id = v_tid);

END $seed$;
