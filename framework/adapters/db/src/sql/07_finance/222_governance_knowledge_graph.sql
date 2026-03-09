-- ============================================================================
-- 222_governance_knowledge_graph.sql
--
-- Phase 20: Finance Governance Knowledge Graph & Control Memory.
--
-- Surfaces the implicit relationships across governance objects into a
-- traversable graph model and derives cross-object analytics for
-- higher-order questions.
--
-- 0 new tables (full reuse of existing polymorphic linkage):
--   action_item.target_kind → 9 object types
--   decision_log.target_kind → 9 object types
--   followup_link.source_kind → 5 object types
--   report_commentary.target_kind → 4 object types
--   review_attestation.target_kind → 5 object types
--   evidence_bundle_item.artifact_kind → 14 types
--   control_program.linked_gaps JSONB → benchmark/chronic/recommendation
--   close_action_log (propose_program) → proposal→program linkage
--
-- 4 new views:
--   fin.vw_governance_graph — unified directed-edge model across all
--     governance relationships
--   fin.vw_control_memory — per-object historical context cards
--   fin.vw_proposal_provenance — enriched proposals with historical
--     program similarity and outcomes
--   fin.vw_governance_pathway — issue→recommendation→program→outcome
--     pathway analysis with success rates
--
-- Design principles:
--   1. Zero new tables — all edges already exist
--   2. UNION ALL for graph edges — one consistent edge schema
--   3. Deterministic SQL — no AI/ML, purely relational graph traversal
--   4. Bounded by tenant + entity — safe for multi-tenant
-- ============================================================================


-- ############################################################################
-- 1. GOVERNANCE GRAPH — unified directed-edge model
-- ############################################################################
-- Each row is a directed edge: source_kind/source_id → target_kind/target_id
-- with edge_type describing the relationship semantics.
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_governance_graph CASCADE;
CREATE OR REPLACE VIEW fin.vw_governance_graph AS

-- A: action_item → target (milestone→program, action→period_close, etc.)
SELECT
    ai.tenant_id,
    ai.entity_code,
    'action_item' AS source_kind,
    ai.id AS source_id,
    ai.title AS source_label,
    ai.target_kind AS target_kind,
    ai.target_id AS target_id,
    CASE ai.target_kind
        WHEN 'program_milestone' THEN 'milestone_of'
        WHEN 'policy_recommendation' THEN 'tracks'
        ELSE 'assigned_to'
    END AS edge_type,
    ai.status AS edge_state,
    ai.severity AS edge_weight,
    ai.created_at AS edge_created_at,
    ai.fiscal_year,
    ai.period_number
FROM fin.action_item ai
WHERE ai.target_id IS NOT NULL

UNION ALL

-- B: decision_log → target (decision→program, decision→action_item, etc.)
SELECT
    dl.tenant_id,
    dl.entity_code,
    'decision' AS source_kind,
    dl.id AS source_id,
    dl.title AS source_label,
    dl.target_kind AS target_kind,
    dl.target_id AS target_id,
    dl.decision_type AS edge_type,
    NULL AS edge_state,
    NULL AS edge_weight,
    dl.decided_at AS edge_created_at,
    dl.fiscal_year,
    dl.period_number
FROM fin.decision_log dl
WHERE dl.target_id IS NOT NULL

UNION ALL

-- C: followup_link → source (carry-forward: action/decision/program across periods)
SELECT
    fl.tenant_id,
    fl.entity_code,
    fl.source_kind AS source_kind,
    fl.source_id AS source_id,
    fl.carry_note AS source_label,
    fl.source_kind AS target_kind,  -- same kind, different period
    fl.resolved_ref AS target_id,
    'carry_forward_' || fl.reason AS edge_type,
    CASE WHEN fl.resolved THEN 'resolved' ELSE 'pending' END AS edge_state,
    NULL AS edge_weight,
    fl.created_at AS edge_created_at,
    fl.source_fy AS fiscal_year,
    fl.source_period AS period_number
FROM fin.followup_link fl

UNION ALL

