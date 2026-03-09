/* ============================================================================
   Athyper v2.9 — Close Predictive Intelligence
   Schema: fin
   Dependencies: 202_close_orchestration.sql (close_calendar, close_run,
                  close_readiness_snapshot, close_exception)
                 204_close_orchestration_snapshot.sql
                 204_governance_lifecycle.sql (close_override)
                 205_close_risk_signals.sql (close_risk_signal)
                 210_close_duration_intelligence.sql (close_task_duration_history)
                 211_close_action_policies.sql (close_action_log)
                 214_document_health_reconciliation.sql
                 215_remediation_campaigns.sql
                 216_close_control_tower.sql

   Phase 9B: Predictive Close Intelligence views.
   Provides pre-computed intelligence for 6 predictive questions:

   1. SLA Breach Forecast       — probability of breaching soft/hard close targets
   2. Cross-Entity Risk Ranking — composite risk score across all open entities
   3. Defect-Delay Correlation  — which document defect classes predict close delays
   4. Remediation Completion    — campaign/action completion probability forecast
   5. Override-Failure Pattern  — override patterns that correlate with failed closes
   6. Action Effectiveness      — which recommendation actions actually improve outcomes

   All views are computed from existing tables — no new tables required.
   ============================================================================ */

-- ============================================================================
-- 1. fin.vw_sla_breach_forecast — SLA breach probability per entity/period
-- ============================================================================
-- Uses: current prediction (predicted_ready_at), historical duration stats,
-- close_calendar targets, and current snapshot progress.
-- Computes: breach probability, estimated remaining hours, buffer hours.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_sla_breach_forecast CASCADE;
CREATE OR REPLACE VIEW fin.vw_sla_breach_forecast AS
WITH current_run AS (
    SELECT DISTINCT ON (r.tenant_id, r.entity_code, r.fiscal_year, r.period_number)
        r.id AS run_id,
        r.tenant_id,
        r.entity_code,
        r.fiscal_year,
        r.period_number,
        r.status AS run_status,
        r.started_at
    FROM fin.close_run r
    WHERE r.status NOT IN ('CANCELLED', 'HARD_CLOSED')
    ORDER BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number,
             r.run_number DESC
),
latest_snapshot AS (
    SELECT DISTINCT ON (s.run_id, s.target_status)
        s.run_id,
        s.target_status,
        s.predicted_ready_at,
        s.critical_path_minutes,
        s.confidence,
        s.total_tasks,
        s.satisfied_count,
        s.blocked_count,
        s.failed_count,
        s.snapshot_at
    FROM fin.close_orchestration_snapshot s
    ORDER BY s.run_id, s.target_status, s.snapshot_at DESC
),
calendar AS (
    SELECT
        c.tenant_id,
        c.entity_code,
        c.fiscal_year,
        c.period_number,
        c.soft_close_target,
        c.hard_close_target,
        c.close_type,
        c.target_working_days
    FROM fin.close_calendar c
),
-- Count recent snapshots where prediction slipped (forecast_slipped signal proxy)
slippage AS (
    SELECT
        cr.run_id,
        COUNT(*) FILTER (WHERE
            s2.predicted_ready_at IS NOT NULL
            AND s1.predicted_ready_at IS NOT NULL
            AND s2.predicted_ready_at > s1.predicted_ready_at
        ) AS slippage_count,
        COUNT(*) AS snapshot_count
    FROM current_run cr
    JOIN fin.close_orchestration_snapshot s1 ON s1.run_id = cr.run_id
    LEFT JOIN LATERAL (
        SELECT s2x.predicted_ready_at
        FROM fin.close_orchestration_snapshot s2x
        WHERE s2x.run_id = cr.run_id
          AND s2x.target_status = s1.target_status
          AND s2x.snapshot_at < s1.snapshot_at
        ORDER BY s2x.snapshot_at DESC
        LIMIT 1
    ) s2 ON true
    WHERE s1.target_status = 'HARD_CLOSE'
    GROUP BY cr.run_id
)
SELECT
    cr.tenant_id,
    cr.entity_code,
    cr.fiscal_year,
    cr.period_number,
    cr.run_status,
    cal.close_type,
    -- Targets
    cal.soft_close_target,
    cal.hard_close_target,
    -- Current prediction
    ls_soft.predicted_ready_at  AS soft_predicted_at,
    ls_soft.confidence          AS soft_confidence,
    ls_hard.predicted_ready_at  AS hard_predicted_at,
    ls_hard.confidence          AS hard_confidence,
    ls_hard.critical_path_minutes,
    -- Progress
    ls_hard.total_tasks,
    ls_hard.satisfied_count,
    ls_hard.blocked_count,
    ls_hard.failed_count,
    CASE WHEN ls_hard.total_tasks > 0
        THEN ROUND((ls_hard.satisfied_count::numeric / ls_hard.total_tasks) * 100, 1)
        ELSE 0 END AS completion_pct,
    -- Buffer: hours between predicted ready and target
    CASE
        WHEN ls_hard.predicted_ready_at IS NOT NULL AND cal.hard_close_target IS NOT NULL
        THEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0
        ELSE NULL
    END AS hard_close_buffer_hours,
    CASE
        WHEN ls_soft.predicted_ready_at IS NOT NULL AND cal.soft_close_target IS NOT NULL
        THEN EXTRACT(EPOCH FROM (cal.soft_close_target::timestamp - ls_soft.predicted_ready_at)) / 3600.0
        ELSE NULL
    END AS soft_close_buffer_hours,
    -- Breach probability estimation (heuristic scoring 0-100):
    -- Factors: buffer hours, confidence, blocked tasks, failed tasks, slippage trend
    LEAST(100, GREATEST(0,
        -- Base: inverse of buffer hours (negative buffer = guaranteed breach)
        CASE
            WHEN ls_hard.predicted_ready_at IS NULL THEN 50  -- no prediction = uncertain
            WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) < 0 THEN 95
            WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 4 THEN 75
            WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 12 THEN 50
            WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 24 THEN 30
            WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 48 THEN 15
            ELSE 5
        END
        -- Confidence penalty: low confidence adds uncertainty
        + CASE ls_hard.confidence
            WHEN 'low' THEN 15
            WHEN 'medium' THEN 5
            ELSE 0
        END
        -- Blocked tasks penalty
        + LEAST(20, COALESCE(ls_hard.blocked_count, 0) * 5)
        -- Failed tasks penalty
        + LEAST(15, COALESCE(ls_hard.failed_count, 0) * 8)
        -- Slippage trend penalty
        + CASE
            WHEN sl.snapshot_count > 0 AND sl.slippage_count > 0
            THEN LEAST(15, ROUND((sl.slippage_count::numeric / sl.snapshot_count) * 20))
            ELSE 0
        END
    ))::smallint AS hard_close_breach_pct,
    -- Soft close breach probability (same formula with soft targets)
    LEAST(100, GREATEST(0,
        CASE
            WHEN ls_soft.predicted_ready_at IS NULL THEN 50
            WHEN EXTRACT(EPOCH FROM (cal.soft_close_target::timestamp - ls_soft.predicted_ready_at)) < 0 THEN 95
            WHEN EXTRACT(EPOCH FROM (cal.soft_close_target::timestamp - ls_soft.predicted_ready_at)) / 3600.0 < 4 THEN 75
            WHEN EXTRACT(EPOCH FROM (cal.soft_close_target::timestamp - ls_soft.predicted_ready_at)) / 3600.0 < 12 THEN 50
            WHEN EXTRACT(EPOCH FROM (cal.soft_close_target::timestamp - ls_soft.predicted_ready_at)) / 3600.0 < 24 THEN 30
            ELSE 10
        END
        + CASE ls_soft.confidence WHEN 'low' THEN 15 WHEN 'medium' THEN 5 ELSE 0 END
        + LEAST(15, COALESCE(ls_soft.blocked_count, 0) * 5)
    ))::smallint AS soft_close_breach_pct,
    -- Risk tier
    CASE
        WHEN LEAST(100, GREATEST(0,
            CASE
                WHEN ls_hard.predicted_ready_at IS NULL THEN 50
                WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) < 0 THEN 95
                ELSE 15
            END)) >= 70 THEN 'CRITICAL'
        WHEN LEAST(100, GREATEST(0,
            CASE
                WHEN ls_hard.predicted_ready_at IS NULL THEN 50
                WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 12 THEN 60
                ELSE 20
            END)) >= 50 THEN 'HIGH'
        WHEN LEAST(100, GREATEST(0,
            CASE
                WHEN ls_hard.predicted_ready_at IS NULL THEN 50
                WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 24 THEN 35
                ELSE 10
            END)) >= 30 THEN 'MEDIUM'
        ELSE 'LOW'
    END AS risk_tier,
    -- Metadata
    ls_hard.snapshot_at         AS last_snapshot_at,
    COALESCE(sl.slippage_count, 0)  AS slippage_count,
    COALESCE(sl.snapshot_count, 0)  AS total_snapshots
