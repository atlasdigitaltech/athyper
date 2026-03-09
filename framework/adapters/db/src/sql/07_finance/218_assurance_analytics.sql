-- ============================================================================
-- 218_assurance_analytics.sql
--
-- Phase 16: Continuous Controls Monitoring & Assurance Analytics.
-- Pure analytics layer — zero new tables. Four SQL views that aggregate
-- existing operational data into control intelligence surfaces.
--
-- Views:
--   1. fin.vw_control_effectiveness — override rates, clean close trends,
--      attestation timeliness, evidence turnaround, distribution completion
--   2. fin.vw_assurance_workload — open requests by owner/org/severity,
--      overdue PBC items, fulfillment aging, workload spikes
--   3. fin.vw_chronic_control_issues — cross-period pattern detection for
--      late tasks, override-heavy periods, repeat evidence domains
--   4. fin.vw_assurance_scorecard — role-based composite scores for
--      finance leadership, controller, audit coordinator
--
-- Design principles:
--   1. No new tables — read-only aggregation of existing data
--   2. Views not materialized — always fresh (data volume is bounded per period)
--   3. MC-4 compliant — amounts as decimal, rendered as string in BFF
--   4. Tenant-isolated in every view
-- ============================================================================


-- ############################################################################
-- 1. CONTROL EFFECTIVENESS — per-period control quality metrics
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_control_effectiveness CASCADE;
CREATE OR REPLACE VIEW fin.vw_control_effectiveness AS
WITH
-- Override rates per period
override_metrics AS (
    SELECT
        o.tenant_id,
        cr.entity_code,
        cr.fiscal_year,
        cr.period_number,
        count(*) AS total_overrides,
        count(*) FILTER (WHERE o.status = 'APPROVED') AS approved_overrides,
        count(*) FILTER (WHERE o.status = 'REJECTED') AS rejected_overrides,
        coalesce(sum(o.impact_amount) FILTER (WHERE o.status = 'APPROVED'), 0) AS approved_impact,
        -- Override density: approved overrides / total mandatory tasks
        CASE WHEN (
            SELECT count(*) FROM fin.period_close_checklist cl
            WHERE cl.tenant_id = o.tenant_id
              AND cl.entity_code = cr.entity_code
              AND cl.fiscal_year = cr.fiscal_year
              AND cl.period_number = cr.period_number
              AND cl.is_mandatory = true
        ) > 0 THEN
            round(count(*) FILTER (WHERE o.status = 'APPROVED')::decimal /
                (SELECT count(*) FROM fin.period_close_checklist cl
                 WHERE cl.tenant_id = o.tenant_id
                   AND cl.entity_code = cr.entity_code
                   AND cl.fiscal_year = cr.fiscal_year
                   AND cl.period_number = cr.period_number
                   AND cl.is_mandatory = true) * 100, 2)
        ELSE 0 END AS override_density_pct
    FROM fin.close_override o
    JOIN fin.close_run cr ON cr.id = o.run_id
    GROUP BY o.tenant_id, cr.entity_code, cr.fiscal_year, cr.period_number
),
-- Clean close assessment per period
clean_close AS (
    SELECT
        cl.tenant_id,
        cl.entity_code,
        cl.fiscal_year,
        cl.period_number,
        count(*) AS total_tasks,
        count(*) FILTER (WHERE cl.task_status = 'COMPLETED') AS completed_tasks,
        count(*) FILTER (WHERE cl.task_status = 'WAIVED') AS waived_tasks,
        count(*) FILTER (WHERE cl.task_status IN ('BLOCKED','FAILED')) AS blocked_tasks,
        round(count(*) FILTER (WHERE cl.task_status IN ('COMPLETED','WAIVED'))::decimal
              / GREATEST(count(*), 1) * 100, 2) AS completion_pct,
        -- Clean = no waivers, no blocked/failed, completion >= 100%
        CASE WHEN count(*) FILTER (WHERE cl.task_status = 'WAIVED') = 0
                  AND count(*) FILTER (WHERE cl.task_status IN ('BLOCKED','FAILED')) = 0
                  AND count(*) FILTER (WHERE cl.task_status = 'COMPLETED') = count(*)
             THEN true ELSE false END AS is_clean_close
    FROM fin.period_close_checklist cl
    GROUP BY cl.tenant_id, cl.entity_code, cl.fiscal_year, cl.period_number
),
-- Evidence request turnaround
evidence_metrics AS (
    SELECT
        ai.tenant_id,
        ai.entity_code,
        ai.fiscal_year,
        ai.period_number,
        count(*) AS total_requests,
        count(*) FILTER (WHERE ai.status = 'resolved') AS fulfilled_requests,
        count(*) FILTER (WHERE ai.status = 'dismissed') AS rejected_requests,
        count(*) FILTER (WHERE ai.status NOT IN ('resolved','dismissed')) AS open_requests,
        count(*) FILTER (WHERE ai.due_at < now() AND ai.status NOT IN ('resolved','dismissed')) AS overdue_requests,
        -- Average turnaround (days) for fulfilled requests
        round(avg(EXTRACT(EPOCH FROM (ai.resolved_at - ai.created_at)) / 86400)
              FILTER (WHERE ai.status = 'resolved' AND ai.resolved_at IS NOT NULL), 1)
            AS avg_turnaround_days
    FROM fin.action_item ai
    WHERE ai.target_kind IN ('evidence_request', 'pbc_item')
    GROUP BY ai.tenant_id, ai.entity_code, ai.fiscal_year, ai.period_number
),
-- Attestation timeliness
attestation_metrics AS (
    SELECT
        ra.tenant_id,
        ra.entity_code,
        ra.fiscal_year,
        ra.period_number,
        count(*) AS total_attestations,
        count(DISTINCT ra.attested_by) AS unique_attestors,
        count(DISTINCT ra.attestation_type) AS attestation_types_covered,
        -- Average time from snapshot creation to attestation
        round(avg(EXTRACT(EPOCH FROM (ra.attested_at - ra.created_at)) / 86400), 1)
            AS avg_attestation_lag_days
    FROM fin.review_attestation ra
    WHERE ra.status = 'confirmed'
    GROUP BY ra.tenant_id, ra.entity_code, ra.fiscal_year, ra.period_number
),
-- Bundle distribution completion
bundle_metrics AS (
    SELECT
        eb.tenant_id,
        eb.entity_code,
        eb.fiscal_year,
        eb.period_number,
        count(*) AS total_bundles,
        count(*) FILTER (WHERE eb.status = 'DISTRIBUTED') AS distributed_bundles,
        count(*) FILTER (WHERE eb.status = 'SEALED') AS sealed_bundles,
        count(*) FILTER (WHERE eb.status = 'DRAFT') AS draft_bundles,
        count(*) FILTER (WHERE eb.status = 'EXPIRED') AS expired_bundles,
        round(count(*) FILTER (WHERE eb.status = 'DISTRIBUTED')::decimal
              / GREATEST(count(*), 1) * 100, 2) AS distribution_completion_pct
    FROM fin.evidence_bundle eb
    GROUP BY eb.tenant_id, eb.entity_code, eb.fiscal_year, eb.period_number
),
-- Latest readiness score
readiness AS (
    SELECT DISTINCT ON (cr.tenant_id, cr.entity_code, cr.fiscal_year, cr.period_number)
        cr.tenant_id,
        cr.entity_code,
        cr.fiscal_year,
        cr.period_number,
        s.readiness_score,
        s.completion_pct AS readiness_completion_pct
    FROM fin.close_readiness_snapshot s
    JOIN fin.close_run cr ON cr.id = s.run_id
    ORDER BY cr.tenant_id, cr.entity_code, cr.fiscal_year, cr.period_number,
             s.captured_at DESC
)
SELECT
    cc.tenant_id,
    cc.entity_code,
    cc.fiscal_year,
    cc.period_number,
    -- Close metrics
    cc.total_tasks,
    cc.completed_tasks,
    cc.waived_tasks,
    cc.blocked_tasks,
    cc.completion_pct,
    cc.is_clean_close,
    -- Override metrics
    coalesce(om.total_overrides, 0) AS total_overrides,
    coalesce(om.approved_overrides, 0) AS approved_overrides,
    coalesce(om.approved_impact, 0) AS approved_impact,
    coalesce(om.override_density_pct, 0) AS override_density_pct,
    -- Evidence request metrics
    coalesce(em.total_requests, 0) AS evidence_total_requests,
    coalesce(em.fulfilled_requests, 0) AS evidence_fulfilled,
    coalesce(em.open_requests, 0) AS evidence_open,
    coalesce(em.overdue_requests, 0) AS evidence_overdue,
    coalesce(em.avg_turnaround_days, 0) AS evidence_avg_turnaround_days,
    -- Attestation metrics
    coalesce(am.total_attestations, 0) AS total_attestations,
    coalesce(am.unique_attestors, 0) AS unique_attestors,
    coalesce(am.attestation_types_covered, 0) AS attestation_types_covered,
    coalesce(am.avg_attestation_lag_days, 0) AS avg_attestation_lag_days,
    -- Bundle metrics
    coalesce(bm.total_bundles, 0) AS total_bundles,
    coalesce(bm.distributed_bundles, 0) AS distributed_bundles,
    coalesce(bm.sealed_bundles, 0) AS sealed_bundles,
    coalesce(bm.draft_bundles, 0) AS draft_bundles,
    coalesce(bm.expired_bundles, 0) AS expired_bundles,
    coalesce(bm.distribution_completion_pct, 0) AS bundle_distribution_pct,
    -- Readiness
    r.readiness_score,
    r.readiness_completion_pct
