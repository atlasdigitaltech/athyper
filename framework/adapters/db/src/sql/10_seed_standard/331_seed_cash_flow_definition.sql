/* ============================================================================
   Athyper v2.5 — Statement Engine Seed: Indirect Cash Flow Statement
   Table: fin.statement_definition, fin.statement_line, fin.statement_line_account
   Dependencies: 194_statement_engine.sql, 195_statement_engine_v2.sql,
                 330_seed_statement_definitions.sql (helper functions)

   Indirect method: starts from Net Income, adjusts for non-cash items,
   then shows working capital movements (BS deltas).

   Account scheme (from 292_seed_demo_coa.sql):
     1xxx = Assets, 2xxx = Liabilities, 3xxx = Equity
     4xxx = Revenue, 5xxx = COGS, 6xxx = Operating Expenses
     7xxx = Other Income, 8xxx = Other Expenses, 9xxx = Tax
   ============================================================================ */

DO $cf$
DECLARE
    v_def_id UUID;
    -- Operating activities
    v_ni UUID; v_dep UUID; v_amort UUID;
    v_ar UUID; v_inv UUID; v_prepaid UUID;
    v_ap UUID; v_accrued UUID;
    v_op_total UUID;
    -- Investing
    v_ppe UUID; v_inv_total UUID;
    -- Financing
    v_debt UUID; v_equity UUID; v_fin_total UUID;
    -- Net change
    v_net UUID; v_open UUID; v_close UUID;
