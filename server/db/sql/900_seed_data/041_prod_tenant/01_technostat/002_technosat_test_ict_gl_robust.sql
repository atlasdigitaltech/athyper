-- ============================================================================
-- TECHNOSTAT — ROBUST ICT CHART OF ACCOUNTS (IFRS)
-- ============================================================================
-- File:     211_technostat_ict_gl_robust.sql
-- Schema:   master.gl_account
-- Target:   COA-IFRS for company code SDTX (Satellites for DT)
-- Accounts: ~280 GL accounts (5 L1 + ~45 L2 + ~230 L3)
-- IFRS:     IAS 1 presentation, IFRS 15 revenue, IFRS 16 leases,
--           IAS 38 intangibles, IAS 36 impairment, IAS 37 provisions,
--           IFRS 9 financial instruments
-- Idempotent: ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE
-- ============================================================================
--
-- DESIGN PRINCIPLES:
--
--   1. REVENUE by IFRS 15 performance obligation type — not by department.
--      Each L3 revenue account maps 1:1 to a recognition pattern.
--
--   2. COST OF SERVICES mirrors revenue for stream-level margin analysis.
--      "What's our margin on managed SOC vs. DC build-outs vs. SaaS?"
--
--   3. ACCUMULATED DEPRECIATION in a dedicated L2 header (contra-asset)
--      matching the ATHYPER IFRS pattern. Separate from gross FA.
--
--   4. CONTRACT ASSETS & LIABILITIES are first-class L2 headers —
--      not buried inside Other Receivables / Other Liabilities.
--
--   5. R&D EXPENSE as a distinct L2 expense header. IAS 38 requires
--      disclosure of total research & development costs; a separate
--      header makes this a trial-balance pull, not a reclass exercise.
--
--   6. INTERCOMPANY in dedicated L2 headers (both asset & liability side).
--      Eliminates ambiguity during consolidation.
--
--   7. Every L3 posting account carries group_map in metadata for
--      automatic consolidation mapping to COA-IFRS-GROUP.
--
-- SERVICE LINE MAPPING (from company portfolio):
--   DC Solutions       → ICT-R-PROJ-DC, ICT-E-COS-DC
--   Network Solutions  → ICT-R-PROJ-NET, ICT-E-COS-NET
--   NOC / Command Ctr  → ICT-R-PROJ-NOC, ICT-R-MSVC-NOC
--   SOC / Cybersecurity→ ICT-R-PROJ-CYBER, ICT-R-MSVC-SOC
--   Resourcing         → ICT-R-RES-*
--   Consulting         → ICT-R-PROJ-CONSULT, ICT-R-PROJ-ITIL
--   Software Dev       → ICT-R-PROJ-SWDEV, ICT-R-PROJ-MOBILE
--   Smart Solutions    → ICT-R-PROJ-SMART, ICT-R-PROJ-BMS
--   SaaS Products      → ICT-R-SAAS-SUB (13 products)
--   Hardware Resale    → ICT-R-HW-*
-- ============================================================================


DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '211_technostat_ict_gl_robust';
    v_version text := '2.0.0';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_total   int;
    v_roots   int;
    v_posting int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'technosat-test';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION 'Tenant technosat-test not found';
    END IF;

    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS';
    IF v_coa_id IS NULL THEN
        RAISE EXCEPTION 'Chart COA-IFRS not found';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
    ));

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
        group_map      text
    ) ON COMMIT DROP;


    -- ╔════════════════════════════════════════════════════════════════════╗
    -- ║  L1: CLASS ROOTS (5)                                             ║
    -- ╚════════════════════════════════════════════════════════════════════╝

    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('ICT-A', 'Assets',      NULL, 1, 'asset',     'header', 'debit',  1000),
    ('ICT-L', 'Liabilities', NULL, 1, 'liability', 'header', 'credit', 2000),
    ('ICT-Q', 'Equity',      NULL, 1, 'equity',    'header', 'credit', 3000),
    ('ICT-R', 'Revenue',     NULL, 1, 'income',    'header', 'credit', 4000),
    ('ICT-E', 'Expenses',    NULL, 1, 'expense',   'header', 'debit',  5000);


    -- ╔════════════════════════════════════════════════════════════════════╗
    -- ║  ASSETS                                                          ║
    -- ╚════════════════════════════════════════════════════════════════════╝

    -- ── L2: Asset headers (13) ──────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('ICT-A-CASH',   'Cash & Cash Equivalents',      'ICT-A', 2, 'asset',        'header', 'debit',  1100),
    ('ICT-A-AR',     'Trade Receivables',             'ICT-A', 2, 'asset',        'header', 'debit',  1200),
    ('ICT-A-OAR',    'Other Receivables & Prepaid',   'ICT-A', 2, 'asset',        'header', 'debit',  1300),
    ('ICT-A-CONTRACT','Contract Assets (IFRS 15)',    'ICT-A', 2, 'asset',        'header', 'debit',  1400),
    ('ICT-A-INV',    'Inventory',                     'ICT-A', 2, 'asset',        'header', 'debit',  1500),
    ('ICT-A-FA',     'Property & Equipment (Gross)',  'ICT-A', 2, 'asset',        'header', 'debit',  1600),
    ('ICT-A-ADEP',   'Accumulated Depreciation',      'ICT-A', 2, 'contra_asset', 'header', 'credit', 1700),
    ('ICT-A-INTAN',  'Intangible Assets (Gross)',     'ICT-A', 2, 'asset',        'header', 'debit',  1800),
    ('ICT-A-AAMORT', 'Accumulated Amortisation',      'ICT-A', 2, 'contra_asset', 'header', 'credit', 1850),
    ('ICT-A-ROU',    'Right-of-Use Assets',           'ICT-A', 2, 'asset',        'header', 'debit',  1900),
    ('ICT-A-ICR',    'Intercompany Receivables',      'ICT-A', 2, 'asset',        'header', 'debit',  1950),
    ('ICT-A-DTAX',   'Deferred Tax Asset',            'ICT-A', 2, 'asset',        'header', 'debit',  1970),
    ('ICT-A-OTHER',  'Other Non-current Assets',      'ICT-A', 2, 'asset',        'header', 'debit',  1980);

    -- ── L3: Cash & Cash Equivalents ─────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-CASH-MAIN',     'Main Operating Account (SAR)',    'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1110, 'GRP-A-CASH-OPER'),
    ('ICT-A-CASH-USD',      'USD Operating Account',           'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1112, 'GRP-A-CASH-OPER'),
    ('ICT-A-CASH-EGP',      'EGP Operating Account',           'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1114, 'GRP-A-CASH-OPER'),
    ('ICT-A-CASH-PAYROLL',  'Payroll Account',                 'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1116, 'GRP-A-CASH-OPER'),
    ('ICT-A-CASH-ESCROW',   'Project Escrow / LC Account',    'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1118, 'GRP-A-CASH-OPER'),
    ('ICT-A-CASH-GATEWAY',  'Payment Gateway Settlement',     'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1120, 'GRP-A-CASH-OPER'),
    ('ICT-A-CASH-PETTY',    'Petty Cash',                     'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1130, 'GRP-A-CASH-PETTY'),
    ('ICT-A-CASH-FD',       'Fixed Deposits (<3 months)',     'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1140, 'GRP-A-CASH-BANK'),
    ('ICT-A-CASH-FDLT',     'Fixed Deposits (>3 months)',     'ICT-A-CASH', 3, 'asset', 'posting', 'debit', 1150, 'GRP-A-CASH-BANK');

    -- ── L3: Trade Receivables ───────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('ICT-A-AR-TRADE',      'Trade Receivables — External',   'ICT-A-AR', 3, 'asset',        'posting', 'debit',  'ar', 1210, 'GRP-A-AR-TRADE'),
    ('ICT-A-AR-GOV',        'Trade Receivables — Government', 'ICT-A-AR', 3, 'asset',        'posting', 'debit',  'ar', 1215, 'GRP-A-AR-TRADE'),
    ('ICT-A-AR-RET',        'Retention Receivable',           'ICT-A-AR', 3, 'asset',        'posting', 'debit',  'ar', 1220, 'GRP-A-AR-TRADE'),
    ('ICT-A-AR-UNBILLED',   'Unbilled Revenue',               'ICT-A-AR', 3, 'asset',        'posting', 'debit',  NULL,       1230, 'GRP-A-AR-TRADE'),
    ('ICT-A-AR-NOTES',      'Notes Receivable',               'ICT-A-AR', 3, 'asset',        'posting', 'debit',  NULL,       1235, 'GRP-A-AR-TRADE'),
    ('ICT-A-AR-CHEQUE',     'Cheques Under Collection',       'ICT-A-AR', 3, 'asset',        'posting', 'debit',  NULL,       1238, 'GRP-A-AR-TRADE'),
    ('ICT-A-AR-ECL',        'ECL Allowance (IFRS 9)',         'ICT-A-AR', 3, 'contra_asset', 'posting', 'credit', NULL,       1240, 'GRP-A-AR-ALLOW');

    -- ── L3: Other Receivables & Prepaid ─────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-OAR-ADVSUPP',   'Advances to Suppliers',           'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1310, 'GRP-A-OAR-ADVANCE'),
    ('ICT-A-OAR-ADVEMP',    'Employee Advances & Loans',       'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1315, 'GRP-A-OAR-ADVANCE'),
    ('ICT-A-OAR-PREPRENT',  'Prepaid Rent',                    'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1320, 'GRP-A-OAR-PREPAY'),
    ('ICT-A-OAR-PREPINS',   'Prepaid Insurance',               'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1322, 'GRP-A-OAR-PREPAY'),
    ('ICT-A-OAR-PREPLIC',   'Prepaid Software Licenses',       'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1324, 'GRP-A-OAR-PREPAY'),
    ('ICT-A-OAR-PREPCLOUD', 'Prepaid Cloud / Hosting',         'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1326, 'GRP-A-OAR-PREPAY'),
    ('ICT-A-OAR-PREPMAINT', 'Prepaid Maintenance Contracts',   'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1328, 'GRP-A-OAR-PREPAY'),
    ('ICT-A-OAR-PREPOTHER', 'Prepaid Other',                   'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1329, 'GRP-A-OAR-PREPAY'),
    ('ICT-A-OAR-DEPOSIT',   'Security Deposits',               'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1330, 'GRP-A-OAR-DEPOSIT'),
    ('ICT-A-OAR-BIDBOND',   'Bid Bond Deposits',               'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1332, 'GRP-A-OAR-DEPOSIT'),
    ('ICT-A-OAR-PERFBOND',  'Performance Bond Deposits',       'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1334, 'GRP-A-OAR-DEPOSIT'),
    ('ICT-A-OAR-VATINPUT',  'VAT Input Receivable',            'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1340, 'GRP-L-TAX-VAT-IN'),
    ('ICT-A-OAR-WHTRECOV',  'WHT Recoverable',                'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1345, 'GRP-A-OAR-ADVANCE'),
    ('ICT-A-OAR-ACCRINT',   'Accrued Interest Receivable',     'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1350, 'GRP-A-OAR-ADVANCE'),
    ('ICT-A-OAR-SUNDRY',    'Sundry Receivables',              'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1360, 'GRP-A-OAR-ADVANCE'),
    ('ICT-A-OAR-CLEARING',  'Clearing / Suspense',             'ICT-A-OAR', 3, 'asset', 'posting', 'debit', 1390, 'GRP-A-OAR-ADVANCE');

    -- ── L3: Contract Assets (IFRS 15) ───────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-A-CA-DCNET',    'Contract Asset — DC & Network',    'ICT-A-CONTRACT', 3, 'asset', 'posting', 'debit', 1410, 'GRP-A-OAR-ADVANCE',
     'Revenue recognised over time (POC) exceeding billing. Data center, network, cabling projects.'),
    ('ICT-A-CA-SMART',    'Contract Asset — Smart Solutions',  'ICT-A-CONTRACT', 3, 'asset', 'posting', 'debit', 1415, 'GRP-A-OAR-ADVANCE',
     'BMS, access control, digital signage, IPTV, security gate projects.'),
    ('ICT-A-CA-SWDEV',    'Contract Asset — Software Dev',     'ICT-A-CONTRACT', 3, 'asset', 'posting', 'debit', 1420, 'GRP-A-OAR-ADVANCE',
     'Custom app development, web/mobile, e-services, systems integration.'),
    ('ICT-A-CA-CYBER',    'Contract Asset — Cybersecurity',    'ICT-A-CONTRACT', 3, 'asset', 'posting', 'debit', 1425, 'GRP-A-OAR-ADVANCE',
     'Pen testing, SOC build, SIEM deployment, vulnerability assessment projects.'),
    ('ICT-A-CA-CONSULT',  'Contract Asset — Consulting',       'ICT-A-CONTRACT', 3, 'asset', 'posting', 'debit', 1430, 'GRP-A-OAR-ADVANCE',
     'ITIL advisory, enterprise architecture, network audit, IT strategy.'),
    ('ICT-A-CA-COSTCAP',  'Contract Cost — Capitalised',       'ICT-A-CONTRACT', 3, 'asset', 'posting', 'debit', 1440, 'GRP-A-OAR-ADVANCE',
     'IFRS 15 para 91-98: incremental cost of obtaining a contract (sales commissions) and fulfilment costs.'),
    ('ICT-A-CA-AMORT',    'Contract Cost — Amortisation',      'ICT-A-CONTRACT', 3, 'contra_asset', 'posting', 'credit', 1445, 'GRP-A-OAR-ADVANCE',
     'Accumulated amortisation of capitalised contract costs.');

    -- ── L3: Inventory ───────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map, description) VALUES
    ('ICT-A-INV-SERVER',   'Servers & Storage',              'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1510, 'GRP-A-INV-TRADE',
     'Dell, HP, Lenovo servers; SAN/NAS storage arrays held for resale in DC/network projects.'),
    ('ICT-A-INV-NETWORK',  'Network Equipment',              'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1515, 'GRP-A-INV-TRADE',
     'Switches, routers, firewalls, IPS, WAF, load balancers, wireless APs/controllers.'),
    ('ICT-A-INV-DC',       'Data Center Equipment',          'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1520, 'GRP-A-INV-TRADE',
     'Racks, PDUs, UPS, ATS, generators, cooling units (in-row, immersion), raised floor, containment.'),
    ('ICT-A-INV-CABLING',  'Cabling & Connectivity',        'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1525, 'GRP-A-INV-TRADE',
     'Fiber optic cable, UTP cable, patch panels, trays, connectors.'),
    ('ICT-A-INV-SECURITY', 'Security Equipment',             'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1530, 'GRP-A-INV-TRADE',
     'CCTV cameras, NVR, access control readers, turnstiles, X-ray, metal detectors.'),
    ('ICT-A-INV-SMART',    'Smart Solution Equipment',       'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1535, 'GRP-A-INV-TRADE',
     'BMS controllers, sensors, digital signage, kiosks, IPTV encoders, AV equipment, smart parking.'),
    ('ICT-A-INV-NOC',      'NOC / Video Wall Equipment',    'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1540, 'GRP-A-INV-TRADE',
     'LED video walls, commercial screens, projectors, NOC furniture, smart boards.'),
    ('ICT-A-INV-UC',       'Unified Communications Equip',  'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1545, 'GRP-A-INV-TRADE',
     'IP phones, video conference units, call center gateways, CRM appliances.'),
    ('ICT-A-INV-POWER',    'AQT Power Saver Units',         'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1550, 'GRP-A-INV-FG',
     'Voltage regulator units: Small (100-200A), Medium (300-400A), Big (500-800A), Mega (>1000A).'),
    ('ICT-A-INV-FIRE',     'Fire Alarm & Suppression',      'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1555, 'GRP-A-INV-TRADE',
     'Fire alarm panels, detectors, suppression systems (FM-200, Novec) for data centers.'),
    ('ICT-A-INV-SPARE',    'Spare Parts & Consumables',     'ICT-A-INV', 3, 'asset', 'posting', 'debit', 'inventory', 1560, 'GRP-A-INV-RAW',
     'Replacement parts, SFP modules, patch cords, labels, mounting hardware.'),
    ('ICT-A-INV-TRANSIT',  'Goods in Transit',              'ICT-A-INV', 3, 'asset', 'posting', 'debit', NULL,        1570, 'GRP-A-INV-RAW',
     'Equipment ordered and shipped but not yet received at warehouse.'),
    ('ICT-A-INV-NRV',      'Inventory NRV Allowance',       'ICT-A-INV', 3, 'contra_asset', 'posting', 'credit', NULL, 1590, 'GRP-A-INV-RAW',
     'Write-down for obsolete / slow-moving equipment (superseded models, end-of-life).');

    -- ── L3: Property & Equipment (Gross) ────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('ICT-A-FA-LAB',      'Lab & Demo Equipment',          'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1610, 'GRP-A-FA-PLANT'),
    ('ICT-A-FA-DCOWN',    'Own Data Center Equipment',     'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1615, 'GRP-A-FA-PLANT'),
    ('ICT-A-FA-IT',       'IT Equipment — Internal',       'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1620, 'GRP-A-FA-IT'),
    ('ICT-A-FA-MOBILE',   'Mobile Devices — Field',        'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1625, 'GRP-A-FA-IT'),
    ('ICT-A-FA-FURN',     'Furniture & Fixtures',          'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1630, 'GRP-A-FA-FURN'),
    ('ICT-A-FA-VEH',      'Vehicles',                      'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1640, 'GRP-A-FA-VEH'),
    ('ICT-A-FA-LHI',      'Leasehold Improvements',        'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1650, 'GRP-A-FA-BLDG'),
    ('ICT-A-FA-TOOLS',    'Tools & Test Equipment',        'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1660, 'GRP-A-FA-PLANT'),
    ('ICT-A-FA-AV',       'AV & Presentation Equipment',   'ICT-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1665, 'GRP-A-FA-PLANT'),
    ('ICT-A-FA-CWIP',     'Capital Work in Progress',      'ICT-A-FA', 3, 'asset', 'posting', 'debit', NULL,    1690, 'GRP-A-FA-CWIP');

    -- ── L3: Accumulated Depreciation ────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-ADEP-LAB',    'Accum Depr — Lab & Demo',       'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1710, 'GRP-A-DEP-PLANT'),
    ('ICT-A-ADEP-DCOWN',  'Accum Depr — Own DC Equip',     'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1715, 'GRP-A-DEP-PLANT'),
    ('ICT-A-ADEP-IT',     'Accum Depr — IT Equipment',     'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1720, 'GRP-A-DEP-IT'),
    ('ICT-A-ADEP-MOBILE', 'Accum Depr — Mobile Devices',   'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1725, 'GRP-A-DEP-IT'),
    ('ICT-A-ADEP-FURN',   'Accum Depr — Furniture',        'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1730, 'GRP-A-DEP-FURN'),
    ('ICT-A-ADEP-VEH',    'Accum Depr — Vehicles',         'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1740, 'GRP-A-DEP-VEH'),
    ('ICT-A-ADEP-LHI',    'Accum Depr — LHI',              'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1750, 'GRP-A-DEP-BLDG'),
    ('ICT-A-ADEP-TOOLS',  'Accum Depr — Tools',            'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1760, 'GRP-A-DEP-PLANT'),
    ('ICT-A-ADEP-AV',     'Accum Depr — AV Equipment',     'ICT-A-ADEP', 3, 'contra_asset', 'posting', 'credit', 1765, 'GRP-A-DEP-PLANT');

    -- ── L3: Intangible Assets (Gross) ───────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-A-IA-MEETPLUS', 'Dev Cost — Meeting+',            'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1801, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Meeting+ executive task/meeting management app.'),
    ('ICT-A-IA-MAWID',   'Dev Cost — Mawid',               'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1802, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Mawid meeting request automation platform.'),
    ('ICT-A-IA-MUSANED', 'Dev Cost — Musaned',              'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1803, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Musaned technical support & helpdesk system.'),
    ('ICT-A-IA-ONECLICK','Dev Cost — OneClick',             'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1804, 'GRP-A-IA-SW', 'IAS 38 capitalised development: OneClick enterprise management (HR, Finance, Procurement).'),
    ('ICT-A-IA-MERSAL',  'Dev Cost — Mersal',               'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1805, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Mersal correspondence & workflow management.'),
    ('ICT-A-IA-PASSET',  'Dev Cost — Private Asset',        'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1806, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Private Asset management system with 3D viewing.'),
    ('ICT-A-IA-JAMEATY', 'Dev Cost — Jameaty',              'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1807, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Jameaty faculty/university management system.'),
    ('ICT-A-IA-NAQEL',   'Dev Cost — Naqel',                'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1808, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Naqel fleet management & tracking system.'),
    ('ICT-A-IA-MAHMIYAT','Dev Cost — Mahmiyat',             'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1809, 'GRP-A-IA-SW', 'IAS 38 capitalised development: Mahmiyat nature reserve & ecotourism management (AI-powered).'),
    ('ICT-A-IA-PAYGW',   'Dev Cost — Payment Gateway',      'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1810, 'GRP-A-IA-SW', 'IAS 38 capitalised development: unified e-payment gateway platform.'),
    ('ICT-A-IA-SMSGW',   'Dev Cost — SMS Gateway',          'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1811, 'GRP-A-IA-SW', 'IAS 38 capitalised development: unified SMS notification & alert gateway.'),
    ('ICT-A-IA-ESPORT',  'Dev Cost — E-Sport',              'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1812, 'GRP-A-IA-SW', 'IAS 38 capitalised development: E-Sport data & statistics management platform.'),
    ('ICT-A-IA-PLATFORM','Dev Cost — Shared Platform',       'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1815, 'GRP-A-IA-SW', 'Common platform components shared across products (auth, API layer, notification engine).'),
    ('ICT-A-IA-RESEARCH','Research Costs (expensed)',        'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1818, 'GRP-A-IA-SW', 'IAS 38 para 54: research phase costs — immediately expensed. Tracked here before write-off.'),
    ('ICT-A-IA-LICACQ',  'Acquired Software Licenses',      'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1820, 'GRP-A-IA-SW', 'Third-party perpetual licenses capitalised (Splunk, Oracle, SAP, etc.).'),
    ('ICT-A-IA-PATENT',  'Patents & Trademarks',            'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1825, 'GRP-A-IA-SW', 'Registered IP: product trademarks, technology patents.'),
    ('ICT-A-IA-CUSTREL', 'Customer Relationships',           'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1830, 'GRP-A-IA-GW', 'Intangible recognised on business combination: customer contracts & relationships.'),
    ('ICT-A-IA-GW',      'Goodwill',                         'ICT-A-INTAN', 3, 'asset', 'posting', 'debit', 1840, 'GRP-A-IA-GW', 'Goodwill arising from business combinations.');

    -- ── L3: Accumulated Amortisation ────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-AM-PROD',    'Accum Amort — Products',          'ICT-A-AAMORT', 3, 'contra_asset', 'posting', 'credit', 1851, 'GRP-A-IA-AMORT'),
    ('ICT-A-AM-LICACQ',  'Accum Amort — Acquired Lic',     'ICT-A-AAMORT', 3, 'contra_asset', 'posting', 'credit', 1852, 'GRP-A-IA-AMORT'),
    ('ICT-A-AM-PATENT',  'Accum Amort — Patents',           'ICT-A-AAMORT', 3, 'contra_asset', 'posting', 'credit', 1853, 'GRP-A-IA-AMORT'),
    ('ICT-A-AM-CUSTREL', 'Accum Amort — Cust Rel',         'ICT-A-AAMORT', 3, 'contra_asset', 'posting', 'credit', 1854, 'GRP-A-IA-AMORT');

    -- ── L3: ROU Assets ──────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-ROU-OFFICE',  'ROU — Office Lease',             'ICT-A-ROU', 3, 'asset',        'posting', 'debit',  1910, 'GRP-A-ROU-PROP'),
    ('ICT-A-ROU-DC',      'ROU — DC Colocation Lease',     'ICT-A-ROU', 3, 'asset',        'posting', 'debit',  1915, 'GRP-A-ROU-PROP'),
    ('ICT-A-ROU-VEH',     'ROU — Vehicle Lease',            'ICT-A-ROU', 3, 'asset',        'posting', 'debit',  1920, 'GRP-A-ROU-EQUIP'),
    ('ICT-A-ROU-EQUIP',   'ROU — Equipment Lease',          'ICT-A-ROU', 3, 'asset',        'posting', 'debit',  1925, 'GRP-A-ROU-EQUIP'),
    ('ICT-A-ROU-ADEP',    'ROU Accumulated Depreciation',   'ICT-A-ROU', 3, 'contra_asset', 'posting', 'credit', 1930, 'GRP-A-ROU-AMORT');

    -- ── L3: IC Receivables ──────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-ICR-TRADE',  'IC Receivable — Trade',           'ICT-A-ICR', 3, 'asset', 'posting', 'debit', 1951, 'GRP-A-ICR-TRADE'),
    ('ICT-A-ICR-LOAN',   'IC Receivable — Loan',            'ICT-A-ICR', 3, 'asset', 'posting', 'debit', 1955, 'GRP-A-ICR-LOAN'),
    ('ICT-A-ICR-MGMT',   'IC Mgmt Fee Receivable',          'ICT-A-ICR', 3, 'asset', 'posting', 'debit', 1958, 'GRP-A-ICR-TRADE');

    -- ── L3: Deferred Tax Asset ──────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-DTA-MAIN',   'Deferred Tax Asset',              'ICT-A-DTAX', 3, 'asset', 'posting', 'debit', 1971, 'GRP-A-DTAX');

    -- ── L3: Other Non-current ───────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-A-OTH-INVEST', 'Long-term Investments',           'ICT-A-OTHER', 3, 'asset', 'posting', 'debit', 1981, 'GRP-A-OAR-DEPOSIT'),
    ('ICT-A-OTH-LTDEP',  'Long-term Deposits',              'ICT-A-OTHER', 3, 'asset', 'posting', 'debit', 1985, 'GRP-A-OAR-DEPOSIT');


    -- ╔════════════════════════════════════════════════════════════════════╗
    -- ║  LIABILITIES                                                     ║
    -- ╚════════════════════════════════════════════════════════════════════╝

    -- ── L2: Liability headers (10) ──────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('ICT-L-AP',      'Trade Payables',                'ICT-L', 2, 'liability', 'header', 'credit', 2100),
    ('ICT-L-ACCR',    'Accruals & Provisions',         'ICT-L', 2, 'liability', 'header', 'credit', 2200),
    ('ICT-L-TAX',     'Tax Payables',                  'ICT-L', 2, 'liability', 'header', 'credit', 2300),
    ('ICT-L-EMP',     'Employee Liabilities',          'ICT-L', 2, 'liability', 'header', 'credit', 2400),
    ('ICT-L-CONTR',   'Contract Liabilities (IFRS 15)','ICT-L', 2, 'liability', 'header', 'credit', 2500),
    ('ICT-L-LEASE',   'Lease Liabilities (IFRS 16)',   'ICT-L', 2, 'liability', 'header', 'credit', 2600),
    ('ICT-L-BORROW',  'Borrowings',                    'ICT-L', 2, 'liability', 'header', 'credit', 2700),
    ('ICT-L-ICP',     'Intercompany Payables',         'ICT-L', 2, 'liability', 'header', 'credit', 2800),
    ('ICT-L-DTAX',    'Deferred Tax Liability',        'ICT-L', 2, 'liability', 'header', 'credit', 2850),
    ('ICT-L-OTHER',   'Other Liabilities',             'ICT-L', 2, 'liability', 'header', 'credit', 2900);

    -- ── L3: Trade Payables ──────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('ICT-L-AP-TRADE',    'Trade Payables — External',      'ICT-L-AP', 3, 'liability', 'posting', 'credit', 'ap', 2110, 'GRP-L-AP-TRADE'),
    ('ICT-L-AP-SUBCON',   'Subcontractor Payable',          'ICT-L-AP', 3, 'liability', 'posting', 'credit', 'ap', 2115, 'GRP-L-AP-TRADE'),
    ('ICT-L-AP-RET',      'Retention Payable',              'ICT-L-AP', 3, 'liability', 'posting', 'credit', 'ap', 2120, 'GRP-L-AP-TRADE'),
    ('ICT-L-AP-NOTES',    'Notes Payable',                  'ICT-L-AP', 3, 'liability', 'posting', 'credit', NULL,       2125, 'GRP-L-AP-TRADE'),
    ('ICT-L-AP-GRACCRUAL','GR/IR Accrual',                  'ICT-L-AP', 3, 'liability', 'posting', 'credit', NULL,       2130, 'GRP-L-AP-TRADE');

    -- ── L3: Accruals & Provisions ───────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-L-ACCR-EXP',      'Accrued Expenses — General',     'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2210, 'GRP-L-ACCR-GEN'),
    ('ICT-L-ACCR-CLOUD',    'Accrued Cloud / Hosting',        'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2215, 'GRP-L-ACCR-GEN'),
    ('ICT-L-ACCR-LICENSE',  'Accrued License Fees',           'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2218, 'GRP-L-ACCR-GEN'),
    ('ICT-L-ACCR-AUDIT',    'Accrued Audit & Legal',          'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2220, 'GRP-L-ACCR-GEN'),
    ('ICT-L-ACCR-WARRANT',  'Warranty Provision',             'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2230, 'GRP-L-ACCR-PROV'),
    ('ICT-L-ACCR-PROJLOSS', 'Onerous Contract Provision',    'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2235, 'GRP-L-ACCR-PROV'),
    ('ICT-L-ACCR-LEGAL',    'Legal & Litigation Provision',   'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2240, 'GRP-L-ACCR-PROV'),
    ('ICT-L-ACCR-RESTRUCT', 'Restructuring Provision',        'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2245, 'GRP-L-ACCR-PROV'),
    ('ICT-L-ACCR-OTHER',    'Other Provisions',                'ICT-L-ACCR', 3, 'liability', 'posting', 'credit', 2250, 'GRP-L-ACCR-PROV');

    -- ── L3: Tax Payables ────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-L-TAX-VAT',     'VAT Output Payable',             'ICT-L-TAX', 3, 'liability', 'posting', 'credit', 2310, 'GRP-L-TAX-VAT-OUT'),
    ('ICT-L-TAX-WHT',     'Withholding Tax Payable',        'ICT-L-TAX', 3, 'liability', 'posting', 'credit', 2320, 'GRP-L-TAX-WHT'),
    ('ICT-L-TAX-CIT',     'Corporate Income Tax Payable',   'ICT-L-TAX', 3, 'liability', 'posting', 'credit', 2330, 'GRP-L-TAX-CIT'),
    ('ICT-L-TAX-ZAKAT',   'Zakat Payable',                  'ICT-L-TAX', 3, 'liability', 'posting', 'credit', 2335, 'GRP-L-TAX-CIT'),
    ('ICT-L-TAX-SOCINS',  'Social Insurance Payable',       'ICT-L-TAX', 3, 'liability', 'posting', 'credit', 2340, 'GRP-L-TAX-CIT'),
    ('ICT-L-TAX-OTHER',   'Other Tax Payables',             'ICT-L-TAX', 3, 'liability', 'posting', 'credit', 2350, 'GRP-L-TAX-CIT');

    -- ── L3: Employee Liabilities ────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-L-EMP-SAL',     'Salaries Payable',                'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2410, 'GRP-L-EMP-SAL'),
    ('ICT-L-EMP-OT',      'Overtime Payable',                'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2412, 'GRP-L-EMP-SAL'),
    ('ICT-L-EMP-ALLOW',   'Allowances Payable',              'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2414, 'GRP-L-EMP-BEN'),
    ('ICT-L-EMP-BONUS',   'Bonus Accrual',                   'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2416, 'GRP-L-EMP-SAL'),
    ('ICT-L-EMP-COMM',    'Commission Accrual',              'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2418, 'GRP-L-EMP-SAL'),
    ('ICT-L-EMP-MEDICAL', 'Medical Insurance Payable',       'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2420, 'GRP-L-EMP-BEN'),
    ('ICT-L-EMP-LEAVE',   'Leave Provision',                 'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2430, 'GRP-L-EMP-LEAVE'),
    ('ICT-L-EMP-EOS',     'End of Service Provision',        'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2440, 'GRP-L-EMP-EOS'),
    ('ICT-L-EMP-AIRFARE', 'Air Ticket Provision',            'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2445, 'GRP-L-EMP-BEN'),
    ('ICT-L-EMP-OTHER',   'Other Employee Liabilities',      'ICT-L-EMP', 3, 'liability', 'posting', 'credit', 2450, 'GRP-L-EMP-BEN');

    -- ── L3: Contract Liabilities (IFRS 15) ──────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-L-CL-ADVPROJ',  'Customer Advance — Projects',      'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2510, 'GRP-L-DEF-ADV',
     'Milestone advances received for DC, network, smart solution, software projects.'),
    ('ICT-L-CL-ADVPROD',  'Customer Advance — Products',      'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2515, 'GRP-L-DEF-ADV',
     'Prepayment for equipment orders and AQT Power Saver units.'),
    ('ICT-L-CL-DEFSAAS',  'Deferred Revenue — SaaS',          'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2520, 'GRP-L-DEF-REV',
     'Annual/multi-year SaaS subscription fees billed upfront, recognised ratably.'),
    ('ICT-L-CL-DEFMSVC',  'Deferred Revenue — Managed Svc',   'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2525, 'GRP-L-DEF-REV',
     'Managed NOC, SOC, IT services prepayments recognised as stand-ready obligation.'),
    ('ICT-L-CL-DEFMAINT', 'Deferred Revenue — Maintenance',   'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2530, 'GRP-L-DEF-REV',
     'Annual maintenance and support contracts billed upfront.'),
    ('ICT-L-CL-DEFLIC',   'Deferred Revenue — Licenses',      'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2535, 'GRP-L-DEF-REV',
     'Multi-year on-prem license fees with support bundled, deferred portion.'),
    ('ICT-L-CL-DEFGW',    'Deferred Revenue — Gateway',       'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2540, 'GRP-L-DEF-REV',
     'Payment/SMS Gateway setup fees and prepaid transaction bundles.'),
    ('ICT-L-CL-DEFTRN',   'Deferred Revenue — Training',      'ICT-L-CONTR', 3, 'liability', 'posting', 'credit', 2545, 'GRP-L-DEF-REV',
     'Training course fees collected before delivery.');

    -- ── L3: Lease Liabilities ───────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-L-LL-CURR',    'Lease Liability — Current',        'ICT-L-LEASE', 3, 'liability', 'posting', 'credit', 2610, 'GRP-L-LEASE-CURR'),
    ('ICT-L-LL-NC',      'Lease Liability — Non-current',    'ICT-L-LEASE', 3, 'liability', 'posting', 'credit', 2620, 'GRP-L-LEASE-NC');

    -- ── L3: Borrowings ──────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-L-BW-OD',      'Bank Overdraft',                   'ICT-L-BORROW', 3, 'liability', 'posting', 'credit', 2710, 'GRP-L-DEBT-ST'),
    ('ICT-L-BW-STL',     'Short-term Loan',                  'ICT-L-BORROW', 3, 'liability', 'posting', 'credit', 2720, 'GRP-L-DEBT-ST'),
    ('ICT-L-BW-LTL',     'Long-term Loan',                   'ICT-L-BORROW', 3, 'liability', 'posting', 'credit', 2730, 'GRP-L-DEBT-LT'),
    ('ICT-L-BW-LTCURR',  'Current Portion of LT Loan',      'ICT-L-BORROW', 3, 'liability', 'posting', 'credit', 2735, 'GRP-L-DEBT-ST');

    -- ── L3: IC Payables ─────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-L-ICP-TRADE',  'IC Payable — Trade',               'ICT-L-ICP', 3, 'liability', 'posting', 'credit', 2810, 'GRP-L-AP-IC'),
    ('ICT-L-ICP-LOAN',   'IC Payable — Loan',                'ICT-L-ICP', 3, 'liability', 'posting', 'credit', 2820, 'GRP-L-AP-IC'),
    ('ICT-L-ICP-MGMT',   'IC Mgmt Fee Payable',              'ICT-L-ICP', 3, 'liability', 'posting', 'credit', 2830, 'GRP-L-AP-IC');

    -- ── L3: Deferred Tax Liability & Other ──────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-L-DTL-MAIN',   'Deferred Tax Liability',           'ICT-L-DTAX', 3, 'liability', 'posting', 'credit', 2851, 'GRP-L-DTL'),
    ('ICT-L-OTH-SUNDRY', 'Sundry Liabilities',               'ICT-L-OTHER', 3, 'liability', 'posting', 'credit', 2910, 'GRP-L-OTHL'),
    ('ICT-L-OTH-REFUND', 'Refund Liability (IFRS 15)',       'ICT-L-OTHER', 3, 'liability', 'posting', 'credit', 2920, 'GRP-L-OTHL');


    -- ╔════════════════════════════════════════════════════════════════════╗
    -- ║  EQUITY                                                          ║
    -- ╚════════════════════════════════════════════════════════════════════╝

    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('ICT-Q-CAP',  'Share Capital',        'ICT-Q', 2, 'equity', 'header', 'credit', 3100),
    ('ICT-Q-RES',  'Reserves',             'ICT-Q', 2, 'equity', 'header', 'credit', 3200),
    ('ICT-Q-RE',   'Retained Earnings',    'ICT-Q', 2, 'equity', 'header', 'credit', 3300),
    ('ICT-Q-OCI',  'OCI & Translation',    'ICT-Q', 2, 'equity', 'header', 'credit', 3400);

    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-Q-CAP-ISSUED',  'Issued Capital',                 'ICT-Q-CAP', 3, 'equity', 'posting', 'credit', 3110, 'GRP-Q-CAP-ISSUED'),
    ('ICT-Q-CAP-PREMIUM', 'Share Premium',                  'ICT-Q-CAP', 3, 'equity', 'posting', 'credit', 3120, 'GRP-Q-CAP-PREMIUM'),
    ('ICT-Q-RES-STAT',    'Statutory Reserve',              'ICT-Q-RES', 3, 'equity', 'posting', 'credit', 3210, 'GRP-Q-RE-OPENING'),
    ('ICT-Q-RES-GENERAL', 'General Reserve',                'ICT-Q-RES', 3, 'equity', 'posting', 'credit', 3220, 'GRP-Q-RE-OPENING'),
    ('ICT-Q-RE-OPENING',  'Retained Earnings — Opening',    'ICT-Q-RE',  3, 'equity',        'posting', 'credit', 3310, 'GRP-Q-RE-OPENING'),
    ('ICT-Q-RE-CURRENT',  'Current Year P&L',               'ICT-Q-RE',  3, 'equity',        'posting', 'credit', 3320, 'GRP-Q-RE-CY'),
    ('ICT-Q-RE-DIV',      'Dividends Declared',             'ICT-Q-RE',  3, 'contra_equity', 'posting', 'debit',  3330, 'GRP-Q-RE-DIV'),
    ('ICT-Q-OCI-FX',      'Foreign Currency Translation',   'ICT-Q-OCI', 3, 'equity', 'posting', 'credit', 3410, 'GRP-Q-OCI-FX'),
    ('ICT-Q-OCI-FVOCI',   'FVOCI Reserve (IFRS 9)',        'ICT-Q-OCI', 3, 'equity', 'posting', 'credit', 3420, 'GRP-Q-OCI-FX');


    -- ╔════════════════════════════════════════════════════════════════════╗
    -- ║  REVENUE — disaggregated by IFRS 15 performance obligation       ║
    -- ╚════════════════════════════════════════════════════════════════════╝

    -- ── L2: Revenue headers (8) ─────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('ICT-R-PROJ',  'Project Revenue',               'ICT-R', 2, 'income', 'header', 'credit', 4100),
    ('ICT-R-MSVC',  'Managed Services Revenue',      'ICT-R', 2, 'income', 'header', 'credit', 4200),
    ('ICT-R-SAAS',  'SaaS & License Revenue',        'ICT-R', 2, 'income', 'header', 'credit', 4300),
    ('ICT-R-RES',   'Resourcing Revenue',            'ICT-R', 2, 'income', 'header', 'credit', 4400),
    ('ICT-R-HW',    'Hardware & Equipment Revenue',  'ICT-R', 2, 'income', 'header', 'credit', 4500),
    ('ICT-R-OOI',   'Other Operating Income',        'ICT-R', 2, 'income', 'header', 'credit', 4600),
    ('ICT-R-FIN',   'Finance Income',                'ICT-R', 2, 'income', 'header', 'credit', 4700),
    ('ICT-R-ICR',   'Intercompany Revenue',          'ICT-R', 2, 'income', 'header', 'credit', 4800);

    -- ── L3: Project Revenue (over time — POC) ───────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-R-PROJ-DC',      'Revenue — DC Build & Design',     'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4110, 'GRP-R-SALES-PROJ',
     'Full DC lifecycle: design, power, UPS/ATS/generator, cooling (downflow/in-row/immersion), racks, containment, raised floor, fire alarm.'),
    ('ICT-R-PROJ-DCIM',    'Revenue — DCIM Deployment',       'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4112, 'GRP-R-SALES-PROJ',
     'DCIM software deployment: PDU management, humidity/temperature/water leak sensors.'),
    ('ICT-R-PROJ-MOBILITY','Revenue — Mobility DC',            'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4114, 'GRP-R-SALES-PROJ',
     'Containerised / modular mobile data center solutions.'),
    ('ICT-R-PROJ-NET',     'Revenue — Network Infrastructure', 'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4120, 'GRP-R-SALES-PROJ',
     'LAN/WAN/MAN, switches, routers, fiber/UTP cabling infrastructure.'),
    ('ICT-R-PROJ-NETSEC',  'Revenue — Network Security',      'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4122, 'GRP-R-SALES-PROJ',
     'Firewalls, IPS, WAF, DDoS protection, email security, 2FA, NAC, endpoint security, DLP.'),
    ('ICT-R-PROJ-WIRELESS','Revenue — Wireless Solutions',     'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4124, 'GRP-R-SALES-PROJ',
     'Wireless controllers, indoor/outdoor APs, secure broadband.'),
    ('ICT-R-PROJ-UC',      'Revenue — Unified Communications', 'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4126, 'GRP-R-SALES-PROJ',
     'IP telephony, video conference, CRM, call center, ticketing solutions.'),
    ('ICT-R-PROJ-SERVER',  'Revenue — Server & Storage',       'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4128, 'GRP-R-SALES-PROJ',
     'Application servers, storage arrays, migration, backup, DR solutions.'),
    ('ICT-R-PROJ-NOC',     'Revenue — NOC / Command Center',   'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4130, 'GRP-R-SALES-PROJ',
     'Video walls (LED/commercial/projector), NOC furniture, monitoring, CCTV, smart boards.'),
    ('ICT-R-PROJ-SMART',   'Revenue — Smart Solutions',        'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4140, 'GRP-R-SALES-PROJ',
     'BMS, smart meeting rooms, lighting/AC/blinds control, professional audio/display, digital signage, kiosks.'),
    ('ICT-R-PROJ-ACCESS',  'Revenue — Access & Surveillance',  'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4142, 'GRP-R-SALES-PROJ',
     'Smart cards, IP surveillance (video analytics, face recognition), video intercom, PA systems, IPTV.'),
    ('ICT-R-PROJ-SECGATE', 'Revenue — Security Gate Solutions', 'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4144, 'GRP-R-SALES-PROJ',
     'Glass gates, turnstiles, X-ray, metal detectors, tracking/counting/analysis.'),
    ('ICT-R-PROJ-PARKING', 'Revenue — Smart Parking',          'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4146, 'GRP-R-SALES-PROJ',
     'Smart parking management systems.'),
    ('ICT-R-PROJ-SWDEV',   'Revenue — Custom Software Dev',    'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4150, 'GRP-R-SALES-PROJ',
     'Web applications, web streaming, systems integration, e-services development.'),
    ('ICT-R-PROJ-MOBILE',  'Revenue — Mobile App Dev',         'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4152, 'GRP-R-SALES-PROJ',
     'Native and hybrid mobile applications, UI/UX design.'),
    ('ICT-R-PROJ-CYBER',   'Revenue — Cybersecurity Projects',  'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4160, 'GRP-R-SALES-PROJ',
     'Pen testing (network, web, mobile, device rules), SOC build, SIEM deployment (Splunk, ArcSight, QRadar, LogRhythm).'),
    ('ICT-R-PROJ-VULN',    'Revenue — Vulnerability Assessment','ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4162, 'GRP-R-SALES-PROJ',
     'Nessus scans, external risk assessment, cyber surveillance, white box testing.'),
    ('ICT-R-PROJ-CONSULT', 'Revenue — Business Consulting',    'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4170, 'GRP-R-SALES-SVC',
     'Business & technology consulting, IT strategy, 2030 initiative support.'),
    ('ICT-R-PROJ-ITIL',    'Revenue — ITIL & Architecture',    'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4172, 'GRP-R-SALES-SVC',
     'ITIL analysis/implementation, enterprise architecture office establishment.'),
    ('ICT-R-PROJ-AUDIT',   'Revenue — Network Audit',          'ICT-R-PROJ', 3, 'income', 'posting', 'credit', 4174, 'GRP-R-SALES-SVC',
     'Network infrastructure audit and assessment services.');

    -- ── L3: Managed Services Revenue (over time — stand-ready) ──────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-R-MSVC-NOC',     'Revenue — Managed NOC',            'ICT-R-MSVC', 3, 'income', 'posting', 'credit', 4210, 'GRP-R-SALES-SVC',
     'Network monitoring, DCIM operations, 24/7 NOC.'),
    ('ICT-R-MSVC-SOC',     'Revenue — Managed SOC',            'ICT-R-MSVC', 3, 'income', 'posting', 'credit', 4220, 'GRP-R-SALES-SVC',
     'SIEM monitoring, threat detection, incident response, real-time log analysis.'),
    ('ICT-R-MSVC-IT',      'Revenue — Managed IT',             'ICT-R-MSVC', 3, 'income', 'posting', 'credit', 4230, 'GRP-R-SALES-SVC',
     'Helpdesk, infrastructure management, backup management, patch management.'),
    ('ICT-R-MSVC-SUPPORT', 'Revenue — Maintenance & Support',  'ICT-R-MSVC', 3, 'income', 'posting', 'credit', 4240, 'GRP-R-SALES-SVC',
     'Annual maintenance contracts, SLA-based support, break-fix.'),
    ('ICT-R-MSVC-DC',      'Revenue — DC Operations',          'ICT-R-MSVC', 3, 'income', 'posting', 'credit', 4250, 'GRP-R-SALES-SVC',
     'Data center facility management, colocation management, environmental monitoring.');

    -- ── L3: SaaS & License Revenue ──────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-R-SAAS-SUB',     'Revenue — SaaS Subscriptions',    'ICT-R-SAAS', 3, 'income', 'posting', 'credit', 4310, 'GRP-R-SALES-SUB',
     'Cloud subscription revenue: Meeting+, Mawid, Musaned, OneClick, Mersal, Private Asset, Jameaty, Naqel, Mahmiyat, E-Sport.'),
    ('ICT-R-SAAS-LIC',     'Revenue — On-Prem Licenses',      'ICT-R-SAAS', 3, 'income', 'posting', 'credit', 4320, 'GRP-R-SALES-GOODS',
     'Perpetual license sales for on-premise deployments.'),
    ('ICT-R-SAAS-PAYGW',   'Revenue — Payment Gateway',       'ICT-R-SAAS', 3, 'income', 'posting', 'credit', 4330, 'GRP-R-SALES-SVC',
     'Payment Gateway transaction fees and setup revenue.'),
    ('ICT-R-SAAS-SMSGW',   'Revenue — SMS Gateway',           'ICT-R-SAAS', 3, 'income', 'posting', 'credit', 4335, 'GRP-R-SALES-SVC',
     'SMS Gateway message fees, balance top-ups, integration fees.'),
    ('ICT-R-SAAS-CUSTOM',  'Revenue — Customisation',         'ICT-R-SAAS', 3, 'income', 'posting', 'credit', 4340, 'GRP-R-SALES-SVC',
     'Product customisation, configuration, and integration services for SaaS customers.'),
    ('ICT-R-SAAS-HOSTING', 'Revenue — Hosting & Infra',       'ICT-R-SAAS', 3, 'income', 'posting', 'credit', 4350, 'GRP-R-SALES-SVC',
     'Dedicated hosting and infrastructure provision for on-prem/hybrid customers.');

    -- ── L3: Resourcing Revenue ──────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-R-RES-STAFF',    'Revenue — Staff Augmentation',    'ICT-R-RES', 3, 'income', 'posting', 'credit', 4410, 'GRP-R-SALES-SVC',
     'Outsourced engineers, developers, PMs — time & material billing.'),
    ('ICT-R-RES-MANAGED',  'Revenue — Managed Outsourcing',   'ICT-R-RES', 3, 'income', 'posting', 'credit', 4420, 'GRP-R-SALES-SVC',
     'Full team outsourcing with SLA, BPO services.'),
    ('ICT-R-RES-RECRUIT',  'Revenue — Recruitment Services',  'ICT-R-RES', 3, 'income', 'posting', 'credit', 4430, 'GRP-R-SALES-SVC',
     'Headhunting, permanent placement, payroll services.'),
    ('ICT-R-RES-TRAIN',    'Revenue — Training & Cert',       'ICT-R-RES', 3, 'income', 'posting', 'credit', 4440, 'GRP-R-SALES-SVC',
     'Technical training, certification prep, knowledge transfer.');

    -- ── L3: Hardware & Equipment Revenue (point in time) ────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-R-HW-NETWORK',  'Revenue — Network Equipment',      'ICT-R-HW', 3, 'income', 'posting', 'credit', 4510, 'GRP-R-SALES-GOODS'),
    ('ICT-R-HW-SERVER',   'Revenue — Server & Storage',       'ICT-R-HW', 3, 'income', 'posting', 'credit', 4515, 'GRP-R-SALES-GOODS'),
    ('ICT-R-HW-DC',       'Revenue — DC Equipment',           'ICT-R-HW', 3, 'income', 'posting', 'credit', 4520, 'GRP-R-SALES-GOODS'),
    ('ICT-R-HW-SMART',    'Revenue — Smart / AV Equipment',   'ICT-R-HW', 3, 'income', 'posting', 'credit', 4525, 'GRP-R-SALES-GOODS'),
    ('ICT-R-HW-POWER',    'Revenue — AQT Power Saver',        'ICT-R-HW', 3, 'income', 'posting', 'credit', 4530, 'GRP-R-SALES-GOODS'),
    ('ICT-R-HW-THIRDLIC', 'Revenue — 3rd Party License Resale','ICT-R-HW', 3, 'income', 'posting', 'credit', 4540, 'GRP-R-SALES-GOODS'),
    ('ICT-R-HW-DISC',     'Sales Discounts & Allowances',      'ICT-R-HW', 3, 'income', 'posting', 'debit',  4590, 'GRP-R-SALES-DISC'),
    ('ICT-R-HW-RET',      'Sales Returns',                     'ICT-R-HW', 3, 'income', 'posting', 'debit',  4595, 'GRP-R-SALES-DISC');

    -- ── L3: Other Operating Income ──────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-R-OOI-GAIN',    'Gain on Disposal',                 'ICT-R-OOI', 3, 'income', 'posting', 'credit', 4610, 'GRP-R-OOI-GAIN'),
    ('ICT-R-OOI-SCRAP',   'Scrap & Salvage Income',           'ICT-R-OOI', 3, 'income', 'posting', 'credit', 4620, 'GRP-R-OOI-MISC'),
    ('ICT-R-OOI-INSCLM',  'Insurance Claims Received',        'ICT-R-OOI', 3, 'income', 'posting', 'credit', 4630, 'GRP-R-OOI-MISC'),
    ('ICT-R-OOI-PENALTY',  'Penalty Income Received',          'ICT-R-OOI', 3, 'income', 'posting', 'credit', 4640, 'GRP-R-OOI-MISC'),
    ('ICT-R-OOI-MISC',    'Miscellaneous Income',             'ICT-R-OOI', 3, 'income', 'posting', 'credit', 4690, 'GRP-R-OOI-MISC');

    -- ── L3: Finance Income ──────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-R-FIN-INT',     'Interest Income',                   'ICT-R-FIN', 3, 'income', 'posting', 'credit', 4710, 'GRP-R-FIN-INT'),
    ('ICT-R-FIN-FX',      'Foreign Exchange Gain',             'ICT-R-FIN', 3, 'income', 'posting', 'credit', 4720, 'GRP-R-FIN-FX'),
    ('ICT-R-FIN-FV',      'Fair Value Gain',                   'ICT-R-FIN', 3, 'income', 'posting', 'credit', 4730, 'GRP-R-FIN-INT');

    -- ── L3: IC Revenue ──────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-R-ICR-SVCS',    'IC Service Revenue',                'ICT-R-ICR', 3, 'income', 'posting', 'credit', 4810, 'GRP-R-ICR-SVCS'),
    ('ICT-R-ICR-MGMT',    'IC Management Fee Income',          'ICT-R-ICR', 3, 'income', 'posting', 'credit', 4820, 'GRP-R-ICR-MGMT'),
    ('ICT-R-ICR-PROJ',    'IC Project Revenue',                'ICT-R-ICR', 3, 'income', 'posting', 'credit', 4830, 'GRP-R-ICR-SVCS'),
    ('ICT-R-ICR-LIC',     'IC License Revenue',                'ICT-R-ICR', 3, 'income', 'posting', 'credit', 4840, 'GRP-R-ICR-SVCS');


    -- ╔════════════════════════════════════════════════════════════════════╗
    -- ║  EXPENSES                                                        ║
    -- ╚════════════════════════════════════════════════════════════════════╝

    -- ── L2: Expense headers (10) ────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('ICT-E-COS',   'Cost of Services & Sales',     'ICT-E', 2, 'expense', 'header', 'debit', 5100),
    ('ICT-E-RD',    'Research & Development',        'ICT-E', 2, 'expense', 'header', 'debit', 5200),
    ('ICT-E-SM',    'Sales & Marketing',             'ICT-E', 2, 'expense', 'header', 'debit', 5300),
    ('ICT-E-GA',    'General & Administrative',      'ICT-E', 2, 'expense', 'header', 'debit', 5400),
    ('ICT-E-HR',    'HR & Payroll — Overhead',       'ICT-E', 2, 'expense', 'header', 'debit', 5500),
    ('ICT-E-DA',    'Depreciation & Amortisation',   'ICT-E', 2, 'expense', 'header', 'debit', 5600),
    ('ICT-E-FIN',   'Finance Costs',                 'ICT-E', 2, 'expense', 'header', 'debit', 5700),
    ('ICT-E-TAX',   'Tax Expense',                   'ICT-E', 2, 'expense', 'header', 'debit', 5800),
    ('ICT-E-ICE',   'Intercompany Expense',          'ICT-E', 2, 'expense', 'header', 'debit', 5850),
    ('ICT-E-OTHER', 'Other Expenses',                'ICT-E', 2, 'expense', 'header', 'debit', 5900);

    -- ── L3: Cost of Services & Sales — mirrors revenue streams ──────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-E-COS-DCLABOUR',  'Direct Labour — DC Projects',     'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5110, 'GRP-E-COGS-LABOUR',
     'Engineer salaries and contractor costs directly charged to data center projects.'),
    ('ICT-E-COS-NETLABOUR', 'Direct Labour — Network Projects', 'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5112, 'GRP-E-COGS-LABOUR',
     'Network engineer costs directly charged to LAN/WAN/security deployment projects.'),
    ('ICT-E-COS-SWLABOUR',  'Direct Labour — Software Dev',     'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5114, 'GRP-E-COGS-LABOUR',
     'Developer/QA salaries directly charged to custom software development projects.'),
    ('ICT-E-COS-SMTLABOUR', 'Direct Labour — Smart Solutions',  'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5116, 'GRP-E-COGS-LABOUR',
     'Technician/installer costs for BMS, access control, AV, digital signage projects.'),
    ('ICT-E-COS-CYBLABOUR', 'Direct Labour — Cybersecurity',    'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5118, 'GRP-E-COGS-LABOUR',
     'Security analyst costs for pen testing, SOC build, SIEM deployment projects.'),
    ('ICT-E-COS-SUB',       'Subcontractor Costs',              'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5120, 'GRP-E-COGS-SUB',
     'Third-party installers, MEP subcontractors, specialist consultants.'),
    ('ICT-E-COS-HWCOGS',    'Hardware / Equipment COGS',        'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5130, 'GRP-E-COGS-MAT',
     'Cost of network gear, servers, UPS, racks, cameras, sensors sold to customers.'),
    ('ICT-E-COS-LICENSE',   'Third-party License Cost',         'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5135, 'GRP-E-COGS-MAT',
     'Splunk, Nessus, firewall OEM licenses purchased for customer projects/resale.'),
    ('ICT-E-COS-CLOUD',     'Cloud & Hosting — Customer',      'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5140, 'GRP-E-COGS-OH',
     'AWS/Azure/GCP costs directly attributable to customer SaaS and managed services.'),
    ('ICT-E-COS-RESOURCE',  'Outsourced Staff Cost',            'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5145, 'GRP-E-COGS-LABOUR',
     'Salary, benefits, admin cost of staff placed at customer sites under resourcing contracts.'),
    ('ICT-E-COS-SMSGW',     'SMS Gateway Carrier Costs',       'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5148, 'GRP-E-COGS-MAT',
     'Bulk SMS charges from carriers — direct cost against SMS Gateway revenue.'),
    ('ICT-E-COS-PAYGW',     'Payment Gateway Processing',      'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5149, 'GRP-E-COGS-MAT',
     'Payment processor fees (Mada, Visa, MC) — direct cost against Payment Gateway revenue.'),
    ('ICT-E-COS-TRAVEL',    'Project Travel & Site Costs',     'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5150, 'GRP-E-COGS-OH',
     'Travel, accommodation, and site expenses directly chargeable to projects.'),
    ('ICT-E-COS-FREIGHT',   'Freight & Customs — Projects',   'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5155, 'GRP-E-COGS-FREIGHT',
     'Shipping, customs duties, and insurance for equipment imported for projects.'),
    ('ICT-E-COS-WARRANTY',  'Warranty & Rework Cost',          'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5160, 'GRP-E-COGS-OH',
     'Post-delivery defect rectification, replacement under warranty.'),
    ('ICT-E-COS-PROJLOSS',  'Onerous Contract Provision',      'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5165, 'GRP-E-COGS-OH',
     'IAS 37 provision for projects where unavoidable costs exceed expected benefits.'),
    ('ICT-E-COS-INVWD',     'Inventory Write-Down',             'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5170, 'GRP-E-COGS-MAT',
     'NRV write-down for obsolete/end-of-life equipment.'),
    ('ICT-E-COS-COSTCAP',   'Contract Cost Amortisation',      'ICT-E-COS', 3, 'expense', 'posting', 'debit', 5175, 'GRP-E-COGS-OH',
     'Amortisation of capitalised contract costs (IFRS 15 para 91-98).');

    -- ── L3: Research & Development ──────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map, description) VALUES
    ('ICT-E-RD-SAL',      'R&D Salaries & Benefits',          'ICT-E-RD', 3, 'expense', 'posting', 'debit', 5210, 'GRP-E-HR-SAL',
     'Developer salaries for product R&D not meeting IAS 38 capitalisation criteria.'),
    ('ICT-E-RD-CLOUD',    'R&D Cloud & Infrastructure',       'ICT-E-RD', 3, 'expense', 'posting', 'debit', 5220, 'GRP-E-SGA-IT',
     'Dev/test environments, CI/CD pipelines, sandbox infrastructure.'),
    ('ICT-E-RD-TOOLS',    'R&D Tools & Licenses',             'ICT-E-RD', 3, 'expense', 'posting', 'debit', 5230, 'GRP-E-SGA-IT',
     'IDE licenses, testing tools, AI/ML frameworks, prototyping tools.'),
    ('ICT-E-RD-EXTERN',   'External R&D Services',            'ICT-E-RD', 3, 'expense', 'posting', 'debit', 5240, 'GRP-E-SGA-PROF',
     'Contracted R&D: UX research, security testing of products, external code review.'),
    ('ICT-E-RD-AMORT',    'Amort of Capitalised Dev',         'ICT-E-RD', 3, 'expense', 'posting', 'debit', 5250, 'GRP-E-DA-AMORT',
     'Systematic amortisation of IAS 38 capitalised product development costs.');

    -- ── L3: Sales & Marketing ───────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-SM-SAL',      'Sales Team Salaries',              'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5310, 'GRP-E-SGA-SAL'),
    ('ICT-E-SM-COMM',     'Sales Commissions',                'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5315, 'GRP-E-SGA-SAL'),
    ('ICT-E-SM-MKTG',     'Marketing & Advertising',          'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5320, 'GRP-E-SGA-MKTG'),
    ('ICT-E-SM-DIGITAL',  'Digital Marketing & SEO',          'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5325, 'GRP-E-SGA-MKTG'),
    ('ICT-E-SM-EVENTS',   'Events, Exhibitions & Conferences','ICT-E-SM', 3, 'expense', 'posting', 'debit', 5330, 'GRP-E-SGA-MKTG'),
    ('ICT-E-SM-PRESALES', 'Pre-sales, POC & Demo Costs',     'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5335, 'GRP-E-SGA-MKTG'),
    ('ICT-E-SM-TRAVEL',   'Sales Travel & Entertainment',     'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5340, 'GRP-E-SGA-TRAVEL'),
    ('ICT-E-SM-PARTNER',  'Partner & Channel Costs',          'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5345, 'GRP-E-SGA-MKTG'),
    ('ICT-E-SM-BIDCOST',  'Bid & Tender Costs',               'ICT-E-SM', 3, 'expense', 'posting', 'debit', 5350, 'GRP-E-SGA-MKTG');

    -- ── L3: General & Administrative ────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-GA-RENT',     'Office Rent & Occupancy',           'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5410, 'GRP-E-SGA-RENT'),
    ('ICT-E-GA-UTIL',     'Utilities',                         'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5415, 'GRP-E-SGA-UTIL'),
    ('ICT-E-GA-LEGAL',    'Legal & Professional Fees',         'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5420, 'GRP-E-SGA-PROF'),
    ('ICT-E-GA-AUDIT',    'Audit & Assurance',                 'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5425, 'GRP-E-SGA-PROF'),
    ('ICT-E-GA-INS',      'Insurance',                         'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5430, 'GRP-E-SGA-INS'),
    ('ICT-E-GA-CYBERINS', 'Cyber Insurance',                   'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5432, 'GRP-E-SGA-INS'),
    ('ICT-E-GA-IT',       'IT Expense — Internal',             'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5435, 'GRP-E-SGA-IT'),
    ('ICT-E-GA-CLOUD',    'Cloud Tooling — Internal',          'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5438, 'GRP-E-SGA-IT'),
    ('ICT-E-GA-CERT',     'Certifications & Partnerships',     'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5440, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-OFFICE',   'Office Supplies & Printing',        'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5445, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-COURIER',  'Courier & Postage',                 'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5448, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-REPAIR',   'Repairs & Maintenance',             'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5450, 'GRP-E-SGA-REPAIR'),
    ('ICT-E-GA-SECURITY', 'Security Services',                 'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5455, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-CLEANING', 'Cleaning & Janitorial',             'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5458, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-VEHICLE',  'Vehicle Running Costs',             'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5460, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-LICENSE',  'Licence & Permit Fees',             'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5465, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-SUBS',     'Subscriptions & Memberships',       'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5468, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-DONATE',   'Donations & CSR',                   'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5470, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-TRAVEL',   'General Travel',                    'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5475, 'GRP-E-SGA-TRAVEL'),
    ('ICT-E-GA-BANK',     'Bank Charges — Admin',              'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5480, 'GRP-E-FIN-BANK'),
    ('ICT-E-GA-PENALTY',  'Penalties & Fines',                 'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5485, 'GRP-E-SGA-OFFICE'),
    ('ICT-E-GA-MISC',     'Miscellaneous G&A',                 'ICT-E-GA', 3, 'expense', 'posting', 'debit', 5490, 'GRP-E-SGA-OFFICE');

    -- ── L3: HR & Payroll — Overhead ─────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-HR-SAL',      'Salaries — Overhead',              'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5510, 'GRP-E-HR-SAL'),
    ('ICT-E-HR-OT',       'Overtime',                         'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5512, 'GRP-E-HR-SAL'),
    ('ICT-E-HR-ALLOW',    'Allowances (Housing/Transport)',    'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5515, 'GRP-E-HR-BEN'),
    ('ICT-E-HR-BONUS',    'Bonuses & Incentives',              'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5518, 'GRP-E-HR-SAL'),
    ('ICT-E-HR-SOCSEC',   'Social Insurance',                  'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5520, 'GRP-E-HR-BEN'),
    ('ICT-E-HR-MEDICAL',  'Medical Insurance',                 'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5525, 'GRP-E-HR-BEN'),
    ('ICT-E-HR-EOS',      'End of Service Expense',            'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5530, 'GRP-E-HR-BEN'),
    ('ICT-E-HR-LEAVE',    'Leave Expense',                     'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5535, 'GRP-E-HR-BEN'),
    ('ICT-E-HR-AIRFARE',  'Air Ticket Expense',                'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5538, 'GRP-E-HR-BEN'),
    ('ICT-E-HR-TRAIN',    'Training & Development',            'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5540, 'GRP-E-HR-TRAIN'),
    ('ICT-E-HR-TECHCERT', 'Technical Certifications',          'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5542, 'GRP-E-HR-TRAIN'),
    ('ICT-E-HR-RECRUIT',  'Recruitment Costs',                 'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5545, 'GRP-E-HR-RECRUIT'),
    ('ICT-E-HR-VISA',     'Visa & Iqama Costs',                'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5548, 'GRP-E-HR-RECRUIT'),
    ('ICT-E-HR-RELOC',    'Relocation Costs',                  'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5550, 'GRP-E-HR-BEN'),
    ('ICT-E-HR-WELFARE',  'Staff Welfare',                     'ICT-E-HR', 3, 'expense', 'posting', 'debit', 5555, 'GRP-E-HR-BEN');

    -- ── L3: Depreciation & Amortisation ─────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-DA-LAB',      'Depreciation — Lab & Demo',        'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5610, 'GRP-E-DA-PLANT'),
    ('ICT-E-DA-DCOWN',    'Depreciation — Own DC Equip',      'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5615, 'GRP-E-DA-PLANT'),
    ('ICT-E-DA-IT',       'Depreciation — IT Equipment',      'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5620, 'GRP-E-DA-IT'),
    ('ICT-E-DA-FURN',     'Depreciation — Furniture',         'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5625, 'GRP-E-DA-BLDG'),
    ('ICT-E-DA-VEH',      'Depreciation — Vehicles',          'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5630, 'GRP-E-DA-VEH'),
    ('ICT-E-DA-LHI',      'Depreciation — LHI',               'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5635, 'GRP-E-DA-BLDG'),
    ('ICT-E-DA-TOOLS',    'Depreciation — Tools',             'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5640, 'GRP-E-DA-PLANT'),
    ('ICT-E-DA-AV',       'Depreciation — AV Equipment',      'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5645, 'GRP-E-DA-PLANT'),
    ('ICT-E-DA-ROU',      'Depreciation — ROU Assets',        'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5650, 'GRP-E-DA-ROU'),
    ('ICT-E-DA-AMORT',    'Amortisation — Acquired Licenses', 'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5660, 'GRP-E-DA-AMORT'),
    ('ICT-E-DA-PATENT',   'Amortisation — Patents',           'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5665, 'GRP-E-DA-AMORT'),
    ('ICT-E-DA-CUSTREL',  'Amortisation — Customer Rel',      'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5670, 'GRP-E-DA-AMORT'),
    ('ICT-E-DA-IMPAIR',   'Impairment Losses (IAS 36)',       'ICT-E-DA', 3, 'expense', 'posting', 'debit', 5690, 'GRP-E-DA-AMORT');

    -- ── L3: Finance Costs ───────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-FIN-INT',     'Interest Expense',                  'ICT-E-FIN', 3, 'expense', 'posting', 'debit', 5710, 'GRP-E-FIN-INT'),
    ('ICT-E-FIN-LEASE',   'Lease Interest (IFRS 16)',          'ICT-E-FIN', 3, 'expense', 'posting', 'debit', 5720, 'GRP-E-FIN-LEASE'),
    ('ICT-E-FIN-FX',      'Foreign Exchange Loss',             'ICT-E-FIN', 3, 'expense', 'posting', 'debit', 5730, 'GRP-E-FIN-FX'),
    ('ICT-E-FIN-BANK',    'Bank Charges',                      'ICT-E-FIN', 3, 'expense', 'posting', 'debit', 5740, 'GRP-E-FIN-BANK'),
    ('ICT-E-FIN-COMMIT',  'Commitment & Guarantee Fees',      'ICT-E-FIN', 3, 'expense', 'posting', 'debit', 5750, 'GRP-E-FIN-INT'),
    ('ICT-E-FIN-FV',      'Fair Value Loss',                   'ICT-E-FIN', 3, 'expense', 'posting', 'debit', 5760, 'GRP-E-FIN-INT'),
    ('ICT-E-FIN-ECL',     'ECL Expense (IFRS 9)',             'ICT-E-FIN', 3, 'expense', 'posting', 'debit', 5770, 'GRP-E-FIN-INT');

    -- ── L3: Tax Expense ─────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-TAX-CIT',     'Income Tax / Zakat Expense',       'ICT-E-TAX', 3, 'expense', 'posting', 'debit', 5810, 'GRP-E-TAX-CIT'),
    ('ICT-E-TAX-DT',      'Deferred Tax Expense',             'ICT-E-TAX', 3, 'expense', 'posting', 'debit', 5820, 'GRP-E-TAX-DT'),
    ('ICT-E-TAX-PRIOR',   'Prior Year Tax Adjustment',        'ICT-E-TAX', 3, 'expense', 'posting', 'debit', 5830, 'GRP-E-TAX-CIT');

    -- ── L3: IC Expense ──────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-ICE-MGMT',    'IC Management Fee Expense',        'ICT-E-ICE', 3, 'expense', 'posting', 'debit', 5851, 'GRP-E-ICE-MGMT'),
    ('ICT-E-ICE-SVCS',    'IC Service Expense',               'ICT-E-ICE', 3, 'expense', 'posting', 'debit', 5855, 'GRP-E-ICE-SVCS'),
    ('ICT-E-ICE-RENT',    'IC Rent Expense',                  'ICT-E-ICE', 3, 'expense', 'posting', 'debit', 5860, 'GRP-E-ICE-SVCS'),
    ('ICT-E-ICE-IT',      'IC IT Service Expense',            'ICT-E-ICE', 3, 'expense', 'posting', 'debit', 5865, 'GRP-E-ICE-SVCS');

    -- ── L3: Other Expenses ──────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('ICT-E-OTH-LOSS',    'Loss on Disposal',                 'ICT-E-OTHER', 3, 'expense', 'posting', 'debit', 5910, 'GRP-E-OTHER-LOSS'),
    ('ICT-E-OTH-WRITEOFF','Bad Debt Write-Off',               'ICT-E-OTHER', 3, 'expense', 'posting', 'debit', 5920, 'GRP-E-OTHER-LOSS'),
    ('ICT-E-OTH-MISC',    'Miscellaneous Expense',            'ICT-E-OTHER', 3, 'expense', 'posting', 'debit', 5990, 'GRP-E-OTHER-MISC');


    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: UPSERT into master.gl_account (parent_id wired post-insert)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id,
        code, name, parent_id, level_no, path,
        description, account_class, node_type, normal_balance,
        subledger_type, sort_order,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id,
        t.code, t.name, NULL, t.level_no, t.code,
        t.description, t.account_class, t.node_type, t.normal_balance,
        t.subledger_type, t.sort_order,
        v_meta || CASE WHEN t.group_map IS NOT NULL
                       THEN jsonb_build_object('group_map', t.group_map)
                       ELSE '{}'::jsonb END,
        'active', v_su
    FROM tmp_gl t
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', (EXCLUDED.metadata->'_seed'))
                         || CASE WHEN EXCLUDED.metadata ? 'group_map'
                                 THEN jsonb_build_object('group_map', EXCLUDED.metadata->'group_map')
                                 ELSE '{}'::jsonb END,
        updated_at = now(),
        updated_by = v_su;

    -- Wire parent_id from parent_code
    UPDATE master.gl_account child
    SET    parent_id = parent.id,
           path      = parent.code || '/' || child.code
    FROM   tmp_gl t
    JOIN   master.gl_account parent
           ON parent.tenant_id           = v_tid
          AND parent.chart_of_account_id = v_coa_id
          AND parent.code                = t.parent_code
    WHERE  child.tenant_id           = v_tid
      AND  child.chart_of_account_id = v_coa_id
      AND  child.code                = t.code
      AND  t.parent_code IS NOT NULL
      AND  (child.parent_id IS DISTINCT FROM parent.id);


    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_total
    FROM master.gl_account
    WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_roots
    FROM master.gl_account
    WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack AND parent_id IS NULL;

    SELECT count(*) INTO v_posting
    FROM master.gl_account
    WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack AND node_type = 'posting';

    IF v_roots <> 5 THEN
        RAISE EXCEPTION '[211_ict_gl_robust] Expected 5 roots, got %', v_roots;
    END IF;

    IF v_posting < 220 THEN
        RAISE EXCEPTION '[211_ict_gl_robust] Expected >= 220 posting accounts, got %', v_posting;
    END IF;

    RAISE NOTICE '[211_ict_gl_robust] ICT chart seeded: % total (% roots, % posting)',
        v_total, v_roots, v_posting;

END $seed$;
