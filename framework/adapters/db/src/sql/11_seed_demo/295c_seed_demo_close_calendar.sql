/* ============================================================================
   Athyper v2.7 — Close Calendar & Dependency Seed Data
   Tables: fin.close_calendar, fin.close_dependency
   Dependencies: core.tenant, fin.operating_unit, fin.fiscal_period,
                 fin.period_close_task

   Seeds close calendar entries for the current fiscal year (2026) and
   standard task dependencies for all demo tenants.
   ============================================================================ */

-- ================================================================
-- Part 1: Close Calendar — schedule for FY2026
-- ================================================================
DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_period   smallint;
    v_end_date date;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Seed calendar for 12 months of FY2026
            FOR v_period IN 1..12 LOOP
                -- Period end date: last day of month
                v_end_date := (make_date(2026, v_period, 1) + interval '1 month' - interval '1 day')::date;

                INSERT INTO fin.close_calendar (
                    tenant_id, entity_code, fiscal_year, period_number,
                    period_end_date, close_start_date,
                    soft_close_target, hard_close_target,
                    close_type, target_working_days
                ) VALUES (
                    v_tenant, v_entity, 2026, v_period,
                    v_end_date,
                    -- Close starts on the 1st of the following month
                    (v_end_date + interval '1 day')::date,
                    -- Soft close target: 3rd working day (approx day 5 to account for weekends)
                    (v_end_date + interval '5 days')::date,
                    -- Hard close target: 5th working day for month-end, 10th for quarter/year
                    case
                        when v_period = 12 then (v_end_date + interval '15 days')::date  -- year-end
                        when v_period in (3, 6, 9) then (v_end_date + interval '12 days')::date  -- quarter-end
                        else (v_end_date + interval '8 days')::date  -- month-end
                    end,
                    case
                        when v_period = 12 then 'YEAR_END'
                        when v_period in (3, 6, 9) then 'QUARTER_END'
                        else 'MONTH_END'
                    end,
                    case
                        when v_period = 12 then 10  -- 10 working days for year-end
                        when v_period in (3, 6, 9) then 7  -- 7 for quarter-end
                        else 5  -- 5-day close target for month-end
                    end
                ) ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number) DO NOTHING;

            END LOOP; -- period

        END LOOP; -- entity_code

        RAISE NOTICE 'Close calendar seeded for tenant % (FY2026)', v_code;
    END LOOP; -- tenant
END $$;

-- ================================================================
-- Part 2: Close Dependencies — standard task DAG
-- ================================================================
-- Defines the standard dependency graph between close tasks.
-- Dependencies are seeded by looking up task_code → task_id per entity.
DO $$
DECLARE
    v_tenant    uuid;
    v_code      text;
    v_entity    text;
    v_dep       record;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Standard dependency pairs: (predecessor_code, successor_code)
            -- The DAG represents natural close sequencing:
            --
            --   AR_RECON ──────────┐
            --   AP_RECON ──────────┤
            --   INV_VALUATION ─────┤
            --   BANK_RECON ────────┼──→ TRIAL_BALANCE ──→ MGMT_SIGNOFF
            --   ASSET_DEPRECIATION ┤
            --   WIP_CLEARANCE ─────┤
            --   COMMISSION_ACCRUAL ┤
            --   ACCRUAL_REVERSAL ──┘
            --
            --   FX_REVALUATION ──→ IC_ELIMINATION ──→ TRIAL_BALANCE
            --   TAX_PROVISION ──→ TRIAL_BALANCE
            --   CUTOFF_REVIEW ──→ MGMT_SIGNOFF

            FOR v_dep IN
                SELECT predecessor_code, successor_code FROM (VALUES
                    ('AR_RECON',            'TRIAL_BALANCE'),
                    ('AP_RECON',            'TRIAL_BALANCE'),
                    ('INV_VALUATION',       'TRIAL_BALANCE'),
                    ('BANK_RECON',          'TRIAL_BALANCE'),
                    ('ASSET_DEPRECIATION',  'TRIAL_BALANCE'),
                    ('WIP_CLEARANCE',       'TRIAL_BALANCE'),
                    ('COMMISSION_ACCRUAL',  'TRIAL_BALANCE'),
                    ('ACCRUAL_REVERSAL',    'TRIAL_BALANCE'),
                    ('FX_REVALUATION',      'IC_ELIMINATION'),
                    ('IC_ELIMINATION',      'TRIAL_BALANCE'),
                    ('TAX_PROVISION',       'TRIAL_BALANCE'),
                    ('TRIAL_BALANCE',       'MGMT_SIGNOFF'),
                    ('CUTOFF_REVIEW',       'MGMT_SIGNOFF'),
                    ('REVENUE_RECOGNITION', 'MGMT_SIGNOFF')
                ) AS deps(predecessor_code, successor_code)
            LOOP
                -- Only insert if both tasks exist for this entity
                INSERT INTO fin.close_dependency (
                    tenant_id, entity_code,
                    predecessor_task_id, successor_task_id,
                    dependency_type, is_hard
                )
                SELECT
                    v_tenant, v_entity,
                    pred.id, succ.id,
                    'FINISH_TO_START', true
                FROM fin.period_close_task pred
                CROSS JOIN fin.period_close_task succ
                WHERE pred.tenant_id = v_tenant
                  AND pred.entity_code = v_entity
                  AND pred.task_code = v_dep.predecessor_code
                  AND pred.is_active = true
                  AND succ.tenant_id = v_tenant
                  AND succ.entity_code = v_entity
                  AND succ.task_code = v_dep.successor_code
                  AND succ.is_active = true
                ON CONFLICT (tenant_id, entity_code, predecessor_task_id, successor_task_id)
                DO NOTHING;

            END LOOP; -- dependencies

        END LOOP; -- entity_code

        RAISE NOTICE 'Close dependencies seeded for tenant %', v_code;
    END LOOP; -- tenant
END $$;
