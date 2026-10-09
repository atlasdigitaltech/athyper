BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Current empty Studio foundation only. Historic resource upgrades retain their
-- pinned predecessor transitions and must not use this bridge.
DO $$
DECLARE expected record; actual text;
BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_STUDIO_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM metadata.entity_change_set)
   OR EXISTS(SELECT 1 FROM metadata.entity_release)
   OR EXISTS(SELECT 1 FROM snapshot.entity_draft_save) THEN
  RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_ENTITY_HISTORY_PRESENT';
 END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='runtime_meta.fn_verify_release(uuid,text,jsonb)'::regprocedure) IS DISTINCT FROM '9b0c2c07735a853ab04ddda224077fee' THEN
  RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_RESOURCE_VERIFIER_PREDECESSOR_UNKNOWN';
 END IF;
 FOR expected IN SELECT * FROM (VALUES
  ('publication.approve_authoring_resource(uuid,text)','43efddd86a498578b0b3ad4d7cf5b7bf'),
  ('publication.guard_authoring_resource_source()','8db3caed4b27fe80e755d99784f75b4a'),
  ('publication.propose_authoring_resource(jsonb,text)','e08d1458e7b832c249e726e2bd84e29b'),
  ('publication.read_authoring_resource(uuid)','b3b86c662eab8d6c321a57c5f8df2602'),
  ('publication.read_authoring_resource_review(uuid)','35dd2e630530462ccef3685a6a9c2681')
 ) AS v(signature,body_hash) LOOP
  SELECT md5(pg_get_functiondef(expected.signature::regprocedure)) INTO actual;
  IF actual IS DISTINCT FROM expected.body_hash THEN
   RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_RESOURCE_PREDECESSOR_UNKNOWN: %', expected.signature;
  END IF;
 END LOOP;
END $$;

-- Forward definition: authoring resources use the immutable payload projection,
-- regardless of the governed publication key. Legacy entity checks are retained.
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
       AND COALESCE(v_row.manifest->>'artifactKind','') NOT IN ('compiled_entity_runtime','entity_authoring_descriptor','entity_identity_review') THEN
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

-- Forward definition: authoring and live-read resources use the immutable payload projection,
-- regardless of the governed publication key. Legacy entity checks are retained.
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
       AND COALESCE(v_row.manifest->>'artifactKind','') NOT IN ('compiled_entity_runtime','entity_authoring_descriptor','entity_identity_review','entity_security_manifest','entity_storage_authority') THEN
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

