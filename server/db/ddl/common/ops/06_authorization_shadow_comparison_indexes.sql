CREATE INDEX authorization_shadow_coordinate_ix
    ON ops.authorization_shadow_comparison
       (plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,observed_at DESC);
CREATE INDEX authorization_shadow_mismatch_ix
    ON ops.authorization_shadow_comparison (tenant_id,observed_at DESC)
    WHERE comparison_status <> 'match';
CREATE INDEX authorization_shadow_request_ix
    ON ops.authorization_shadow_comparison (tenant_id,request_id);

