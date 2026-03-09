/* ============================================================================
   Athyper v2.9 — Close Risk Signals & Escalation Automation
   Schema: fin
   Dependencies: 191_period_close_governance.sql,
                 192_period_close_phase3.sql,
                 199_period_close_orchestration_graph.sql,
                 202_close_orchestration.sql,
                 204_close_orchestration_snapshot.sql

   Phase 6.1: Rule-driven risk detection for period close orchestration.

   Architecture:
     - Rules are table-driven (thresholds, targets, cooldown)
     - Evaluators are code-defined (TypeScript pure functions per rule_type)
     - Signals have a lifecycle: fired → acknowledged → resolved | suppressed
     - Each signal lifecycle event appends to fin.period_close_activity
     - Notification delivery via existing notify.* infrastructure

   Rule types:
     forecast_slipped       — predicted_ready_at shifted beyond threshold
     confidence_dropped     — confidence level decreased across snapshots
     blocker_stale          — same blockers persist across N snapshots
     failed_task_unresolved — FAILED task unresolved beyond threshold hours
     ready_queue_aging      — READY tasks with no owner action beyond hours
     sla_warning            — task approaching due_at within lead hours
     sla_breach             — task past due_at and not resolved
     close_target_at_risk   — close target date at risk given current forecast
   ============================================================================ */

