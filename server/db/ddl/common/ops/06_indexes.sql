CREATE UNIQUE INDEX authorization_parity_certification_exact_uq
  ON ops.authorization_parity_certification
  (plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,evidence_fingerprint);

CREATE INDEX authorization_parity_certification_lookup_idx
  ON ops.authorization_parity_certification
  (plane_code,source_entity_operation_id,certified_at DESC);

CREATE INDEX authorization_operation_rollout_mode_idx
  ON ops.authorization_operation_rollout (plane_code,mode,updated_at DESC);

CREATE UNIQUE INDEX authorization_operation_cutover_drill_passed_uq
  ON ops.authorization_operation_cutover_drill(plane_code,source_entity_operation_id,source_release_hash,source_artifact_hash)
  WHERE outcome='passed';
CREATE INDEX authorization_shadow_coordinate_ix
    ON ops.authorization_shadow_comparison
       (plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,observed_at DESC);
CREATE INDEX authorization_shadow_mismatch_ix
    ON ops.authorization_shadow_comparison (tenant_id,observed_at DESC)
    WHERE comparison_status <> 'match';
CREATE INDEX authorization_shadow_request_ix
    ON ops.authorization_shadow_comparison (tenant_id,request_id);

CREATE INDEX job_execution_queue_idx
    ON ops.job_execution (status, scheduled_at, created_at)
    WHERE status IN ('queued','retrying');
CREATE INDEX job_execution_tenant_job_idx
    ON ops.job_execution (tenant_id, job_code, created_at DESC);
CREATE INDEX job_execution_run_idx
    ON ops.job_execution (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX job_execution_correlation_idx
    ON ops.job_execution (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX job_execution_purge_idx
    ON ops.job_execution (purge_after) WHERE purge_after IS NOT NULL;
CREATE INDEX job_execution_attempt_tenant_idx
    ON ops.job_execution_attempt (tenant_id, execution_id, attempt_no DESC);
CREATE INDEX job_execution_attempt_failure_idx
    ON ops.job_execution_attempt (status, completed_at DESC)
    WHERE status IN ('failed','timed_out','dead_letter');
CREATE INDEX job_execution_command_actor_idx
    ON ops.job_execution_command (tenant_id, requested_by, requested_at DESC);
CREATE INDEX job_execution_command_execution_idx
    ON ops.job_execution_command (execution_id, requested_at DESC);
CREATE INDEX identity_admission_shadow_gate_idx ON ops.identity_admission_shadow_comparison(plane_code,workflow,comparison_status,severity,observed_at DESC);
CREATE INDEX identity_admission_shadow_tenant_idx ON ops.identity_admission_shadow_comparison(tenant_id,observed_at DESC);
CREATE INDEX identity_admission_shadow_subject_idx ON ops.identity_admission_shadow_comparison(subject_fingerprint,observed_at DESC);
CREATE INDEX authorization_session_shadow_gate_idx ON ops.authorization_session_shadow_comparison(plane_code,comparison_status,observed_at DESC);
CREATE INDEX authorization_session_shadow_tenant_idx ON ops.authorization_session_shadow_comparison(tenant_id,principal_id,observed_at DESC);
CREATE INDEX record_edit_lock_expiry_idx ON ops.record_edit_lock (tenant_id, expires_at);
CREATE INDEX record_edit_lock_owner_idx ON ops.record_edit_lock (tenant_id, owner_principal_id, expires_at DESC);
CREATE INDEX control_runtime_command_submission_lookup_idx
 ON ops.control_runtime_command_submission(tenant_id,idempotency_key,occurred_at DESC);
CREATE INDEX control_runtime_command_approval_request_tenant_idx
 ON ops.control_runtime_command_approval_request(tenant_id,requested_at DESC);
CREATE INDEX control_runtime_command_history_tenant_idx
 ON ops.control_runtime_command_history(tenant_id,plane_code,sequence_no DESC);
CREATE INDEX record_import_session_status_idx ON ops.record_import_session(tenant_id,status,created_at);
CREATE INDEX record_import_session_owner_idx ON ops.record_import_session(tenant_id,created_by,created_at DESC);
CREATE INDEX record_export_request_status_idx ON ops.record_export_request(tenant_id,status,requested_at);
CREATE INDEX record_export_request_owner_idx ON ops.record_export_request(tenant_id,actor_principal_id,requested_at DESC);