-- D: report_commentary → target (narrative→program, commentary→pack, etc.)
SELECT
    rc.tenant_id,
    NULL AS entity_code,
    'commentary' AS source_kind,
    rc.id AS source_id,
    rc.title AS source_label,
    rc.target_kind AS target_kind,
    rc.target_id AS target_id,
    'commentary_on' AS edge_type,
    rc.commentary_type AS edge_state,
    NULL AS edge_weight,
    rc.created_at AS edge_created_at,
    NULL::smallint AS fiscal_year,
    NULL::smallint AS period_number
FROM fin.report_commentary rc
WHERE rc.is_current = true

UNION ALL

-- E: review_attestation → target (attestation→snapshot, attestation→bundle, etc.)
SELECT
    ra.tenant_id,
    ra.entity_code,
    'attestation' AS source_kind,
    ra.id AS source_id,
    ra.attestation_type || ' by ' || coalesce(ra.attested_by_name, 'unknown') AS source_label,
    ra.target_kind AS target_kind,
    ra.target_id AS target_id,
    ra.attestation_type AS edge_type,
    ra.status AS edge_state,
    NULL AS edge_weight,
    ra.attested_at AS edge_created_at,
    ra.fiscal_year,
    ra.period_number
FROM fin.review_attestation ra

UNION ALL

-- F: evidence_bundle_item → bundle (artifact→bundle)
SELECT
    eb.tenant_id,
    NULL AS entity_code,
    ebi.artifact_kind AS source_kind,
    ebi.artifact_id AS source_id,
    ebi.artifact_label AS source_label,
    'evidence_bundle' AS target_kind,
    ebi.bundle_id AS target_id,
    'included_in' AS edge_type,
    eb.status AS edge_state,
    NULL AS edge_weight,
    ebi.included_at AS edge_created_at,
    NULL::smallint AS fiscal_year,
    NULL::smallint AS period_number
FROM fin.evidence_bundle_item ebi
JOIN fin.evidence_bundle eb ON eb.id = ebi.bundle_id

UNION ALL

-- G: control_program → linked gaps (program→benchmark_red, program→chronic_issue, etc.)
SELECT
    cp.tenant_id,
    cp.entity_code,
    'control_program' AS source_kind,
    cp.id AS source_id,
    cp.title AS source_label,
    (g->>'type')::varchar AS target_kind,
    NULL::uuid AS target_id,
    'addresses' AS edge_type,
    cp.status AS edge_state,
    cp.priority AS edge_weight,
    cp.created_at AS edge_created_at,
    cp.fiscal_year::smallint AS fiscal_year,
    NULL::smallint AS period_number
FROM fin.control_program cp
CROSS JOIN LATERAL jsonb_array_elements(cp.linked_gaps) AS g
WHERE jsonb_array_length(cp.linked_gaps) > 0

UNION ALL

-- H: close_action_log proposals → accepted programs
SELECT
    cal.tenant_id,
    cal.entity_code,
    'proposal' AS source_kind,
    cal.id AS source_id,
    coalesce(cal.action_params->>'suggestedTitle', cal.policy_code) AS source_label,
    'control_program' AS target_kind,
    (cal.action_params->>'programId')::uuid AS target_id,
    CASE cal.status
        WHEN 'accepted' THEN 'created_program'
        WHEN 'dismissed' THEN 'rejected'
        ELSE 'proposed'
    END AS edge_type,
    cal.status AS edge_state,
    NULL AS edge_weight,
    cal.proposed_at AS edge_created_at,
    cal.fiscal_year,
    cal.period_number
FROM fin.close_action_log cal
WHERE cal.action_type = 'propose_program';

COMMENT ON VIEW fin.vw_governance_graph IS
    'Phase 20: Unified directed-edge model across all governance relationships. Each row is an edge: source_kind/source_id → target_kind/target_id with edge_type semantics.';


-- ############################################################################
-- 2. CONTROL MEMORY — per-object historical context
-- ############################################################################
-- Aggregates historical context for each governance object type, answering:
--   "How many times has this happened?"
--   "What was the outcome last time?"
--   "Who was involved?"
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_control_memory CASCADE;
CREATE OR REPLACE VIEW fin.vw_control_memory AS