FROM current_run cr
LEFT JOIN calendar cal
    ON cal.tenant_id = cr.tenant_id AND cal.entity_code = cr.entity_code
    AND cal.fiscal_year = cr.fiscal_year AND cal.period_number = cr.period_number
LEFT JOIN latest_snapshot ls_soft
    ON ls_soft.run_id = cr.run_id AND ls_soft.target_status = 'SOFT_CLOSE'
LEFT JOIN latest_snapshot ls_hard
    ON ls_hard.run_id = cr.run_id AND ls_hard.target_status = 'HARD_CLOSE'
LEFT JOIN slippage sl ON sl.run_id = cr.run_id;

COMMENT ON VIEW fin.vw_sla_breach_forecast IS
    'SLA breach probability forecast per entity/period. Uses prediction buffer, confidence, blockers, failures, and slippage trend to compute 0-100 breach probability and risk tier.';

-- ============================================================================
-- 2. fin.vw_cross_entity_risk_ranking — Composite risk score across entities
-- ============================================================================
-- Ranks all open close runs by composite risk combining:
-- SLA proximity, override count, exception severity, blocked tasks,
-- document health, risk signal count, and prediction confidence.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_cross_entity_risk_ranking CASCADE;
CREATE OR REPLACE VIEW fin.vw_cross_entity_risk_ranking AS
SELECT
    es.tenant_id,
    es.entity_code,
    es.fiscal_year,
    es.period_number,
    es.run_status,
    es.close_type,
    es.sla_status,
    es.days_remaining,
    es.readiness_score,
    es.completion_pct,
    es.total_overrides,
    es.pending_overrides,
    CAST(es.override_impact_total AS varchar) AS override_impact_total,
    es.total_exceptions,
    es.open_exceptions,
    es.critical_exceptions,
    es.doc_health_score,
    es.doc_health_rating,
    es.remediation_total,
    es.remediation_pending,
    -- Active risk signals count
    COALESCE(rs.active_signal_count, 0) AS active_signal_count,
    COALESCE(rs.critical_signal_count, 0) AS critical_signal_count,
    -- Composite risk score (0-100, higher = more at risk)
    LEAST(100, GREATEST(0,
        -- SLA proximity: at_risk=25, breached=40
        CASE es.sla_status
            WHEN 'BREACHED' THEN 40
            WHEN 'AT_RISK' THEN 25
            WHEN 'MET' THEN 0
            ELSE CASE
                WHEN es.days_remaining IS NOT NULL AND es.days_remaining <= 1 THEN 30
                WHEN es.days_remaining IS NOT NULL AND es.days_remaining <= 3 THEN 15
                ELSE 5
            END
        END
        -- Override burden: up to 15 points
        + LEAST(15, COALESCE(es.total_overrides, 0) * 3)
        -- Exception severity: up to 20 points
        + LEAST(20, COALESCE(es.critical_exceptions, 0) * 10 + COALESCE(es.open_exceptions, 0) * 3)
        -- Document health: poor health adds risk
        + CASE es.doc_health_rating
            WHEN 'RED' THEN 15
            WHEN 'AMBER' THEN 8
            ELSE 0
        END
        -- Risk signals: up to 15 points
        + LEAST(15, COALESCE(rs.critical_signal_count, 0) * 8 + COALESCE(rs.active_signal_count, 0) * 2)
        -- Completion gap: lower completion = higher risk
        + CASE
            WHEN es.completion_pct IS NOT NULL AND es.completion_pct < 50 THEN 10
            WHEN es.completion_pct IS NOT NULL AND es.completion_pct < 75 THEN 5
            ELSE 0
        END
        -- Remediation backlog
        + LEAST(10, COALESCE(es.remediation_pending, 0) * 2)
    ))::smallint AS composite_risk_score,
    -- Risk rank (computed by ordering)
    RANK() OVER (
        PARTITION BY es.tenant_id
        ORDER BY LEAST(100, GREATEST(0,
            CASE es.sla_status WHEN 'BREACHED' THEN 40 WHEN 'AT_RISK' THEN 25 ELSE 5 END
            + LEAST(15, COALESCE(es.total_overrides, 0) * 3)
            + LEAST(20, COALESCE(es.critical_exceptions, 0) * 10 + COALESCE(es.open_exceptions, 0) * 3)
            + CASE es.doc_health_rating WHEN 'RED' THEN 15 WHEN 'AMBER' THEN 8 ELSE 0 END
            + LEAST(15, COALESCE(rs.critical_signal_count, 0) * 8 + COALESCE(rs.active_signal_count, 0) * 2)
            + CASE WHEN es.completion_pct < 50 THEN 10 WHEN es.completion_pct < 75 THEN 5 ELSE 0 END
            + LEAST(10, COALESCE(es.remediation_pending, 0) * 2)
        )) DESC
    )::smallint AS risk_rank
