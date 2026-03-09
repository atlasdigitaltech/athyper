-- ============================================================================
-- 220_control_program.sql
--
-- Phase 18: Control Program Management & Remediation Portfolio.
--
-- Turns benchmarking insights and policy recommendations into managed
-- control improvement programs with milestones and benefit tracking.
--
-- 1 new table:
--   fin.control_program — strategic control improvement initiatives
--
-- 1 new view:
--   fin.vw_program_portfolio — aggregated portfolio with milestone progress,
--     gap closure status, and benefit realization
--
-- Table extensions (CHECK constraints):
--   fin.action_item — 'program_milestone' target_kind
--   fin.decision_log — 'control_program' target_kind
--   fin.report_commentary — 'control_program' target_kind
--   fin.followup_link — 'control_program' source_kind
--
-- Reuse strategy:
--   Milestones → fin.action_item (due_at, assigned_to, severity, status)
--   Decisions → fin.decision_log (approve, defer, note decisions)
--   Narratives → fin.report_commentary (progress notes, versioned)
--   Cross-period → fin.followup_link (programs spanning periods)
--   Gap linkage → JSONB array on control_program (no join table needed)
--   Baseline metrics → JSONB on control_program (snapshot at program start)
-- ============================================================================


-- ############################################################################
-- 1. CONTROL PROGRAM TABLE
-- ############################################################################

CREATE TABLE IF NOT EXISTS fin.control_program (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid        NOT NULL,
    entity_code         varchar(20) NOT NULL,

    -- Identity
    program_code        varchar(40) NOT NULL,
    title               text        NOT NULL,
    description         text,

    -- Classification
    program_type        varchar(30) NOT NULL DEFAULT 'improvement'
                        CHECK (program_type IN (
                            'improvement',          -- control enhancement
                            'remediation',          -- fix identified gap
                            'optimization',         -- process efficiency
                            'compliance',           -- regulatory/audit requirement
                            'transformation'        -- major process change
                        )),
    priority            varchar(10) NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('critical', 'high', 'medium', 'low')),

    -- Ownership
    sponsor_name        varchar(100),               -- executive sponsor
    sponsor_role        varchar(50),
    owner_name          varchar(100),               -- program manager/owner
    owner_role          varchar(50),
    owner_user_id       uuid,

    -- Lifecycle
    status              varchar(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                            'draft',                -- being defined
                            'approved',             -- approved to proceed
                            'active',               -- in execution
                            'on_hold',              -- paused
                            'completed',            -- all milestones done
                            'closed',               -- benefits verified, archived
                            'cancelled'             -- abandoned
                        )),

    -- Timeline
    planned_start       date,
    planned_end         date,
    actual_start        date,
    actual_end          date,
    fiscal_year         int,                        -- primary fiscal year context

    -- Linked control gaps (JSONB array — no join table needed)
    -- Each entry: { type, key, label, metricCode?, severity? }
    -- Types: benchmark_red, chronic_issue, policy_recommendation, audit_finding
    linked_gaps         jsonb       NOT NULL DEFAULT '[]',

    -- Baseline metrics (snapshot of benchmark values at program start)
    -- Captured when program transitions to 'active'
    -- Format: { metricCode: { value, trafficLight, capturedAt } }
    baseline_metrics    jsonb       NOT NULL DEFAULT '{}',

    -- Target outcomes
    -- Format: { metricCode: { currentValue, targetValue, targetTrafficLight } }
    target_outcomes     jsonb       NOT NULL DEFAULT '{}',

    -- Denormalized progress
    total_milestones    int         NOT NULL DEFAULT 0,
    completed_milestones int        NOT NULL DEFAULT 0,
    overdue_milestones  int         NOT NULL DEFAULT 0,

    -- Governance
    approved_by         varchar(100),
    approved_at         timestamptz,
    closed_by           varchar(100),
    closed_at           timestamptz,
    close_note          text,

    created_by          varchar(100),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_control_program_code UNIQUE (tenant_id, entity_code, program_code)
);

CREATE INDEX IF NOT EXISTS idx_control_program_lookup
    ON fin.control_program (tenant_id, entity_code, status);

CREATE INDEX IF NOT EXISTS idx_control_program_owner
    ON fin.control_program (tenant_id, owner_user_id)
    WHERE status IN ('active', 'approved');

