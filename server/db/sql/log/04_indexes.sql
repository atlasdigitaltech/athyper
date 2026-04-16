-- ============================================================================
-- log/04_indexes.sql
-- Concept: Audit Indexes — high-volume tenant+timestamp partition query paths
-- Depends on: 04_tables/006_log.sql
-- Naming: {table_abbrev}_{columns}_{idx|pidx}   (_pidx = partial index)
-- ============================================================================
-- Indexes for all 26 consolidated log tables.
-- All log tables are append-only — no UPDATE indexes needed.
-- Partition-aware: indexes on parents propagate to all children automatically.


-- —— §1  audit_log ———————————————————————————————————————————————————————
-- Primary: "show all changes to entity X"
CREATE INDEX IF NOT EXISTS al_entity_idx
    ON log.audit_log (tenant_id, entity_type, entity_id);
-- Actor timeline
CREATE INDEX IF NOT EXISTS al_actor_idx
    ON log.audit_log (tenant_id, actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;
-- Company code scope (business log queries)
CREATE INDEX IF NOT EXISTS al_cc_idx
    ON log.audit_log (tenant_id, company_code_id, created_at DESC)
    WHERE company_code_id IS NOT NULL;
-- Compliance: destructive ops only
CREATE INDEX IF NOT EXISTS al_destructive_pidx
    ON log.audit_log (tenant_id, operation, created_at DESC)
    WHERE operation IN ('delete', 'bulk_delete', 'purge', 'archive');
-- Outbox correlation trace
CREATE INDEX IF NOT EXISTS al_correlation_pidx
    ON log.audit_log (correlation_id)
    WHERE correlation_id IS NOT NULL;


-- —— §2  security_event_log ——————————————————————————————————————————————
-- Principal security timeline
CREATE INDEX IF NOT EXISTS sel_principal_idx
    ON log.security_event_log (tenant_id, principal_id, created_at DESC)
    WHERE principal_id IS NOT NULL;
-- Failures (security monitoring dashboard)
CREATE INDEX IF NOT EXISTS sel_failure_pidx
    ON log.security_event_log (tenant_id, event_category, created_at DESC)
    WHERE outcome IN ('failure', 'blocked');
-- IP investigation
CREATE INDEX IF NOT EXISTS sel_ip_idx
    ON log.security_event_log (tenant_id, ip_address, created_at DESC)
    WHERE ip_address IS NOT NULL;
-- High-risk events (SIEM feed)
CREATE INDEX IF NOT EXISTS sel_risk_pidx
    ON log.security_event_log (tenant_id, risk_score DESC, created_at DESC)
    WHERE risk_score IS NOT NULL AND risk_score >= 60;
-- KC cross-reference
CREATE INDEX IF NOT EXISTS sel_kc_pidx
    ON log.security_event_log (keycloak_event_id)
    WHERE keycloak_event_id IS NOT NULL;


-- —— §3  permission_decision_log —————————————————————————————————————————
-- Access certification: all decisions for a principal
CREATE INDEX IF NOT EXISTS pdl_principal_idx
    ON log.permission_decision_log (tenant_id, principal_id, created_at DESC);
-- Denial sweep for a permission
CREATE INDEX IF NOT EXISTS pdl_deny_pidx
    ON log.permission_decision_log (tenant_id, permission_id, created_at DESC)
    WHERE decision = 'deny' AND permission_id IS NOT NULL;
-- Billing/upgrade prompts
CREATE INDEX IF NOT EXISTS pdl_plan_gate_pidx
    ON log.permission_decision_log (tenant_id, created_at DESC)
    WHERE decision IN ('not_in_plan', 'addon_required');
-- Grant cross-reference
CREATE INDEX IF NOT EXISTS pdl_grant_pidx
    ON log.permission_decision_log (matched_grant_id)
    WHERE matched_grant_id IS NOT NULL;


-- —— §4  field_access_log ————————————————————————————————————————————————
-- GDPR data access report: who accessed field X on entity Y
CREATE INDEX IF NOT EXISTS fal_entity_field_idx
    ON log.field_access_log (tenant_id, entity_type, entity_id, field_name);
-- Data subject report: what did principal X access
CREATE INDEX IF NOT EXISTS fal_principal_idx
    ON log.field_access_log (tenant_id, principal_id, created_at DESC);
-- Compliance sweep: regulated/PII fields only
CREATE INDEX IF NOT EXISTS fal_regulated_pidx
    ON log.field_access_log (tenant_id, field_classification, created_at DESC)
    WHERE field_classification IN ('pii', 'regulated', 'financial');


-- —— §5  password_history —————————————————————————————————————————————————
-- Reuse check: load recent hashes for a principal
CREATE INDEX IF NOT EXISTS ph_principal_idx
    ON log.password_history (tenant_id, principal_id, created_at DESC);


-- —— §6  attachment_access_log ————————————————————————————————————————————
-- Who downloaded/accessed attachment X
CREATE INDEX IF NOT EXISTS aal_attachment_idx
    ON log.attachment_access_log (tenant_id, attachment_id, created_at DESC);
-- All accesses by principal X
CREATE INDEX IF NOT EXISTS aal_principal_idx
    ON log.attachment_access_log (tenant_id, principal_id, created_at DESC);
-- Accesses to attachments of a parent entity
CREATE INDEX IF NOT EXISTS aal_parent_pidx
    ON log.attachment_access_log (tenant_id, parent_entity_type, parent_entity_id)
    WHERE parent_entity_id IS NOT NULL;
-- Denied access review
CREATE INDEX IF NOT EXISTS aal_denied_pidx
    ON log.attachment_access_log (tenant_id, created_at DESC)
    WHERE outcome = 'denied';


-- —— §7  share_audit_log —————————————————————————————————————————————————
-- Delegation audit: what has actor X shared
CREATE INDEX IF NOT EXISTS sal_actor_idx
    ON log.share_audit_log (tenant_id, actor_id, created_at DESC);
-- Who has access to entity Y
CREATE INDEX IF NOT EXISTS sal_entity_idx
    ON log.share_audit_log (tenant_id, shared_entity_type, shared_entity_id);
-- Grants received by principal X
CREATE INDEX IF NOT EXISTS sal_target_principal_pidx
    ON log.share_audit_log (tenant_id, target_principal_id, created_at DESC)
    WHERE target_principal_id IS NOT NULL;
-- Grant cross-reference
CREATE INDEX IF NOT EXISTS sal_grant_pidx
    ON log.share_audit_log (access_grant_id)
    WHERE access_grant_id IS NOT NULL;


-- —— §8  entity_lifecycle_log ————————————————————————————————————————————
-- Entity transition history
CREATE INDEX IF NOT EXISTS ell_entity_idx
    ON log.entity_lifecycle_log (tenant_id, entity_type, entity_id, created_at DESC);
-- State machine: transitions to a specific status
CREATE INDEX IF NOT EXISTS ell_to_status_idx
    ON log.entity_lifecycle_log (tenant_id, entity_type, to_status, created_at DESC);


-- —— §9  workflow_event_log ——————————————————————————————————————————————
-- Workflow instance history
CREATE INDEX IF NOT EXISTS wel_instance_idx
    ON log.workflow_event_log (tenant_id, instance_id, created_at DESC);
-- Entity workflow history
CREATE INDEX IF NOT EXISTS wel_entity_idx
    ON log.workflow_event_log (tenant_id, entity_type, entity_id);
-- Transitions only (migrated from workflow_transition)
CREATE INDEX IF NOT EXISTS wel_transition_pidx
    ON log.workflow_event_log (tenant_id, instance_id, created_at DESC)
    WHERE transition_name IS NOT NULL;
-- High severity events
CREATE INDEX IF NOT EXISTS wel_severity_pidx
    ON log.workflow_event_log (tenant_id, severity, created_at DESC)
    WHERE severity IN ('error', 'critical');


-- —— §10  close_override_log —————————————————————————————————————————————
-- Close override by company + period
CREATE INDEX IF NOT EXISTS col_company_period_idx
    ON log.close_override_log (tenant_id, company_code_id, fiscal_year, period_number);
-- Actor override history
CREATE INDEX IF NOT EXISTS col_actor_idx
    ON log.close_override_log (tenant_id, actor_id, created_at DESC);


-- —— §11  job_log ————————————————————————————————————————————————————————
-- Run history: all steps for a run
CREATE INDEX IF NOT EXISTS jl_run_idx
    ON log.job_log (tenant_id, run_id, step_index)
    WHERE run_id IS NOT NULL;
-- Failed jobs
CREATE INDEX IF NOT EXISTS jl_failed_pidx
    ON log.job_log (tenant_id, job_type, created_at DESC)
    WHERE status IN ('failed', 'timeout');
-- Purge sweep
CREATE INDEX IF NOT EXISTS jl_purge_pidx
    ON log.job_log (purge_after)
    WHERE purge_after IS NOT NULL;


-- —— §12  policy_evaluation_log ——————————————————————————————————————————
-- Transaction evaluation history
CREATE INDEX IF NOT EXISTS pel_txn_idx
    ON log.policy_evaluation_log (tenant_id, txn_id)
    WHERE txn_id IS NOT NULL;
-- Low confidence decisions (review queue)
CREATE INDEX IF NOT EXISTS pel_low_conf_pidx
    ON log.policy_evaluation_log (tenant_id, confidence ASC, evaluated_at DESC)
    WHERE confidence IS NOT NULL AND confidence < 0.7;


-- —— §13  hash_anchor ————————————————————————————————————————————————————
-- Lookup by date (UNIQUE constraint already provides this, idx for range queries)
CREATE INDEX IF NOT EXISTS ha_tenant_date_idx
    ON log.hash_anchor (tenant_id, anchor_date DESC);


-- —— §14  dimension_resolution_log ———————————————————————————————————————
-- Resolution trace for an entity
CREATE INDEX IF NOT EXISTS drl_entity_idx
    ON log.dimension_resolution_log (tenant_id, entity_type, entity_id)
    WHERE entity_id IS NOT NULL;
-- Fallback resolutions (data quality review)
CREATE INDEX IF NOT EXISTS drl_fallback_pidx
    ON log.dimension_resolution_log (tenant_id, created_at DESC)
    WHERE is_fallback = true;


-- —— §15  activity_log ———————————————————————————————————————————————————
-- Primary: domain + entity timeline
CREATE INDEX IF NOT EXISTS ala_domain_entity_idx
    ON log.activity_log (tenant_id, domain, entity_type, entity_id, created_at DESC)
    WHERE entity_id IS NOT NULL;
-- Actor activity feed (cross-domain)
CREATE INDEX IF NOT EXISTS ala_actor_idx
    ON log.activity_log (tenant_id, actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;
-- Recent activity: domain=user feed (replaces log.recent_activity query)
CREATE INDEX IF NOT EXISTS ala_user_feed_pidx
    ON log.activity_log (tenant_id, actor_id, created_at DESC)
    WHERE domain = 'user';
-- Per-domain sweep (feeds domain dashboards)
CREATE INDEX IF NOT EXISTS ala_domain_type_idx
    ON log.activity_log (tenant_id, domain, activity_type, created_at DESC);


-- —— §16  close_activity_log —————————————————————————————————————————————
-- Close period activity timeline
CREATE INDEX IF NOT EXISTS cal_company_period_idx
    ON log.close_activity_log (tenant_id, company_code_id, fiscal_year, period_number, activity_type);
-- By activity type (feeds per-phase reports)
CREATE INDEX IF NOT EXISTS cal_type_idx
    ON log.close_activity_log (tenant_id, activity_type, created_at DESC);
-- Release decisions (compliance feed)
CREATE INDEX IF NOT EXISTS cal_release_pidx
    ON log.close_activity_log (tenant_id, created_at DESC)
    WHERE activity_type = 'release_decision';


-- —— §17  export_log —————————————————————————————————————————————————————
-- Actor export history
CREATE INDEX IF NOT EXISTS explog_actor_idx
    ON log.export_log (tenant_id, actor_id, created_at DESC);
-- Exports for entity X
CREATE INDEX IF NOT EXISTS explog_entity_pidx
    ON log.export_log (tenant_id, entity_type, entity_id)
    WHERE entity_id IS NOT NULL;
-- By export type (compliance reports)
CREATE INDEX IF NOT EXISTS explog_type_idx
    ON log.export_log (tenant_id, export_type, created_at DESC);
-- Content hash lookup (integrity verification)
CREATE INDEX IF NOT EXISTS explog_hash_pidx
    ON log.export_log (content_hash)
    WHERE content_hash IS NOT NULL;


-- —— §18  comment_retention_log ——————————————————————————————————————————
-- Retention history for a comment
CREATE INDEX IF NOT EXISTS crl_comment_idx
    ON log.comment_retention_log (tenant_id, comment_id, created_at DESC);
-- Deletions (compliance sweep)
CREATE INDEX IF NOT EXISTS crl_deleted_pidx
    ON log.comment_retention_log (tenant_id, created_at DESC)
    WHERE action = 'deleted';


-- —— §19  search_history —————————————————————————————————————————————————
-- Principal search timeline
CREATE INDEX IF NOT EXISTS sh_principal_idx
    ON log.search_history (tenant_id, principal_id, created_at DESC);
-- Query dedup (query_hash)
CREATE INDEX IF NOT EXISTS sh_hash_pidx
    ON log.search_history (tenant_id, query_hash, created_at DESC)
    WHERE query_hash IS NOT NULL;


-- —— §20  ai_inference_log ———————————————————————————————————————————————
-- Model inference history
CREATE INDEX IF NOT EXISTS ail_model_idx
    ON log.ai_inference_log (tenant_id, model_id, created_at DESC);
-- Transaction inference chain
CREATE INDEX IF NOT EXISTS ail_txn_pidx
    ON log.ai_inference_log (tenant_id, txn_id)
    WHERE txn_id IS NOT NULL;
-- Pending reversals (action type only)
CREATE INDEX IF NOT EXISTS ail_reversal_pidx
    ON log.ai_inference_log (tenant_id, reversal_window_expires_at)
    WHERE inference_type = 'action'
      AND reversed_at IS NULL
      AND reversal_window_expires_at IS NOT NULL;
-- Unreviewed predictions
CREATE INDEX IF NOT EXISTS ail_unreviewed_pidx
    ON log.ai_inference_log (tenant_id, created_at DESC)
    WHERE inference_type = 'prediction' AND is_accepted IS NULL;


-- —— §21  ai_monitoring_log ——————————————————————————————————————————————
-- Model monitoring timeline
CREATE INDEX IF NOT EXISTS aml_model_idx
    ON log.ai_monitoring_log (tenant_id, model_id, created_at DESC)
    WHERE model_id IS NOT NULL;
-- Active alerts
CREATE INDEX IF NOT EXISTS aml_alert_pidx
    ON log.ai_monitoring_log (tenant_id, monitor_type, created_at DESC)
    WHERE is_alert = true AND is_alert_sent = false;


-- —— §22  ai_feedback_log ————————————————————————————————————————————————
-- Feedback by entity
CREATE INDEX IF NOT EXISTS afl_entity_idx
    ON log.ai_feedback_log (tenant_id, entity_type, entity_id)
    WHERE entity_id IS NOT NULL;
-- Unverified outcomes (review queue)
CREATE INDEX IF NOT EXISTS afl_unverified_pidx
    ON log.ai_feedback_log (tenant_id, feedback_type, created_at DESC)
    WHERE is_outcome_verified = false;


-- —— §23  ai_calibration_log —————————————————————————————————————————————
-- Calibration history for a model
CREATE INDEX IF NOT EXISTS acl_model_idx
    ON log.ai_calibration_log (tenant_id, model_id, created_at DESC)
    WHERE model_id IS NOT NULL;


-- —— §24  ai_call_transcript —————————————————————————————————————————————
-- Session transcript lookup
CREATE INDEX IF NOT EXISTS act_session_idx
    ON log.ai_call_transcript (tenant_id, session_id, created_at DESC);
-- Entity-linked transcripts
CREATE INDEX IF NOT EXISTS act_entity_pidx
    ON log.ai_call_transcript (tenant_id, entity_type, entity_id)
    WHERE entity_id IS NOT NULL;


-- —— §25  kpi_execution_log ——————————————————————————————————————————————
-- Current value lookup: latest calc for (kpi, company, fiscal year, period)
CREATE INDEX IF NOT EXISTS kel_current_pidx
    ON log.kpi_execution_log (tenant_id, kpi_id, company_code_id, fiscal_year, period_number)
    WHERE is_current = true;
-- Calculation run sweep
CREATE INDEX IF NOT EXISTS kel_run_pidx
    ON log.kpi_execution_log (tenant_id, calculation_run_id)
    WHERE calculation_run_id IS NOT NULL;
-- Threshold breach review
CREATE INDEX IF NOT EXISTS kel_breach_pidx
    ON log.kpi_execution_log (tenant_id, threshold_severity, created_at DESC)
    WHERE threshold_severity IN ('warning', 'critical');


-- —— §26  workspace_usage_metric —————————————————————————————————————————
-- Workspace metric time series
CREATE INDEX IF NOT EXISTS wum_workspace_metric_idx
    ON log.workspace_usage_metric (tenant_id, workspace_id, metric_key, period_start DESC);


-- —— §27  notification_delivery_attempt ——————————————————————————————————
-- Attempts for a delivery (ordered by time for retry analysis)
CREATE INDEX IF NOT EXISTS nda_delivery_idx
    ON log.notification_delivery_attempt (delivery_id, created_at DESC)
    WHERE delivery_id IS NOT NULL;

-- Failed attempts (debugging, alerting)
CREATE INDEX IF NOT EXISTS nda_failed_pidx
    ON log.notification_delivery_attempt (tenant_id, created_at DESC)
    WHERE is_success = false;

-- Purge sweep (GDPR / retention)
CREATE INDEX IF NOT EXISTS nda_purge_pidx
    ON log.notification_delivery_attempt (purge_after)
    WHERE purge_after IS NOT NULL;


-- =============================================================================
-- §28  DOCUMENT · PRINT · BRANDING  —  log indexes
-- =============================================================================

-- ── log.render_dlq ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS render_dlq_output_idx
    ON log.render_dlq (tenant_id, output_id);
CREATE INDEX IF NOT EXISTS render_dlq_category_idx
    ON log.render_dlq (tenant_id, error_category)
    WHERE replayed_at IS NULL;


-- —— §CAL  log.cycle_audit_log —————————————————————————————————————————————
CREATE INDEX IF NOT EXISTS cal_tenant_created_idx
    ON log.cycle_audit_log (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS cal_tenant_run_idx
    ON log.cycle_audit_log (tenant_id, cycle_run_id, created_at)
    WHERE cycle_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cal_tenant_target_idx
    ON log.cycle_audit_log (tenant_id, target_id, created_at)
    WHERE target_id IS NOT NULL;

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- log.resolution_log
-- ============================================================================

-- Primary resolution audit queries
CREATE INDEX IF NOT EXISTS rl_txn_step_idx
    ON log.resolution_log (txn_id, resolution_step);

CREATE INDEX IF NOT EXISTS rl_pipeline_idx
    ON log.resolution_log (pipeline_id);

CREATE INDEX IF NOT EXISTS rl_tenant_time_idx
    ON log.resolution_log (tenant_id, resolved_at);

-- Step-specific partial indexes for targeted analytics
CREATE INDEX IF NOT EXISTS rl_intent_pidx
    ON log.resolution_log (resolved_intent_id)
    WHERE resolution_step = 'INTENT';

CREATE INDEX IF NOT EXISTS rl_profile_pidx
    ON log.resolution_log (resolved_profile_config_id)
    WHERE resolution_step = 'PROFILE';

-- Override audit trail
CREATE INDEX IF NOT EXISTS rl_override_pidx
    ON log.resolution_log (tenant_id, resolved_at)
    WHERE was_overridden = true;