BEGIN
    -- Definition
    v_def_id := pg_temp.seed_stmt_def(
        'STD-CF', 'Standard Cash Flow Statement (Indirect)', 'CASH_FLOW',
        'Indirect-method cash flow: Net Income → non-cash adjustments → working capital changes → investing → financing → net cash change.',
        NULL, NULL
    );

    -- ════════════════════════════════════════════════════════════════
    -- OPERATING ACTIVITIES
    -- ════════════════════════════════════════════════════════════════
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-S-OP', 'Cash Flows from Operating Activities', 'SECTION',
        NULL, 0, 10, TRUE, FALSE, 0);

    -- Net Income (pull from P&L — maps to all revenue/expense accounts)
    v_ni := pg_temp.seed_stmt_line(v_def_id, 'CF-NET-INCOME', 'Net Income', 'ACCOUNT',
        'CF-S-OP', 1, 20, TRUE, FALSE, 1, 'CREDIT');
    -- Revenue - Expenses = Net Income (approximate: sum all income/expense)
    PERFORM pg_temp.seed_stmt_acct_type(v_ni, 'REVENUE');
    PERFORM pg_temp.seed_stmt_acct_type(v_ni, 'COGS', 'INVERT');
    PERFORM pg_temp.seed_stmt_acct_type(v_ni, 'EXPENSE', 'INVERT');

    -- Non-cash adjustments section
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-S-NONCASH', 'Adjustments for Non-Cash Items', 'SECTION',
        'CF-S-OP', 1, 30, FALSE, FALSE, 1);

    -- Depreciation (add back — it's an expense but not cash)
    v_dep := pg_temp.seed_stmt_line(v_def_id, 'CF-DEPR', 'Depreciation', 'ACCOUNT',
        'CF-S-NONCASH', 2, 40, FALSE, FALSE, 2, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_dep, '6300', '6399');

    -- Amortization (add back)
    v_amort := pg_temp.seed_stmt_line(v_def_id, 'CF-AMORT', 'Amortization', 'ACCOUNT',
        'CF-S-NONCASH', 2, 50, FALSE, FALSE, 2, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_amort, '6350', '6399');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-NONCASH-TOTAL', 'Total Non-Cash Adjustments', 'SUBTOTAL',
        'CF-S-NONCASH', 2, 60, FALSE, TRUE, 1, 'DEBIT');

    -- Working capital changes section (MOVEMENT lines = BS delta)
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-S-WC', 'Changes in Working Capital', 'SECTION',
        'CF-S-OP', 1, 70, FALSE, FALSE, 1);

    -- Decrease in AR = cash inflow (MOVEMENT: closing AR delta, inverted because increase = cash outflow)
    v_ar := pg_temp.seed_stmt_line(v_def_id, 'CF-WC-AR', '(Increase) / Decrease in Accounts Receivable', 'MOVEMENT',
        'CF-S-WC', 2, 80, FALSE, FALSE, 2, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_ar, '1120', '1129', 'INVERT');

    -- Decrease in Inventory = cash inflow
    v_inv := pg_temp.seed_stmt_line(v_def_id, 'CF-WC-INV', '(Increase) / Decrease in Inventory', 'MOVEMENT',
        'CF-S-WC', 2, 90, FALSE, FALSE, 2, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_inv, '1130', '1139', 'INVERT');

    -- Decrease in Prepaid = cash inflow
    v_prepaid := pg_temp.seed_stmt_line(v_def_id, 'CF-WC-PREPAID', '(Increase) / Decrease in Prepaid Expenses', 'MOVEMENT',
        'CF-S-WC', 2, 100, FALSE, FALSE, 2, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_prepaid, '1140', '1149', 'INVERT');

    -- Increase in AP = cash inflow (liability increase is positive for cash)
    v_ap := pg_temp.seed_stmt_line(v_def_id, 'CF-WC-AP', 'Increase / (Decrease) in Accounts Payable', 'MOVEMENT',
        'CF-S-WC', 2, 110, FALSE, FALSE, 2, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_ap, '2110', '2119');

    -- Increase in Accrued Liabilities = cash inflow
    v_accrued := pg_temp.seed_stmt_line(v_def_id, 'CF-WC-ACCRUED', 'Increase / (Decrease) in Accrued Liabilities', 'MOVEMENT',
        'CF-S-WC', 2, 120, FALSE, FALSE, 2, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_accrued, '2120', '2199');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-WC-TOTAL', 'Total Working Capital Changes', 'SUBTOTAL',
        'CF-S-WC', 2, 130, FALSE, TRUE, 1, 'CREDIT');

    -- Total Operating Cash Flow
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-SEP1', '', 'SEPARATOR', NULL, 0, 135);

    v_op_total := pg_temp.seed_stmt_line(v_def_id, 'CF-OP-TOTAL', 'Net Cash from Operating Activities', 'CALCULATION',
        NULL, 0, 140, TRUE, TRUE, 0, 'CREDIT',
        '[{"lineCode":"CF-NET-INCOME","operator":"+"},{"lineCode":"CF-NONCASH-TOTAL","operator":"+"},{"lineCode":"CF-WC-TOTAL","operator":"+"}]'::jsonb
    );

    -- ════════════════════════════════════════════════════════════════
    -- INVESTING ACTIVITIES
    -- ════════════════════════════════════════════════════════════════
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-S-INV', 'Cash Flows from Investing Activities', 'SECTION',
        NULL, 0, 150, TRUE, FALSE, 0);

    -- Purchase of PP&E (MOVEMENT on non-current assets = cash outflow)
    v_ppe := pg_temp.seed_stmt_line(v_def_id, 'CF-INV-PPE', 'Purchase of Property, Plant & Equipment', 'MOVEMENT',
        'CF-S-INV', 1, 160, FALSE, FALSE, 1, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_ppe, '1500', '1999', 'INVERT');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-SEP2', '', 'SEPARATOR', NULL, 0, 175);

    v_inv_total := pg_temp.seed_stmt_line(v_def_id, 'CF-INV-TOTAL', 'Net Cash from Investing Activities', 'SUBTOTAL',
        'CF-S-INV', 1, 180, TRUE, TRUE, 0, 'DEBIT');

    -- ════════════════════════════════════════════════════════════════
    -- FINANCING ACTIVITIES
    -- ════════════════════════════════════════════════════════════════
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-S-FIN', 'Cash Flows from Financing Activities', 'SECTION',
        NULL, 0, 190, TRUE, FALSE, 0);

    -- Proceeds / (Repayment) of Debt
    v_debt := pg_temp.seed_stmt_line(v_def_id, 'CF-FIN-DEBT', 'Proceeds / (Repayment) of Borrowings', 'MOVEMENT',
        'CF-S-FIN', 1, 200, FALSE, FALSE, 1, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_debt, '2500', '2999');

    -- Equity movements
    v_equity := pg_temp.seed_stmt_line(v_def_id, 'CF-FIN-EQUITY', 'Equity Issuance / (Buyback)', 'MOVEMENT',
        'CF-S-FIN', 1, 210, FALSE, FALSE, 1, 'CREDIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_equity, '3000', '3999');

    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-SEP3', '', 'SEPARATOR', NULL, 0, 225);

    v_fin_total := pg_temp.seed_stmt_line(v_def_id, 'CF-FIN-TOTAL', 'Net Cash from Financing Activities', 'SUBTOTAL',
        'CF-S-FIN', 1, 230, TRUE, TRUE, 0, 'CREDIT');

    -- ════════════════════════════════════════════════════════════════
    -- NET CHANGE IN CASH
    -- ════════════════════════════════════════════════════════════════
    PERFORM pg_temp.seed_stmt_line(v_def_id, 'CF-SEP4', '', 'SEPARATOR', NULL, 0, 235);

    v_net := pg_temp.seed_stmt_line(v_def_id, 'CF-NET-CHANGE', 'Net Increase / (Decrease) in Cash', 'CALCULATION',
        NULL, 0, 240, TRUE, TRUE, 0, 'CREDIT',
        '[{"lineCode":"CF-OP-TOTAL","operator":"+"},{"lineCode":"CF-INV-TOTAL","operator":"+"},{"lineCode":"CF-FIN-TOTAL","operator":"+"}]'::jsonb
    );

    -- Opening cash balance (ACCOUNT line on cash accounts)
    v_open := pg_temp.seed_stmt_line(v_def_id, 'CF-OPENING-CASH', 'Cash at Beginning of Period', 'ACCOUNT',
        NULL, 0, 250, FALSE, FALSE, 0, 'DEBIT');
    PERFORM pg_temp.seed_stmt_acct_range(v_open, '1110', '1119');

    -- Closing cash
    v_close := pg_temp.seed_stmt_line(v_def_id, 'CF-CLOSING-CASH', 'Cash at End of Period', 'CALCULATION',
        NULL, 0, 260, TRUE, TRUE, 0, 'DEBIT',
        '[{"lineCode":"CF-OPENING-CASH","operator":"+"},{"lineCode":"CF-NET-CHANGE","operator":"+"}]'::jsonb
    );

    RAISE NOTICE 'Seeded STD-CF (Cash Flow Statement): definition_id=%', v_def_id;
END $cf$;
