-- ============================================================================
-- Seed: Demo Financial Statement Definitions (Management P&L)
-- ============================================================================
-- Creates a standard Management P&L statement template using the
-- rpt_statement_definition / rpt_statement_row / rpt_statement_row_map model.
--
-- Maps to the Blueprint A–D COA structure:
--   4xxx = Revenue
--   5xxx = COGS
--   6xxx = Operating Expenses
--   7xxx = Other Income
--   8xxx = Other Expenses
--   9xxx = Tax
-- ============================================================================

DO $$
DECLARE
    v_tenant_id   UUID;
    v_stmt_id     UUID;
    v_entity_code VARCHAR(20) := 'PRIMARY';
    -- Row IDs (for parent references)
    r_rev         UUID;
    r_rev_total   UUID;
    r_cos         UUID;
    r_cos_total   UUID;
    r_gp          UUID;
    r_opex        UUID;
    r_opex_total  UUID;
    r_ebitda      UUID;
    r_other       UUID;
    r_other_total UUID;
    r_ebt         UUID;
    r_tax         UUID;
    r_np          UUID;
BEGIN
    -- Use first demo tenant
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'No demo tenant found — skipping statement seeding';
        RETURN;
    END IF;

    -- ──────────────────────────────────────────────────────────────
    -- Statement Definition
    -- ──────────────────────────────────────────────────────────────

    INSERT INTO fin.rpt_statement_definition (
        id, tenant_id, statement_code, name, description,
        statement_type, scope, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id,
        'MGMT_PNL',
        'Management P&L',
        'Standard management profit and loss statement with EBITDA and net profit',
        'MGMT_PNL', 'SYSTEM', 'seed'
    )
    ON CONFLICT ON CONSTRAINT uq_rpt_stmt_def DO UPDATE
        SET name = EXCLUDED.name, updated_at = now()
    RETURNING id INTO v_stmt_id;

    -- Clean existing rows for idempotency
    DELETE FROM fin.rpt_statement_row
    WHERE tenant_id = v_tenant_id
      AND statement_definition_id = v_stmt_id;

    -- ──────────────────────────────────────────────────────────────
    -- Statement Rows
    -- ──────────────────────────────────────────────────────────────

    -- Revenue section
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style, is_expandable,
        created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'REV', 'Revenue', 'HEADING', 10, 0, 0,
        'SHADED', 'NATURAL', 'NONE', TRUE,
        'seed'
    ) RETURNING id INTO r_rev;

    -- Revenue line items (mapped via ACCOUNT_RANGE)
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, parent_row_id, sort_order, depth, indent_level,
        sign_policy, created_by
    ) VALUES
    (v_tenant_id, v_stmt_id, 'REV_4000', 'Sales Revenue', 'LINE', r_rev, 11, 1, 1, 'CREDIT_POSITIVE', 'seed'),
    (v_tenant_id, v_stmt_id, 'REV_4100', 'Service Revenue', 'LINE', r_rev, 12, 1, 1, 'CREDIT_POSITIVE', 'seed'),
    (v_tenant_id, v_stmt_id, 'REV_4200', 'Product Revenue', 'LINE', r_rev, 13, 1, 1, 'CREDIT_POSITIVE', 'seed'),
    (v_tenant_id, v_stmt_id, 'REV_4900', 'Other Revenue', 'LINE', r_rev, 14, 1, 1, 'CREDIT_POSITIVE', 'seed');

    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'REV_TOTAL', 'Total Revenue', 'SUBTOTAL', 19, 0, 0,
        'BOLD', 'CREDIT_POSITIVE', 'SUCCESS',
        'seed'
    ) RETURNING id INTO r_rev_total;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP1', '', 'SPACER', 20, 0, 0, 'seed');

    -- Cost of Sales
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, is_expandable, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'COS', 'Cost of Sales', 'HEADING', 30, 0, 0,
        'SHADED', 'NATURAL', TRUE, 'seed'
    ) RETURNING id INTO r_cos;

    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, parent_row_id, sort_order, depth, indent_level,
        sign_policy, created_by
    ) VALUES
    (v_tenant_id, v_stmt_id, 'COS_5000', 'Direct Materials', 'LINE', r_cos, 31, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'COS_5100', 'Direct Labor', 'LINE', r_cos, 32, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'COS_5200', 'Manufacturing Overhead', 'LINE', r_cos, 33, 1, 1, 'NATURAL', 'seed');

    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'COS_TOTAL', 'Total Cost of Sales', 'SUBTOTAL', 39, 0, 0,
        'BOLD', 'NATURAL', 'DANGER',
        'seed'
    ) RETURNING id INTO r_cos_total;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP2', '', 'SPACER', 40, 0, 0, 'seed');

    -- Gross Profit (FORMULA)
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        formula_expression, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'GROSS_PROFIT', 'Gross Profit', 'FORMULA', 50, 0, 0,
        'DOUBLE_LINE', 'NATURAL', 'SUCCESS',
        'REV_TOTAL - COS_TOTAL', 'seed'
    ) RETURNING id INTO r_gp;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP3', '', 'SPACER', 51, 0, 0, 'seed');

    -- Operating Expenses
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, is_expandable, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'OPEX', 'Operating Expenses', 'HEADING', 60, 0, 0,
        'SHADED', 'NATURAL', TRUE, 'seed'
    ) RETURNING id INTO r_opex;

    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, parent_row_id, sort_order, depth, indent_level,
        sign_policy, created_by
    ) VALUES
    (v_tenant_id, v_stmt_id, 'OPEX_6000', 'Salary & Wages', 'LINE', r_opex, 61, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'OPEX_6100', 'Rent & Facilities', 'LINE', r_opex, 62, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'OPEX_6200', 'Professional Fees', 'LINE', r_opex, 63, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'OPEX_6300', 'Marketing & Advertising', 'LINE', r_opex, 64, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'OPEX_6400', 'IT & Software', 'LINE', r_opex, 65, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'OPEX_6500', 'Travel & Entertainment', 'LINE', r_opex, 66, 1, 1, 'NATURAL', 'seed'),
    (v_tenant_id, v_stmt_id, 'OPEX_6900', 'Other Operating Expenses', 'LINE', r_opex, 67, 1, 1, 'NATURAL', 'seed');

    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'OPEX_TOTAL', 'Total Operating Expenses', 'SUBTOTAL', 69, 0, 0,
        'BOLD', 'NATURAL', 'DANGER',
        'seed'
    ) RETURNING id INTO r_opex_total;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP4', '', 'SPACER', 70, 0, 0, 'seed');

    -- EBITDA (FORMULA)
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        formula_expression, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'EBITDA', 'EBITDA', 'FORMULA', 80, 0, 0,
        'DOUBLE_LINE', 'NATURAL', 'PRIMARY',
        'GROSS_PROFIT - OPEX_TOTAL', 'seed'
    ) RETURNING id INTO r_ebitda;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP5', '', 'SPACER', 81, 0, 0, 'seed');

    -- Other Income / Expenses
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, is_expandable, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'OTHER', 'Other Income & Expenses', 'HEADING', 90, 0, 0,
        'SHADED', 'NATURAL', TRUE, 'seed'
    ) RETURNING id INTO r_other;

    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, parent_row_id, sort_order, depth, indent_level,
        sign_policy, created_by
    ) VALUES
    (v_tenant_id, v_stmt_id, 'OTH_7000', 'Other Income', 'LINE', r_other, 91, 1, 1, 'CREDIT_POSITIVE', 'seed'),
    (v_tenant_id, v_stmt_id, 'OTH_8000', 'Other Expenses', 'LINE', r_other, 92, 1, 1, 'NATURAL', 'seed');

    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'OTHER_NET', 'Net Other Income', 'SUBTOTAL', 95, 0, 0,
        'BOLD', 'NATURAL', 'seed'
    ) RETURNING id INTO r_other_total;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP6', '', 'SPACER', 96, 0, 0, 'seed');

    -- Earnings Before Tax (FORMULA)
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        formula_expression, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'EBT', 'Earnings Before Tax', 'FORMULA', 100, 0, 0,
        'BOLD', 'NATURAL', 'NONE',
        'EBITDA + OTHER_NET', 'seed'
    ) RETURNING id INTO r_ebt;

    -- Tax
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        sign_policy, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'TAX', 'Income Tax Expense', 'LINE', 105, 0, 0,
        'NATURAL', 'seed'
    ) RETURNING id INTO r_tax;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP7', '', 'SPACER', 108, 0, 0, 'seed');

    -- Net Profit (FORMULA)
    INSERT INTO fin.rpt_statement_row (
        id, tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        formula_expression, created_by
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_stmt_id,
        'NET_PROFIT', 'Net Profit', 'FORMULA', 110, 0, 0,
        'DOUBLE_LINE', 'NATURAL', 'SUCCESS',
        'EBT - TAX', 'seed'
    ) RETURNING id INTO r_np;

    -- Spacer
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        created_by
    ) VALUES (v_tenant_id, v_stmt_id, 'SP8', '', 'SPACER', 115, 0, 0, 'seed');

    -- Gross Margin % (RATIO)
    INSERT INTO fin.rpt_statement_row (
        tenant_id, statement_definition_id,
        row_code, label, row_type, sort_order, depth, indent_level,
        display_style, sign_policy, emphasis_style,
        formula_expression, created_by
    ) VALUES
    (v_tenant_id, v_stmt_id, 'GROSS_MARGIN_PCT', 'Gross Margin %', 'RATIO', 120, 0, 0,
     'ITALIC', 'NATURAL', 'MUTED',
     'GROSS_PROFIT / NULLIF(REV_TOTAL, 0)', 'seed'),
    (v_tenant_id, v_stmt_id, 'NET_MARGIN_PCT', 'Net Margin %', 'RATIO', 121, 0, 0,
     'ITALIC', 'NATURAL', 'MUTED',
     'NET_PROFIT / NULLIF(REV_TOTAL, 0)', 'seed');

    -- ──────────────────────────────────────────────────────────────
    -- Row Mappings (connect rows to COA)
    -- ──────────────────────────────────────────────────────────────

    -- Revenue lines → Account ranges
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', from_code, to_code, 'seed'
    FROM (VALUES
        ('REV_4000', '4000', '4099'),
        ('REV_4100', '4100', '4199'),
        ('REV_4200', '4200', '4299'),
        ('REV_4900', '4900', '4999')
    ) AS mapping(row_code, from_code, to_code)
    JOIN fin.rpt_statement_row sr
        ON sr.row_code = mapping.row_code
        AND sr.statement_definition_id = v_stmt_id
        AND sr.tenant_id = v_tenant_id;

    -- Revenue total → all revenue accounts
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_category, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_CATEGORY', 'REVENUE', 'seed'
    FROM fin.rpt_statement_row sr
    WHERE sr.row_code = 'REV_TOTAL'
      AND sr.statement_definition_id = v_stmt_id
      AND sr.tenant_id = v_tenant_id;

    -- Cost of Sales lines → Account ranges
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', from_code, to_code, 'seed'
    FROM (VALUES
        ('COS_5000', '5000', '5099'),
        ('COS_5100', '5100', '5199'),
        ('COS_5200', '5200', '5499')
    ) AS mapping(row_code, from_code, to_code)
    JOIN fin.rpt_statement_row sr
        ON sr.row_code = mapping.row_code
        AND sr.statement_definition_id = v_stmt_id
        AND sr.tenant_id = v_tenant_id;

    -- COS total → account range 5000–5999
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', '5000', '5999', 'seed'
    FROM fin.rpt_statement_row sr
    WHERE sr.row_code = 'COS_TOTAL'
      AND sr.statement_definition_id = v_stmt_id
      AND sr.tenant_id = v_tenant_id;

    -- Operating Expense lines → Account ranges
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', from_code, to_code, 'seed'
    FROM (VALUES
        ('OPEX_6000', '6000', '6099'),
        ('OPEX_6100', '6100', '6199'),
        ('OPEX_6200', '6200', '6299'),
        ('OPEX_6300', '6300', '6399'),
        ('OPEX_6400', '6400', '6499'),
        ('OPEX_6500', '6500', '6599'),
        ('OPEX_6900', '6900', '6999')
    ) AS mapping(row_code, from_code, to_code)
    JOIN fin.rpt_statement_row sr
        ON sr.row_code = mapping.row_code
        AND sr.statement_definition_id = v_stmt_id
        AND sr.tenant_id = v_tenant_id;

    -- OPEX total → account range 6000–6999
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', '6000', '6999', 'seed'
    FROM fin.rpt_statement_row sr
    WHERE sr.row_code = 'OPEX_TOTAL'
      AND sr.statement_definition_id = v_stmt_id
      AND sr.tenant_id = v_tenant_id;

    -- Other Income → 7xxx
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', '7000', '7999', 'seed'
    FROM fin.rpt_statement_row sr
    WHERE sr.row_code = 'OTH_7000'
      AND sr.statement_definition_id = v_stmt_id
      AND sr.tenant_id = v_tenant_id;

    -- Other Expenses → 8xxx
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', '8000', '8999', 'seed'
    FROM fin.rpt_statement_row sr
    WHERE sr.row_code = 'OTH_8000'
      AND sr.statement_definition_id = v_stmt_id
      AND sr.tenant_id = v_tenant_id;

    -- Other net → 7000–8999
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', '7000', '8999', 'seed'
    FROM fin.rpt_statement_row sr
    WHERE sr.row_code = 'OTHER_NET'
      AND sr.statement_definition_id = v_stmt_id
      AND sr.tenant_id = v_tenant_id;

    -- Tax → 9xxx
    INSERT INTO fin.rpt_statement_row_map (
        tenant_id, statement_row_id, map_type,
        account_code_from, account_code_to, created_by
    )
    SELECT v_tenant_id, sr.id, 'ACCOUNT_RANGE', '9000', '9999', 'seed'
    FROM fin.rpt_statement_row sr
    WHERE sr.row_code = 'TAX'
      AND sr.statement_definition_id = v_stmt_id
      AND sr.tenant_id = v_tenant_id;

    RAISE NOTICE 'Statement MGMT_PNL seeded for tenant %', v_tenant_id;
END $$;
