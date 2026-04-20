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
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
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
        updated_by = v_su;

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
        updated_by = v_su;

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
