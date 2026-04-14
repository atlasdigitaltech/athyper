-- 04_tables/007a_event_orchestration.sql
-- Depends on: 007_event.sql
-- Dedicated persistence tables for DagOrchestrationService.
--
-- Replaces the temporary event.work_item workaround that was incompatible
-- with the wi_status_chk CHECK constraint (which only allows workflow-approval
-- statuses, not DAG-specific statuses like 'running' or 'failed').
--
-- Tables:
--   §1  event.orchestration_run   — one row per DAG execution
--   §2  event.orchestration_node  — one row per step within a run

-- ============================================================================
-- §1  orchestration_run — one row per DAG execution
-- ============================================================================

CREATE TABLE IF NOT EXISTS event.orchestration_run (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL REFERENCES master.tenant(id),

    -- DAG reference
    dag_id          text        NOT NULL,  -- DagDefinition.id
    trigger_type    text        NOT NULL DEFAULT 'manual',   -- manual | scheduler | api
    trigger_ref     text,                                    -- schedule code, API call id, etc.
    correlation_id  text,

    -- Status
    status          text        NOT NULL DEFAULT 'running',

    -- Step counters (denormalised; updated on each node state change)
    total_nodes     integer     NOT NULL DEFAULT 0,
    completed_nodes integer     NOT NULL DEFAULT 0,
    failed_nodes    integer     NOT NULL DEFAULT 0,
    skipped_nodes   integer     NOT NULL DEFAULT 0,

    -- Timestamps
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    timeout_at      timestamptz,

    -- Payload snapshots
    input           jsonb,
    output          jsonb,

    -- Audit
    created_by      uuid,

    CONSTRAINT orch_run_pkey       PRIMARY KEY (id),
    CONSTRAINT orch_run_status_chk CHECK (status IN ('running', 'completed', 'failed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS idx_orch_run_tenant_status
    ON event.orchestration_run (tenant_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_orch_run_dag
    ON event.orchestration_run (tenant_id, dag_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_orch_run_correlation
    ON event.orchestration_run (correlation_id)
    WHERE correlation_id IS NOT NULL;

COMMENT ON TABLE event.orchestration_run IS
    'One row per DAG execution — managed by DagOrchestrationService';

-- ============================================================================
-- §2  orchestration_node — one row per step within a run
-- ============================================================================

CREATE TABLE IF NOT EXISTS event.orchestration_node (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL REFERENCES master.tenant(id),
    run_id          uuid        NOT NULL REFERENCES event.orchestration_run(id) ON DELETE CASCADE,

    -- Node identity (mirrors DagStep)
    node_code       text        NOT NULL,   -- DagStep.id
    node_type       text        NOT NULL,   -- DagStep.jobName (BullMQ job name)
    depends_on      text[]      NOT NULL DEFAULT '{}',  -- array of node_code values

    -- Status
    status          text        NOT NULL DEFAULT 'pending',

    -- BullMQ correlation
    job_id          text,

    -- Payload
    input           jsonb,
    output          jsonb,
    error           text,

    -- Execution metrics
    retry_count     integer     NOT NULL DEFAULT 0,

    -- Timestamps
    started_at      timestamptz,
    completed_at    timestamptz,
    duration_ms     integer,

    CONSTRAINT orch_node_pkey       PRIMARY KEY (id),
    CONSTRAINT orch_node_run_code   UNIQUE (run_id, node_code),
    CONSTRAINT orch_node_status_chk CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'canceled')
    )
);

CREATE INDEX IF NOT EXISTS idx_orch_node_run_id
    ON event.orchestration_node (run_id);

CREATE INDEX IF NOT EXISTS idx_orch_node_job_id
    ON event.orchestration_node (job_id)
    WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orch_node_active
    ON event.orchestration_node (tenant_id, status)
    WHERE status IN ('pending', 'running');

COMMENT ON TABLE event.orchestration_node IS
    'One row per step within a DAG run — managed by DagOrchestrationService';
