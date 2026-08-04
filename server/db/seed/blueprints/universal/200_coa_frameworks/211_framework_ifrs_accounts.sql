-- COA-IFRS operating chart: ~300 master.gl_account rows — 5 class roots,
-- ~35 L2 headers, ~260 L3 posting accounts. Default chart for 12/17 demo companies.

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_pack    text := '211_framework_ifrs';
    v_version text := '1.0.1';
    v_meta    jsonb;
    v_coa_id  uuid;
    v_group_coa_id uuid;
    v_total   int;
    v_roots   int;
    v_posting int;
    v_gmap_ok int;
    v_gmap_missing int;
BEGIN
    -- ── STAGE A: Resolve tenant & chart ─────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT id INTO v_coa_id
    FROM master.chart_of_account
    WHERE tenant_id = v_tid AND code = 'COA-IFRS';
    IF v_coa_id IS NULL THEN
        RAISE EXCEPTION 'Chart COA-IFRS not found — run 200_chart_catalog.sql first';
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
        group_map      text           -- maps to GRP-* code in COA-GROUP taxonomy
    ) ON COMMIT DROP;

    -- ──────────────────────────────────────────────────────────────────────
    -- B1: L1 ROOTS (5 class headers)
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-A', 'Assets',      NULL, 1, 'asset',     'header', 'debit',  1000),
    ('IFRS-L', 'Liabilities', NULL, 1, 'liability', 'header', 'credit', 2000),
    ('IFRS-Q', 'Equity',      NULL, 1, 'equity',    'header', 'credit', 3000),
    ('IFRS-R', 'Revenue',     NULL, 1, 'income',    'header', 'credit', 4000),
    ('IFRS-E', 'Expenses',    NULL, 1, 'expense',   'header', 'debit',  5000);

    -- ──────────────────────────────────────────────────────────────────────
    -- B2: L2 HEADERS — Assets
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-A-CASH',  'Cash & Bank',               'IFRS-A', 2, 'asset', 'header', 'debit', 1100),
    ('IFRS-A-AR',    'Trade Receivables',          'IFRS-A', 2, 'asset', 'header', 'debit', 1200),
    ('IFRS-A-OAR',   'Other Receivables',          'IFRS-A', 2, 'asset', 'header', 'debit', 1300),
    ('IFRS-A-INV',   'Inventory',                  'IFRS-A', 2, 'asset', 'header', 'debit', 1400),
    ('IFRS-A-FA',    'Fixed Assets',               'IFRS-A', 2, 'asset', 'header', 'debit', 1500),
    ('IFRS-A-DEP',   'Accumulated Depreciation',   'IFRS-A', 2, 'asset', 'header', 'debit', 1600),
    ('IFRS-A-IA',    'Intangible Assets',          'IFRS-A', 2, 'asset', 'header', 'debit', 1700),
    ('IFRS-A-ROU',   'Right-of-Use Assets',        'IFRS-A', 2, 'asset', 'header', 'debit', 1750),
    ('IFRS-A-ICR',   'Intercompany Receivables',   'IFRS-A', 2, 'asset', 'header', 'debit', 1800),
    ('IFRS-A-DTAX',  'Deferred Tax Asset',         'IFRS-A', 2, 'asset', 'header', 'debit', 1850),
    ('IFRS-A-OTHER', 'Other Assets',               'IFRS-A', 2, 'asset', 'header', 'debit', 1900);

    -- B2: L2 HEADERS — Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-L-AP',     'Trade Payables',         'IFRS-L', 2, 'liability', 'header', 'credit', 2100),
    ('IFRS-L-ACCR',   'Accruals & Provisions',  'IFRS-L', 2, 'liability', 'header', 'credit', 2200),
    ('IFRS-L-TAX',    'Tax Payables',           'IFRS-L', 2, 'liability', 'header', 'credit', 2300),
    ('IFRS-L-EMP',    'Employee Liabilities',   'IFRS-L', 2, 'liability', 'header', 'credit', 2400),
    ('IFRS-L-LEASE',  'Lease Liabilities',      'IFRS-L', 2, 'liability', 'header', 'credit', 2500),
    ('IFRS-L-ICP',    'Intercompany Payables',  'IFRS-L', 2, 'liability', 'header', 'credit', 2600),
    ('IFRS-L-DEFREV', 'Deferred Revenue',       'IFRS-L', 2, 'liability', 'header', 'credit', 2700),
    ('IFRS-L-DTAX',   'Deferred Tax Liability', 'IFRS-L', 2, 'liability', 'header', 'credit', 2750),
    ('IFRS-L-OTHL',   'Other Liabilities',      'IFRS-L', 2, 'liability', 'header', 'credit', 2800);

    -- B2: L2 HEADERS — Equity
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-Q-CAP', 'Share Capital',     'IFRS-Q', 2, 'equity', 'header', 'credit', 3100),
    ('IFRS-Q-RES', 'Reserves',          'IFRS-Q', 2, 'equity', 'header', 'credit', 3200),
    ('IFRS-Q-RE',  'Retained Earnings', 'IFRS-Q', 2, 'equity', 'header', 'credit', 3300);

    -- B2: L2 HEADERS — Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-R-SALES', 'Sales Revenue',         'IFRS-R', 2, 'income', 'header', 'credit', 4100),
    ('IFRS-R-OOI',   'Other Operating Income','IFRS-R', 2, 'income', 'header', 'credit', 4200),
    ('IFRS-R-FIN',   'Finance Income',        'IFRS-R', 2, 'income', 'header', 'credit', 4300),
    ('IFRS-R-ICR',   'Intercompany Revenue',  'IFRS-R', 2, 'income', 'header', 'credit', 4400);

    -- B2: L2 HEADERS — Expenses
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, sort_order) VALUES
    ('IFRS-E-COGS',  'Cost of Sales',                'IFRS-E', 2, 'expense', 'header', 'debit', 5100),
    ('IFRS-E-SELL',  'Selling & Distribution',       'IFRS-E', 2, 'expense', 'header', 'debit', 5200),
    ('IFRS-E-GA',    'General & Administrative',     'IFRS-E', 2, 'expense', 'header', 'debit', 5300),
    ('IFRS-E-HR',    'HR & Payroll',                 'IFRS-E', 2, 'expense', 'header', 'debit', 5400),
    ('IFRS-E-DA',    'Depreciation & Amortisation',  'IFRS-E', 2, 'expense', 'header', 'debit', 5500),
    ('IFRS-E-FIN',   'Finance Costs',                'IFRS-E', 2, 'expense', 'header', 'debit', 5600),
    ('IFRS-E-TAX',   'Tax Expense',                  'IFRS-E', 2, 'expense', 'header', 'debit', 5700),
    ('IFRS-E-ICE',   'Intercompany Expense',         'IFRS-E', 2, 'expense', 'header', 'debit', 5800),
    ('IFRS-E-OTHER', 'Other Expenses',               'IFRS-E', 2, 'expense', 'header', 'debit', 5900);

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Assets: Cash & Bank
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-CASH-OPER',    'Operating Cash Account',   'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1110, 'GRP-A-CASH-OPER'),
    ('IFRS-A-CASH-USD',     'USD Bank Account',         'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1121, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-LOCAL',   'Local Currency Bank',      'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1122, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-PAYROLL', 'Payroll Bank Account',     'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1123, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-ESCROW',  'Escrow Account',           'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1124, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-MM',      'Money Market Account',     'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1125, 'GRP-A-CASH-BANK'),
    ('IFRS-A-CASH-PETTY',   'Petty Cash',               'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1130, 'GRP-A-CASH-PETTY'),
    ('IFRS-A-CASH-TRANSIT', 'Cash in Transit',          'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1140, 'GRP-A-CASH-OPER'),
    ('IFRS-A-CASH-RESTRICT','Restricted Cash',          'IFRS-A-CASH', 3, 'asset', 'posting', 'debit',  NULL, 1150, 'GRP-A-CASH-OPER');

    -- B3: L3 POSTING — Assets: Trade Receivables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-AR-TRADE',     'Trade Receivables',        'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  'ar',  1210, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-RETENTION', 'Retention Receivable',     'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  NULL,  1220, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-UNBILLED',  'Unbilled Revenue',         'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  NULL,  1230, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-NOTES',     'Notes Receivable',         'IFRS-A-AR', 3, 'asset', 'posting', 'debit',  NULL,  1235, 'GRP-A-AR-TRADE'),
    ('IFRS-A-AR-ALLOW',     'ECL Allowance',            'IFRS-A-AR', 3, 'contra_asset', 'posting', 'credit', NULL,  1240, 'GRP-A-AR-ALLOW');

    -- B3: L3 POSTING — Assets: Other Receivables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-OAR-ADVANCE',   'Advances to Suppliers',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1310, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-PREPAY',    'Prepaid Expenses',         'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1320, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-OAR-PREPINS',   'Prepaid Insurance',        'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1321, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-OAR-PREPRENT',  'Prepaid Rent',             'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1322, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-OAR-DEPOSIT',   'Deposits & Guarantees',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1330, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OAR-STAFF',     'Staff Loans & Advances',   'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1340, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-INPUT-TAX', 'Input Tax Recoverable',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1350, 'GRP-L-TAX-VAT-IN'),
    ('IFRS-A-OAR-ACCRINT',   'Accrued Interest Recv',    'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1360, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-DIVIDEND',  'Dividend Receivable',      'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1370, 'GRP-A-OAR-ADVANCE'),
    ('IFRS-A-OAR-CONTRASST', 'Contract Assets',          'IFRS-A-OAR', 3, 'asset', 'posting', 'debit', NULL, 1380, 'GRP-A-OAR-ADVANCE');

    -- B3: L3 POSTING — Assets: Inventory
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-INV-RAW',     'Raw Materials',             'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1410, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-WIP',     'Work in Progress',          'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'wip',       1420, 'GRP-A-INV-WIP'),
    ('IFRS-A-INV-FG',      'Finished Goods',            'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1430, 'GRP-A-INV-FG'),
    ('IFRS-A-INV-TRADE',   'Trading Goods',             'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1440, 'GRP-A-INV-TRADE'),
    ('IFRS-A-INV-CONSUM',  'Consumables & Supplies',    'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1450, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-SPARE',   'Spare Parts Inventory',     'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1455, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-TRANSIT', 'Goods in Transit',          'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  NULL,        1460, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-PACKAGE', 'Packaging Materials',       'IFRS-A-INV', 3, 'asset', 'posting', 'debit',  'inventory', 1465, 'GRP-A-INV-RAW'),
    ('IFRS-A-INV-PROV',    'Inventory Provision',       'IFRS-A-INV', 3, 'contra_asset', 'posting', 'credit', NULL,        1470, 'GRP-A-INV-RAW');

    -- B3: L3 POSTING — Assets: Fixed Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-FA-LAND',    'Land',                      'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1510, 'GRP-A-FA-LAND'),
    ('IFRS-A-FA-BLDG',    'Buildings',                 'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1520, 'GRP-A-FA-BLDG'),
    ('IFRS-A-FA-PLANT',   'Plant & Machinery',         'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1530, 'GRP-A-FA-PLANT'),
    ('IFRS-A-FA-VEH',     'Vehicles',                  'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1540, 'GRP-A-FA-VEH'),
    ('IFRS-A-FA-IT',      'IT Equipment',              'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1550, 'GRP-A-FA-IT'),
    ('IFRS-A-FA-FURN',    'Furniture & Fixtures',      'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1560, 'GRP-A-FA-FURN'),
    ('IFRS-A-FA-LEASEHI', 'Leasehold Improvements',    'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1570, 'GRP-A-FA-BLDG'),
    ('IFRS-A-FA-TOOLS',   'Tools & Dies',              'IFRS-A-FA', 3, 'asset', 'posting', 'debit', 'asset', 1575, 'GRP-A-FA-PLANT'),
    ('IFRS-A-FA-CWIP',    'Capital Work in Progress',  'IFRS-A-FA', 3, 'asset', 'posting', 'debit', NULL,    1580, 'GRP-A-FA-CWIP');

    -- B3: L3 POSTING — Assets: Accumulated Depreciation
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-DEP-BLDG',    'Accum Depr — Buildings',    'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1620, 'GRP-A-DEP-BLDG'),
    ('IFRS-A-DEP-PLANT',   'Accum Depr — Plant',        'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1630, 'GRP-A-DEP-PLANT'),
    ('IFRS-A-DEP-VEH',     'Accum Depr — Vehicles',     'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1640, 'GRP-A-DEP-VEH'),
    ('IFRS-A-DEP-IT',      'Accum Depr — IT',           'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1650, 'GRP-A-DEP-IT'),
    ('IFRS-A-DEP-FURN',    'Accum Depr — Furniture',    'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1660, 'GRP-A-DEP-FURN'),
    ('IFRS-A-DEP-LEASEHI', 'Accum Depr — LHI',         'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1670, 'GRP-A-DEP-BLDG'),
    ('IFRS-A-DEP-TOOLS',   'Accum Depr — Tools',       'IFRS-A-DEP', 3, 'contra_asset', 'posting', 'credit', NULL, 1675, 'GRP-A-DEP-PLANT');

    -- B3: L3 POSTING — Assets: Intangible Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-IA-GW',      'Goodwill',                 'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1710, 'GRP-A-IA-GW'),
    ('IFRS-A-IA-SW',      'Software & Licences',      'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1720, 'GRP-A-IA-SW'),
    ('IFRS-A-IA-DEV',     'Development Costs',        'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1730, 'GRP-A-IA-SW'),
    ('IFRS-A-IA-PATENT',  'Patents & Trademarks',     'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1735, 'GRP-A-IA-SW'),
    ('IFRS-A-IA-CUSTREL', 'Customer Relationships',   'IFRS-A-IA', 3, 'asset', 'posting', 'debit',  NULL, 1736, 'GRP-A-IA-GW'),
    ('IFRS-A-IA-AMORT',   'Accum Amortisation',       'IFRS-A-IA', 3, 'contra_asset', 'posting', 'credit', NULL, 1740, 'GRP-A-IA-AMORT');

    -- B3: L3 POSTING — Assets: Right-of-Use Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-ROU-PROP',  'ROU — Property',          'IFRS-A-ROU', 3, 'asset', 'posting', 'debit',  NULL, 1751, 'GRP-A-ROU-PROP'),
    ('IFRS-A-ROU-VEH',   'ROU — Vehicles',          'IFRS-A-ROU', 3, 'asset', 'posting', 'debit',  NULL, 1752, 'GRP-A-ROU-EQUIP'),
    ('IFRS-A-ROU-EQUIP', 'ROU — Equipment',         'IFRS-A-ROU', 3, 'asset', 'posting', 'debit',  NULL, 1753, 'GRP-A-ROU-EQUIP'),
    ('IFRS-A-ROU-AMORT', 'Accum Depr — ROU',        'IFRS-A-ROU', 3, 'contra_asset', 'posting', 'credit', NULL, 1760, 'GRP-A-ROU-AMORT');

    -- B3: L3 POSTING — Assets: Intercompany Receivables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-ICR-TRADE', 'IC Receivables — Trade',    'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1810, 'GRP-A-ICR-TRADE'),
    ('IFRS-A-ICR-LOAN',  'IC Receivables — Loans',   'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1820, 'GRP-A-ICR-LOAN'),
    ('IFRS-A-ICR-DIV',   'IC Dividend Receivable',   'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1830, 'GRP-A-ICR-LOAN'),
    ('IFRS-A-ICR-MGMT',  'IC Mgmt Fee Receivable',   'IFRS-A-ICR', 3, 'asset', 'posting', 'debit', NULL, 1840, 'GRP-A-ICR-TRADE');

    -- B3: L3 POSTING — Assets: Deferred Tax Asset
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-DTAX-CUR', 'DTA — Current',            'IFRS-A-DTAX', 3, 'asset', 'posting', 'debit', NULL, 1851, 'GRP-A-OAR-PREPAY'),
    ('IFRS-A-DTAX-NCR', 'DTA — Non-Current',        'IFRS-A-DTAX', 3, 'asset', 'posting', 'debit', NULL, 1852, 'GRP-A-OAR-PREPAY');

    -- B3: L3 POSTING — Assets: Other Assets
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-A-OTHER-INVEST', 'Short-Term Investments',  'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1910, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OTHER-FVPL',   'FVPL Financial Assets',   'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1920, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OTHER-FVOCI',  'FVOCI Financial Assets',  'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1930, 'GRP-A-OAR-DEPOSIT'),
    ('IFRS-A-OTHER-MISC',   'Other Current Assets',    'IFRS-A-OTHER', 3, 'asset', 'posting', 'debit', NULL, 1940, 'GRP-A-OAR-DEPOSIT');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Liabilities
    -- ──────────────────────────────────────────────────────────────────────

    -- Trade Payables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-AP-TRADE',     'Trade Payables Control',       'IFRS-L-AP', 3, 'liability', 'posting', 'credit', 'ap',  2110, 'GRP-L-AP-TRADE'),
    ('IFRS-L-AP-RETENTION', 'Retention Payable',            'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2120, 'GRP-L-AP-RETENTION'),
    ('IFRS-L-AP-ACCRUED',   'Accrued Payables',             'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2130, 'GRP-L-AP-TRADE'),
    ('IFRS-L-AP-NOTES',     'Notes Payable',                'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2140, 'GRP-L-AP-TRADE'),
    ('IFRS-L-AP-ADVANCE',   'Advance from Customers',       'IFRS-L-AP', 3, 'liability', 'posting', 'credit', NULL,  2150, 'GRP-L-AP-TRADE');

    -- Accruals & Provisions
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-ACCR-GEN',     'General Accruals',             'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2210, 'GRP-L-ACCR-GEN'),
    ('IFRS-L-ACCR-WARRANTY','Warranty Provision',           'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2220, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-RESTRUCT','Restructuring Provision',      'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2230, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-LEGAL',   'Legal Provision',              'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2240, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-DECOM',   'Decommissioning Provision',    'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2250, 'GRP-L-ACCR-PROV'),
    ('IFRS-L-ACCR-OTHER',   'Other Provisions',             'IFRS-L-ACCR', 3, 'liability', 'posting', 'credit', NULL, 2260, 'GRP-L-ACCR-PROV');

    -- Tax Payables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-TAX-CIT',      'Corporate Income Tax Payable', 'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2310, 'GRP-L-TAX-CIT'),
    ('IFRS-L-TAX-VAT-OUT',  'VAT/GST Output',              'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2320, 'GRP-L-TAX-VAT-OUT'),
    ('IFRS-L-TAX-WHT',      'Withholding Tax Payable',      'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2330, 'GRP-L-TAX-WHT'),
    ('IFRS-L-TAX-EXCISE',   'Excise Tax Payable',           'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2335, 'GRP-L-TAX-CIT'),
    ('IFRS-L-TAX-CUSTOMS',  'Customs Duty Payable',         'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2336, 'GRP-L-TAX-CIT'),
    ('IFRS-L-TAX-OTHER',    'Other Tax Payables',           'IFRS-L-TAX', 3, 'liability', 'posting', 'credit', NULL, 2340, 'GRP-L-TAX-CIT');

    -- Employee Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-EMP-SAL',      'Salaries Payable',             'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2410, 'GRP-L-EMP-SAL'),
    ('IFRS-L-EMP-OT',       'Overtime Payable',             'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2415, 'GRP-L-EMP-SAL'),
    ('IFRS-L-EMP-ALLOW',    'Allowances Payable',           'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2420, 'GRP-L-EMP-BEN'),
    ('IFRS-L-EMP-SOCSEC',   'Social Security Payable',      'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2425, 'GRP-L-EMP-BEN'),
    ('IFRS-L-EMP-MEDICAL',  'Medical Insurance Payable',    'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2430, 'GRP-L-EMP-BEN'),
    ('IFRS-L-EMP-LEAVE',    'Leave Provision',              'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2440, 'GRP-L-EMP-LEAVE'),
    ('IFRS-L-EMP-EOS',      'End of Service / Gratuity',    'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2450, 'GRP-L-EMP-EOS'),
    ('IFRS-L-EMP-ESOP',     'ESOP Liability',               'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2460, 'GRP-L-EMP-EOS'),
    ('IFRS-L-EMP-BONUS',    'Bonus Accrual',                'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2465, 'GRP-L-EMP-SAL'),
    ('IFRS-L-EMP-PENSION',  'Pension Obligation',           'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2470, 'GRP-L-EMP-EOS'),
    ('IFRS-L-EMP-LONGTERM', 'Long-Term Employee Benefits',  'IFRS-L-EMP', 3, 'liability', 'posting', 'credit', NULL, 2475, 'GRP-L-EMP-EOS');

    -- Lease Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-LEASE-CUR', 'Lease Liabilities — Current',       'IFRS-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2510, 'GRP-L-LEASE-CUR'),
    ('IFRS-L-LEASE-NCR', 'Lease Liabilities — Non-Current',   'IFRS-L-LEASE', 3, 'liability', 'posting', 'credit', NULL, 2520, 'GRP-L-LEASE-NCR');

    -- Intercompany Payables
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-ICP-TRADE', 'IC Payables — Trade',               'IFRS-L-ICP', 3, 'liability', 'posting', 'credit', NULL, 2610, 'GRP-L-ICP-TRADE'),
    ('IFRS-L-ICP-LOAN',  'IC Payables — Loans',               'IFRS-L-ICP', 3, 'liability', 'posting', 'credit', NULL, 2620, 'GRP-L-ICP-LOAN'),
    ('IFRS-L-ICP-DIV',   'IC Payables — Dividends',           'IFRS-L-ICP', 3, 'liability', 'posting', 'credit', NULL, 2630, 'GRP-L-ICP-LOAN');

    -- Deferred Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-DEFREV-SVC',  'Deferred Revenue — Services',     'IFRS-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2710, 'GRP-L-DEFREV-SVC'),
    ('IFRS-L-DEFREV-PROJ', 'Deferred Revenue — Projects',     'IFRS-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2720, 'GRP-L-DEFREV-PROJ'),
    ('IFRS-L-DEFREV-SUB',  'Deferred Revenue — Subscriptions','IFRS-L-DEFREV', 3, 'liability', 'posting', 'credit', NULL, 2730, 'GRP-L-DEFREV-SVC');

    -- Deferred Tax Liability
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-DTAX-CUR', 'DTL — Current',                'IFRS-L-DTAX', 3, 'liability', 'posting', 'credit', NULL, 2751, 'GRP-L-TAX-CIT'),
    ('IFRS-L-DTAX-NCR', 'DTL — Non-Current',            'IFRS-L-DTAX', 3, 'liability', 'posting', 'credit', NULL, 2752, 'GRP-L-TAX-CIT');

    -- Other Liabilities
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-L-OTHL-CUSTDEP', 'Customer Deposits',           'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2810, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-REFUND',  'Refund Liabilities',          'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2820, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-CONTLIA', 'Contract Liabilities',        'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2830, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-BORROW',  'Short-Term Borrowings',       'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2840, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-LTERM',   'Long-Term Borrowings',        'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2850, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-DERIV',   'Derivative Liabilities',      'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2860, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-GOVGRANT','Government Grant Liabilities','IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2870, 'GRP-L-OTHL-OTHER'),
    ('IFRS-L-OTHL-OTHER',   'Other Current Liabilities',   'IFRS-L-OTHL', 3, 'liability', 'posting', 'credit', NULL, 2890, 'GRP-L-OTHL-OTHER');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Equity
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-Q-CAP-ISSUED',  'Issued Share Capital',          'IFRS-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3110, 'GRP-Q-CAP-ISSUED'),
    ('IFRS-Q-CAP-PREM',    'Share Premium',                 'IFRS-Q-CAP', 3, 'equity', 'posting', 'credit', NULL, 3120, 'GRP-Q-CAP-PREM'),
    ('IFRS-Q-CAP-TREASURY','Treasury Shares',               'IFRS-Q-CAP', 3, 'contra_equity', 'posting', 'debit',  NULL, 3130, 'GRP-Q-CAP-ISSUED'),
    ('IFRS-Q-RES-STAT',    'Statutory Reserve',             'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3210, 'GRP-Q-RES-STAT'),
    ('IFRS-Q-RES-GEN',     'General Reserve',               'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3220, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RES-TRANS',   'Translation Reserve',           'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3230, 'GRP-Q-RES-TRANS'),
    ('IFRS-Q-RES-HEDGE',   'Hedging Reserve',               'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3240, 'GRP-Q-RES-HEDGE'),
    ('IFRS-Q-RES-REVAL',   'Revaluation Reserve',           'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3250, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RES-FVOCI',   'FVOCI Reserve',                 'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3260, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RES-ESOP',    'ESOP Reserve',                  'IFRS-Q-RES', 3, 'equity', 'posting', 'credit', NULL, 3270, 'GRP-Q-RES-GEN'),
    ('IFRS-Q-RE-OPENING',  'Retained Earnings — Opening',   'IFRS-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3310, 'GRP-Q-RE-OPENING'),
    ('IFRS-Q-RE-CY',       'Current Year P&L',              'IFRS-Q-RE',  3, 'equity', 'posting', 'credit', NULL, 3320, 'GRP-Q-RE-CY'),
    ('IFRS-Q-RE-DIV',      'Dividends Declared',            'IFRS-Q-RE',  3, 'contra_equity', 'posting', 'debit',  NULL, 3330, 'GRP-Q-RE-DIV');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Revenue
    -- ──────────────────────────────────────────────────────────────────────

    -- Sales Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-SALES-GOODS', 'Revenue — Goods',               'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4110, 'GRP-R-SALES-GOODS'),
    ('IFRS-R-SALES-SVC',   'Revenue — Services',            'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4120, 'GRP-R-SALES-SVC'),
    ('IFRS-R-SALES-PROJ',  'Revenue — Projects',            'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4130, 'GRP-R-SALES-PROJ'),
    ('IFRS-R-SALES-SUB',   'Revenue — Subscriptions',       'IFRS-R-SALES', 3, 'income', 'posting', 'credit', NULL, 4140, 'GRP-R-SALES-SVC'),
    ('IFRS-R-SALES-DISC',  'Sales Discounts & Allowances',  'IFRS-R-SALES', 3, 'income', 'posting', 'debit',  NULL, 4150, 'GRP-R-SALES-GOODS'),
    ('IFRS-R-SALES-RET',   'Sales Returns',                 'IFRS-R-SALES', 3, 'income', 'posting', 'debit',  NULL, 4160, 'GRP-R-SALES-GOODS');

    -- Other Operating Income
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-OOI-RENTAL',   'Rental Income',                 'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4210, 'GRP-R-OOI-RENTAL'),
    ('IFRS-R-OOI-MGMTFEE', 'Management Fee Income',         'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4220, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-GAIN',    'Gain on Disposal',              'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4230, 'GRP-R-OOI-GAIN'),
    ('IFRS-R-OOI-SCRAP',   'Scrap & Salvage Income',        'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4235, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-INSCLM',  'Insurance Claims Received',     'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4236, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-GOVGRANT','Government Grant Income',       'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4237, 'GRP-R-OOI-MISC'),
    ('IFRS-R-OOI-MISC',    'Miscellaneous Income',          'IFRS-R-OOI', 3, 'income', 'posting', 'credit', NULL, 4240, 'GRP-R-OOI-MISC');

    -- Finance Income
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-FIN-INT',     'Interest Income',               'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4310, 'GRP-R-FIN-INT'),
    ('IFRS-R-FIN-FX',      'Foreign Exchange Gain',         'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4320, 'GRP-R-FIN-FX'),
    ('IFRS-R-FIN-FV',      'Fair Value Gain',               'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4330, 'GRP-R-FIN-INT'),
    ('IFRS-R-FIN-DIVRECV', 'Dividend Income',               'IFRS-R-FIN', 3, 'income', 'posting', 'credit', NULL, 4340, 'GRP-R-FIN-INT');

    -- Intercompany Revenue
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-R-ICR-MGMT',  'IC Management Fee Income',        'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4410, 'GRP-R-ICR-MGMT'),
    ('IFRS-R-ICR-SVCS',  'IC Service Revenue',              'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4420, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-DIV',   'IC Dividend Income',              'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4430, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-RENT',  'IC Rental Income',                'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4440, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-ROYAL', 'IC Royalty Income',               'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4450, 'GRP-R-ICR-SVCS'),
    ('IFRS-R-ICR-GOODS', 'IC Sale of Goods',                'IFRS-R-ICR', 3, 'income', 'posting', 'credit', NULL, 4460, 'GRP-R-ICR-SVCS');

    -- ──────────────────────────────────────────────────────────────────────
    -- B3: L3 POSTING ACCOUNTS — Expenses
    -- ──────────────────────────────────────────────────────────────────────

    -- Cost of Sales
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-COGS-MAT',       'Materials Consumed',             'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5110, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-LABOUR',    'Direct Labour',                  'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5120, 'GRP-E-COGS-LABOUR'),
    ('IFRS-E-COGS-OH',        'Production Overhead',            'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5130, 'GRP-E-COGS-OH'),
    ('IFRS-E-COGS-SUB',       'Subcontracting',                 'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5140, 'GRP-E-COGS-SUB'),
    ('IFRS-E-COGS-FREIGHT',   'Freight & Distribution',         'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5150, 'GRP-E-COGS-FREIGHT'),
    ('IFRS-E-COGS-INVWD',     'Inventory Write-Down',           'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5160, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-CUSTOMS',   'Customs & Import Duties',        'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5165, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-PACKAGING', 'Packaging Materials',            'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5170, 'GRP-E-COGS-MAT'),
    ('IFRS-E-COGS-WARRANTY',  'Warranty Cost',                  'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5175, 'GRP-E-COGS-OH'),
    ('IFRS-E-COGS-VARIANCE',  'Production Variance',            'IFRS-E-COGS', 3, 'expense', 'posting', 'debit', NULL, 5180, 'GRP-E-COGS-OH');

    -- Selling & Distribution
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-SELL-ADVERT',    'Advertising & Promotion',        'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5210, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-COMM',      'Sales Commissions',              'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5220, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-DIST',      'Distribution Costs',             'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5230, 'GRP-E-COGS-FREIGHT'),
    ('IFRS-E-SELL-CUSTSVC',   'Customer Service',               'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5240, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-SELL-TRAVEL',    'Sales Travel & Entertainment',   'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5250, 'GRP-E-SGA-TRAVEL'),
    ('IFRS-E-SELL-EXHIBIT',   'Exhibitions & Events',           'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5260, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-DIGITAL',   'Digital Marketing',              'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5265, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-SAMPLES',   'Samples & Giveaways',           'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5270, 'GRP-E-SGA-MKTG'),
    ('IFRS-E-SELL-WAREHOUSE', 'Warehousing & Storage',          'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5275, 'GRP-E-COGS-FREIGHT'),
    ('IFRS-E-SELL-RETURNS',   'Sales Returns Handling',         'IFRS-E-SELL', 3, 'expense', 'posting', 'debit', NULL, 5280, 'GRP-E-SGA-OFFICE');

    -- General & Administrative
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-GA-OFFICE',      'Office & Admin Supplies',        'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5310, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-LEGAL',       'Legal Fees',                     'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5315, 'GRP-E-SGA-PROF'),
    ('IFRS-E-GA-AUDIT',       'Audit & Accounting Fees',        'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5320, 'GRP-E-SGA-PROF'),
    ('IFRS-E-GA-CONSULT',     'Consulting Fees',                'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5325, 'GRP-E-SGA-PROF'),
    ('IFRS-E-GA-IT',          'IT & Software',                  'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5330, 'GRP-E-SGA-IT'),
    ('IFRS-E-GA-TELECOM',     'Telecom & Communications',       'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5335, 'GRP-E-SGA-IT'),
    ('IFRS-E-GA-BANK',        'Bank Charges — Admin',           'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5340, 'GRP-E-FIN-BANK'),
    ('IFRS-E-GA-INS',         'Insurance',                      'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5345, 'GRP-E-SGA-INS'),
    ('IFRS-E-GA-RENT',        'Rent & Occupancy',               'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5350, 'GRP-E-SGA-RENT'),
    ('IFRS-E-GA-UTIL',        'Utilities',                      'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5355, 'GRP-E-SGA-UTIL'),
    ('IFRS-E-GA-REPAIR',      'Repairs & Maintenance',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5360, 'GRP-E-SGA-REPAIR'),
    ('IFRS-E-GA-TRAVEL',      'General Travel & Entertainment', 'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5365, 'GRP-E-SGA-TRAVEL'),
    ('IFRS-E-GA-PRINTING',    'Printing & Stationery',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5370, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-COURIER',     'Courier & Postage',              'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5375, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-SUBS',        'Subscriptions & Memberships',    'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5380, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-DONATE',      'Donations & CSR',                'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5385, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-SECURITY',    'Security Services',              'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5386, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-CLEANING',    'Cleaning & Janitorial',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5387, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-VEHICLE',     'Vehicle Running Costs',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5388, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-LICENSE',     'Licence & Permit Fees',          'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5389, 'GRP-E-SGA-OFFICE'),
    ('IFRS-E-GA-MISC',        'Miscellaneous G&A',              'IFRS-E-GA', 3, 'expense', 'posting', 'debit', NULL, 5390, 'GRP-E-SGA-OFFICE');

    -- HR & Payroll
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-HR-SAL',         'Salaries & Wages',               'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5410, 'GRP-E-HR-SAL'),
    ('IFRS-E-HR-OT',          'Overtime',                       'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5415, 'GRP-E-HR-SAL'),
    ('IFRS-E-HR-ALLOW',       'Allowances',                     'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5420, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-SOCSEC',      'Social Security Contributions',  'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5425, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-MEDICAL',     'Medical Insurance',              'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5430, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-TRAIN',       'Training & Development',         'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5435, 'GRP-E-HR-TRAIN'),
    ('IFRS-E-HR-RECRUIT',     'Recruitment Costs',              'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5440, 'GRP-E-HR-RECRUIT'),
    ('IFRS-E-HR-EOS',         'End of Service Expense',         'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5445, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-ESOP',        'ESOP / Share-Based Payment',     'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5450, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-LEAVE',       'Leave Expense',                  'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5455, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-BONUS',       'Bonuses & Incentives',           'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5460, 'GRP-E-HR-SAL'),
    ('IFRS-E-HR-RELOC',       'Relocation Costs',               'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5465, 'GRP-E-HR-BEN'),
    ('IFRS-E-HR-WELFARE',     'Staff Welfare',                  'IFRS-E-HR', 3, 'expense', 'posting', 'debit', NULL, 5470, 'GRP-E-HR-BEN');

    -- Depreciation & Amortisation
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-DA-BLDG',   'Depreciation — Buildings',       'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5510, 'GRP-E-DA-BLDG'),
    ('IFRS-E-DA-PLANT',  'Depreciation — Plant',           'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5515, 'GRP-E-DA-PLANT'),
    ('IFRS-E-DA-VEH',    'Depreciation — Vehicles',        'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5520, 'GRP-E-DA-VEH'),
    ('IFRS-E-DA-IT',     'Depreciation — IT',              'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5525, 'GRP-E-DA-IT'),
    ('IFRS-E-DA-FURN',   'Depreciation — Furniture',       'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5530, 'GRP-E-DA-BLDG'),
    ('IFRS-E-DA-LHI',    'Depreciation — LHI',             'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5535, 'GRP-E-DA-BLDG'),
    ('IFRS-E-DA-TOOLS',  'Depreciation — Tools',           'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5537, 'GRP-E-DA-PLANT'),
    ('IFRS-E-DA-ROU',    'Depreciation — ROU Assets',      'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5540, 'GRP-E-DA-ROU'),
    ('IFRS-E-DA-AMORT',  'Amortisation — Intangibles',     'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5550, 'GRP-E-DA-AMORT'),
    ('IFRS-E-DA-GWIMPR', 'Goodwill Impairment',            'IFRS-E-DA', 3, 'expense', 'posting', 'debit', NULL, 5555, 'GRP-E-DA-AMORT');

    -- Finance Costs
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-FIN-INT',    'Interest Expense',              'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5610, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-LEASE',  'Lease Interest (IFRS 16)',      'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5620, 'GRP-E-FIN-LEASE'),
    ('IFRS-E-FIN-FX',     'Foreign Exchange Loss',         'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5630, 'GRP-E-FIN-FX'),
    ('IFRS-E-FIN-BANK',   'Bank Charges',                  'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5640, 'GRP-E-FIN-BANK'),
    ('IFRS-E-FIN-FV',     'Fair Value Loss',               'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5650, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-COMMIT',  'Commitment Fees',              'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5655, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-UNWIND',  'Discount Unwinding',           'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5660, 'GRP-E-FIN-INT'),
    ('IFRS-E-FIN-GUARANT', 'Guarantee Fees',               'IFRS-E-FIN', 3, 'expense', 'posting', 'debit', NULL, 5665, 'GRP-E-FIN-BANK');

    -- Tax Expense
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-TAX-CIT',  'Income Tax Expense',              'IFRS-E-TAX', 3, 'expense', 'posting', 'debit', NULL, 5710, 'GRP-E-TAX-CIT'),
    ('IFRS-E-TAX-DT',   'Deferred Tax Expense',            'IFRS-E-TAX', 3, 'expense', 'posting', 'debit', NULL, 5720, 'GRP-E-TAX-DT');

    -- Intercompany Expense
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-ICE-MGMT',    'IC Management Fee Expense',    'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5810, 'GRP-E-ICE-MGMT'),
    ('IFRS-E-ICE-SVCS',    'IC Service Expense',           'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5820, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-ROYALTY',  'IC Royalty Expense',           'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5830, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-IT',      'IC IT Service Expense',        'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5835, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-RENT',    'IC Rent Expense',              'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5840, 'GRP-E-ICE-SVCS'),
    ('IFRS-E-ICE-PURCHASE','IC Purchase of Goods',         'IFRS-E-ICE', 3, 'expense', 'posting', 'debit', NULL, 5845, 'GRP-E-ICE-SVCS');

    -- Other Expenses
    INSERT INTO tmp_gl (code, name, parent_code, level_no, account_class, node_type, normal_balance, subledger_type, sort_order, group_map) VALUES
    ('IFRS-E-OTHER-LOSS',     'Loss on Disposal',           'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5910, 'GRP-E-OTHER-LOSS'),
    ('IFRS-E-OTHER-IMPAIR',   'Impairment Loss',            'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5920, 'GRP-E-OTHER-IMPAIR'),
    ('IFRS-E-OTHER-RESTRUCT', 'Restructuring Costs',        'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5930, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-PENALTY',  'Penalties & Fines',          'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5940, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-INVLOSS',  'Inventory Loss & Shrinkage', 'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5945, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-BADDEBT',  'Bad Debt Expense',           'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5950, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-ENVIRO',   'Environmental Costs',        'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5955, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-LITIGA',   'Litigation Settlement',      'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5960, 'GRP-E-OTHER-MISC'),
    ('IFRS-E-OTHER-MISC',     'Miscellaneous Expense',      'IFRS-E-OTHER', 3, 'expense', 'posting', 'debit', NULL, 5990, 'GRP-E-OTHER-MISC');

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE C: UPSERT — L1 roots (parent_code IS NULL)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
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
       OR master.gl_account.metadata->'_seed'->>'pack' IS DISTINCT FROM v_pack
       OR master.gl_account.metadata->>'_group_map' IS DISTINCT FROM EXCLUDED.metadata->>'_group_map';

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT — L2 headers (parent is L1 root)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
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

    -- ══════════════════════════════════════════════════════════════════════
    -- STAGE E: UPSERT — L3 posting accounts (parent is L2 header)
    -- ══════════════════════════════════════════════════════════════════════

    INSERT INTO master.gl_account (
        id, tenant_id, chart_of_account_id, code, name,
        parent_id, level_no, path, description,
        account_class, node_type, normal_balance, subledger_type,
        sort_order,
        metadata, status, created_by
    )
    SELECT
        t.seed_id, v_tid, v_coa_id, t.code, t.name,
        p.id, t.level_no, p.path || '/' || t.code, t.description,
        t.account_class, t.node_type, t.normal_balance, upper(t.subledger_type),
        t.sort_order,
        v_meta
            || jsonb_build_object('_display_no', t.sort_order::text)
            || CASE WHEN t.group_map IS NOT NULL
                    THEN jsonb_build_object('_group_map', t.group_map)
                    ELSE '{}'::jsonb
               END,
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
                         || CASE WHEN EXCLUDED.metadata ? '_group_map'
                                 THEN jsonb_build_object('_group_map', EXCLUDED.metadata->>'_group_map')
                                 ELSE '{}'::jsonb
                            END,
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

    IF v_total < 280 THEN
        RAISE EXCEPTION '[211_framework_ifrs] Expected >= 280 total accounts, got %', v_total;
    END IF;

    IF v_roots <> 5 THEN
        RAISE EXCEPTION '[211_framework_ifrs] Expected 5 class roots, got %', v_roots;
    END IF;

    IF v_posting < 200 THEN
        RAISE EXCEPTION '[211_framework_ifrs] Expected >= 200 posting accounts, got %', v_posting;
    END IF;

    IF v_gmap_ok <> v_posting THEN
        RAISE EXCEPTION '[211_framework_ifrs] All posting accounts must have _group_map. Found % of % with it', v_gmap_ok, v_posting;
    END IF;

    IF v_gmap_missing <> 0 THEN
        RAISE EXCEPTION '[211_framework_ifrs] Found % posting accounts mapped to missing group accounts', v_gmap_missing;
    END IF;

    RAISE NOTICE '[211_framework_ifrs] IFRS operating chart seeded: % total accounts (% roots, % posting, % with _group_map)',
        v_total, v_roots, v_posting, v_gmap_ok;

END $seed$;
