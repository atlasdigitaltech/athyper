-- 211_close_action_policies.sql
--
-- Phase 9 -- Prescriptive Close Automation
--
-- 1. fin.close_action_policy       -- tenant-configurable recommendation/automation rules
-- 2. fin.close_action_log          -- execution log for recommended/auto-triggered actions
-- 3. fin.vw_close_bottleneck_pattern -- cross-period bottleneck pattern detection
--
-- Builds on: fin.close_task_duration_history (Phase 8),
--            fin.close_orchestration_snapshot (Phase 5),
--            fin.close_risk_signal (Phase 6),
--            fin.ai_action (Phase 1 AI foundation)

-- =========================================================================
-- 1. Close Action Policy (recommendation/automation rules)
-- =========================================================================

CREATE TABLE IF NOT EXISTS fin.close_action_policy (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid        NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,

    -- Identity
    policy_code         varchar(60) NOT NULL,
    policy_name         text        NOT NULL,
    description         text,

    -- Trigger condition
    trigger_type        varchar(40) NOT NULL,
    -- Valid trigger_types:
    --   ready_tasks_available    -- N+ tasks in READY state
    --   critical_signal_active   -- critical/high risk signal firing
    --   delay_impact_exceeded    -- delay impact > threshold minutes
    --   confidence_below         -- prediction confidence < threshold
    --   blocker_stale            -- blocker unchanged for N snapshots
    --   sla_at_risk              -- task approaching SLA deadline
    --   bottleneck_recurring     -- same task on critical path N of last M closes
    --   handler_failed           -- system handler returned non-passing result
    --   parallel_opportunity     -- parallelizable layer with savings > threshold

    trigger_condition   jsonb       NOT NULL DEFAULT '{}',
    -- Condition schema varies by trigger_type. Examples:
    --   ready_tasks_available:  { "minReadyCount": 3, "sameLayer": true }
    --   critical_signal_active: { "minSeverity": "high" }
    --   delay_impact_exceeded:  { "thresholdMinutes": 120 }
    --   confidence_below:       { "threshold": "medium" }
    --   blocker_stale:          { "staleSinceSnapshots": 3 }
    --   sla_at_risk:            { "leadHours": 4 }
    --   bottleneck_recurring:   { "minOccurrences": 3, "lookbackCloses": 10 }
    --   handler_failed:         { "evidenceCodes": ["DISCREPANCY", "RUN_FAILED"] }
    --   parallel_opportunity:   { "minSavingsMinutes": 60 }

    -- Recommended action
    action_type         varchar(40) NOT NULL,
    -- Valid action_types:
    --   notify_owner             -- send notification to task owner
    --   notify_escalation        -- notify escalation chain
    --   start_ready_tasks        -- auto-start ready SYSTEM/HYBRID tasks
    --   rerun_handler            -- re-execute a system handler
    --   refresh_snapshot         -- capture a new orchestration snapshot
    --   reevaluate_signals       -- trigger risk signal re-evaluation
    --   escalate_signal          -- force-escalate a risk signal
    --   recommend_parallel       -- suggest parallel execution
    --   recommend_reassignment   -- suggest task reassignment
    --   recommend_waiver         -- suggest waiver for non-critical task
    --   publish_readiness        -- publish close readiness summary
    --   custom                   -- custom action (payload-driven)

    action_params       jsonb       NOT NULL DEFAULT '{}',
    -- Action-specific parameters. Examples:
    --   start_ready_tasks:    { "maxConcurrent": 3, "layerOnly": true }
    --   notify_owner:         { "channel": "email", "template": "sla_warning" }
    --   rerun_handler:        { "taskCode": "RECON_BANK" }
    --   recommend_parallel:   { "minLayer": 0 }

    -- Execution mode
    execution_mode      varchar(20) NOT NULL DEFAULT 'recommend',
    -- recommend:  generate recommendation only (human approves)
    -- auto:       execute immediately when triggered
    -- auto_safe:  auto-execute only for "safe" action_types (refresh, reevaluate, notify)

    -- Severity / priority
    priority            smallint    NOT NULL DEFAULT 50,  -- 1=highest, 100=lowest
    severity            varchar(10) NOT NULL DEFAULT 'medium',
    -- critical, high, medium, low, info

    -- Lifecycle
    is_active           boolean     NOT NULL DEFAULT true,
    effective_from      date,
    effective_to        date,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_cap_policy_code UNIQUE (tenant_id, entity_code, policy_code)
);

-- For trigger-type-based lookup during evaluation
CREATE INDEX IF NOT EXISTS idx_cap_trigger_type
    ON fin.close_action_policy (tenant_id, entity_code, trigger_type)
    WHERE is_active = true;

COMMENT ON TABLE fin.close_action_policy IS
    'Phase 9: Tenant-configurable policies that map close conditions to recommended or automated actions.';

-- =========================================================================
-- 2. Close Action Log (execution tracking)
-- =========================================================================