COMMENT ON TABLE fin.control_program IS
    'Strategic control improvement programs linking benchmarking gaps to managed initiatives with milestones, ownership, and benefit tracking.';


-- ############################################################################
-- 2. EXTEND fin.action_item — program_milestone target_kind
-- ############################################################################

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.action_item'::regclass
          AND contype = 'c'
          AND conname LIKE '%target_kind%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.action_item DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.action_item'::regclass
               AND contype = 'c'
               AND conname LIKE '%target_kind%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.action_item
        ADD CONSTRAINT chk_action_item_target_kind CHECK (target_kind IN (
            'period_close',
            'pack_instance',
            'statement',
            'release',
            'entity',
            'evidence_request',
            'pbc_item',
            'policy_recommendation',
            'program_milestone'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ############################################################################
-- 3. EXTEND fin.decision_log — control_program target_kind
-- ############################################################################

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.decision_log'::regclass
          AND contype = 'c'
          AND conname LIKE '%target_kind%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.decision_log DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.decision_log'::regclass
               AND contype = 'c'
               AND conname LIKE '%target_kind%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.decision_log
        ADD CONSTRAINT chk_decision_log_target_kind CHECK (target_kind IN (
            'period_close',
            'pack_instance',
            'action_item',
            'release',
            'statement',
            'entity',
            'evidence_request',
            'evidence_bundle',
            'control_program'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ############################################################################
-- 4. EXTEND fin.report_commentary — control_program target_kind
-- ############################################################################

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.report_commentary'::regclass
          AND contype = 'c'
          AND conname LIKE '%target_kind%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.report_commentary DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.report_commentary'::regclass
               AND contype = 'c'
               AND conname LIKE '%target_kind%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.report_commentary
        ADD CONSTRAINT chk_commentary_target_kind CHECK (target_kind IN (
            'pack_instance',
            'pack_item',
            'statement_line',
            'control_program'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ############################################################################
-- 5. EXTEND fin.followup_link — control_program source_kind
-- ############################################################################

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'fin.followup_link'::regclass
          AND contype = 'c'
          AND conname LIKE '%source_kind%'
    ) THEN
        EXECUTE format(
            'ALTER TABLE fin.followup_link DROP CONSTRAINT %I',
            (SELECT conname FROM pg_constraint
             WHERE conrelid = 'fin.followup_link'::regclass
               AND contype = 'c'
               AND conname LIKE '%source_kind%'
             LIMIT 1)
        );
    END IF;

    ALTER TABLE fin.followup_link
        ADD CONSTRAINT chk_followup_source_kind CHECK (source_kind IN (
            'action_item', 'decision', 'exception', 'override', 'control_program'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ############################################################################
-- 6. PROGRAM PORTFOLIO VIEW — aggregated dashboard
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_program_portfolio CASCADE;
CREATE OR REPLACE VIEW fin.vw_program_portfolio AS
WITH
-- Milestone counts from action_item
milestone_stats AS (
    SELECT
        ai.tenant_id,
        ai.target_id AS program_id,
        count(*) AS total_milestones,
        count(*) FILTER (WHERE ai.status = 'resolved') AS completed_milestones,
        count(*) FILTER (WHERE ai.due_at < now() AND ai.status NOT IN ('resolved', 'dismissed'))
            AS overdue_milestones,
        count(*) FILTER (WHERE ai.status IN ('open', 'acknowledged', 'in_progress'))
            AS active_milestones,
        min(ai.due_at) FILTER (WHERE ai.status NOT IN ('resolved', 'dismissed'))
            AS next_milestone_due,
        round(count(*) FILTER (WHERE ai.status = 'resolved')::decimal
              / GREATEST(count(*), 1) * 100, 1) AS milestone_completion_pct
    FROM fin.action_item ai
    WHERE ai.target_kind = 'program_milestone'
    GROUP BY ai.tenant_id, ai.target_id
),
-- Decision counts
decision_stats AS (
    SELECT
        dl.tenant_id,
        dl.target_id AS program_id,
        count(*) AS total_decisions,
        count(*) FILTER (WHERE dl.decision_type = 'approve') AS approvals,
        count(*) FILTER (WHERE dl.decision_type = 'defer') AS deferrals,
        max(dl.decided_at) AS last_decision_at
    FROM fin.decision_log dl
    WHERE dl.target_kind = 'control_program'
    GROUP BY dl.tenant_id, dl.target_id
),
-- Linked gap counts
gap_counts AS (
    SELECT
        cp.id AS program_id,
        cp.tenant_id,
        jsonb_array_length(cp.linked_gaps) AS gap_count,
        (SELECT count(*) FROM jsonb_array_elements(cp.linked_gaps) g
         WHERE g->>'type' = 'benchmark_red') AS benchmark_gaps,
        (SELECT count(*) FROM jsonb_array_elements(cp.linked_gaps) g
         WHERE g->>'type' = 'chronic_issue') AS chronic_gaps,
        (SELECT count(*) FROM jsonb_array_elements(cp.linked_gaps) g
         WHERE g->>'type' = 'policy_recommendation') AS recommendation_gaps
    FROM fin.control_program cp
)
SELECT
    cp.id,
    cp.tenant_id,
    cp.entity_code,
    cp.program_code,
    cp.title,
    cp.description,
    cp.program_type,
    cp.priority,
    cp.sponsor_name,
    cp.sponsor_role,
    cp.owner_name,
    cp.owner_role,
    cp.status,
    cp.planned_start,
    cp.planned_end,
    cp.actual_start,
    cp.actual_end,
    cp.fiscal_year,

    -- Milestone progress
    coalesce(ms.total_milestones, 0) AS total_milestones,
    coalesce(ms.completed_milestones, 0) AS completed_milestones,
    coalesce(ms.overdue_milestones, 0) AS overdue_milestones,
    coalesce(ms.active_milestones, 0) AS active_milestones,
    coalesce(ms.milestone_completion_pct, 0) AS milestone_completion_pct,
    ms.next_milestone_due,

    -- Gap linkage
    coalesce(gc.gap_count, 0) AS linked_gap_count,
    coalesce(gc.benchmark_gaps, 0) AS benchmark_gap_count,
    coalesce(gc.chronic_gaps, 0) AS chronic_gap_count,
    coalesce(gc.recommendation_gaps, 0) AS recommendation_gap_count,

    -- Decision history
    coalesce(ds.total_decisions, 0) AS total_decisions,
    ds.last_decision_at,

    -- Duration
    CASE WHEN cp.actual_start IS NOT NULL
         THEN (coalesce(cp.actual_end, current_date) - cp.actual_start)
         ELSE NULL END AS elapsed_days,
    CASE WHEN cp.planned_start IS NOT NULL AND cp.planned_end IS NOT NULL
         THEN (cp.planned_end - cp.planned_start)
         ELSE NULL END AS planned_days,

    -- Is overdue
    CASE WHEN cp.planned_end IS NOT NULL AND cp.planned_end < current_date
              AND cp.status IN ('active', 'approved')
         THEN true ELSE false END AS is_overdue,

    -- Health indicator
    CASE
        WHEN cp.status IN ('completed', 'closed') THEN 'green'
        WHEN coalesce(ms.overdue_milestones, 0) > 0 THEN 'red'
        WHEN cp.planned_end IS NOT NULL AND cp.planned_end < current_date
             AND cp.status IN ('active', 'approved') THEN 'red'
        WHEN coalesce(ms.milestone_completion_pct, 0) < 25
             AND cp.status = 'active'
             AND cp.actual_start IS NOT NULL
             AND cp.actual_start < current_date - interval '30 days' THEN 'amber'
        ELSE 'green'
    END AS health,

    cp.linked_gaps,
    cp.baseline_metrics,
    cp.target_outcomes,
    cp.created_at,
    cp.updated_at

FROM fin.control_program cp
LEFT JOIN milestone_stats ms ON ms.program_id = cp.id AND ms.tenant_id = cp.tenant_id
LEFT JOIN decision_stats ds ON ds.program_id = cp.id AND ds.tenant_id = cp.tenant_id
LEFT JOIN gap_counts gc ON gc.program_id = cp.id AND gc.tenant_id = cp.tenant_id;

COMMENT ON VIEW fin.vw_program_portfolio IS
    'Aggregated control program portfolio with milestone progress, gap linkage, decision history, health indicators, and duration tracking.';
