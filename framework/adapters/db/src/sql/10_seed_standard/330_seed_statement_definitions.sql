/* ============================================================================
   Athyper v2.1 — Statement Engine Seed: Standard P&L + Balance Sheet
   Table: fin.statement_definition, fin.statement_line, fin.statement_line_account
   Dependencies: 194_statement_engine.sql

   These are SYSTEM-scope definitions usable by any tenant.
   Account mappings use TYPE mode to be COA-agnostic.
   ============================================================================ */

-- ============================================================================
-- Helper: create a SYSTEM-scope statement definition
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.seed_stmt_def(
    p_code        TEXT,
    p_name        TEXT,
    p_type        TEXT,
    p_description TEXT DEFAULT NULL,
    p_book_codes  TEXT[] DEFAULT NULL,
    p_standard    TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v_id UUID;
BEGIN
    -- Use a deterministic UUID based on the definition code
    v_id := gen_random_uuid();

    INSERT INTO fin.statement_definition (
        id, tenant_id, entity_code, definition_code, name, description,
        statement_type, book_codes, reporting_standard, scope, sort_order, version
    )
    SELECT
        v_id,
        t.id,             -- first tenant
        '*',              -- available for all entities
        p_code, p_name, p_description,
        p_type, p_book_codes, p_standard,
        'SYSTEM', 0, 1
    FROM core.tenant t
    LIMIT 1
    ON CONFLICT (tenant_id, entity_code, definition_code, version)
    DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        statement_type = EXCLUDED.statement_type,
        book_codes = EXCLUDED.book_codes,
        reporting_standard = EXCLUDED.reporting_standard,
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: insert a statement line
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.seed_stmt_line(
    p_def_id       UUID,
    p_line_code    TEXT,
    p_label        TEXT,
    p_line_type    TEXT,
    p_parent_code  TEXT DEFAULT NULL,
    p_level        INTEGER DEFAULT 0,
    p_sort_order   INTEGER DEFAULT 0,
    p_is_bold      BOOLEAN DEFAULT FALSE,
    p_is_underlined BOOLEAN DEFAULT FALSE,
    p_indent_level INTEGER DEFAULT 0,
    p_normal_bal   TEXT DEFAULT 'DEBIT',
    p_calc_formula JSONB DEFAULT NULL,
    p_acct_type    TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v_id UUID := gen_random_uuid();
    v_parent_id UUID;
BEGIN
    IF p_parent_code IS NOT NULL THEN
        SELECT id INTO v_parent_id
        FROM fin.statement_line
        WHERE definition_id = p_def_id AND line_code = p_parent_code;
    END IF;

    INSERT INTO fin.statement_line (
        id, definition_id, line_code, label, line_type,
        parent_line_id, level, sort_order,
        is_bold, is_underlined, indent_level,
        normal_balance, calculation_formula, account_type_filter
    ) VALUES (
        v_id, p_def_id, p_line_code, p_label, p_line_type,
        v_parent_id, p_level, p_sort_order,
        p_is_bold, p_is_underlined, p_indent_level,
        p_normal_bal, p_calc_formula, p_acct_type
    )
    ON CONFLICT (definition_id, line_code)
    DO UPDATE SET
        label = EXCLUDED.label,
        line_type = EXCLUDED.line_type,
        parent_line_id = EXCLUDED.parent_line_id,
        level = EXCLUDED.level,
        sort_order = EXCLUDED.sort_order,
        is_bold = EXCLUDED.is_bold,
        is_underlined = EXCLUDED.is_underlined,
        indent_level = EXCLUDED.indent_level,
        normal_balance = EXCLUDED.normal_balance,
        calculation_formula = EXCLUDED.calculation_formula,
        account_type_filter = EXCLUDED.account_type_filter
    RETURNING id INTO v_id;

    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: insert an account mapping for a statement line (TYPE mode)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.seed_stmt_acct_type(
    p_line_id      UUID,
    p_account_type TEXT,
    p_sign         TEXT DEFAULT 'NATURAL',
    p_sort_order   SMALLINT DEFAULT 0
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO fin.statement_line_account (
        id, line_id, mapping_mode, account_type, sign_treatment, sort_order
    ) VALUES (
        gen_random_uuid(), p_line_id, 'TYPE', p_account_type, p_sign, p_sort_order
    )
    ON CONFLICT DO NOTHING;
END $fn$;

-- ============================================================================
-- Helper: insert an account mapping for a statement line (RANGE mode)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.seed_stmt_acct_range(
    p_line_id    UUID,
    p_range_from TEXT,
    p_range_to   TEXT,
    p_sign       TEXT DEFAULT 'NATURAL',
    p_sort_order SMALLINT DEFAULT 0
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO fin.statement_line_account (
        id, line_id, mapping_mode, range_from, range_to, sign_treatment, sort_order
    ) VALUES (
        gen_random_uuid(), p_line_id, 'RANGE', p_range_from, p_range_to, p_sign, p_sort_order
    )
    ON CONFLICT DO NOTHING;
END $fn$;


-- ============================================================================
-- 1. INCOME STATEMENT (Standard P&L)
-- ============================================================================

DO $pnl$
DECLARE
    v_def_id UUID;
    v_rev UUID; v_cogs UUID; v_gp UUID;
    v_opex UUID; v_ebit UUID;
    v_oi UUID; v_oe UUID; v_ebt UUID;
    v_tax UUID; v_ni UUID;
BEGIN
    -- Definition
    v_def_id := pg_temp.seed_stmt_def(
        'STD-PNL', 'Standard Income Statement', 'INCOME_STATEMENT',
        'Standard multi-step income statement with Revenue, COGS, Gross Profit, Operating Expenses, Other Income/Expenses, and Net Profit.',
        NULL, NULL
    );

    -- ── Revenue Section ─────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-S-REV', 'Revenue', 'SECTION',
        NULL, 0, 10, TRUE, FALSE, 0);

    v_rev := pg_temp.seed_stmt_line(v_def_id, 'PNL-REV', 'Revenue', 'ACCOUNT',
        'PNL-S-REV', 1, 20, FALSE, FALSE, 1, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_type(v_rev, 'REVENUE');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-REV-TOTAL', 'Total Revenue', 'SUBTOTAL',
        'PNL-S-REV', 1, 30, TRUE, TRUE, 0, 'CREDIT');

    -- ── COGS Section ────────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-S-COGS', 'Cost of Goods Sold', 'SECTION',
        NULL, 0, 40, TRUE, FALSE, 0);

    v_cogs := pg_temp.seed_stmt_line(v_def_id, 'PNL-COGS', 'Cost of Goods Sold', 'ACCOUNT',
        'PNL-S-COGS', 1, 50, FALSE, FALSE, 1, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_type(v_cogs, 'COGS');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-COGS-TOTAL', 'Total COGS', 'SUBTOTAL',
        'PNL-S-COGS', 1, 60, TRUE, TRUE, 0, 'DEBIT');

    -- ── Gross Profit ────────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-SEP1', '', 'SEPARATOR',
        NULL, 0, 65);

    v_gp := pg_temp.seed_stmt_line(v_def_id, 'PNL-GP', 'Gross Profit', 'CALCULATION',
        NULL, 0, 70, TRUE, TRUE, 0, 'CREDIT',
        '[{"lineCode":"PNL-REV-TOTAL","operator":"+"},{"lineCode":"PNL-COGS-TOTAL","operator":"-"}]'::jsonb
    );

    -- ── Operating Expenses Section ──────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-S-OPEX', 'Operating Expenses', 'SECTION',
        NULL, 0, 80, TRUE, FALSE, 0);

    v_opex := pg_temp.seed_stmt_line(v_def_id, 'PNL-OPEX', 'Operating Expenses', 'ACCOUNT',
        'PNL-S-OPEX', 1, 90, FALSE, FALSE, 1, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_type(v_opex, 'EXPENSE');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-OPEX-TOTAL', 'Total Operating Expenses', 'SUBTOTAL',
        'PNL-S-OPEX', 1, 100, TRUE, TRUE, 0, 'DEBIT');

    -- ── EBIT ────────────────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-SEP2', '', 'SEPARATOR',
        NULL, 0, 105);

    v_ebit := pg_temp.seed_stmt_line(v_def_id, 'PNL-EBIT', 'Operating Income (EBIT)', 'CALCULATION',
        NULL, 0, 110, TRUE, FALSE, 0, 'CREDIT',
        '[{"lineCode":"PNL-GP","operator":"+"},{"lineCode":"PNL-OPEX-TOTAL","operator":"-"}]'::jsonb
    );

    -- ── Other Income Section ────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-S-OI', 'Other Income', 'SECTION',
        NULL, 0, 120, FALSE, FALSE, 0);

    v_oi := pg_temp.seed_stmt_line(v_def_id, 'PNL-OI', 'Other Income', 'ACCOUNT',
        'PNL-S-OI', 1, 130, FALSE, FALSE, 1, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_oi, '7000', '7999');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-OI-TOTAL', 'Total Other Income', 'SUBTOTAL',
        'PNL-S-OI', 1, 140, FALSE, TRUE, 0, 'CREDIT');

    -- ── Other Expenses Section ──────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-S-OE', 'Other Expenses', 'SECTION',
        NULL, 0, 150, FALSE, FALSE, 0);

    v_oe := pg_temp.seed_stmt_line(v_def_id, 'PNL-OE', 'Other Expenses', 'ACCOUNT',
        'PNL-S-OE', 1, 160, FALSE, FALSE, 1, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_oe, '8000', '8999');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-OE-TOTAL', 'Total Other Expenses', 'SUBTOTAL',
        'PNL-S-OE', 1, 170, FALSE, TRUE, 0, 'DEBIT');

    -- ── Earnings Before Tax ─────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-SEP3', '', 'SEPARATOR',
        NULL, 0, 175);

    v_ebt := pg_temp.seed_stmt_line(v_def_id, 'PNL-EBT', 'Earnings Before Tax', 'CALCULATION',
        NULL, 0, 180, TRUE, FALSE, 0, 'CREDIT',
        '[{"lineCode":"PNL-EBIT","operator":"+"},{"lineCode":"PNL-OI-TOTAL","operator":"+"},{"lineCode":"PNL-OE-TOTAL","operator":"-"}]'::jsonb
    );

    -- ── Income Tax ──────────────────────────────────────────────────
    v_tax := pg_temp.seed_stmt_line(v_def_id, 'PNL-TAX', 'Income Tax Expense', 'ACCOUNT',
        NULL, 0, 190, FALSE, FALSE, 0, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_tax, '9000', '9999');

    -- ── Net Profit ──────────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'PNL-SEP4', '', 'SEPARATOR',
        NULL, 0, 195);

    v_ni := pg_temp.seed_stmt_line(v_def_id, 'PNL-NET', 'Net Profit / (Loss)', 'CALCULATION',
        NULL, 0, 200, TRUE, TRUE, 0, 'CREDIT',
        '[{"lineCode":"PNL-EBT","operator":"+"},{"lineCode":"PNL-TAX","operator":"-"}]'::jsonb
    );

    RAISE NOTICE 'Seeded STD-PNL (Income Statement): definition_id=%', v_def_id;
