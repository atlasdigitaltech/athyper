/* ============================================================================
   Athyper v2.8 — Close Orchestration Snapshot & Trend Analytics
   Schema: fin
   Dependencies: 191_period_close_governance.sql,
                 199_period_close_orchestration_graph.sql

   Complements 202_close_orchestration.sql (which tracks checklist progress
   via close_readiness_snapshot) with GRAPH-DERIVED intelligence snapshots.

   Existing close_readiness_snapshot = checklist progress counts + SLA
   This table (close_orchestration_snapshot) = graph intelligence:
     - Critical path minutes
     - Predicted close readiness time
     - Blocker / failed task codes
     - Confidence level
     - Per-target-status scoping (SOFT_CLOSE / HARD_CLOSE)

   Use cases:
     - Forecast slippage detection ("predicted close time shifted +2h")
     - Trend of predicted close over time
     - Compare current close vs prior close cycles
     - SLA / performance benchmarking by entity or business unit
     - Audit-friendly operational history
   ============================================================================ */

CREATE TABLE IF NOT EXISTS fin.close_orchestration_snapshot (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,

    -- Period reference
    fiscal_year         smallint NOT NULL,
    period_number       smallint NOT NULL,

    -- Snapshot timestamp
    snapshot_at         timestamptz NOT NULL DEFAULT now(),

    -- Target status this snapshot is scoped to
    target_status       text NOT NULL
        CHECK (target_status IN ('SOFT_CLOSE', 'HARD_CLOSE')),

    -- Readiness counts (from orchestration graph computation)
    total_tasks         integer NOT NULL,
    satisfied_count     integer NOT NULL,
    ready_count         integer NOT NULL,
    blocked_count       integer NOT NULL,
    failed_count        integer NOT NULL,
    not_ready_count     integer NOT NULL,
    in_progress_count   integer NOT NULL,

    -- Critical path intelligence
    critical_path_minutes   integer NOT NULL DEFAULT 0,
    predicted_ready_at      timestamptz,

    -- Blocker / failed task codes (for drill-down without recomputation)
    blocker_task_codes  jsonb NOT NULL DEFAULT '[]'::jsonb,
    failed_task_codes   jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Forecast confidence
    confidence          text NOT NULL DEFAULT 'low'
        CHECK (confidence IN ('low', 'medium', 'high')),

    -- Capture classification — structured source discriminator
    -- Append-only by design: no dedupe, no suppression.
    -- Source tag enables filtering scheduled vs manual in trend analysis.
    snapshot_source     text NOT NULL DEFAULT 'api_call'
        CHECK (snapshot_source IN (
            'manual',              -- operator clicked "Capture Snapshot"
            'scheduled',           -- periodic scheduler (e.g., daily during close)
            'period_transition',   -- triggered by period status change attempt
            'auto_handler',        -- triggered after system handler execution
            'api_call'             -- generic API invocation (default)
        )),

    -- Computation metadata
    computation_version text NOT NULL DEFAULT 'v5.1',

    -- Who or what triggered the snapshot (actor identity, not source type)
    triggered_by        text NOT NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),

    -- FK to fiscal period
    CONSTRAINT fk_cos_period
        FOREIGN KEY (tenant_id, entity_code, fiscal_year, period_number)
        REFERENCES fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number)
);

-- Time-series queries: "show me the trend for this period's close"
CREATE INDEX IF NOT EXISTS idx_cos_timeseries
    ON fin.close_orchestration_snapshot (tenant_id, entity_code, fiscal_year, period_number, target_status, snapshot_at DESC);

-- Latest snapshot per period+target (for dashboard)
CREATE INDEX IF NOT EXISTS idx_cos_latest
    ON fin.close_orchestration_snapshot (tenant_id, entity_code, fiscal_year, period_number, target_status, snapshot_at DESC)
    INCLUDE (critical_path_minutes, predicted_ready_at, confidence);

-- Find at-risk closes
CREATE INDEX IF NOT EXISTS idx_cos_confidence
    ON fin.close_orchestration_snapshot (confidence, snapshot_at DESC)
    WHERE confidence IN ('low', 'medium');

COMMENT ON TABLE fin.close_orchestration_snapshot IS
    'Graph-derived intelligence snapshots for close orchestration. Captures critical path, forecast, blockers, and confidence at a point in time. Enables trend analytics and slippage detection.';
COMMENT ON COLUMN fin.close_orchestration_snapshot.target_status IS
    'Which close gate this snapshot is scoped to (SOFT_CLOSE or HARD_CLOSE). HARD_CLOSE includes SOFT_CLOSE prerequisites.';
COMMENT ON COLUMN fin.close_orchestration_snapshot.computation_version IS
    'Version tag of the graph computation algorithm. Allows interpreting historical snapshots correctly across upgrades.';
COMMENT ON COLUMN fin.close_orchestration_snapshot.triggered_by IS
    'Actor or mechanism that triggered the snapshot: user_id, "scheduler", "api_call", "period_transition", etc.';

-- ============================================================================
-- Helper view: Latest orchestration snapshot per period
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_orchestration_latest CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_orchestration_latest AS
SELECT DISTINCT ON (tenant_id, entity_code, fiscal_year, period_number, target_status)
    id,
    tenant_id,
    entity_code,
    fiscal_year,
    period_number,
    target_status,
    snapshot_at,
    snapshot_source,
    total_tasks,
    satisfied_count,
    ready_count,
    blocked_count,
    failed_count,
    not_ready_count,
    in_progress_count,
    critical_path_minutes,
    predicted_ready_at,
    blocker_task_codes,
    failed_task_codes,
    confidence,
    computation_version,
    triggered_by
FROM fin.close_orchestration_snapshot
ORDER BY tenant_id, entity_code, fiscal_year, period_number, target_status, snapshot_at DESC;

COMMENT ON VIEW fin.vw_close_orchestration_latest IS
    'Most recent orchestration snapshot for each period + target status. Use for dashboard current-state display.';

-- ============================================================================
-- Helper view: Orchestration trend (last 30 days)
-- Includes computation_version + snapshot_source so UI can:
--   - filter by source (scheduled only, manual only, etc.)
--   - detect version boundaries in the trend
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_orchestration_trend CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_orchestration_trend AS
SELECT
    tenant_id,
    entity_code,
    fiscal_year,
    period_number,
    target_status,
    snapshot_at,
    snapshot_source,
    satisfied_count,
    total_tasks,
    CASE WHEN total_tasks > 0
         THEN ROUND(satisfied_count::numeric / total_tasks * 100, 1)
         ELSE 0
    END AS satisfaction_pct,
    critical_path_minutes,
    predicted_ready_at,
    confidence,
    blocked_count,
    failed_count,
    computation_version,
    -- Flag: true when this snapshot's version differs from the previous snapshot
    -- in the same series.  UI should render a version-boundary marker here.
    computation_version IS DISTINCT FROM LAG(computation_version) OVER (
        PARTITION BY tenant_id, entity_code, fiscal_year, period_number, target_status
        ORDER BY snapshot_at
    ) AS version_changed
FROM fin.close_orchestration_snapshot
WHERE snapshot_at >= now() - interval '30 days'
ORDER BY tenant_id, entity_code, fiscal_year, period_number, target_status, snapshot_at;

COMMENT ON VIEW fin.vw_close_orchestration_trend IS
    'Last 30 days of orchestration snapshots for trend analysis. Includes computation_version and version_changed flag for cross-version awareness.';
