-- ============================================================================
-- UNIVERSAL — BASE SPEND CATEGORIES — LAYER A: UNIVERSAL
-- ============================================================================
-- File:     020_spend_categories.sql
-- Schema:   master.spend_category
-- Purpose:  17 universal cross-functional roots + 60 leaf children (77 total)
--           Applied to every tenant regardless of industry.
-- Depends:  010_platform/099_tenant_bootstrap (tenant must exist)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §4 Spend Category Taxonomy — Layer A
-- ============================================================================
-- PACK OWNS: SC-IT SC-TELCO SC-OFFICE SC-HR SC-TRAVEL SC-PROF SC-MKTG
--            SC-FAC SC-UTIL SC-FLEET SC-INS SC-BANK SC-TAX SC-SAFETY
--            SC-ENV SC-OUTSRC SC-SUBS  (and all SC-*-* children)
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '020_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────
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

    -- ── Leaves: SC-IT ─────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-IT-HW',    'Hardware & End-user Devices',     'Laptops, desktops, monitors, peripherals, and mobile devices',          'SC-IT', 'goods',    11),
    ('SC-IT-SW',    'Software & SaaS',                 'Perpetual licenses, SaaS subscriptions, and custom development',        'SC-IT', 'services', 12),
    ('SC-IT-CLOUD', 'Cloud & Hosting',                 'IaaS, PaaS, data centre colocation, and managed hosting',               'SC-IT', 'services', 13),
    ('SC-IT-SVC',   'IT Services & Support',           'Help desk, managed services, system integration, and consulting',       'SC-IT', 'services', 14),
    ('SC-IT-SEC',   'Cybersecurity',                   'Security software, penetration testing, SOC, and identity management',  'SC-IT', 'services', 15);

    -- ── Leaves: SC-TELCO ──────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TELCO-VOICE', 'Voice & Telephony',            'PBX, SIP trunking, call centre, and PSTN services',                    'SC-TELCO', 'services', 21),
    ('SC-TELCO-DATA',  'Data & Internet',              'MPLS, SD-WAN, broadband, and dedicated internet access',               'SC-TELCO', 'services', 22),
    ('SC-TELCO-MOB',   'Mobile & Wireless',            'Mobile plans, SIM management, and wireless infrastructure',             'SC-TELCO', 'services', 23);

    -- ── Leaves: SC-OFFICE ─────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-OFFICE-SUP',   'Office Supplies & Stationery',   'Paper, pens, toner, and general stationery',                         'SC-OFFICE', 'goods',    31),
    ('SC-OFFICE-FURN',  'Office Furniture',               'Desks, chairs, filing cabinets, and modular workstations',            'SC-OFFICE', 'goods',    32),
    ('SC-OFFICE-EQUIP', 'Office Equipment & Machines',    'Printers, copiers, shredders, and AV equipment',                      'SC-OFFICE', 'goods',    33),
    ('SC-OFFICE-PRINT', 'Printing & Reprographics',       'Commercial printing, signage, and document services',                 'SC-OFFICE', 'services', 34);

    -- ── Leaves: SC-HR ─────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-HR-RECRUIT',  'Recruitment & Staffing',          'Job boards, recruitment agencies, and assessment tools',               'SC-HR', 'services', 41),
    ('SC-HR-TRAIN',    'Training & Development',          'Instructor-led, e-learning, and certification programmes',             'SC-HR', 'services', 42),
    ('SC-HR-BEN',      'Employee Benefits',               'Health plans, retirement, wellness, and perquisites',                  'SC-HR', 'services', 43),
    ('SC-HR-PAYROLL',  'Payroll Services',                'Payroll processing, WPS, and HR technology platforms',                 'SC-HR', 'services', 44);

    -- ── Leaves: SC-TRAVEL ─────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TRAVEL-AIR',    'Air Travel',                    'Business and economy class flights, charter, and private aviation',    'SC-TRAVEL', 'services', 51),
    ('SC-TRAVEL-HOTEL',  'Accommodation & Hotels',        'Hotels, serviced apartments, and short-term rentals',                  'SC-TRAVEL', 'services', 52),
    ('SC-TRAVEL-GROUND', 'Ground Transportation',         'Car rentals, taxis, ride-share, and chauffeur services',               'SC-TRAVEL', 'services', 53),
    ('SC-TRAVEL-EVENTS', 'Events & Conferences',          'Event management, venue hire, and conference sponsorship',             'SC-TRAVEL', 'services', 54);

    -- ── Leaves: SC-PROF ───────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PROF-LEGAL',   'Legal Services',                 'Corporate law, litigation, IP, and regulatory counsel',                'SC-PROF', 'services', 61),
    ('SC-PROF-AUDIT',   'Audit & Accounting',             'External audit, tax advisory, and forensic accounting',                'SC-PROF', 'services', 62),
    ('SC-PROF-CONSULT', 'Management Consulting',          'Strategy, transformation, and operational consulting',                 'SC-PROF', 'services', 63),
    ('SC-PROF-ENG',     'Engineering Consulting',         'Feasibility studies, design review, and technical advisory',           'SC-PROF', 'services', 64);

    -- ── Leaves: SC-MKTG ───────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-MKTG-DIGITAL', 'Digital Marketing & Media',      'SEO, SEM, social media, programmatic, and influencer marketing',      'SC-MKTG', 'services', 71),
    ('SC-MKTG-TRAD',    'Traditional Advertising',        'Print, TV, radio, outdoor, and experiential campaigns',               'SC-MKTG', 'services', 72),
    ('SC-MKTG-PR',      'PR & Communications',            'Public relations, corporate communications, and crisis management',   'SC-MKTG', 'services', 73),
    ('SC-MKTG-CX',      'Customer Experience & Research', 'Market research, CX design, mystery shopping, and NPS programmes',    'SC-MKTG', 'services', 74);

    -- ── Leaves: SC-FAC ────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-FAC-RENT',  'Rent & Lease Payments',             'Office, retail, and warehouse lease and licence fees',                 'SC-FAC', 'services', 81),
    ('SC-FAC-MAINT', 'Facility Maintenance',              'HVAC, electrical, plumbing, and general building maintenance',         'SC-FAC', 'services', 82),
    ('SC-FAC-CLEAN', 'Cleaning & Janitorial',             'Office cleaning, washroom supplies, and pest control',                 'SC-FAC', 'services', 83),
    ('SC-FAC-SECUR', 'Facility Security',                 'Guards, CCTV, access control, and alarm monitoring',                   'SC-FAC', 'services', 84);

    -- ── Leaves: SC-UTIL ───────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-UTIL-ELEC',  'Electricity',                      'Grid electricity consumption and renewable energy certificates',       'SC-UTIL', 'services', 91),
    ('SC-UTIL-WATER', 'Water & Sewerage',                 'Municipal water supply and wastewater discharge',                      'SC-UTIL', 'services', 92),
    ('SC-UTIL-GAS',   'Natural Gas',                      'Piped natural gas for heating, cooling, and catering',                 'SC-UTIL', 'services', 93),
    ('SC-UTIL-WASTE', 'Waste Management',                 'General waste collection, recycling, and hazardous waste disposal',    'SC-UTIL', 'services', 94);

    -- ── Leaves: SC-FLEET ──────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-FLEET-VEH',   'Vehicle Purchase & Lease',        'Vehicle purchases default to CAPEX; leases may override to OPEX',      'SC-FLEET', 'goods',   101),
    ('SC-FLEET-FUEL',  'Fleet Fuel',                      'Petrol, diesel, CNG, and EV charging for fleet vehicles',             'SC-FLEET', 'goods',   102),
    ('SC-FLEET-MAINT', 'Fleet Maintenance',               'Scheduled servicing, tyres, bodywork, and roadside assistance',        'SC-FLEET', 'services',103);

    -- ── Leaves: SC-INS ────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-INS-PROP', 'Property & Asset Insurance',         'Fire, theft, all-risk, and machinery breakdown coverage',              'SC-INS', 'services', 111),
    ('SC-INS-LIAB', 'Liability Insurance',                'Public, product, professional indemnity, and D&O liability',           'SC-INS', 'services', 112),
    ('SC-INS-EMP',  'Employee Insurance',                 'Group medical, life, personal accident, and workers compensation',     'SC-INS', 'services', 113);

    -- ── Leaves: SC-BANK ───────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-BANK-FEE',   'Bank Fees & Charges',              'Account fees, payment processing, and LC/BG charges',                 'SC-BANK', 'services', 121),
    ('SC-BANK-FX',    'Foreign Exchange Services',        'Spot, forward, and hedging FX transactions',                          'SC-BANK', 'services', 122),
    ('SC-BANK-TREAS', 'Treasury Services',                'Cash management, pooling, and investment advisory',                    'SC-BANK', 'services', 123);

    -- ── Leaves: SC-TAX ────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TAX-CORP', 'Corporate Taxes',                    'Income tax, withholding tax, and deferred tax provisions',             'SC-TAX', 'services', 131),
    ('SC-TAX-DUTY', 'Import Duties & Customs',            'Customs duties, anti-dumping, and countervailing levies',              'SC-TAX', 'services', 132),
    ('SC-TAX-STAT', 'Statutory Fees & Levies',            'Municipality fees, government licences, and regulatory levies',        'SC-TAX', 'services', 133);

    -- ── Leaves: SC-SAFETY ─────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-SAFETY-SEC',  'Physical Security',               'Manned guarding, K9, and executive protection services',              'SC-SAFETY', 'services', 141),
    ('SC-SAFETY-HSE',  'Health, Safety & Environment',    'HSE consulting, PPE, fire safety, and incident investigation',         'SC-SAFETY', 'services', 142),
    ('SC-SAFETY-COMP', 'Compliance & Regulatory',         'Third-party audits, certification, and compliance monitoring',         'SC-SAFETY', 'services', 143);

    -- ── Leaves: SC-ENV ────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-ENV-WASTE',  'Waste & Recycling',                'Waste segregation, recycling programmes, and circular economy',        'SC-ENV', 'services', 151),
    ('SC-ENV-CARBON', 'Carbon & Emissions',               'Carbon footprint measurement, offsets, and reporting',                 'SC-ENV', 'services', 152),
    ('SC-ENV-REMEDN', 'Environmental Remediation',        'Soil, water, and air remediation and decontamination',                 'SC-ENV', 'services', 153);

    -- ── Leaves: SC-OUTSRC ─────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-OUTSRC-BPO',    'Business Process Outsourcing',  'Finance, HR, and procurement process outsourcing',                    'SC-OUTSRC', 'services', 161),
    ('SC-OUTSRC-SHARED', 'Shared Service Centre',         'Centralised accounting, payroll, and IT help desk',                   'SC-OUTSRC', 'services', 162),
    ('SC-OUTSRC-TEMP',   'Temporary Staffing',            'Contingent workers, seasonal labour, and staff augmentation',          'SC-OUTSRC', 'services', 163);

    -- ── Leaves: SC-SUBS ───────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-SUBS-LIC',  'Software Licenses',                 'Named/concurrent licences, maintenance, and upgrade entitlements',     'SC-SUBS', 'services', 171),
    ('SC-SUBS-MEMB', 'Memberships & Associations',        'Industry bodies, chambers of commerce, and professional memberships',  'SC-SUBS', 'services', 172),
    ('SC-SUBS-PUB',  'Publications & Subscriptions',      'Journals, databases, news feeds, and research subscriptions',          'SC-SUBS', 'services', 173);

    -- ── STAGE C: UPSERT roots ────────────────────────────────────────────
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
                                            'pack', v_pack, 'version', v_version,
                                            'seeded_at', now()::text, 'container', true
                                        )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT leaves ───────────────────────────────────────────
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
                                            'pack', v_pack, 'version', v_version,
                                            'seeded_at', now()::text
                                        )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 77 THEN
        RAISE EXCEPTION '[020_base] Expected 77 rows (17 roots + 60 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND parent_id IS NULL
          AND metadata->'_seed'->>'pack' = v_pack) <> 17 THEN
        RAISE EXCEPTION '[020_base] Expected 17 root categories, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND parent_id IS NULL
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[020_base] Layer A loaded: % total (% roots, % leaves)',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND parent_id IS NULL
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND parent_id IS NOT NULL
           AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
