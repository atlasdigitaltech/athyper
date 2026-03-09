-- ============================================================================
-- 221_control_optimization.sql
--
-- Phase 19: Autonomous Control Optimization.
--
-- Turns policy recommendations and benchmark gaps into automated program
-- proposals, tracks recommendation effectiveness, and enables learning-based
-- policy tuning.
--
-- 0 new tables (full reuse):
--   Program proposals → fin.close_action_log (action_type = 'propose_program')
--   Acceptance/dismissal → existing status flow (proposed→accepted/dismissed)
--   Effectiveness → existing was_effective + outcome_notes columns
--
-- 2 new views:
--   fin.vw_program_proposal — auto-generated program proposals from policy
--     recommendations + benchmark red-lights + chronic issues
--   fin.vw_effectiveness_learning — aggregated effectiveness metrics per
--     policy, recommendation type, and entity for learning insights
--
-- Table extensions:
--   fin.close_action_policy — extends trigger_type CHECK for
--     'benchmark_red_light' and 'program_gap_unaddressed'
--
-- Design principles:
--   1. Full table reuse — no new tables, extends close_action_log pattern
--   2. Proposals as recommendations — same accept/dismiss/outcome lifecycle
--   3. Effectiveness learning — aggregates was_effective across periods
--   4. Deterministic views — no AI/ML, purely SQL-derived insights
-- ============================================================================


-- ############################################################################
-- 1. EXTEND fin.close_action_policy — new trigger types for optimization
-- ############################################################################

-- Add new trigger_type values for autonomous optimization.
-- No CHECK on close_action_policy.trigger_type (freeform varchar),
-- so we just document the new valid values:
--   benchmark_red_light       — metric in red zone for N+ periods
--   program_gap_unaddressed   — linked gap with no active program


-- ############################################################################
-- 2. PROGRAM PROPOSAL VIEW — auto-derived from recommendations + gaps
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_program_proposal CASCADE;
CREATE OR REPLACE VIEW fin.vw_program_proposal AS
WITH
-- Red-light metrics persisting across periods (candidates for programs)
persistent_red AS (
    SELECT
        b.tenant_id,
        b.entity_code,
        b.metric_code,
        b.metric_label,
        b.target_value,
        count(*) AS red_period_count,
        round(avg(b.actual_value), 2) AS avg_actual,
        round(avg(abs(b.variance)), 2) AS avg_gap_size,
        max(b.fiscal_year * 100 + b.period_number) AS latest_period_key,
        max(b.fiscal_year) AS latest_fiscal_year,
        max(b.period_number) FILTER (
            WHERE b.fiscal_year = (SELECT max(b2.fiscal_year) FROM fin.vw_control_benchmark b2
                                   WHERE b2.tenant_id = b.tenant_id AND b2.entity_code = b.entity_code)
        ) AS latest_period_number
    FROM fin.vw_control_benchmark b
    WHERE b.traffic_light = 'red'
    GROUP BY b.tenant_id, b.entity_code, b.metric_code, b.metric_label, b.target_value
    HAVING count(*) >= 2  -- persistent = red in 2+ periods
),
-- Chronic issues not yet addressed by a program
unaddressed_chronic AS (
    SELECT
        ci.tenant_id,
        ci.entity_code,
        ci.issue_type,
        ci.issue_key,
        ci.description,
        ci.occurrence_count
    FROM fin.vw_chronic_control_issues ci
    WHERE NOT EXISTS (
        SELECT 1 FROM fin.control_program cp
        WHERE cp.tenant_id = ci.tenant_id
          AND cp.entity_code = ci.entity_code
          AND cp.status NOT IN ('cancelled', 'closed')
          AND cp.linked_gaps @> jsonb_build_array(
              jsonb_build_object('type', 'chronic_issue', 'key', ci.issue_key)
          )
    )
),
-- Policy recommendations not yet addressed by a program
unaddressed_recommendations AS (
    SELECT
        pr.tenant_id,
        pr.entity_code,
        pr.recommendation_type,
        pr.policy_area,
        pr.title,
        pr.detail,
        pr.priority,
        pr.recommendation_data,
        pr.fiscal_year,
        pr.period_number
    FROM fin.vw_policy_recommendation pr
    WHERE NOT EXISTS (
        SELECT 1 FROM fin.control_program cp
        WHERE cp.tenant_id = pr.tenant_id
          AND cp.entity_code = pr.entity_code
          AND cp.status NOT IN ('cancelled', 'closed')
          AND cp.linked_gaps @> jsonb_build_array(
              jsonb_build_object('type', 'policy_recommendation', 'key', pr.recommendation_type)
          )
    )
    -- Deduplicate: one recommendation per type per entity (use latest period)
    AND (pr.fiscal_year * 100 + pr.period_number) = (
        SELECT max(pr2.fiscal_year * 100 + pr2.period_number)
        FROM fin.vw_policy_recommendation pr2
        WHERE pr2.tenant_id = pr.tenant_id
          AND pr2.entity_code = pr.entity_code
          AND pr2.recommendation_type = pr.recommendation_type
    )
),
-- Existing proposals still active (for deduplication)
active_proposals AS (
    SELECT
        cal.tenant_id,
        cal.entity_code,
        cal.fingerprint
    FROM fin.close_action_log cal
    WHERE cal.action_type = 'propose_program'
      AND cal.status NOT IN ('dismissed', 'expired', 'failed')
)

