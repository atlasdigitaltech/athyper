-- 210_close_duration_intelligence.sql
--
-- Phase 8 — Predictive Close Intelligence
--
-- 1. fin.close_task_duration_history   — actual task execution durations per close run
-- 2. fin.vw_close_task_duration_stats  — aggregated duration statistics (median, p95, p99)
--
-- Enables: data-driven forecasting, delay impact analysis, parallelization recommendations

-- =========================================================================
-- 1. Task Duration History
-- =========================================================================

CREATE TABLE IF NOT EXISTS fin.close_task_duration_history (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid        NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,
    fiscal_year         smallint    NOT NULL,
    period_number       smallint    NOT NULL,
    task_code           varchar(50) NOT NULL,
    task_id             uuid        NOT NULL,

    -- Timing
    started_at          timestamptz,            -- when task moved to IN_PROGRESS (null if instant)
    completed_at        timestamptz NOT NULL,    -- when task reached COMPLETED or WAIVED
    actual_duration_minutes integer NOT NULL,    -- wall-clock minutes from start to completion

    -- Context for statistical grouping
    close_type          varchar(20),             -- MONTH_END, QUARTER_END, YEAR_END, INTERIM
    completion_mode     varchar(10) NOT NULL,    -- MANUAL, SYSTEM, HYBRID
    was_waived          boolean     NOT NULL DEFAULT false,
    was_blocked         boolean     NOT NULL DEFAULT false, -- was this task blocked at any point?
    block_duration_minutes integer  NOT NULL DEFAULT 0,     -- total time spent in BLOCKED state

    -- Actor
    completed_by        text,

    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique: one duration record per task per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_ctdh_task_period
    ON fin.close_task_duration_history (tenant_id, entity_code, fiscal_year, period_number, task_code);

-- For stats aggregation by task
CREATE INDEX IF NOT EXISTS idx_ctdh_task_stats
    ON fin.close_task_duration_history (tenant_id, entity_code, task_code, actual_duration_minutes)
    WHERE NOT was_waived;

-- For trend analysis by period
CREATE INDEX IF NOT EXISTS idx_ctdh_period
    ON fin.close_task_duration_history (tenant_id, entity_code, fiscal_year DESC, period_number DESC);

-- For close_type grouping (month-end vs quarter-end durations differ)
CREATE INDEX IF NOT EXISTS idx_ctdh_close_type
    ON fin.close_task_duration_history (tenant_id, entity_code, task_code, close_type)
    WHERE NOT was_waived;

-- =========================================================================
-- 2. Duration Statistics View (median, p95, p99, sample_size)
-- =========================================================================

DROP VIEW IF EXISTS fin.vw_close_task_duration_stats CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_task_duration_stats AS
SELECT
    tenant_id,
    entity_code,
    task_code,
    close_type,
    COUNT(*)                                                        AS sample_size,
    ROUND(AVG(actual_duration_minutes))                             AS mean_duration,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS median_duration,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS p75_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS p95_duration,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS p99_duration,
    MIN(actual_duration_minutes)                                    AS min_duration,
    MAX(actual_duration_minutes)                                    AS max_duration,
    ROUND(STDDEV_POP(actual_duration_minutes)::numeric, 1)          AS stddev_duration,
    -- Blocked-time stats
    ROUND(AVG(block_duration_minutes))                              AS mean_block_minutes,
    COUNT(*) FILTER (WHERE was_blocked)                             AS blocked_count,
    MAX(completed_at)                                               AS last_observed_at
FROM fin.close_task_duration_history
WHERE NOT was_waived  -- exclude waived tasks from duration stats
GROUP BY tenant_id, entity_code, task_code, close_type;

COMMENT ON VIEW fin.vw_close_task_duration_stats IS
    'Aggregated task duration statistics for predictive close forecasting. Excludes waived tasks.';

-- =========================================================================
-- 3. All-close-types aggregation (for general forecasting when close_type is unknown)
-- =========================================================================

DROP VIEW IF EXISTS fin.vw_close_task_duration_stats_all CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_task_duration_stats_all AS
SELECT
    tenant_id,
    entity_code,
    task_code,
    'ALL'::text                                                     AS close_type,
    COUNT(*)                                                        AS sample_size,
    ROUND(AVG(actual_duration_minutes))                             AS mean_duration,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS median_duration,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS p75_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS p95_duration,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                    AS p99_duration,
    MIN(actual_duration_minutes)                                    AS min_duration,
    MAX(actual_duration_minutes)                                    AS max_duration,
    ROUND(STDDEV_POP(actual_duration_minutes)::numeric, 1)          AS stddev_duration,
    ROUND(AVG(block_duration_minutes))                              AS mean_block_minutes,
    COUNT(*) FILTER (WHERE was_blocked)                             AS blocked_count,
    MAX(completed_at)                                               AS last_observed_at
FROM fin.close_task_duration_history
WHERE NOT was_waived
GROUP BY tenant_id, entity_code, task_code;

COMMENT ON VIEW fin.vw_close_task_duration_stats_all IS
    'All-close-types aggregated task duration statistics. Useful when close_type is not yet determined.';