FROM clean_close cc
LEFT JOIN override_metrics om USING (tenant_id, entity_code, fiscal_year, period_number)
LEFT JOIN evidence_metrics em USING (tenant_id, entity_code, fiscal_year, period_number)
LEFT JOIN attestation_metrics am USING (tenant_id, entity_code, fiscal_year, period_number)
LEFT JOIN bundle_metrics bm USING (tenant_id, entity_code, fiscal_year, period_number)
LEFT JOIN readiness r USING (tenant_id, entity_code, fiscal_year, period_number);

COMMENT ON VIEW fin.vw_control_effectiveness IS
    'Per-period control effectiveness metrics: override rates, clean close, evidence turnaround, attestation timeliness, bundle distribution.';


-- ############################################################################
-- 2. ASSURANCE WORKLOAD — current open work & aging
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_assurance_workload CASCADE;
CREATE OR REPLACE VIEW fin.vw_assurance_workload AS
SELECT
    ai.tenant_id,
    ai.entity_code,
    ai.fiscal_year,
    ai.period_number,
    -- Request identity
    ai.id AS request_id,
    ai.title,
    ai.severity,
    ai.status,
    ai.source,
    ai.category,
    -- Assignment
    ai.assigned_role,
    ai.assigned_to,
    -- Timing
    ai.created_at,
    ai.due_at,
    ai.resolved_at,
    -- Requesting org (from structured_data)
    ai.structured_data ->> 'requested_by_org' AS requested_by_org,
    -- Computed aging
    EXTRACT(DAY FROM (now() - ai.created_at))::int AS age_days,
    CASE WHEN ai.due_at IS NOT NULL AND ai.due_at < now()
              AND ai.status NOT IN ('resolved', 'dismissed')
         THEN EXTRACT(DAY FROM (now() - ai.due_at))::int
         ELSE 0 END AS overdue_days,
    -- Fulfillment duration (for resolved items)
    CASE WHEN ai.resolved_at IS NOT NULL
         THEN EXTRACT(DAY FROM (ai.resolved_at - ai.created_at))::int
         ELSE NULL END AS fulfillment_days,
    -- Is overdue flag
    CASE WHEN ai.due_at IS NOT NULL AND ai.due_at < now()
              AND ai.status NOT IN ('resolved', 'dismissed')
         THEN true ELSE false END AS is_overdue,
    -- Is open flag
    ai.status NOT IN ('resolved', 'dismissed') AS is_open
