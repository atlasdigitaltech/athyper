BEGIN;

CREATE OR REPLACE FUNCTION runtime_meta.fn_verify_release(
    p_applied_release_id uuid, p_computed_artifact_hash text, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS runtime_meta.applied_release
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE
    v_row runtime_meta.applied_release%ROWTYPE;
    v_descriptor runtime_meta.entity_descriptor%ROWTYPE;
    v_contract runtime_meta.entity_contract%ROWTYPE;
    v_payload runtime_meta.applied_release_payload%ROWTYPE;
    v_failure_code text;
BEGIN
    SELECT * INTO v_row FROM runtime_meta.applied_release WHERE id=p_applied_release_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APPLIED_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF v_row.status='verified' THEN RETURN v_row; END IF;
    IF v_row.status<>'staged' THEN RAISE EXCEPTION 'RELEASE_NOT_STAGED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    -- Compiled native entities carry the immutable payload projection below.
    -- Legacy entity_runtime publications still require contract/descriptor rows.
    IF v_row.publication_key LIKE 'metadata.entity.%'
       AND v_row.manifest->>'artifactKind' IS DISTINCT FROM 'compiled_entity_runtime' THEN
      SELECT * INTO v_descriptor FROM runtime_meta.entity_descriptor WHERE applied_release_id=v_row.id;
      IF NOT FOUND THEN v_failure_code:='ENTITY_PROJECTION_REQUIRED';
      ELSE
        SELECT * INTO STRICT v_contract FROM runtime_meta.entity_contract WHERE id=v_descriptor.entity_contract_id;
      END IF;
    END IF;
    IF v_row.manifest->>'artifactKind'<>'entity_runtime' THEN
      SELECT * INTO v_payload FROM runtime_meta.applied_release_payload
       WHERE applied_release_id=v_row.id AND artifact_kind=v_row.manifest->>'artifactKind';
      IF NOT FOUND THEN
        v_failure_code:=CASE WHEN v_row.manifest->>'artifactKind'='business_partner_definition_bundle'
          THEN 'BUSINESS_PARTNER_DEFINITION_PROJECTION_REQUIRED' ELSE 'APPLIED_RELEASE_PAYLOAD_REQUIRED' END;
      END IF;
    END IF;
    IF v_failure_code IS NULL AND v_row.artifact_hash<>p_computed_artifact_hash THEN v_failure_code:='ARTIFACT_HASH_MISMATCH'; END IF;
    IF v_failure_code IS NULL AND COALESCE((p_evidence->>'signature_verified')::boolean,false) IS NOT TRUE THEN v_failure_code:='ARTIFACT_SIGNATURE_INVALID'; END IF;
    IF v_failure_code IS NULL AND COALESCE((p_evidence->>'manifest_valid')::boolean,false) IS NOT TRUE THEN v_failure_code:='ARTIFACT_MANIFEST_INVALID'; END IF;
    IF v_failure_code IS NULL AND COALESCE((p_evidence->>'runtime_compatible')::boolean,false) IS NOT TRUE THEN v_failure_code:='RUNTIME_INCOMPATIBLE'; END IF;
    IF v_failure_code IS NULL AND v_descriptor.id IS NOT NULL AND (
      p_evidence->>'target_plane' IS DISTINCT FROM v_descriptor.plane_code OR
      (current_setting('app.database_plane',true) IS NOT NULL AND current_setting('app.database_plane',true)<>v_descriptor.plane_code)
    ) THEN v_failure_code:='TARGET_PLANE_MISMATCH'; END IF;
    IF v_failure_code IS NULL AND v_descriptor.id IS NOT NULL AND (
      p_evidence->>'contract_hash' IS DISTINCT FROM v_contract.entity_contract_hash OR
      p_evidence->>'descriptor_source_hash' IS DISTINCT FROM v_descriptor.source_contract_hash OR
      v_descriptor.source_contract_hash<>v_contract.entity_contract_hash
    ) THEN v_failure_code:='PROJECTION_HASH_MISMATCH'; END IF;
    IF v_failure_code IS NULL AND v_descriptor.id IS NOT NULL AND (
      p_evidence->>'contract_schema_version' IS DISTINCT FROM v_contract.contract_schema_version OR
      p_evidence->>'descriptor_schema_version' IS DISTINCT FROM v_descriptor.descriptor_schema_version
    ) THEN v_failure_code:='PROJECTION_SCHEMA_VERSION_MISMATCH'; END IF;
    IF v_failure_code IS NULL AND v_payload.id IS NOT NULL AND (
      p_evidence->>'target_plane' IS DISTINCT FROM v_payload.coordinates->>'plane_code' OR
      COALESCE(p_evidence->>'payload_hash',p_evidence->>'definition_bundle_hash') IS DISTINCT FROM v_payload.payload_hash
    ) THEN v_failure_code:='BUSINESS_PARTNER_DEFINITION_HASH_MISMATCH'; END IF;
    IF v_failure_code IS NULL AND v_payload.id IS NOT NULL AND
      COALESCE(p_evidence->>'payload_schema_version',p_evidence->>'definition_bundle_schema_version') IS DISTINCT FROM v_payload.payload_schema_version
    THEN v_failure_code:='BUSINESS_PARTNER_DEFINITION_SCHEMA_VERSION_MISMATCH'; END IF;
    IF v_failure_code IS NOT NULL THEN
      UPDATE runtime_meta.applied_release SET status='rejected',rejected_at=clock_timestamp(),failure_code=v_failure_code,
        verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;
      RETURN v_row;
    END IF;
    UPDATE runtime_meta.applied_release SET status='verified',verified_at=clock_timestamp(),verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

COMMIT;