-- A: Chronic issue memory — occurrence history + linked programs + outcomes
SELECT
    ci.tenant_id,
    ci.entity_code,
    'chronic_issue' AS object_kind,
    ci.issue_key AS object_key,
    ci.issue_type AS object_subtype,
    ci.description AS object_label,
    ci.occurrence_count,
    -- Linked programs addressing this issue
    (SELECT count(*) FROM fin.control_program cp
     WHERE cp.tenant_id = ci.tenant_id
       AND cp.entity_code = ci.entity_code
       AND cp.linked_gaps @> jsonb_build_array(
           jsonb_build_object('type', 'chronic_issue', 'key', ci.issue_key))
    ) AS programs_created,
    (SELECT count(*) FROM fin.control_program cp
     WHERE cp.tenant_id = ci.tenant_id
       AND cp.entity_code = ci.entity_code
       AND cp.status IN ('completed', 'closed')
       AND cp.linked_gaps @> jsonb_build_array(
           jsonb_build_object('type', 'chronic_issue', 'key', ci.issue_key))
    ) AS programs_completed,
    -- Was it ever resolved?
    (SELECT count(*) FROM fin.control_program cp
     WHERE cp.tenant_id = ci.tenant_id
       AND cp.entity_code = ci.entity_code
       AND cp.status IN ('completed', 'closed')
       AND cp.linked_gaps @> jsonb_build_array(
           jsonb_build_object('type', 'chronic_issue', 'key', ci.issue_key))
    ) > 0 AS ever_resolved,
    jsonb_build_object(
        'occurrences', ci.occurrence_count,
        'affectedPeriods', ci.affected_periods
    ) AS memory_data
FROM fin.vw_chronic_control_issues ci

UNION ALL

-- B: Recommendation memory — acceptance history + outcomes
SELECT
    el.tenant_id,
    el.entity_code,
    'policy_recommendation' AS object_kind,
    el.policy_code AS object_key,
    el.trigger_type AS object_subtype,
    el.policy_name AS object_label,
    el.total_recommendations AS occurrence_count,
    el.accepted_count AS programs_created,
    el.effective_count AS programs_completed,
    el.effectiveness_rate::decimal >= 50 AS ever_resolved,
    jsonb_build_object(
        'acceptanceRate', el.acceptance_rate,
        'effectivenessRate', el.effectiveness_rate,
        'effectivenessClass', el.effectiveness_class,
        'tuningSuggestion', el.tuning_suggestion,
        'dismissedCount', el.dismissed_count,
        'periodsActive', el.periods_active
    ) AS memory_data
FROM fin.vw_effectiveness_learning el

UNION ALL

-- C: Benchmark metric memory — red period count + program history
SELECT
    pr.tenant_id,
    pr.entity_code,
    'benchmark_metric' AS object_kind,
    pr.metric_code AS object_key,
    'red_light' AS object_subtype,
    pr.metric_label AS object_label,
    pr.red_period_count::int AS occurrence_count,
    (SELECT count(*) FROM fin.control_program cp
     WHERE cp.tenant_id = pr.tenant_id
       AND cp.entity_code = pr.entity_code
       AND cp.linked_gaps @> jsonb_build_array(
           jsonb_build_object('type', 'benchmark_red', 'key', pr.metric_code))
    ) AS programs_created,
    (SELECT count(*) FROM fin.control_program cp
     WHERE cp.tenant_id = pr.tenant_id
       AND cp.entity_code = pr.entity_code
       AND cp.status IN ('completed', 'closed')
       AND cp.linked_gaps @> jsonb_build_array(
           jsonb_build_object('type', 'benchmark_red', 'key', pr.metric_code))
    ) AS programs_completed,
    (SELECT EXISTS(
        SELECT 1 FROM fin.vw_control_benchmark b2
        WHERE b2.tenant_id = pr.tenant_id
          AND b2.entity_code = pr.entity_code
          AND b2.metric_code = pr.metric_code
          AND b2.traffic_light = 'green'
    )) AS ever_resolved,
    jsonb_build_object(
        'redPeriodCount', pr.red_period_count,
        'avgActual', pr.avg_actual,
        'avgGapSize', pr.avg_gap_size,
        'targetValue', pr.target_value
    ) AS memory_data
