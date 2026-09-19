CREATE OR REPLACE FUNCTION runtime_meta.trg_validate_entity_number_counter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, runtime_meta, control
AS $$
DECLARE
    v_policy control.numbering_policy%ROWTYPE;
BEGIN
    SELECT * INTO v_policy FROM control.numbering_policy WHERE id = NEW.numbering_policy_id;
    IF NOT FOUND OR v_policy.status <> 'active' THEN
        RAISE EXCEPTION 'Entity number counter requires an active numbering policy' USING ERRCODE='foreign_key_violation';
    END IF;
    IF v_policy.tenant_id IS NOT NULL AND v_policy.tenant_id <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Tenant numbering counter cannot reference another tenant policy' USING ERRCODE='foreign_key_violation';
    END IF;
    IF v_policy.scope_kind = 'tenant' AND NEW.scope_key <> NEW.tenant_id::text THEN
        RAISE EXCEPTION 'Tenant-scoped numbering counter scope_key must equal tenant_id' USING ERRCODE='check_violation';
    END IF;
    IF (v_policy.reset_kind = 'never' AND NEW.reset_bucket <> 'never')
       OR (v_policy.reset_kind = 'calendar_year' AND NEW.reset_bucket !~ '^[0-9]{4}$')
       OR (v_policy.reset_kind = 'calendar_month' AND NEW.reset_bucket !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
       OR (v_policy.reset_kind = 'calendar_day' AND NEW.reset_bucket !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
       OR (v_policy.reset_kind = 'fiscal_year' AND NEW.reset_bucket !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$') THEN
        RAISE EXCEPTION 'Counter reset_bucket does not match numbering policy reset_kind' USING ERRCODE='check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.next_value <> v_policy.start_value OR NEW.allocation_count <> 0 OR NEW.row_version <> 0
           OR NEW.last_allocated_value IS NOT NULL OR NEW.last_allocation_id IS NOT NULL
           OR NEW.last_allocated_at IS NOT NULL OR NEW.last_allocated_by IS NOT NULL
           OR NEW.last_correlation_id IS NOT NULL THEN
            RAISE EXCEPTION 'New numbering counters must begin at the policy start value with no allocation state'
                USING ERRCODE='check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id
       OR NEW.numbering_policy_id <> OLD.numbering_policy_id
       OR NEW.scope_key <> OLD.scope_key OR NEW.reset_bucket <> OLD.reset_bucket
       OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
        RAISE EXCEPTION 'Entity number counter identity is immutable' USING ERRCODE='integrity_constraint_violation';
    END IF;
    IF v_policy.maximum_value IS NOT NULL AND OLD.next_value > v_policy.maximum_value THEN
        RAISE EXCEPTION 'NUMBERING_POLICY_EXHAUSTED' USING ERRCODE='program_limit_exceeded';
    END IF;
    IF NEW.next_value <> OLD.next_value + v_policy.increment_by
       OR NEW.allocation_count <> OLD.allocation_count + 1
       OR NEW.row_version <> OLD.row_version + 1
       OR NEW.last_allocated_value <> OLD.next_value
       OR NEW.last_allocation_id IS NULL OR NEW.last_allocated_at IS NULL OR NEW.last_allocated_by IS NULL THEN
        RAISE EXCEPTION 'Counter updates must represent exactly one numbering allocation'
            USING ERRCODE='integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION runtime_meta.trg_reject_entity_number_allocation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'entity_number_allocation is append-only' USING ERRCODE='integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_stage_release(
    p_publication_key text, p_source_release_id uuid, p_source_release_no bigint,
    p_deployment_id uuid, p_artifact_hash text, p_manifest jsonb
) RETURNS runtime_meta.applied_release
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE v_row runtime_meta.applied_release%ROWTYPE;
BEGIN
    INSERT INTO runtime_meta.applied_release(publication_key,source_release_id,source_release_no,deployment_id,artifact_hash,manifest)
    VALUES(p_publication_key,p_source_release_id,p_source_release_no,p_deployment_id,p_artifact_hash,p_manifest)
    ON CONFLICT(publication_key,source_release_id) DO NOTHING RETURNING * INTO v_row;
    IF NOT FOUND THEN
      SELECT * INTO STRICT v_row FROM runtime_meta.applied_release WHERE publication_key=p_publication_key AND source_release_id=p_source_release_id;
      IF v_row.deployment_id<>p_deployment_id OR v_row.artifact_hash<>p_artifact_hash OR v_row.manifest<>p_manifest THEN
        RAISE EXCEPTION 'RELEASE_STAGE_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
      END IF;
    END IF;
    RETURN v_row;
END; $$;

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
    IF v_row.publication_key LIKE 'metadata.entity.%' THEN
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
    ) THEN v_failure_code:=CASE WHEN v_payload.artifact_kind='bank_directory' THEN 'BANK_DIRECTORY_HASH_MISMATCH' ELSE 'BUSINESS_PARTNER_DEFINITION_HASH_MISMATCH' END; END IF;
    IF v_failure_code IS NULL AND v_payload.id IS NOT NULL AND
      COALESCE(p_evidence->>'payload_schema_version',p_evidence->>'definition_bundle_schema_version') IS DISTINCT FROM v_payload.payload_schema_version
    THEN v_failure_code:=CASE WHEN v_payload.artifact_kind='bank_directory' THEN 'BANK_DIRECTORY_SCHEMA_VERSION_MISMATCH' ELSE 'BUSINESS_PARTNER_DEFINITION_SCHEMA_VERSION_MISMATCH' END; END IF;
    IF v_failure_code IS NOT NULL THEN
      UPDATE runtime_meta.applied_release SET status='rejected',rejected_at=clock_timestamp(),failure_code=v_failure_code,
        verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;
      RETURN v_row;
    END IF;
    UPDATE runtime_meta.applied_release SET status='verified',verified_at=clock_timestamp(),verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_stage_entity_projection(
    p_applied_release_id uuid,
    p_projection jsonb
) RETURNS runtime_meta.entity_descriptor
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE
    v_release runtime_meta.applied_release%ROWTYPE;
    v_contract jsonb;
    v_descriptor jsonb;
    v_contract_row runtime_meta.entity_contract%ROWTYPE;
    v_descriptor_row runtime_meta.entity_descriptor%ROWTYPE;
    v_plane text;
BEGIN
    IF p_projection IS NULL THEN RETURN NULL; END IF;
    IF jsonb_typeof(p_projection) <> 'object'
       OR jsonb_typeof(p_projection->'contract') <> 'object'
       OR jsonb_typeof(p_projection->'descriptor') <> 'object' THEN
        RAISE EXCEPTION 'ENTITY_PROJECTION_INVALID' USING ERRCODE='check_violation';
    END IF;

    v_contract := p_projection->'contract';
    v_descriptor := p_projection->'descriptor';
    v_plane := v_descriptor->>'plane_code';

    SELECT * INTO v_release FROM runtime_meta.applied_release
     WHERE id=p_applied_release_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APPLIED_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF v_release.status <> 'staged' THEN
        SELECT * INTO v_descriptor_row FROM runtime_meta.entity_descriptor
         WHERE id=(v_descriptor->>'id')::uuid AND applied_release_id=v_release.id;
        IF FOUND THEN
            SELECT * INTO v_contract_row FROM runtime_meta.entity_contract
             WHERE id=v_descriptor_row.entity_contract_id;
        END IF;
        IF NOT FOUND
           OR v_descriptor_row.compiled_hash IS DISTINCT FROM v_descriptor->>'compiled_hash'
           OR v_descriptor_row.source_contract_hash IS DISTINCT FROM v_descriptor->>'source_contract_hash'
           OR v_descriptor_row.plane_code IS DISTINCT FROM v_plane
           OR v_contract_row.id IS DISTINCT FROM (v_contract->>'id')::uuid
           OR v_contract_row.entity_id IS DISTINCT FROM (v_contract->>'entity_id')::uuid
           OR v_contract_row.release_id IS DISTINCT FROM (v_contract->>'release_id')::uuid
           OR v_contract_row.entity_contract_hash IS DISTINCT FROM v_contract->>'contract_hash'
           OR v_contract_row.contract_json IS DISTINCT FROM v_contract->'contract_json' THEN
            RAISE EXCEPTION 'ENTITY_PROJECTION_IDEMPOTENCY_CONFLICT'
                USING ERRCODE='unique_violation';
        END IF;
        RETURN v_descriptor_row;
    END IF;

    IF v_plane NOT IN ('studio','neon','mesh') THEN
        RAISE EXCEPTION 'ENTITY_PROJECTION_PLANE_INVALID' USING ERRCODE='check_violation';
    END IF;
    IF current_setting('app.database_plane', true) IS NOT NULL
       AND current_setting('app.database_plane', true) <> v_plane THEN
        RAISE EXCEPTION 'ENTITY_PROJECTION_PLANE_MISMATCH' USING ERRCODE='check_violation';
    END IF;
    IF (v_contract->>'release_id')::uuid <> v_release.source_release_id
       OR (v_contract->>'release_no')::bigint <> v_release.source_release_no
       OR v_contract->>'publication_key' <> v_release.publication_key
       OR v_descriptor->>'source_contract_hash' <> v_contract->>'contract_hash' THEN
        RAISE EXCEPTION 'ENTITY_PROJECTION_COORDINATE_MISMATCH' USING ERRCODE='check_violation';
    END IF;

    INSERT INTO runtime_meta.entity_contract (
        id,tenant_id,entity_id,entity_code,release_id,revision_id,release_no,
        contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,
        publication_key,signature_algorithm,signing_key_id,signature,published_at
    ) VALUES (
        (v_contract->>'id')::uuid,(v_contract->>'tenant_id')::uuid,
        (v_contract->>'entity_id')::uuid,v_contract->>'entity_code',
        (v_contract->>'release_id')::uuid,(v_contract->>'revision_id')::uuid,
        (v_contract->>'release_no')::bigint,v_contract->>'contract_schema_code',
        v_contract->>'contract_schema_version',v_contract->>'contract_hash',
        v_contract->'contract_json',v_contract->>'publication_key',
        v_contract->>'signature_algorithm',v_contract->>'signing_key_id',
        v_contract->>'signature',(v_contract->>'published_at')::timestamptz
    ) ON CONFLICT (id) DO NOTHING;

    SELECT * INTO STRICT v_contract_row FROM runtime_meta.entity_contract
     WHERE id=(v_contract->>'id')::uuid;
    IF ROW(v_contract_row.entity_id,v_contract_row.release_id,v_contract_row.revision_id,
           v_contract_row.entity_contract_hash,v_contract_row.contract_json,v_contract_row.publication_key)
       IS DISTINCT FROM ROW((v_contract->>'entity_id')::uuid,(v_contract->>'release_id')::uuid,
           (v_contract->>'revision_id')::uuid,v_contract->>'contract_hash',
           v_contract->'contract_json',v_contract->>'publication_key') THEN
        RAISE EXCEPTION 'ENTITY_CONTRACT_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
    END IF;

    INSERT INTO runtime_meta.entity_descriptor (
        id,tenant_id,entity_contract_id,entity_id,release_id,revision_id,plane_code,
        descriptor_kind,descriptor_schema_version,source_contract_hash,compiled_hash,
        compiled_json,compiler_version,compatibility_level,applied_release_id,generated_at
    ) VALUES (
        (v_descriptor->>'id')::uuid,(v_contract->>'tenant_id')::uuid,v_contract_row.id,
        v_contract_row.entity_id,v_contract_row.release_id,v_contract_row.revision_id,v_plane,
        v_descriptor->>'descriptor_kind',v_descriptor->>'descriptor_schema_version',
        v_descriptor->>'source_contract_hash',v_descriptor->>'compiled_hash',
        v_descriptor->'compiled_json',v_descriptor->>'compiler_version',
        v_descriptor->>'compatibility_level',v_release.id,
        (v_descriptor->>'generated_at')::timestamptz
    ) ON CONFLICT (id) DO NOTHING;

    SELECT * INTO STRICT v_descriptor_row FROM runtime_meta.entity_descriptor
     WHERE id=(v_descriptor->>'id')::uuid;
    IF ROW(v_descriptor_row.entity_contract_id,v_descriptor_row.plane_code,
           v_descriptor_row.source_contract_hash,v_descriptor_row.compiled_hash,
           v_descriptor_row.compiled_json,v_descriptor_row.applied_release_id)
       IS DISTINCT FROM ROW(v_contract_row.id,v_plane,v_descriptor->>'source_contract_hash',
           v_descriptor->>'compiled_hash',v_descriptor->'compiled_json',v_release.id) THEN
        RAISE EXCEPTION 'ENTITY_DESCRIPTOR_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
    END IF;
    PERFORM authz.fn_stage_entity_operation_projection(
        v_release.id,v_contract_row.tenant_id,v_plane,v_release.source_release_id,
        v_descriptor_row.compiled_hash,v_descriptor_row.compiled_json
    );
    RETURN v_descriptor_row;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_stage_applied_release_payload(
    p_applied_release_id uuid, p_projection jsonb
) RETURNS runtime_meta.applied_release_payload
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
DECLARE
  v_release runtime_meta.applied_release%ROWTYPE;
  v_row runtime_meta.applied_release_payload%ROWTYPE;
  v_coordinates jsonb;
  v_plane text;
  v_bank_failure text;
BEGIN
  IF jsonb_typeof(p_projection)<>'object'
     OR jsonb_typeof(p_projection->'payload_json')<>'object'
     OR jsonb_typeof(p_projection->'coordinates')<>'object' THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_INVALID' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO STRICT v_release FROM runtime_meta.applied_release
   WHERE id=p_applied_release_id FOR UPDATE;
  v_coordinates:=p_projection->'coordinates';
  v_plane:=v_coordinates->>'plane_code';
  IF p_projection->>'artifact_kind'='bank_directory' THEN
    IF v_release.source_release_no>1 AND NOT EXISTS(SELECT 1 FROM shared.bank_directory_release WHERE version=v_release.source_release_no-1) THEN
      RAISE EXCEPTION 'BANK_DIRECTORY_PREDECESSOR_PENDING';
    END IF;
    IF v_release.publication_key<>'shared.bank_directory' OR p_projection->'payload_json'->>'id' IS DISTINCT FROM v_release.source_release_id::text OR (p_projection->'payload_json'->>'version')::bigint IS DISTINCT FROM v_release.source_release_no OR p_projection->'payload_json'->>'contentHash' IS DISTINCT FROM p_projection->>'payload_hash' THEN RAISE EXCEPTION 'BANK_DIRECTORY_COORDINATES_INVALID'; END IF;
    v_bank_failure:=shared.validate_bank_directory(p_projection->'payload_json');
    IF v_bank_failure IS NOT NULL THEN RAISE EXCEPTION 'BANK_DIRECTORY_VALIDATION_FAILED: %',v_bank_failure; END IF;
  END IF;
  IF p_projection->>'artifact_kind'='business_partner_definition_bundle' AND (
       NULLIF(p_projection->>'tenant_id','') IS NULL
       OR p_projection->'payload_json'->>'schema' IS DISTINCT FROM 'athyper.business-partner-definition-bundle.v1'
       OR v_plane NOT IN ('studio','neon','mesh')
       OR NOT COALESCE((v_coordinates->>'bundle_code') ~ '^[a-z][a-z0-9_.-]{1,126}$',false)
       OR NOT COALESCE((v_coordinates->>'semantic_version') ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$',false)
     ) THEN
    RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_PROJECTION_INVALID' USING ERRCODE='check_violation';
  END IF;
  IF v_plane IS NOT NULL AND current_setting('app.database_plane',true) IS NOT NULL
     AND current_setting('app.database_plane',true)<>v_plane THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_PLANE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  IF (v_coordinates->>'release_id')::uuid<>v_release.source_release_id
     OR (v_coordinates->>'release_no')::bigint<>v_release.source_release_no
     OR v_coordinates->>'publication_key'<>v_release.publication_key
     OR p_projection->>'artifact_kind' IS DISTINCT FROM v_release.manifest->>'artifactKind' THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_COORDINATE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  INSERT INTO runtime_meta.applied_release_payload(
    id,applied_release_id,tenant_id,artifact_kind,payload_schema_version,
    payload_hash,payload_json,coordinates,generated_at
  ) VALUES(
    (p_projection->>'id')::uuid,v_release.id,(p_projection->>'tenant_id')::uuid,
    p_projection->>'artifact_kind',p_projection->>'payload_schema_version',
    p_projection->>'payload_hash',p_projection->'payload_json',v_coordinates,
    (p_projection->>'generated_at')::timestamptz
  ) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO STRICT v_row FROM runtime_meta.applied_release_payload
   WHERE id=(p_projection->>'id')::uuid;
  IF ROW(v_row.applied_release_id,v_row.tenant_id,v_row.artifact_kind,
         v_row.payload_schema_version,v_row.payload_hash,v_row.payload_json,v_row.coordinates)
     IS DISTINCT FROM ROW(v_release.id,(p_projection->>'tenant_id')::uuid,p_projection->>'artifact_kind',
         p_projection->>'payload_schema_version',p_projection->>'payload_hash',
         p_projection->'payload_json',v_coordinates) THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
  END IF;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_stage_release_projection(
    p_publication_key text, p_source_release_id uuid, p_source_release_no bigint,
    p_deployment_id uuid, p_artifact_hash text, p_manifest jsonb, p_projection jsonb DEFAULT NULL
) RETURNS runtime_meta.applied_release
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE v_release runtime_meta.applied_release%ROWTYPE;
BEGIN
    v_release := runtime_meta.fn_stage_release(
        p_publication_key,p_source_release_id,p_source_release_no,p_deployment_id,p_artifact_hash,p_manifest
    );
    IF p_projection ? 'applied_release_payload' THEN
        PERFORM runtime_meta.fn_stage_applied_release_payload(v_release.id,p_projection->'applied_release_payload');
    ELSIF p_projection IS NOT NULL THEN
        PERFORM runtime_meta.fn_stage_entity_projection(v_release.id,p_projection);
    END IF;
    RETURN v_release;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_activate_release(
    p_applied_release_id uuid, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS runtime_meta.release_activation_head
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE
    v_candidate runtime_meta.applied_release%ROWTYPE;
    v_head runtime_meta.release_activation_head%ROWTYPE;
    v_previous uuid;
    v_descriptor runtime_meta.entity_descriptor%ROWTYPE;
    v_contract_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended((SELECT publication_key FROM runtime_meta.applied_release WHERE id=p_applied_release_id),0));
    SELECT * INTO v_candidate FROM runtime_meta.applied_release WHERE id=p_applied_release_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APPLIED_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF v_candidate.status='active' THEN SELECT * INTO STRICT v_head FROM runtime_meta.release_activation_head WHERE applied_release_id=v_candidate.id; RETURN v_head; END IF;
    IF v_candidate.status<>'verified' THEN RAISE EXCEPTION 'RELEASE_NOT_VERIFIED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;

    SELECT * INTO v_descriptor FROM runtime_meta.entity_descriptor
     WHERE applied_release_id=v_candidate.id FOR UPDATE;
    IF FOUND THEN
      IF v_descriptor.status<>'staged' THEN RAISE EXCEPTION 'ENTITY_DESCRIPTOR_NOT_STAGED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
      SELECT id INTO STRICT v_contract_id FROM runtime_meta.entity_contract
       WHERE id=v_descriptor.entity_contract_id AND status='staged' FOR UPDATE;
    END IF;

    SELECT * INTO v_head FROM runtime_meta.release_activation_head WHERE publication_key=v_candidate.publication_key FOR UPDATE;
    IF FOUND THEN
      IF v_candidate.source_release_no<=v_head.source_release_no THEN RAISE EXCEPTION 'RELEASE_SEQUENCE_NOT_FORWARD' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
      v_previous:=v_head.applied_release_id;
      PERFORM authz.fn_retire_entity_operation_projection(v_previous,clock_timestamp());
      UPDATE runtime_meta.entity_descriptor
         SET status='retired',retired_at=clock_timestamp()
       WHERE applied_release_id=v_previous AND status='active';
      UPDATE runtime_meta.entity_contract c
         SET status='superseded',status_changed_at=clock_timestamp()
       WHERE c.id IN (SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_previous)
         AND c.status='published';
      UPDATE runtime_meta.applied_release SET status='superseded' WHERE id=v_previous AND status='active';
      UPDATE runtime_meta.release_activation_head SET applied_release_id=v_candidate.id,source_release_no=v_candidate.source_release_no,
        artifact_hash=v_candidate.artifact_hash,activated_at=clock_timestamp(),row_version=row_version+1
      WHERE publication_key=v_candidate.publication_key RETURNING * INTO v_head;
    ELSE
      INSERT INTO runtime_meta.release_activation_head(publication_key,applied_release_id,source_release_no,artifact_hash,activated_at)
      VALUES(v_candidate.publication_key,v_candidate.id,v_candidate.source_release_no,v_candidate.artifact_hash,clock_timestamp()) RETURNING * INTO v_head;
    END IF;
    IF v_contract_id IS NOT NULL THEN
      PERFORM authz.fn_activate_entity_operation_projection(v_candidate.id,v_head.activated_at);
      UPDATE runtime_meta.entity_contract SET status='published',status_changed_at=v_head.activated_at
       WHERE id=v_contract_id;
      UPDATE runtime_meta.entity_descriptor SET status='active',activated_at=v_head.activated_at
       WHERE id=v_descriptor.id;
    END IF;
    IF v_candidate.manifest->>'artifactKind'='bank_directory' THEN
      PERFORM shared.publish_bank_directory((p.payload_json->>'id')::uuid,(p.payload_json->>'version')::bigint,(p.payload_json->>'publishedAt')::timestamptz,p.payload_json->'sources',p.payload_json->'payload',p.payload_json->>'contentHash') FROM runtime_meta.applied_release_payload p WHERE p.applied_release_id=v_candidate.id AND p.artifact_kind='bank_directory';
      IF NOT FOUND THEN RAISE EXCEPTION 'BANK_DIRECTORY_PAYLOAD_MISSING'; END IF;
    END IF;
    UPDATE runtime_meta.applied_release SET status='active',activated_at=v_head.activated_at WHERE id=v_candidate.id;
    INSERT INTO runtime_meta.release_activation_event(publication_key,previous_applied_release_id,applied_release_id,activated_at,evidence)
    VALUES(v_candidate.publication_key,v_previous,v_candidate.id,v_head.activated_at,COALESCE(p_evidence,'{}'::jsonb));
    RETURN v_head;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_rollback_release(
    p_publication_key text, p_target_applied_release_id uuid, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS runtime_meta.release_activation_head
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE
    v_head runtime_meta.release_activation_head%ROWTYPE;
    v_target runtime_meta.applied_release%ROWTYPE;
    v_previous uuid;
    v_activated_at timestamptz := clock_timestamp();
BEGIN
    IF p_publication_key='shared.bank_directory' THEN RAISE EXCEPTION 'BANK_DIRECTORY_REQUIRES_FORWARD_CORRECTION'; END IF;
    SELECT * INTO v_head FROM runtime_meta.release_activation_head
     WHERE publication_key=p_publication_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    SELECT * INTO v_target FROM runtime_meta.applied_release
     WHERE id=p_target_applied_release_id AND publication_key=p_publication_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF v_target.status NOT IN ('superseded','verified') THEN
      RAISE EXCEPTION 'ROLLBACK_RELEASE_NOT_ELIGIBLE' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM runtime_meta.entity_descriptor WHERE applied_release_id=v_target.id)
       AND NOT EXISTS (SELECT 1 FROM runtime_meta.applied_release_payload WHERE applied_release_id=v_target.id) THEN
      RAISE EXCEPTION 'ROLLBACK_PROJECTION_NOT_FOUND' USING ERRCODE='no_data_found';
    END IF;

    v_previous := v_head.applied_release_id;
    PERFORM authz.fn_retire_entity_operation_projection(v_previous,v_activated_at);
    UPDATE runtime_meta.entity_descriptor SET status='retired',retired_at=v_activated_at
     WHERE applied_release_id=v_previous AND status='active';
    UPDATE runtime_meta.entity_contract c SET status='superseded',status_changed_at=v_activated_at
     WHERE c.id IN (SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_previous)
       AND c.status='published';
    UPDATE runtime_meta.applied_release SET status='superseded' WHERE id=v_previous AND status='active';

    PERFORM authz.fn_restore_entity_operation_projection(v_target.id,v_activated_at);
    UPDATE runtime_meta.entity_descriptor
       SET status='active',activated_at=v_activated_at,retired_at=NULL
     WHERE applied_release_id=v_target.id AND status IN ('staged','retired');
    UPDATE runtime_meta.entity_contract c SET status='published',status_changed_at=v_activated_at
     WHERE c.id IN (SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_target.id)
       AND c.status IN ('staged','superseded');
    UPDATE runtime_meta.applied_release SET status='active',activated_at=v_activated_at WHERE id=v_target.id;
    UPDATE runtime_meta.release_activation_head
       SET applied_release_id=v_target.id,source_release_no=v_target.source_release_no,
           artifact_hash=v_target.artifact_hash,activated_at=v_activated_at,row_version=row_version+1
     WHERE publication_key=p_publication_key RETURNING * INTO v_head;
    INSERT INTO runtime_meta.release_activation_event(
        publication_key,previous_applied_release_id,applied_release_id,activated_at,evidence
    ) VALUES(p_publication_key,v_previous,v_target.id,v_activated_at,
        COALESCE(p_evidence,'{}'::jsonb)||jsonb_build_object('rollback',true));
    RETURN v_head;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_active_release(p_publication_key text)
RETURNS TABLE(applied_release_id uuid,source_release_id uuid,source_release_no bigint,artifact_hash text,manifest jsonb,activated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,runtime_meta
AS $$ SELECT a.id,a.source_release_id,a.source_release_no,a.artifact_hash,a.manifest,h.activated_at
       FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
       WHERE h.publication_key=p_publication_key AND a.status='active' $$;

COMMENT ON FUNCTION runtime_meta.fn_active_release(text) IS 'Offline-safe runtime read: returns only the last locally verified and atomically activated release.';

CREATE OR REPLACE FUNCTION runtime_meta.fn_active_entity_descriptor(
    p_publication_key text, p_descriptor_kind text DEFAULT 'entity_runtime'
) RETURNS TABLE(
    entity_contract_id uuid, entity_descriptor_id uuid, tenant_id uuid, entity_id uuid,
    entity_code text, release_id uuid, release_no bigint, contract_hash text,
    contract_json jsonb, plane_code text, descriptor_kind text, compiled_hash text,
    compiled_json jsonb, activated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
  SELECT c.id,d.id,c.tenant_id,c.entity_id,c.entity_code,c.release_id,c.release_no,
         c.entity_contract_hash,c.contract_json,d.plane_code,d.descriptor_kind,
         d.compiled_hash,d.compiled_json,d.activated_at
    FROM runtime_meta.release_activation_head h
    JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
    JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active'
    JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id AND c.status='published'
   WHERE h.publication_key=p_publication_key AND d.descriptor_kind=p_descriptor_kind
$$;

COMMENT ON FUNCTION runtime_meta.fn_active_entity_descriptor(text,text) IS
  'Offline-safe Entity runtime read. It never contacts Athyper and returns only the locally active verified descriptor.';

CREATE OR REPLACE FUNCTION runtime_meta.fn_active_business_partner_definition(p_publication_key text)
RETURNS TABLE(
  id uuid, tenant_id uuid, revision_id uuid, release_id uuid, release_no bigint,
  publication_key text, plane_code text, bundle_code text, semantic_version text,
  bundle_schema_version text, bundle_hash text, bundle_json jsonb, generated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
  SELECT p.id,p.tenant_id,(p.coordinates->>'revision_id')::uuid,a.source_release_id,a.source_release_no,
         a.publication_key,p.coordinates->>'plane_code',p.coordinates->>'bundle_code',
         p.coordinates->>'semantic_version',p.payload_schema_version,p.payload_hash,p.payload_json,p.generated_at
  FROM runtime_meta.release_activation_head h
  JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
  JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id
   AND p.artifact_kind='business_partner_definition_bundle'
  WHERE h.publication_key=$1
$$;

COMMENT ON FUNCTION runtime_meta.fn_active_business_partner_definition(text) IS
  'Offline-safe read of the last locally verified and activated signed Business Partner definition bundle.';

CREATE OR REPLACE FUNCTION runtime_meta.trg_guard_business_partner_definition_head() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_candidate text;v_active text;v_exact_previous boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.publication_key LIKE 'studio.business_partner.definition.%' THEN
  SELECT payload.coordinates->>'semantic_version' INTO v_candidate FROM runtime_meta.applied_release_payload payload WHERE payload.applied_release_id=NEW.applied_release_id AND payload.artifact_kind='business_partner_definition_bundle';
  SELECT payload.coordinates->>'semantic_version' INTO v_active FROM runtime_meta.applied_release_payload payload WHERE payload.applied_release_id=OLD.applied_release_id AND payload.artifact_kind='business_partner_definition_bundle';
  IF v_candidate IS NULL OR v_active IS NULL THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_ACTIVATION_PAYLOAD_REQUIRED' USING ERRCODE='check_violation';END IF;
  IF NEW.source_release_no<OLD.source_release_no THEN
   SELECT EXISTS(SELECT 1 FROM runtime_meta.release_activation_event event WHERE event.publication_key=NEW.publication_key AND event.applied_release_id=OLD.applied_release_id AND event.previous_applied_release_id=NEW.applied_release_id) INTO v_exact_previous;
   IF NOT v_exact_previous THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_ROLLBACK_NOT_EXACT_PREVIOUS' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  ELSIF string_to_array(split_part(v_candidate,'-',1),'.')::int[]<=string_to_array(split_part(v_active,'-',1),'.')::int[] THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_DOWNGRADE_FORBIDDEN' USING ERRCODE='object_not_in_prerequisite_state';END IF;
 END IF;
 RETURN NEW;
END$$;
