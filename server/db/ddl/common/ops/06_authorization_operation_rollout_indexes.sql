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