FROM (
    SELECT
        b.tenant_id, b.entity_code, b.metric_code, b.metric_label,
        ct.target_value,
        count(*) AS red_period_count,
        round(avg(b.actual_value), 2) AS avg_actual,
        round(avg(abs(b.variance)), 2) AS avg_gap_size
    FROM fin.vw_control_benchmark b
    JOIN fin.control_target ct
        ON ct.tenant_id = b.tenant_id
        AND ct.entity_code = b.entity_code
        AND ct.metric_code = b.metric_code
        AND ct.is_active = true
    WHERE b.traffic_light = 'red'
    GROUP BY b.tenant_id, b.entity_code, b.metric_code, b.metric_label, ct.target_value
) pr

UNION ALL

-- D: Program outcome memory — completed programs with benefit realization
SELECT
    cp.tenant_id,
    cp.entity_code,
    'control_program' AS object_kind,
    cp.program_code AS object_key,
    cp.program_type AS object_subtype,
    cp.title AS object_label,
    1 AS occurrence_count,
    (SELECT count(*) FROM fin.action_item ai
     WHERE ai.target_kind = 'program_milestone'
       AND ai.target_id = cp.id
       AND ai.tenant_id = cp.tenant_id
    ) AS programs_created,  -- milestones total (reusing column)
    (SELECT count(*) FROM fin.action_item ai
     WHERE ai.target_kind = 'program_milestone'
       AND ai.target_id = cp.id
       AND ai.tenant_id = cp.tenant_id
       AND ai.status = 'resolved'
    ) AS programs_completed,  -- milestones completed (reusing column)
    cp.status IN ('completed', 'closed') AS ever_resolved,
    jsonb_build_object(
        'status', cp.status,
        'programType', cp.program_type,
        'priority', cp.priority,
        'health', (SELECT vpp.health FROM fin.vw_program_portfolio vpp WHERE vpp.id = cp.id),
        'elapsedDays', EXTRACT(DAY FROM (coalesce(cp.actual_end, now()) - cp.actual_start)),
        'linkedGapCount', jsonb_array_length(cp.linked_gaps),
        'baselineMetrics', cp.baseline_metrics,
        'targetOutcomes', cp.target_outcomes,
        'gapTypes', (
            SELECT jsonb_agg(DISTINCT g->>'type')
            FROM jsonb_array_elements(cp.linked_gaps) g
        )
    ) AS memory_data
FROM fin.control_program cp;

COMMENT ON VIEW fin.vw_control_memory IS
    'Phase 20: Per-object historical context cards. Aggregates occurrence counts, linked programs, completion rates, and memory data for chronic issues, recommendations, benchmark metrics, and programs.';


