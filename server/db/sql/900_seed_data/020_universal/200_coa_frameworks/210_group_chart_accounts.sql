-- ============================================================================
-- ATHYPER GROUP — IFRS GROUP CONSOLIDATION CHART OF ACCOUNTS
-- ============================================================================
-- File:     210_group_chart_accounts.sql
-- Schema:   master.gl_account
-- Purpose:  ~150 GL accounts for COA-IFRS-GROUP (group consolidation chart)
--           5 class roots, ~30 L2 headers, ~115 L3 posting accounts per §19
-- Depends:  200_chart_catalog.sql (COA-IFRS-GROUP chart)
-- Idempotent: Yes — ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE
-- Spec ref: §19 Group Consolidation Chart
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '210_group_chart';
    v_version text := '1.0.0';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_total   int;
    v_roots   int;
    v_posting int;
BEGIN
    -- ── STAGE A: Resolve tenant & chart ─────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS-GROUP';
    IF v_coa_id IS NULL THEN
        RAISE EXCEPTION 'Chart COA-IFRS-GROUP not found — run 200_chart_catalog.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE B: Stage all accounts in temp table
    -- ══════════════════════════════════════════════════════════════════════

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
        group_map      text           -- NULL for group chart (it IS the group chart)
    ) ON COMMIT DROP;

    -- ──────────────────────────────────────────────────────────────────────
    -- B1: L1 ROOTS (5 class headers)
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-A', 'Assets',      NULL, 1, 'asset',     'header', 'debit',  1000),
    ('GRP-L', 'Liabilities', NULL, 1, 'liability', 'header', 'credit', 2000),
    ('GRP-Q', 'Equity',      NULL, 1, 'equity',    'header', 'credit', 3000),
    ('GRP-R', 'Revenue',     NULL, 1, 'income',    'header', 'credit', 4000),
    ('GRP-E', 'Expenses',    NULL, 1, 'expense',   'header', 'debit',  5000);

    -- ──────────────────────────────────────────────────────────────────────
    -- B2: L2 HEADERS — Assets
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-A-CASH', 'Cash & Bank',               'GRP-A', 2, 'asset', 'header', 'debit', 1100),
    ('GRP-A-AR',   'Trade Receivables',          'GRP-A', 2, 'asset', 'header', 'debit', 1200),
    ('GRP-A-OAR',  'Other Receivables',          'GRP-A', 2, 'asset', 'header', 'debit', 1300),
    ('GRP-A-INV',  'Inventory',                  'GRP-A', 2, 'asset', 'header', 'debit', 1400),
    ('GRP-A-FA',   'Fixed Assets',               'GRP-A', 2, 'asset', 'header', 'debit', 1500),
    ('GRP-A-DEP',  'Accumulated Depreciation',   'GRP-A', 2, 'asset', 'header', 'debit', 1600),
    ('GRP-A-IA',   'Intangible Assets',          'GRP-A', 2, 'asset', 'header', 'debit', 1700),
    ('GRP-A-ROU',  'Right-of-Use Assets',        'GRP-A', 2, 'asset', 'header', 'debit', 1750),
    ('GRP-A-ICR',  'Intercompany Receivables',   'GRP-A', 2, 'asset', 'header', 'debit', 1800);

    -- B2: L2 HEADERS — Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-L-AP',     'Trade Payables',         'GRP-L', 2, 'liability', 'header', 'credit', 2100),
    ('GRP-L-ACCR',   'Accruals & Provisions',  'GRP-L', 2, 'liability', 'header', 'credit', 2200),
    ('GRP-L-TAX',    'Tax Payables',           'GRP-L', 2, 'liability', 'header', 'credit', 2300),
    ('GRP-L-EMP',    'Employee Liabilities',   'GRP-L', 2, 'liability', 'header', 'credit', 2400),
    ('GRP-L-LEASE',  'Lease Liabilities',      'GRP-L', 2, 'liability', 'header', 'credit', 2500),
    ('GRP-L-ICP',    'Intercompany Payables',  'GRP-L', 2, 'liability', 'header', 'credit', 2600),
    ('GRP-L-DEFREV', 'Deferred Revenue',       'GRP-L', 2, 'liability', 'header', 'credit', 2700),
    ('GRP-L-OTHL',   'Other Liabilities',      'GRP-L', 2, 'liability', 'header', 'credit', 2800);

    -- B2: L2 HEADERS — Equity
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-Q-CAP', 'Share Capital',     'GRP-Q', 2, 'equity', 'header', 'credit', 3100),
    ('GRP-Q-RES', 'Reserves',          'GRP-Q', 2, 'equity', 'header', 'credit', 3200),
    ('GRP-Q-RE',  'Retained Earnings', 'GRP-Q', 2, 'equity', 'header', 'credit', 3300);

    -- B2: L2 HEADERS — Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-R-SALES', 'Sales Revenue',         'GRP-R', 2, 'income', 'header', 'credit', 4100),
    ('GRP-R-OOI',   'Other Operating Income','GRP-R', 2, 'income', 'header', 'credit', 4200),
    ('GRP-R-FIN',   'Finance Income',        'GRP-R', 2, 'income', 'header', 'credit', 4300),
    ('GRP-R-ICR',   'Intercompany Revenue',  'GRP-R', 2, 'income', 'header', 'credit', 4400);

    -- B2: L2 HEADERS — Expenses
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('GRP-E-COGS',  'Cost of Sales',                'GRP-E', 2, 'expense', 'header', 'debit', 5100),
    ('GRP-E-SGA',   'Selling, General & Admin',     'GRP-E', 2, 'expense', 'header', 'debit', 5200),
    ('GRP-E-HR',    'HR & Payroll',                 'GRP-E', 2, 'expense', 'header', 'debit', 5300),
    ('GRP-E-DA',    'Depreciation & Amortisation',  'GRP-E', 2, 'expense', 'header', 'debit', 5400),
    ('GRP-E-FIN',   'Finance Costs',                'GRP-E', 2, 'expense', 'header', 'debit', 5500),
    ('GRP-E-TAX',   'Tax Expense',                  'GRP-E', 2, 'expense', 'header', 'debit', 5600),
    ('GRP-E-ICE',   'Intercompany Expense',         'GRP-E', 2, 'expense', 'header', 'debit', 5700),
    ('GRP-E-OTHER', 'Other Expenses',               'GRP-E', 2, 'expense', 'header', 'debit', 5800);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Assets
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    -- Cash & Bank
    ('GRP-A-CASH-OPER',  'Operating Cash',                  'GRP-A-CASH', 3, 'asset', 'posting', 'debit',  NULL,         1110),
    ('GRP-A-CASH-BANK',  'Bank Accounts',                   'GRP-A-CASH', 3, 'asset', 'posting', 'debit',  NULL,         1120),
    ('GRP-A-CASH-PETTY', 'Petty Cash',                      'GRP-A-CASH', 3, 'asset', 'posting', 'debit',  NULL,         1130),
    -- Trade Receivables
    ('GRP-A-AR-TRADE',   'Trade Receivables Control',       'GRP-A-AR',   3, 'asset', 'posting', 'debit',  'ar',         1210),
    ('GRP-A-AR-ALLOW',   'Allowance for Doubtful Debts',    'GRP-A-AR',   3, 'contra_asset', 'posting', 'credit', NULL,         1220),
    -- Other Receivables
    ('GRP-A-OAR-ADVANCE','Advances to Suppliers',           'GRP-A-OAR',  3, 'asset', 'posting', 'debit',  NULL,         1310),
    ('GRP-A-OAR-PREPAY', 'Prepaid Expenses',                'GRP-A-OAR',  3, 'asset', 'posting', 'debit',  NULL,         1320),
    ('GRP-A-OAR-DEPOSIT','Deposits & Guarantees',           'GRP-A-OAR',  3, 'asset', 'posting', 'debit',  NULL,         1330),
    -- Inventory
    ('GRP-A-INV-RAW',    'Raw Materials Inventory',         'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'inventory',  1410),
    ('GRP-A-INV-WIP',    'Work in Progress',                'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'wip',        1420),
    ('GRP-A-INV-FG',     'Finished Goods Inventory',        'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'inventory',  1430),
    ('GRP-A-INV-TRADE',  'Trading Goods Inventory',         'GRP-A-INV',  3, 'asset', 'posting', 'debit',  'inventory',  1440),
    -- Fixed Assets
    ('GRP-A-FA-LAND',    'Land',                            'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1510),
    ('GRP-A-FA-BLDG',    'Buildings',                       'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1520),
    ('GRP-A-FA-PLANT',   'Plant & Machinery',               'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1530),
    ('GRP-A-FA-VEH',     'Vehicles',                        'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1540),
    ('GRP-A-FA-IT',      'IT Equipment',                    'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1550),
    ('GRP-A-FA-FURN',    'Furniture & Fixtures',            'GRP-A-FA',   3, 'asset', 'posting', 'debit',  'asset',      1560),
    ('GRP-A-FA-CWIP',    'Capital Work in Progress',        'GRP-A-FA',   3, 'asset', 'posting', 'debit',  NULL,         1570),
    -- Accumulated Depreciation
    ('GRP-A-DEP-BLDG',   'Accum Depr — Buildings',         'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1620),
    ('GRP-A-DEP-PLANT',  'Accum Depr — Plant & Machinery',  'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1630),
    ('GRP-A-DEP-VEH',    'Accum Depr — Vehicles',           'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1640),
    ('GRP-A-DEP-IT',     'Accum Depr — IT Equipment',       'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1650),
    ('GRP-A-DEP-FURN',   'Accum Depr — Furniture',          'GRP-A-DEP',  3, 'contra_asset', 'posting', 'credit', NULL,         1660),
    -- Intangible Assets
    ('GRP-A-IA-GW',      'Goodwill',                        'GRP-A-IA',   3, 'asset', 'posting', 'debit',  NULL,         1710),
    ('GRP-A-IA-SW',      'Software & Licences',             'GRP-A-IA',   3, 'asset', 'posting', 'debit',  NULL,         1720),
    ('GRP-A-IA-AMORT',   'Accum Amortisation',              'GRP-A-IA',   3, 'contra_asset', 'posting', 'credit', NULL,         1730),
    -- Right-of-Use Assets
    ('GRP-A-ROU-PROP',   'Right-of-Use — Property',         'GRP-A-ROU',  3, 'asset', 'posting', 'debit',  NULL,         1751),
    ('GRP-A-ROU-EQUIP',  'Right-of-Use — Equipment',        'GRP-A-ROU',  3, 'asset', 'posting', 'debit',  NULL,         1752),
    ('GRP-A-ROU-AMORT',  'Accum Depr — ROU',                'GRP-A-ROU',  3, 'contra_asset', 'posting', 'credit', NULL,         1760),
    -- Intercompany Receivables
    ('GRP-A-ICR-TRADE',  'IC Receivables — Trade',           'GRP-A-ICR',  3, 'asset', 'posting', 'debit',  NULL,         1810),
    ('GRP-A-ICR-LOAN',   'IC Receivables — Loans',           'GRP-A-ICR',  3, 'asset', 'posting', 'debit',  NULL,         1820);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Liabilities
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    -- Trade Payables
    ('GRP-L-AP-TRADE',      'Trade Payables Control',        'GRP-L-AP',     3, 'liability', 'posting', 'credit', 'ap',  2110),
    ('GRP-L-AP-RETENTION',  'Retention Payable',             'GRP-L-AP',     3, 'liability', 'posting', 'credit', NULL,  2120),
    -- Accruals & Provisions
    ('GRP-L-ACCR-GEN',      'General Accruals',              'GRP-L-ACCR',   3, 'liability', 'posting', 'credit', NULL,  2210),
    ('GRP-L-ACCR-PROV',     'Provisions',                    'GRP-L-ACCR',   3, 'liability', 'posting', 'credit', NULL,  2220),
    -- Tax Payables
    ('GRP-L-TAX-CIT',       'Corporate Income Tax Payable',  'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,  2310),
    ('GRP-L-TAX-VAT-OUT',   'VAT/GST Output',               'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,  2320),
    ('GRP-L-TAX-VAT-IN',    'VAT/GST Input (Receivable)',    'GRP-L-TAX',    3, 'contra_liability', 'posting', 'debit',  NULL,  2330),
    ('GRP-L-TAX-WHT',       'Withholding Tax Payable',       'GRP-L-TAX',    3, 'liability', 'posting', 'credit', NULL,  2340),
    -- Employee Liabilities
    ('GRP-L-EMP-SAL',       'Salaries Payable',              'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2410),
    ('GRP-L-EMP-BEN',       'Employee Benefits Payable',     'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2420),
    ('GRP-L-EMP-LEAVE',     'Leave Provision',               'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2430),
    ('GRP-L-EMP-EOS',       'End of Service / Gratuity',     'GRP-L-EMP',    3, 'liability', 'posting', 'credit', NULL,  2440),
    -- Lease Liabilities
    ('GRP-L-LEASE-CUR',     'Lease Liabilities — Current',       'GRP-L-LEASE',  3, 'liability', 'posting', 'credit', NULL, 2510),
    ('GRP-L-LEASE-NCR',     'Lease Liabilities — Non-Current',   'GRP-L-LEASE',  3, 'liability', 'posting', 'credit', NULL, 2520),
    -- Intercompany Payables
    ('GRP-L-ICP-TRADE',     'IC Payables — Trade',                'GRP-L-ICP',    3, 'liability', 'posting', 'credit', NULL, 2610),
    ('GRP-L-ICP-LOAN',      'IC Payables — Loans',                'GRP-L-ICP',    3, 'liability', 'posting', 'credit', NULL, 2620),
    -- Deferred Revenue
    ('GRP-L-DEFREV-SVC',    'Deferred Revenue — Services',        'GRP-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2710),
    ('GRP-L-DEFREV-PROJ',   'Deferred Revenue — Projects',        'GRP-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2720),
    -- Other Liabilities
    ('GRP-L-OTHL-OTHER',    'Other Current Liabilities',          'GRP-L-OTHL',   3, 'liability', 'posting', 'credit', NULL, 2810);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Equity
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    ('GRP-Q-CAP-ISSUED', 'Issued Share Capital',          'GRP-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3110),
    ('GRP-Q-CAP-PREM',   'Share Premium',                 'GRP-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3120),
    ('GRP-Q-RES-STAT',   'Statutory Reserve',             'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3210),
    ('GRP-Q-RES-GEN',    'General Reserve',               'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3220),
    ('GRP-Q-RES-TRANS',  'Translation Reserve',           'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3230),
    ('GRP-Q-RES-HEDGE',  'Hedging Reserve',               'GRP-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3240),
    ('GRP-Q-RE-OPENING', 'Retained Earnings — Opening',   'GRP-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3310),
    ('GRP-Q-RE-CY',      'Current Year P&L',              'GRP-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3320),
    ('GRP-Q-RE-DIV',     'Dividends Declared',            'GRP-Q-RE',  3, 'contra_equity', 'posting', 'debit',  NULL, 3330);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Revenue
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    ('GRP-R-SALES-GOODS', 'Revenue — Goods',              'GRP-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4110),
    ('GRP-R-SALES-SVC',   'Revenue — Services',           'GRP-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4120),
    ('GRP-R-SALES-PROJ',  'Revenue — Projects',           'GRP-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4130),
    ('GRP-R-OOI-RENTAL',  'Rental Income',                'GRP-R-OOI',   3, 'income', 'posting', 'credit', NULL, 4210),
    ('GRP-R-OOI-GAIN',    'Gain on Disposal',             'GRP-R-OOI',   3, 'income', 'posting', 'credit', NULL, 4220),
    ('GRP-R-OOI-MISC',    'Miscellaneous Income',         'GRP-R-OOI',   3, 'income', 'posting', 'credit', NULL, 4230),
    ('GRP-R-FIN-INT',     'Interest Income',              'GRP-R-FIN',   3, 'income', 'posting', 'credit', NULL, 4310),
    ('GRP-R-FIN-FX',      'Foreign Exchange Gain',        'GRP-R-FIN',   3, 'income', 'posting', 'credit', NULL, 4320),
    ('GRP-R-ICR-MGMT',    'IC Management Fee Income',     'GRP-R-ICR',   3, 'income', 'posting', 'credit', NULL, 4410),
    ('GRP-R-ICR-SVCS',    'IC Service Revenue',           'GRP-R-ICR',   3, 'income', 'posting', 'credit', NULL, 4420);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Expenses
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order) VALUES
    -- Cost of Sales
    ('GRP-E-COGS-MAT',     'Materials Consumed',           'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5110),
    ('GRP-E-COGS-LABOUR',  'Direct Labour',                'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5120),
    ('GRP-E-COGS-OH',      'Production Overhead',          'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5130),
    ('GRP-E-COGS-SUB',     'Subcontracting',               'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5140),
    ('GRP-E-COGS-FREIGHT', 'Freight & Distribution',       'GRP-E-COGS',  3, 'expense', 'posting', 'debit', NULL, 5150),
    -- SGA
    ('GRP-E-SGA-OFFICE',   'Office & Admin',               'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5210),
    ('GRP-E-SGA-MKTG',     'Marketing & Advertising',      'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5220),
    ('GRP-E-SGA-TRAVEL',   'Travel & Entertainment',       'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5230),
    ('GRP-E-SGA-PROF',     'Professional Fees',            'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5240),
    ('GRP-E-SGA-IT',       'IT & Communications',          'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5250),
    ('GRP-E-SGA-INS',      'Insurance',                    'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5260),
    ('GRP-E-SGA-RENT',     'Rent & Occupancy',             'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5270),
    ('GRP-E-SGA-UTIL',     'Utilities',                    'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5280),
    ('GRP-E-SGA-REPAIR',   'Repairs & Maintenance',        'GRP-E-SGA',   3, 'expense', 'posting', 'debit', NULL, 5290),
    -- HR & Payroll
    ('GRP-E-HR-SAL',       'Salaries & Wages',             'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5310),
    ('GRP-E-HR-BEN',       'Employee Benefits',            'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5320),
    ('GRP-E-HR-TRAIN',     'Training & Development',       'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5330),
    ('GRP-E-HR-RECRUIT',   'Recruitment',                  'GRP-E-HR',    3, 'expense', 'posting', 'debit', NULL, 5340),
    -- Depreciation & Amortisation
    ('GRP-E-DA-BLDG',      'Depreciation — Buildings',     'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5410),
    ('GRP-E-DA-PLANT',     'Depreciation — Plant',         'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5420),
    ('GRP-E-DA-VEH',       'Depreciation — Vehicles',      'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5430),
    ('GRP-E-DA-IT',        'Depreciation — IT',            'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5440),
    ('GRP-E-DA-ROU',       'Depreciation — ROU Assets',    'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5450),
    ('GRP-E-DA-AMORT',     'Amortisation — Intangibles',   'GRP-E-DA',    3, 'expense', 'posting', 'debit', NULL, 5460),
    -- Finance Costs
    ('GRP-E-FIN-INT',      'Interest Expense',             'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5510),
    ('GRP-E-FIN-LEASE',    'Lease Interest (IFRS 16)',     'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5520),
    ('GRP-E-FIN-FX',       'Foreign Exchange Loss',        'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5530),
    ('GRP-E-FIN-BANK',     'Bank Charges',                 'GRP-E-FIN',   3, 'expense', 'posting', 'debit', NULL, 5540),
    -- Tax Expense
    ('GRP-E-TAX-CIT',      'Income Tax Expense',           'GRP-E-TAX',   3, 'expense', 'posting', 'debit', NULL, 5610),
    ('GRP-E-TAX-DT',       'Deferred Tax Expense',         'GRP-E-TAX',   3, 'expense', 'posting', 'debit', NULL, 5620),
    -- Intercompany Expense
    ('GRP-E-ICE-MGMT',     'IC Management Fee Expense',    'GRP-E-ICE',   3, 'expense', 'posting', 'debit', NULL, 5710),
    ('GRP-E-ICE-SVCS',     'IC Service Expense',           'GRP-E-ICE',   3, 'expense', 'posting', 'debit', NULL, 5720),
    -- Other Expenses
    ('GRP-E-OTHER-LOSS',   'Loss on Disposal',             'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5810),
    ('GRP-E-OTHER-IMPAIR', 'Impairment Loss',              'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5820),
    ('GRP-E-OTHER-MISC',   'Miscellaneous Expense',        'GRP-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5830);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: UPSERT — L1 roots (parent_code IS NULL)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        NULL, t.level_no, t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT — L2 headers (parent is L1 root)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.code || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    JOIN master.gl_account p
      ON p.tenant_id = v_tid
     AND p.chart_of_account_id = v_coa_id
     AND p.code = t.parent_code
    WHERE t.level_no = 2
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE E: UPSERT — L3 posting accounts (parent is L2 header)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order, tags,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.path || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, t.subledger_type,
        t.sort_order, '[]'::jsonb,
        v_meta || jsonb_build_object('_display_no', t.sort_order::text),
        'active', v_su
    FROM tmp_gl t
    JOIN master.gl_account p
      ON p.tenant_id = v_tid
     AND p.chart_of_account_id = v_coa_id
     AND p.code = t.parent_code
    WHERE t.level_no = 3
    ON CONFLICT (tenant_id, chart_of_account_id, code) DO UPDATE SET
        name           = EXCLUDED.name,
        parent_id      = EXCLUDED.parent_id,
        level_no       = EXCLUDED.level_no,
        path           = EXCLUDED.path,
        description    = EXCLUDED.description,
        account_class  = EXCLUDED.account_class,
        node_type      = EXCLUDED.node_type,
        normal_balance = EXCLUDED.normal_balance,
        subledger_type = EXCLUDED.subledger_type,
        sort_order     = EXCLUDED.sort_order,
        metadata       = master.gl_account.metadata
                         || jsonb_build_object('_seed', jsonb_build_object(
                                'pack',      v_pack,
                                'version',   v_version,
                                'seeded_at', now()::text
                            ))
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.gl_account.name, master.gl_account.parent_id,
           master.gl_account.level_no, master.gl_account.path,
           master.gl_account.description, master.gl_account.account_class,
           master.gl_account.node_type, master.gl_account.normal_balance,
           master.gl_account.subledger_type, master.gl_account.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.level_no, EXCLUDED.path,
           EXCLUDED.description, EXCLUDED.account_class,
           EXCLUDED.node_type, EXCLUDED.normal_balance,
           EXCLUDED.subledger_type, EXCLUDED.sort_order);

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE F: Assertions
    -- ══════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_total
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_roots
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND parent_id IS NULL;

    SELECT count(*) INTO v_posting
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND node_type = 'posting';

    IF v_total < 140 THEN
        RAISE EXCEPTION '[210_group_chart] Expected >= 140 total accounts, got %', v_total;
    END IF;

    IF v_roots <> 5 THEN
        RAISE EXCEPTION '[210_group_chart] Expected 5 class roots, got %', v_roots;
    END IF;

    IF v_posting < 90 THEN
        RAISE EXCEPTION '[210_group_chart] Expected >= 90 posting accounts, got %', v_posting;
    END IF;

    RAISE NOTICE '[210_group_chart] Group chart seeded: % total accounts (% roots, % posting)',
        v_total, v_roots, v_posting;

END $seed$;
