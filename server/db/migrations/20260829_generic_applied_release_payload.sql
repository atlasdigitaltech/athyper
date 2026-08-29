BEGIN;

CREATE TABLE runtime_meta.applied_release_payload (
  id uuid PRIMARY KEY,
  applied_release_id uuid NOT NULL UNIQUE REFERENCES runtime_meta.applied_release(id) ON DELETE RESTRICT,
  tenant_id uuid REFERENCES master.tenant(id) ON DELETE RESTRICT,
  artifact_kind text NOT NULL CHECK(artifact_kind ~ '^[a-z][a-z0-9_.-]{1,126}$'),
  payload_schema_version text NOT NULL CHECK(payload_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK(jsonb_typeof(payload_json)='object'),
  coordinates jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(coordinates)='object'),
  generated_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT runtime_applied_release_payload_time_chk CHECK(received_at>=generated_at)
);
CREATE INDEX runtime_applied_release_payload_lookup_idx
  ON runtime_meta.applied_release_payload(tenant_id,artifact_kind,generated_at DESC);
COMMENT ON TABLE runtime_meta.applied_release_payload IS
  'Immutable offline-safe payload for a locally applied non-Entity publication artifact. Release lifecycle and activation are owned only by applied_release and release_activation_head.';

INSERT INTO runtime_meta.applied_release_payload(
  id,applied_release_id,tenant_id,artifact_kind,payload_schema_version,payload_hash,
  payload_json,coordinates,generated_at,received_at
)
SELECT id,applied_release_id,tenant_id,'business_partner_definition_bundle',bundle_schema_version,bundle_hash,
       bundle_json,jsonb_build_object(
         'revision_id',revision_id,'release_id',release_id,'release_no',release_no,
         'publication_key',publication_key,'plane_code',plane_code,'bundle_code',bundle_code,
         'semantic_version',semantic_version
       ),generated_at,received_at
FROM runtime_meta.business_partner_definition_bundle;

CREATE FUNCTION runtime_meta.trg_guard_applied_release_payload()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Applied release payloads are immutable' USING ERRCODE='restrict_violation';
END $$;
CREATE TRIGGER runtime_applied_release_payload_immutable
BEFORE UPDATE OR DELETE ON runtime_meta.applied_release_payload
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_guard_applied_release_payload();

ALTER TABLE runtime_meta.applied_release_payload ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.applied_release_payload FORCE ROW LEVEL SECURITY;
CREATE POLICY runtime_applied_release_payload_tenant_read ON runtime_meta.applied_release_payload FOR SELECT
  USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY runtime_applied_release_payload_seed_owner ON runtime_meta.applied_release_payload
  FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