-- ############################################################################
-- 3. PROPOSAL PROVENANCE — explainable recommendation context
-- ############################################################################
-- For each auto-generated program proposal, shows:
--   - What evidence generated it (source data)
--   - What similar historical programs existed
--   - What outcomes those programs had
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_proposal_provenance CASCADE;
CREATE OR REPLACE VIEW fin.vw_proposal_provenance AS
WITH
-- Current proposals
proposals AS (
    SELECT
        pp.tenant_id,
        pp.entity_code,
        pp.fiscal_year,
        pp.period_number,
        pp.proposal_source,
        pp.suggested_program_type,
        pp.suggested_priority,
        pp.suggested_title,
        pp.rationale,
        pp.proposal_data,
        pp.fingerprint,
        -- Extract the gap key for similarity matching
        CASE pp.proposal_source
            WHEN 'benchmark_red_light' THEN pp.proposal_data->>'metric_code'
            WHEN 'chronic_issue' THEN pp.proposal_data->>'issue_key'
            WHEN 'policy_recommendation' THEN pp.proposal_data->>'recommendation_type'
        END AS gap_key
    FROM fin.vw_program_proposal pp
),
-- Historical programs addressing similar gaps
similar_programs AS (
    SELECT
        cp.tenant_id,
        cp.entity_code,
        g->>'type' AS gap_type,
        g->>'key' AS gap_key,
        cp.id AS program_id,
        cp.program_code,
        cp.title AS program_title,
        cp.program_type,
        cp.status,
        cp.priority,
        cp.baseline_metrics,
        cp.target_outcomes,
        cp.actual_start,
        cp.actual_end,
        EXTRACT(DAY FROM (coalesce(cp.actual_end, now()) - cp.actual_start))::int AS duration_days,
        -- Milestone completion from portfolio view
        vpp.milestone_completion_pct,
        vpp.health,
        vpp.total_milestones,
        vpp.completed_milestones
    FROM fin.control_program cp
    CROSS JOIN LATERAL jsonb_array_elements(cp.linked_gaps) AS g
    LEFT JOIN fin.vw_program_portfolio vpp ON vpp.id = cp.id
),
-- Outcome scoring for completed programs
program_outcomes AS (
    SELECT
        sp.tenant_id,
        sp.entity_code,
        sp.gap_key,
        count(*) AS total_similar,
        count(*) FILTER (WHERE sp.status IN ('completed', 'closed')) AS completed_count,
        count(*) FILTER (WHERE sp.status = 'cancelled') AS cancelled_count,
        count(*) FILTER (WHERE sp.health = 'green') AS healthy_count,
        round(avg(sp.duration_days) FILTER (WHERE sp.status IN ('completed', 'closed')), 0) AS avg_completion_days,
        round(avg(sp.milestone_completion_pct) FILTER (WHERE sp.status IN ('completed', 'closed')), 1) AS avg_milestone_pct,
        -- Success rate
        round(
            count(*) FILTER (WHERE sp.status IN ('completed', 'closed'))::decimal
            / GREATEST(count(*), 1) * 100, 1
        ) AS success_rate
    FROM similar_programs sp
    GROUP BY sp.tenant_id, sp.entity_code, sp.gap_key
),
-- Previous proposal decisions for this gap (acceptance history)
proposal_history AS (
    SELECT
        cal.tenant_id,
        cal.entity_code,
        cal.fingerprint,
        count(*) AS times_proposed,
        count(*) FILTER (WHERE cal.status = 'accepted') AS times_accepted,
        count(*) FILTER (WHERE cal.status = 'dismissed') AS times_dismissed,
        max(cal.outcome_notes) FILTER (WHERE cal.status = 'dismissed') AS last_dismiss_reason
    FROM fin.close_action_log cal
    WHERE cal.action_type = 'propose_program'
    GROUP BY cal.tenant_id, cal.entity_code, cal.fingerprint
)
SELECT
    p.tenant_id,
    p.entity_code,
    p.fiscal_year,
    p.period_number,
    p.proposal_source,
    p.suggested_program_type,
    p.suggested_priority,
    p.suggested_title,
    p.rationale,
    p.fingerprint,
    p.gap_key,

    -- Evidence: what generated this proposal
    p.proposal_data AS evidence_data,

    -- Control memory: historical context for this gap
    cm.occurrence_count AS gap_occurrence_count,
    cm.programs_created AS gap_programs_ever_created,
    cm.programs_completed AS gap_programs_ever_completed,
    cm.ever_resolved AS gap_ever_resolved,
    cm.memory_data AS gap_memory,

    -- Similar programs: what historical programs addressed the same gap
    po.total_similar AS similar_program_count,
    po.completed_count AS similar_completed,
    po.cancelled_count AS similar_cancelled,
    po.healthy_count AS similar_healthy,
    po.avg_completion_days AS similar_avg_days,
    po.avg_milestone_pct AS similar_avg_milestone_pct,
    po.success_rate AS similar_success_rate,

    -- Proposal history: was this exact proposal offered before?
    coalesce(ph.times_proposed, 0) AS times_previously_proposed,
    coalesce(ph.times_accepted, 0) AS times_previously_accepted,
    coalesce(ph.times_dismissed, 0) AS times_previously_dismissed,
    ph.last_dismiss_reason,

    -- Confidence signal
    CASE
        WHEN coalesce(po.success_rate, 0) >= 75 AND coalesce(ph.times_dismissed, 0) = 0
            THEN 'high_confidence'
        WHEN coalesce(po.success_rate, 0) >= 50
            THEN 'moderate_confidence'
        WHEN coalesce(ph.times_dismissed, 0) > coalesce(ph.times_accepted, 0)
            THEN 'previously_rejected'
        WHEN coalesce(po.total_similar, 0) = 0
            THEN 'no_precedent'
        ELSE 'low_confidence'
    END AS confidence_level

FROM proposals p
LEFT JOIN fin.vw_control_memory cm
    ON cm.tenant_id = p.tenant_id
    AND cm.entity_code = p.entity_code
    AND cm.object_key = p.gap_key
    AND cm.object_kind = CASE p.proposal_source
        WHEN 'benchmark_red_light' THEN 'benchmark_metric'
        WHEN 'chronic_issue' THEN 'chronic_issue'
        WHEN 'policy_recommendation' THEN 'policy_recommendation'
    END
