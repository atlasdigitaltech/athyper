/* ============================================================================
   Athyper v2.9 — Close Control Tower Views
   Schema: fin
   Dependencies: 202_close_orchestration.sql (close_calendar, close_run,
                  close_readiness_snapshot)
                 204_governance_lifecycle.sql (close_override,
                  close_override_activity)
                 204_close_orchestration_snapshot.sql
                 214_document_health_reconciliation.sql
                 215_remediation_campaigns.sql

   Phase 9A: Unified Close Control Tower data layer.
   Provides pre-computed aggregate views for:
   1. Executive summary — single-row KPI snapshot per period
   2. SLA performance — target vs actual with breach tracking
   3. Override/waiver posture — counts by scope, reason, approval status
   4. Cross-period SLA trend — historical SLA performance for comparison
   ============================================================================ */

-- ============================================================================
-- 1. fin.vw_close_executive_summary — Single-row KPI snapshot per period
-- ============================================================================
-- Combines: close run status, SLA posture, override counts, readiness,
-- document health, remediation summary, exception counts, risk signals.
-- One query powers the entire Control Tower header strip.
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_close_executive_summary CASCADE;
CREATE OR REPLACE VIEW fin.vw_close_executive_summary AS
WITH run_info AS (
    SELECT DISTINCT ON (r.tenant_id, r.entity_code, r.fiscal_year, r.period_number)
        r.id              AS run_id,
        r.tenant_id,
        r.entity_code,
        r.fiscal_year,
        r.period_number,
        r.status          AS run_status,
        r.run_number,
        r.started_at,
        r.soft_closed_at,
        r.hard_closed_at,
        r.calendar_id
    FROM fin.close_run r
    WHERE r.status NOT IN ('CANCELLED')
    ORDER BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number,
             r.run_number DESC
),
sla_info AS (
    SELECT
        c.tenant_id,
        c.entity_code,
        c.fiscal_year,
        c.period_number,
        c.close_type,
        c.close_start_date,
        c.soft_close_target,
        c.hard_close_target,
        c.soft_close_actual,
        c.hard_close_actual,
        c.target_working_days,
        c.actual_working_days,
        CASE
            WHEN c.hard_close_actual IS NOT NULL AND c.hard_close_actual > c.hard_close_target THEN 'BREACHED'
            WHEN c.hard_close_actual IS NOT NULL THEN 'MET'
            WHEN current_date > c.hard_close_target THEN 'BREACHED'
            WHEN current_date > c.soft_close_target THEN 'AT_RISK'
            ELSE 'ON_TRACK'
        END AS sla_status,
        CASE
            WHEN c.hard_close_actual IS NOT NULL
                THEN (c.hard_close_actual - c.close_start_date)
            ELSE (current_date - c.close_start_date)
        END AS days_elapsed,
        GREATEST(0, c.hard_close_target - current_date) AS days_remaining
    FROM fin.close_calendar c
),
override_counts AS (
    SELECT
        o.tenant_id,
        ri.entity_code,
        ri.fiscal_year,
        ri.period_number,
        COUNT(*)                                                  AS total_overrides,
        COUNT(*) FILTER (WHERE o.status = 'PENDING')              AS pending_overrides,
        COUNT(*) FILTER (WHERE o.status = 'APPROVED')             AS approved_overrides,
        COUNT(*) FILTER (WHERE o.status = 'REJECTED')             AS rejected_overrides,
        COUNT(*) FILTER (WHERE o.status IN ('EXPIRED', 'REVOKED')) AS closed_overrides,
        COALESCE(SUM(o.impact_amount) FILTER (WHERE o.status = 'APPROVED'), 0) AS override_impact_total
    FROM run_info ri
    JOIN fin.close_override o ON o.run_id = ri.run_id AND o.tenant_id = ri.tenant_id
    GROUP BY o.tenant_id, ri.entity_code, ri.fiscal_year, ri.period_number
),
exception_counts AS (
    SELECT
        ri.tenant_id,
        ri.entity_code,
        ri.fiscal_year,
        ri.period_number,
        COUNT(*)                                                              AS total_exceptions,
        COUNT(*) FILTER (WHERE e.status IN ('OPEN', 'IN_PROGRESS'))           AS open_exceptions,
        COUNT(*) FILTER (WHERE e.severity = 'CRITICAL' AND e.status IN ('OPEN', 'IN_PROGRESS'))
                                                                              AS critical_exceptions,
        COUNT(*) FILTER (WHERE e.status = 'RESOLVED')                         AS resolved_exceptions
    FROM run_info ri
    JOIN fin.close_exception e ON e.run_id = ri.run_id
    GROUP BY ri.tenant_id, ri.entity_code, ri.fiscal_year, ri.period_number
),
snapshot_latest AS (
    SELECT DISTINCT ON (s.run_id)
        ri.tenant_id,
        ri.entity_code,
        ri.fiscal_year,
        ri.period_number,
        s.readiness_score,
        s.completion_pct,
        s.total_tasks,
        s.completed_count,
        s.captured_at   AS last_snapshot_at
    FROM run_info ri
    JOIN fin.close_readiness_snapshot s ON s.run_id = ri.run_id
    ORDER BY s.run_id, s.captured_at DESC
),
health AS (
    SELECT
        h.tenant_id,
        h.entity_code,
        h.fiscal_year,
        h.period_number,
        h.health_score,
        h.health_rating
    FROM fin.v_document_health_score h
),
remediation AS (
    SELECT
        rs.tenant_id,
        rs.entity_code,
        rs.fiscal_year,
        rs.period_number,
        rs.total_actions    AS remediation_total,
        rs.suggested_count  AS remediation_pending,
        rs.completed_count  AS remediation_completed,
        rs.failed_count     AS remediation_failed
    FROM fin.v_remediation_summary rs
)
SELECT
    ri.tenant_id,
    ri.entity_code,
    ri.fiscal_year,
    ri.period_number,
    ri.run_id,
    ri.run_status,
    ri.run_number,
    ri.started_at,
    ri.soft_closed_at,
    ri.hard_closed_at,
    -- SLA
    sl.close_type,
    sl.close_start_date,
    sl.soft_close_target,
    sl.hard_close_target,
    sl.soft_close_actual,
    sl.hard_close_actual,
    sl.sla_status,
    sl.days_elapsed,
    sl.days_remaining,
    sl.target_working_days,
    sl.actual_working_days,
    -- Readiness
    sn.readiness_score,
    sn.completion_pct,
    sn.total_tasks,
    sn.completed_count,
    sn.last_snapshot_at,
    -- Overrides
    COALESCE(oc.total_overrides, 0)   AS total_overrides,
    COALESCE(oc.pending_overrides, 0) AS pending_overrides,
    COALESCE(oc.approved_overrides, 0) AS approved_overrides,
    COALESCE(oc.override_impact_total, 0) AS override_impact_total,
    -- Exceptions
    COALESCE(ec.total_exceptions, 0)    AS total_exceptions,
    COALESCE(ec.open_exceptions, 0)     AS open_exceptions,
    COALESCE(ec.critical_exceptions, 0) AS critical_exceptions,
    COALESCE(ec.resolved_exceptions, 0) AS resolved_exceptions,
    -- Document Health
    h.health_score   AS doc_health_score,
    h.health_rating  AS doc_health_rating,
    -- Remediation
    COALESCE(rem.remediation_total, 0)     AS remediation_total,
    COALESCE(rem.remediation_pending, 0)   AS remediation_pending,
    COALESCE(rem.remediation_completed, 0) AS remediation_completed,
    COALESCE(rem.remediation_failed, 0)    AS remediation_failed