CREATE FUNCTION runtime_meta.fn_stage_applied_release_payload(p_applied_release_id uuid,p_projection jsonb)
RETURNS runtime_meta.applied_release_payload LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_release runtime_meta.applied_release%ROWTYPE;v_row runtime_meta.applied_release_payload%ROWTYPE;v_coordinates jsonb;v_plane text;
BEGIN
  IF jsonb_typeof(p_projection)<>'object' OR jsonb_typeof(p_projection->'payload_json')<>'object' OR jsonb_typeof(p_projection->'coordinates')<>'object' THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_INVALID' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO STRICT v_release FROM runtime_meta.applied_release WHERE id=p_applied_release_id FOR UPDATE;
  v_coordinates:=p_projection->'coordinates';v_plane:=v_coordinates->>'plane_code';
  IF p_projection->>'artifact_kind'='business_partner_definition_bundle' AND (
       NULLIF(p_projection->>'tenant_id','') IS NULL OR p_projection->'payload_json'->>'schema' IS DISTINCT FROM 'athyper.business-partner-definition-bundle.v1'
       OR v_plane NOT IN('studio','neon','mesh') OR NOT COALESCE((v_coordinates->>'bundle_code')~'^[a-z][a-z0-9_.-]{1,126}$',false)
       OR NOT COALESCE((v_coordinates->>'semantic_version')~'^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$',false)
     ) THEN RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_PROJECTION_INVALID' USING ERRCODE='check_violation';END IF;
  IF v_plane IS NOT NULL AND current_setting('app.database_plane',true) IS NOT NULL AND current_setting('app.database_plane',true)<>v_plane THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_PLANE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  IF (v_coordinates->>'release_id')::uuid<>v_release.source_release_id OR (v_coordinates->>'release_no')::bigint<>v_release.source_release_no
     OR v_coordinates->>'publication_key'<>v_release.publication_key OR p_projection->>'artifact_kind' IS DISTINCT FROM v_release.manifest->>'artifactKind' THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_COORDINATE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  INSERT INTO runtime_meta.applied_release_payload(id,applied_release_id,tenant_id,artifact_kind,payload_schema_version,payload_hash,payload_json,coordinates,generated_at)
  VALUES((p_projection->>'id')::uuid,v_release.id,(p_projection->>'tenant_id')::uuid,p_projection->>'artifact_kind',p_projection->>'payload_schema_version',p_projection->>'payload_hash',p_projection->'payload_json',v_coordinates,(p_projection->>'generated_at')::timestamptz)
  ON CONFLICT(id) DO NOTHING;
  SELECT * INTO STRICT v_row FROM runtime_meta.applied_release_payload WHERE id=(p_projection->>'id')::uuid;
  IF ROW(v_row.applied_release_id,v_row.tenant_id,v_row.artifact_kind,v_row.payload_schema_version,v_row.payload_hash,v_row.payload_json,v_row.coordinates)
     IS DISTINCT FROM ROW(v_release.id,(p_projection->>'tenant_id')::uuid,p_projection->>'artifact_kind',p_projection->>'payload_schema_version',p_projection->>'payload_hash',p_projection->'payload_json',v_coordinates) THEN
    RAISE EXCEPTION 'APPLIED_RELEASE_PAYLOAD_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
  END IF;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_stage_release_projection(p_publication_key text,p_source_release_id uuid,p_source_release_no bigint,p_deployment_id uuid,p_artifact_hash text,p_manifest jsonb,p_projection jsonb DEFAULT NULL)
RETURNS runtime_meta.applied_release LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_release runtime_meta.applied_release%ROWTYPE;
BEGIN
  v_release:=runtime_meta.fn_stage_release(p_publication_key,p_source_release_id,p_source_release_no,p_deployment_id,p_artifact_hash,p_manifest);
  IF p_projection?'applied_release_payload' THEN
    PERFORM runtime_meta.fn_stage_applied_release_payload(v_release.id,p_projection->'applied_release_payload');
  ELSIF p_projection IS NOT NULL THEN
    PERFORM runtime_meta.fn_stage_entity_projection(v_release.id,p_projection);
  END IF;
  RETURN v_release;