FROM fin.vw_close_executive_summary es
LEFT JOIN (
    SELECT
        sig.tenant_id,
        sig.entity_code,
        sig.fiscal_year,
        sig.period_number,
        COUNT(*) AS active_signal_count,
        COUNT(*) FILTER (WHERE r.severity = 'critical') AS critical_signal_count
    FROM fin.close_risk_signal sig
    JOIN fin.close_risk_rule r ON r.id = sig.rule_id
    WHERE sig.signal_state IN ('fired', 'acknowledged')
    GROUP BY sig.tenant_id, sig.entity_code, sig.fiscal_year, sig.period_number
) rs ON rs.tenant_id = es.tenant_id AND rs.entity_code = es.entity_code
    AND rs.fiscal_year = es.fiscal_year AND rs.period_number = es.period_number
WHERE es.run_status NOT IN ('HARD_CLOSED');

COMMENT ON VIEW fin.vw_cross_entity_risk_ranking IS
    'Cross-entity risk ranking for all open close runs. Composite risk score from SLA proximity, overrides, exceptions, document health, risk signals, completion gap, and remediation backlog.';

-- ============================================================================
-- 3. fin.vw_defect_delay_correlation — Document defects correlated with delays
-- ============================================================================
-- Joins document health defects to close task duration data to identify
-- which defect classes are most predictive of close delays.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_defect_delay_correlation CASCADE;
CREATE OR REPLACE VIEW fin.vw_defect_delay_correlation AS
WITH defect_counts AS (
    SELECT
        fd.tenant_id,
        fd.entity_code,
        fd.fiscal_year,
        fd.period_number,
        -- Defect categories from document health view
        COUNT(*) FILTER (WHERE fd.status IN ('DRAFT', 'IN_REVIEW')) AS unposted_count,
        COUNT(*) FILTER (WHERE fd.je_id IS NULL AND fd.status NOT IN ('CANCELLED', 'VOIDED', 'REVERSED'))
            AS missing_je_count,
        COUNT(*) FILTER (WHERE fd.status = 'REVERSED') AS reversed_count,
        COUNT(*) FILTER (WHERE fd.approval_route = 'BLOCKED') AS blocked_approval_count,
        COUNT(*) AS total_docs
    FROM fin.financial_document fd
    GROUP BY fd.tenant_id, fd.entity_code, fd.fiscal_year, fd.period_number
),
close_outcomes AS (
    SELECT
        r.tenant_id,
        r.entity_code,
        r.fiscal_year,
        r.period_number,
        r.status AS run_status,
        c.close_type,
        c.target_working_days,
        c.actual_working_days,
        CASE
            WHEN c.hard_close_actual IS NOT NULL AND c.hard_close_actual <= c.hard_close_target THEN true
            WHEN c.hard_close_actual IS NOT NULL THEN false
            ELSE NULL
        END AS sla_met,
        CASE
            WHEN c.hard_close_actual IS NOT NULL
            THEN (c.hard_close_actual - c.close_start_date)
            ELSE NULL
        END AS actual_close_days
    FROM fin.close_run r
    JOIN fin.close_calendar c
        ON c.tenant_id = r.tenant_id AND c.entity_code = r.entity_code
        AND c.fiscal_year = r.fiscal_year AND c.period_number = r.period_number
    WHERE r.status NOT IN ('CANCELLED')
),
health_scores AS (
    SELECT
        h.tenant_id,
        h.entity_code,
        h.fiscal_year,
        h.period_number,
        h.health_score,
        h.health_rating
    FROM fin.v_document_health_score h
)
SELECT
    dc.tenant_id,
    dc.entity_code,
    dc.fiscal_year,
    dc.period_number,
    co.close_type,
    co.run_status,
    -- Defect counts
    dc.total_docs,
    dc.unposted_count,
    dc.missing_je_count,
    dc.reversed_count,
    dc.blocked_approval_count,
    -- Defect rates
    CASE WHEN dc.total_docs > 0
        THEN ROUND((dc.unposted_count::numeric / dc.total_docs) * 100, 1)
        ELSE 0 END AS unposted_rate,
    CASE WHEN dc.total_docs > 0
        THEN ROUND((dc.missing_je_count::numeric / dc.total_docs) * 100, 1)
        ELSE 0 END AS missing_je_rate,
    CASE WHEN dc.total_docs > 0
        THEN ROUND((dc.reversed_count::numeric / dc.total_docs) * 100, 1)
        ELSE 0 END AS reversal_rate,
    CASE WHEN dc.total_docs > 0
        THEN ROUND((dc.blocked_approval_count::numeric / dc.total_docs) * 100, 1)
        ELSE 0 END AS blocked_approval_rate,
    -- Close outcome
    co.sla_met,
    co.actual_close_days,
    co.target_working_days,
    CASE
        WHEN co.actual_close_days IS NOT NULL AND co.target_working_days IS NOT NULL
        THEN co.actual_close_days - co.target_working_days
        ELSE NULL
    END AS days_over_target,
    -- Health
    hs.health_score,
    hs.health_rating