FROM run_info ri
LEFT JOIN sla_info sl
    ON sl.tenant_id = ri.tenant_id AND sl.entity_code = ri.entity_code
    AND sl.fiscal_year = ri.fiscal_year AND sl.period_number = ri.period_number
LEFT JOIN override_counts oc
    ON oc.tenant_id = ri.tenant_id AND oc.entity_code = ri.entity_code
    AND oc.fiscal_year = ri.fiscal_year AND oc.period_number = ri.period_number
LEFT JOIN exception_counts ec
    ON ec.tenant_id = ri.tenant_id AND ec.entity_code = ri.entity_code
    AND ec.fiscal_year = ri.fiscal_year AND ec.period_number = ri.period_number
LEFT JOIN snapshot_latest sn
    ON sn.tenant_id = ri.tenant_id AND sn.entity_code = ri.entity_code
    AND sn.fiscal_year = ri.fiscal_year AND sn.period_number = ri.period_number
LEFT JOIN health h
    ON h.tenant_id = ri.tenant_id AND h.entity_code = ri.entity_code
    AND h.fiscal_year = ri.fiscal_year AND h.period_number = ri.period_number
LEFT JOIN remediation rem
    ON rem.tenant_id = ri.tenant_id AND rem.entity_code = ri.entity_code
    AND rem.fiscal_year = ri.fiscal_year AND rem.period_number = ri.period_number;