LEFT JOIN program_outcomes po
    ON po.tenant_id = p.tenant_id
    AND po.entity_code = p.entity_code
    AND po.gap_key = p.gap_key
LEFT JOIN proposal_history ph
    ON ph.tenant_id = p.tenant_id
    AND ph.entity_code = p.entity_code
    AND ph.fingerprint = p.fingerprint;

COMMENT ON VIEW fin.vw_proposal_provenance IS
    'Phase 20: Enriched program proposals with explainable provenance — evidence source, control memory, similar historical programs, outcome success rates, prior proposal decisions, and confidence level.';


-- ############################################################################
-- 4. GOVERNANCE PATHWAY — issue → recommendation → program → outcome
-- ############################################################################
-- Traces the full lifecycle pathway from root cause to resolution.
-- Answers: "What's the most common path from issue to resolution?"
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_governance_pathway CASCADE;
CREATE OR REPLACE VIEW fin.vw_governance_pathway AS
WITH
-- Stage 1: Issues (chronic issues + benchmark red-lights)
issues AS (
    SELECT
        ci.tenant_id,
        ci.entity_code,
        'chronic_issue' AS issue_source,
        ci.issue_type AS issue_type,
        ci.issue_key,
        ci.description AS issue_label,
        ci.occurrence_count AS issue_severity_count
    FROM fin.vw_chronic_control_issues ci

    UNION ALL

    SELECT
        b.tenant_id,
        b.entity_code,
        'benchmark_red' AS issue_source,
        b.metric_code AS issue_type,
        b.metric_code AS issue_key,
        b.metric_label AS issue_label,
        count(*) OVER (
            PARTITION BY b.tenant_id, b.entity_code, b.metric_code
        ) AS issue_severity_count
    FROM fin.vw_control_benchmark b
    WHERE b.traffic_light = 'red'
),
-- Stage 2: Recommendations linked to issues
recommendations AS (
    SELECT DISTINCT
        pr.tenant_id,
        pr.entity_code,
        pr.recommendation_type,
        pr.policy_area,
        pr.title AS recommendation_title,
        pr.priority AS recommendation_priority,
        -- Map recommendation back to issue key
        CASE
            WHEN pr.recommendation_type IN ('TIGHTEN_OVERRIDE_POLICY', 'REVIEW_OVERRIDE_TOLERANCE')
                THEN 'override_density_pct'
            WHEN pr.recommendation_type = 'ENFORCE_EVIDENCE_SLA'
                THEN 'evidence_turnaround_days'
            WHEN pr.recommendation_type = 'INCREASE_ATTESTATION_CADENCE'
                THEN 'attestation_lag_days'
            WHEN pr.recommendation_type = 'ENFORCE_DISTRIBUTION_GOVERNANCE'
                THEN 'bundle_distribution_pct'
            WHEN pr.recommendation_type = 'IMPROVE_CLOSE_READINESS'
                THEN 'close_readiness_score'
            WHEN pr.recommendation_type = 'ADDRESS_CHRONIC_LATE_TASKS'
                THEN (pr.recommendation_data->>'issue_key')
            WHEN pr.recommendation_type = 'CREATE_PBC_TEMPLATE'
                THEN (pr.recommendation_data->>'issue_key')
            ELSE pr.recommendation_type
        END AS linked_issue_key
    FROM fin.vw_policy_recommendation pr
),
-- Stage 3: Programs addressing issues/recommendations
programs AS (
    SELECT
        cp.tenant_id,
        cp.entity_code,
        cp.id AS program_id,
        cp.program_code,
        cp.title AS program_title,
        cp.program_type,
        cp.status AS program_status,
        cp.priority AS program_priority,
        g->>'type' AS gap_type,
        g->>'key' AS gap_key,
        vpp.health AS program_health,
        vpp.milestone_completion_pct,
        vpp.elapsed_days,
        cp.baseline_metrics,
        cp.target_outcomes
    FROM fin.control_program cp
    CROSS JOIN LATERAL jsonb_array_elements(cp.linked_gaps) AS g
    LEFT JOIN fin.vw_program_portfolio vpp ON vpp.id = cp.id
),
-- Stage 4: Outcomes — metric improvement after program completion
outcomes AS (
    SELECT
        cp.tenant_id,
        cp.entity_code,
        cp.id AS program_id,
        bm.key AS metric_code,
        (bm.value->>'value')::decimal AS baseline_value,
        (bm.value->>'trafficLight') AS baseline_traffic_light,
        -- Current value from latest benchmark
        cb.actual_value AS current_value,
        cb.traffic_light AS current_traffic_light,
        -- Did it improve?
        CASE
            WHEN cb.traffic_light = 'green' AND (bm.value->>'trafficLight') != 'green'
                THEN 'improved_to_green'
            WHEN cb.traffic_light = 'amber' AND (bm.value->>'trafficLight') = 'red'
                THEN 'improved_to_amber'
            WHEN cb.traffic_light = (bm.value->>'trafficLight')
                THEN 'unchanged'
            ELSE 'declined'
        END AS outcome_direction
    FROM fin.control_program cp
    CROSS JOIN LATERAL jsonb_each(cp.baseline_metrics) AS bm(key, value)
    LEFT JOIN LATERAL (
        SELECT b.actual_value, b.traffic_light
        FROM fin.vw_control_benchmark b
        WHERE b.tenant_id = cp.tenant_id
          AND b.entity_code = cp.entity_code
          AND b.metric_code = bm.key
        ORDER BY b.fiscal_year DESC, b.period_number DESC
        LIMIT 1
    ) cb ON true
    WHERE cp.status IN ('completed', 'closed', 'active')
      AND cp.baseline_metrics != '{}'::jsonb
)
-- Assemble full pathways
SELECT
    i.tenant_id,
    i.entity_code,

    -- Stage 1: Issue
    i.issue_source,
    i.issue_type,
    i.issue_key,
    i.issue_label,
    i.issue_severity_count,

    -- Stage 2: Recommendation (may be NULL if no recommendation exists)
    r.recommendation_type,
    r.policy_area,
    r.recommendation_title,
    r.recommendation_priority,

    -- Stage 3: Program (may be NULL if no program created)
    p.program_id,
    p.program_code,
    p.program_title,
    p.program_type,
    p.program_status,
    p.program_priority,
    p.program_health,
    p.milestone_completion_pct,
    p.elapsed_days,

    -- Stage 4: Outcome (may be NULL if no baseline captured or program not complete)
    o.metric_code AS outcome_metric,
    o.baseline_value,
    o.baseline_traffic_light,
    o.current_value,
    o.current_traffic_light,
    o.outcome_direction,

    -- Pathway completeness
    CASE
        WHEN o.outcome_direction IS NOT NULL THEN 'full_pathway'
        WHEN p.program_id IS NOT NULL THEN 'program_in_progress'
        WHEN r.recommendation_type IS NOT NULL THEN 'recommendation_only'
        ELSE 'issue_only'
    END AS pathway_stage,

    -- Pathway success
    CASE
        WHEN o.outcome_direction IN ('improved_to_green', 'improved_to_amber') THEN true
        WHEN p.program_status IN ('completed', 'closed') AND p.program_health = 'green' THEN true
        ELSE false
    END AS pathway_successful

FROM issues i
LEFT JOIN recommendations r
    ON r.tenant_id = i.tenant_id
    AND r.entity_code = i.entity_code
    AND r.linked_issue_key = i.issue_key
LEFT JOIN programs p
    ON p.tenant_id = i.tenant_id
    AND p.entity_code = i.entity_code
    AND (
        (p.gap_type = 'chronic_issue' AND p.gap_key = i.issue_key)
        OR (p.gap_type = 'benchmark_red' AND p.gap_key = i.issue_key)
        OR (p.gap_type = 'policy_recommendation' AND p.gap_key = r.recommendation_type)
    )
LEFT JOIN outcomes o
    ON o.tenant_id = i.tenant_id
    AND o.entity_code = i.entity_code
    AND o.program_id = p.program_id;

COMMENT ON VIEW fin.vw_governance_pathway IS
    'Phase 20: Full lifecycle pathway from issue → recommendation → program → outcome. Traces root causes through to resolution with success indicators.';