-- ============================================================================
-- Risk rule definitions (tenant-configurable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fin.close_risk_rule (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,

    rule_code           varchar(50) NOT NULL,
    rule_name           varchar(150) NOT NULL,
    description         text,

    -- Evaluation type — each maps to a code-defined evaluator function
    rule_type           text NOT NULL
        CHECK (rule_type IN (
            'forecast_slipped',
            'confidence_dropped',
            'blocker_stale',
            'failed_task_unresolved',
            'ready_queue_aging',
            'sla_warning',
            'sla_breach',
            'close_target_at_risk'
        )),

    -- Rule parameters (thresholds, lookback windows, etc.)
    -- Schema varies by rule_type:
    --   forecast_slipped:       { "threshold_minutes": 120, "lookback_snapshots": 3 }
    --   confidence_dropped:     { "from": "high" }  (any drop from this level or above)
    --   blocker_stale:          { "stale_snapshot_count": 3 }
    --   failed_task_unresolved: { "threshold_hours": 24 }
    --   ready_queue_aging:      { "threshold_hours": 8 }
    --   sla_warning:            { "lead_hours": 4 }
    --   sla_breach:             {}  (no params — past due_at)
    --   close_target_at_risk:   { "days_before_target": 3, "min_confidence": "medium" }
    parameters          jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Signal severity when this rule fires
    severity            text NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- Escalation targets
    escalation_role     text,
    escalation_user_id  uuid,

    -- Cooldown: minimum minutes between firings for same rule + period
    -- Prevents alert fatigue during scheduled evaluation runs
    cooldown_minutes    integer NOT NULL DEFAULT 240
        CHECK (cooldown_minutes >= 0),

    -- Which close gate this rule applies to (null = both)
    target_status       text
        CHECK (target_status IS NULL OR target_status IN ('SOFT_CLOSE', 'HARD_CLOSE')),

    is_active           boolean NOT NULL DEFAULT true,
    sort_order          smallint NOT NULL DEFAULT 0,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_close_risk_rule
        UNIQUE (tenant_id, entity_code, rule_code)
);

CREATE INDEX IF NOT EXISTS idx_crr_tenant
    ON fin.close_risk_rule (tenant_id, entity_code)
    WHERE is_active = true;

COMMENT ON TABLE fin.close_risk_rule IS
    'Configurable risk signal rules for period close orchestration. Each rule_type maps to a code-defined evaluator; the table stores thresholds, escalation targets, and cooldown policy.';

-- ============================================================================
-- Risk signal log (lifecycle: fired → acknowledged → resolved | suppressed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fin.close_risk_signal (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_code         varchar(20) NOT NULL,
    fiscal_year         smallint NOT NULL,
    period_number       smallint NOT NULL,

    -- Rule that fired
    rule_id             uuid NOT NULL REFERENCES fin.close_risk_rule(id) ON DELETE CASCADE,
    rule_code           varchar(50) NOT NULL,
    rule_type           text NOT NULL,
    severity            text NOT NULL,

    -- Signal lifecycle
    signal_state        text NOT NULL DEFAULT 'fired'
        CHECK (signal_state IN ('fired', 'acknowledged', 'resolved', 'suppressed')),

    -- What triggered evaluation (snapshot that was current when rule fired)
    trigger_snapshot_id uuid REFERENCES fin.close_orchestration_snapshot(id) ON DELETE SET NULL,

    -- Human-readable signal
    title               text NOT NULL,
    message             text NOT NULL,

    -- Machine-readable evidence (rule-type-specific payload)
    evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Timing
    fired_at            timestamptz NOT NULL DEFAULT now(),

    -- Acknowledgement
    acknowledged_by     text,
    acknowledged_at     timestamptz,

    -- Resolution
    resolved_by         text,
    resolved_at         timestamptz,
    resolution_notes    text,

    created_at          timestamptz NOT NULL DEFAULT now(),

    -- FK to fiscal period
    CONSTRAINT fk_crs_period
        FOREIGN KEY (tenant_id, entity_code, fiscal_year, period_number)
        REFERENCES fin.fiscal_period(tenant_id, entity_code, fiscal_year, period_number),

    -- Lifecycle integrity
    CONSTRAINT chk_signal_acknowledged
        CHECK (signal_state != 'acknowledged' OR acknowledged_at IS NOT NULL),
    CONSTRAINT chk_signal_resolved
        CHECK (signal_state != 'resolved' OR (resolved_at IS NOT NULL AND resolution_notes IS NOT NULL))
);

-- Active signals for a period (dashboard query)
CREATE INDEX IF NOT EXISTS idx_crs_active
    ON fin.close_risk_signal (tenant_id, entity_code, fiscal_year, period_number, severity DESC)
    WHERE signal_state IN ('fired', 'acknowledged');

-- Cooldown check: most recent firing per rule + period
CREATE INDEX IF NOT EXISTS idx_crs_cooldown
    ON fin.close_risk_signal (tenant_id, entity_code, fiscal_year, period_number, rule_id, fired_at DESC);

-- Signal history timeline
CREATE INDEX IF NOT EXISTS idx_crs_timeline
    ON fin.close_risk_signal (tenant_id, entity_code, fiscal_year, period_number, fired_at DESC);

-- Find unresolved high/critical signals
CREATE INDEX IF NOT EXISTS idx_crs_severity
    ON fin.close_risk_signal (severity, fired_at DESC)
    WHERE signal_state IN ('fired', 'acknowledged') AND severity IN ('high', 'critical');

COMMENT ON TABLE fin.close_risk_signal IS
    'Risk signals fired by close orchestration rules. Lifecycle: fired → acknowledged → resolved/suppressed. Each transition appends to fin.period_close_activity for audit.';

-- ============================================================================
-- Extend activity_type enum with risk signal events
-- ============================================================================

ALTER TABLE fin.period_close_activity
    DROP CONSTRAINT IF EXISTS chk_close_activity_type;

ALTER TABLE fin.period_close_activity
    ADD CONSTRAINT chk_close_activity_type
        CHECK (activity_type IN (
            'TASK_COMPLETED', 'TASK_FAILED', 'TASK_BLOCKED', 'TASK_UNBLOCKED',
            'TASK_ASSIGNED', 'TASK_REASSIGNED',
            'WAIVER_REQUESTED', 'WAIVER_APPROVED', 'WAIVER_REJECTED',
            'HANDLER_EXECUTED', 'HANDLER_FAILED',
            'REMINDER_SENT', 'ESCALATED',
            'TRANSITION_ATTEMPTED', 'TRANSITION_DENIED', 'TRANSITION_SUCCEEDED',
            'CHECKLIST_MATERIALIZED',
            -- Phase 6.1: Risk signal lifecycle events
            'RISK_SIGNAL_FIRED', 'RISK_SIGNAL_ACKNOWLEDGED', 'RISK_SIGNAL_RESOLVED'
        ));

-- ============================================================================
-- View: Active risk signals per period (dashboard)
-- ============================================================================

DROP VIEW IF EXISTS fin.vw_close_risk_signals_active CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_risk_signals_active AS
SELECT
    s.id,
    s.tenant_id,
    s.entity_code,
    s.fiscal_year,
    s.period_number,
    s.rule_code,
    s.rule_type,
    s.severity,
    s.signal_state,
    s.title,
    s.message,
    s.evidence,
    s.fired_at,
    s.acknowledged_by,
    s.acknowledged_at,
    r.rule_name,
    r.escalation_role,
    r.target_status AS rule_target_status,
    -- Age in hours since fired (for priority sorting)
    EXTRACT(EPOCH FROM (now() - s.fired_at)) / 3600 AS age_hours
FROM fin.close_risk_signal s
JOIN fin.close_risk_rule r ON r.id = s.rule_id
WHERE s.signal_state IN ('fired', 'acknowledged')
ORDER BY
    CASE s.severity
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
    END,
    s.fired_at DESC;

COMMENT ON VIEW fin.vw_close_risk_signals_active IS
    'Active (fired or acknowledged) risk signals, sorted by severity then recency. Use for dashboard risk banners.';

-- ============================================================================
-- View: Risk signal summary per period (counts by severity + state)
-- ============================================================================

DROP VIEW IF EXISTS fin.vw_close_risk_summary CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_risk_summary AS
SELECT
    tenant_id,
    entity_code,
    fiscal_year,
    period_number,
    COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged')) AS active_count,
    COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'critical') AS critical_count,
    COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'high') AS high_count,
    COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'medium') AS medium_count,
    COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'low') AS low_count,
    COUNT(*) FILTER (WHERE signal_state = 'fired') AS unacknowledged_count,
    COUNT(*) FILTER (WHERE signal_state = 'resolved') AS resolved_count,
    COUNT(*) FILTER (WHERE signal_state = 'suppressed') AS suppressed_count,
    MAX(fired_at) FILTER (WHERE signal_state IN ('fired', 'acknowledged')) AS latest_signal_at
