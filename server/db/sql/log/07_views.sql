-- ============================================================================
-- log/07_views.sql
-- Concept: Audit Views — resolution pipeline and audit summary views
-- Depends on: 04_tables/006_log.sql
-- ============================================================================


-- ============================================================================
-- §V3  log.v_resolution_pipeline
-- Pivots the 3-step resolution log into one row per (pipeline_id, txn_id).
-- Steps: CONTEXT (input snapshot), INTENT (Step 4), PROFILE (Step 4.5).
-- Useful for end-to-end tracing and resolution audits.
-- ============================================================================
CREATE OR REPLACE VIEW log.v_resolution_pipeline AS
SELECT
    rl.tenant_id,
    rl.pipeline_id,
    rl.txn_id,

    -- Transaction context (from CONTEXT step)
    max(rl.direction)           FILTER (WHERE rl.resolution_step = 'CONTEXT') AS direction,
    max(rl.flow_code)           FILTER (WHERE rl.resolution_step = 'CONTEXT') AS flow_code,
    max(rl.doc_type)            FILTER (WHERE rl.resolution_step = 'CONTEXT') AS doc_type,
    max(rl.currency_code)       FILTER (WHERE rl.resolution_step = 'CONTEXT') AS currency_code,
    max(rl.amount)              FILTER (WHERE rl.resolution_step = 'CONTEXT') AS amount,
    bool_or(rl.is_cross_border) FILTER (WHERE rl.resolution_step = 'CONTEXT') AS is_cross_border,
    bool_or(rl.is_intercompany) FILTER (WHERE rl.resolution_step = 'CONTEXT') AS is_intercompany,

    -- Intent resolution (from INTENT step)
    max(rl.resolved_intent_id::text)     FILTER (WHERE rl.resolution_step = 'INTENT')::uuid AS resolved_intent_id,
    max(rl.resolved_domain)        FILTER (WHERE rl.resolution_step = 'INTENT') AS resolved_domain,
    max(rl.matched_rule_id::text)        FILTER (WHERE rl.resolution_step = 'INTENT')::uuid AS intent_rule_id,
    max(rl.confidence)             FILTER (WHERE rl.resolution_step = 'INTENT') AS intent_confidence,
    max(rl.resolution_method)      FILTER (WHERE rl.resolution_step = 'INTENT') AS intent_method,
    max(rl.explanation)            FILTER (WHERE rl.resolution_step = 'INTENT') AS intent_explanation,

    -- Profile resolution (from PROFILE step)
    max(rl.resolved_profile_config_id::text) FILTER (WHERE rl.resolution_step = 'PROFILE')::uuid AS resolved_profile_config_id,
    max(rl.resolved_profile_code)      FILTER (WHERE rl.resolution_step = 'PROFILE') AS resolved_profile_code,
    max(rl.subledger_type)             FILTER (WHERE rl.resolution_step = 'PROFILE') AS subledger_type,
    max(rl.profile_type)               FILTER (WHERE rl.resolution_step = 'PROFILE') AS profile_type,
    max(rl.profile_version)            FILTER (WHERE rl.resolution_step = 'PROFILE') AS profile_version,
    max(rl.matched_rule_id::text)            FILTER (WHERE rl.resolution_step = 'PROFILE')::uuid AS profile_rule_id,
    max(rl.matched_override_id::text)        FILTER (WHERE rl.resolution_step = 'PROFILE')::uuid AS profile_override_id,
    max(rl.confidence)                 FILTER (WHERE rl.resolution_step = 'PROFILE') AS profile_confidence,
    max(rl.event_count)                FILTER (WHERE rl.resolution_step = 'PROFILE') AS event_count,
    max(rl.entry_template_count)       FILTER (WHERE rl.resolution_step = 'PROFILE') AS entry_template_count,
    bool_or(rl.creates_commitment)     FILTER (WHERE rl.resolution_step = 'PROFILE') AS creates_commitment,
    bool_or(rl.has_paired_profile)     FILTER (WHERE rl.resolution_step = 'PROFILE') AS has_paired_profile,
    bool_or(rl.was_overridden)                                                        AS was_overridden,

    -- Pipeline timing
    min(rl.resolved_at)         AS pipeline_started_at,
    max(rl.resolved_at)         AS pipeline_completed_at,
    sum(rl.evaluation_ms)       AS total_evaluation_ms,
    count(*)                    AS steps_logged

FROM log.resolution_log rl
GROUP BY rl.tenant_id, rl.pipeline_id, rl.txn_id;

COMMENT ON VIEW log.v_resolution_pipeline IS
    'Engine 4.13: pivoted resolution audit — one row per (pipeline_id, txn_id). '
    'Aggregates CONTEXT / INTENT / PROFILE steps from log.resolution_log. '
    'was_overridden = true if any step was manually overridden.';
