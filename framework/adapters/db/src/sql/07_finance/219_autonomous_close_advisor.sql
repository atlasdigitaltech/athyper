/* ============================================================================
   Athyper v2.9 — Autonomous Close Advisor
   Schema: fin
   Dependencies: 202_close_orchestration.sql (close_calendar, close_run,
                  close_readiness_snapshot, close_orchestration_snapshot)
                 204_governance_lifecycle.sql (close_override, close_override_activity)
                 205_close_risk_signals.sql (close_risk_signal, close_risk_rule)
                 210_atlas_anomaly.sql (atlas_anomaly)
                 211_close_action_policies.sql (close_action_policy, close_action_log,
                  vw_close_bottleneck_pattern)
                 214_document_health_reconciliation.sql
                 215_remediation_campaigns.sql (remediation_campaign, v_campaign_progress)
                 216_close_control_tower.sql (vw_close_executive_summary)
                 218_close_predictive_intelligence.sql (vw_sla_breach_forecast,
                  vw_cross_entity_risk_ranking, vw_remediation_completion_forecast)

   Phase 10: Autonomous Close Advisor views.
   Composes existing tables and views into 6 advisor capabilities:

   1. Remediation Campaign Advisor   — ranked campaigns with urgency and SLA impact
   2. Auto-Prioritized Defect Queue  — pending actions ranked by severity × SLA urgency
   3. Completion Forecast            — predicted close date vs calendar targets
   4. Override Risk Posture          — current vs suggested override limits
   5. Entity Close Risk Heatmap      — color-tiered cross-entity risk grid
   6. Controller Alert Inbox         — unified critical alerts across all signal types

   All views are computed from existing tables — no new tables required.
   ============================================================================ */

-- ============================================================================
-- 1. fin.vw_advisor_remediation_campaigns — Ranked campaigns with urgency
-- ============================================================================
-- Enriches v_campaign_progress with SLA urgency, defect counts, and completion
-- forecast from Phase 9B. Ranks campaigns by a composite urgency score.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_advisor_remediation_campaigns CASCADE;
CREATE OR REPLACE VIEW fin.vw_advisor_remediation_campaigns AS
WITH campaign_base AS (
    SELECT
        cp.campaign_id,
        cp.tenant_id,
        cp.entity_code,
        cp.fiscal_year,
        cp.period_number,
        cp.campaign_name,
        cp.action_type,
        cp.campaign_status,
        cp.risk_level,
        cp.total_actions,
        cp.live_completed,
        cp.live_failed,
        cp.live_executing,
        cp.live_pending,
        cp.completion_pct,
        cp.created_by,
        cp.created_at,
        cp.approved_by,
        cp.approved_at,
        cp.executed_at,
        cp.completed_at
    FROM fin.v_campaign_progress cp
    WHERE cp.campaign_status NOT IN ('CANCELLED', 'COMPLETED')
),
forecast AS (
    SELECT
        rcf.tenant_id,
        rcf.entity_code,
        rcf.fiscal_year,
        rcf.period_number,
        rcf.campaign_id,
        rcf.completion_probability,
        rcf.forecast_status
    FROM fin.vw_remediation_completion_forecast rcf
),
sla_context AS (
    SELECT
        bf.tenant_id,
        bf.entity_code,
        bf.fiscal_year,
        bf.period_number,
        bf.hard_close_breach_pct,
        bf.hard_close_buffer_hours,
        bf.risk_tier AS sla_risk_tier
    FROM fin.vw_sla_breach_forecast bf
)
SELECT
    cb.campaign_id,
    cb.tenant_id,
    cb.entity_code,
    cb.fiscal_year,
    cb.period_number,
    cb.campaign_name,
    cb.action_type,
    cb.campaign_status,
    cb.risk_level,
    cb.total_actions,
    cb.live_completed,
    cb.live_failed,
    cb.live_executing,
    cb.live_pending,
    cb.completion_pct,
    -- Forecast
    COALESCE(fc.completion_probability, 0) AS completion_probability,
    COALESCE(fc.forecast_status, 'UNKNOWN') AS forecast_status,
    -- SLA context
    COALESCE(sc.hard_close_breach_pct, 0) AS sla_breach_pct,
    sc.hard_close_buffer_hours,
    COALESCE(sc.sla_risk_tier, 'LOW') AS sla_risk_tier,
    -- Composite urgency score (0-100, higher = more urgent)
    LEAST(100, GREATEST(0,
        -- Campaign failures add urgency
        LEAST(30, cb.live_failed * 10)
        -- Low completion probability adds urgency
        + CASE
            WHEN COALESCE(fc.completion_probability, 50) < 30 THEN 25
            WHEN COALESCE(fc.completion_probability, 50) < 60 THEN 15
            WHEN COALESCE(fc.completion_probability, 50) < 80 THEN 5
            ELSE 0
        END
        -- SLA proximity adds urgency
        + CASE COALESCE(sc.sla_risk_tier, 'LOW')
            WHEN 'CRITICAL' THEN 30
            WHEN 'HIGH' THEN 20
            WHEN 'MEDIUM' THEN 10
            ELSE 0
        END
        -- Risk level of campaign itself
        + CASE cb.risk_level
            WHEN 'CRITICAL' THEN 15
            WHEN 'HIGH' THEN 10
            WHEN 'MEDIUM' THEN 5
            ELSE 0
        END
    ))::smallint AS urgency_score,
    -- Audit
    cb.created_by,
    cb.created_at,
    cb.approved_by,
    cb.approved_at,
    cb.executed_at,
    cb.completed_at