END $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_verify_release(p_applied_release_id uuid,p_computed_artifact_hash text,p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS runtime_meta.applied_release LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_row runtime_meta.applied_release%ROWTYPE;v_descriptor runtime_meta.entity_descriptor%ROWTYPE;v_contract runtime_meta.entity_contract%ROWTYPE;v_payload runtime_meta.applied_release_payload%ROWTYPE;v_failure_code text;
BEGIN
  SELECT * INTO v_row FROM runtime_meta.applied_release WHERE id=p_applied_release_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPLIED_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found';END IF;
  IF v_row.status='verified' THEN RETURN v_row;END IF;
  IF v_row.status<>'staged' THEN RAISE EXCEPTION 'RELEASE_NOT_STAGED' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  IF v_row.publication_key LIKE 'metadata.entity.%' THEN
    SELECT * INTO v_descriptor FROM runtime_meta.entity_descriptor WHERE applied_release_id=v_row.id;
    IF NOT FOUND THEN v_failure_code:='ENTITY_PROJECTION_REQUIRED';ELSE SELECT * INTO STRICT v_contract FROM runtime_meta.entity_contract WHERE id=v_descriptor.entity_contract_id;END IF;
  END IF;
  IF v_row.manifest->>'artifactKind'<>'entity_runtime' THEN
    SELECT * INTO v_payload FROM runtime_meta.applied_release_payload WHERE applied_release_id=v_row.id AND artifact_kind=v_row.manifest->>'artifactKind';
    IF NOT FOUND THEN v_failure_code:=CASE WHEN v_row.manifest->>'artifactKind'='business_partner_definition_bundle' THEN 'BUSINESS_PARTNER_DEFINITION_PROJECTION_REQUIRED' ELSE 'APPLIED_RELEASE_PAYLOAD_REQUIRED' END;END IF;
  END IF;
  IF v_failure_code IS NULL AND v_row.artifact_hash<>p_computed_artifact_hash THEN v_failure_code:='ARTIFACT_HASH_MISMATCH';END IF;
  IF v_failure_code IS NULL AND COALESCE((p_evidence->>'signature_verified')::boolean,false) IS NOT TRUE THEN v_failure_code:='ARTIFACT_SIGNATURE_INVALID';END IF;
  IF v_failure_code IS NULL AND COALESCE((p_evidence->>'manifest_valid')::boolean,false) IS NOT TRUE THEN v_failure_code:='ARTIFACT_MANIFEST_INVALID';END IF;
  IF v_failure_code IS NULL AND COALESCE((p_evidence->>'runtime_compatible')::boolean,false) IS NOT TRUE THEN v_failure_code:='RUNTIME_INCOMPATIBLE';END IF;
  IF v_failure_code IS NULL AND v_descriptor.id IS NOT NULL AND (p_evidence->>'target_plane' IS DISTINCT FROM v_descriptor.plane_code OR(current_setting('app.database_plane',true) IS NOT NULL AND current_setting('app.database_plane',true)<>v_descriptor.plane_code)) THEN v_failure_code:='TARGET_PLANE_MISMATCH';END IF;
  IF v_failure_code IS NULL AND v_descriptor.id IS NOT NULL AND (p_evidence->>'contract_hash' IS DISTINCT FROM v_contract.entity_contract_hash OR p_evidence->>'descriptor_source_hash' IS DISTINCT FROM v_descriptor.source_contract_hash OR v_descriptor.source_contract_hash<>v_contract.entity_contract_hash) THEN v_failure_code:='PROJECTION_HASH_MISMATCH';END IF;
  IF v_failure_code IS NULL AND v_descriptor.id IS NOT NULL AND (p_evidence->>'contract_schema_version' IS DISTINCT FROM v_contract.contract_schema_version OR p_evidence->>'descriptor_schema_version' IS DISTINCT FROM v_descriptor.descriptor_schema_version) THEN v_failure_code:='PROJECTION_SCHEMA_VERSION_MISMATCH';END IF;
  IF v_failure_code IS NULL AND v_payload.id IS NOT NULL AND (p_evidence->>'target_plane' IS DISTINCT FROM v_payload.coordinates->>'plane_code' OR p_evidence->>'definition_bundle_hash' IS DISTINCT FROM v_payload.payload_hash) THEN v_failure_code:='BUSINESS_PARTNER_DEFINITION_HASH_MISMATCH';END IF;
  IF v_failure_code IS NULL AND v_payload.id IS NOT NULL AND p_evidence->>'definition_bundle_schema_version' IS DISTINCT FROM v_payload.payload_schema_version THEN v_failure_code:='BUSINESS_PARTNER_DEFINITION_SCHEMA_VERSION_MISMATCH';END IF;
  IF v_failure_code IS NOT NULL THEN UPDATE runtime_meta.applied_release SET status='rejected',rejected_at=clock_timestamp(),failure_code=v_failure_code,verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;RETURN v_row;END IF;
  UPDATE runtime_meta.applied_release SET status='verified',verified_at=clock_timestamp(),verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_activate_release(p_applied_release_id uuid,p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS runtime_meta.release_activation_head LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_candidate runtime_meta.applied_release%ROWTYPE;v_head runtime_meta.release_activation_head%ROWTYPE;v_previous uuid;v_descriptor runtime_meta.entity_descriptor%ROWTYPE;v_contract_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended((SELECT publication_key FROM runtime_meta.applied_release WHERE id=p_applied_release_id),0));
  SELECT * INTO v_candidate FROM runtime_meta.applied_release WHERE id=p_applied_release_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPLIED_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found';END IF;
  IF v_candidate.status='active' THEN SELECT * INTO STRICT v_head FROM runtime_meta.release_activation_head WHERE applied_release_id=v_candidate.id;RETURN v_head;END IF;
  IF v_candidate.status<>'verified' THEN RAISE EXCEPTION 'RELEASE_NOT_VERIFIED' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  SELECT * INTO v_descriptor FROM runtime_meta.entity_descriptor WHERE applied_release_id=v_candidate.id FOR UPDATE;
  IF FOUND THEN IF v_descriptor.status<>'staged' THEN RAISE EXCEPTION 'ENTITY_DESCRIPTOR_NOT_STAGED' USING ERRCODE='object_not_in_prerequisite_state';END IF;SELECT id INTO STRICT v_contract_id FROM runtime_meta.entity_contract WHERE id=v_descriptor.entity_contract_id AND status='staged' FOR UPDATE;END IF;
  SELECT * INTO v_head FROM runtime_meta.release_activation_head WHERE publication_key=v_candidate.publication_key FOR UPDATE;
  IF FOUND THEN
    IF v_candidate.source_release_no<=v_head.source_release_no THEN RAISE EXCEPTION 'RELEASE_SEQUENCE_NOT_FORWARD' USING ERRCODE='object_not_in_prerequisite_state';END IF;
    v_previous:=v_head.applied_release_id;PERFORM authz.fn_retire_entity_operation_projection(v_previous,clock_timestamp());
    UPDATE runtime_meta.entity_descriptor SET status='retired',retired_at=clock_timestamp() WHERE applied_release_id=v_previous AND status='active';
    UPDATE runtime_meta.entity_contract c SET status='superseded',status_changed_at=clock_timestamp() WHERE c.id IN(SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_previous) AND c.status='published';
    UPDATE runtime_meta.applied_release SET status='superseded' WHERE id=v_previous AND status='active';
    UPDATE runtime_meta.release_activation_head SET applied_release_id=v_candidate.id,source_release_no=v_candidate.source_release_no,artifact_hash=v_candidate.artifact_hash,activated_at=clock_timestamp(),row_version=row_version+1 WHERE publication_key=v_candidate.publication_key RETURNING * INTO v_head;
  ELSE
    INSERT INTO runtime_meta.release_activation_head(publication_key,applied_release_id,source_release_no,artifact_hash,activated_at) VALUES(v_candidate.publication_key,v_candidate.id,v_candidate.source_release_no,v_candidate.artifact_hash,clock_timestamp()) RETURNING * INTO v_head;
  END IF;
  IF v_contract_id IS NOT NULL THEN PERFORM authz.fn_activate_entity_operation_projection(v_candidate.id,v_head.activated_at);UPDATE runtime_meta.entity_contract SET status='published',status_changed_at=v_head.activated_at WHERE id=v_contract_id;UPDATE runtime_meta.entity_descriptor SET status='active',activated_at=v_head.activated_at WHERE id=v_descriptor.id;END IF;
  UPDATE runtime_meta.applied_release SET status='active',activated_at=v_head.activated_at WHERE id=v_candidate.id;
  INSERT INTO runtime_meta.release_activation_event(publication_key,previous_applied_release_id,applied_release_id,activated_at,evidence) VALUES(v_candidate.publication_key,v_previous,v_candidate.id,v_head.activated_at,COALESCE(p_evidence,'{}'::jsonb));RETURN v_head;
END $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_rollback_release(p_publication_key text,p_target_applied_release_id uuid,p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS runtime_meta.release_activation_head LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
DECLARE v_head runtime_meta.release_activation_head%ROWTYPE;v_target runtime_meta.applied_release%ROWTYPE;v_previous uuid;v_activated_at timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO v_head FROM runtime_meta.release_activation_head WHERE publication_key=p_publication_key FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found';END IF;
  SELECT * INTO v_target FROM runtime_meta.applied_release WHERE id=p_target_applied_release_id AND publication_key=p_publication_key FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found';END IF;
  IF v_target.status NOT IN('superseded','verified') THEN RAISE EXCEPTION 'ROLLBACK_RELEASE_NOT_ELIGIBLE' USING ERRCODE='object_not_in_prerequisite_state';END IF;
  IF NOT EXISTS(SELECT 1 FROM runtime_meta.entity_descriptor WHERE applied_release_id=v_target.id) AND NOT EXISTS(SELECT 1 FROM runtime_meta.applied_release_payload WHERE applied_release_id=v_target.id) THEN RAISE EXCEPTION 'ROLLBACK_PROJECTION_NOT_FOUND' USING ERRCODE='no_data_found';END IF;
  v_previous:=v_head.applied_release_id;PERFORM authz.fn_retire_entity_operation_projection(v_previous,v_activated_at);
  UPDATE runtime_meta.entity_descriptor SET status='retired',retired_at=v_activated_at WHERE applied_release_id=v_previous AND status='active';
  UPDATE runtime_meta.entity_contract c SET status='superseded',status_changed_at=v_activated_at WHERE c.id IN(SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_previous) AND c.status='published';
  UPDATE runtime_meta.applied_release SET status='superseded' WHERE id=v_previous AND status='active';
  PERFORM authz.fn_restore_entity_operation_projection(v_target.id,v_activated_at);
  UPDATE runtime_meta.entity_descriptor SET status='active',activated_at=v_activated_at,retired_at=NULL WHERE applied_release_id=v_target.id AND status IN('staged','retired');
  UPDATE runtime_meta.entity_contract c SET status='published',status_changed_at=v_activated_at WHERE c.id IN(SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_target.id) AND c.status IN('staged','superseded');
  UPDATE runtime_meta.applied_release SET status='active',activated_at=v_activated_at WHERE id=v_target.id;
  UPDATE runtime_meta.release_activation_head SET applied_release_id=v_target.id,source_release_no=v_target.source_release_no,artifact_hash=v_target.artifact_hash,activated_at=v_activated_at,row_version=row_version+1 WHERE publication_key=p_publication_key RETURNING * INTO v_head;
  INSERT INTO runtime_meta.release_activation_event(publication_key,previous_applied_release_id,applied_release_id,activated_at,evidence) VALUES(p_publication_key,v_previous,v_target.id,v_activated_at,COALESCE(p_evidence,'{}'::jsonb)||jsonb_build_object('rollback',true));RETURN v_head;
END $$;

DROP FUNCTION runtime_meta.fn_active_business_partner_definition(text);
CREATE FUNCTION runtime_meta.fn_active_business_partner_definition(p_publication_key text)
RETURNS TABLE(id uuid,tenant_id uuid,revision_id uuid,release_id uuid,release_no bigint,publication_key text,plane_code text,bundle_code text,semantic_version text,bundle_schema_version text,bundle_hash text,bundle_json jsonb,generated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,runtime_meta AS $$
  SELECT p.id,p.tenant_id,(p.coordinates->>'revision_id')::uuid,a.source_release_id,a.source_release_no,a.publication_key,
         p.coordinates->>'plane_code',p.coordinates->>'bundle_code',p.coordinates->>'semantic_version',
         p.payload_schema_version,p.payload_hash,p.payload_json,p.generated_at
  FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
  JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id AND p.artifact_kind='business_partner_definition_bundle'
  WHERE h.publication_key=$1
$$;

DROP TRIGGER runtime_bp_definition_release_guard ON runtime_meta.applied_release;
DROP FUNCTION runtime_meta.trg_validate_business_partner_definition_release();
DROP FUNCTION runtime_meta.fn_stage_business_partner_definition(uuid,jsonb);
DROP TRIGGER runtime_bp_definition_bundle_immutable ON runtime_meta.business_partner_definition_bundle;
DROP FUNCTION runtime_meta.trg_guard_business_partner_definition_bundle();
DROP TABLE runtime_meta.business_partner_definition_bundle;

REVOKE ALL ON runtime_meta.applied_release_payload FROM PUBLIC;
REVOKE ALL ON FUNCTION runtime_meta.trg_guard_applied_release_payload(),runtime_meta.fn_stage_applied_release_payload(uuid,jsonb),runtime_meta.fn_active_business_partner_definition(text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN
    EXECUTE 'CREATE POLICY runtime_applied_release_payload_applier ON runtime_meta.applied_release_payload FOR ALL TO athyper_projection_applier USING(true) WITH CHECK(true)';
    GRANT SELECT ON runtime_meta.applied_release_payload TO athyper_projection_applier;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_stage_applied_release_payload(uuid,jsonb),runtime_meta.fn_active_business_partner_definition(text) TO athyper_projection_applier;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON runtime_meta.applied_release_payload TO athyperapp;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_active_business_partner_definition(text) TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL PRIVILEGES ON runtime_meta.applied_release_payload TO athyperadmin;
    GRANT EXECUTE ON FUNCTION runtime_meta.fn_stage_applied_release_payload(uuid,jsonb),runtime_meta.fn_active_business_partner_definition(text) TO athyperadmin;
  END IF;
END $$;

COMMIT;