FROM fin.action_item ai
WHERE ai.target_kind IN ('evidence_request', 'pbc_item');

COMMENT ON VIEW fin.vw_assurance_workload IS
    'Evidence request workload view with aging, overdue calculations, and requesting org extraction. Supports workload dashboards and SLA monitoring.';


-- ############################################################################
-- 3. CHRONIC CONTROL ISSUES — cross-period pattern detection
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_chronic_control_issues CASCADE;
CREATE OR REPLACE VIEW fin.vw_chronic_control_issues AS
WITH
-- Tasks that were late (BLOCKED/FAILED) across multiple periods
late_tasks AS (
    SELECT
        cl.tenant_id,
        cl.entity_code,
        cl.task_code,
        count(DISTINCT (cl.fiscal_year, cl.period_number)) AS periods_late,
        array_agg(DISTINCT cl.fiscal_year || '-P' || cl.period_number
                  ORDER BY cl.fiscal_year || '-P' || cl.period_number) AS late_periods,
        max(cl.fiscal_year * 100 + cl.period_number) AS latest_period_key
    FROM fin.period_close_checklist cl
    WHERE cl.task_status IN ('BLOCKED', 'FAILED')
    GROUP BY cl.tenant_id, cl.entity_code, cl.task_code
    HAVING count(DISTINCT (cl.fiscal_year, cl.period_number)) >= 2
),
-- Periods with high override counts (> 3 approved overrides)
override_heavy AS (
    SELECT
        o.tenant_id,
        cr.entity_code,
        cr.fiscal_year,
        cr.period_number,
        count(*) FILTER (WHERE o.status = 'APPROVED') AS approved_count,
        sum(o.impact_amount) FILTER (WHERE o.status = 'APPROVED') AS total_impact
    FROM fin.close_override o
    JOIN fin.close_run cr ON cr.id = o.run_id
    GROUP BY o.tenant_id, cr.entity_code, cr.fiscal_year, cr.period_number
    HAVING count(*) FILTER (WHERE o.status = 'APPROVED') > 3
),
-- Repeated evidence requests against same category
repeat_evidence AS (
    SELECT
        ai.tenant_id,
        ai.entity_code,
        ai.category,
        ai.structured_data ->> 'requested_by_org' AS org,
        count(*) AS request_count,
        count(DISTINCT (ai.fiscal_year, ai.period_number)) AS periods_requested,
        array_agg(DISTINCT ai.fiscal_year || '-P' || ai.period_number
                  ORDER BY ai.fiscal_year || '-P' || ai.period_number) AS request_periods
    FROM fin.action_item ai
    WHERE ai.target_kind IN ('evidence_request', 'pbc_item')
      AND ai.category IS NOT NULL
    GROUP BY ai.tenant_id, ai.entity_code, ai.category,
             ai.structured_data ->> 'requested_by_org'
    HAVING count(*) >= 3 OR count(DISTINCT (ai.fiscal_year, ai.period_number)) >= 2
),
-- Periods without clean close
non_clean_periods AS (
    SELECT
        cl.tenant_id,
        cl.entity_code,
        cl.fiscal_year,
        cl.period_number,
        count(*) FILTER (WHERE cl.task_status = 'WAIVED') AS waived,
        count(*) FILTER (WHERE cl.task_status IN ('BLOCKED','FAILED')) AS blocked
    FROM fin.period_close_checklist cl
    GROUP BY cl.tenant_id, cl.entity_code, cl.fiscal_year, cl.period_number
    HAVING count(*) FILTER (WHERE cl.task_status = 'WAIVED') > 0
        OR count(*) FILTER (WHERE cl.task_status IN ('BLOCKED','FAILED')) > 0
)
-- Union all chronic issues into a single typed result
SELECT
    tenant_id, entity_code,
    'RECURRING_LATE_TASK' AS issue_type,
    task_code AS issue_key,
    'Task ' || task_code || ' late in ' || periods_late || ' periods' AS description,
    periods_late AS occurrence_count,
    late_periods AS affected_periods,
    latest_period_key AS latest_period,
    NULL::decimal AS impact_amount
