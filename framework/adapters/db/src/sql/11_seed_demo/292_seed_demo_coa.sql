/* ============================================================================
   Athyper v2.1 — Chart of Accounts Seed (Blueprint-Based)
   Table: fin.chart_of_accounts
   Dependencies: core.tenant, 291 (operating units for entity_code discovery)

   Account numbering scheme (common across all blueprints):
     1xxx = Assets, 2xxx = Liabilities, 3xxx = Equity
     4xxx = Revenue, 5xxx = COGS, 6xxx = Operating Expenses
     7xxx = Other Income, 8xxx = Other Expenses, 9xxx = Tax

   Blueprint subsets:
     A (~18 accounts)  — minimal freelancer
     B (~26 accounts)  — A + COGS + more OPEX
     C (~42 accounts)  — B + PP&E + revenue split + other income/expense
     D (~52 accounts)  — full master (C + granular detail)
     E (~42 accounts)  — same as C
     F (~42 per entity) — C replicated per entity_code (LE-CA/LE-MY/LE-SA/LE-IN)
   ============================================================================ */

-- ============================================================================
-- Helper: Insert a batch of COA rows for a given tenant + entity_code
-- Accepts text[][] where each row is:
--   {account_code, account_name, account_type, normal_balance, level, is_group, parent_code, subledger_type}
-- parent_code = '' means NULL parent.
-- subledger_type = '' means NULL.
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.seed_coa(
    p_tenant uuid, p_entity_code text, p_accounts text[][]
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
    i int;
    v_parent_id uuid;
BEGIN
    FOR i IN 1..array_length(p_accounts, 1) LOOP
        -- Resolve parent
        IF p_accounts[i][7] = '' THEN
            v_parent_id := NULL;
        ELSE
            SELECT id INTO v_parent_id
            FROM fin.chart_of_accounts
            WHERE tenant_id = p_tenant
              AND entity_code = p_entity_code
              AND account_code = p_accounts[i][7];
        END IF;

        INSERT INTO fin.chart_of_accounts (
            id, tenant_id, entity_code, account_code, account_name,
            account_type, normal_balance, parent_id, level,
            is_group, allow_direct_posting, subledger_type
        ) VALUES (
            gen_random_uuid(), p_tenant, p_entity_code,
            p_accounts[i][1], p_accounts[i][2],
            p_accounts[i][3], p_accounts[i][4],
            v_parent_id, p_accounts[i][5]::smallint,
            p_accounts[i][6]::boolean,
            NOT p_accounts[i][6]::boolean,
            NULLIF(p_accounts[i][8], '')
        )
        ON CONFLICT (tenant_id, entity_code, account_code)
        DO UPDATE SET updated_at = now();
    END LOOP;
END $fn$;

-- ============================================================================
-- Blueprint A accounts (~18) — Freelancer/Solo
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.coa_blueprint_a(p_tenant uuid, p_entity_code text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM pg_temp.seed_coa(p_tenant, p_entity_code, ARRAY[
        -- ASSETS
        ARRAY['1000','Assets',                     'ASSET',     'DEBIT',  '1','true', '',    ''],
        ARRAY['1100','Current Assets',             'ASSET',     'DEBIT',  '2','true', '1000',''],
        ARRAY['1110','Cash & Bank',                'ASSET',     'DEBIT',  '3','false','1100',''],
        ARRAY['1120','Accounts Receivable',        'ASSET',     'DEBIT',  '3','false','1100','AR'],
        ARRAY['1140','Prepaid Expenses',           'ASSET',     'DEBIT',  '3','false','1100',''],
        -- LIABILITIES
        ARRAY['2000','Liabilities',                'LIABILITY', 'CREDIT', '1','true', '',    ''],
        ARRAY['2100','Current Liabilities',        'LIABILITY', 'CREDIT', '2','true', '2000',''],
        ARRAY['2110','Accounts Payable',           'LIABILITY', 'CREDIT', '3','false','2100','AP'],
        ARRAY['2120','Accrued Expenses',           'LIABILITY', 'CREDIT', '3','false','2100',''],
        -- EQUITY
        ARRAY['3000','Equity',                     'EQUITY',    'CREDIT', '1','true', '',    ''],
        ARRAY['3100','Owner Capital',              'EQUITY',    'CREDIT', '2','false','3000',''],
        ARRAY['3200','Retained Earnings',          'EQUITY',    'CREDIT', '2','false','3000',''],
        -- REVENUE
        ARRAY['4000','Revenue',                    'REVENUE',   'CREDIT', '1','true', '',    ''],
        ARRAY['4200','Service Revenue',            'REVENUE',   'CREDIT', '2','false','4000',''],
        -- EXPENSES
        ARRAY['6000','Operating Expenses',         'EXPENSE',   'DEBIT',  '1','true', '',    ''],
        ARRAY['6100','Salaries & Wages',           'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6200','Rent & Utilities',           'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6300','Office Supplies',            'EXPENSE',   'DEBIT',  '2','false','6000','']
    ]::text[][]);
END $fn$;

-- ============================================================================
-- Blueprint B accounts (~26) — Small business (A + COGS + more OPEX)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.coa_blueprint_b(p_tenant uuid, p_entity_code text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    -- Seed A first
    PERFORM pg_temp.coa_blueprint_a(p_tenant, p_entity_code);

    -- Additional B accounts
    PERFORM pg_temp.seed_coa(p_tenant, p_entity_code, ARRAY[
        -- LIABILITIES extras
        ARRAY['2130','Tax Payable',                'LIABILITY', 'CREDIT', '3','false','2100',''],
        -- REVENUE extras
        ARRAY['4100','Product Sales',              'REVENUE',   'CREDIT', '2','false','4000',''],
        -- COGS
        ARRAY['5000','Cost of Goods Sold',         'EXPENSE',   'DEBIT',  '1','true', '',    ''],
        ARRAY['5100','Direct Materials',           'EXPENSE',   'DEBIT',  '2','false','5000',''],
        -- OPEX extras
        ARRAY['6400','Travel & Entertainment',     'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6500','Insurance',                  'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6600','Professional Fees',          'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6700','Marketing & Advertising',    'EXPENSE',   'DEBIT',  '2','false','6000','']
    ]::text[][]);
END $fn$;

-- ============================================================================
-- Blueprint C accounts (~42) — SME (B + PP&E + revenue split + other inc/exp)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.coa_blueprint_c(p_tenant uuid, p_entity_code text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    -- Seed B first
    PERFORM pg_temp.coa_blueprint_b(p_tenant, p_entity_code);

    -- Additional C accounts
    PERFORM pg_temp.seed_coa(p_tenant, p_entity_code, ARRAY[
        -- NON-CURRENT ASSETS
        ARRAY['1200','Non-Current Assets',         'ASSET',     'DEBIT',  '2','true', '1000',''],
        ARRAY['1210','Property, Plant & Equipment','ASSET',     'DEBIT',  '3','false','1200',''],
        ARRAY['1220','Accumulated Depreciation',   'ASSET',     'CREDIT', '3','false','1200',''],
        ARRAY['1230','Intangible Assets',          'ASSET',     'DEBIT',  '3','false','1200',''],
        ARRAY['1250','Work in Progress (Capital)', 'ASSET',     'DEBIT',  '3','false','1200','WIP'],
        -- CURRENT ASSETS extras
        ARRAY['1130','Inventory',                  'ASSET',     'DEBIT',  '3','false','1100','INVENTORY'],
        -- LIABILITIES extras
        ARRAY['2200','Non-Current Liabilities',    'LIABILITY', 'CREDIT', '2','true', '2000',''],
        ARRAY['2210','Long-Term Debt',             'LIABILITY', 'CREDIT', '3','false','2200',''],
        -- REVENUE extras
        ARRAY['4300','Subscription Revenue',       'REVENUE',   'CREDIT', '2','false','4000',''],
        ARRAY['4900','Other Revenue',              'REVENUE',   'CREDIT', '2','false','4000',''],
        -- COGS extras
        ARRAY['5200','Direct Labour',              'EXPENSE',   'DEBIT',  '2','false','5000',''],
        -- OPEX extras
        ARRAY['6800','Depreciation & Amortization','EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6900','IT & Technology',            'EXPENSE',   'DEBIT',  '2','false','6000',''],
        -- OTHER INCOME/EXPENSE
        ARRAY['7000','Other Income',               'REVENUE',   'CREDIT', '1','true', '',    ''],
        ARRAY['7100','Interest Income',            'REVENUE',   'CREDIT', '2','false','7000',''],
        ARRAY['7200','Foreign Exchange Gain',      'REVENUE',   'CREDIT', '2','false','7000',''],
        ARRAY['8000','Other Expenses',             'EXPENSE',   'DEBIT',  '1','true', '',    ''],
        ARRAY['8100','Interest Expense',           'EXPENSE',   'DEBIT',  '2','false','8000',''],
        ARRAY['8200','Foreign Exchange Loss',      'EXPENSE',   'DEBIT',  '2','false','8000',''],
        -- TAX
        ARRAY['9000','Income Tax Expense',         'EXPENSE',   'DEBIT',  '1','false','',    '']
    ]::text[][]);
END $fn$;

-- ============================================================================
-- Blueprint D accounts (~52) — Big single country (C + granular detail)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.coa_blueprint_d(p_tenant uuid, p_entity_code text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    -- Seed C first
    PERFORM pg_temp.coa_blueprint_c(p_tenant, p_entity_code);

    -- Additional D accounts (granular detail for large enterprise)
    PERFORM pg_temp.seed_coa(p_tenant, p_entity_code, ARRAY[
        -- CURRENT ASSETS extras
        ARRAY['1150','Short-Term Investments',     'ASSET',     'DEBIT',  '3','false','1100',''],
        ARRAY['1160','Employee Advances',          'ASSET',     'DEBIT',  '3','false','1100',''],
        -- NON-CURRENT ASSETS extras
        ARRAY['1240','Right-of-Use Assets',        'ASSET',     'DEBIT',  '3','false','1200',''],
        ARRAY['1260','Capital WIP - IT',           'ASSET',     'DEBIT',  '3','false','1200','WIP'],
        -- LIABILITIES extras
        ARRAY['2140','Payroll Liabilities',        'LIABILITY', 'CREDIT', '3','false','2100',''],
        ARRAY['2150','Deferred Revenue',           'LIABILITY', 'CREDIT', '3','false','2100',''],
        ARRAY['2220','Lease Liabilities',          'LIABILITY', 'CREDIT', '3','false','2200',''],
        -- COGS extras
        ARRAY['5300','Manufacturing Overhead',     'EXPENSE',   'DEBIT',  '2','false','5000',''],
        ARRAY['5400','Freight & Shipping',         'EXPENSE',   'DEBIT',  '2','false','5000',''],
        -- OPEX extras
        ARRAY['6110','Employee Benefits',          'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6120','Payroll Taxes',              'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6310','Printing & Stationery',      'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6410','Meals & Entertainment',      'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6610','Legal Fees',                 'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6620','Audit & Accounting Fees',    'EXPENSE',   'DEBIT',  '2','false','6000',''],
        ARRAY['6710','Digital Marketing',          'EXPENSE',   'DEBIT',  '2','false','6000',''],
        -- INTERCOMPANY
        ARRAY['1900','Intercompany Receivable',    'ASSET',     'DEBIT',  '2','false','1000',''],
        ARRAY['2900','Intercompany Payable',       'LIABILITY', 'CREDIT', '2','false','2000','']
    ]::text[][]);
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_code   text;
    v_entity text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        CASE v_code
            -- Blueprint A: Freelancer/Solo
            WHEN 'demo_my', 'demo_in' THEN
                PERFORM pg_temp.coa_blueprint_a(v_tenant, 'HQ');

            -- Blueprint B: Small (0-25)
            WHEN 'demo_sa', 'demo_qa' THEN
                PERFORM pg_temp.coa_blueprint_b(v_tenant, 'HQ');

            -- Blueprint C: SME
            WHEN 'demo_fr', 'demo_de' THEN
                PERFORM pg_temp.coa_blueprint_c(v_tenant, 'HQ');

            -- Blueprint D: Big single country
            WHEN 'demo_us' THEN
                PERFORM pg_temp.coa_blueprint_d(v_tenant, 'HQ');

            -- Blueprint E: Multi-location (same as C, single entity_code)
            WHEN 'demo_ch' THEN
                PERFORM pg_temp.coa_blueprint_c(v_tenant, 'HQ');

            -- Blueprint F: Multi-country (C replicated per legal entity)
            WHEN 'demo_ca' THEN
                FOR v_entity IN SELECT DISTINCT entity_code
                    FROM fin.operating_unit
                    WHERE tenant_id = v_tenant
                      AND entity_code != 'HQ'
                    ORDER BY entity_code LOOP
                    PERFORM pg_temp.coa_blueprint_c(v_tenant, v_entity);
                END LOOP;

            ELSE
                RAISE NOTICE 'COA: No blueprint mapping for tenant %', v_code;
        END CASE;

        RAISE NOTICE 'COA seeded for tenant %', v_code;
    END LOOP;
END $$;
