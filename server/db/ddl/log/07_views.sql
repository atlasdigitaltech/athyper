-- ============================================================================
-- log/07_views.sql
-- Views and materialized views reconstructed from the live catalog.
-- Generated from the live Neon database log schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE VIEW "log"."v_resolution_pipeline" AS
SELECT tenant_id,
    pipeline_id,
    txn_id,
    max(direction) FILTER (WHERE resolution_step = 'CONTEXT'::text) AS direction,
    max(flow_code) FILTER (WHERE resolution_step = 'CONTEXT'::text) AS flow_code,
    max(doc_type) FILTER (WHERE resolution_step = 'CONTEXT'::text) AS doc_type,
    max(currency_code) FILTER (WHERE resolution_step = 'CONTEXT'::text) AS currency_code,
    max(amount) FILTER (WHERE resolution_step = 'CONTEXT'::text) AS amount,
    bool_or(is_cross_border) FILTER (WHERE resolution_step = 'CONTEXT'::text) AS is_cross_border,
    bool_or(is_intercompany) FILTER (WHERE resolution_step = 'CONTEXT'::text) AS is_intercompany,
    max(resolved_intent_id::text) FILTER (WHERE resolution_step = 'INTENT'::text)::uuid AS resolved_intent_id,
    max(resolved_domain) FILTER (WHERE resolution_step = 'INTENT'::text) AS resolved_domain,
    max(matched_rule_id::text) FILTER (WHERE resolution_step = 'INTENT'::text)::uuid AS intent_rule_id,
    max(confidence) FILTER (WHERE resolution_step = 'INTENT'::text) AS intent_confidence,
    max(resolution_method) FILTER (WHERE resolution_step = 'INTENT'::text) AS intent_method,
    max(explanation) FILTER (WHERE resolution_step = 'INTENT'::text) AS intent_explanation,
    max(resolved_profile_config_id::text) FILTER (WHERE resolution_step = 'PROFILE'::text)::uuid AS resolved_profile_config_id,
    max(resolved_profile_code) FILTER (WHERE resolution_step = 'PROFILE'::text) AS resolved_profile_code,
    max(subledger_type) FILTER (WHERE resolution_step = 'PROFILE'::text) AS subledger_type,
    max(profile_type) FILTER (WHERE resolution_step = 'PROFILE'::text) AS profile_type,
    max(profile_version) FILTER (WHERE resolution_step = 'PROFILE'::text) AS profile_version,
    max(matched_rule_id::text) FILTER (WHERE resolution_step = 'PROFILE'::text)::uuid AS profile_rule_id,
    max(matched_override_id::text) FILTER (WHERE resolution_step = 'PROFILE'::text)::uuid AS profile_override_id,
    max(confidence) FILTER (WHERE resolution_step = 'PROFILE'::text) AS profile_confidence,
    max(event_count) FILTER (WHERE resolution_step = 'PROFILE'::text) AS event_count,
    max(entry_template_count) FILTER (WHERE resolution_step = 'PROFILE'::text) AS entry_template_count,
    bool_or(creates_commitment) FILTER (WHERE resolution_step = 'PROFILE'::text) AS creates_commitment,
    bool_or(has_paired_profile) FILTER (WHERE resolution_step = 'PROFILE'::text) AS has_paired_profile,
    bool_or(was_overridden) AS was_overridden,
    min(resolved_at) AS pipeline_started_at,
    max(resolved_at) AS pipeline_completed_at,
    sum(evaluation_ms) AS total_evaluation_ms,
    count(*) AS steps_logged
   FROM log.resolution_log rl
  GROUP BY tenant_id, pipeline_id, txn_id;

COMMENT ON VIEW "log"."v_resolution_pipeline" IS 'Engine 4.13: pivoted resolution audit — one row per (pipeline_id, txn_id). Aggregates CONTEXT / INTENT / PROFILE steps from log.resolution_log. was_overridden = true if any step was manually overridden.';
