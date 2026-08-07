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
CREATE INDEX authorization_legacy_retirement_approval_latest_idx
 ON ops.authorization_legacy_retirement_approval(plane_code,decided_at DESC);

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
CREATE INDEX identity_admission_shadow_gate_idx ON ops.identity_admission_shadow_comparison(plane_code,workflow,comparison_status,severity,observed_at DESC);
CREATE INDEX identity_admission_shadow_tenant_idx ON ops.identity_admission_shadow_comparison(tenant_id,observed_at DESC);
CREATE INDEX identity_admission_shadow_subject_idx ON ops.identity_admission_shadow_comparison(subject_fingerprint,observed_at DESC);
CREATE INDEX authorization_session_shadow_gate_idx ON ops.authorization_session_shadow_comparison(plane_code,comparison_status,observed_at DESC);
CREATE INDEX authorization_session_shadow_tenant_idx ON ops.authorization_session_shadow_comparison(tenant_id,principal_id,observed_at DESC);
