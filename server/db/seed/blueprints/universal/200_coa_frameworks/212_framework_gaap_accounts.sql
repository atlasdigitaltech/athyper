-- COA-GAAP operating chart with USGAAP-* codes. Every posting account maps back
-- to COA-GROUP via metadata._group_map for consolidation.

DO $seed$
DECLARE
    v_tid          uuid;
    v_su           uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_pack         text := '212_framework_gaap';
    v_version      text := '1.0.0';
    v_meta         jsonb;
    v_coa_id       uuid;
    v_group_coa_id uuid;
    v_total        int;
    v_roots        int;
    v_posting      int;
    v_gmap_ok      int;
    v_gmap_missing int;
BEGIN
    -- Stage A: Resolve tenant and charts.
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-GAAP';
    IF v_coa_id IS NULL THEN
        RAISE EXCEPTION 'Chart COA-GAAP not found - run 200_chart_catalog.sql first';
    END IF;

    SELECT id INTO v_group_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-GROUP';
    IF v_group_coa_id IS NULL THEN
        RAISE EXCEPTION 'Internal COA-GROUP taxonomy not found - run 210_group_chart_accounts.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- Stage B: Stage the account hierarchy.
    CREATE TEMP TABLE tmp_gl (
        seed_id        uuid,
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

    -- L1 roots.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('USGAAP-A', 'Assets',      NULL, 1, 'asset',     'header', 'debit',  1000),
    ('USGAAP-L', 'Liabilities', NULL, 1, 'liability', 'header', 'credit', 2000),
    ('USGAAP-Q', 'Equity',      NULL, 1, 'equity',    'header', 'credit', 3000),
    ('USGAAP-R', 'Revenue',     NULL, 1, 'income',    'header', 'credit', 4000),
    ('USGAAP-E', 'Expenses',    NULL, 1, 'expense',   'header', 'debit',  5000);

    -- L2 headers - Assets.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('USGAAP-A-CASH',   'Cash and Cash Equivalents',     'USGAAP-A', 2, 'asset', 'header', 'debit', 1100),
    ('USGAAP-A-AR',     'Accounts Receivable',           'USGAAP-A', 2, 'asset', 'header', 'debit', 1200),
    ('USGAAP-A-OAR',    'Other Receivables and Prepaids','USGAAP-A', 2, 'asset', 'header', 'debit', 1300),
    ('USGAAP-A-INV',    'Inventory',                     'USGAAP-A', 2, 'asset', 'header', 'debit', 1400),
    ('USGAAP-A-FA',     'Property, Plant and Equipment', 'USGAAP-A', 2, 'asset', 'header', 'debit', 1500),
    ('USGAAP-A-DEP',    'Accumulated Depreciation',      'USGAAP-A', 2, 'asset', 'header', 'debit', 1600),
    ('USGAAP-A-IA',     'Intangible Assets',             'USGAAP-A', 2, 'asset', 'header', 'debit', 1700),
    ('USGAAP-A-ROU',    'Right-of-Use Assets',           'USGAAP-A', 2, 'asset', 'header', 'debit', 1750),
    ('USGAAP-A-ICR',    'Intercompany Receivables',      'USGAAP-A', 2, 'asset', 'header', 'debit', 1800),
    ('USGAAP-A-DTAX',   'Deferred Tax Assets',           'USGAAP-A', 2, 'asset', 'header', 'debit', 1850),
    ('USGAAP-A-INVEST', 'Investments and Other Assets',  'USGAAP-A', 2, 'asset', 'header', 'debit', 1900);

    -- L2 headers - Liabilities.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('USGAAP-L-AP',     'Accounts Payable',            'USGAAP-L', 2, 'liability', 'header', 'credit', 2100),
    ('USGAAP-L-ACCR',   'Accrued Liabilities',         'USGAAP-L', 2, 'liability', 'header', 'credit', 2200),
    ('USGAAP-L-TAX',    'Tax Payables',                'USGAAP-L', 2, 'liability', 'header', 'credit', 2300),
    ('USGAAP-L-PAYROLL','Payroll Liabilities',         'USGAAP-L', 2, 'liability', 'header', 'credit', 2400),
    ('USGAAP-L-DEBT',   'Debt and Notes Payable',      'USGAAP-L', 2, 'liability', 'header', 'credit', 2450),
    ('USGAAP-L-LEASE',  'Lease Liabilities',           'USGAAP-L', 2, 'liability', 'header', 'credit', 2500),
    ('USGAAP-L-ICP',    'Intercompany Payables',       'USGAAP-L', 2, 'liability', 'header', 'credit', 2600),
    ('USGAAP-L-DEFREV', 'Deferred Revenue',            'USGAAP-L', 2, 'liability', 'header', 'credit', 2700),
    ('USGAAP-L-DTAX',   'Deferred Tax Liabilities',    'USGAAP-L', 2, 'liability', 'header', 'credit', 2750),
    ('USGAAP-L-OTHER',  'Other Liabilities',           'USGAAP-L', 2, 'liability', 'header', 'credit', 2800);

    -- L2 headers - Equity.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('USGAAP-Q-STOCK', 'Capital Stock',               'USGAAP-Q', 2, 'equity', 'header', 'credit', 3100),
    ('USGAAP-Q-APIC',  'Additional Paid-In Capital',  'USGAAP-Q', 2, 'equity', 'header', 'credit', 3200),
    ('USGAAP-Q-TS',    'Treasury Stock',              'USGAAP-Q', 2, 'equity', 'header', 'credit', 3250),
    ('USGAAP-Q-RE',    'Retained Earnings',           'USGAAP-Q', 2, 'equity', 'header', 'credit', 3300),
    ('USGAAP-Q-AOCI',  'Accumulated OCI',             'USGAAP-Q', 2, 'equity', 'header', 'credit', 3400);

    -- L2 headers - Revenue.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('USGAAP-R-SALES',  'Product Sales',             'USGAAP-R', 2, 'income', 'header', 'credit', 4100),
    ('USGAAP-R-SVC',    'Service Revenue',           'USGAAP-R', 2, 'income', 'header', 'credit', 4200),
    ('USGAAP-R-SUBS',   'Subscription Revenue',      'USGAAP-R', 2, 'income', 'header', 'credit', 4250),
    ('USGAAP-R-CONTRA', 'Contra Revenue',            'USGAAP-R', 2, 'income', 'header', 'credit', 4300),
    ('USGAAP-R-OOI',    'Other Operating Income',    'USGAAP-R', 2, 'income', 'header', 'credit', 4400),
    ('USGAAP-R-FIN',    'Finance Income',            'USGAAP-R', 2, 'income', 'header', 'credit', 4500),
    ('USGAAP-R-ICR',    'Intercompany Revenue',      'USGAAP-R', 2, 'income', 'header', 'credit', 4600);

    -- L2 headers - Expenses.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('USGAAP-E-COGS',    'Cost of Goods Sold',           'USGAAP-E', 2, 'expense', 'header', 'debit', 5100),
    ('USGAAP-E-SALES',   'Sales and Marketing',          'USGAAP-E', 2, 'expense', 'header', 'debit', 5200),
    ('USGAAP-E-GA',      'General and Administrative',   'USGAAP-E', 2, 'expense', 'header', 'debit', 5300),
    ('USGAAP-E-RD',      'Research and Development',     'USGAAP-E', 2, 'expense', 'header', 'debit', 5400),
    ('USGAAP-E-PAYROLL', 'Payroll and Benefits',         'USGAAP-E', 2, 'expense', 'header', 'debit', 5450),
    ('USGAAP-E-DA',      'Depreciation and Amortization','USGAAP-E', 2, 'expense', 'header', 'debit', 5500),
    ('USGAAP-E-FIN',     'Interest and Finance Costs',   'USGAAP-E', 2, 'expense', 'header', 'debit', 5600),
    ('USGAAP-E-TAX',     'Income Tax Expense',           'USGAAP-E', 2, 'expense', 'header', 'debit', 5700),
    ('USGAAP-E-ICE',     'Intercompany Expense',         'USGAAP-E', 2, 'expense', 'header', 'debit', 5800),
    ('USGAAP-E-OTHER',   'Other Expenses',               'USGAAP-E', 2, 'expense', 'header', 'debit', 5900);

    -- L3 posting accounts - Assets.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('USGAAP-A-CASH-OPER',      'Operating Cash',                  'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1110, 'GRP-A-CASH-OPER'),
    ('USGAAP-A-CASH-CHECKING',  'Checking Accounts',               'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1121, 'GRP-A-CASH-BANK'),
    ('USGAAP-A-CASH-SAVINGS',   'Savings Accounts',                'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1122, 'GRP-A-CASH-BANK'),
    ('USGAAP-A-CASH-PAYROLL',   'Payroll Cash Account',            'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1123, 'GRP-A-CASH-BANK'),
    ('USGAAP-A-CASH-MERCHANT',  'Merchant Clearing Cash',          'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1124, 'GRP-A-CASH-BANK'),
    ('USGAAP-A-CASH-MM',        'Money Market Funds',              'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1125, 'GRP-A-CASH-BANK'),
    ('USGAAP-A-CASH-PETTY',     'Petty Cash',                      'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1130, 'GRP-A-CASH-PETTY'),
    ('USGAAP-A-CASH-RESTRICT',  'Restricted Cash',                 'USGAAP-A-CASH',   3, 'asset',        'posting', 'debit',  NULL,        1150, 'GRP-A-CASH-OPER'),
    ('USGAAP-A-AR-TRADE',       'Trade Accounts Receivable',       'USGAAP-A-AR',     3, 'asset',        'posting', 'debit',  'ar',        1210, 'GRP-A-AR-TRADE'),
    ('USGAAP-A-AR-UNBILLED',    'Unbilled Receivables',            'USGAAP-A-AR',     3, 'asset',        'posting', 'debit',  NULL,        1220, 'GRP-A-AR-TRADE'),
    ('USGAAP-A-AR-CONTRACT',    'Contract Assets',                 'USGAAP-A-AR',     3, 'asset',        'posting', 'debit',  NULL,        1230, 'GRP-A-AR-TRADE'),
    ('USGAAP-A-AR-NOTES',       'Notes Receivable',                'USGAAP-A-AR',     3, 'asset',        'posting', 'debit',  NULL,        1235, 'GRP-A-AR-TRADE'),
    ('USGAAP-A-AR-RETENTION',   'Retention Receivable',            'USGAAP-A-AR',     3, 'asset',        'posting', 'debit',  'ar',        1240, 'GRP-A-AR-TRADE'),
    ('USGAAP-A-AR-ALLOW',       'Allowance for Credit Losses',     'USGAAP-A-AR',     3, 'contra_asset', 'posting', 'credit', NULL,        1250, 'GRP-A-AR-ALLOW'),
    ('USGAAP-A-AR-RELATED',     'Related Party Receivables',       'USGAAP-A-AR',     3, 'asset',        'posting', 'debit',  NULL,        1260, 'GRP-A-AR-TRADE'),
    ('USGAAP-A-OAR-PREPAID',    'Prepaid Expenses',                'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1310, 'GRP-A-OAR-PREPAY'),
    ('USGAAP-A-OAR-PREPINS',    'Prepaid Insurance',               'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1315, 'GRP-A-OAR-PREPAY'),
    ('USGAAP-A-OAR-PREPRENT',   'Prepaid Rent',                    'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1320, 'GRP-A-OAR-PREPAY'),
    ('USGAAP-A-OAR-SUPADV',     'Supplier Advances',               'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1330, 'GRP-A-OAR-ADVANCE'),
    ('USGAAP-A-OAR-DEPOSIT',    'Deposits',                        'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1340, 'GRP-A-OAR-DEPOSIT'),
    ('USGAAP-A-OAR-EMPADV',     'Employee Advances',               'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1350, 'GRP-A-OAR-ADVANCE'),
    ('USGAAP-A-OAR-INTREC',     'Interest Receivable',             'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1360, 'GRP-A-OAR-ADVANCE'),
    ('USGAAP-A-OAR-TAXREC',     'Income Tax Receivable',           'USGAAP-A-OAR',    3, 'asset',        'posting', 'debit',  NULL,        1370, 'GRP-L-TAX-VAT-IN'),
    ('USGAAP-A-INV-RAW',        'Raw Materials Inventory',         'USGAAP-A-INV',    3, 'asset',        'posting', 'debit',  'inventory', 1410, 'GRP-A-INV-RAW'),
    ('USGAAP-A-INV-WIP',        'Work in Process Inventory',       'USGAAP-A-INV',    3, 'asset',        'posting', 'debit',  'wip',       1420, 'GRP-A-INV-WIP'),
    ('USGAAP-A-INV-FG',         'Finished Goods Inventory',        'USGAAP-A-INV',    3, 'asset',        'posting', 'debit',  'inventory', 1430, 'GRP-A-INV-FG'),
    ('USGAAP-A-INV-MERCH',      'Merchandise Inventory',           'USGAAP-A-INV',    3, 'asset',        'posting', 'debit',  'inventory', 1440, 'GRP-A-INV-TRADE'),
    ('USGAAP-A-INV-SUPPLIES',   'Manufacturing Supplies',          'USGAAP-A-INV',    3, 'asset',        'posting', 'debit',  'inventory', 1450, 'GRP-A-INV-RAW'),
    ('USGAAP-A-INV-SPARES',     'Spare Parts Inventory',           'USGAAP-A-INV',    3, 'asset',        'posting', 'debit',  'inventory', 1455, 'GRP-A-INV-RAW'),
    ('USGAAP-A-INV-TRANSIT',    'Inventory in Transit',            'USGAAP-A-INV',    3, 'asset',        'posting', 'debit',  NULL,        1460, 'GRP-A-INV-RAW'),
    ('USGAAP-A-INV-OBSERVE',    'Obsolescence Reserve',            'USGAAP-A-INV',    3, 'contra_asset', 'posting', 'credit', NULL,        1470, 'GRP-A-INV-RAW'),
    ('USGAAP-A-INV-LCM',        'Lower of Cost or Market Reserve', 'USGAAP-A-INV',    3, 'contra_asset', 'posting', 'credit', NULL,        1475, 'GRP-A-INV-RAW'),
    ('USGAAP-A-FA-LAND',        'Land',                            'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1510, 'GRP-A-FA-LAND'),
    ('USGAAP-A-FA-BLDG',        'Buildings',                       'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1520, 'GRP-A-FA-BLDG'),
    ('USGAAP-A-FA-MACH',        'Machinery and Equipment',         'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1530, 'GRP-A-FA-PLANT'),
    ('USGAAP-A-FA-VEH',         'Vehicles',                        'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1535, 'GRP-A-FA-VEH'),
    ('USGAAP-A-FA-OFFICE',      'Office Equipment',                'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1540, 'GRP-A-FA-IT'),
    ('USGAAP-A-FA-IT',          'Computer Hardware',               'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1550, 'GRP-A-FA-IT'),
    ('USGAAP-A-FA-FURN',        'Furniture and Fixtures',          'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1560, 'GRP-A-FA-FURN'),
    ('USGAAP-A-FA-LHI',         'Leasehold Improvements',          'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  'asset',     1570, 'GRP-A-FA-BLDG'),
    ('USGAAP-A-FA-CIP',         'Construction in Progress',        'USGAAP-A-FA',     3, 'asset',        'posting', 'debit',  NULL,        1580, 'GRP-A-FA-CWIP'),
    ('USGAAP-A-DEP-BLDG',       'Accum Depreciation - Buildings',  'USGAAP-A-DEP',    3, 'contra_asset', 'posting', 'credit', NULL,        1620, 'GRP-A-DEP-BLDG'),
    ('USGAAP-A-DEP-MACH',       'Accum Depreciation - Machinery',  'USGAAP-A-DEP',    3, 'contra_asset', 'posting', 'credit', NULL,        1630, 'GRP-A-DEP-PLANT'),
    ('USGAAP-A-DEP-OFFICE',     'Accum Depreciation - Office Eq',  'USGAAP-A-DEP',    3, 'contra_asset', 'posting', 'credit', NULL,        1640, 'GRP-A-DEP-IT'),
    ('USGAAP-A-DEP-IT',         'Accum Depreciation - Computer Eq','USGAAP-A-DEP',    3, 'contra_asset', 'posting', 'credit', NULL,        1650, 'GRP-A-DEP-IT'),
    ('USGAAP-A-DEP-FURN',       'Accum Depreciation - Furniture',  'USGAAP-A-DEP',    3, 'contra_asset', 'posting', 'credit', NULL,        1660, 'GRP-A-DEP-FURN'),
    ('USGAAP-A-DEP-LHI',        'Accum Depreciation - LHI',        'USGAAP-A-DEP',    3, 'contra_asset', 'posting', 'credit', NULL,        1670, 'GRP-A-DEP-BLDG'),
    ('USGAAP-A-DEP-VEH',        'Accum Depreciation - Vehicles',   'USGAAP-A-DEP',    3, 'contra_asset', 'posting', 'credit', NULL,        1680, 'GRP-A-DEP-VEH'),
    ('USGAAP-A-IA-GW',          'Goodwill',                        'USGAAP-A-IA',     3, 'asset',        'posting', 'debit',  NULL,        1710, 'GRP-A-IA-GW'),
    ('USGAAP-A-IA-SW-ACQ',      'Acquired Software',               'USGAAP-A-IA',     3, 'asset',        'posting', 'debit',  NULL,        1720, 'GRP-A-IA-SW'),
    ('USGAAP-A-IA-SW-INTERNAL', 'Internal-Use Software',           'USGAAP-A-IA',     3, 'asset',        'posting', 'debit',  NULL,        1725, 'GRP-A-IA-SW'),
    ('USGAAP-A-IA-PATENT',      'Patents',                         'USGAAP-A-IA',     3, 'asset',        'posting', 'debit',  NULL,        1730, 'GRP-A-IA-SW'),
    ('USGAAP-A-IA-CUST',        'Customer Lists',                  'USGAAP-A-IA',     3, 'asset',        'posting', 'debit',  NULL,        1735, 'GRP-A-IA-GW'),
    ('USGAAP-A-IA-TM',          'Trademarks',                      'USGAAP-A-IA',     3, 'asset',        'posting', 'debit',  NULL,        1736, 'GRP-A-IA-SW'),
    ('USGAAP-A-IA-AMORT',       'Accumulated Amortization',        'USGAAP-A-IA',     3, 'contra_asset', 'posting', 'credit', NULL,        1740, 'GRP-A-IA-AMORT'),
    ('USGAAP-A-ROU-PROP',       'ROU Asset - Property',            'USGAAP-A-ROU',    3, 'asset',        'posting', 'debit',  NULL,        1751, 'GRP-A-ROU-PROP'),
    ('USGAAP-A-ROU-EQUIP',      'ROU Asset - Equipment',           'USGAAP-A-ROU',    3, 'asset',        'posting', 'debit',  NULL,        1752, 'GRP-A-ROU-EQUIP'),
    ('USGAAP-A-ROU-VEH',        'ROU Asset - Vehicles',            'USGAAP-A-ROU',    3, 'asset',        'posting', 'debit',  NULL,        1753, 'GRP-A-ROU-EQUIP'),
    ('USGAAP-A-ROU-SHORT',      'Short-Term Lease Asset',          'USGAAP-A-ROU',    3, 'asset',        'posting', 'debit',  NULL,        1754, 'GRP-A-ROU-EQUIP'),
    ('USGAAP-A-ROU-AMORT',      'Accum Amortization - ROU',        'USGAAP-A-ROU',    3, 'contra_asset', 'posting', 'credit', NULL,        1760, 'GRP-A-ROU-AMORT'),
    ('USGAAP-A-ICR-TRADE',      'IC Receivables - Trade',          'USGAAP-A-ICR',    3, 'asset',        'posting', 'debit',  NULL,        1810, 'GRP-A-ICR-TRADE'),
    ('USGAAP-A-ICR-LOAN',       'IC Receivables - Loans',          'USGAAP-A-ICR',    3, 'asset',        'posting', 'debit',  NULL,        1820, 'GRP-A-ICR-LOAN'),
    ('USGAAP-A-ICR-INT',        'IC Interest Receivable',          'USGAAP-A-ICR',    3, 'asset',        'posting', 'debit',  NULL,        1830, 'GRP-A-ICR-LOAN'),
    ('USGAAP-A-ICR-MGMT',       'IC Management Fee Receivable',    'USGAAP-A-ICR',    3, 'asset',        'posting', 'debit',  NULL,        1840, 'GRP-A-ICR-TRADE'),
    ('USGAAP-A-DTAX-FED',       'Deferred Tax Asset - Federal',    'USGAAP-A-DTAX',   3, 'asset',        'posting', 'debit',  NULL,        1851, 'GRP-A-OAR-PREPAY'),
    ('USGAAP-A-DTAX-STATE',     'Deferred Tax Asset - State',      'USGAAP-A-DTAX',   3, 'asset',        'posting', 'debit',  NULL,        1852, 'GRP-A-OAR-PREPAY'),
    ('USGAAP-A-DTAX-ALLOW',     'Valuation Allowance - DTA',       'USGAAP-A-DTAX',   3, 'contra_asset', 'posting', 'credit', NULL,        1853, 'GRP-A-OAR-PREPAY'),
    ('USGAAP-A-INVEST-ST',      'Short-Term Investments',          'USGAAP-A-INVEST', 3, 'asset',        'posting', 'debit',  NULL,        1910, 'GRP-A-OAR-DEPOSIT'),
    ('USGAAP-A-INVEST-DEBT',    'Debt Securities',                 'USGAAP-A-INVEST', 3, 'asset',        'posting', 'debit',  NULL,        1920, 'GRP-A-OAR-DEPOSIT'),
    ('USGAAP-A-INVEST-EQUITY',  'Equity Securities',               'USGAAP-A-INVEST', 3, 'asset',        'posting', 'debit',  NULL,        1930, 'GRP-A-OAR-DEPOSIT'),
    ('USGAAP-A-INVEST-OTHER',   'Other Assets',                    'USGAAP-A-INVEST', 3, 'asset',        'posting', 'debit',  NULL,        1940, 'GRP-A-OAR-DEPOSIT');

    -- L3 posting accounts - Liabilities and equity.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('USGAAP-L-AP-TRADE',       'Trade Accounts Payable',          'USGAAP-L-AP',      3, 'liability',        'posting', 'credit', 'ap',  2110, 'GRP-L-AP-TRADE'),
    ('USGAAP-L-AP-CARD',        'Corporate Credit Cards Payable',  'USGAAP-L-AP',      3, 'liability',        'posting', 'credit', NULL,  2120, 'GRP-L-AP-TRADE'),
    ('USGAAP-L-AP-RETENTION',   'Retention Payable',               'USGAAP-L-AP',      3, 'liability',        'posting', 'credit', NULL,  2130, 'GRP-L-AP-RETENTION'),
    ('USGAAP-L-AP-UNVOUCHERED', 'Unvouchered Receipts Payable',    'USGAAP-L-AP',      3, 'liability',        'posting', 'credit', 'ap',  2140, 'GRP-L-AP-TRADE'),
    ('USGAAP-L-AP-VENDDEP',     'Vendor Deposits Payable',         'USGAAP-L-AP',      3, 'liability',        'posting', 'credit', NULL,  2150, 'GRP-L-AP-TRADE'),
    ('USGAAP-L-ACCR-GEN',       'General Accrued Expenses',        'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2210, 'GRP-L-ACCR-GEN'),
    ('USGAAP-L-ACCR-BONUS',     'Accrued Bonuses',                 'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2220, 'GRP-L-ACCR-GEN'),
    ('USGAAP-L-ACCR-UTIL',      'Accrued Utilities',               'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2230, 'GRP-L-ACCR-GEN'),
    ('USGAAP-L-ACCR-AUDIT',     'Accrued Audit Fees',              'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2240, 'GRP-L-ACCR-GEN'),
    ('USGAAP-L-ACCR-LEGAL',     'Accrued Legal Fees',              'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2250, 'GRP-L-ACCR-GEN'),
    ('USGAAP-L-ACCR-WARRANTY',  'Warranty Reserve',                'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2260, 'GRP-L-ACCR-PROV'),
    ('USGAAP-L-ACCR-RESTRUCT',  'Restructuring Reserve',           'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2270, 'GRP-L-ACCR-PROV'),
    ('USGAAP-L-ACCR-ARO',       'Asset Retirement Obligation',     'USGAAP-L-ACCR',    3, 'liability',        'posting', 'credit', NULL,  2280, 'GRP-L-ACCR-PROV'),
    ('USGAAP-L-TAX-FED',        'Federal Income Tax Payable',      'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2310, 'GRP-L-TAX-CIT'),
    ('USGAAP-L-TAX-STATE',      'State Income Tax Payable',        'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2315, 'GRP-L-TAX-CIT'),
    ('USGAAP-L-TAX-SALES',      'Sales Tax Payable',               'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2320, 'GRP-L-TAX-VAT-OUT'),
    ('USGAAP-L-TAX-USE',        'Use Tax Payable',                 'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2325, 'GRP-L-TAX-VAT-OUT'),
    ('USGAAP-L-TAX-PAYROLL',    'Payroll Tax Payable',             'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2330, 'GRP-L-TAX-WHT'),
    ('USGAAP-L-TAX-PROPERTY',   'Property Tax Payable',            'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2340, 'GRP-L-TAX-CIT'),
    ('USGAAP-L-TAX-WHT',        'Withholding Tax Payable',         'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2350, 'GRP-L-TAX-WHT'),
    ('USGAAP-L-TAX-PENALTY',    'Tax Interest and Penalties',      'USGAAP-L-TAX',     3, 'liability',        'posting', 'credit', NULL,  2360, 'GRP-L-TAX-CIT'),
    ('USGAAP-L-PAYROLL-WAGES',  'Wages Payable',                   'USGAAP-L-PAYROLL', 3, 'liability',        'posting', 'credit', NULL,  2410, 'GRP-L-EMP-SAL'),
    ('USGAAP-L-PAYROLL-BEN',    'Benefits Payable',                'USGAAP-L-PAYROLL', 3, 'liability',        'posting', 'credit', NULL,  2420, 'GRP-L-EMP-BEN'),
    ('USGAAP-L-PAYROLL-PTO',    'PTO Accrual',                     'USGAAP-L-PAYROLL', 3, 'liability',        'posting', 'credit', NULL,  2430, 'GRP-L-EMP-LEAVE'),
    ('USGAAP-L-PAYROLL-401K',   '401(k) Payable',                  'USGAAP-L-PAYROLL', 3, 'liability',        'posting', 'credit', NULL,  2440, 'GRP-L-EMP-BEN'),
    ('USGAAP-L-PAYROLL-COMM',   'Commissions Payable',             'USGAAP-L-PAYROLL', 3, 'liability',        'posting', 'credit', NULL,  2445, 'GRP-L-EMP-SAL'),
    ('USGAAP-L-PAYROLL-CLEAR',  'Payroll Clearing',                'USGAAP-L-PAYROLL', 3, 'liability',        'posting', 'credit', NULL,  2450, 'GRP-L-EMP-SAL'),
    ('USGAAP-L-DEBT-ST',        'Short-Term Borrowings',           'USGAAP-L-DEBT',    3, 'liability',        'posting', 'credit', NULL,  2460, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-DEBT-CUR',       'Current Portion of Long-Term Debt','USGAAP-L-DEBT',   3, 'liability',        'posting', 'credit', NULL,  2465, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-DEBT-NOTES',     'Notes Payable',                   'USGAAP-L-DEBT',    3, 'liability',        'posting', 'credit', NULL,  2470, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-DEBT-BONDS',     'Bonds Payable',                   'USGAAP-L-DEBT',    3, 'liability',        'posting', 'credit', NULL,  2480, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-DEBT-DISCOUNT',  'Debt Discount',                   'USGAAP-L-DEBT',    3, 'contra_liability', 'posting', 'debit',  NULL,  2490, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-LEASE-OP-CUR',   'Operating Lease Liability - Current',    'USGAAP-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2510, 'GRP-L-LEASE-CUR'),
    ('USGAAP-L-LEASE-OP-NC',    'Operating Lease Liability - Noncurrent', 'USGAAP-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2520, 'GRP-L-LEASE-NCR'),
    ('USGAAP-L-LEASE-FIN-CUR',  'Finance Lease Liability - Current',      'USGAAP-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2530, 'GRP-L-LEASE-CUR'),
    ('USGAAP-L-LEASE-FIN-NC',   'Finance Lease Liability - Noncurrent',   'USGAAP-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2540, 'GRP-L-LEASE-NCR'),
    ('USGAAP-L-ICP-TRADE',      'IC Payables - Trade',             'USGAAP-L-ICP',     3, 'liability',        'posting', 'credit', NULL,  2610, 'GRP-L-ICP-TRADE'),
    ('USGAAP-L-ICP-LOAN',       'IC Payables - Loans',             'USGAAP-L-ICP',     3, 'liability',        'posting', 'credit', NULL,  2620, 'GRP-L-ICP-LOAN'),
    ('USGAAP-L-ICP-INT',        'IC Interest Payable',             'USGAAP-L-ICP',     3, 'liability',        'posting', 'credit', NULL,  2630, 'GRP-L-ICP-LOAN'),
    ('USGAAP-L-ICP-MGMT',       'IC Management Fee Payable',       'USGAAP-L-ICP',     3, 'liability',        'posting', 'credit', NULL,  2640, 'GRP-L-ICP-TRADE'),
    ('USGAAP-L-DEFREV-SUBS',    'Deferred Subscription Revenue',   'USGAAP-L-DEFREV',  3, 'liability',        'posting', 'credit', NULL,  2710, 'GRP-L-DEFREV-SVC'),
    ('USGAAP-L-DEFREV-SVC',     'Deferred Service Revenue',        'USGAAP-L-DEFREV',  3, 'liability',        'posting', 'credit', NULL,  2720, 'GRP-L-DEFREV-SVC'),
    ('USGAAP-L-DEFREV-PROJ',    'Deferred Project Revenue',        'USGAAP-L-DEFREV',  3, 'liability',        'posting', 'credit', NULL,  2730, 'GRP-L-DEFREV-PROJ'),
    ('USGAAP-L-DEFREV-WARRANTY','Deferred Warranty Revenue',       'USGAAP-L-DEFREV',  3, 'liability',        'posting', 'credit', NULL,  2740, 'GRP-L-DEFREV-SVC'),
    ('USGAAP-L-DTAX-FED',       'Deferred Tax Liability - Federal','USGAAP-L-DTAX',    3, 'liability',        'posting', 'credit', NULL,  2751, 'GRP-L-TAX-CIT'),
    ('USGAAP-L-DTAX-STATE',     'Deferred Tax Liability - State',  'USGAAP-L-DTAX',    3, 'liability',        'posting', 'credit', NULL,  2752, 'GRP-L-TAX-CIT'),
    ('USGAAP-L-OTHER-CURRENT',  'Other Current Liabilities',       'USGAAP-L-OTHER',   3, 'liability',        'posting', 'credit', NULL,  2810, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-OTHER-LEGAL',    'Legal Settlement Payable',        'USGAAP-L-OTHER',   3, 'liability',        'posting', 'credit', NULL,  2820, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-OTHER-CUSTOMER', 'Customer Deposits',               'USGAAP-L-OTHER',   3, 'liability',        'posting', 'credit', NULL,  2830, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-L-OTHER-ESCROW',   'Escrow Liabilities',              'USGAAP-L-OTHER',   3, 'liability',        'posting', 'credit', NULL,  2840, 'GRP-L-OTHL-OTHER'),
    ('USGAAP-Q-STOCK-COMMON',   'Common Stock',                    'USGAAP-Q-STOCK',   3, 'equity',          'posting', 'credit', NULL,  3110, 'GRP-Q-CAP-ISSUED'),
    ('USGAAP-Q-STOCK-PREF',     'Preferred Stock',                 'USGAAP-Q-STOCK',   3, 'equity',          'posting', 'credit', NULL,  3120, 'GRP-Q-CAP-ISSUED'),
    ('USGAAP-Q-APIC-COMMON',    'APIC - Common Stock',             'USGAAP-Q-APIC',    3, 'equity',          'posting', 'credit', NULL,  3210, 'GRP-Q-CAP-PREM'),
    ('USGAAP-Q-APIC-OPTIONS',   'APIC - Stock Compensation',       'USGAAP-Q-APIC',    3, 'equity',          'posting', 'credit', NULL,  3220, 'GRP-Q-CAP-PREM'),
    ('USGAAP-Q-TS-COST',        'Treasury Stock at Cost',          'USGAAP-Q-TS',      3, 'contra_equity',   'posting', 'debit',  NULL,  3250, 'GRP-Q-RE-DIV'),
    ('USGAAP-Q-RE-OPENING',     'Retained Earnings - Opening',     'USGAAP-Q-RE',      3, 'equity',          'posting', 'credit', NULL,  3310, 'GRP-Q-RE-OPENING'),
    ('USGAAP-Q-RE-CY',          'Current Year Net Income',         'USGAAP-Q-RE',      3, 'equity',          'posting', 'credit', NULL,  3320, 'GRP-Q-RE-CY'),
    ('USGAAP-Q-RE-DIV',         'Dividends Declared',              'USGAAP-Q-RE',      3, 'contra_equity',   'posting', 'debit',  NULL,  3330, 'GRP-Q-RE-DIV'),
    ('USGAAP-Q-AOCI-FX',        'AOCI - FX Translation',           'USGAAP-Q-AOCI',    3, 'equity',          'posting', 'credit', NULL,  3410, 'GRP-Q-RES-TRANS'),
    ('USGAAP-Q-AOCI-HEDGE',     'AOCI - Cash Flow Hedges',         'USGAAP-Q-AOCI',    3, 'equity',          'posting', 'credit', NULL,  3420, 'GRP-Q-RES-HEDGE');

    -- L3 posting accounts - Revenue and expenses.
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('USGAAP-R-SALES-DOMESTIC', 'Product Sales - Domestic',        'USGAAP-R-SALES',  3, 'income',         'posting', 'credit', NULL, 4110, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-SALES-EXPORT',   'Product Sales - Export',          'USGAAP-R-SALES',  3, 'income',         'posting', 'credit', NULL, 4120, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-SALES-ONLINE',   'Online Product Sales',            'USGAAP-R-SALES',  3, 'income',         'posting', 'credit', NULL, 4130, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-SALES-FREIGHT',  'Freight Revenue',                 'USGAAP-R-SALES',  3, 'income',         'posting', 'credit', NULL, 4140, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-SALES-WARRANTY', 'Warranty Revenue',                'USGAAP-R-SALES',  3, 'income',         'posting', 'credit', NULL, 4150, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-SVC-PROF',       'Professional Services Revenue',   'USGAAP-R-SVC',    3, 'income',         'posting', 'credit', NULL, 4210, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-SVC-SUPPORT',    'Support Revenue',                 'USGAAP-R-SVC',    3, 'income',         'posting', 'credit', NULL, 4220, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-SVC-IMPL',       'Implementation Revenue',          'USGAAP-R-SVC',    3, 'income',         'posting', 'credit', NULL, 4230, 'GRP-R-SALES-PROJ'),
    ('USGAAP-R-SVC-MANAGED',    'Managed Services Revenue',        'USGAAP-R-SVC',    3, 'income',         'posting', 'credit', NULL, 4240, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-SVC-MAINT',      'Maintenance Revenue',             'USGAAP-R-SVC',    3, 'income',         'posting', 'credit', NULL, 4245, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-SUBS-SOFTWARE',  'Software Subscription Revenue',   'USGAAP-R-SUBS',   3, 'income',         'posting', 'credit', NULL, 4251, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-SUBS-CLOUD',     'Cloud Subscription Revenue',      'USGAAP-R-SUBS',   3, 'income',         'posting', 'credit', NULL, 4252, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-SUBS-PLATFORM',  'Platform Subscription Revenue',   'USGAAP-R-SUBS',   3, 'income',         'posting', 'credit', NULL, 4253, 'GRP-R-SALES-SVC'),
    ('USGAAP-R-CONTRA-RETURNS', 'Sales Returns',                   'USGAAP-R-CONTRA', 3, 'contra_revenue', 'posting', 'debit',  NULL, 4310, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-CONTRA-ALLOW',   'Sales Allowances',                'USGAAP-R-CONTRA', 3, 'contra_revenue', 'posting', 'debit',  NULL, 4320, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-CONTRA-DISC',    'Sales Discounts',                 'USGAAP-R-CONTRA', 3, 'contra_revenue', 'posting', 'debit',  NULL, 4330, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-CONTRA-REBATE',  'Customer Rebates',                'USGAAP-R-CONTRA', 3, 'contra_revenue', 'posting', 'debit',  NULL, 4340, 'GRP-R-SALES-GOODS'),
    ('USGAAP-R-OOI-RENT',       'Rental Income',                   'USGAAP-R-OOI',    3, 'income',         'posting', 'credit', NULL, 4410, 'GRP-R-OOI-RENTAL'),
    ('USGAAP-R-OOI-GAIN',       'Gain on Disposal',                'USGAAP-R-OOI',    3, 'income',         'posting', 'credit', NULL, 4420, 'GRP-R-OOI-GAIN'),
    ('USGAAP-R-OOI-GRANT',      'Government Grant Income',         'USGAAP-R-OOI',    3, 'income',         'posting', 'credit', NULL, 4430, 'GRP-R-OOI-MISC'),
    ('USGAAP-R-OOI-MISC',       'Miscellaneous Income',            'USGAAP-R-OOI',    3, 'income',         'posting', 'credit', NULL, 4440, 'GRP-R-OOI-MISC'),
    ('USGAAP-R-FIN-INT',        'Interest Income',                 'USGAAP-R-FIN',    3, 'income',         'posting', 'credit', NULL, 4510, 'GRP-R-FIN-INT'),
    ('USGAAP-R-FIN-FX',         'Foreign Exchange Gain',           'USGAAP-R-FIN',    3, 'income',         'posting', 'credit', NULL, 4520, 'GRP-R-FIN-FX'),
    ('USGAAP-R-FIN-INVEST',     'Investment Income',               'USGAAP-R-FIN',    3, 'income',         'posting', 'credit', NULL, 4530, 'GRP-R-FIN-INT'),
    ('USGAAP-R-ICR-MGMT',       'IC Management Fee Income',        'USGAAP-R-ICR',    3, 'income',         'posting', 'credit', NULL, 4610, 'GRP-R-ICR-MGMT'),
    ('USGAAP-R-ICR-SVC',        'IC Service Revenue',              'USGAAP-R-ICR',    3, 'income',         'posting', 'credit', NULL, 4620, 'GRP-R-ICR-SVCS'),
    ('USGAAP-R-ICR-ROYALTY',    'IC Royalty Income',               'USGAAP-R-ICR',    3, 'income',         'posting', 'credit', NULL, 4630, 'GRP-R-ICR-SVCS'),
    ('USGAAP-E-COGS-MAT',       'Materials Consumed',              'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5110, 'GRP-E-COGS-MAT'),
    ('USGAAP-E-COGS-LABOR',     'Direct Labor',                    'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5120, 'GRP-E-COGS-LABOUR'),
    ('USGAAP-E-COGS-OH',        'Manufacturing Overhead',          'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5130, 'GRP-E-COGS-OH'),
    ('USGAAP-E-COGS-SUB',       'Subcontracting Costs',            'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5140, 'GRP-E-COGS-SUB'),
    ('USGAAP-E-COGS-FREIGHT',   'Freight and Distribution',        'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5150, 'GRP-E-COGS-FREIGHT'),
    ('USGAAP-E-COGS-WARRANTY',  'Warranty Costs',                  'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5160, 'GRP-E-COGS-OH'),
    ('USGAAP-E-COGS-SCRAP',     'Scrap and Rework',                'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5170, 'GRP-E-COGS-OH'),
    ('USGAAP-E-COGS-INVADJ',    'Inventory Adjustments',           'USGAAP-E-COGS',   3, 'expense',        'posting', 'debit',  NULL, 5180, 'GRP-E-COGS-MAT'),
    ('USGAAP-E-SALES-ADVERT',   'Advertising Expense',             'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  NULL, 5210, 'GRP-E-SGA-MKTG'),
    ('USGAAP-E-SALES-COMM',     'Sales Commissions',               'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  'commission', 5220, 'GRP-E-SGA-MKTG'),
    ('USGAAP-E-SALES-TRAVEL',   'Sales Travel and Entertainment',  'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  NULL, 5230, 'GRP-E-SGA-TRAVEL'),
    ('USGAAP-E-SALES-TRADE',    'Trade Shows and Events',          'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  NULL, 5240, 'GRP-E-SGA-MKTG'),
    ('USGAAP-E-SALES-DIGITAL',  'Digital Marketing',               'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  NULL, 5250, 'GRP-E-SGA-MKTG'),
    ('USGAAP-E-SALES-CUST',     'Customer Success',                'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  NULL, 5260, 'GRP-E-SGA-OFFICE'),
    ('USGAAP-E-SALES-FREIGHT',  'Outbound Freight Expense',        'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  NULL, 5270, 'GRP-E-COGS-FREIGHT'),
    ('USGAAP-E-SALES-BADDEBT',  'Bad Debt Expense',                'USGAAP-E-SALES',  3, 'expense',        'posting', 'debit',  NULL, 5280, 'GRP-E-OTHER-MISC'),
    ('USGAAP-E-GA-OFFICE',      'Office and Administrative',       'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5310, 'GRP-E-SGA-OFFICE'),
    ('USGAAP-E-GA-RENT',        'Rent and Occupancy',              'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5320, 'GRP-E-SGA-RENT'),
    ('USGAAP-E-GA-UTIL',        'Utilities',                       'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5330, 'GRP-E-SGA-UTIL'),
    ('USGAAP-E-GA-INS',         'Insurance',                       'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5340, 'GRP-E-SGA-INS'),
    ('USGAAP-E-GA-LEGAL',       'Legal Fees',                      'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5350, 'GRP-E-SGA-PROF'),
    ('USGAAP-E-GA-AUDIT',       'Audit and Accounting Fees',       'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5360, 'GRP-E-SGA-PROF'),
    ('USGAAP-E-GA-CONSULT',     'Consulting Fees',                 'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5370, 'GRP-E-SGA-PROF'),
    ('USGAAP-E-GA-IT',          'IT and Communications',           'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5380, 'GRP-E-SGA-IT'),
    ('USGAAP-E-GA-REPAIR',      'Repairs and Maintenance',         'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5385, 'GRP-E-SGA-REPAIR'),
    ('USGAAP-E-GA-DUES',        'Dues and Subscriptions',          'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5390, 'GRP-E-SGA-OFFICE'),
    ('USGAAP-E-GA-BANK',        'Bank Service Charges',            'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5395, 'GRP-E-FIN-BANK'),
    ('USGAAP-E-GA-MISC',        'Miscellaneous G&A',               'USGAAP-E-GA',     3, 'expense',        'posting', 'debit',  NULL, 5399, 'GRP-E-OTHER-MISC'),
    ('USGAAP-E-RD-LABOR',       'R&D Labor',                       'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5410, 'GRP-E-HR-SAL'),
    ('USGAAP-E-RD-CONTRACT',    'R&D Contract Services',           'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5420, 'GRP-E-SGA-PROF'),
    ('USGAAP-E-RD-PROTOTYPE',   'Prototype Materials',             'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5430, 'GRP-E-COGS-MAT'),
    ('USGAAP-E-RD-CLOUD',       'R&D Cloud and Tools',             'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5440, 'GRP-E-SGA-IT'),
    ('USGAAP-E-RD-LICENCE',     'R&D Software Licenses',           'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5445, 'GRP-E-SGA-IT'),
    ('USGAAP-E-RD-TESTING',     'Testing and Certification',       'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5450, 'GRP-E-SGA-PROF'),
    ('USGAAP-E-RD-PATENT',      'Patent Filing Costs',             'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5460, 'GRP-E-SGA-PROF'),
    ('USGAAP-E-RD-MISC',        'Other R&D Expense',               'USGAAP-E-RD',     3, 'expense',        'posting', 'debit',  NULL, 5490, 'GRP-E-OTHER-MISC'),
    ('USGAAP-E-PAYROLL-WAGE',   'Salaries and Wages',              'USGAAP-E-PAYROLL',3, 'expense',        'posting', 'debit',  NULL, 5451, 'GRP-E-HR-SAL'),
    ('USGAAP-E-PAYROLL-BEN',    'Employee Benefits',               'USGAAP-E-PAYROLL',3, 'expense',        'posting', 'debit',  NULL, 5452, 'GRP-E-HR-BEN'),
    ('USGAAP-E-PAYROLL-TAX',    'Payroll Taxes',                   'USGAAP-E-PAYROLL',3, 'expense',        'posting', 'debit',  NULL, 5453, 'GRP-E-HR-BEN'),
    ('USGAAP-E-PAYROLL-BONUS',  'Bonuses',                         'USGAAP-E-PAYROLL',3, 'expense',        'posting', 'debit',  NULL, 5454, 'GRP-E-HR-SAL'),
    ('USGAAP-E-PAYROLL-TRAIN',  'Training and Development',        'USGAAP-E-PAYROLL',3, 'expense',        'posting', 'debit',  NULL, 5455, 'GRP-E-HR-TRAIN'),
    ('USGAAP-E-PAYROLL-RECRUIT','Recruiting Expense',              'USGAAP-E-PAYROLL',3, 'expense',        'posting', 'debit',  NULL, 5456, 'GRP-E-HR-RECRUIT'),
    ('USGAAP-E-PAYROLL-STOCK',  'Stock Compensation Expense',      'USGAAP-E-PAYROLL',3, 'expense',        'posting', 'debit',  NULL, 5457, 'GRP-E-HR-BEN'),
    ('USGAAP-E-DA-BLDG',        'Depreciation - Buildings',        'USGAAP-E-DA',     3, 'expense',        'posting', 'debit',  NULL, 5510, 'GRP-E-DA-BLDG'),
    ('USGAAP-E-DA-MACH',        'Depreciation - Machinery',        'USGAAP-E-DA',     3, 'expense',        'posting', 'debit',  NULL, 5520, 'GRP-E-DA-PLANT'),
    ('USGAAP-E-DA-IT',          'Depreciation - IT Equipment',     'USGAAP-E-DA',     3, 'expense',        'posting', 'debit',  NULL, 5530, 'GRP-E-DA-IT'),
    ('USGAAP-E-DA-VEH',         'Depreciation - Vehicles',         'USGAAP-E-DA',     3, 'expense',        'posting', 'debit',  NULL, 5540, 'GRP-E-DA-VEH'),
    ('USGAAP-E-DA-ROU',         'Amortization - ROU Assets',       'USGAAP-E-DA',     3, 'expense',        'posting', 'debit',  NULL, 5550, 'GRP-E-DA-ROU'),
    ('USGAAP-E-DA-AMORT',       'Amortization - Intangibles',      'USGAAP-E-DA',     3, 'expense',        'posting', 'debit',  NULL, 5560, 'GRP-E-DA-AMORT'),
    ('USGAAP-E-FIN-INT',        'Interest Expense',                'USGAAP-E-FIN',    3, 'expense',        'posting', 'debit',  NULL, 5610, 'GRP-E-FIN-INT'),
    ('USGAAP-E-FIN-LEASE',      'Lease Interest Expense',          'USGAAP-E-FIN',    3, 'expense',        'posting', 'debit',  NULL, 5620, 'GRP-E-FIN-LEASE'),
    ('USGAAP-E-FIN-FX',         'Foreign Exchange Loss',           'USGAAP-E-FIN',    3, 'expense',        'posting', 'debit',  NULL, 5630, 'GRP-E-FIN-FX'),
    ('USGAAP-E-FIN-BANK',       'Bank Charges',                    'USGAAP-E-FIN',    3, 'expense',        'posting', 'debit',  NULL, 5640, 'GRP-E-FIN-BANK'),
    ('USGAAP-E-FIN-DEBTISSUE',  'Debt Issuance Cost Amortization', 'USGAAP-E-FIN',    3, 'expense',        'posting', 'debit',  NULL, 5650, 'GRP-E-FIN-INT'),
    ('USGAAP-E-FIN-FV',         'Fair Value Loss',                 'USGAAP-E-FIN',    3, 'expense',        'posting', 'debit',  NULL, 5660, 'GRP-E-FIN-INT'),
    ('USGAAP-E-TAX-FED',        'Federal Income Tax Expense',      'USGAAP-E-TAX',    3, 'expense',        'posting', 'debit',  NULL, 5710, 'GRP-E-TAX-CIT'),
    ('USGAAP-E-TAX-STATE',      'State Income Tax Expense',        'USGAAP-E-TAX',    3, 'expense',        'posting', 'debit',  NULL, 5720, 'GRP-E-TAX-CIT'),
    ('USGAAP-E-TAX-DEFERRED',   'Deferred Tax Expense',            'USGAAP-E-TAX',    3, 'expense',        'posting', 'debit',  NULL, 5730, 'GRP-E-TAX-DT'),
    ('USGAAP-E-ICE-MGMT',       'IC Management Fee Expense',       'USGAAP-E-ICE',    3, 'expense',        'posting', 'debit',  NULL, 5810, 'GRP-E-ICE-MGMT'),
    ('USGAAP-E-ICE-SVC',        'IC Service Expense',              'USGAAP-E-ICE',    3, 'expense',        'posting', 'debit',  NULL, 5820, 'GRP-E-ICE-SVCS'),
    ('USGAAP-E-ICE-ROYALTY',    'IC Royalty Expense',              'USGAAP-E-ICE',    3, 'expense',        'posting', 'debit',  NULL, 5830, 'GRP-E-ICE-SVCS'),
    ('USGAAP-E-ICE-INTEREST',   'IC Interest Expense',             'USGAAP-E-ICE',    3, 'expense',        'posting', 'debit',  NULL, 5840, 'GRP-E-FIN-INT'),
    ('USGAAP-E-OTHER-LOSS',     'Loss on Disposal',                'USGAAP-E-OTHER',  3, 'expense',        'posting', 'debit',  NULL, 5910, 'GRP-E-OTHER-LOSS'),
    ('USGAAP-E-OTHER-IMPAIR',   'Impairment Loss',                 'USGAAP-E-OTHER',  3, 'expense',        'posting', 'debit',  NULL, 5920, 'GRP-E-OTHER-IMPAIR'),
    ('USGAAP-E-OTHER-LITIG',    'Litigation Settlement Expense',   'USGAAP-E-OTHER',  3, 'expense',        'posting', 'debit',  NULL, 5930, 'GRP-E-OTHER-MISC'),
    ('USGAAP-E-OTHER-PENALTY',  'Penalties and Fines',             'USGAAP-E-OTHER',  3, 'expense',        'posting', 'debit',  NULL, 5940, 'GRP-E-OTHER-MISC'),
    ('USGAAP-E-OTHER-RESTRUCT', 'Restructuring Costs',             'USGAAP-E-OTHER',  3, 'expense',        'posting', 'debit',  NULL, 5950, 'GRP-E-OTHER-MISC'),
    ('USGAAP-E-OTHER-DONATION', 'Donations and Contributions',     'USGAAP-E-OTHER',  3, 'expense',        'posting', 'debit',  NULL, 5960, 'GRP-E-OTHER-MISC'),
    ('USGAAP-E-OTHER-MISC',     'Miscellaneous Expense',           'USGAAP-E-OTHER',  3, 'expense',        'posting', 'debit',  NULL, 5990, 'GRP-E-OTHER-MISC');

    -- Stage C: Upsert L1 roots.
    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order,
        metadata, status, created_by
    )
    SELECT
        md5('wave5:coa-gaap-account:' || v_tid::text || ':' || t.code)::uuid,
        v_tid, v_coa_id, t.code, t.name,
        NULL, t.level_no, t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, upper(t.subledger_type),
        t.sort_order,
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
           EXCLUDED.subledger_type, EXCLUDED.sort_order)
       OR master.gl_account.metadata->'_seed'->>'pack' IS DISTINCT FROM v_pack;

    -- Stage D: Upsert L2 headers.
    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order,
        metadata, status, created_by
    )
    SELECT
        md5('wave5:coa-gaap-account:' || v_tid::text || ':' || t.code)::uuid,
        v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.code || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, upper(t.subledger_type),
        t.sort_order,
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
           EXCLUDED.subledger_type, EXCLUDED.sort_order)
       OR master.gl_account.metadata->'_seed'->>'pack' IS DISTINCT FROM v_pack;

    -- Stage E: Upsert L3 posting accounts.
    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order,
        metadata, status, created_by
    )
    SELECT
        md5('wave5:coa-gaap-account:' || v_tid::text || ':' || t.code)::uuid,
        v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.path || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, upper(t.subledger_type),
        t.sort_order,
        v_meta
            || jsonb_build_object('_display_no', t.sort_order::text)
            || jsonb_build_object('_group_map', t.group_map),
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
                         || jsonb_build_object('_display_no', EXCLUDED.sort_order::text)
                         || jsonb_build_object('_group_map', EXCLUDED.metadata->>'_group_map'),
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
           EXCLUDED.subledger_type, EXCLUDED.sort_order)
       OR master.gl_account.metadata->'_seed'->>'pack' IS DISTINCT FROM v_pack
       OR master.gl_account.metadata->>'_group_map' IS DISTINCT FROM EXCLUDED.metadata->>'_group_map';

    -- Stage F: Assertions.
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

    SELECT count(*) INTO v_gmap_ok
    FROM master.gl_account
    WHERE tenant_id = v_tid
      AND chart_of_account_id = v_coa_id
      AND metadata->'_seed'->>'pack' = v_pack
      AND node_type = 'posting'
      AND metadata ? '_group_map';

    SELECT count(*) INTO v_gmap_missing
    FROM master.gl_account ga
    WHERE ga.tenant_id = v_tid
      AND ga.chart_of_account_id = v_coa_id
      AND ga.metadata->'_seed'->>'pack' = v_pack
      AND ga.node_type = 'posting'
      AND NOT EXISTS (
          SELECT 1
          FROM master.gl_account grp
          WHERE grp.tenant_id = v_tid
            AND grp.chart_of_account_id = v_group_coa_id
            AND grp.code = ga.metadata->>'_group_map'
      );

    IF v_total < 270 THEN
        RAISE EXCEPTION '[212_framework_gaap] Expected >= 270 total accounts, got %', v_total;
    END IF;

    IF v_roots <> 5 THEN
        RAISE EXCEPTION '[212_framework_gaap] Expected 5 class roots, got %', v_roots;
    END IF;

    IF v_posting < 220 THEN
        RAISE EXCEPTION '[212_framework_gaap] Expected >= 220 posting accounts, got %', v_posting;
    END IF;

    IF v_gmap_ok <> v_posting THEN
        RAISE EXCEPTION '[212_framework_gaap] All posting accounts must have _group_map. Found % of % with it', v_gmap_ok, v_posting;
    END IF;

    IF v_gmap_missing <> 0 THEN
        RAISE EXCEPTION '[212_framework_gaap] Found % posting accounts mapped to missing group accounts', v_gmap_missing;
    END IF;

    RAISE NOTICE '[212_framework_gaap] US GAAP operating chart seeded: % total accounts (% roots, % posting, % with _group_map)',
        v_total, v_roots, v_posting, v_gmap_ok;

END $seed$;
