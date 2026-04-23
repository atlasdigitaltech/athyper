-- ============================================================================
-- FILE: 005_technostat_gl_accounts.sql
-- Tenant: technostat  (UUID: 019db587-47de-7dd2-8a5e-ef07e08f476c)
--
-- Seeds GL accounts for the three COAs that 003_technostat_production_seed.sql
-- declared but left empty:
--
--   Block 1 — COA-IFRS-GROUP  Group consolidation chart (GRP-* prefix)
--             ~137 accounts; group_map codes referenced by all subsidiary charts
--   Block 2 — COA-SOCPA       SSK construction, Saudi GAAP (CST-* prefix)
--             ~142 accounts; maps to GRP-* via group_map metadata
--   Block 3 — COA-EAS         TEGY trading, Egyptian standards (TRD-* prefix)
--             ~118 accounts; maps to GRP-* via group_map metadata
--
-- Idempotent: ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE
-- Depends on: 003_technostat_production_seed.sql (COA framework, CC structure)
-- ============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  BLOCK 1: COA-IFRS-GROUP — Group Consolidation Chart                     ║
-- ║                                                                          ║
-- ║  Provides the target accounts for all subsidiary group_map references.   ║
-- ║  IC accounts (GRP-R-ICR-*, GRP-E-ICE-*) are eliminated on consolidation.║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $coa_grp$
DECLARE
    v_tid     uuid;
    v_su      uuid    := '00000000-0000-0000-0000-000000000000';
    v_pack    text    := '005_technostat_gl_grp';
    v_version text    := '1.0.0';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_total   int;
    v_posting int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant technostat not found'; END IF;

    SELECT id INTO v_coa_id FROM master.chart_of_account WHERE tenant_id = v_tid AND code = 'COA-IFRS-GROUP';
    IF v_coa_id IS NULL THEN RAISE EXCEPTION 'Chart COA-IFRS-GROUP not found'; END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text));

    CREATE TEMP TABLE tmp_gl_grp (
        seed_id        uuid    DEFAULT shared.uuidv7(),
        code           text    NOT NULL,
        name           text    NOT NULL,
        parent_code    text,
        level_no       smallint NOT NULL DEFAULT 1,
        description    text,
        account_class  text    NOT NULL,
        node_type      text    NOT NULL DEFAULT 'posting',
        normal_balance text    NOT NULL,
        subledger_type text,
        sort_order     smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    -- ── L1: CLASS ROOTS ────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-A', 'Assets',      1, 'asset',     'header', 'debit',  1000),
    ('GRP-L', 'Liabilities', 1, 'liability', 'header', 'credit', 2000),
    ('GRP-Q', 'Equity',      1, 'equity',    'header', 'credit', 3000),
    ('GRP-R', 'Revenue',     1, 'income',    'header', 'credit', 4000),
    ('GRP-E', 'Expenses',    1, 'expense',   'header', 'debit',  5000);

    -- ── ASSETS L2 ──────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-A-CASH',  'Cash & Cash Equivalents',        'GRP-A', 2, 'asset',        'header', 'debit',  1100),
    ('GRP-A-AR',    'Trade Receivables',               'GRP-A', 2, 'asset',        'header', 'debit',  1200),
    ('GRP-A-OAR',   'Other Receivables & Prepaid',     'GRP-A', 2, 'asset',        'header', 'debit',  1300),
    ('GRP-A-INV',   'Inventory',                       'GRP-A', 2, 'asset',        'header', 'debit',  1400),
    ('GRP-A-IC',    'IC Receivable',                   'GRP-A', 2, 'asset',        'header', 'debit',  1480),
    ('GRP-A-FA',    'Property & Equipment (Gross)',     'GRP-A', 2, 'asset',        'header', 'debit',  1600),
    ('GRP-A-DEP',   'Accumulated Depreciation',         'GRP-A', 2, 'contra_asset', 'header', 'credit', 1700),
    ('GRP-A-IA',    'Intangible Assets',               'GRP-A', 2, 'asset',        'header', 'debit',  1750),
    ('GRP-A-GW',    'Goodwill',                        'GRP-A', 2, 'asset',        'header', 'debit',  1800),
    ('GRP-A-DT',    'Deferred Tax Asset',              'GRP-A', 2, 'asset',        'header', 'debit',  1850),
    ('GRP-A-ONA',   'Other Non-Current Assets',        'GRP-A', 2, 'asset',        'header', 'debit',  1900);

    -- ── ASSETS L3 ──────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    ('GRP-A-CASH-OPER',   'Cash — Operating Accounts',     'GRP-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1110),
    ('GRP-A-CASH-PETTY',  'Petty Cash',                    'GRP-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1130),
    ('GRP-A-CASH-BANK',   'Time Deposits & Short Funds',   'GRP-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1150),
    ('GRP-A-AR-TRADE',    'Trade Receivables — External',  'GRP-A-AR',   3, 'asset',        'posting', 'debit',  'ar',        1210),
    ('GRP-A-AR-ALLOW',    'ECL Allowance (IFRS 9)',         'GRP-A-AR',   3, 'contra_asset', 'posting', 'credit', NULL,        1240),
    ('GRP-A-OAR-ADVANCE', 'Advances & Sundry Receivables', 'GRP-A-OAR',  3, 'asset',        'posting', 'debit',  NULL,        1310),
    ('GRP-A-OAR-PREPAY',  'Prepaid Expenses',              'GRP-A-OAR',  3, 'asset',        'posting', 'debit',  NULL,        1320),
    ('GRP-A-OAR-DEPOSIT', 'Security & Performance Bonds',  'GRP-A-OAR',  3, 'asset',        'posting', 'debit',  NULL,        1330),
    ('GRP-A-INV-TRADE',   'Inventory — Trading Goods',     'GRP-A-INV',  3, 'asset',        'posting', 'debit',  'inventory', 1410),
    ('GRP-A-INV-RAW',     'Inventory — Materials',         'GRP-A-INV',  3, 'asset',        'posting', 'debit',  'inventory', 1420),
    ('GRP-A-INV-FG',      'Inventory — Finished Goods',    'GRP-A-INV',  3, 'asset',        'posting', 'debit',  'inventory', 1430),
    ('GRP-A-IC-LN',       'IC Loans Receivable',           'GRP-A-IC',   3, 'asset',        'posting', 'debit',  NULL,        1481),
    ('GRP-A-IC-TRD',      'IC Trade Receivable',           'GRP-A-IC',   3, 'asset',        'posting', 'debit',  'ar',        1482),
    ('GRP-A-IC-CURR',     'IC Current Account',            'GRP-A-IC',   3, 'asset',        'posting', 'debit',  NULL,        1483),
    ('GRP-A-FA-PLANT',    'Plant, Equipment & Lab',        'GRP-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1610),
    ('GRP-A-FA-IT',       'IT Equipment',                  'GRP-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1620),
    ('GRP-A-FA-FURN',     'Furniture & Fixtures',          'GRP-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1630),
    ('GRP-A-FA-VEH',      'Vehicles',                      'GRP-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1640),
    ('GRP-A-FA-BLDG',     'Buildings & LHI',               'GRP-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1650),
    ('GRP-A-FA-CWIP',     'Capital Work in Progress',      'GRP-A-FA',   3, 'asset',        'posting', 'debit',  NULL,        1690),
    ('GRP-A-DEP-PLANT',   'Accum Depr — Plant & Equip',   'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,        1710),
    ('GRP-A-DEP-IT',      'Accum Depr — IT Equipment',    'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,        1720),
    ('GRP-A-DEP-FURN',    'Accum Depr — Furniture',       'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,        1730),
    ('GRP-A-DEP-VEH',     'Accum Depr — Vehicles',        'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,        1740),
    ('GRP-A-DEP-BLDG',    'Accum Depr — Buildings',       'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,        1750),
    ('GRP-A-IA-SW',       'Intangibles — Software & Dev',  'GRP-A-IA',   3, 'asset',        'posting', 'debit',  'asset',     1760),
    ('GRP-A-IA-ACC',      'Accum Amort — Intangibles',    'GRP-A-IA',   3, 'contra_asset', 'posting', 'credit', NULL,        1770),
    ('GRP-A-GW-SUBS',     'Goodwill — Subsidiaries',      'GRP-A-GW',   3, 'asset',        'posting', 'debit',  'asset',     1810),
    ('GRP-A-GW-IMP',      'Goodwill Impairment',           'GRP-A-GW',   3, 'contra_asset', 'posting', 'credit', NULL,        1820),
    ('GRP-A-DT-TEMP',     'DTA — Temporary Differences',  'GRP-A-DT',   3, 'asset',        'posting', 'debit',  NULL,        1851),
    ('GRP-A-ONA-INVEST',  'Long-term Investments',         'GRP-A-ONA',  3, 'asset',        'posting', 'debit',  NULL,        1910);

    -- ── LIABILITIES L2 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-L-AP',     'Trade Payables',          'GRP-L', 2, 'liability', 'header', 'credit', 2100),
    ('GRP-L-CL',     'Contract Liabilities',    'GRP-L', 2, 'liability', 'header', 'credit', 2200),
    ('GRP-L-ACC',    'Accrued Liabilities',     'GRP-L', 2, 'liability', 'header', 'credit', 2300),
    ('GRP-L-TAX',    'Tax Payable',             'GRP-L', 2, 'liability', 'header', 'credit', 2400),
    ('GRP-L-IC',     'IC Payable',              'GRP-L', 2, 'liability', 'header', 'credit', 2480),
    ('GRP-L-LN',     'Loans & Borrowings',      'GRP-L', 2, 'liability', 'header', 'credit', 2500),
    ('GRP-L-PROV',   'Provisions',              'GRP-L', 2, 'liability', 'header', 'credit', 2600),
    ('GRP-L-LLEASE', 'Lease Liabilities',       'GRP-L', 2, 'liability', 'header', 'credit', 2700),
    ('GRP-L-DT',     'Deferred Tax Liability',  'GRP-L', 2, 'liability', 'header', 'credit', 2800),
    ('GRP-L-OL',     'Other Liabilities',       'GRP-L', 2, 'liability', 'header', 'credit', 2900);

    -- ── LIABILITIES L3 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    ('GRP-L-AP-TRADE',    'Trade Payables — External',    'GRP-L-AP',     3, 'liability', 'posting', 'credit', 'ap',   2110),
    ('GRP-L-CL-ADV',      'Customer Advances',             'GRP-L-CL',     3, 'liability', 'posting', 'credit', NULL,   2210),
    ('GRP-L-CL-RET',      'Retention Held — Customers',   'GRP-L-CL',     3, 'liability', 'posting', 'credit', NULL,   2220),
    ('GRP-L-ACC-SAL',     'Accrued Salaries',              'GRP-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2310),
    ('GRP-L-ACC-LEAVE',   'Annual Leave Provision',        'GRP-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2320),
    ('GRP-L-ACC-EOS',     'End of Service Provision',      'GRP-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2330),
    ('GRP-L-ACC-OTHER',   'Other Accruals',                'GRP-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2390),
    ('GRP-L-TAX-VAT',     'VAT Output Payable',            'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2410),
    ('GRP-L-TAX-VAT-IN',  'VAT Input Recoverable',         'GRP-L-TAX',    3, 'contra_liability', 'posting', 'debit',  NULL,   2415),
    ('GRP-L-TAX-CIT',     'Corporate Income Tax Payable',  'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2420),
    ('GRP-L-TAX-ZKT',     'Zakat Payable',                 'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2425),
    ('GRP-L-IC-LN',       'IC Loans Payable',              'GRP-L-IC',     3, 'liability', 'posting', 'credit', NULL,   2481),
    ('GRP-L-IC-TRD',      'IC Trade Payable',              'GRP-L-IC',     3, 'liability', 'posting', 'credit', 'ap',   2482),
    ('GRP-L-IC-CURR',     'IC Current Account',            'GRP-L-IC',     3, 'liability', 'posting', 'credit', NULL,   2483),
    ('GRP-L-LN-CUR',      'Loans — Current Portion',       'GRP-L-LN',     3, 'liability', 'posting', 'credit', NULL,   2510),
    ('GRP-L-LN-LT',       'Loans — Non-Current',           'GRP-L-LN',     3, 'liability', 'posting', 'credit', NULL,   2520),
    ('GRP-L-PROV-WARR',   'Warranty Provision',            'GRP-L-PROV',   3, 'liability', 'posting', 'credit', NULL,   2610),
    ('GRP-L-PROV-CLAIM',  'Contract Claim Provision',      'GRP-L-PROV',   3, 'liability', 'posting', 'credit', NULL,   2620),
    ('GRP-L-LLEASE-CUR',  'Lease Liabilities — Current',   'GRP-L-LLEASE', 3, 'liability', 'posting', 'credit', NULL,   2710),
    ('GRP-L-LLEASE-LT',   'Lease Liabilities — LT',        'GRP-L-LLEASE', 3, 'liability', 'posting', 'credit', NULL,   2720),
    ('GRP-L-DT-TEMP',     'DTL — Temporary Differences',   'GRP-L-DT',     3, 'liability', 'posting', 'credit', NULL,   2810),
    ('GRP-L-OL-DIV',      'Dividend Payable',              'GRP-L-OL',     3, 'liability', 'posting', 'credit', NULL,   2910);

    -- ── EQUITY L2 + L3 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-Q-CAP', 'Share Capital',         'GRP-Q', 2, 'equity', 'header', 'credit', 3100),
    ('GRP-Q-RES', 'Reserves',              'GRP-Q', 2, 'equity', 'header', 'credit', 3200),
    ('GRP-Q-RE',  'Retained Earnings',     'GRP-Q', 2, 'equity', 'header', 'credit', 3300),
    ('GRP-Q-NCI-HDR', 'Non-Controlling Interest', 'GRP-Q', 2, 'equity', 'header', 'credit', 3400);

    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-Q-CAP-PAID',   'Paid-Up Share Capital',     'GRP-Q-CAP',     3, 'equity', 'posting', 'credit', 3110),
    ('GRP-Q-RES-STAT',   'Statutory Reserve',          'GRP-Q-RES',     3, 'equity', 'posting', 'credit', 3210),
    ('GRP-Q-RES-TRANSL', 'Translation Reserve',        'GRP-Q-RES',     3, 'equity', 'posting', 'credit', 3220),
    ('GRP-Q-RE-ACCUM',   'Accumulated Retained Earnings', 'GRP-Q-RE',  3, 'equity', 'posting', 'credit', 3310),
    ('GRP-Q-RE-CUR',     'Current Year Profit/Loss',   'GRP-Q-RE',     3, 'equity', 'posting', 'credit', 3320),
    ('GRP-Q-NCI',        'NCI — Subsidiaries',         'GRP-Q-NCI-HDR',3, 'equity', 'posting', 'credit', 3410);

    -- ── REVENUE L2 + L3 ────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-R-SALES', 'Sales Revenue',          'GRP-R', 2, 'income', 'header', 'credit', 4100),
    ('GRP-R-CONT',  'Construction Revenue',   'GRP-R', 2, 'income', 'header', 'credit', 4200),
    ('GRP-R-OOI',   'Other Operating Income', 'GRP-R', 2, 'income', 'header', 'credit', 4300),
    ('GRP-R-FIN',   'Finance Income',         'GRP-R', 2, 'income', 'header', 'credit', 4400),
    ('GRP-R-ICR',   'IC Revenue (Elimination)', 'GRP-R', 2, 'income', 'header', 'credit', 4500);

    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-R-SALES-GOODS', 'Revenue — Products & Goods',  'GRP-R-SALES', 3, 'income', 'posting', 'credit', 4110),
    ('GRP-R-SALES-SVC',   'Revenue — Services',           'GRP-R-SALES', 3, 'income', 'posting', 'credit', 4120),
    ('GRP-R-SALES-DISC',  'Sales Discounts & Returns',    'GRP-R-SALES', 3, 'income', 'posting', 'debit',  4190),
    ('GRP-R-CONT-GOVT',   'Revenue — Government Contracts','GRP-R-CONT', 3, 'income', 'posting', 'credit', 4210),
    ('GRP-R-CONT-PRIV',   'Revenue — Private Sector',     'GRP-R-CONT',  3, 'income', 'posting', 'credit', 4220),
    ('GRP-R-OOI-GAIN',    'Gain on Disposal',             'GRP-R-OOI',  3, 'income', 'posting', 'credit', 4310),
    ('GRP-R-OOI-MISC',    'Miscellaneous Income',         'GRP-R-OOI',  3, 'income', 'posting', 'credit', 4390),
    ('GRP-R-FIN-INT',     'Interest & Murabaha Income',   'GRP-R-FIN',  3, 'income', 'posting', 'credit', 4410),
    ('GRP-R-FIN-FX',      'Foreign Exchange Gain',        'GRP-R-FIN',  3, 'income', 'posting', 'credit', 4420),
    ('GRP-R-ICR-SVCS',    'IC Service Revenue',           'GRP-R-ICR',  3, 'income', 'posting', 'credit', 4510),
    ('GRP-R-ICR-MGMT',    'IC Management Fee Income',     'GRP-R-ICR',  3, 'income', 'posting', 'credit', 4520);

    -- ── EXPENSES L2 ────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-E-COGS',   'Cost of Goods & Services', 'GRP-E', 2, 'expense', 'header', 'debit', 5100),
    ('GRP-E-SGA',    'Selling, G&A',             'GRP-E', 2, 'expense', 'header', 'debit', 5200),
    ('GRP-E-HR',     'HR & Payroll',             'GRP-E', 2, 'expense', 'header', 'debit', 5300),
    ('GRP-E-DA',     'Depreciation & Amort',     'GRP-E', 2, 'expense', 'header', 'debit', 5400),
    ('GRP-E-TAX',    'Tax Expense',              'GRP-E', 2, 'expense', 'header', 'debit', 5500),
    ('GRP-E-ICE',    'IC Expense (Elimination)', 'GRP-E', 2, 'expense', 'header', 'debit', 5600),
    ('GRP-E-FIN',    'Finance Costs',            'GRP-E', 2, 'expense', 'header', 'debit', 5700),
    ('GRP-E-OTHER',  'Other Expenses',           'GRP-E', 2, 'expense', 'header', 'debit', 5900);

    -- ── EXPENSES L3 ────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_grp (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-E-COGS-LABOUR',  'Direct Labour',                 'GRP-E-COGS',  3, 'expense', 'posting', 'debit', 5110),
    ('GRP-E-COGS-SUB',     'Subcontractor Costs',           'GRP-E-COGS',  3, 'expense', 'posting', 'debit', 5120),
    ('GRP-E-COGS-MAT',     'Materials & COGS',              'GRP-E-COGS',  3, 'expense', 'posting', 'debit', 5130),
    ('GRP-E-COGS-OH',      'Direct Overhead',               'GRP-E-COGS',  3, 'expense', 'posting', 'debit', 5140),
    ('GRP-E-COGS-FREIGHT', 'Freight, Customs & Logistics',  'GRP-E-COGS',  3, 'expense', 'posting', 'debit', 5150),
    ('GRP-E-COGS-EQUIP',   'Plant & Equipment Usage',       'GRP-E-COGS',  3, 'expense', 'posting', 'debit', 5160),
    ('GRP-E-SGA-SAL',      'SGA — Salaries',                'GRP-E-SGA',   3, 'expense', 'posting', 'debit', 5210),
    ('GRP-E-SGA-RENT',     'SGA — Rent & Facilities',       'GRP-E-SGA',   3, 'expense', 'posting', 'debit', 5220),
    ('GRP-E-SGA-IT',       'SGA — IT & Software',           'GRP-E-SGA',   3, 'expense', 'posting', 'debit', 5230),
    ('GRP-E-SGA-PROF',     'SGA — Professional Services',   'GRP-E-SGA',   3, 'expense', 'posting', 'debit', 5240),
    ('GRP-E-SGA-MISC',     'SGA — Miscellaneous',           'GRP-E-SGA',   3, 'expense', 'posting', 'debit', 5290),
    ('GRP-E-HR-SAL',       'HR — Overhead Salaries',        'GRP-E-HR',    3, 'expense', 'posting', 'debit', 5310),
    ('GRP-E-HR-BEN',       'HR — Benefits & Social Ins',    'GRP-E-HR',    3, 'expense', 'posting', 'debit', 5320),
    ('GRP-E-HR-TERM',      'HR — EOS & Termination',        'GRP-E-HR',    3, 'expense', 'posting', 'debit', 5330),
    ('GRP-E-DA-DEP',       'Depreciation Expense',          'GRP-E-DA',    3, 'expense', 'posting', 'debit', 5410),
    ('GRP-E-DA-AMORT',     'Amortisation Expense',          'GRP-E-DA',    3, 'expense', 'posting', 'debit', 5420),
    ('GRP-E-TAX-CIT',      'Corporate Income Tax',          'GRP-E-TAX',   3, 'expense', 'posting', 'debit', 5510),
    ('GRP-E-TAX-DT',       'Deferred Tax Movement',         'GRP-E-TAX',   3, 'expense', 'posting', 'debit', 5520),
    ('GRP-E-TAX-ZKT',      'Zakat Expense',                 'GRP-E-TAX',   3, 'expense', 'posting', 'debit', 5530),
    ('GRP-E-ICE-MGMT',     'IC Management Fee Expense',     'GRP-E-ICE',   3, 'expense', 'posting', 'debit', 5610),
    ('GRP-E-ICE-SVCS',     'IC Service Expense',            'GRP-E-ICE',   3, 'expense', 'posting', 'debit', 5620),
    ('GRP-E-FIN-INT',      'Interest Expense on Loans',     'GRP-E-FIN',   3, 'expense', 'posting', 'debit', 5710),
    ('GRP-E-FIN-FX',       'Foreign Exchange Loss',         'GRP-E-FIN',   3, 'expense', 'posting', 'debit', 5720),
    ('GRP-E-FIN-LEASE',    'Finance Charge — Leases',       'GRP-E-FIN',   3, 'expense', 'posting', 'debit', 5730),
    ('GRP-E-FIN-BNK',      'Bank Charges & Fees',           'GRP-E-FIN',   3, 'expense', 'posting', 'debit', 5740),
    ('GRP-E-OTHER-LOSS',   'Loss on Disposal',              'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', 5910),
    ('GRP-E-OTHER-MISC',   'Miscellaneous Expense',         'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', 5990);

    -- ── UPSERT ─────────────────────────────────────────────────────────────
    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id,
        code, name, parent_id, level_no, path,
        description, account_class, node_type, normal_balance,
        subledger_type, sort_order, metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id,
        t.code, t.name, NULL, t.level_no, t.code,
        t.description, t.account_class, t.node_type, t.normal_balance,
        t.subledger_type, t.sort_order, v_meta, 'active', v_su
    FROM tmp_gl_grp t
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', (EXCLUDED.metadata->'_seed')),
        updated_at     = now(),
        updated_by     = v_su;

    -- Wire parent_id
    UPDATE master.gl_account child
    SET    parent_id = parent.id,
           path      = parent.code || '/' || child.code
    FROM   tmp_gl_grp t
    JOIN   master.gl_account parent
           ON parent.tenant_id           = v_tid
          AND parent.chart_of_account_id = v_coa_id
          AND parent.code                = t.parent_code
    WHERE  child.tenant_id           = v_tid
      AND  child.chart_of_account_id = v_coa_id
      AND  child.code                = t.code
      AND  t.parent_code IS NOT NULL
      AND  (child.parent_id IS DISTINCT FROM parent.id);

    -- Assertions
    SELECT count(*) INTO v_total   FROM master.gl_account WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id;
    SELECT count(*) INTO v_posting FROM master.gl_account WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id AND node_type = 'posting';
    IF v_posting < 80 THEN
        RAISE EXCEPTION '[005_gl_grp] Expected ≥80 posting accounts, got %', v_posting;
    END IF;
    RAISE NOTICE '[005_gl_grp] COA-IFRS-GROUP seeded: % total (% posting)', v_total, v_posting;
END $coa_grp$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  BLOCK 2: COA-SOCPA — SSK Construction, Saudi GAAP                       ║
-- ║                                                                          ║
-- ║  Saudi GAAP (SOCPA) chart for SSK Saudi construction operations.         ║
-- ║  Also assigned as local-overlay chart to TKSA (group holding company).   ║
-- ║  Includes construction-specific accounts: retention, WIP, GOSI, Zakat.  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $coa_socpa$
DECLARE
    v_tid     uuid;
    v_su      uuid    := '00000000-0000-0000-0000-000000000000';
    v_pack    text    := '005_technostat_gl_socpa';
    v_version text    := '1.0.0';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_total   int;
    v_posting int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant technostat not found'; END IF;

    SELECT id INTO v_coa_id FROM master.chart_of_account WHERE tenant_id = v_tid AND code = 'COA-SOCPA';
    IF v_coa_id IS NULL THEN RAISE EXCEPTION 'Chart COA-SOCPA not found'; END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text));

    CREATE TEMP TABLE tmp_gl_socpa (
        seed_id        uuid    DEFAULT shared.uuidv7(),
        code           text    NOT NULL,
        name           text    NOT NULL,
        parent_code    text,
        level_no       smallint NOT NULL DEFAULT 1,
        description    text,
        account_class  text    NOT NULL,
        node_type      text    NOT NULL DEFAULT 'posting',
        normal_balance text    NOT NULL,
        subledger_type text,
        sort_order     smallint NOT NULL DEFAULT 0,
        group_map      text
    ) ON COMMIT DROP;

    -- ── L1: CLASS ROOTS ────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('CST-A', 'Assets',      1, 'asset',     'header', 'debit',  1000),
    ('CST-L', 'Liabilities', 1, 'liability', 'header', 'credit', 2000),
    ('CST-Q', 'Equity',      1, 'equity',    'header', 'credit', 3000),
    ('CST-R', 'Revenue',     1, 'income',    'header', 'credit', 4000),
    ('CST-E', 'Expenses',    1, 'expense',   'header', 'debit',  5000);

    -- ── ASSETS L2 ──────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('CST-A-CASH',   'Cash & Cash Equivalents',          'CST-A', 2, 'asset',        'header', 'debit',  1100),
    ('CST-A-AR',     'Trade Receivables',                 'CST-A', 2, 'asset',        'header', 'debit',  1200),
    ('CST-A-RET',    'Contract Retention Receivable',     'CST-A', 2, 'asset',        'header', 'debit',  1250),
    ('CST-A-CA',     'Contract Assets — WIP',             'CST-A', 2, 'asset',        'header', 'debit',  1300),
    ('CST-A-MAT',    'Materials & Supplies Inventory',    'CST-A', 2, 'asset',        'header', 'debit',  1400),
    ('CST-A-PRE',    'Prepaid Expenses & Advances',       'CST-A', 2, 'asset',        'header', 'debit',  1450),
    ('CST-A-ICR',    'IC Receivable',                     'CST-A', 2, 'asset',        'header', 'debit',  1480),
    ('CST-A-OA',     'Other Current Assets',              'CST-A', 2, 'asset',        'header', 'debit',  1490),
    ('CST-A-FA',     'Fixed Assets — Gross',              'CST-A', 2, 'asset',        'header', 'debit',  1600),
    ('CST-A-ADEP',   'Accumulated Depreciation',          'CST-A', 2, 'contra_asset', 'header', 'credit', 1700),
    ('CST-A-IA',     'Intangible Assets',                 'CST-A', 2, 'asset',        'header', 'debit',  1800);

    -- ── ASSETS L3 ──────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map, description) VALUES
    ('CST-A-CASH-BANK',     'Bank — SAR (Riyad Bank)',         'CST-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1110, 'GRP-A-CASH-OPER', NULL),
    ('CST-A-CASH-LC',       'LC & Project Escrow Accounts',    'CST-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1115, 'GRP-A-CASH-OPER', NULL),
    ('CST-A-CASH-PETTY',    'Petty Cash',                      'CST-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1130, 'GRP-A-CASH-PETTY', NULL),
    ('CST-A-AR-GOVT',       'Receivables — Government',        'CST-A-AR',   3, 'asset',        'posting', 'debit',  'ar',        1210, 'GRP-A-AR-TRADE', NULL),
    ('CST-A-AR-PRIV',       'Receivables — Private Sector',    'CST-A-AR',   3, 'asset',        'posting', 'debit',  'ar',        1215, 'GRP-A-AR-TRADE', NULL),
    ('CST-A-AR-RELATED',    'Receivables — Related Parties',   'CST-A-AR',   3, 'asset',        'posting', 'debit',  'ar',        1220, 'GRP-A-AR-TRADE', NULL),
    ('CST-A-AR-PROV',       'Allowance for Doubtful Debts',    'CST-A-AR',   3, 'contra_asset', 'posting', 'credit', NULL,        1240, 'GRP-A-AR-ALLOW', NULL),
    ('CST-A-RET-GOVT',      'Retention Receivable — Govt',     'CST-A-RET',  3, 'asset',        'posting', 'debit',  'ar',        1251, 'GRP-A-AR-TRADE', NULL),
    ('CST-A-RET-PRIV',      'Retention Receivable — Private',  'CST-A-RET',  3, 'asset',        'posting', 'debit',  'ar',        1252, 'GRP-A-AR-TRADE', NULL),
    ('CST-A-CA-WIP',        'WIP — Unbilled Work',             'CST-A-CA',   3, 'asset',        'posting', 'debit',  NULL,        1310, 'GRP-A-OAR-ADVANCE', 'Costs incurred exceeding progress billings.'),
    ('CST-A-CA-COST',       'Capitalised Contract Costs',      'CST-A-CA',   3, 'asset',        'posting', 'debit',  NULL,        1320, 'GRP-A-OAR-ADVANCE', NULL),
    ('CST-A-MAT-SITE',      'Raw Materials on Site',           'CST-A-MAT',  3, 'asset',        'posting', 'debit',  'inventory', 1410, 'GRP-A-INV-RAW', NULL),
    ('CST-A-MAT-CONS',      'Consumables & Spares',            'CST-A-MAT',  3, 'asset',        'posting', 'debit',  'inventory', 1420, 'GRP-A-INV-RAW', NULL),
    ('CST-A-MAT-TRANSIT',   'Materials in Transit',            'CST-A-MAT',  3, 'asset',        'posting', 'debit',  NULL,        1430, 'GRP-A-INV-RAW', NULL),
    ('CST-A-PRE-ADVSUB',    'Advances to Subcontractors',      'CST-A-PRE',  3, 'asset',        'posting', 'debit',  'ap',        1451, 'GRP-A-OAR-ADVANCE', NULL),
    ('CST-A-PRE-ADVVEND',   'Advances to Vendors',             'CST-A-PRE',  3, 'asset',        'posting', 'debit',  'ap',        1452, 'GRP-A-OAR-ADVANCE', NULL),
    ('CST-A-PRE-BOND',      'Performance & Bid Bonds',         'CST-A-PRE',  3, 'asset',        'posting', 'debit',  NULL,        1455, 'GRP-A-OAR-DEPOSIT', NULL),
    ('CST-A-PRE-OTHER',     'Other Prepaid Expenses',          'CST-A-PRE',  3, 'asset',        'posting', 'debit',  NULL,        1459, 'GRP-A-OAR-PREPAY', NULL),
    ('CST-A-ICR-LN',        'IC Loans Receivable',             'CST-A-ICR',  3, 'asset',        'posting', 'debit',  NULL,        1481, 'GRP-A-IC-LN', NULL),
    ('CST-A-ICR-TRD',       'IC Trade Receivable',             'CST-A-ICR',  3, 'asset',        'posting', 'debit',  'ar',        1482, 'GRP-A-IC-TRD', NULL),
    ('CST-A-ICR-CURR',      'IC Current Account',              'CST-A-ICR',  3, 'asset',        'posting', 'debit',  NULL,        1483, 'GRP-A-IC-CURR', NULL),
    ('CST-A-OA-VAT',        'VAT Input Recoverable',           'CST-A-OA',   3, 'asset',        'posting', 'debit',  NULL,        1491, 'GRP-L-TAX-VAT-IN', NULL),
    ('CST-A-OA-ZKT',        'Zakat Prepaid / Recoverable',     'CST-A-OA',   3, 'asset',        'posting', 'debit',  NULL,        1492, 'GRP-A-OAR-ADVANCE', NULL),
    ('CST-A-FA-LAND',       'Land',                            'CST-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1610, 'GRP-A-FA-BLDG', NULL),
    ('CST-A-FA-BLDG',       'Buildings & Site Offices',        'CST-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1620, 'GRP-A-FA-BLDG', NULL),
    ('CST-A-FA-EQUIP',      'Heavy Equipment (Cranes etc.)',   'CST-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1630, 'GRP-A-FA-PLANT', NULL),
    ('CST-A-FA-VEH',        'Vehicles & Transport',            'CST-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1640, 'GRP-A-FA-VEH', NULL),
    ('CST-A-FA-IT',         'IT Equipment',                    'CST-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1650, 'GRP-A-FA-IT', NULL),
    ('CST-A-FA-FURN',       'Furniture & Fixtures',            'CST-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1660, 'GRP-A-FA-FURN', NULL),
    ('CST-A-FA-ROU',        'Right-of-Use Assets',             'CST-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1670, 'GRP-A-FA-PLANT', NULL),
    ('CST-A-ADEP-BLDG',     'Accum Depr — Buildings',         'CST-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1710, 'GRP-A-DEP-BLDG', NULL),
    ('CST-A-ADEP-EQUIP',    'Accum Depr — Equipment',         'CST-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1720, 'GRP-A-DEP-PLANT', NULL),
    ('CST-A-ADEP-VEH',      'Accum Depr — Vehicles',          'CST-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1730, 'GRP-A-DEP-VEH', NULL),
    ('CST-A-ADEP-IT',       'Accum Depr — IT',                'CST-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1740, 'GRP-A-DEP-IT', NULL),
    ('CST-A-ADEP-ROU',      'Accum Depr — ROU',               'CST-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1750, 'GRP-A-DEP-PLANT', NULL),
    ('CST-A-IA-LIC',        'Software Licenses & IP',          'CST-A-IA',   3, 'asset',        'posting', 'debit',  'asset',     1810, 'GRP-A-IA-SW', NULL),
    ('CST-A-IA-ACC',        'Accum Amort — Intangibles',      'CST-A-IA',   3, 'contra_asset', 'posting', 'credit', NULL,        1820, 'GRP-A-IA-ACC', NULL);

    -- ── LIABILITIES L2 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('CST-L-AP',     'Trade Payables',               'CST-L', 2, 'liability', 'header', 'credit', 2100),
    ('CST-L-CL',     'Contract Liabilities',          'CST-L', 2, 'liability', 'header', 'credit', 2200),
    ('CST-L-RET',    'Retention Payable',             'CST-L', 2, 'liability', 'header', 'credit', 2250),
    ('CST-L-ACC',    'Accrued Liabilities',           'CST-L', 2, 'liability', 'header', 'credit', 2300),
    ('CST-L-TAX',    'Tax & Zakat Payable',           'CST-L', 2, 'liability', 'header', 'credit', 2400),
    ('CST-L-ICP',    'IC Payable',                   'CST-L', 2, 'liability', 'header', 'credit', 2480),
    ('CST-L-LN',     'Loans & Borrowings',            'CST-L', 2, 'liability', 'header', 'credit', 2500),
    ('CST-L-PROV',   'Provisions',                   'CST-L', 2, 'liability', 'header', 'credit', 2600),
    ('CST-L-LLEASE', 'Lease Liabilities',             'CST-L', 2, 'liability', 'header', 'credit', 2700),
    ('CST-L-OL',     'Other Liabilities',             'CST-L', 2, 'liability', 'header', 'credit', 2900);

    -- ── LIABILITIES L3 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('CST-L-AP-SUB',      'Subcontractor Payables',            'CST-L-AP',     3, 'liability', 'posting', 'credit', 'ap',   2110, 'GRP-L-AP-TRADE'),
    ('CST-L-AP-VEND',     'Material & Equipment Vendors',      'CST-L-AP',     3, 'liability', 'posting', 'credit', 'ap',   2115, 'GRP-L-AP-TRADE'),
    ('CST-L-AP-UTIL',     'Utility & Service Payables',        'CST-L-AP',     3, 'liability', 'posting', 'credit', 'ap',   2120, 'GRP-L-AP-TRADE'),
    ('CST-L-CL-GOVT',     'Advance Billings — Government',     'CST-L-CL',     3, 'liability', 'posting', 'credit', NULL,   2210, 'GRP-L-CL-ADV'),
    ('CST-L-CL-PRIV',     'Advance Billings — Private',        'CST-L-CL',     3, 'liability', 'posting', 'credit', NULL,   2220, 'GRP-L-CL-ADV'),
    ('CST-L-RET-CUST',    'Retention Held — Customers',        'CST-L-RET',    3, 'liability', 'posting', 'credit', NULL,   2251, 'GRP-L-CL-RET'),
    ('CST-L-RET-SUB',     'Retention Held — Subcontractors',   'CST-L-RET',    3, 'liability', 'posting', 'credit', 'ap',   2252, 'GRP-L-CL-RET'),
    ('CST-L-ACC-SAL',     'Accrued Salaries',                  'CST-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2310, 'GRP-L-ACC-SAL'),
    ('CST-L-ACC-GOSI',    'GOSI Payable (Employer Share)',      'CST-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2315, 'GRP-L-ACC-OTHER'),
    ('CST-L-ACC-LEAVE',   'Annual Leave Provision',             'CST-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2320, 'GRP-L-ACC-LEAVE'),
    ('CST-L-ACC-EOS',     'End of Service Provision',           'CST-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2330, 'GRP-L-ACC-EOS'),
    ('CST-L-ACC-OTHER',   'Other Accruals',                     'CST-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2390, 'GRP-L-ACC-OTHER'),
    ('CST-L-TAX-VAT',     'VAT Output Payable (15%)',           'CST-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2410, 'GRP-L-TAX-VAT'),
    ('CST-L-TAX-WHT',     'WHT Payable (Subcontractors)',       'CST-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2415, 'GRP-L-TAX-CIT'),
    ('CST-L-TAX-ZKT',     'Zakat Payable',                     'CST-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2420, 'GRP-L-TAX-ZKT'),
    ('CST-L-ICP-LN',      'IC Loans Payable',                  'CST-L-ICP',    3, 'liability', 'posting', 'credit', NULL,   2481, 'GRP-L-IC-LN'),
    ('CST-L-ICP-TRD',     'IC Trade Payable',                  'CST-L-ICP',    3, 'liability', 'posting', 'credit', 'ap',   2482, 'GRP-L-IC-TRD'),
    ('CST-L-ICP-CURR',    'IC Current Account',                'CST-L-ICP',    3, 'liability', 'posting', 'credit', NULL,   2483, 'GRP-L-IC-CURR'),
    ('CST-L-LN-STJ',      'Short-term Bank Loans',              'CST-L-LN',     3, 'liability', 'posting', 'credit', NULL,   2510, 'GRP-L-LN-CUR'),
    ('CST-L-LN-LT',       'Long-term Bank Loans',               'CST-L-LN',     3, 'liability', 'posting', 'credit', NULL,   2520, 'GRP-L-LN-LT'),
    ('CST-L-PROV-WARR',   'Warranty & Defect Provision',        'CST-L-PROV',   3, 'liability', 'posting', 'credit', NULL,   2610, 'GRP-L-PROV-WARR'),
    ('CST-L-PROV-CLAIM',  'Contract Claim Provision',           'CST-L-PROV',   3, 'liability', 'posting', 'credit', NULL,   2620, 'GRP-L-PROV-CLAIM'),
    ('CST-L-LLEASE-CUR',  'Lease Liabilities — Current',        'CST-L-LLEASE', 3, 'liability', 'posting', 'credit', NULL,   2710, 'GRP-L-LLEASE-CUR'),
    ('CST-L-LLEASE-LT',   'Lease Liabilities — Non-Current',    'CST-L-LLEASE', 3, 'liability', 'posting', 'credit', NULL,   2720, 'GRP-L-LLEASE-LT'),
    ('CST-L-OL-DIV',      'Dividend Payable',                   'CST-L-OL',     3, 'liability', 'posting', 'credit', NULL,   2910, 'GRP-L-OL-DIV');

    -- ── EQUITY L2 + L3 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('CST-Q-CAP', 'Share Capital',     'CST-Q', 2, 'equity', 'header', 'credit', 3100, NULL),
    ('CST-Q-RES', 'Reserves',          'CST-Q', 2, 'equity', 'header', 'credit', 3200, NULL),
    ('CST-Q-RE',  'Retained Earnings', 'CST-Q', 2, 'equity', 'header', 'credit', 3300, NULL);

    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('CST-Q-CAP-PAID',   'Paid-Up Share Capital',          'CST-Q-CAP', 3, 'equity', 'posting', 'credit', 3110, 'GRP-Q-CAP-PAID'),
    ('CST-Q-RES-STAT',   'Statutory Reserve (10%)',         'CST-Q-RES', 3, 'equity', 'posting', 'credit', 3210, 'GRP-Q-RES-STAT'),
    ('CST-Q-RES-VOLUNT', 'Voluntary Reserve',               'CST-Q-RES', 3, 'equity', 'posting', 'credit', 3220, 'GRP-Q-RES-STAT'),
    ('CST-Q-RES-TRANSL', 'Translation Reserve',             'CST-Q-RES', 3, 'equity', 'posting', 'credit', 3230, 'GRP-Q-RES-TRANSL'),
    ('CST-Q-RE-ACCUM',   'Accumulated Retained Earnings',   'CST-Q-RE',  3, 'equity', 'posting', 'credit', 3310, 'GRP-Q-RE-ACCUM'),
    ('CST-Q-RE-CUR',     'Current Year Profit/Loss',        'CST-Q-RE',  3, 'equity', 'posting', 'credit', 3320, 'GRP-Q-RE-CUR'),
    ('CST-Q-RE-DIV',     'Dividend Declared',               'CST-Q-RE',  3, 'equity', 'posting', 'debit',  3330, 'GRP-Q-RE-ACCUM');

    -- ── REVENUE L2 + L3 ────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('CST-R-CONT', 'Contract Revenue',       'CST-R', 2, 'income', 'header', 'credit', 4100, NULL),
    ('CST-R-ICR',  'IC Revenue',             'CST-R', 2, 'income', 'header', 'credit', 4200, NULL),
    ('CST-R-OOI',  'Other Operating Income', 'CST-R', 2, 'income', 'header', 'credit', 4300, NULL),
    ('CST-R-FIN',  'Finance Income',         'CST-R', 2, 'income', 'header', 'credit', 4400, NULL);

    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('CST-R-CONT-GOVT',  'Revenue — Government Contracts',  'CST-R-CONT', 3, 'income', 'posting', 'credit', 4110, 'GRP-R-CONT-GOVT'),
    ('CST-R-CONT-PRIV',  'Revenue — Private Sector',        'CST-R-CONT', 3, 'income', 'posting', 'credit', 4120, 'GRP-R-CONT-PRIV'),
    ('CST-R-CONT-INFRA', 'Revenue — Infrastructure Works',  'CST-R-CONT', 3, 'income', 'posting', 'credit', 4130, 'GRP-R-CONT-GOVT'),
    ('CST-R-CONT-MEP',   'Revenue — MEP Works',             'CST-R-CONT', 3, 'income', 'posting', 'credit', 4140, 'GRP-R-CONT-PRIV'),
    ('CST-R-CONT-VAR',   'Contract Variations & Claims',    'CST-R-CONT', 3, 'income', 'posting', 'credit', 4150, 'GRP-R-CONT-PRIV'),
    ('CST-R-CONT-RET',   'Retention Revenue Released',       'CST-R-CONT', 3, 'income', 'posting', 'credit', 4160, 'GRP-R-CONT-PRIV'),
    ('CST-R-ICR-MGMT',   'IC Management Fee Income',         'CST-R-ICR',  3, 'income', 'posting', 'credit', 4210, 'GRP-R-ICR-MGMT'),
    ('CST-R-ICR-SVCS',   'IC Service Revenue',               'CST-R-ICR',  3, 'income', 'posting', 'credit', 4220, 'GRP-R-ICR-SVCS'),
    ('CST-R-OOI-SCRAP',  'Scrap & Materials Sales',          'CST-R-OOI',  3, 'income', 'posting', 'credit', 4310, 'GRP-R-OOI-MISC'),
    ('CST-R-OOI-PENALTY','Penalty Income Received',           'CST-R-OOI',  3, 'income', 'posting', 'credit', 4320, 'GRP-R-OOI-MISC'),
    ('CST-R-OOI-GAIN',   'Gain on Disposal',                 'CST-R-OOI',  3, 'income', 'posting', 'credit', 4330, 'GRP-R-OOI-GAIN'),
    ('CST-R-OOI-MISC',   'Miscellaneous Income',             'CST-R-OOI',  3, 'income', 'posting', 'credit', 4390, 'GRP-R-OOI-MISC'),
    ('CST-R-FIN-INT',    'Murabaha & Deposit Income',        'CST-R-FIN',  3, 'income', 'posting', 'credit', 4410, 'GRP-R-FIN-INT'),
    ('CST-R-FIN-FX',     'Foreign Exchange Gain',            'CST-R-FIN',  3, 'income', 'posting', 'credit', 4420, 'GRP-R-FIN-FX');

    -- ── EXPENSES L2 ────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('CST-E-COC',   'Cost of Construction',        'CST-E', 2, 'expense', 'header', 'debit', 5100, NULL),
    ('CST-E-GA',    'General & Administrative',    'CST-E', 2, 'expense', 'header', 'debit', 5200, NULL),
    ('CST-E-HR',    'HR & Payroll — Overhead',     'CST-E', 2, 'expense', 'header', 'debit', 5300, NULL),
    ('CST-E-DA',    'Depreciation & Amort',        'CST-E', 2, 'expense', 'header', 'debit', 5400, NULL),
    ('CST-E-ICE',   'Intercompany Expense',        'CST-E', 2, 'expense', 'header', 'debit', 5500, NULL),
    ('CST-E-FIN',   'Finance Costs',               'CST-E', 2, 'expense', 'header', 'debit', 5600, NULL),
    ('CST-E-TAX',   'Tax & Zakat',                 'CST-E', 2, 'expense', 'header', 'debit', 5700, NULL);

    -- ── EXPENSES L3 ────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_socpa (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('CST-E-COC-MAT',    'Materials — Direct',              'CST-E-COC', 3, 'expense', 'posting', 'debit', 5110, 'GRP-E-COGS-MAT'),
    ('CST-E-COC-LABOUR', 'Direct Labour — Projects',        'CST-E-COC', 3, 'expense', 'posting', 'debit', 5115, 'GRP-E-COGS-LABOUR'),
    ('CST-E-COC-SUB',    'Subcontractor Costs',             'CST-E-COC', 3, 'expense', 'posting', 'debit', 5120, 'GRP-E-COGS-SUB'),
    ('CST-E-COC-EQUIP',  'Plant & Equipment Usage/Hire',    'CST-E-COC', 3, 'expense', 'posting', 'debit', 5125, 'GRP-E-COGS-EQUIP'),
    ('CST-E-COC-TRANSP', 'Site Transport & Logistics',      'CST-E-COC', 3, 'expense', 'posting', 'debit', 5130, 'GRP-E-COGS-FREIGHT'),
    ('CST-E-COC-INS',    'Project Insurance',               'CST-E-COC', 3, 'expense', 'posting', 'debit', 5135, 'GRP-E-COGS-OH'),
    ('CST-E-COC-PRELIM', 'Preliminaries & Mobilisation',    'CST-E-COC', 3, 'expense', 'posting', 'debit', 5140, 'GRP-E-COGS-OH'),
    ('CST-E-COC-WARR',   'Warranty & Defect Rectification', 'CST-E-COC', 3, 'expense', 'posting', 'debit', 5145, 'GRP-E-COGS-OH'),
    ('CST-E-COC-LOSS',   'Onerous Contract Provision',      'CST-E-COC', 3, 'expense', 'posting', 'debit', 5150, 'GRP-E-COGS-OH'),
    ('CST-E-GA-SAL',     'Admin Salaries',                  'CST-E-GA',  3, 'expense', 'posting', 'debit', 5210, 'GRP-E-SGA-SAL'),
    ('CST-E-GA-RENT',    'Office Rent',                     'CST-E-GA',  3, 'expense', 'posting', 'debit', 5215, 'GRP-E-SGA-RENT'),
    ('CST-E-GA-UTIL',    'Utilities & Telecom',             'CST-E-GA',  3, 'expense', 'posting', 'debit', 5220, 'GRP-E-SGA-MISC'),
    ('CST-E-GA-IT',      'IT & Software',                   'CST-E-GA',  3, 'expense', 'posting', 'debit', 5225, 'GRP-E-SGA-IT'),
    ('CST-E-GA-LEGAL',   'Legal & Audit Fees',              'CST-E-GA',  3, 'expense', 'posting', 'debit', 5230, 'GRP-E-SGA-PROF'),
    ('CST-E-GA-MISC',    'Miscellaneous Admin',             'CST-E-GA',  3, 'expense', 'posting', 'debit', 5290, 'GRP-E-SGA-MISC'),
    ('CST-E-HR-SAL',     'Overhead Salaries',               'CST-E-HR',  3, 'expense', 'posting', 'debit', 5310, 'GRP-E-HR-SAL'),
    ('CST-E-HR-GOSI',    'GOSI — Employer Contribution',    'CST-E-HR',  3, 'expense', 'posting', 'debit', 5315, 'GRP-E-HR-BEN'),
    ('CST-E-HR-LEAVE',   'Annual Leave Expense',             'CST-E-HR',  3, 'expense', 'posting', 'debit', 5320, 'GRP-E-HR-BEN'),
    ('CST-E-HR-EOS',     'End of Service Benefit Expense',  'CST-E-HR',  3, 'expense', 'posting', 'debit', 5325, 'GRP-E-HR-TERM'),
    ('CST-E-HR-VISA',    'Visa & Iqama Expenses',           'CST-E-HR',  3, 'expense', 'posting', 'debit', 5330, 'GRP-E-HR-BEN'),
    ('CST-E-DA-EQUIP',   'Depreciation — Equipment',        'CST-E-DA',  3, 'expense', 'posting', 'debit', 5410, 'GRP-E-DA-DEP'),
    ('CST-E-DA-BLDG',    'Depreciation — Buildings',        'CST-E-DA',  3, 'expense', 'posting', 'debit', 5415, 'GRP-E-DA-DEP'),
    ('CST-E-DA-VEH',     'Depreciation — Vehicles',         'CST-E-DA',  3, 'expense', 'posting', 'debit', 5420, 'GRP-E-DA-DEP'),
    ('CST-E-DA-IT',      'Depreciation — IT',               'CST-E-DA',  3, 'expense', 'posting', 'debit', 5425, 'GRP-E-DA-DEP'),
    ('CST-E-DA-ROU',     'Depreciation — ROU Assets',       'CST-E-DA',  3, 'expense', 'posting', 'debit', 5430, 'GRP-E-DA-DEP'),
    ('CST-E-DA-IA',      'Amortisation — Intangibles',      'CST-E-DA',  3, 'expense', 'posting', 'debit', 5440, 'GRP-E-DA-AMORT'),
    ('CST-E-ICE-MGMT',   'IC Management Fee Expense',       'CST-E-ICE', 3, 'expense', 'posting', 'debit', 5510, 'GRP-E-ICE-MGMT'),
    ('CST-E-ICE-SVCS',   'IC Service Expense',              'CST-E-ICE', 3, 'expense', 'posting', 'debit', 5520, 'GRP-E-ICE-SVCS'),
    ('CST-E-FIN-INT',    'Murabaha / Loan Interest',        'CST-E-FIN', 3, 'expense', 'posting', 'debit', 5610, 'GRP-E-FIN-INT'),
    ('CST-E-FIN-LEASE',  'Finance Charge — Leases',         'CST-E-FIN', 3, 'expense', 'posting', 'debit', 5620, 'GRP-E-FIN-LEASE'),
    ('CST-E-FIN-FX',     'Foreign Exchange Loss',           'CST-E-FIN', 3, 'expense', 'posting', 'debit', 5630, 'GRP-E-FIN-FX'),
    ('CST-E-FIN-BNK',    'Bank Charges & Fees',             'CST-E-FIN', 3, 'expense', 'posting', 'debit', 5640, 'GRP-E-FIN-BNK'),
    ('CST-E-TAX-ZKT',    'Zakat Expense',                   'CST-E-TAX', 3, 'expense', 'posting', 'debit', 5710, 'GRP-E-TAX-ZKT'),
    ('CST-E-TAX-WHT',    'Withholding Tax Expense',         'CST-E-TAX', 3, 'expense', 'posting', 'debit', 5720, 'GRP-E-TAX-CIT'),
    ('CST-E-TAX-DT',     'Deferred Tax Movement',           'CST-E-TAX', 3, 'expense', 'posting', 'debit', 5730, 'GRP-E-TAX-DT');

    -- ── UPSERT ─────────────────────────────────────────────────────────────
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
    FROM tmp_gl_socpa t
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
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
        updated_at     = now(),
        updated_by     = v_su;

    -- Wire parent_id
    UPDATE master.gl_account child
    SET    parent_id = parent.id,
           path      = parent.code || '/' || child.code
    FROM   tmp_gl_socpa t
    JOIN   master.gl_account parent
           ON parent.tenant_id           = v_tid
          AND parent.chart_of_account_id = v_coa_id
          AND parent.code                = t.parent_code
    WHERE  child.tenant_id           = v_tid
      AND  child.chart_of_account_id = v_coa_id
      AND  child.code                = t.code
      AND  t.parent_code IS NOT NULL
      AND  (child.parent_id IS DISTINCT FROM parent.id);

    -- Assertions
    SELECT count(*) INTO v_total   FROM master.gl_account WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id;
    SELECT count(*) INTO v_posting FROM master.gl_account WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id AND node_type = 'posting';
    IF v_posting < 90 THEN
        RAISE EXCEPTION '[005_gl_socpa] Expected ≥90 posting accounts, got %', v_posting;
    END IF;
    RAISE NOTICE '[005_gl_socpa] COA-SOCPA seeded: % total (% posting)', v_total, v_posting;
END $coa_socpa$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  BLOCK 3: COA-EAS — TEGY Trading, Egyptian Accounting Standards          ║
-- ║                                                                          ║
-- ║  EAS / Egyptian local GAAP chart for Technostat Egypt (TEGY) trading     ║
-- ║  operations. CIT 22.5%, VAT 14%, EGP functional currency.               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $coa_eas$
DECLARE
    v_tid     uuid;
    v_su      uuid    := '00000000-0000-0000-0000-000000000000';
    v_pack    text    := '005_technostat_gl_eas';
    v_version text    := '1.0.0';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_total   int;
    v_posting int;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant technostat not found'; END IF;

    SELECT id INTO v_coa_id FROM master.chart_of_account WHERE tenant_id = v_tid AND code = 'COA-EAS';
    IF v_coa_id IS NULL THEN RAISE EXCEPTION 'Chart COA-EAS not found'; END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object('pack', v_pack, 'version', v_version, 'seeded_at', now()::text));

    CREATE TEMP TABLE tmp_gl_eas (
        seed_id        uuid    DEFAULT shared.uuidv7(),
        code           text    NOT NULL,
        name           text    NOT NULL,
        parent_code    text,
        level_no       smallint NOT NULL DEFAULT 1,
        description    text,
        account_class  text    NOT NULL,
        node_type      text    NOT NULL DEFAULT 'posting',
        normal_balance text    NOT NULL,
        subledger_type text,
        sort_order     smallint NOT NULL DEFAULT 0,
        group_map      text
    ) ON COMMIT DROP;

    -- ── L1: CLASS ROOTS ────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('TRD-A', 'Assets',      1, 'asset',     'header', 'debit',  1000),
    ('TRD-L', 'Liabilities', 1, 'liability', 'header', 'credit', 2000),
    ('TRD-Q', 'Equity',      1, 'equity',    'header', 'credit', 3000),
    ('TRD-R', 'Revenue',     1, 'income',    'header', 'credit', 4000),
    ('TRD-E', 'Expenses',    1, 'expense',   'header', 'debit',  5000);

    -- ── ASSETS L2 ──────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('TRD-A-CASH',  'Cash & Cash Equivalents',       'TRD-A', 2, 'asset',        'header', 'debit',  1100),
    ('TRD-A-AR',    'Trade Receivables',              'TRD-A', 2, 'asset',        'header', 'debit',  1200),
    ('TRD-A-INV',   'Inventory — Merchandise',        'TRD-A', 2, 'asset',        'header', 'debit',  1300),
    ('TRD-A-PRE',   'Prepaid & Other Current Assets', 'TRD-A', 2, 'asset',        'header', 'debit',  1400),
    ('TRD-A-ICR',   'IC Receivable',                  'TRD-A', 2, 'asset',        'header', 'debit',  1480),
    ('TRD-A-FA',    'Fixed Assets — Gross',           'TRD-A', 2, 'asset',        'header', 'debit',  1600),
    ('TRD-A-ADEP',  'Accumulated Depreciation',        'TRD-A', 2, 'contra_asset', 'header', 'credit', 1700),
    ('TRD-A-IA',    'Intangible Assets',              'TRD-A', 2, 'asset',        'header', 'debit',  1800);

    -- ── ASSETS L3 ──────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('TRD-A-CASH-CIB',    'Cash — CIB Bank (EGP)',             'TRD-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1110, 'GRP-A-CASH-OPER'),
    ('TRD-A-CASH-NBE',    'Cash — National Bank of Egypt',     'TRD-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1115, 'GRP-A-CASH-OPER'),
    ('TRD-A-CASH-FX',     'Foreign Currency Accounts',         'TRD-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1120, 'GRP-A-CASH-OPER'),
    ('TRD-A-CASH-PETTY',  'Petty Cash',                        'TRD-A-CASH', 3, 'asset',        'posting', 'debit',  NULL,        1130, 'GRP-A-CASH-PETTY'),
    ('TRD-A-AR-LOCAL',    'Trade Receivables — Local',         'TRD-A-AR',   3, 'asset',        'posting', 'debit',  'ar',        1210, 'GRP-A-AR-TRADE'),
    ('TRD-A-AR-EXPORT',   'Trade Receivables — Export',        'TRD-A-AR',   3, 'asset',        'posting', 'debit',  'ar',        1215, 'GRP-A-AR-TRADE'),
    ('TRD-A-AR-RELATED',  'Receivables — Related Parties',     'TRD-A-AR',   3, 'asset',        'posting', 'debit',  'ar',        1220, 'GRP-A-AR-TRADE'),
    ('TRD-A-AR-PROV',     'Allowance for Doubtful Debts',      'TRD-A-AR',   3, 'contra_asset', 'posting', 'credit', NULL,        1240, 'GRP-A-AR-ALLOW'),
    ('TRD-A-INV-MERCH',   'Merchandise — Trading Goods',       'TRD-A-INV',  3, 'asset',        'posting', 'debit',  'inventory', 1310, 'GRP-A-INV-TRADE'),
    ('TRD-A-INV-TRANSIT', 'Goods in Transit',                  'TRD-A-INV',  3, 'asset',        'posting', 'debit',  NULL,        1315, 'GRP-A-INV-TRADE'),
    ('TRD-A-INV-WH',      'Goods in Warehouse',                'TRD-A-INV',  3, 'asset',        'posting', 'debit',  'inventory', 1320, 'GRP-A-INV-TRADE'),
    ('TRD-A-INV-PROV',    'Inventory Write-Down Provision',    'TRD-A-INV',  3, 'contra_asset', 'posting', 'credit', NULL,        1390, 'GRP-A-INV-RAW'),
    ('TRD-A-PRE-ADVVEND', 'Advances to Vendors',               'TRD-A-PRE',  3, 'asset',        'posting', 'debit',  'ap',        1410, 'GRP-A-OAR-ADVANCE'),
    ('TRD-A-PRE-CUSTOMS', 'Customs Duties Prepaid',            'TRD-A-PRE',  3, 'asset',        'posting', 'debit',  NULL,        1415, 'GRP-A-OAR-PREPAY'),
    ('TRD-A-PRE-VAT',     'VAT Input Recoverable',             'TRD-A-PRE',  3, 'asset',        'posting', 'debit',  NULL,        1420, 'GRP-L-TAX-VAT-IN'),
    ('TRD-A-PRE-OTHER',   'Other Prepaid Expenses',            'TRD-A-PRE',  3, 'asset',        'posting', 'debit',  NULL,        1430, 'GRP-A-OAR-PREPAY'),
    ('TRD-A-ICR-LN',      'IC Loans Receivable',               'TRD-A-ICR',  3, 'asset',        'posting', 'debit',  NULL,        1481, 'GRP-A-IC-LN'),
    ('TRD-A-ICR-TRD',     'IC Trade Receivable',               'TRD-A-ICR',  3, 'asset',        'posting', 'debit',  'ar',        1482, 'GRP-A-IC-TRD'),
    ('TRD-A-ICR-CURR',    'IC Current Account',                'TRD-A-ICR',  3, 'asset',        'posting', 'debit',  NULL,        1483, 'GRP-A-IC-CURR'),
    ('TRD-A-FA-BLDG',     'Warehouses & Offices',              'TRD-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1610, 'GRP-A-FA-BLDG'),
    ('TRD-A-FA-VEH',      'Vehicles & Trucks',                 'TRD-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1620, 'GRP-A-FA-VEH'),
    ('TRD-A-FA-EQUIP',    'Handling & Warehouse Equipment',    'TRD-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1630, 'GRP-A-FA-PLANT'),
    ('TRD-A-FA-IT',       'IT Equipment',                      'TRD-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1640, 'GRP-A-FA-IT'),
    ('TRD-A-FA-FURN',     'Furniture & Fixtures',              'TRD-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1650, 'GRP-A-FA-FURN'),
    ('TRD-A-FA-ROU',      'Right-of-Use Assets',               'TRD-A-FA',   3, 'asset',        'posting', 'debit',  'asset',     1660, 'GRP-A-FA-PLANT'),
    ('TRD-A-ADEP-BLDG',   'Accum Depr — Buildings',           'TRD-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1710, 'GRP-A-DEP-BLDG'),
    ('TRD-A-ADEP-VEH',    'Accum Depr — Vehicles',            'TRD-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1720, 'GRP-A-DEP-VEH'),
    ('TRD-A-ADEP-EQUIP',  'Accum Depr — Equipment',           'TRD-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1730, 'GRP-A-DEP-PLANT'),
    ('TRD-A-ADEP-IT',     'Accum Depr — IT',                  'TRD-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1740, 'GRP-A-DEP-IT'),
    ('TRD-A-ADEP-ROU',    'Accum Depr — ROU',                 'TRD-A-ADEP', 3, 'contra_asset', 'posting', 'credit', NULL,        1750, 'GRP-A-DEP-PLANT'),
    ('TRD-A-IA-LIC',      'Software Licenses',                 'TRD-A-IA',   3, 'asset',        'posting', 'debit',  'asset',     1810, 'GRP-A-IA-SW'),
    ('TRD-A-IA-ACC',      'Accum Amort — Intangibles',        'TRD-A-IA',   3, 'contra_asset', 'posting', 'credit', NULL,        1820, 'GRP-A-IA-ACC');

    -- ── LIABILITIES L2 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('TRD-L-AP',     'Trade Payables',         'TRD-L', 2, 'liability', 'header', 'credit', 2100),
    ('TRD-L-ADV',    'Customer Advances',      'TRD-L', 2, 'liability', 'header', 'credit', 2200),
    ('TRD-L-ACC',    'Accrued Liabilities',    'TRD-L', 2, 'liability', 'header', 'credit', 2300),
    ('TRD-L-TAX',    'Tax Payable',            'TRD-L', 2, 'liability', 'header', 'credit', 2400),
    ('TRD-L-ICP',    'IC Payable',             'TRD-L', 2, 'liability', 'header', 'credit', 2480),
    ('TRD-L-LN',     'Loans & Borrowings',     'TRD-L', 2, 'liability', 'header', 'credit', 2500),
    ('TRD-L-LLEASE', 'Lease Liabilities',      'TRD-L', 2, 'liability', 'header', 'credit', 2700),
    ('TRD-L-OL',     'Other Liabilities',      'TRD-L', 2, 'liability', 'header', 'credit', 2900);

    -- ── LIABILITIES L3 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('TRD-L-AP-LOCAL',    'Local Supplier Payables',           'TRD-L-AP',     3, 'liability', 'posting', 'credit', 'ap',   2110, 'GRP-L-AP-TRADE'),
    ('TRD-L-AP-IMPORT',   'Import Supplier Payables',          'TRD-L-AP',     3, 'liability', 'posting', 'credit', 'ap',   2115, 'GRP-L-AP-TRADE'),
    ('TRD-L-ADV-LOCAL',   'Customer Advances — Local',         'TRD-L-ADV',    3, 'liability', 'posting', 'credit', NULL,   2210, 'GRP-L-CL-ADV'),
    ('TRD-L-ADV-EXPORT',  'Customer Advances — Export',        'TRD-L-ADV',    3, 'liability', 'posting', 'credit', NULL,   2220, 'GRP-L-CL-ADV'),
    ('TRD-L-ACC-SAL',     'Accrued Salaries',                  'TRD-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2310, 'GRP-L-ACC-SAL'),
    ('TRD-L-ACC-SI',      'Social Insurance Payable',          'TRD-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2315, 'GRP-L-ACC-OTHER'),
    ('TRD-L-ACC-LEAVE',   'Annual Leave Provision',             'TRD-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2320, 'GRP-L-ACC-LEAVE'),
    ('TRD-L-ACC-EOS',     'End of Service Provision',           'TRD-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2330, 'GRP-L-ACC-EOS'),
    ('TRD-L-ACC-OTHER',   'Other Accruals',                     'TRD-L-ACC',    3, 'liability', 'posting', 'credit', NULL,   2390, 'GRP-L-ACC-OTHER'),
    ('TRD-L-TAX-VAT',     'VAT Output Payable (14%)',           'TRD-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2410, 'GRP-L-TAX-VAT'),
    ('TRD-L-TAX-WHT',     'WHT Payable',                        'TRD-L-TAX',    3, 'liability', 'posting', 'credit', NULL,   2415, 'GRP-L-TAX-CIT'),
    ('TRD-L-TAX-CIT',     'Corporate Income Tax Payable (22.5%)', 'TRD-L-TAX', 3, 'liability', 'posting', 'credit', NULL,   2420, 'GRP-L-TAX-CIT'),
    ('TRD-L-ICP-LN',      'IC Loans Payable',                  'TRD-L-ICP',    3, 'liability', 'posting', 'credit', NULL,   2481, 'GRP-L-IC-LN'),
    ('TRD-L-ICP-TRD',     'IC Trade Payable',                  'TRD-L-ICP',    3, 'liability', 'posting', 'credit', 'ap',   2482, 'GRP-L-IC-TRD'),
    ('TRD-L-ICP-CURR',    'IC Current Account',                'TRD-L-ICP',    3, 'liability', 'posting', 'credit', NULL,   2483, 'GRP-L-IC-CURR'),
    ('TRD-L-LN-STJ',      'Short-term Bank Loans',              'TRD-L-LN',     3, 'liability', 'posting', 'credit', NULL,   2510, 'GRP-L-LN-CUR'),
    ('TRD-L-LN-LT',       'Long-term Bank Loans',               'TRD-L-LN',     3, 'liability', 'posting', 'credit', NULL,   2520, 'GRP-L-LN-LT'),
    ('TRD-L-LLEASE-CUR',  'Lease Liabilities — Current',        'TRD-L-LLEASE', 3, 'liability', 'posting', 'credit', NULL,   2710, 'GRP-L-LLEASE-CUR'),
    ('TRD-L-LLEASE-LT',   'Lease Liabilities — Non-Current',    'TRD-L-LLEASE', 3, 'liability', 'posting', 'credit', NULL,   2720, 'GRP-L-LLEASE-LT'),
    ('TRD-L-OL-DIV',      'Dividend Payable',                   'TRD-L-OL',     3, 'liability', 'posting', 'credit', NULL,   2910, 'GRP-L-OL-DIV');

    -- ── EQUITY L2 + L3 ─────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('TRD-Q-CAP', 'Share Capital',     'TRD-Q', 2, 'equity', 'header', 'credit', 3100, NULL),
    ('TRD-Q-RES', 'Reserves',          'TRD-Q', 2, 'equity', 'header', 'credit', 3200, NULL),
    ('TRD-Q-RE',  'Retained Earnings', 'TRD-Q', 2, 'equity', 'header', 'credit', 3300, NULL);

    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('TRD-Q-CAP-PAID',   'Paid-Up Share Capital',          'TRD-Q-CAP', 3, 'equity', 'posting', 'credit', 3110, 'GRP-Q-CAP-PAID'),
    ('TRD-Q-RES-LEGAL',  'Legal Reserve (5% EG Co. Law)',  'TRD-Q-RES', 3, 'equity', 'posting', 'credit', 3210, 'GRP-Q-RES-STAT'),
    ('TRD-Q-RES-TRANSL', 'Translation Reserve',            'TRD-Q-RES', 3, 'equity', 'posting', 'credit', 3220, 'GRP-Q-RES-TRANSL'),
    ('TRD-Q-RE-ACCUM',   'Accumulated Retained Earnings',  'TRD-Q-RE',  3, 'equity', 'posting', 'credit', 3310, 'GRP-Q-RE-ACCUM'),
    ('TRD-Q-RE-CUR',     'Current Year Profit/Loss',       'TRD-Q-RE',  3, 'equity', 'posting', 'credit', 3320, 'GRP-Q-RE-CUR'),
    ('TRD-Q-RE-DIV',     'Dividend Declared',              'TRD-Q-RE',  3, 'equity', 'posting', 'debit',  3330, 'GRP-Q-RE-ACCUM');

    -- ── REVENUE L2 + L3 ────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('TRD-R-SALE', 'Merchandise & Trading Revenue', 'TRD-R', 2, 'income', 'header', 'credit', 4100, NULL),
    ('TRD-R-SVC',  'Service Revenue',               'TRD-R', 2, 'income', 'header', 'credit', 4200, NULL),
    ('TRD-R-ICR',  'IC Revenue',                    'TRD-R', 2, 'income', 'header', 'credit', 4300, NULL),
    ('TRD-R-OOI',  'Other Operating Income',        'TRD-R', 2, 'income', 'header', 'credit', 4400, NULL),
    ('TRD-R-FIN',  'Finance Income',                'TRD-R', 2, 'income', 'header', 'credit', 4500, NULL);

    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('TRD-R-SALE-LOCAL',  'Revenue — Domestic Sales',       'TRD-R-SALE', 3, 'income', 'posting', 'credit', 4110, 'GRP-R-SALES-GOODS'),
    ('TRD-R-SALE-EXPORT', 'Revenue — Export Sales',         'TRD-R-SALE', 3, 'income', 'posting', 'credit', 4115, 'GRP-R-SALES-GOODS'),
    ('TRD-R-SALE-DIST',   'Revenue — Distribution',         'TRD-R-SALE', 3, 'income', 'posting', 'credit', 4120, 'GRP-R-SALES-GOODS'),
    ('TRD-R-SALE-DISC',   'Sales Discounts & Returns',      'TRD-R-SALE', 3, 'income', 'posting', 'debit',  4190, 'GRP-R-SALES-DISC'),
    ('TRD-R-SVC-COMM',    'Commission Income',              'TRD-R-SVC',  3, 'income', 'posting', 'credit', 4210, 'GRP-R-SALES-SVC'),
    ('TRD-R-SVC-AGENCY',  'Agency & Representation Fees',  'TRD-R-SVC',  3, 'income', 'posting', 'credit', 4220, 'GRP-R-SALES-SVC'),
    ('TRD-R-SVC-LOG',     'Logistics & Distribution Svcs', 'TRD-R-SVC',  3, 'income', 'posting', 'credit', 4230, 'GRP-R-SALES-SVC'),
    ('TRD-R-ICR-SVCS',    'IC Service Revenue',            'TRD-R-ICR',  3, 'income', 'posting', 'credit', 4310, 'GRP-R-ICR-SVCS'),
    ('TRD-R-ICR-MGMT',    'IC Management Fee Income',      'TRD-R-ICR',  3, 'income', 'posting', 'credit', 4320, 'GRP-R-ICR-MGMT'),
    ('TRD-R-OOI-GAIN',    'Gain on Disposal',              'TRD-R-OOI',  3, 'income', 'posting', 'credit', 4410, 'GRP-R-OOI-GAIN'),
    ('TRD-R-OOI-SCRAP',   'Scrap Sales',                   'TRD-R-OOI',  3, 'income', 'posting', 'credit', 4420, 'GRP-R-OOI-MISC'),
    ('TRD-R-OOI-MISC',    'Miscellaneous Income',          'TRD-R-OOI',  3, 'income', 'posting', 'credit', 4490, 'GRP-R-OOI-MISC'),
    ('TRD-R-FIN-INT',     'Interest Income',               'TRD-R-FIN',  3, 'income', 'posting', 'credit', 4510, 'GRP-R-FIN-INT'),
    ('TRD-R-FIN-FX',      'Foreign Exchange Gain',         'TRD-R-FIN',  3, 'income', 'posting', 'credit', 4520, 'GRP-R-FIN-FX');

    -- ── EXPENSES L2 ────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('TRD-E-COGS', 'Cost of Goods Sold',             'TRD-E', 2, 'expense', 'header', 'debit', 5100, NULL),
    ('TRD-E-SELL', 'Selling & Distribution',         'TRD-E', 2, 'expense', 'header', 'debit', 5200, NULL),
    ('TRD-E-GA',   'General & Administrative',       'TRD-E', 2, 'expense', 'header', 'debit', 5300, NULL),
    ('TRD-E-HR',   'HR & Payroll',                   'TRD-E', 2, 'expense', 'header', 'debit', 5400, NULL),
    ('TRD-E-DA',   'Depreciation & Amort',           'TRD-E', 2, 'expense', 'header', 'debit', 5500, NULL),
    ('TRD-E-ICE',  'Intercompany Expense',           'TRD-E', 2, 'expense', 'header', 'debit', 5600, NULL),
    ('TRD-E-FIN',  'Finance Costs',                  'TRD-E', 2, 'expense', 'header', 'debit', 5700, NULL),
    ('TRD-E-TAX',  'Tax Expense',                    'TRD-E', 2, 'expense', 'header', 'debit', 5800, NULL);

    -- ── EXPENSES L3 ────────────────────────────────────────────────────────
    INSERT INTO tmp_gl_eas (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order, group_map) VALUES
    ('TRD-E-COGS-MERCH',  'COGS — Merchandise',              'TRD-E-COGS', 3, 'expense', 'posting', 'debit', 5110, 'GRP-E-COGS-MAT'),
    ('TRD-E-COGS-IMP',    'Import Duties & Customs',         'TRD-E-COGS', 3, 'expense', 'posting', 'debit', 5115, 'GRP-E-COGS-FREIGHT'),
    ('TRD-E-COGS-FREIGHT','Freight & Insurance',             'TRD-E-COGS', 3, 'expense', 'posting', 'debit', 5120, 'GRP-E-COGS-FREIGHT'),
    ('TRD-E-COGS-WH',     'Warehousing Costs',               'TRD-E-COGS', 3, 'expense', 'posting', 'debit', 5125, 'GRP-E-COGS-OH'),
    ('TRD-E-COGS-INVWD',  'Inventory Write-Down',            'TRD-E-COGS', 3, 'expense', 'posting', 'debit', 5130, 'GRP-E-COGS-MAT'),
    ('TRD-E-SELL-SAL',    'Sales Team Salaries',             'TRD-E-SELL', 3, 'expense', 'posting', 'debit', 5210, 'GRP-E-SGA-SAL'),
    ('TRD-E-SELL-COMM',   'Sales Commissions',               'TRD-E-SELL', 3, 'expense', 'posting', 'debit', 5215, 'GRP-E-SGA-SAL'),
    ('TRD-E-SELL-ADV',    'Advertising & Promotion',         'TRD-E-SELL', 3, 'expense', 'posting', 'debit', 5220, 'GRP-E-SGA-MISC'),
    ('TRD-E-SELL-TRANSP', 'Delivery & Transport',            'TRD-E-SELL', 3, 'expense', 'posting', 'debit', 5225, 'GRP-E-COGS-FREIGHT'),
    ('TRD-E-GA-SAL',      'Admin Salaries',                  'TRD-E-GA',   3, 'expense', 'posting', 'debit', 5310, 'GRP-E-SGA-SAL'),
    ('TRD-E-GA-RENT',     'Office & Warehouse Rent',         'TRD-E-GA',   3, 'expense', 'posting', 'debit', 5315, 'GRP-E-SGA-RENT'),
    ('TRD-E-GA-UTIL',     'Utilities & Telecom',             'TRD-E-GA',   3, 'expense', 'posting', 'debit', 5320, 'GRP-E-SGA-MISC'),
    ('TRD-E-GA-IT',       'IT & Software',                   'TRD-E-GA',   3, 'expense', 'posting', 'debit', 5325, 'GRP-E-SGA-IT'),
    ('TRD-E-GA-LEGAL',    'Legal & Professional Fees',       'TRD-E-GA',   3, 'expense', 'posting', 'debit', 5330, 'GRP-E-SGA-PROF'),
    ('TRD-E-GA-MISC',     'Miscellaneous Admin',             'TRD-E-GA',   3, 'expense', 'posting', 'debit', 5390, 'GRP-E-SGA-MISC'),
    ('TRD-E-HR-SAL',      'Overhead Salaries',               'TRD-E-HR',   3, 'expense', 'posting', 'debit', 5410, 'GRP-E-HR-SAL'),
    ('TRD-E-HR-SI',       'Social Insurance Expense',        'TRD-E-HR',   3, 'expense', 'posting', 'debit', 5415, 'GRP-E-HR-BEN'),
    ('TRD-E-HR-LEAVE',    'Annual Leave Expense',             'TRD-E-HR',   3, 'expense', 'posting', 'debit', 5420, 'GRP-E-HR-BEN'),
    ('TRD-E-HR-EOS',      'EOS Benefit Expense',             'TRD-E-HR',   3, 'expense', 'posting', 'debit', 5425, 'GRP-E-HR-TERM'),
    ('TRD-E-DA-BLDG',     'Depreciation — Buildings',        'TRD-E-DA',   3, 'expense', 'posting', 'debit', 5510, 'GRP-E-DA-DEP'),
    ('TRD-E-DA-VEH',      'Depreciation — Vehicles',         'TRD-E-DA',   3, 'expense', 'posting', 'debit', 5515, 'GRP-E-DA-DEP'),
    ('TRD-E-DA-IT',       'Depreciation — IT',               'TRD-E-DA',   3, 'expense', 'posting', 'debit', 5520, 'GRP-E-DA-DEP'),
    ('TRD-E-DA-ROU',      'Depreciation — ROU Assets',       'TRD-E-DA',   3, 'expense', 'posting', 'debit', 5525, 'GRP-E-DA-DEP'),
    ('TRD-E-DA-IA',       'Amortisation — Intangibles',      'TRD-E-DA',   3, 'expense', 'posting', 'debit', 5530, 'GRP-E-DA-AMORT'),
    ('TRD-E-ICE-MGMT',    'IC Management Fee Expense',       'TRD-E-ICE',  3, 'expense', 'posting', 'debit', 5610, 'GRP-E-ICE-MGMT'),
    ('TRD-E-ICE-SVCS',    'IC Service Expense',              'TRD-E-ICE',  3, 'expense', 'posting', 'debit', 5620, 'GRP-E-ICE-SVCS'),
    ('TRD-E-FIN-INT',     'Interest Expense on Loans',       'TRD-E-FIN',  3, 'expense', 'posting', 'debit', 5710, 'GRP-E-FIN-INT'),
    ('TRD-E-FIN-LEASE',   'Finance Charge — Leases',         'TRD-E-FIN',  3, 'expense', 'posting', 'debit', 5720, 'GRP-E-FIN-LEASE'),
    ('TRD-E-FIN-FX',      'Foreign Exchange Loss',           'TRD-E-FIN',  3, 'expense', 'posting', 'debit', 5730, 'GRP-E-FIN-FX'),
    ('TRD-E-FIN-BNK',     'Bank Charges & Fees',             'TRD-E-FIN',  3, 'expense', 'posting', 'debit', 5740, 'GRP-E-FIN-BNK'),
    ('TRD-E-TAX-CIT',     'Corporate Income Tax (22.5%)',    'TRD-E-TAX',  3, 'expense', 'posting', 'debit', 5810, 'GRP-E-TAX-CIT'),
    ('TRD-E-TAX-DT',      'Deferred Tax Movement',           'TRD-E-TAX',  3, 'expense', 'posting', 'debit', 5820, 'GRP-E-TAX-DT'),
    ('TRD-E-TAX-WHT',     'Withholding Tax Expense',         'TRD-E-TAX',  3, 'expense', 'posting', 'debit', 5830, 'GRP-E-TAX-CIT'),
    ('TRD-E-OTHER-LOSS',  'Loss on Disposal',                'TRD-E',      3, 'expense', 'posting', 'debit', 5890, 'GRP-E-OTHER-LOSS'),
    ('TRD-E-OTHER-MISC',  'Miscellaneous Expense',           'TRD-E',      3, 'expense', 'posting', 'debit', 5895, 'GRP-E-OTHER-MISC');

    -- ── UPSERT ─────────────────────────────────────────────────────────────
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
    FROM tmp_gl_eas t
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
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
        updated_at     = now(),
        updated_by     = v_su;

    -- Wire parent_id
    UPDATE master.gl_account child
    SET    parent_id = parent.id,
           path      = parent.code || '/' || child.code
    FROM   tmp_gl_eas t
    JOIN   master.gl_account parent
           ON parent.tenant_id           = v_tid
          AND parent.chart_of_account_id = v_coa_id
          AND parent.code                = t.parent_code
    WHERE  child.tenant_id           = v_tid
      AND  child.chart_of_account_id = v_coa_id
      AND  child.code                = t.code
      AND  t.parent_code IS NOT NULL
      AND  (child.parent_id IS DISTINCT FROM parent.id);

    -- Assertions
    SELECT count(*) INTO v_total   FROM master.gl_account WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id;
    SELECT count(*) INTO v_posting FROM master.gl_account WHERE tenant_id = v_tid AND chart_of_account_id = v_coa_id AND node_type = 'posting';
    IF v_posting < 75 THEN
        RAISE EXCEPTION '[005_gl_eas] Expected ≥75 posting accounts, got %', v_posting;
    END IF;
    RAISE NOTICE '[005_gl_eas] COA-EAS seeded: % total (% posting)', v_total, v_posting;
END $coa_eas$;