FROM campaign_base cb
LEFT JOIN forecast fc
    ON fc.campaign_id = cb.campaign_id
    AND fc.tenant_id = cb.tenant_id
LEFT JOIN sla_context sc
    ON sc.tenant_id = cb.tenant_id AND sc.entity_code = cb.entity_code
    AND sc.fiscal_year = cb.fiscal_year AND sc.period_number = cb.period_number
ORDER BY LEAST(100, GREATEST(0,
    LEAST(30, cb.live_failed * 10)
    + CASE WHEN COALESCE(fc.completion_probability, 50) < 30 THEN 25
           WHEN COALESCE(fc.completion_probability, 50) < 60 THEN 15
           ELSE 0 END
    + CASE COALESCE(sc.sla_risk_tier, 'LOW')
        WHEN 'CRITICAL' THEN 30 WHEN 'HIGH' THEN 20 ELSE 0 END
)) DESC;

COMMENT ON VIEW fin.vw_advisor_remediation_campaigns IS
    'Phase 10: Ranked remediation campaigns with urgency scoring. Combines campaign progress, completion forecast, and SLA proximity into a composite urgency score.';

-- ============================================================================
-- 2. fin.vw_advisor_defect_queue — Auto-prioritized pending actions
-- ============================================================================
-- Ranks pending close recommendations by severity, priority, SLA urgency,
-- and bottleneck recurrence pattern into a single prioritized queue.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_advisor_defect_queue CASCADE;
CREATE OR REPLACE VIEW fin.vw_advisor_defect_queue AS
WITH pending_actions AS (
    SELECT
        al.id AS action_id,
        al.tenant_id,
        al.entity_code,
        al.fiscal_year,
        al.period_number,
        al.policy_code,
        al.action_type,
        al.action_params,
        al.trigger_context,
        al.status,
        al.proposed_at,
        al.fingerprint,
        p.policy_name,
        p.trigger_type,
        p.severity,
        p.priority,
        p.execution_mode
    FROM fin.close_action_log al
    JOIN fin.close_action_policy p ON p.id = al.policy_id
    WHERE al.status = 'proposed'
),
sla_context AS (
    SELECT
        bf.tenant_id,
        bf.entity_code,
        bf.fiscal_year,
        bf.period_number,
        bf.hard_close_breach_pct,
        bf.risk_tier
    FROM fin.vw_sla_breach_forecast bf
),
bottleneck_context AS (
    SELECT
        bp.tenant_id,
        bp.entity_code,
        bp.task_code,
        bp.pattern_classification,
        bp.bottleneck_frequency_pct
    FROM fin.vw_close_bottleneck_pattern bp
)
SELECT
    pa.action_id,
    pa.tenant_id,
    pa.entity_code,
    pa.fiscal_year,
    pa.period_number,
    pa.policy_code,
    pa.policy_name,
    pa.trigger_type,
    pa.action_type,
    pa.severity,
    pa.priority,
    pa.execution_mode,
    pa.action_params,
    pa.trigger_context,
    pa.proposed_at,
    -- SLA context
    COALESCE(sc.hard_close_breach_pct, 0) AS sla_breach_pct,
    COALESCE(sc.risk_tier, 'LOW') AS sla_risk_tier,
    -- Bottleneck context (if trigger_context references a task)
    bc.pattern_classification AS bottleneck_pattern,
    bc.bottleneck_frequency_pct,
    -- Hours since proposed
    ROUND(EXTRACT(EPOCH FROM (now() - pa.proposed_at)) / 3600.0, 1) AS hours_pending,
    -- Composite priority score (0-100, higher = more urgent)
    LEAST(100, GREATEST(0,
        -- Severity weight
        CASE pa.severity
            WHEN 'critical' THEN 40
            WHEN 'high' THEN 25
            WHEN 'medium' THEN 10
            WHEN 'low' THEN 5
            ELSE 0
        END
        -- Policy priority (inverse: 1=highest → +20, 100=lowest → 0)
        + GREATEST(0, 20 - (pa.priority / 5))
        -- SLA urgency
        + CASE COALESCE(sc.risk_tier, 'LOW')
            WHEN 'CRITICAL' THEN 25
            WHEN 'HIGH' THEN 15
            WHEN 'MEDIUM' THEN 8
            ELSE 0
        END
        -- Bottleneck recurrence
        + CASE bc.pattern_classification
            WHEN 'chronic' THEN 15
            WHEN 'frequent' THEN 10
            WHEN 'recurring' THEN 5
            ELSE 0
        END
        -- Aging penalty (>24h pending = +5, >48h = +10)
        + CASE
            WHEN EXTRACT(EPOCH FROM (now() - pa.proposed_at)) / 3600.0 > 48 THEN 10
            WHEN EXTRACT(EPOCH FROM (now() - pa.proposed_at)) / 3600.0 > 24 THEN 5
            ELSE 0
        END
    ))::smallint AS queue_priority_score