FROM defect_counts dc
LEFT JOIN close_outcomes co
    ON co.tenant_id = dc.tenant_id AND co.entity_code = dc.entity_code
    AND co.fiscal_year = dc.fiscal_year AND co.period_number = dc.period_number
LEFT JOIN health_scores hs
    ON hs.tenant_id = dc.tenant_id AND hs.entity_code = dc.entity_code
    AND hs.fiscal_year = dc.fiscal_year AND hs.period_number = dc.period_number;

COMMENT ON VIEW fin.vw_defect_delay_correlation IS
    'Document defect counts and rates correlated with close outcomes. Identifies which defect classes (unposted, missing JE, reversals, blocked approvals) predict close delays.';

-- ============================================================================
-- 4. fin.vw_remediation_completion_forecast — Campaign completion probability
-- ============================================================================
-- Projects remediation campaign completion from current action completion rates.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_remediation_completion_forecast CASCADE;
CREATE OR REPLACE VIEW fin.vw_remediation_completion_forecast AS
SELECT
    c.tenant_id,
    c.entity_code,
    c.fiscal_year,
    c.period_number,
    c.id                AS campaign_id,
    c.campaign_code,
    c.campaign_name,
    c.status            AS campaign_status,
    c.total_actions,
    -- Action status breakdown
    COUNT(*) FILTER (WHERE a.status = 'COMPLETED')  AS completed_actions,
    COUNT(*) FILTER (WHERE a.status = 'EXECUTING')  AS executing_actions,
    COUNT(*) FILTER (WHERE a.status = 'APPROVED')   AS approved_actions,
    COUNT(*) FILTER (WHERE a.status = 'SUGGESTED')  AS suggested_actions,
    COUNT(*) FILTER (WHERE a.status = 'FAILED')     AS failed_actions,
    COUNT(*) FILTER (WHERE a.status = 'REJECTED')   AS rejected_actions,
    -- Completion rate
    CASE WHEN c.total_actions > 0
        THEN ROUND(
            (COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::numeric / c.total_actions) * 100, 1
        )
        ELSE 0 END AS completion_pct,
    -- Effective actions (completed + excluded from scope)
    CASE WHEN c.total_actions > 0
        THEN ROUND(
            ((COUNT(*) FILTER (WHERE a.status IN ('COMPLETED', 'REJECTED')))::numeric / c.total_actions) * 100, 1
        )
        ELSE 0 END AS resolved_pct,
    -- Completion probability (heuristic: based on current velocity and remaining)
    CASE
        -- Already done or cancelled
        WHEN c.status IN ('COMPLETED', 'CANCELLED') THEN 100
        WHEN c.total_actions = 0 THEN 100
        -- All remaining are approved or executing (high probability)
        WHEN COUNT(*) FILTER (WHERE a.status IN ('SUGGESTED')) = 0
            AND COUNT(*) FILTER (WHERE a.status = 'FAILED') = 0 THEN 90
        -- Has failures (lower probability)
        WHEN COUNT(*) FILTER (WHERE a.status = 'FAILED') > 0
            THEN GREATEST(10, 80 - (COUNT(*) FILTER (WHERE a.status = 'FAILED') * 15))
        -- Normal: scale by completion progress
        ELSE GREATEST(10, ROUND(
            (COUNT(*) FILTER (WHERE a.status IN ('COMPLETED', 'APPROVED', 'EXECUTING'))::numeric
             / c.total_actions) * 100, 0
        ))
    END::smallint AS completion_probability,
    -- Risk assessment
    CASE
        WHEN c.status IN ('COMPLETED', 'CANCELLED') THEN 'COMPLETE'
        WHEN COUNT(*) FILTER (WHERE a.status = 'FAILED') > 0 THEN 'AT_RISK'
        WHEN COUNT(*) FILTER (WHERE a.status IN ('SUGGESTED', 'APPROVED')) >
             COUNT(*) FILTER (WHERE a.status = 'COMPLETED') THEN 'IN_PROGRESS'
        ELSE 'ON_TRACK'
    END AS forecast_status,
    c.created_at,
    c.updated_at