FROM late_tasks

UNION ALL

SELECT
    tenant_id, entity_code,
    'OVERRIDE_HEAVY_PERIOD' AS issue_type,
    fiscal_year || '-P' || period_number AS issue_key,
    approved_count || ' approved overrides totaling ' || total_impact AS description,
    approved_count AS occurrence_count,
    ARRAY[fiscal_year || '-P' || period_number] AS affected_periods,
    fiscal_year * 100 + period_number AS latest_period,
    total_impact AS impact_amount
FROM override_heavy

UNION ALL

SELECT
    tenant_id, entity_code,
    'REPEAT_EVIDENCE_DOMAIN' AS issue_type,
    coalesce(category, 'uncategorized') || ':' || coalesce(org, 'any') AS issue_key,
    request_count || ' requests for ' || coalesce(category, 'uncategorized')
        || ' from ' || coalesce(org, 'multiple orgs')
        || ' across ' || periods_requested || ' periods' AS description,
    request_count AS occurrence_count,
    request_periods AS affected_periods,
    0 AS latest_period,
    NULL::decimal AS impact_amount
FROM repeat_evidence

UNION ALL

SELECT
    tenant_id, entity_code,
    'NON_CLEAN_CLOSE' AS issue_type,
    fiscal_year || '-P' || period_number AS issue_key,
    waived || ' waived, ' || blocked || ' blocked/failed tasks' AS description,
    waived + blocked AS occurrence_count,
    ARRAY[fiscal_year || '-P' || period_number] AS affected_periods,
    fiscal_year * 100 + period_number AS latest_period,
    NULL::decimal AS impact_amount