FROM pending_actions pa
LEFT JOIN sla_context sc
    ON sc.tenant_id = pa.tenant_id AND sc.entity_code = pa.entity_code
    AND sc.fiscal_year = pa.fiscal_year AND sc.period_number = pa.period_number
LEFT JOIN bottleneck_context bc
    ON bc.tenant_id = pa.tenant_id AND bc.entity_code = pa.entity_code
    AND bc.task_code = pa.trigger_context->>'taskCode'
ORDER BY LEAST(100, GREATEST(0,
    CASE pa.severity WHEN 'critical' THEN 40 WHEN 'high' THEN 25 ELSE 10 END
    + CASE COALESCE(sc.risk_tier, 'LOW') WHEN 'CRITICAL' THEN 25 WHEN 'HIGH' THEN 15 ELSE 0 END
)) DESC, pa.proposed_at ASC;

COMMENT ON VIEW fin.vw_advisor_defect_queue IS
    'Phase 10: Auto-prioritized defect queue. Ranks pending close recommendations by severity, SLA urgency, bottleneck recurrence, and aging into a single priority score.';

-- ============================================================================
-- 3. fin.vw_advisor_completion_forecast — Predicted close completion vs targets
-- ============================================================================
-- Consolidates latest orchestration snapshot prediction with calendar targets,
-- breach probability, and trend data into a single completion forecast strip.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_advisor_completion_forecast CASCADE;
CREATE OR REPLACE VIEW fin.vw_advisor_completion_forecast AS
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
-- Previous snapshot for trend detection
prev_snapshot AS (
    SELECT DISTINCT ON (s.run_id, s.target_status)
        s.run_id,
        s.target_status,
        s.predicted_ready_at AS prev_predicted_at,
        s.confidence AS prev_confidence,
        s.snapshot_at AS prev_snapshot_at
    FROM fin.close_orchestration_snapshot s
    JOIN latest_snapshot ls ON ls.run_id = s.run_id
        AND ls.target_status = s.target_status
        AND s.snapshot_at < ls.snapshot_at
    ORDER BY s.run_id, s.target_status, s.snapshot_at DESC
),
calendar AS (
    SELECT
        c.tenant_id,
        c.entity_code,
        c.fiscal_year,
        c.period_number,
        c.close_type,
        c.close_start_date,
        c.soft_close_target,
        c.hard_close_target,
        c.target_working_days
    FROM fin.close_calendar c
),
breach AS (
    SELECT
        bf.tenant_id,
        bf.entity_code,
        bf.fiscal_year,
        bf.period_number,
        bf.hard_close_breach_pct,
        bf.soft_close_breach_pct,
        bf.risk_tier,
        bf.slippage_count,
        bf.total_snapshots
    FROM fin.vw_sla_breach_forecast bf
)
SELECT
    cr.tenant_id,
    cr.entity_code,
    cr.fiscal_year,
    cr.period_number,
    cr.run_status,
    cal.close_type,
    cr.started_at,
    -- Calendar targets
    cal.soft_close_target,
    cal.hard_close_target,
    cal.target_working_days,
    -- Current prediction
    ls_hard.predicted_ready_at  AS hard_predicted_at,
    ls_hard.confidence          AS hard_confidence,
    ls_hard.critical_path_minutes,
    ls_soft.predicted_ready_at  AS soft_predicted_at,
    ls_soft.confidence          AS soft_confidence,
    -- Progress
    ls_hard.total_tasks,
    ls_hard.satisfied_count,
    ls_hard.blocked_count,
    ls_hard.failed_count,
    CASE WHEN ls_hard.total_tasks > 0
        THEN ROUND((ls_hard.satisfied_count::numeric / ls_hard.total_tasks) * 100, 1)
        ELSE 0 END AS completion_pct,
    -- Delta from target (positive = ahead, negative = behind)
    CASE
        WHEN ls_hard.predicted_ready_at IS NOT NULL AND cal.hard_close_target IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0, 1)
        ELSE NULL
    END AS hard_buffer_hours,
    CASE
        WHEN ls_soft.predicted_ready_at IS NOT NULL AND cal.soft_close_target IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (cal.soft_close_target::timestamp - ls_soft.predicted_ready_at)) / 3600.0, 1)
        ELSE NULL
    END AS soft_buffer_hours,
    -- Trend: is prediction slipping or improving?
    CASE
        WHEN ps.prev_predicted_at IS NULL THEN 'NO_HISTORY'
        WHEN ls_hard.predicted_ready_at > ps.prev_predicted_at THEN 'SLIPPING'
        WHEN ls_hard.predicted_ready_at < ps.prev_predicted_at THEN 'IMPROVING'
        ELSE 'STABLE'
    END AS prediction_trend,
    CASE
        WHEN ps.prev_predicted_at IS NOT NULL AND ls_hard.predicted_ready_at IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (ls_hard.predicted_ready_at - ps.prev_predicted_at)) / 3600.0, 1)
        ELSE NULL
    END AS trend_shift_hours,
    -- Confidence trend
    CASE
        WHEN ps.prev_confidence IS NULL THEN 'NO_HISTORY'
        WHEN ls_hard.confidence = 'high' AND ps.prev_confidence != 'high' THEN 'IMPROVING'
        WHEN ls_hard.confidence = 'low' AND ps.prev_confidence != 'low' THEN 'DEGRADING'
        WHEN ls_hard.confidence = ps.prev_confidence THEN 'STABLE'
        ELSE 'CHANGED'
    END AS confidence_trend,
    -- Breach probability
    COALESCE(br.hard_close_breach_pct, 0) AS hard_breach_pct,
    COALESCE(br.soft_close_breach_pct, 0) AS soft_breach_pct,
    COALESCE(br.risk_tier, 'LOW') AS risk_tier,
    COALESCE(br.slippage_count, 0) AS slippage_count,
    -- Forecast assessment
    CASE
        WHEN ls_hard.predicted_ready_at IS NULL THEN 'NO_PREDICTION'
        WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) < 0 THEN 'WILL_BREACH'
        WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 4 THEN 'CRITICAL'
        WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 12 THEN 'TIGHT'
        WHEN EXTRACT(EPOCH FROM (cal.hard_close_target::timestamp - ls_hard.predicted_ready_at)) / 3600.0 < 24 THEN 'ADEQUATE'
        ELSE 'COMFORTABLE'
    END AS forecast_assessment,
    -- Metadata
    ls_hard.snapshot_at AS last_snapshot_at,
    ps.prev_snapshot_at
