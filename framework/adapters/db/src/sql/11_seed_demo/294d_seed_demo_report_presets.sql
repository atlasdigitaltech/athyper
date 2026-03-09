-- ============================================================================
-- Seed: Demo Report Presets
-- ============================================================================
-- Common report configurations that finance teams use regularly.
-- All seeded as SYSTEM scope (global, visible to all users).
-- ============================================================================

DO $$
DECLARE
    v_tenant_id UUID;
BEGIN
    -- Use first demo tenant
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'No demo tenant found — skipping report preset seeding';
        RETURN;
    END IF;

    -- ── P&L Presets ──────────────────────────────────────────────

    INSERT INTO fin.rpt_report_preset (
        tenant_id, preset_code, preset_name, description,
        report_type, scope, parameters, state_hash, created_by
    ) VALUES
    (
        v_tenant_id,
        'pnl_by_account',
        'P&L by Account',
        'Standard P&L report grouped by account for current fiscal year',
        'pnl', 'SYSTEM',
        '{"fiscalYear": 2026, "groupBy": "account", "bookCode": "STAT"}'::jsonb,
        'seed_001', 'seed'
    ),
    (
        v_tenant_id,
        'opex_by_cost_center',
        'OPEX by Cost Center',
        'Expense analysis grouped by cost center for operational monitoring',
        'pnl', 'SYSTEM',
        '{"fiscalYear": 2026, "groupBy": "cost_center", "bookCode": "STAT"}'::jsonb,
        'seed_002', 'seed'
    ),
    (
        v_tenant_id,
        'revenue_by_region',
        'Revenue by Region',
        'Revenue breakdown by region for geographic analysis',
        'pnl', 'SYSTEM',
        '{"fiscalYear": 2026, "groupBy": "region", "bookCode": "STAT"}'::jsonb,
        'seed_003', 'seed'
    ),
    (
        v_tenant_id,
        'pnl_by_profit_center',
        'P&L by Profit Center',
        'Profit center performance analysis',
        'pnl', 'SYSTEM',
        '{"fiscalYear": 2026, "groupBy": "profit_center", "bookCode": "STAT"}'::jsonb,
        'seed_004', 'seed'
    ),
    (
        v_tenant_id,
        'project_profitability',
        'Project Profitability',
        'Revenue and cost by project for project-level profitability',
        'pnl', 'SYSTEM',
        '{"fiscalYear": 2026, "groupBy": "project", "bookCode": "STAT"}'::jsonb,
        'seed_005', 'seed'
    ),
    (
        v_tenant_id,
        'pnl_by_period',
        'P&L by Period',
        'Monthly P&L trend for the current fiscal year',
        'pnl', 'SYSTEM',
        '{"fiscalYear": 2026, "groupBy": "period", "bookCode": "STAT"}'::jsonb,
        'seed_006', 'seed'
    )

    -- ── Month-End Presets ────────────────────────────────────────

    , (
        v_tenant_id,
        'month_end_6m_review',
        'Month-End 6-Month Review',
        'Account balances across the last 6 periods for period close review',
        'month_end', 'SYSTEM',
        '{"fiscalYear": 2026, "bookCode": "STAT", "periodsToCompare": 6, "accountTypes": ["REVENUE", "EXPENSE"]}'::jsonb,
        'seed_007', 'seed'
    ),
    (
        v_tenant_id,
        'month_end_full_year',
        'Month-End Full Year',
        'Full 12-period comparison for annual review',
        'month_end', 'SYSTEM',
        '{"fiscalYear": 2026, "bookCode": "STAT", "periodsToCompare": 12, "accountTypes": ["REVENUE", "EXPENSE"]}'::jsonb,
        'seed_008', 'seed'
    )

    -- ── Drilldown Presets ────────────────────────────────────────

    , (
        v_tenant_id,
        'drill_cost_center',
        'Drill by Cost Center',
        'Start dimension drilldown from cost centers',
        'drilldown', 'SYSTEM',
        '{"fiscalYear": 2026, "cubeCode": "FS_MONTHLY", "groupBy": "cost_center", "periodNumber": 1, "parentFilters": {}}'::jsonb,
        'seed_009', 'seed'
    ),
    (
        v_tenant_id,
        'drill_project',
        'Drill by Project',
        'Start dimension drilldown from projects',
        'drilldown', 'SYSTEM',
        '{"fiscalYear": 2026, "cubeCode": "FS_MONTHLY", "groupBy": "project", "periodNumber": 1, "parentFilters": {}}'::jsonb,
        'seed_010', 'seed'
    )
    ON CONFLICT ON CONSTRAINT uq_rpt_preset_tenant_scope_code DO NOTHING;

    RAISE NOTICE 'Report presets seeded for tenant %', v_tenant_id;
END $$;