COMMENT ON VIEW fin.vw_close_executive_summary IS
    'Single-row executive KPI snapshot per period. Combines: close run status, SLA posture, override counts, readiness, document health, remediation progress, exception counts.';

-- ============================================================================
-- 2. fin.vw_override_posture — Override/waiver breakdown by scope and reason
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_override_posture CASCADE;
CREATE OR REPLACE VIEW fin.vw_override_posture AS
SELECT
    ri.tenant_id,
    ri.entity_code,
    ri.fiscal_year,
    ri.period_number,
    o.id                AS override_id,
    o.override_scope,
    o.reason_code,
    o.reason_detail,
    o.status,
    o.impact_amount,
    o.impact_currency,
    o.effective_from,
    o.effective_to,
    o.requested_by,
    o.requested_at,
    o.decided_by,
    o.decided_at,
    o.decision_notes,
    -- Derived: is this override currently active?
    CASE
        WHEN o.status = 'APPROVED'
            AND (o.effective_to IS NULL OR o.effective_to > now())
        THEN true
        ELSE false
    END AS is_active,
    -- Task context (when applicable)
    t.task_code,
    t.task_name,
    o.task_category
FROM (
    SELECT DISTINCT ON (r.tenant_id, r.entity_code, r.fiscal_year, r.period_number)
        r.id AS run_id, r.tenant_id, r.entity_code, r.fiscal_year, r.period_number
    FROM fin.close_run r
    WHERE r.status NOT IN ('CANCELLED')
    ORDER BY r.tenant_id, r.entity_code, r.fiscal_year, r.period_number, r.run_number DESC
) ri
JOIN fin.close_override o ON o.run_id = ri.run_id AND o.tenant_id = ri.tenant_id
LEFT JOIN fin.period_close_task t ON t.id = o.task_id;

COMMENT ON VIEW fin.vw_override_posture IS
    'Detailed override/waiver records per period with active status derivation. Powers the override posture panel.';

-- ============================================================================
-- 3. fin.vw_override_posture_summary — Aggregate override posture per period
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_override_posture_summary CASCADE;
CREATE OR REPLACE VIEW fin.vw_override_posture_summary AS
SELECT
    op.tenant_id,
    op.entity_code,
    op.fiscal_year,
    op.period_number,
    -- Totals
    COUNT(*)                                                       AS total_overrides,
    COUNT(*) FILTER (WHERE op.is_active)                           AS active_overrides,
    -- By scope
    COUNT(*) FILTER (WHERE op.override_scope = 'TASK')             AS task_overrides,
    COUNT(*) FILTER (WHERE op.override_scope = 'CATEGORY')         AS category_overrides,
    COUNT(*) FILTER (WHERE op.override_scope = 'GATE')             AS gate_overrides,
    -- By status
    COUNT(*) FILTER (WHERE op.status = 'PENDING')                  AS pending_count,
    COUNT(*) FILTER (WHERE op.status = 'APPROVED')                 AS approved_count,
    COUNT(*) FILTER (WHERE op.status = 'REJECTED')                 AS rejected_count,
    COUNT(*) FILTER (WHERE op.status IN ('EXPIRED', 'REVOKED'))    AS closed_count,
    -- By reason
    COUNT(*) FILTER (WHERE op.reason_code = 'IMMATERIAL')          AS reason_immaterial,
    COUNT(*) FILTER (WHERE op.reason_code = 'TIMING')              AS reason_timing,
    COUNT(*) FILTER (WHERE op.reason_code = 'EXTERNAL_DELAY')      AS reason_external,
    COUNT(*) FILTER (WHERE op.reason_code = 'SYSTEM_ISSUE')        AS reason_system,
    COUNT(*) FILTER (WHERE op.reason_code = 'PROCESS_GAP')         AS reason_process,
    COUNT(*) FILTER (WHERE op.reason_code = 'MANAGEMENT_JUDGEMENT') AS reason_mgmt,
    COUNT(*) FILTER (WHERE op.reason_code = 'REGULATORY')          AS reason_regulatory,
    COUNT(*) FILTER (WHERE op.reason_code = 'OTHER')               AS reason_other,
    -- Impact
    COALESCE(SUM(op.impact_amount) FILTER (WHERE op.is_active), 0) AS active_impact_total,
    COALESCE(SUM(op.impact_amount) FILTER (WHERE op.status = 'APPROVED'), 0) AS approved_impact_total