FROM current_run cr
LEFT JOIN calendar cal
    ON cal.tenant_id = cr.tenant_id AND cal.entity_code = cr.entity_code
    AND cal.fiscal_year = cr.fiscal_year AND cal.period_number = cr.period_number
LEFT JOIN latest_snapshot ls_soft
    ON ls_soft.run_id = cr.run_id AND ls_soft.target_status = 'SOFT_CLOSE'
LEFT JOIN latest_snapshot ls_hard
    ON ls_hard.run_id = cr.run_id AND ls_hard.target_status = 'HARD_CLOSE'
LEFT JOIN prev_snapshot ps
    ON ps.run_id = cr.run_id AND ps.target_status = 'HARD_CLOSE'
LEFT JOIN breach br
    ON br.tenant_id = cr.tenant_id AND br.entity_code = cr.entity_code
    AND br.fiscal_year = cr.fiscal_year AND br.period_number = cr.period_number;

COMMENT ON VIEW fin.vw_advisor_completion_forecast IS
    'Phase 10: Close completion forecast. Joins latest orchestration snapshot prediction with calendar targets, breach probability, prediction trend, and confidence trend into a single forecast strip.';

-- ============================================================================
-- 4. fin.vw_advisor_override_posture — Override risk posture with limits
-- ============================================================================
-- Current override counts and impact compared against historical baselines
-- to compute suggested risk limits and detect override spikes.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_advisor_override_posture CASCADE;
CREATE OR REPLACE VIEW fin.vw_advisor_override_posture AS
WITH current_overrides AS (
    SELECT
        es.tenant_id,
        es.entity_code,
        es.fiscal_year,
        es.period_number,
        es.total_overrides,
        es.pending_overrides,
        es.approved_overrides,
        es.override_impact_total,
        -- Count gate-scope overrides (highest risk)
        COALESCE(gate.gate_count, 0) AS gate_overrides
    FROM fin.vw_close_executive_summary es
    LEFT JOIN (
        SELECT
            o.tenant_id,
            ri.entity_code,
            ri.fiscal_year,
            ri.period_number,
            COUNT(*) AS gate_count
        FROM (
            SELECT DISTINCT ON (r.tenant_id, r.entity_code, r.fiscal_year, r.period_number)
                r.id AS run_id, r.tenant_id, r.entity_code, r.fiscal_year, r.period_number
            FROM fin.close_run r
            WHERE r.status NOT IN ('CANCELLED')
            ORDER BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number, r.run_number DESC
        ) ri
        JOIN fin.close_override o ON o.run_id = ri.run_id AND o.tenant_id = ri.tenant_id
        WHERE o.override_scope = 'GATE'
        GROUP BY o.tenant_id, ri.entity_code, ri.fiscal_year, ri.period_number
    ) gate ON gate.tenant_id = es.tenant_id AND gate.entity_code = es.entity_code
        AND gate.fiscal_year = es.fiscal_year AND gate.period_number = es.period_number
    WHERE es.run_status NOT IN ('HARD_CLOSED')
),
-- Historical override distribution (trailing 12 periods)
historical AS (
    SELECT
        o.tenant_id,
        ri.entity_code,
        COUNT(*) AS total_historical_overrides,
        COUNT(DISTINCT (ri.fiscal_year, ri.period_number)) AS period_count,
        ROUND(AVG(period_count.cnt), 1) AS avg_overrides_per_period,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY period_count.cnt)::numeric AS p75_overrides,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY period_count.cnt)::numeric AS p90_overrides,
        ROUND(AVG(period_impact.impact), 2) AS avg_impact_per_period,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY period_impact.impact)::numeric AS p75_impact
    FROM (
        SELECT DISTINCT ON (r.tenant_id, r.entity_code, r.fiscal_year, r.period_number)
            r.id AS run_id, r.tenant_id, r.entity_code, r.fiscal_year, r.period_number
        FROM fin.close_run r
        WHERE r.status IN ('HARD_CLOSED', 'SOFT_CLOSED')
        ORDER BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number, r.run_number DESC
    ) ri
    JOIN fin.close_override o ON o.run_id = ri.run_id AND o.tenant_id = ri.tenant_id
    CROSS JOIN LATERAL (
        SELECT COUNT(*) AS cnt
        FROM fin.close_override o2
        WHERE o2.run_id = ri.run_id AND o2.tenant_id = ri.tenant_id
    ) period_count
    CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(o3.impact_amount) FILTER (WHERE o3.status = 'APPROVED'), 0) AS impact
        FROM fin.close_override o3
        WHERE o3.run_id = ri.run_id AND o3.tenant_id = ri.tenant_id
    ) period_impact
    GROUP BY o.tenant_id, ri.entity_code
),
-- Atlas anomaly check for override spikes
anomaly AS (
    SELECT
        a.tenant_id,
        a.entity_code,
        a.fiscal_year,
        a.period_number,
        a.severity AS spike_severity,
        (a.evidence->>'zScore')::numeric AS z_score
    FROM fin.atlas_anomaly a
    WHERE a.anomaly_type = 'EXCEPTION_PATTERN'
      AND a.status IN ('OPEN', 'ACKNOWLEDGED')
)
SELECT
    co.tenant_id,
    co.entity_code,
    co.fiscal_year,
    co.period_number,
    -- Current state
    co.total_overrides,
    co.pending_overrides,
    co.approved_overrides,
    co.gate_overrides,
    co.override_impact_total,
    -- Historical baselines
    COALESCE(h.avg_overrides_per_period, 0) AS avg_overrides_historical,
    COALESCE(h.p75_overrides, 0) AS p75_overrides_historical,
    COALESCE(h.p90_overrides, 0) AS p90_overrides_historical,
    CAST(COALESCE(h.avg_impact_per_period, 0) AS varchar) AS avg_impact_historical,
    CAST(COALESCE(h.p75_impact, 0) AS varchar) AS p75_impact_historical,
    COALESCE(h.period_count, 0) AS historical_period_count,
    -- Suggested limits (P75 as recommended, P90 as max)
    COALESCE(h.p75_overrides, 5) AS suggested_override_limit,
    COALESCE(h.p90_overrides, 8) AS suggested_override_max,
    CAST(COALESCE(h.p75_impact, 0) AS varchar) AS suggested_impact_limit,
    -- Spike detection
    an.spike_severity,
    an.z_score AS override_spike_z,
    -- Posture assessment
    CASE
        WHEN co.gate_overrides > 0 THEN 'ELEVATED'
        WHEN co.total_overrides > COALESCE(h.p90_overrides, 8) THEN 'ELEVATED'
        WHEN co.total_overrides > COALESCE(h.p75_overrides, 5) THEN 'WATCH'
        WHEN an.spike_severity = 'CRITICAL' THEN 'ELEVATED'
        WHEN an.spike_severity = 'WARNING' THEN 'WATCH'
        ELSE 'NORMAL'
    END AS posture_assessment,
    -- Is current count above suggested limit?
    CASE WHEN co.total_overrides > COALESCE(h.p75_overrides, 5) THEN true ELSE false END AS above_suggested_limit,
    CASE WHEN co.total_overrides > COALESCE(h.p90_overrides, 8) THEN true ELSE false END AS above_max_limit