END $pnl$;


-- ============================================================================
-- 2. BALANCE SHEET
-- ============================================================================

DO $bs$
DECLARE
    v_def_id UUID;
    v_ca UUID; v_nca UUID; v_ta UUID;
    v_cl UUID; v_ncl UUID; v_tl UUID;
    v_eq UUID; v_tle UUID;
BEGIN
    -- Definition
    v_def_id := pg_temp.seed_stmt_def(
        'STD-BS', 'Standard Balance Sheet', 'BALANCE_SHEET',
        'Standard classified balance sheet with Current/Non-Current Assets, Current/Non-Current Liabilities, and Equity.',
        NULL, NULL
    );

    -- ── ASSETS ──────────────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-S-ASSETS', 'ASSETS', 'SECTION',
        NULL, 0, 10, TRUE, FALSE, 0);

    -- Current Assets
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-S-CA', 'Current Assets', 'SECTION',
        'BS-S-ASSETS', 1, 20, TRUE, FALSE, 1);

    v_ca := pg_temp.seed_stmt_line(v_def_id, 'BS-CA', 'Current Assets', 'ACCOUNT',
        'BS-S-CA', 2, 30, FALSE, FALSE, 2, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_ca, '1100', '1499');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-CA-TOTAL', 'Total Current Assets', 'SUBTOTAL',
        'BS-S-CA', 2, 40, TRUE, TRUE, 1, 'DEBIT');

    -- Non-Current Assets
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-S-NCA', 'Non-Current Assets', 'SECTION',
        'BS-S-ASSETS', 1, 50, TRUE, FALSE, 1);

    v_nca := pg_temp.seed_stmt_line(v_def_id, 'BS-NCA', 'Non-Current Assets', 'ACCOUNT',
        'BS-S-NCA', 2, 60, FALSE, FALSE, 2, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_nca, '1500', '1999');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-NCA-TOTAL', 'Total Non-Current Assets', 'SUBTOTAL',
        'BS-S-NCA', 2, 70, TRUE, TRUE, 1, 'DEBIT');

    -- Total Assets
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-SEP1', '', 'SEPARATOR',
        NULL, 0, 75);

    v_ta := pg_temp.seed_stmt_line(v_def_id, 'BS-TOTAL-ASSETS', 'TOTAL ASSETS', 'CALCULATION',
        NULL, 0, 80, TRUE, TRUE, 0, 'DEBIT',
        '[{"lineCode":"BS-CA-TOTAL","operator":"+"},{"lineCode":"BS-NCA-TOTAL","operator":"+"}]'::jsonb
    );

    -- ── LIABILITIES ─────────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-S-LIAB', 'LIABILITIES', 'SECTION',
        NULL, 0, 90, TRUE, FALSE, 0);

    -- Current Liabilities
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-S-CL', 'Current Liabilities', 'SECTION',
        'BS-S-LIAB', 1, 100, TRUE, FALSE, 1);

    v_cl := pg_temp.seed_stmt_line(v_def_id, 'BS-CL', 'Current Liabilities', 'ACCOUNT',
        'BS-S-CL', 2, 110, FALSE, FALSE, 2, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_cl, '2100', '2499');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-CL-TOTAL', 'Total Current Liabilities', 'SUBTOTAL',
        'BS-S-CL', 2, 120, TRUE, TRUE, 1, 'CREDIT');

    -- Non-Current Liabilities
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-S-NCL', 'Non-Current Liabilities', 'SECTION',
        'BS-S-LIAB', 1, 130, TRUE, FALSE, 1);

    v_ncl := pg_temp.seed_stmt_line(v_def_id, 'BS-NCL', 'Non-Current Liabilities', 'ACCOUNT',
        'BS-S-NCL', 2, 140, FALSE, FALSE, 2, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_ncl, '2500', '2999');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-NCL-TOTAL', 'Total Non-Current Liabilities', 'SUBTOTAL',
        'BS-S-NCL', 2, 150, TRUE, TRUE, 1, 'CREDIT');

    -- Total Liabilities
    v_tl := pg_temp.seed_stmt_line(v_def_id, 'BS-TOTAL-LIAB', 'Total Liabilities', 'CALCULATION',
        NULL, 0, 160, TRUE, TRUE, 0, 'CREDIT',
        '[{"lineCode":"BS-CL-TOTAL","operator":"+"},{"lineCode":"BS-NCL-TOTAL","operator":"+"}]'::jsonb
    );

    -- ── EQUITY ──────────────────────────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-SEP2', '', 'SEPARATOR',
        NULL, 0, 165);

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-S-EQ', 'EQUITY', 'SECTION',
        NULL, 0, 170, TRUE, FALSE, 0);

    v_eq := pg_temp.seed_stmt_line(v_def_id, 'BS-EQ', 'Equity', 'ACCOUNT',
        'BS-S-EQ', 1, 180, FALSE, FALSE, 1, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_eq, '3000', '3999');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-EQ-TOTAL', 'Total Equity', 'SUBTOTAL',
        'BS-S-EQ', 1, 190, TRUE, TRUE, 0, 'CREDIT');

    -- ── Total Liabilities & Equity ──────────────────────────────────
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'BS-SEP3', '', 'SEPARATOR',
        NULL, 0, 195);

    v_tle := pg_temp.seed_stmt_line(v_def_id, 'BS-TOTAL-LE', 'TOTAL LIABILITIES & EQUITY', 'CALCULATION',
        NULL, 0, 200, TRUE, TRUE, 0, 'CREDIT',
        '[{"lineCode":"BS-TOTAL-LIAB","operator":"+"},{"lineCode":"BS-EQ-TOTAL","operator":"+"}]'::jsonb
    );

    RAISE NOTICE 'Seeded STD-BS (Balance Sheet): definition_id=%', v_def_id;
END $bs$;