FROM fin.vw_override_posture op
GROUP BY op.tenant_id, op.entity_code, op.fiscal_year, op.period_number;

COMMENT ON VIEW fin.vw_override_posture_summary IS
    'Aggregate override posture per period: counts by scope, reason, status, and impact totals.';

-- ============================================================================
-- 4. fin.vw_sla_performance_trend — Cross-period SLA performance for comparison
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_sla_performance_trend CASCADE;
CREATE OR REPLACE VIEW fin.vw_sla_performance_trend AS
SELECT
    c.tenant_id,
    c.entity_code,
    c.fiscal_year,
    c.period_number,
    c.close_type,
    c.period_end_date,
    c.close_start_date,
    c.soft_close_target,
    c.hard_close_target,
    c.soft_close_actual,
    c.hard_close_actual,
    c.target_working_days,
    c.actual_working_days,
    -- SLA status
    CASE
        WHEN c.hard_close_actual IS NOT NULL AND c.hard_close_actual > c.hard_close_target THEN 'BREACHED'
        WHEN c.hard_close_actual IS NOT NULL THEN 'MET'
        WHEN current_date > c.hard_close_target THEN 'BREACHED'
        WHEN current_date > c.soft_close_target THEN 'AT_RISK'
        ELSE 'ON_TRACK'
    END AS sla_status,
    -- Soft close performance
    CASE
        WHEN c.soft_close_actual IS NOT NULL
            THEN (c.soft_close_actual - c.close_start_date)
        ELSE NULL
    END AS soft_close_days,
    CASE
        WHEN c.soft_close_actual IS NOT NULL AND c.soft_close_actual <= c.soft_close_target THEN true
        WHEN c.soft_close_actual IS NOT NULL THEN false
        ELSE NULL
    END AS soft_close_met,
    -- Hard close performance
    CASE
        WHEN c.hard_close_actual IS NOT NULL
            THEN (c.hard_close_actual - c.close_start_date)
        ELSE NULL
    END AS hard_close_days,
    CASE
        WHEN c.hard_close_actual IS NOT NULL AND c.hard_close_actual <= c.hard_close_target THEN true
        WHEN c.hard_close_actual IS NOT NULL THEN false
        ELSE NULL
    END AS hard_close_met,
    -- Latest readiness score for completed closes
    s.readiness_score AS final_readiness_score,
    -- Run status
    r.status AS run_status
FROM fin.close_calendar c
LEFT JOIN LATERAL (
    SELECT r2.status
    FROM fin.close_run r2
    WHERE r2.calendar_id = c.id
      AND r2.status NOT IN ('CANCELLED')
    ORDER BY r2.run_number DESC
    LIMIT 1
) r ON true
LEFT JOIN LATERAL (
    SELECT s2.readiness_score
    FROM fin.close_readiness_snapshot s2
    JOIN fin.close_run r3 ON r3.id = s2.run_id AND r3.calendar_id = c.id
    WHERE r3.status NOT IN ('CANCELLED')
    ORDER BY s2.captured_at DESC
    LIMIT 1
) s ON true
ORDER BY c.tenant_id, c.entity_code, c.fiscal_year DESC, c.period_number DESC;

COMMENT ON VIEW fin.vw_sla_performance_trend IS
    'Cross-period SLA performance history. Shows target vs actual close dates, SLA status, and readiness scores for trend analysis.';