FROM fin.remediation_campaign c
LEFT JOIN fin.document_remediation_action a ON a.campaign_id = c.id
GROUP BY c.id, c.tenant_id, c.entity_code, c.fiscal_year, c.period_number,
         c.campaign_code, c.campaign_name, c.status, c.total_actions,
         c.created_at, c.updated_at;

COMMENT ON VIEW fin.vw_remediation_completion_forecast IS
    'Remediation campaign completion probability forecast. Projects outcomes from current action completion rates, failure counts, and approval status.';

-- ============================================================================
-- 5. fin.vw_override_failure_correlation — Override patterns vs close outcomes
-- ============================================================================
-- Analyzes which override patterns (scope, reason, count) correlate with
-- failed close outcomes (SLA breaches, reopens).
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_override_failure_correlation CASCADE;
CREATE OR REPLACE VIEW fin.vw_override_failure_correlation AS
WITH close_outcomes AS (
    SELECT
        r.tenant_id,
        r.entity_code,
        r.fiscal_year,
        r.period_number,
        r.id AS run_id,
        r.status AS run_status,
        CASE
            WHEN c.hard_close_actual IS NOT NULL AND c.hard_close_actual > c.hard_close_target THEN true
            ELSE false
        END AS sla_breached,
        CASE
            WHEN r.status = 'REOPENED' THEN true
            ELSE false
        END AS was_reopened
    FROM fin.close_run r
    LEFT JOIN fin.close_calendar c
        ON c.tenant_id = r.tenant_id AND c.entity_code = r.entity_code
        AND c.fiscal_year = r.fiscal_year AND c.period_number = r.period_number
    WHERE r.status NOT IN ('CANCELLED')
),
override_agg AS (
    SELECT
        o.tenant_id,
        co.entity_code,
        co.fiscal_year,
        co.period_number,
        co.run_status,
        co.sla_breached,
        co.was_reopened,
        COUNT(*) AS total_overrides,
        COUNT(*) FILTER (WHERE o.override_scope = 'GATE') AS gate_overrides,
        COUNT(*) FILTER (WHERE o.override_scope = 'CATEGORY') AS category_overrides,
        COUNT(*) FILTER (WHERE o.override_scope = 'TASK') AS task_overrides,
        COUNT(*) FILTER (WHERE o.reason_code = 'IMMATERIAL') AS reason_immaterial,
        COUNT(*) FILTER (WHERE o.reason_code = 'TIMING') AS reason_timing,
        COUNT(*) FILTER (WHERE o.reason_code IN ('SYSTEM_ISSUE', 'PROCESS_GAP')) AS reason_systemic,
        COUNT(*) FILTER (WHERE o.reason_code = 'MANAGEMENT_JUDGEMENT') AS reason_judgement,
        COALESCE(SUM(o.impact_amount) FILTER (WHERE o.status = 'APPROVED'), 0) AS total_impact
    FROM close_outcomes co
    JOIN fin.close_override o ON o.run_id = co.run_id AND o.tenant_id = co.tenant_id
    GROUP BY o.tenant_id, co.entity_code, co.fiscal_year, co.period_number,
             co.run_status, co.sla_breached, co.was_reopened
)
SELECT
    oa.*,
    -- Risk indicators
    CASE
        WHEN oa.gate_overrides > 0 AND oa.sla_breached THEN 'GATE_BREACH_CORRELATION'
        WHEN oa.gate_overrides > 0 THEN 'GATE_OVERRIDE_PRESENT'
        WHEN oa.total_overrides > 3 AND oa.sla_breached THEN 'HIGH_OVERRIDE_BREACH'
        WHEN oa.total_overrides > 3 THEN 'HIGH_OVERRIDE_COUNT'
        WHEN oa.sla_breached THEN 'BREACH_NO_OVERRIDES'
        ELSE 'NORMAL'
    END AS pattern_classification,
    -- Failure indicator for aggregation
    CASE WHEN oa.sla_breached OR oa.was_reopened THEN true ELSE false END AS close_failed