FROM current_overrides co
LEFT JOIN historical h
    ON h.tenant_id = co.tenant_id AND h.entity_code = co.entity_code
LEFT JOIN anomaly an
    ON an.tenant_id = co.tenant_id AND an.entity_code = co.entity_code
    AND an.fiscal_year = co.fiscal_year AND an.period_number = co.period_number;

COMMENT ON VIEW fin.vw_advisor_override_posture IS
    'Phase 10: Override risk posture with suggested limits. Compares current overrides against historical P75/P90 baselines and Atlas anomaly spikes.';

-- ============================================================================
-- 5. fin.vw_advisor_entity_heatmap — Color-tiered cross-entity risk grid
-- ============================================================================
-- Extends cross-entity risk ranking with color tiers for visual heatmap
-- and adds key advisor-relevant indicators.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_advisor_entity_heatmap CASCADE;
CREATE OR REPLACE VIEW fin.vw_advisor_entity_heatmap AS
SELECT
    er.tenant_id,
    er.entity_code,
    er.fiscal_year,
    er.period_number,
    er.run_status,
    er.close_type,
    er.sla_status,
    er.days_remaining,
    er.readiness_score,
    er.completion_pct,
    er.composite_risk_score,
    er.risk_rank,
    -- Risk color tier for heatmap rendering
    CASE
        WHEN er.composite_risk_score >= 70 THEN 'RED'
        WHEN er.composite_risk_score >= 40 THEN 'AMBER'
        ELSE 'GREEN'
    END AS risk_color,
    -- Contributing factors (for tooltip/detail)
    er.total_overrides,
    er.pending_overrides,
    er.override_impact_total,
    er.total_exceptions,
    er.open_exceptions,
    er.critical_exceptions,
    er.doc_health_score,
    er.doc_health_rating,
    er.active_signal_count,
    er.critical_signal_count,
    er.remediation_total,
    er.remediation_pending,
    -- Breach forecast (from Phase 9B)
    COALESCE(bf.hard_close_breach_pct, 0) AS breach_probability,
    COALESCE(bf.risk_tier, 'LOW') AS breach_risk_tier,
    bf.hard_close_buffer_hours,
    bf.slippage_count,
    -- Top bottleneck task (if any)
    bn.task_code AS top_bottleneck_task,
    bn.pattern_classification AS bottleneck_pattern