-- A: Red-light metric proposals
SELECT
    pr.tenant_id,
    pr.entity_code,
    pr.latest_fiscal_year AS fiscal_year,
    pr.latest_period_number AS period_number,
    'benchmark_red_light' AS proposal_source,
    'improvement' AS suggested_program_type,
    CASE WHEN pr.red_period_count >= 4 THEN 'critical'
         WHEN pr.red_period_count >= 3 THEN 'high'
         ELSE 'medium' END AS suggested_priority,
    'Improve ' || pr.metric_label AS suggested_title,
    pr.metric_label || ' has been in red zone for ' || pr.red_period_count
        || ' periods (avg ' || pr.avg_actual || ' vs target ' || pr.target_value
        || '). Recommend creating an improvement program.' AS rationale,
    jsonb_build_object(
        'metric_code', pr.metric_code,
        'metric_label', pr.metric_label,
        'red_period_count', pr.red_period_count,
        'avg_actual', pr.avg_actual,
        'avg_gap_size', pr.avg_gap_size,
        'target_value', pr.target_value,
        'suggested_gaps', jsonb_build_array(
            jsonb_build_object('type', 'benchmark_red', 'key', pr.metric_code, 'label', pr.metric_label)
        ),
        'suggested_outcomes', jsonb_build_object(
            pr.metric_code, jsonb_build_object(
                'currentValue', pr.avg_actual::text,
                'targetValue', pr.target_value::text,
                'targetTrafficLight', 'green'
            )
        )
    ) AS proposal_data,
    'v1:propose_program:benchmark_red:' || pr.entity_code || ':' || pr.metric_code AS fingerprint
FROM persistent_red pr
WHERE NOT EXISTS (
    -- Skip if already an active program for this metric
    SELECT 1 FROM fin.control_program cp
    WHERE cp.tenant_id = pr.tenant_id
      AND cp.entity_code = pr.entity_code
      AND cp.status NOT IN ('cancelled', 'closed')
      AND cp.linked_gaps @> jsonb_build_array(
          jsonb_build_object('type', 'benchmark_red', 'key', pr.metric_code)
      )
)
AND NOT EXISTS (
    SELECT 1 FROM active_proposals ap
    WHERE ap.tenant_id = pr.tenant_id
      AND ap.entity_code = pr.entity_code
      AND ap.fingerprint = 'v1:propose_program:benchmark_red:' || pr.entity_code || ':' || pr.metric_code
)