FROM non_clean_periods;

COMMENT ON VIEW fin.vw_chronic_control_issues IS
    'Cross-period chronic issue detection: recurring late tasks, override-heavy periods, repeat evidence domains, non-clean closes.';


-- ############################################################################
-- 4. ASSURANCE SCORECARD — composite scores by role
-- ############################################################################

DROP VIEW IF EXISTS fin.vw_assurance_scorecard CASCADE;
CREATE OR REPLACE VIEW fin.vw_assurance_scorecard AS
WITH base AS (
    SELECT * FROM fin.vw_control_effectiveness
),
chronic_counts AS (
    SELECT
        tenant_id, entity_code,
        count(*) FILTER (WHERE issue_type = 'RECURRING_LATE_TASK') AS chronic_late_tasks,
        count(*) FILTER (WHERE issue_type = 'OVERRIDE_HEAVY_PERIOD') AS chronic_override_periods,
        count(*) FILTER (WHERE issue_type = 'REPEAT_EVIDENCE_DOMAIN') AS chronic_evidence_domains,
        count(*) FILTER (WHERE issue_type = 'NON_CLEAN_CLOSE') AS non_clean_count
    FROM fin.vw_chronic_control_issues
    GROUP BY tenant_id, entity_code
)
SELECT
    b.tenant_id,
    b.entity_code,
    b.fiscal_year,
    b.period_number,

    -- Close control score (0-100): clean close = 100, penalties for waivers/blocks/overrides
    GREATEST(0, LEAST(100,
        100
        - (CASE WHEN b.is_clean_close THEN 0 ELSE 20 END)
        - (b.waived_tasks * 5)
        - (b.blocked_tasks * 10)
        - (LEAST(b.override_density_pct, 30))
    ))::int AS close_control_score,

    -- Evidence fulfillment score (0-100): based on completion rate and turnaround
    GREATEST(0, LEAST(100,
        CASE WHEN b.evidence_total_requests = 0 THEN 100
        ELSE round(
            (b.evidence_fulfilled::decimal / GREATEST(b.evidence_total_requests, 1)) * 70
            + CASE WHEN b.evidence_avg_turnaround_days <= 3 THEN 30
                   WHEN b.evidence_avg_turnaround_days <= 7 THEN 20
                   WHEN b.evidence_avg_turnaround_days <= 14 THEN 10
                   ELSE 0 END
        ) END
    ))::int AS evidence_fulfillment_score,

    -- Attestation compliance score (0-100): based on coverage and timeliness
    GREATEST(0, LEAST(100,
        CASE WHEN b.total_attestations = 0 THEN 0
        ELSE round(
            LEAST(b.attestation_types_covered * 20, 60)
            + CASE WHEN b.avg_attestation_lag_days <= 1 THEN 40
                   WHEN b.avg_attestation_lag_days <= 3 THEN 30
                   WHEN b.avg_attestation_lag_days <= 7 THEN 15
                   ELSE 0 END
        ) END
    ))::int AS attestation_compliance_score,

    -- Distribution governance score (0-100): bundles sealed and distributed
    GREATEST(0, LEAST(100,
        CASE WHEN b.total_bundles = 0 THEN 100
        ELSE round(b.bundle_distribution_pct * 0.7 +
            CASE WHEN b.draft_bundles = 0 THEN 30 ELSE 30 - LEAST(b.draft_bundles * 10, 30) END
        ) END
    ))::int AS distribution_governance_score,

    -- Overall assurance score (weighted composite)
    GREATEST(0, LEAST(100, round(
        GREATEST(0, LEAST(100,
            100 - (CASE WHEN b.is_clean_close THEN 0 ELSE 20 END)
            - (b.waived_tasks * 5) - (b.blocked_tasks * 10)
            - (LEAST(b.override_density_pct, 30))
        )) * 0.35   -- close control: 35%
        + GREATEST(0, LEAST(100,
            CASE WHEN b.evidence_total_requests = 0 THEN 100
            ELSE (b.evidence_fulfilled::decimal / GREATEST(b.evidence_total_requests, 1)) * 70
                + CASE WHEN b.evidence_avg_turnaround_days <= 3 THEN 30
                       WHEN b.evidence_avg_turnaround_days <= 7 THEN 20
                       WHEN b.evidence_avg_turnaround_days <= 14 THEN 10
                       ELSE 0 END
            END
        )) * 0.25   -- evidence fulfillment: 25%
        + GREATEST(0, LEAST(100,
            CASE WHEN b.total_attestations = 0 THEN 0
            ELSE LEAST(b.attestation_types_covered * 20, 60)
                + CASE WHEN b.avg_attestation_lag_days <= 1 THEN 40
                       WHEN b.avg_attestation_lag_days <= 3 THEN 30
                       WHEN b.avg_attestation_lag_days <= 7 THEN 15
                       ELSE 0 END
            END
        )) * 0.20   -- attestation compliance: 20%
        + GREATEST(0, LEAST(100,
            CASE WHEN b.total_bundles = 0 THEN 100
            ELSE b.bundle_distribution_pct * 0.7 +
                CASE WHEN b.draft_bundles = 0 THEN 30 ELSE 30 - LEAST(b.draft_bundles * 10, 30) END
            END
        )) * 0.20   -- distribution governance: 20%
    )))::int AS overall_assurance_score,

    -- Chronic issue flags
    coalesce(cc.chronic_late_tasks, 0) AS chronic_late_tasks,
    coalesce(cc.chronic_override_periods, 0) AS chronic_override_periods,
    coalesce(cc.chronic_evidence_domains, 0) AS chronic_evidence_domains,
    coalesce(cc.non_clean_count, 0) AS non_clean_period_count,

    -- Rating
    CASE
        WHEN GREATEST(0, LEAST(100, round(
            100 * 0.35 + 100 * 0.25 + 100 * 0.20 + 100 * 0.20
        ))) >= 80 THEN 'STRONG'
        WHEN GREATEST(0, LEAST(100, round(
            100 * 0.35 + 100 * 0.25 + 100 * 0.20 + 100 * 0.20
        ))) >= 60 THEN 'ADEQUATE'
        WHEN GREATEST(0, LEAST(100, round(
            100 * 0.35 + 100 * 0.25 + 100 * 0.20 + 100 * 0.20
        ))) >= 40 THEN 'NEEDS_IMPROVEMENT'
        ELSE 'WEAK'
    END AS assurance_rating,

    -- Raw data for drill-down
    b.readiness_score,
    b.total_overrides,
    b.approved_impact,
    b.evidence_total_requests,
    b.evidence_overdue,
    b.total_attestations,
    b.total_bundles,
    b.is_clean_close
FROM base b
LEFT JOIN chronic_counts cc USING (tenant_id, entity_code);

COMMENT ON VIEW fin.vw_assurance_scorecard IS
    'Composite assurance scorecard: close control (35%), evidence fulfillment (25%), attestation compliance (20%), distribution governance (20%). Includes chronic issue flags and overall rating.';