FROM override_agg oa;

COMMENT ON VIEW fin.vw_override_failure_correlation IS
    'Override patterns correlated with close outcomes. Identifies which override scopes, reasons, and counts predict SLA breaches and reopens.';

-- ============================================================================
-- 6. fin.vw_action_effectiveness — Recommendation action effectiveness
-- ============================================================================
-- Measures which recommended action types actually improve close outcomes.
-- Uses close_action_log.was_effective and execution_result.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_action_effectiveness CASCADE;
CREATE OR REPLACE VIEW fin.vw_action_effectiveness AS
SELECT
    al.tenant_id,
    al.entity_code,
    p.trigger_type,
    al.action_type,
    p.execution_mode,
    -- Counts
    COUNT(*) AS total_actions,
    COUNT(*) FILTER (WHERE al.status = 'executed') AS executed_count,
    COUNT(*) FILTER (WHERE al.status = 'accepted') AS accepted_count,
    COUNT(*) FILTER (WHERE al.status = 'dismissed') AS dismissed_count,
    COUNT(*) FILTER (WHERE al.was_effective = true) AS effective_count,
    COUNT(*) FILTER (WHERE al.was_effective = false) AS ineffective_count,
    COUNT(*) FILTER (WHERE al.was_effective IS NULL AND al.status = 'executed') AS pending_outcome_count,
    -- Effectiveness rate
    CASE WHEN COUNT(*) FILTER (WHERE al.was_effective IS NOT NULL) > 0
        THEN ROUND(
            (COUNT(*) FILTER (WHERE al.was_effective = true)::numeric /
             COUNT(*) FILTER (WHERE al.was_effective IS NOT NULL)) * 100, 1
        )
        ELSE NULL
    END AS effectiveness_pct,
    -- Acceptance rate (accepted+executed vs total proposed)
    CASE WHEN COUNT(*) > 0
        THEN ROUND(
            (COUNT(*) FILTER (WHERE al.status IN ('accepted', 'executed'))::numeric / COUNT(*)) * 100, 1
        )
        ELSE NULL
    END AS acceptance_pct,
    -- Average time to decision (hours)
    ROUND(AVG(
        EXTRACT(EPOCH FROM (al.decided_at - al.proposed_at)) / 3600.0
    ) FILTER (WHERE al.decided_at IS NOT NULL), 1) AS avg_decision_hours,
    -- Sample size indicator
    CASE
        WHEN COUNT(*) >= 20 THEN 'HIGH'
        WHEN COUNT(*) >= 5 THEN 'MEDIUM'
        ELSE 'LOW'
    END AS sample_confidence
FROM fin.close_action_log al
JOIN fin.close_action_policy p ON p.id = al.policy_id
GROUP BY al.tenant_id, al.entity_code, p.trigger_type, al.action_type, p.execution_mode;

COMMENT ON VIEW fin.vw_action_effectiveness IS
    'Recommendation action effectiveness metrics. Shows which action types improve close outcomes, with acceptance rates and time-to-decision. Grouped by trigger type, action type, and execution mode.';