UNION ALL

-- B: Chronic issue proposals
SELECT
    uc.tenant_id,
    uc.entity_code,
    0 AS fiscal_year,
    0 AS period_number,
    'chronic_issue' AS proposal_source,
    'remediation' AS suggested_program_type,
    CASE WHEN uc.occurrence_count >= 4 THEN 'high'
         ELSE 'medium' END AS suggested_priority,
    'Address chronic: ' || uc.issue_key AS suggested_title,
    uc.description || ' (' || uc.occurrence_count || ' occurrences). '
        || 'No active program addresses this chronic issue.' AS rationale,
    jsonb_build_object(
        'issue_type', uc.issue_type,
        'issue_key', uc.issue_key,
        'occurrence_count', uc.occurrence_count,
        'suggested_gaps', jsonb_build_array(
            jsonb_build_object('type', 'chronic_issue', 'key', uc.issue_key, 'label', uc.description)
        )
    ) AS proposal_data,
    'v1:propose_program:chronic:' || uc.entity_code || ':' || uc.issue_key AS fingerprint
FROM unaddressed_chronic uc
WHERE NOT EXISTS (
    SELECT 1 FROM active_proposals ap
    WHERE ap.tenant_id = uc.tenant_id
      AND ap.entity_code = uc.entity_code
      AND ap.fingerprint = 'v1:propose_program:chronic:' || uc.entity_code || ':' || uc.issue_key
)

UNION ALL

-- C: Policy recommendation proposals
SELECT
    ur.tenant_id,
    ur.entity_code,
    ur.fiscal_year,
    ur.period_number,
    'policy_recommendation' AS proposal_source,
    CASE WHEN ur.priority IN ('critical', 'high') THEN 'compliance' ELSE 'optimization' END
        AS suggested_program_type,
    ur.priority AS suggested_priority,
    ur.title AS suggested_title,
    ur.detail AS rationale,
    jsonb_build_object(
        'recommendation_type', ur.recommendation_type,
        'policy_area', ur.policy_area,
        'recommendation_data', ur.recommendation_data,
        'suggested_gaps', jsonb_build_array(
            jsonb_build_object('type', 'policy_recommendation', 'key', ur.recommendation_type, 'label', ur.title)
        )
    ) AS proposal_data,
    'v1:propose_program:recommendation:' || ur.entity_code || ':' || ur.recommendation_type AS fingerprint
FROM unaddressed_recommendations ur
WHERE NOT EXISTS (
    SELECT 1 FROM active_proposals ap
    WHERE ap.tenant_id = ur.tenant_id
      AND ap.entity_code = ur.entity_code
      AND ap.fingerprint = 'v1:propose_program:recommendation:' || ur.entity_code || ':' || ur.recommendation_type
);

COMMENT ON VIEW fin.vw_program_proposal IS
    'Phase 19: Auto-generated program proposals from persistent benchmark red-lights, unaddressed chronic issues, and unaddressed policy recommendations. Deduplicates against existing programs and active proposals.';