CREATE TABLE IF NOT EXISTS fin.close_action_log (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid        NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,
    fiscal_year         smallint    NOT NULL,
    period_number       smallint    NOT NULL,

    -- Source policy
    policy_id           uuid        REFERENCES fin.close_action_policy(id) ON DELETE SET NULL,
    policy_code         varchar(60) NOT NULL,

    -- What was recommended/executed
    action_type         varchar(40) NOT NULL,
    action_params       jsonb       NOT NULL DEFAULT '{}',
    trigger_context     jsonb       NOT NULL DEFAULT '{}',
    -- trigger_context captures the state that triggered this recommendation:
    --   e.g., { readyTasks: [...], delayImpact: { taskCode, shiftMinutes }, signalId: "..." }

    -- Lifecycle
    status              varchar(20) NOT NULL DEFAULT 'proposed',
    -- proposed:    recommendation generated, awaiting user action
    -- accepted:    user approved for execution
    -- executed:    action has been performed
    -- dismissed:   user rejected the recommendation
    -- expired:     recommendation no longer relevant (period closed, condition resolved)
    -- failed:      execution attempted but failed

    -- Execution metadata
    proposed_at         timestamptz NOT NULL DEFAULT now(),
    decided_at          timestamptz,
    decided_by          text,
    executed_at         timestamptz,
    execution_result    jsonb,
    -- e.g., { tasksStarted: 2, handlerResults: [...], notificationsSent: 3 }

    -- Outcome tracking
    outcome_notes       text,
    was_effective       boolean,    -- user/system feedback: did this help?

    -- Deduplication: prevent same recommendation for same condition in same period
    fingerprint         varchar(200),

    created_at          timestamptz NOT NULL DEFAULT now()
);

-- For listing recommendations per period
CREATE INDEX IF NOT EXISTS idx_cal_period
    ON fin.close_action_log (tenant_id, entity_code, fiscal_year, period_number, status);

-- For deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_cal_fingerprint
    ON fin.close_action_log (tenant_id, entity_code, fiscal_year, period_number, fingerprint)
    WHERE fingerprint IS NOT NULL AND status NOT IN ('dismissed', 'expired', 'failed');

-- For outcome analysis
CREATE INDEX IF NOT EXISTS idx_cal_outcome
    ON fin.close_action_log (tenant_id, entity_code, policy_code, was_effective)
    WHERE was_effective IS NOT NULL;

COMMENT ON TABLE fin.close_action_log IS
    'Phase 9: Log of recommended and executed close actions. Tracks proposal → decision → execution → outcome lifecycle.';

-- =========================================================================
-- 3. Cross-Period Bottleneck Pattern View
-- =========================================================================

DROP VIEW IF EXISTS fin.vw_close_bottleneck_pattern CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_bottleneck_pattern AS
WITH critical_path_history AS (
    -- For each period, identify the task with the longest blocking duration
    SELECT
        h.tenant_id,
        h.entity_code,
        h.fiscal_year,
        h.period_number,
        h.task_code,
        h.actual_duration_minutes,
        h.was_blocked,
        h.block_duration_minutes,
        h.close_type,
        -- Rank tasks by duration within each period (longest = most likely bottleneck)
        ROW_NUMBER() OVER (
            PARTITION BY h.tenant_id, h.entity_code, h.fiscal_year, h.period_number
            ORDER BY h.actual_duration_minutes DESC
        ) AS duration_rank
    FROM fin.close_task_duration_history h
    WHERE NOT h.was_waived
),
bottleneck_summary AS (
    SELECT
        tenant_id,
        entity_code,
        task_code,
        COUNT(*)                                                AS total_appearances,
        COUNT(*) FILTER (WHERE duration_rank = 1)               AS times_longest_task,
        COUNT(*) FILTER (WHERE duration_rank <= 3)              AS times_top_3,
        COUNT(*) FILTER (WHERE was_blocked)                     AS times_blocked,
        ROUND(AVG(actual_duration_minutes))                     AS avg_duration_minutes,
        MAX(actual_duration_minutes)                            AS max_duration_minutes,
        ROUND(AVG(block_duration_minutes))                      AS avg_block_minutes,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY actual_duration_minutes)::integer
                                                                AS p95_duration_minutes,
        MAX(fiscal_year * 100 + period_number)                  AS last_period_key
    FROM critical_path_history
    GROUP BY tenant_id, entity_code, task_code
),
period_count AS (
    SELECT
        tenant_id,
        entity_code,
        COUNT(DISTINCT (fiscal_year, period_number)) AS total_closes
    FROM fin.close_task_duration_history
    WHERE NOT was_waived
    GROUP BY tenant_id, entity_code
)
SELECT
    b.tenant_id,
    b.entity_code,
    b.task_code,
    b.total_appearances,
    b.times_longest_task,
    b.times_top_3,
    b.times_blocked,
    b.avg_duration_minutes,
    b.max_duration_minutes,
    b.avg_block_minutes,
    b.p95_duration_minutes,
    pc.total_closes,
    -- Bottleneck score: how frequently this task is the longest + how often it's blocked
    ROUND(
        (b.times_longest_task::numeric / GREATEST(pc.total_closes, 1)) * 100
    )                                                           AS bottleneck_frequency_pct,
    CASE
        WHEN b.times_longest_task::numeric / GREATEST(pc.total_closes, 1) >= 0.7 THEN 'chronic'
        WHEN b.times_longest_task::numeric / GREATEST(pc.total_closes, 1) >= 0.4 THEN 'frequent'
        WHEN b.times_top_3::numeric / GREATEST(pc.total_closes, 1) >= 0.5      THEN 'recurring'
        ELSE 'occasional'
    END                                                         AS pattern_classification,
    b.last_period_key
FROM bottleneck_summary b
JOIN period_count pc USING (tenant_id, entity_code)
WHERE b.total_appearances >= 2;  -- need at least 2 data points

COMMENT ON VIEW fin.vw_close_bottleneck_pattern IS
    'Phase 9: Cross-period bottleneck pattern detection. Identifies tasks that chronically delay closes based on duration history.';