FROM fin.close_risk_signal
GROUP BY tenant_id, entity_code, fiscal_year, period_number;

COMMENT ON VIEW fin.vw_close_risk_summary IS
    'Aggregated risk signal counts per period. Use for dashboard badge counts and risk heatmaps.';

-- ============================================================================
-- Helper function: Check cooldown for a rule + period
-- Returns true if the rule is cooled down (safe to fire again)
-- ============================================================================

DROP FUNCTION IF EXISTS fin.is_risk_rule_cooled_down(uuid, varchar, smallint, smallint, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS fin.is_risk_rule_cooled_down(uuid, varchar, smallint, smallint, uuid, integer, text) CASCADE;

CREATE OR REPLACE FUNCTION fin.is_risk_rule_cooled_down(
    p_tenant_id     uuid,
    p_entity_code   varchar(20),
    p_fiscal_year   smallint,
    p_period_number smallint,
    p_rule_id       uuid,
    p_cooldown_minutes integer
) RETURNS boolean
LANGUAGE sql STABLE
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM fin.close_risk_signal
        WHERE tenant_id = p_tenant_id
          AND entity_code = p_entity_code
          AND fiscal_year = p_fiscal_year
          AND period_number = p_period_number
          AND rule_id = p_rule_id
          AND signal_state IN ('fired', 'acknowledged')
          AND fired_at > now() - (p_cooldown_minutes || ' minutes')::interval
    );
$$;

COMMENT ON FUNCTION fin.is_risk_rule_cooled_down(uuid, varchar, smallint, smallint, uuid, integer) IS
    'Returns true if no active signal for this rule+period was fired within the cooldown window. Used by the evaluator to suppress duplicate firings.';