-- ############################################################################
-- 3. EFFECTIVENESS LEARNING VIEW — aggregated outcome intelligence
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_effectiveness_learning CASCADE;
CREATE OR REPLACE VIEW fin.vw_effectiveness_learning AS
WITH
-- Per-policy effectiveness stats
policy_stats AS (
    SELECT
        cal.tenant_id,
        cal.entity_code,
        cal.policy_code,
        cap.policy_name,
        cap.trigger_type,
        cap.action_type,
        cap.severity,
        cap.execution_mode,
        count(*) AS total_recommendations,
        count(*) FILTER (WHERE cal.status = 'accepted') AS accepted_count,
        count(*) FILTER (WHERE cal.status = 'dismissed') AS dismissed_count,
        count(*) FILTER (WHERE cal.status = 'executed') AS executed_count,
        count(*) FILTER (WHERE cal.status = 'expired') AS expired_count,
        count(*) FILTER (WHERE cal.was_effective = true) AS effective_count,
        count(*) FILTER (WHERE cal.was_effective = false) AS ineffective_count,
        count(*) FILTER (WHERE cal.was_effective IS NOT NULL) AS rated_count,
        round(
            count(*) FILTER (WHERE cal.status IN ('accepted', 'executed'))::decimal
            / GREATEST(count(*), 1) * 100, 1
        ) AS acceptance_rate,
        round(
            count(*) FILTER (WHERE cal.was_effective = true)::decimal
            / GREATEST(count(*) FILTER (WHERE cal.was_effective IS NOT NULL), 1) * 100, 1
        ) AS effectiveness_rate,
        min(cal.proposed_at) AS first_proposed_at,
        max(cal.proposed_at) AS last_proposed_at,
        count(DISTINCT (cal.fiscal_year, cal.period_number)) AS periods_active
    FROM fin.close_action_log cal
    LEFT JOIN fin.close_action_policy cap ON cap.id = cal.policy_id
    GROUP BY cal.tenant_id, cal.entity_code, cal.policy_code,
             cap.policy_name, cap.trigger_type, cap.action_type,
             cap.severity, cap.execution_mode
),
-- Per-action-type effectiveness (cross-entity)
action_type_stats AS (
    SELECT
        cal.tenant_id,
        cal.action_type,
        count(*) AS total_across_entities,
        round(
            count(*) FILTER (WHERE cal.was_effective = true)::decimal
            / GREATEST(count(*) FILTER (WHERE cal.was_effective IS NOT NULL), 1) * 100, 1
        ) AS action_type_effectiveness
    FROM fin.close_action_log cal
    GROUP BY cal.tenant_id, cal.action_type
)
SELECT
    ps.tenant_id,
    ps.entity_code,
    ps.policy_code,
    ps.policy_name,
    ps.trigger_type,
    ps.action_type,
    ps.severity,
    ps.execution_mode,

    -- Volume
    ps.total_recommendations,
    ps.accepted_count,
    ps.dismissed_count,
    ps.executed_count,
    ps.expired_count,
    ps.periods_active,

    -- Acceptance
    ps.acceptance_rate,

    -- Effectiveness
    ps.effective_count,
    ps.ineffective_count,
    ps.rated_count,
    ps.effectiveness_rate,

    -- Cross-entity comparison
    ats.total_across_entities AS action_type_total,
    ats.action_type_effectiveness,

    -- Health classification
    CASE
        WHEN ps.rated_count = 0 THEN 'insufficient_data'
        WHEN ps.effectiveness_rate >= 75 THEN 'highly_effective'
        WHEN ps.effectiveness_rate >= 50 THEN 'moderately_effective'
        WHEN ps.effectiveness_rate >= 25 THEN 'low_effectiveness'
        ELSE 'ineffective'
    END AS effectiveness_class,

    -- Recommendation: should this policy be tuned?
    CASE
        WHEN ps.rated_count >= 3 AND ps.effectiveness_rate < 25 THEN 'consider_disabling'
        WHEN ps.dismissed_count > ps.accepted_count AND ps.total_recommendations >= 5 THEN 'frequently_rejected'
        WHEN ps.rated_count >= 3 AND ps.effectiveness_rate >= 75 THEN 'promote_to_auto'
        WHEN ps.expired_count > ps.accepted_count THEN 'timing_issue'
        ELSE 'maintain'
    END AS tuning_suggestion,

    ps.first_proposed_at,
    ps.last_proposed_at

FROM policy_stats ps
LEFT JOIN action_type_stats ats
    ON ats.tenant_id = ps.tenant_id AND ats.action_type = ps.action_type;

COMMENT ON VIEW fin.vw_effectiveness_learning IS
    'Phase 19: Aggregated recommendation effectiveness per policy and entity. Computes acceptance rates, effectiveness rates, and tuning suggestions based on historical outcomes.';
