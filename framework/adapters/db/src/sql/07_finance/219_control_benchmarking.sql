-- ============================================================================
-- 219_control_benchmarking.sql
--
-- Phase 17: Finance Control Benchmarking, Targets & Adaptive Policy Tuning.
--
-- 1 new table:
--   fin.control_target — per-entity metric targets and traffic-light thresholds
--
-- 2 new views:
--   fin.vw_control_benchmark — joins targets with actuals, computes variance
--     and period-over-period delta for evaluative scorecards
--   fin.vw_policy_recommendation — derives structured policy-tuning suggestions
--     from chronic issues + scorecard gaps vs targets
--
-- Table extensions:
--   fin.action_item — adds 'policy_recommendation' target_kind
--
-- Design principles:
--   1. Maximum reuse — targets join against existing vw_control_effectiveness
--   2. Variance = actual - target (positive = beating target)
--   3. Traffic-light thresholds: green/amber/red per metric
--   4. Policy recommendations are read-only derivations, not auto-changes
-- ============================================================================


-- ############################################################################
-- 1. CONTROL TARGET TABLE — per-entity metric targets
-- ############################################################################

CREATE TABLE IF NOT EXISTS fin.control_target (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid        NOT NULL,
    entity_code         varchar(20) NOT NULL,

    -- Metric identity
    metric_code         varchar(50) NOT NULL,
    -- Valid metric_codes:
    --   close_readiness_score
    --   clean_close_rate
    --   override_density_pct
    --   evidence_turnaround_days
    --   attestation_lag_days
    --   bundle_distribution_pct
    --   evidence_fulfillment_pct
    --   overall_assurance_score

    metric_label        text        NOT NULL,
    metric_group        varchar(30) NOT NULL DEFAULT 'control',
    -- Valid groups: control, evidence, attestation, distribution, composite

    -- Target value
    target_value        decimal     NOT NULL,
    -- Direction: 'higher_is_better' (readiness, completion) or 'lower_is_better' (turnaround, density)
    direction           varchar(20) NOT NULL DEFAULT 'higher_is_better'
                        CHECK (direction IN ('higher_is_better', 'lower_is_better')),

    -- Traffic-light thresholds
    -- For higher_is_better: green >= green_threshold > amber >= amber_threshold > red
    -- For lower_is_better: green <= green_threshold < amber <= amber_threshold < red
    green_threshold     decimal     NOT NULL,
    amber_threshold     decimal     NOT NULL,

    -- Applicability
    fiscal_year         int,                        -- NULL = applies to all years
    effective_from      date        NOT NULL DEFAULT current_date,
    effective_to        date,                       -- NULL = indefinite

    -- Governance
    set_by              varchar(100),               -- who defined this target
    rationale           text,                       -- why this target level
    is_active           boolean     NOT NULL DEFAULT true,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_control_target_metric UNIQUE (tenant_id, entity_code, metric_code, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_control_target_lookup
    ON fin.control_target (tenant_id, entity_code, is_active)
    WHERE is_active = true;

COMMENT ON TABLE fin.control_target IS
    'Per-entity control metric targets and traffic-light thresholds for evaluative scorecards.';


-- ############################################################################
-- 2. SEED DEFAULT TARGETS — sensible industry defaults
-- ############################################################################

-- These are inserted as tenant_id = '00000000-0000-0000-0000-000000000000' (template)
-- Real tenants copy from template on first use or customize.


-- ############################################################################
-- 3. EXTEND fin.action_item — add policy_recommendation target_kind
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
            'policy_recommendation'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ############################################################################
-- 4. BENCHMARK VIEW — targets vs actuals with variance
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_control_benchmark CASCADE;
CREATE OR REPLACE VIEW fin.vw_control_benchmark AS
WITH
-- Latest actuals from control effectiveness (per period)
actuals AS (
    SELECT
        ce.tenant_id,
        ce.entity_code,
        ce.fiscal_year,
        ce.period_number,
        -- Expand each metric as a row for UNPIVOT-style join
        unnest(ARRAY[
            'close_readiness_score',
            'clean_close_rate',
            'override_density_pct',
            'evidence_turnaround_days',
            'attestation_lag_days',
            'bundle_distribution_pct',
            'evidence_fulfillment_pct',
            'overall_assurance_score'
        ]) AS metric_code,
        unnest(ARRAY[
            coalesce(ce.readiness_score, ce.completion_pct),
            CASE WHEN ce.is_clean_close THEN 100.0 ELSE 0.0 END,
            ce.override_density_pct,
            ce.evidence_avg_turnaround_days,
            ce.avg_attestation_lag_days,
            ce.bundle_distribution_pct,
            CASE WHEN ce.evidence_total_requests > 0
                 THEN round(ce.evidence_fulfilled::decimal / ce.evidence_total_requests * 100, 2)
                 ELSE 100.0 END,
            NULL::decimal  -- filled from scorecard
        ]) AS actual_value
    FROM fin.vw_control_effectiveness ce
),
-- Overall assurance score from scorecard
scorecard_actuals AS (
    SELECT
        sc.tenant_id,
        sc.entity_code,
        sc.fiscal_year,
        sc.period_number,
        'overall_assurance_score' AS metric_code,
        sc.overall_assurance_score::decimal AS actual_value
    FROM fin.vw_assurance_scorecard sc
),
-- Merge actuals (prefer scorecard for overall_assurance_score)
merged_actuals AS (
    SELECT * FROM actuals WHERE metric_code != 'overall_assurance_score'
    UNION ALL
    SELECT * FROM scorecard_actuals
),
-- Prior period actuals for delta calculation
prior_period AS (
    SELECT
        ma.tenant_id,
        ma.entity_code,
        ma.fiscal_year,
        ma.period_number,
        ma.metric_code,
        ma.actual_value,
        LAG(ma.actual_value) OVER (
            PARTITION BY ma.tenant_id, ma.entity_code, ma.metric_code
            ORDER BY ma.fiscal_year, ma.period_number
        ) AS prior_value
    FROM merged_actuals ma
)
SELECT
    pp.tenant_id,
    pp.entity_code,
    pp.fiscal_year,
    pp.period_number,
    pp.metric_code,
    ct.metric_label,
    ct.metric_group,
    ct.direction,

    -- Target
    ct.target_value,
    ct.green_threshold,
    ct.amber_threshold,

    -- Actual
    pp.actual_value,

    -- Variance (positive = favorable)
    CASE WHEN ct.direction = 'higher_is_better'
         THEN pp.actual_value - ct.target_value
         ELSE ct.target_value - pp.actual_value
    END AS variance,

    -- Variance percent
    CASE WHEN ct.target_value != 0
         THEN round(
             CASE WHEN ct.direction = 'higher_is_better'
                  THEN (pp.actual_value - ct.target_value) / ct.target_value * 100
                  ELSE (ct.target_value - pp.actual_value) / ct.target_value * 100
             END, 2)
         ELSE 0 END AS variance_pct,

    -- Traffic light
    CASE
        WHEN ct.direction = 'higher_is_better' THEN
            CASE WHEN pp.actual_value >= ct.green_threshold THEN 'green'
                 WHEN pp.actual_value >= ct.amber_threshold THEN 'amber'
                 ELSE 'red' END
        ELSE -- lower_is_better
            CASE WHEN pp.actual_value <= ct.green_threshold THEN 'green'
                 WHEN pp.actual_value <= ct.amber_threshold THEN 'amber'
                 ELSE 'red' END
    END AS traffic_light,

    -- Period-over-period delta
    pp.prior_value,
    pp.actual_value - coalesce(pp.prior_value, pp.actual_value) AS period_delta,

    -- Trend direction
    CASE
        WHEN pp.prior_value IS NULL THEN 'baseline'
        WHEN ct.direction = 'higher_is_better' THEN
            CASE WHEN pp.actual_value > pp.prior_value THEN 'improving'
                 WHEN pp.actual_value < pp.prior_value THEN 'declining'
                 ELSE 'stable' END
        ELSE -- lower_is_better
            CASE WHEN pp.actual_value < pp.prior_value THEN 'improving'
                 WHEN pp.actual_value > pp.prior_value THEN 'declining'
                 ELSE 'stable' END
    END AS trend,

    -- Target metadata
    ct.set_by,
    ct.rationale

FROM prior_period pp
JOIN fin.control_target ct
    ON ct.tenant_id = pp.tenant_id
    AND ct.entity_code = pp.entity_code
    AND ct.metric_code = pp.metric_code
    AND ct.is_active = true
    AND (ct.fiscal_year IS NULL OR ct.fiscal_year = pp.fiscal_year)
    AND ct.effective_from <= current_date
    AND (ct.effective_to IS NULL OR ct.effective_to >= current_date);

COMMENT ON VIEW fin.vw_control_benchmark IS
    'Control benchmark: joins targets with actuals from vw_control_effectiveness/vw_assurance_scorecard. Computes variance, traffic light, and period-over-period trend.';


-- ############################################################################
-- 5. POLICY RECOMMENDATION VIEW — adaptive tuning suggestions
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_policy_recommendation CASCADE;
CREATE OR REPLACE VIEW fin.vw_policy_recommendation AS
WITH
-- Red-light metrics needing attention
red_metrics AS (
    SELECT
        b.tenant_id,
        b.entity_code,
        b.fiscal_year,
        b.period_number,
        b.metric_code,
        b.metric_label,
        b.actual_value,
        b.target_value,
        b.variance,
        b.traffic_light,
        b.trend,
        b.amber_threshold
    FROM fin.vw_control_benchmark b
    WHERE b.traffic_light = 'red'
),
-- Chronic issues (from Phase 16)
chronic AS (
    SELECT
        tenant_id,
        entity_code,
        issue_type,
        issue_key,
        description,
        occurrence_count
    FROM fin.vw_chronic_control_issues
)
-- Generate structured policy recommendations

-- 1. Override density too high → recommend tighter override approval policy
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    'TIGHTEN_OVERRIDE_POLICY' AS recommendation_type,
    'override_governance' AS policy_area,
    'Reduce override approval tolerance' AS title,
    'Override density at ' || r.actual_value || '% exceeds target of '
        || r.target_value || '%. Consider requiring second-level approval for overrides '
        || 'or reducing max_overrides threshold in clean close policy.' AS detail,
    'high' AS priority,
    jsonb_build_object(
        'metric_code', r.metric_code,
        'actual', r.actual_value,
        'target', r.target_value,
        'suggested_action', 'require_dual_approval_for_overrides'
    ) AS recommendation_data
FROM red_metrics r
WHERE r.metric_code = 'override_density_pct'

UNION ALL

-- 2. Evidence turnaround too slow → recommend SLA enforcement
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    'ENFORCE_EVIDENCE_SLA' AS recommendation_type,
    'evidence_governance' AS policy_area,
    'Enforce evidence request SLA' AS title,
    'Evidence turnaround at ' || r.actual_value || ' days exceeds target of '
        || r.target_value || ' days. Consider adding auto-escalation after '
        || round(r.target_value * 0.75) || ' days and notification reminders.' AS detail,
    'high' AS priority,
    jsonb_build_object(
        'metric_code', r.metric_code,
        'actual', r.actual_value,
        'target', r.target_value,
        'suggested_escalation_days', round(r.target_value * 0.75)
    ) AS recommendation_data
FROM red_metrics r
WHERE r.metric_code = 'evidence_turnaround_days'

UNION ALL

-- 3. Attestation lag too long → recommend attestation cadence
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    'INCREASE_ATTESTATION_CADENCE' AS recommendation_type,
    'attestation_governance' AS policy_area,
    'Increase attestation review cadence' AS title,
    'Attestation lag at ' || r.actual_value || ' days exceeds target of '
        || r.target_value || ' days. Consider requiring attestation within '
        || GREATEST(1, round(r.target_value)) || ' day(s) of snapshot capture.' AS detail,
    'medium' AS priority,
    jsonb_build_object(
        'metric_code', r.metric_code,
        'actual', r.actual_value,
        'target', r.target_value,
        'suggested_max_lag_days', GREATEST(1, round(r.target_value))
    ) AS recommendation_data
FROM red_metrics r
WHERE r.metric_code = 'attestation_lag_days'

UNION ALL

-- 4. Bundle distribution low → recommend distribution governance
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    'ENFORCE_DISTRIBUTION_GOVERNANCE' AS recommendation_type,
    'distribution_governance' AS policy_area,
    'Enforce evidence bundle distribution' AS title,
    'Bundle distribution at ' || r.actual_value || '% vs target '
        || r.target_value || '%. Consider requiring bundle seal+distribute '
        || 'before period close sign-off.' AS detail,
    'medium' AS priority,
    jsonb_build_object(
        'metric_code', r.metric_code,
        'actual', r.actual_value,
        'target', r.target_value,
        'suggested_action', 'require_distribution_before_close'
    ) AS recommendation_data
FROM red_metrics r
WHERE r.metric_code = 'bundle_distribution_pct'

UNION ALL

-- 5. Readiness score low → recommend close preparation
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    r.period_number,
    'IMPROVE_CLOSE_READINESS' AS recommendation_type,
    'close_governance' AS policy_area,
    'Improve close readiness process' AS title,
    'Readiness score at ' || r.actual_value || ' vs target '
        || r.target_value || '. Consider adding pre-close checklist verification '
        || 'and earlier task assignment.' AS detail,
    CASE WHEN r.actual_value < r.amber_threshold THEN 'high' ELSE 'medium' END AS priority,
    jsonb_build_object(
        'metric_code', r.metric_code,
        'actual', r.actual_value,
        'target', r.target_value,
        'suggested_action', 'add_pre_close_verification'
    ) AS recommendation_data
FROM red_metrics r
WHERE r.metric_code = 'close_readiness_score'

UNION ALL

-- 6. Chronic recurring late tasks → recommend task reassignment or automation
SELECT
    c.tenant_id,
    c.entity_code,
    0 AS fiscal_year,
    0 AS period_number,
    'ADDRESS_CHRONIC_LATE_TASKS' AS recommendation_type,
    'task_governance' AS policy_area,
    'Address chronically late task: ' || c.issue_key AS title,
    c.description || '. Consider reassigning to a different role, '
        || 'automating with a system handler, or adjusting SLA hours.' AS detail,
    CASE WHEN c.occurrence_count >= 4 THEN 'critical'
         WHEN c.occurrence_count >= 3 THEN 'high'
         ELSE 'medium' END AS priority,
    jsonb_build_object(
        'issue_type', c.issue_type,
        'issue_key', c.issue_key,
        'occurrence_count', c.occurrence_count,
        'suggested_actions', jsonb_build_array(
            'reassign_owner', 'automate_handler', 'adjust_sla'
        )
    ) AS recommendation_data
FROM chronic c
WHERE c.issue_type = 'RECURRING_LATE_TASK'

UNION ALL

-- 7. Chronic override-heavy periods → recommend tolerance review
SELECT
    c.tenant_id,
    c.entity_code,
    0 AS fiscal_year,
    0 AS period_number,
    'REVIEW_OVERRIDE_TOLERANCE' AS recommendation_type,
    'override_governance' AS policy_area,
    'Review override tolerance settings' AS title,
    c.description || '. Pattern of override-heavy periods suggests either '
        || 'task design issues or overly strict clean-close thresholds. '
        || 'Consider adjusting clean close policy or redesigning problematic tasks.' AS detail,
    'high' AS priority,
    jsonb_build_object(
        'issue_type', c.issue_type,
        'issue_key', c.issue_key,
        'occurrence_count', c.occurrence_count,
        'suggested_actions', jsonb_build_array(
            'adjust_clean_close_tolerance', 'redesign_task_checklist'
        )
    ) AS recommendation_data
FROM chronic c
WHERE c.issue_type = 'OVERRIDE_HEAVY_PERIOD'

UNION ALL

-- 8. Repeat evidence domains → recommend PBC template
SELECT
    c.tenant_id,
    c.entity_code,
    0 AS fiscal_year,
    0 AS period_number,
    'CREATE_PBC_TEMPLATE' AS recommendation_type,
    'evidence_governance' AS policy_area,
    'Create PBC template for recurring domain' AS title,
    c.description || '. Repeated requests for the same evidence domain suggest '
        || 'creating a standing PBC template to reduce turnaround time '
        || 'and improve auditor experience.' AS detail,
    'medium' AS priority,
    jsonb_build_object(
        'issue_type', c.issue_type,
        'issue_key', c.issue_key,
        'occurrence_count', c.occurrence_count,
        'suggested_action', 'create_standing_pbc_template'
    ) AS recommendation_data
FROM chronic c
WHERE c.issue_type = 'REPEAT_EVIDENCE_DOMAIN';

COMMENT ON VIEW fin.vw_policy_recommendation IS
    'Adaptive policy tuning suggestions derived from red-light benchmark gaps and chronic control issues. Recommendations are advisory — not auto-applied.';