-- Extend the existing reviewed-resource lifecycle. No resource rows, native
-- cutover, record authority or new grants are installed by this migration.
-- Narrow control-host command surface. Authenticated IAM authorization and
-- transactional audit remain the canonical host's responsibility.
CREATE OR REPLACE FUNCTION publication.read_authoring_resource(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.release;
BEGIN
 SELECT * INTO r FROM publication.release WHERE id=p_id AND tenant_id=shared.current_tenant_id_soft()
 AND metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review','entity_security_manifest','entity_storage_authority') FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF; RETURN to_jsonb(r);
END $$;
CREATE OR REPLACE FUNCTION publication.propose_authoring_resource(p_source jsonb,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=master.current_principal_id_soft(); tenant uuid:=shared.current_tenant_id_soft(); r publication.release;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE id=actor AND tenant_id=tenant AND principal_type='user' AND status='active') THEN RAISE EXCEPTION 'RESOURCE_HUMAN_ACTOR_REQUIRED'; END IF;
 IF p_source->>'kind' NOT IN ('entity_authoring_descriptor','entity_identity_review','entity_security_manifest','entity_storage_authority') OR p_source->>'kind' IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_hash IS NULL OR octet_length(p_source::text)>4194304 THEN RAISE EXCEPTION 'RESOURCE_SOURCE_INVALID'; END IF;
 IF p_source->>'kind' IN ('entity_security_manifest','entity_storage_authority') AND (
   p_source#>>'{payload,schema}' IS DISTINCT FROM 'entity.installed-live-read-resource/1'
   OR p_source#>>'{payload,content,plane}' IS NULL
   OR p_source#>>'{payload,content,plane}' NOT IN ('studio','neon','mesh')
   OR p_source#>>'{payload,pin,hash}' IS NULL
   OR p_source#>>'{payload,pin,hash}' !~ '^[a-f0-9]{64}$'
   OR (p_source->>'kind'='entity_security_manifest' AND p_source#>>'{payload,content,schema}' IS DISTINCT FROM 'entity.effective-security-manifest/1')
   OR (p_source->>'kind'='entity_storage_authority' AND p_source#>>'{payload,content,schema}' IS DISTINCT FROM 'entity.storage-authority/1')
 ) THEN RAISE EXCEPTION 'RESOURCE_SOURCE_INVALID'; END IF;
 IF p_source->>'kind'='entity_identity_review' AND (p_source#>>'{payload,proposerId}' IS DISTINCT FROM actor::text OR p_source#>>'{payload,reviewerId}'=actor::text) THEN RAISE EXCEPTION 'RESOURCE_AUTHOR_MISMATCH'; END IF;
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
 VALUES((p_source->>'releaseId')::uuid,tenant,p_source->>'publicationKey',(p_source->>'releaseNo')::bigint,'publish','preparing','breaking',p_hash,p_hash,actor,jsonb_build_object('artifactKind',p_source->>'kind','authoringResourceSource',p_source)) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT r FROM publication.release WHERE id=(p_source->>'releaseId')::uuid FOR SHARE;
 IF r.tenant_id<>tenant OR r.created_by<>actor OR r.release_hash<>p_hash OR r.metadata IS DISTINCT FROM jsonb_build_object('artifactKind',p_source->>'kind','authoringResourceSource',p_source) THEN RAISE EXCEPTION 'RESOURCE_PROPOSAL_CONFLICT'; END IF;
 RETURN to_jsonb(r);
END $$;
CREATE OR REPLACE FUNCTION publication.approve_authoring_resource(p_id uuid,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=master.current_principal_id_soft(); tenant uuid:=shared.current_tenant_id_soft(); r publication.release;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE id=actor AND tenant_id=tenant AND principal_type='user' AND status='active') THEN RAISE EXCEPTION 'RESOURCE_HUMAN_ACTOR_REQUIRED'; END IF;
 SELECT * INTO r FROM publication.release WHERE id=p_id AND tenant_id=tenant AND metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review','entity_security_manifest','entity_storage_authority') FOR UPDATE;
 IF NOT FOUND OR r.release_hash IS DISTINCT FROM p_hash OR r.created_by=actor OR r.status NOT IN ('preparing','approved') OR (r.approved_by IS NOT NULL AND r.approved_by<>actor) THEN RAISE EXCEPTION 'RESOURCE_REVIEW_CONFLICT'; END IF;
 IF r.metadata->>'artifactKind'='entity_identity_review' AND r.metadata#>>'{authoringResourceSource,payload,reviewerId}' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'RESOURCE_NAMED_REVIEW_REQUIRED'; END IF;
 SELECT * INTO r FROM publication.fn_transition_release(p_id,'approved',actor,NULL,jsonb_build_object('sourceHash',p_hash));
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION publication.read_authoring_resource(uuid),publication.propose_authoring_resource(jsonb,text),publication.approve_authoring_resource(uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA publication TO athyper_control_api;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource(uuid),publication.propose_authoring_resource(jsonb,text),publication.approve_authoring_resource(uuid,text) TO athyper_control_api;
CREATE OR REPLACE FUNCTION publication.guard_authoring_resource_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review','entity_security_manifest','entity_storage_authority') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RESOURCE_SOURCE_IMMUTABLE'; END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.release_key,NEW.release_no,NEW.release_kind,NEW.compatibility_level,NEW.release_hash,NEW.manifest_hash,NEW.created_by,NEW.metadata) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.release_key,OLD.release_no,OLD.release_kind,OLD.compatibility_level,OLD.release_hash,OLD.manifest_hash,OLD.created_by,OLD.metadata) OR (OLD.approved_by IS NOT NULL AND NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN RAISE EXCEPTION 'RESOURCE_SOURCE_IMMUTABLE'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION publication.guard_authoring_resource_source() FROM PUBLIC;
-- Audit-backed authenticated provenance, distinct from current IAM eligibility.
CREATE OR REPLACE FUNCTION publication.read_authoring_resource_review(p_id uuid)
RETURNS TABLE(author_id uuid,reviewer_id uuid,source_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT r.created_by,r.approved_by,r.release_hash FROM publication.release r
 WHERE r.id=p_id AND r.tenant_id=shared.current_tenant_id_soft() AND r.status IN ('approved','published') AND r.approved_by<>r.created_by
 AND r.metadata->>'artifactKind' IN ('entity_authoring_descriptor','entity_identity_review','entity_security_manifest','entity_storage_authority')
 AND EXISTS(SELECT 1 FROM audit.audit_log a WHERE a.tenant_id=r.tenant_id AND a.plane_code='studio' AND a.event_code='metadata.entity.product.review' AND a.entity_type='publication.release' AND a.entity_id=r.id AND a.actor_type='user' AND a.actor_principal_id=r.created_by AND a.outcome='success' AND a.context->>'resourceAction'='propose' AND a.context->>'sourceHash'=r.release_hash)
 AND EXISTS(SELECT 1 FROM audit.audit_log a WHERE a.tenant_id=r.tenant_id AND a.plane_code='studio' AND a.event_code='metadata.entity.product.review' AND a.entity_type='publication.release' AND a.entity_id=r.id AND a.actor_type='user' AND a.actor_principal_id=r.approved_by AND a.outcome='success' AND a.context->>'resourceAction'='approve' AND a.context->>'sourceHash'=r.release_hash);
$$;
REVOKE ALL ON FUNCTION publication.read_authoring_resource_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_authoring_resource_review(uuid) TO athyper_control_api;

DO $$
DECLARE expected record; actual text;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('publication.approve_authoring_resource(uuid,text)','e957aa5f788c53835b935c0273ad90f4'),
  ('publication.guard_authoring_resource_source()','8a8f588f9c05574d98d627e68bacd518'),
  ('publication.propose_authoring_resource(jsonb,text)','e17b2558e907aa7d69b53d459349afd1'),
  ('publication.read_authoring_resource(uuid)','bacaea34d899a26d56755ff4198c6a29'),
  ('publication.read_authoring_resource_review(uuid)','ccc09e75f50d9aceddd5ecacfc2e25a5'),
  ('runtime_meta.fn_verify_release(uuid,text,jsonb)','57989aa3b870a4e770b3d1a13d1f9f65')
 ) AS v(signature,body_hash) LOOP
  SELECT md5(pg_get_functiondef(expected.signature::regprocedure)) INTO actual;
  IF actual IS DISTINCT FROM expected.body_hash THEN
   RAISE EXCEPTION 'NATIVE_CLEAN_FOUNDATION_RESOURCE_PROTOCOL_DRIFT: %', expected.signature;
  END IF;
 END LOOP;
END $$;
COMMIT;
