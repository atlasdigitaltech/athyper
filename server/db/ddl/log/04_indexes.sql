-- ============================================================================
-- log/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon database log schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX ala_actor_idx ON ONLY log.activity_log USING btree (tenant_id, actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

CREATE INDEX ala_domain_entity_idx ON ONLY log.activity_log USING btree (tenant_id, domain, entity_type, entity_id, created_at DESC) WHERE entity_id IS NOT NULL;

CREATE INDEX ala_domain_type_idx ON ONLY log.activity_log USING btree (tenant_id, domain, activity_type, created_at DESC);

CREATE INDEX ala_user_feed_pidx ON ONLY log.activity_log USING btree (tenant_id, actor_id, created_at DESC) WHERE domain = 'user'::text;

CREATE INDEX activity_log_default_tenant_id_actor_id_created_at_idx ON log.activity_log_default USING btree (tenant_id, actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

CREATE INDEX activity_log_default_tenant_id_actor_id_created_at_idx1 ON log.activity_log_default USING btree (tenant_id, actor_id, created_at DESC) WHERE domain = 'user'::text;

CREATE INDEX activity_log_default_tenant_id_domain_activity_type_created_idx ON log.activity_log_default USING btree (tenant_id, domain, activity_type, created_at DESC);

CREATE INDEX activity_log_default_tenant_id_domain_entity_type_entity_id_idx ON log.activity_log_default USING btree (tenant_id, domain, entity_type, entity_id, created_at DESC) WHERE entity_id IS NOT NULL;

CREATE INDEX aac_credential_pidx ON log.ai_agent_call USING btree (tenant_id, credential_fingerprint, created_at DESC) WHERE credential_fingerprint IS NOT NULL;

CREATE INDEX aac_credential_reference_pidx ON log.ai_agent_call USING btree (tenant_id, credential_reference_hash, created_at DESC) WHERE credential_reference_hash IS NOT NULL;

CREATE INDEX aac_operation_pidx ON log.ai_agent_call USING btree (tenant_id, call_kind, operation_id, created_at DESC) WHERE operation_id IS NOT NULL;

CREATE INDEX aac_provider_model_idx ON log.ai_agent_call USING btree (tenant_id, provider_id, actual_model_id, created_at DESC) WHERE provider_id IS NOT NULL;

CREATE INDEX aac_provider_request_pidx ON log.ai_agent_call USING btree (provider_id, provider_request_id) WHERE provider_request_id IS NOT NULL;

CREATE INDEX aar_client_request_idx ON log.ai_agent_run USING btree (tenant_id, client_request_id, created_at DESC);

CREATE INDEX aar_failure_pidx ON log.ai_agent_run USING btree (tenant_id, error_category, created_at DESC) WHERE outcome = 'failed'::text;

CREATE INDEX aar_model_idx ON log.ai_agent_run USING btree (tenant_id, resolved_provider_id, actual_model_id, created_at DESC) WHERE resolved_provider_id IS NOT NULL;

CREATE INDEX aar_thread_idx ON log.ai_agent_run USING btree (tenant_id, principal_id, thread_id, created_at DESC);

CREATE INDEX acl_model_idx ON log.ai_calibration_log USING btree (tenant_id, model_id, created_at DESC) WHERE model_id IS NOT NULL;

CREATE INDEX act_entity_pidx ON ONLY log.ai_call_transcript USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX act_session_idx ON ONLY log.ai_call_transcript USING btree (tenant_id, session_id, created_at DESC);

CREATE INDEX ai_call_transcript_default_tenant_id_entity_type_entity_id_idx ON log.ai_call_transcript_default USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX ai_call_transcript_default_tenant_id_session_id_created_at_idx ON log.ai_call_transcript_default USING btree (tenant_id, session_id, created_at DESC);

CREATE INDEX afl_entity_idx ON log.ai_feedback_log USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX afl_unverified_pidx ON log.ai_feedback_log USING btree (tenant_id, feedback_type, created_at DESC) WHERE is_outcome_verified = false;

CREATE INDEX ail_model_idx ON log.ai_inference_log USING btree (tenant_id, model_id, created_at DESC);

CREATE INDEX ail_reversal_pidx ON log.ai_inference_log USING btree (tenant_id, reversal_window_expires_at) WHERE inference_type = 'action'::text AND reversed_at IS NULL AND reversal_window_expires_at IS NOT NULL;

CREATE INDEX ail_txn_pidx ON log.ai_inference_log USING btree (tenant_id, txn_id) WHERE txn_id IS NOT NULL;

CREATE INDEX ail_unreviewed_pidx ON log.ai_inference_log USING btree (tenant_id, created_at DESC) WHERE inference_type = 'prediction'::text AND is_accepted IS NULL;

CREATE INDEX aml_alert_pidx ON log.ai_monitoring_log USING btree (tenant_id, monitor_type, created_at DESC) WHERE is_alert = true AND is_alert_sent = false;

CREATE INDEX aml_model_idx ON log.ai_monitoring_log USING btree (tenant_id, model_id, created_at DESC) WHERE model_id IS NOT NULL;

CREATE INDEX atlas_byok_audit_scope_idx ON log.atlas_byok_audit USING btree (tenant_id, provider_id, occurred_at DESC);

CREATE INDEX aal_attachment_idx ON ONLY log.attachment_access_log USING btree (tenant_id, attachment_id, created_at DESC);

CREATE INDEX aal_denied_pidx ON ONLY log.attachment_access_log USING btree (tenant_id, created_at DESC) WHERE outcome = 'denied'::text;

CREATE INDEX aal_parent_pidx ON ONLY log.attachment_access_log USING btree (tenant_id, parent_entity_type, parent_entity_id) WHERE parent_entity_id IS NOT NULL;

CREATE INDEX aal_principal_idx ON ONLY log.attachment_access_log USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX attachment_access_log_default_tenant_id_attachment_id_creat_idx ON log.attachment_access_log_default USING btree (tenant_id, attachment_id, created_at DESC);

CREATE INDEX attachment_access_log_default_tenant_id_created_at_idx ON log.attachment_access_log_default USING btree (tenant_id, created_at DESC) WHERE outcome = 'denied'::text;

CREATE INDEX attachment_access_log_default_tenant_id_parent_entity_type__idx ON log.attachment_access_log_default USING btree (tenant_id, parent_entity_type, parent_entity_id) WHERE parent_entity_id IS NOT NULL;

CREATE INDEX attachment_access_log_default_tenant_id_principal_id_create_idx ON log.attachment_access_log_default USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX al_actor_idx ON ONLY log.audit_log USING btree (tenant_id, actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

CREATE INDEX al_cc_idx ON ONLY log.audit_log USING btree (tenant_id, company_code_id, created_at DESC) WHERE company_code_id IS NOT NULL;

CREATE INDEX al_correlation_pidx ON ONLY log.audit_log USING btree (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX al_destructive_pidx ON ONLY log.audit_log USING btree (tenant_id, operation, created_at DESC) WHERE operation = ANY (ARRAY['delete'::text, 'bulk_delete'::text, 'purge'::text, 'archive'::text]);

CREATE INDEX al_entity_idx ON ONLY log.audit_log USING btree (tenant_id, entity_type, entity_id);

CREATE INDEX audit_log_default_correlation_id_idx ON log.audit_log_default USING btree (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX audit_log_default_tenant_id_actor_id_created_at_idx ON log.audit_log_default USING btree (tenant_id, actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

CREATE INDEX audit_log_default_tenant_id_company_code_id_created_at_idx ON log.audit_log_default USING btree (tenant_id, company_code_id, created_at DESC) WHERE company_code_id IS NOT NULL;

CREATE INDEX audit_log_default_tenant_id_entity_type_entity_id_idx ON log.audit_log_default USING btree (tenant_id, entity_type, entity_id);

CREATE INDEX audit_log_default_tenant_id_operation_created_at_idx ON log.audit_log_default USING btree (tenant_id, operation, created_at DESC) WHERE operation = ANY (ARRAY['delete'::text, 'bulk_delete'::text, 'purge'::text, 'archive'::text]);

CREATE INDEX auth_decision_evidence_v2_correlation_idx ON ONLY log.auth_decision_evidence_v2 USING btree (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX auth_decision_evidence_v2_denies_idx ON ONLY log.auth_decision_evidence_v2 USING btree (tenant_id, plane_code, reason_code, observed_at DESC) WHERE decision = 'deny'::text;

CREATE INDEX auth_decision_evidence_v2_permission_time_idx ON ONLY log.auth_decision_evidence_v2 USING btree (permission_id, observed_at DESC);

CREATE INDEX auth_decision_evidence_v2_subject_time_idx ON ONLY log.auth_decision_evidence_v2 USING btree (tenant_id, subject_principal_id, observed_at DESC);

CREATE INDEX auth_decision_evidence_v2_tenant_time_idx ON ONLY log.auth_decision_evidence_v2 USING btree (tenant_id, plane_code, observed_at DESC);

CREATE INDEX auth_decision_evidence_v2_def_tenant_id_plane_code_observed_idx ON log.auth_decision_evidence_v2_default USING btree (tenant_id, plane_code, observed_at DESC);

CREATE INDEX auth_decision_evidence_v2_def_tenant_id_plane_code_reason_c_idx ON log.auth_decision_evidence_v2_default USING btree (tenant_id, plane_code, reason_code, observed_at DESC) WHERE decision = 'deny'::text;

CREATE INDEX auth_decision_evidence_v2_def_tenant_id_subject_principal_i_idx ON log.auth_decision_evidence_v2_default USING btree (tenant_id, subject_principal_id, observed_at DESC);

CREATE INDEX auth_decision_evidence_v2_default_correlation_id_idx ON log.auth_decision_evidence_v2_default USING btree (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX auth_decision_evidence_v2_default_permission_id_observed_at_idx ON log.auth_decision_evidence_v2_default USING btree (permission_id, observed_at DESC);

CREATE INDEX cal_company_period_idx ON log.close_activity_log USING btree (tenant_id, company_code_id, fiscal_year, period_number, activity_type);

CREATE INDEX cal_release_pidx ON log.close_activity_log USING btree (tenant_id, created_at DESC) WHERE activity_type = 'release_decision'::text;

CREATE INDEX cal_type_idx ON log.close_activity_log USING btree (tenant_id, activity_type, created_at DESC);

CREATE INDEX col_actor_idx ON log.close_override_log USING btree (tenant_id, actor_id, created_at DESC);

CREATE INDEX col_company_period_idx ON log.close_override_log USING btree (tenant_id, company_code_id, fiscal_year, period_number);

CREATE INDEX crl_comment_idx ON log.comment_retention_log USING btree (tenant_id, comment_id, created_at DESC);

CREATE INDEX crl_deleted_pidx ON log.comment_retention_log USING btree (tenant_id, created_at DESC) WHERE action = 'deleted'::text;

CREATE INDEX cal_tenant_created_idx ON ONLY log.cycle_audit_log USING btree (tenant_id, created_at);

CREATE INDEX cal_tenant_run_idx ON ONLY log.cycle_audit_log USING btree (tenant_id, cycle_run_id, created_at) WHERE cycle_run_id IS NOT NULL;

CREATE INDEX cal_tenant_target_idx ON ONLY log.cycle_audit_log USING btree (tenant_id, target_id, created_at) WHERE target_id IS NOT NULL;

CREATE INDEX cycle_audit_log_default_tenant_id_created_at_idx ON log.cycle_audit_log_default USING btree (tenant_id, created_at);

CREATE INDEX cycle_audit_log_default_tenant_id_cycle_run_id_created_at_idx ON log.cycle_audit_log_default USING btree (tenant_id, cycle_run_id, created_at) WHERE cycle_run_id IS NOT NULL;

CREATE INDEX cycle_audit_log_default_tenant_id_target_id_created_at_idx ON log.cycle_audit_log_default USING btree (tenant_id, target_id, created_at) WHERE target_id IS NOT NULL;

CREATE INDEX dci_tenant_entity_idx ON ONLY log.descriptor_cache_invalidation USING btree (tenant_id, entity_code, created_at DESC);

CREATE INDEX dci_unprocessed_idx ON ONLY log.descriptor_cache_invalidation USING btree (created_at) WHERE processed_at IS NULL;

CREATE INDEX descriptor_cache_invalidation_default_created_at_idx ON log.descriptor_cache_invalidation_default USING btree (created_at) WHERE processed_at IS NULL;

CREATE INDEX descriptor_cache_invalidation_tenant_id_entity_code_created_idx ON log.descriptor_cache_invalidation_default USING btree (tenant_id, entity_code, created_at DESC);

CREATE INDEX drl_entity_idx ON log.dimension_resolution_log USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX drl_fallback_pidx ON log.dimension_resolution_log USING btree (tenant_id, created_at DESC) WHERE is_fallback = true;

CREATE INDEX ell_entity_idx ON log.entity_lifecycle_log USING btree (tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX ell_to_status_idx ON log.entity_lifecycle_log USING btree (tenant_id, entity_type, to_status, created_at DESC);

CREATE INDEX explog_actor_idx ON log.export_log USING btree (tenant_id, actor_id, created_at DESC);

CREATE INDEX explog_entity_pidx ON log.export_log USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX explog_hash_pidx ON log.export_log USING btree (content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX explog_type_idx ON log.export_log USING btree (tenant_id, export_type, created_at DESC);

CREATE INDEX fal_entity_field_idx ON ONLY log.field_access_log USING btree (tenant_id, entity_type, entity_id, field_name);

CREATE INDEX fal_principal_idx ON ONLY log.field_access_log USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX fal_regulated_pidx ON ONLY log.field_access_log USING btree (tenant_id, field_classification, created_at DESC) WHERE field_classification = ANY (ARRAY['pii'::text, 'regulated'::text, 'financial'::text]);

CREATE INDEX field_access_log_default_tenant_id_entity_type_entity_id_fi_idx ON log.field_access_log_default USING btree (tenant_id, entity_type, entity_id, field_name);

CREATE INDEX field_access_log_default_tenant_id_field_classification_cre_idx ON log.field_access_log_default USING btree (tenant_id, field_classification, created_at DESC) WHERE field_classification = ANY (ARRAY['pii'::text, 'regulated'::text, 'financial'::text]);

CREATE INDEX field_access_log_default_tenant_id_principal_id_created_at_idx ON log.field_access_log_default USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX ha_tenant_date_idx ON log.hash_anchor USING btree (tenant_id, anchor_date DESC);

CREATE INDEX jl_failed_pidx ON log.job_log USING btree (tenant_id, job_type, created_at DESC) WHERE status = ANY (ARRAY['failed'::text, 'timeout'::text]);

CREATE INDEX jl_purge_pidx ON log.job_log USING btree (purge_after) WHERE purge_after IS NOT NULL;

CREATE INDEX jl_run_idx ON log.job_log USING btree (tenant_id, run_id, step_index) WHERE run_id IS NOT NULL;

CREATE INDEX kel_breach_pidx ON log.kpi_execution_log USING btree (tenant_id, threshold_severity, created_at DESC) WHERE threshold_severity = ANY (ARRAY['warning'::text, 'critical'::text]);

CREATE INDEX kel_current_pidx ON log.kpi_execution_log USING btree (tenant_id, kpi_id, company_code_id, fiscal_year, period_number) WHERE is_current = true;

CREATE INDEX kel_run_pidx ON log.kpi_execution_log USING btree (tenant_id, calculation_run_id) WHERE calculation_run_id IS NOT NULL;

CREATE INDEX nda_delivery_idx ON log.notification_delivery_attempt USING btree (delivery_id, created_at DESC) WHERE delivery_id IS NOT NULL;

CREATE INDEX nda_failed_pidx ON log.notification_delivery_attempt USING btree (tenant_id, created_at DESC) WHERE is_success = false;

CREATE INDEX nda_purge_pidx ON log.notification_delivery_attempt USING btree (purge_after) WHERE purge_after IS NOT NULL;

CREATE INDEX parameter_change_log_code_idx ON log.parameter_change_log USING btree (parameter_code, created_at DESC);

CREATE INDEX parameter_change_log_tenant_idx ON log.parameter_change_log USING btree (tenant_id, created_at DESC);

CREATE INDEX ph_principal_idx ON log.password_history USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX pdl_deny_pidx ON ONLY log.permission_decision_log USING btree (tenant_id, permission_id, created_at DESC) WHERE decision = 'deny'::text AND permission_id IS NOT NULL;

CREATE INDEX pdl_grant_pidx ON ONLY log.permission_decision_log USING btree (matched_grant_id) WHERE matched_grant_id IS NOT NULL;

CREATE INDEX pdl_plan_gate_pidx ON ONLY log.permission_decision_log USING btree (tenant_id, created_at DESC) WHERE decision = ANY (ARRAY['not_in_plan'::text, 'addon_required'::text]);

CREATE INDEX pdl_principal_idx ON ONLY log.permission_decision_log USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX permission_decision_log_defau_tenant_id_permission_id_creat_idx ON log.permission_decision_log_default USING btree (tenant_id, permission_id, created_at DESC) WHERE decision = 'deny'::text AND permission_id IS NOT NULL;

CREATE INDEX permission_decision_log_defau_tenant_id_principal_id_create_idx ON log.permission_decision_log_default USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX permission_decision_log_default_matched_grant_id_idx ON log.permission_decision_log_default USING btree (matched_grant_id) WHERE matched_grant_id IS NOT NULL;

CREATE INDEX permission_decision_log_default_tenant_id_created_at_idx ON log.permission_decision_log_default USING btree (tenant_id, created_at DESC) WHERE decision = ANY (ARRAY['not_in_plan'::text, 'addon_required'::text]);

CREATE INDEX pal_actor_idx ON log.platform_audit_log USING btree (actor_id, created_at DESC);

CREATE INDEX pal_entity_idx ON log.platform_audit_log USING btree (entity_type, created_at DESC);

CREATE INDEX pel_low_conf_pidx ON log.policy_evaluation_log USING btree (tenant_id, confidence, evaluated_at DESC) WHERE confidence IS NOT NULL AND confidence < 0.7;

CREATE INDEX pel_txn_idx ON log.policy_evaluation_log USING btree (tenant_id, txn_id) WHERE txn_id IS NOT NULL;

CREATE INDEX render_dlq_category_idx ON log.render_dlq USING btree (tenant_id, error_category) WHERE replayed_at IS NULL;

CREATE INDEX render_dlq_output_idx ON log.render_dlq USING btree (tenant_id, output_id);

CREATE INDEX rl_intent_pidx ON log.resolution_log USING btree (resolved_intent_id) WHERE resolution_step = 'INTENT'::text;

CREATE INDEX rl_override_pidx ON log.resolution_log USING btree (tenant_id, resolved_at) WHERE was_overridden = true;

CREATE INDEX rl_pipeline_idx ON log.resolution_log USING btree (pipeline_id);

CREATE INDEX rl_profile_pidx ON log.resolution_log USING btree (resolved_profile_config_id) WHERE resolution_step = 'PROFILE'::text;

CREATE INDEX rl_tenant_time_idx ON log.resolution_log USING btree (tenant_id, resolved_at);

CREATE INDEX rl_txn_step_idx ON log.resolution_log USING btree (txn_id, resolution_step);

CREATE INDEX sh_hash_pidx ON ONLY log.search_history USING btree (tenant_id, query_hash, created_at DESC) WHERE query_hash IS NOT NULL;

CREATE INDEX sh_principal_idx ON ONLY log.search_history USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX search_history_default_tenant_id_principal_id_created_at_idx ON log.search_history_default USING btree (tenant_id, principal_id, created_at DESC);

CREATE INDEX search_history_default_tenant_id_query_hash_created_at_idx ON log.search_history_default USING btree (tenant_id, query_hash, created_at DESC) WHERE query_hash IS NOT NULL;

CREATE INDEX sel_failure_pidx ON ONLY log.security_event_log USING btree (tenant_id, event_category, created_at DESC) WHERE outcome = ANY (ARRAY['failure'::text, 'blocked'::text]);

CREATE INDEX sel_ip_idx ON ONLY log.security_event_log USING btree (tenant_id, ip_address, created_at DESC) WHERE ip_address IS NOT NULL;

CREATE INDEX sel_kc_pidx ON ONLY log.security_event_log USING btree (keycloak_event_id) WHERE keycloak_event_id IS NOT NULL;

CREATE INDEX sel_principal_idx ON ONLY log.security_event_log USING btree (tenant_id, principal_id, created_at DESC) WHERE principal_id IS NOT NULL;

CREATE INDEX sel_risk_pidx ON ONLY log.security_event_log USING btree (tenant_id, risk_score DESC, created_at DESC) WHERE risk_score IS NOT NULL AND risk_score >= 60;

CREATE INDEX security_event_log_default_keycloak_event_id_idx ON log.security_event_log_default USING btree (keycloak_event_id) WHERE keycloak_event_id IS NOT NULL;

CREATE INDEX security_event_log_default_tenant_id_event_category_created_idx ON log.security_event_log_default USING btree (tenant_id, event_category, created_at DESC) WHERE outcome = ANY (ARRAY['failure'::text, 'blocked'::text]);

CREATE INDEX security_event_log_default_tenant_id_ip_address_created_at_idx ON log.security_event_log_default USING btree (tenant_id, ip_address, created_at DESC) WHERE ip_address IS NOT NULL;

CREATE INDEX security_event_log_default_tenant_id_principal_id_created_a_idx ON log.security_event_log_default USING btree (tenant_id, principal_id, created_at DESC) WHERE principal_id IS NOT NULL;

CREATE INDEX security_event_log_default_tenant_id_risk_score_created_at_idx ON log.security_event_log_default USING btree (tenant_id, risk_score DESC, created_at DESC) WHERE risk_score IS NOT NULL AND risk_score >= 60;

CREATE INDEX sal_actor_idx ON log.share_audit_log USING btree (tenant_id, actor_id, created_at DESC);

CREATE INDEX sal_entity_idx ON log.share_audit_log USING btree (tenant_id, shared_entity_type, shared_entity_id);

CREATE INDEX sal_grant_pidx ON log.share_audit_log USING btree (access_grant_id) WHERE access_grant_id IS NOT NULL;

CREATE INDEX sal_target_principal_pidx ON log.share_audit_log USING btree (tenant_id, target_principal_id, created_at DESC) WHERE target_principal_id IS NOT NULL;

CREATE INDEX wel_entity_idx ON ONLY log.workflow_event_log USING btree (tenant_id, entity_type, entity_id);

CREATE INDEX wel_instance_idx ON ONLY log.workflow_event_log USING btree (tenant_id, instance_id, created_at DESC);

CREATE INDEX wel_severity_pidx ON ONLY log.workflow_event_log USING btree (tenant_id, severity, created_at DESC) WHERE severity = ANY (ARRAY['error'::text, 'critical'::text]);

CREATE INDEX wel_transition_pidx ON ONLY log.workflow_event_log USING btree (tenant_id, instance_id, created_at DESC) WHERE transition_name IS NOT NULL;

CREATE INDEX workflow_event_log_default_tenant_id_entity_type_entity_id_idx ON log.workflow_event_log_default USING btree (tenant_id, entity_type, entity_id);

CREATE INDEX workflow_event_log_default_tenant_id_instance_id_created_a_idx1 ON log.workflow_event_log_default USING btree (tenant_id, instance_id, created_at DESC) WHERE transition_name IS NOT NULL;

CREATE INDEX workflow_event_log_default_tenant_id_instance_id_created_at_idx ON log.workflow_event_log_default USING btree (tenant_id, instance_id, created_at DESC);

CREATE INDEX workflow_event_log_default_tenant_id_severity_created_at_idx ON log.workflow_event_log_default USING btree (tenant_id, severity, created_at DESC) WHERE severity = ANY (ARRAY['error'::text, 'critical'::text]);

CREATE INDEX wum_workspace_metric_idx ON log.workspace_usage_metric USING btree (tenant_id, workspace_id, metric_key, period_start DESC);