FROM fin.vw_cross_entity_risk_ranking er
LEFT JOIN fin.vw_sla_breach_forecast bf
    ON bf.tenant_id = er.tenant_id AND bf.entity_code = er.entity_code
    AND bf.fiscal_year = er.fiscal_year AND bf.period_number = er.period_number
LEFT JOIN LATERAL (
    SELECT bp.task_code, bp.pattern_classification
    FROM fin.vw_close_bottleneck_pattern bp
    WHERE bp.tenant_id = er.tenant_id AND bp.entity_code = er.entity_code
    ORDER BY bp.bottleneck_frequency_pct DESC
    LIMIT 1
) bn ON true;

COMMENT ON VIEW fin.vw_advisor_entity_heatmap IS
    'Phase 10: Entity close risk heatmap. Extends cross-entity risk ranking with RED/AMBER/GREEN color tiers, breach probability, and top bottleneck task.';

-- ============================================================================
-- 6. fin.vw_advisor_controller_alerts — Unified controller alert inbox
-- ============================================================================
-- Unions critical risk signals, pending high-severity recommendations,
-- and critical Atlas anomalies into a single ranked alert feed.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_advisor_controller_alerts CASCADE;
CREATE OR REPLACE VIEW fin.vw_advisor_controller_alerts AS
WITH active_runs AS (
    SELECT DISTINCT ON (r.tenant_id, r.entity_code, r.fiscal_year, r.period_number)
        r.tenant_id,
        r.entity_code,
        r.fiscal_year,
        r.period_number,
        r.status AS run_status
    FROM fin.close_run r
    WHERE r.status NOT IN ('CANCELLED', 'HARD_CLOSED')
    ORDER BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number,
             r.run_number DESC
),
-- Critical/high risk signals
signal_alerts AS (
    SELECT
        sig.id::text AS alert_id,
        sig.tenant_id,
        sig.entity_code,
        sig.fiscal_year,
        sig.period_number,
        'RISK_SIGNAL' AS alert_type,
        r.severity AS alert_severity,
        r.rule_type || ': ' || r.rule_name AS alert_title,
        sig.message AS alert_detail,
        sig.fired_at AS alert_at,
        sig.signal_state AS alert_state,
        sig.escalation_level,
        -- Priority: critical fired > critical acknowledged > high fired > high acknowledged
        CASE
            WHEN r.severity = 'critical' AND sig.signal_state = 'fired' THEN 10
            WHEN r.severity = 'critical' AND sig.signal_state = 'acknowledged' THEN 20
            WHEN r.severity = 'high' AND sig.signal_state = 'fired' THEN 30
            WHEN r.severity = 'high' AND sig.signal_state = 'acknowledged' THEN 40
            ELSE 50
        END AS sort_priority
    FROM active_runs ar
    JOIN fin.close_risk_signal sig
        ON sig.tenant_id = ar.tenant_id AND sig.entity_code = ar.entity_code
        AND sig.fiscal_year = ar.fiscal_year AND sig.period_number = ar.period_number
    JOIN fin.close_risk_rule r ON r.id = sig.rule_id
    WHERE sig.signal_state IN ('fired', 'acknowledged')
      AND r.severity IN ('critical', 'high')
),
-- Pending high-severity recommendations
recommendation_alerts AS (
    SELECT
        al.id::text AS alert_id,
        al.tenant_id,
        al.entity_code,
        al.fiscal_year,
        al.period_number,
        'RECOMMENDATION' AS alert_type,
        p.severity AS alert_severity,
        p.policy_name AS alert_title,
        'Pending ' || al.action_type || ' recommendation' AS alert_detail,
        al.proposed_at AS alert_at,
        al.status AS alert_state,
        0 AS escalation_level,
        CASE
            WHEN p.severity = 'critical' THEN 15
            WHEN p.severity = 'high' THEN 35
            ELSE 55
        END AS sort_priority
    FROM active_runs ar
    JOIN fin.close_action_log al
        ON al.tenant_id = ar.tenant_id AND al.entity_code = ar.entity_code
        AND al.fiscal_year = ar.fiscal_year AND al.period_number = ar.period_number
    JOIN fin.close_action_policy p ON p.id = al.policy_id
    WHERE al.status = 'proposed'
      AND p.severity IN ('critical', 'high')
),
-- Critical Atlas anomalies
anomaly_alerts AS (
    SELECT
        a.id::text AS alert_id,
        a.tenant_id,
        a.entity_code,
        a.fiscal_year,
        a.period_number,
        'ANOMALY' AS alert_type,
        CASE a.severity
            WHEN 'CRITICAL' THEN 'critical'
            WHEN 'WARNING' THEN 'high'
            ELSE 'medium'
        END AS alert_severity,
        a.anomaly_type || ' detected' AS alert_title,
        a.description AS alert_detail,
        a.detected_at AS alert_at,
        a.status AS alert_state,
        0 AS escalation_level,
        CASE a.severity
            WHEN 'CRITICAL' THEN 12
            WHEN 'WARNING' THEN 32
            ELSE 52
        END AS sort_priority
    FROM active_runs ar
    JOIN fin.atlas_anomaly a
        ON a.tenant_id = ar.tenant_id AND a.entity_code = ar.entity_code
        AND a.fiscal_year = ar.fiscal_year AND a.period_number = ar.period_number
    WHERE a.status IN ('OPEN', 'ACKNOWLEDGED')
      AND a.severity IN ('CRITICAL', 'WARNING')
)
SELECT * FROM signal_alerts
UNION ALL
SELECT * FROM recommendation_alerts
UNION ALL
SELECT * FROM anomaly_alerts
ORDER BY sort_priority ASC, alert_at DESC;

COMMENT ON VIEW fin.vw_advisor_controller_alerts IS
    'Phase 10: Unified controller alert inbox. Unions critical risk signals, high-severity pending recommendations, and critical Atlas anomalies into a single ranked feed.';
