/* ============================================================================
   Athyper v2.7 — KPI Definition Seed Data
   Table: fin.kpi_definition, fin.kpi_account_binding, fin.kpi_threshold
   Dependencies: core.tenant, fin.operating_unit, fin.chart_of_accounts

   Seeds standard financial KPIs for all demo tenants.
   KPIs are blueprint-aware: simpler tenants get fewer KPIs.
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_kpi_id   uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- ================================================================
            -- PROFITABILITY KPIs
            -- ================================================================

            -- Gross Margin % — all blueprints
            v_kpi_id := gen_random_uuid();
            INSERT INTO fin.kpi_definition (
                id, tenant_id, entity_code, kpi_code, kpi_name, description,
                category, data_source, formula, aggregation_method, unit,
                decimal_places, sign_rule, compare_mode, sort_order, scope
            ) VALUES (
                v_kpi_id, v_tenant, v_entity,
                'GROSS_MARGIN_PCT', 'Gross Margin %',
                'Gross profit as a percentage of revenue: (Revenue - COGS) / Revenue × 100',
                'PROFITABILITY', 'GL',
                '{"op":"MULTIPLY","left":{"op":"DIVIDE","left":{"op":"SUBTRACT","left":{"ref":"REVENUE"},"right":{"ref":"COGS"}},"right":{"ref":"REVENUE"}},"right":{"literal":100}}'::jsonb,
                'RATIO', 'PERCENTAGE', 2, 'NORMAL', 'PRIOR_YEAR', 10, 'SYSTEM'
            ) ON CONFLICT (tenant_id, entity_code, kpi_code, version) DO NOTHING;

            -- Account bindings for Gross Margin
            INSERT INTO fin.kpi_account_binding (kpi_id, ref_name, mapping_mode, account_type, balance_column)
            VALUES
                (v_kpi_id, 'REVENUE', 'TYPE', 'REVENUE', 'NET'),
                (v_kpi_id, 'COGS',    'RANGE', null,     'NET')
            ON CONFLICT DO NOTHING;
            -- COGS range binding needs account codes — update if specific COA exists
            UPDATE fin.kpi_account_binding
            SET range_from = '5000', range_to = '5999', mapping_mode = 'RANGE'
            WHERE kpi_id = v_kpi_id AND ref_name = 'COGS';

            -- Thresholds for Gross Margin
            INSERT INTO fin.kpi_threshold (tenant_id, kpi_id, severity, operator, threshold_value, label, color_code)
            VALUES
                (v_tenant, v_kpi_id, 'CRITICAL', '<',  10.00, 'Critical low margin', '#DC2626'),
                (v_tenant, v_kpi_id, 'WARNING',  '<',  20.00, 'Below target margin', '#F59E0B'),
                (v_tenant, v_kpi_id, 'INFO',     '>=', 40.00, 'Strong margin',       '#10B981')
            ON CONFLICT (tenant_id, kpi_id, severity, operator, threshold_value) DO NOTHING;

            -- Net Profit Margin % — all blueprints
            v_kpi_id := gen_random_uuid();
            INSERT INTO fin.kpi_definition (
                id, tenant_id, entity_code, kpi_code, kpi_name, description,
                category, data_source, formula, aggregation_method, unit,
                decimal_places, sign_rule, compare_mode, sort_order, scope
            ) VALUES (
                v_kpi_id, v_tenant, v_entity,
                'NET_MARGIN_PCT', 'Net Profit Margin %',
                'Net income as a percentage of revenue',
                'PROFITABILITY', 'GL',
                '{"op":"MULTIPLY","left":{"op":"DIVIDE","left":{"op":"SUBTRACT","left":{"ref":"REVENUE"},"right":{"ref":"TOTAL_EXPENSE"}},"right":{"ref":"REVENUE"}},"right":{"literal":100}}'::jsonb,
                'RATIO', 'PERCENTAGE', 2, 'NORMAL', 'PRIOR_YEAR', 20, 'SYSTEM'
            ) ON CONFLICT (tenant_id, entity_code, kpi_code, version) DO NOTHING;

            INSERT INTO fin.kpi_account_binding (kpi_id, ref_name, mapping_mode, account_type, balance_column)
            VALUES
                (v_kpi_id, 'REVENUE',       'TYPE', 'REVENUE', 'NET'),
                (v_kpi_id, 'TOTAL_EXPENSE', 'TYPE', 'EXPENSE', 'NET')
            ON CONFLICT DO NOTHING;

            INSERT INTO fin.kpi_threshold (tenant_id, kpi_id, severity, operator, threshold_value, label, color_code)
            VALUES
                (v_tenant, v_kpi_id, 'CRITICAL', '<',  0.00,  'Net loss',             '#DC2626'),
                (v_tenant, v_kpi_id, 'WARNING',  '<',  5.00,  'Thin margin',          '#F59E0B'),
                (v_tenant, v_kpi_id, 'INFO',     '>=', 15.00, 'Strong profitability', '#10B981')
            ON CONFLICT (tenant_id, kpi_id, severity, operator, threshold_value) DO NOTHING;

            -- ================================================================
            -- LIQUIDITY KPIs
            -- ================================================================

            -- Current Ratio — C and above
            v_kpi_id := gen_random_uuid();
            INSERT INTO fin.kpi_definition (
                id, tenant_id, entity_code, kpi_code, kpi_name, description,
                category, data_source, formula, aggregation_method, unit,
                decimal_places, sign_rule, compare_mode, sort_order, scope
            ) VALUES (
                v_kpi_id, v_tenant, v_entity,
                'CURRENT_RATIO', 'Current Ratio',
                'Current assets divided by current liabilities',
                'LIQUIDITY', 'GL',
                '{"op":"DIVIDE","left":{"ref":"CURRENT_ASSETS"},"right":{"ref":"CURRENT_LIABILITIES"}}'::jsonb,
                'LAST', 'RATIO', 2, 'NORMAL', 'PRIOR_YEAR', 30, 'SYSTEM'
            ) ON CONFLICT (tenant_id, entity_code, kpi_code, version) DO NOTHING;

            INSERT INTO fin.kpi_account_binding (kpi_id, ref_name, mapping_mode, range_from, range_to, balance_column)
            VALUES
                (v_kpi_id, 'CURRENT_ASSETS',      'RANGE', '1000', '1999', 'CLOSING_NET'),
                (v_kpi_id, 'CURRENT_LIABILITIES',  'RANGE', '2000', '2499', 'CLOSING_NET')
            ON CONFLICT DO NOTHING;

            INSERT INTO fin.kpi_threshold (tenant_id, kpi_id, severity, operator, threshold_value, label, color_code)
            VALUES
                (v_tenant, v_kpi_id, 'CRITICAL', '<',  1.00, 'Liquidity risk',  '#DC2626'),
                (v_tenant, v_kpi_id, 'WARNING',  '<',  1.50, 'Below target',    '#F59E0B'),
                (v_tenant, v_kpi_id, 'INFO',     '>=', 2.00, 'Strong liquidity', '#10B981')
            ON CONFLICT (tenant_id, kpi_id, severity, operator, threshold_value) DO NOTHING;

            -- ================================================================
            -- EFFICIENCY KPIs
            -- ================================================================

            -- Revenue per Employee — D and above
            v_kpi_id := gen_random_uuid();
            INSERT INTO fin.kpi_definition (
                id, tenant_id, entity_code, kpi_code, kpi_name, description,
                category, data_source, formula, aggregation_method, unit,
                decimal_places, sign_rule, compare_mode, sort_order, scope
            ) VALUES (
                v_kpi_id, v_tenant, v_entity,
                'REVENUE_PER_EMPLOYEE', 'Revenue per Employee',
                'Total revenue divided by headcount (manual KPI for headcount input)',
                'EFFICIENCY', 'MANUAL', null,
                'RATIO', 'CURRENCY', 0, 'NORMAL', 'PRIOR_YEAR', 50, 'SYSTEM'
            ) ON CONFLICT (tenant_id, entity_code, kpi_code, version) DO NOTHING;

            -- ================================================================
            -- GROWTH KPIs
            -- ================================================================

            -- Revenue Growth % — all blueprints
            v_kpi_id := gen_random_uuid();
            INSERT INTO fin.kpi_definition (
                id, tenant_id, entity_code, kpi_code, kpi_name, description,
                category, data_source, formula, aggregation_method, unit,
                decimal_places, sign_rule, compare_mode, sort_order, scope
            ) VALUES (
                v_kpi_id, v_tenant, v_entity,
                'REVENUE_GROWTH_PCT', 'Revenue Growth %',
                'Period-over-period revenue growth rate',
                'GROWTH', 'GL',
                '{"op":"MULTIPLY","left":{"op":"DIVIDE","left":{"op":"SUBTRACT","left":{"ref":"CURRENT_REVENUE"},"right":{"ref":"PRIOR_REVENUE"}},"right":{"ref":"PRIOR_REVENUE"}},"right":{"literal":100}}'::jsonb,
                'DELTA_PCT', 'PERCENTAGE', 1, 'NORMAL', 'PRIOR_YEAR', 40, 'SYSTEM'
            ) ON CONFLICT (tenant_id, entity_code, kpi_code, version) DO NOTHING;

            INSERT INTO fin.kpi_account_binding (kpi_id, ref_name, mapping_mode, account_type, balance_column)
            VALUES
                (v_kpi_id, 'CURRENT_REVENUE', 'TYPE', 'REVENUE', 'NET'),
                (v_kpi_id, 'PRIOR_REVENUE',   'TYPE', 'REVENUE', 'NET')
            ON CONFLICT DO NOTHING;

            INSERT INTO fin.kpi_threshold (tenant_id, kpi_id, severity, operator, threshold_value, label, color_code)
            VALUES
                (v_tenant, v_kpi_id, 'CRITICAL', '<',  -10.00, 'Revenue decline',    '#DC2626'),
                (v_tenant, v_kpi_id, 'WARNING',  '<',    0.00, 'Negative growth',    '#F59E0B'),
                (v_tenant, v_kpi_id, 'INFO',     '>=',  10.00, 'Strong growth',      '#10B981')
            ON CONFLICT (tenant_id, kpi_id, severity, operator, threshold_value) DO NOTHING;

            -- ================================================================
            -- OPERATIONAL KPIs
            -- ================================================================

            -- Operating Expense Ratio — all blueprints
            v_kpi_id := gen_random_uuid();
            INSERT INTO fin.kpi_definition (
                id, tenant_id, entity_code, kpi_code, kpi_name, description,
                category, data_source, formula, aggregation_method, unit,
                decimal_places, sign_rule, compare_mode, sort_order, scope
            ) VALUES (
                v_kpi_id, v_tenant, v_entity,
                'OPEX_RATIO', 'Operating Expense Ratio',
                'Operating expenses as a percentage of revenue',
                'OPERATIONAL', 'GL',
                '{"op":"MULTIPLY","left":{"op":"DIVIDE","left":{"ref":"OPEX"},"right":{"ref":"REVENUE"}},"right":{"literal":100}}'::jsonb,
                'RATIO', 'PERCENTAGE', 1, 'INVERSE', 'PRIOR_YEAR', 60, 'SYSTEM'
            ) ON CONFLICT (tenant_id, entity_code, kpi_code, version) DO NOTHING;

            INSERT INTO fin.kpi_account_binding (kpi_id, ref_name, mapping_mode, account_type, balance_column)
            VALUES
                (v_kpi_id, 'OPEX',    'TYPE', 'EXPENSE', 'NET'),
                (v_kpi_id, 'REVENUE', 'TYPE', 'REVENUE', 'NET')
            ON CONFLICT DO NOTHING;

        END LOOP; -- entity_code

        RAISE NOTICE 'KPI definitions seeded for tenant %', v_code;
    END LOOP; -- tenant
END $$;
