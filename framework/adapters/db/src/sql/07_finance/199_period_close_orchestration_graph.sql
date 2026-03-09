/* ============================================================================
   Athyper v2.4 — Period Close Orchestration Graph
   Schema: fin
   Dependencies: 191_period_close_governance.sql, 192_period_close_phase3.sql

   Adds dependency-aware orchestration intelligence on top of the existing
   governed close checklist.  NOT a workflow engine — a derived computation
   layer over the authoritative checklist/gate/waiver/handler model.

   Components:
   1. fin.period_close_task_dependency — DAG edges between task templates
   2. Task template extensions — orchestration metadata
   3. Indexes for graph traversal queries
   ============================================================================ */

-- ============================================================================
-- 1. fin.period_close_task_dependency — DAG edges between task templates
-- ============================================================================
-- Template-level dependency graph: "successor cannot start until predecessor
-- reaches a dependency-satisfying terminal state."
--
-- This is NOT a workflow.  The graph is a derived intelligence layer that
-- computes readiness, blockers, downstream impact, and critical path from
-- the authoritative checklist state.
--
-- satisfaction_mode:
--   'satisfied'       — predecessor COMPLETED or WAIVED (approved) counts
--   'completed_only'  — only COMPLETED counts (waiver does NOT satisfy)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.period_close_task_dependency (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,

    predecessor_task_id uuid NOT NULL
        REFERENCES fin.period_close_task(id) ON DELETE CASCADE,

    successor_task_id   uuid NOT NULL
        REFERENCES fin.period_close_task(id) ON DELETE CASCADE,

    dependency_type     text NOT NULL DEFAULT 'finish_to_start',
    satisfaction_mode   text NOT NULL DEFAULT 'satisfied',
    is_hard_block       boolean NOT NULL DEFAULT true,

    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text NOT NULL,
    updated_at          timestamptz,
    updated_by          text,

    -- Only finish-to-start supported in v1
    CONSTRAINT chk_pctd_dependency_type
        CHECK (dependency_type IN ('finish_to_start')),

    -- Satisfaction semantics
    CONSTRAINT chk_pctd_satisfaction_mode
        CHECK (satisfaction_mode IN ('satisfied', 'completed_only')),

    -- No self-edges
    CONSTRAINT chk_pctd_no_self_ref
        CHECK (predecessor_task_id <> successor_task_id),

    -- No duplicate edges
    CONSTRAINT uq_pctd_edge
        UNIQUE (tenant_id, predecessor_task_id, successor_task_id)
);

COMMENT ON TABLE fin.period_close_task_dependency IS
    'Template-level DAG edges between close tasks.  Derived orchestration layer — checklist remains authoritative.';
COMMENT ON COLUMN fin.period_close_task_dependency.satisfaction_mode IS
    'How the predecessor satisfies this dependency: satisfied (COMPLETED or approved WAIVED) or completed_only (only COMPLETED).';
COMMENT ON COLUMN fin.period_close_task_dependency.is_hard_block IS
    'If true, predecessor failure is a hard block.  If false, successor can still proceed (soft dependency).';

-- Graph traversal indexes
CREATE INDEX IF NOT EXISTS idx_pctd_predecessor
    ON fin.period_close_task_dependency (tenant_id, predecessor_task_id);

CREATE INDEX IF NOT EXISTS idx_pctd_successor
    ON fin.period_close_task_dependency (tenant_id, successor_task_id);

-- ============================================================================
-- 2. Extend fin.period_close_task — orchestration metadata
-- ============================================================================
-- NOTE: `severity` already exists from Phase 3 (192_period_close_phase3.sql)
-- and serves the same purpose as proposed `criticality`.  Reuse severity.
-- ============================================================================

ALTER TABLE fin.period_close_task
    ADD COLUMN IF NOT EXISTS estimated_duration_minutes integer,
    ADD COLUMN IF NOT EXISTS orchestration_group       text,
    ADD COLUMN IF NOT EXISTS auto_start_when_ready     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN fin.period_close_task.estimated_duration_minutes IS
    'Expected execution time in minutes.  Powers critical path and forecast computations.';
COMMENT ON COLUMN fin.period_close_task.orchestration_group IS
    'Logical grouping for UI swimlanes (e.g., subledger_recon, adjustments, signoff).  Orthogonal to category.';
COMMENT ON COLUMN fin.period_close_task.auto_start_when_ready IS
    'When true, system auto-triggers SYSTEM handler execution when all predecessors are satisfied.  Future automation hook.';

-- Duration must be positive
DO $$ BEGIN
    ALTER TABLE fin.period_close_task
        ADD CONSTRAINT chk_task_est_duration_positive
        CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Orchestration group index (for swimlane queries)
CREATE INDEX IF NOT EXISTS idx_pct_orchestration_group
    ON fin.period_close_task (tenant_id, orchestration_group)
    WHERE is_active = true;

-- ============================================================================
-- 3. Helper view: fin.vw_close_task_dependency_graph
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_task_dependency_graph CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_task_dependency_graph AS
SELECT
    d.id              AS dependency_id,
    d.tenant_id,
    d.predecessor_task_id,
    d.successor_task_id,
    d.dependency_type,
    d.satisfaction_mode,
    d.is_hard_block,
    p.entity_code,
    p.task_code       AS predecessor_task_code,
    p.task_name       AS predecessor_task_name,
    p.category        AS predecessor_category,
    s.task_code       AS successor_task_code,
    s.task_name       AS successor_task_name,
    s.category        AS successor_category
FROM fin.period_close_task_dependency d
JOIN fin.period_close_task p ON p.id = d.predecessor_task_id
JOIN fin.period_close_task s ON s.id = d.successor_task_id;

COMMENT ON VIEW fin.vw_close_task_dependency_graph IS
    'Readable view of close task dependency edges with task codes and names.';
