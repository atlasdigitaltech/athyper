-- Exact local signed release binding and shared publication preparation.
BEGIN;
-- Local releases reuse the canonical signed-source, artifact and link writers.
-- The immutable request pins the envelope and authoring predecessor separately
-- from the per-plane runtime predecessor/artifact hashes.
ALTER TABLE publication.local_publication_request DROP CONSTRAINT local_publication_request_execution_status_check;
ALTER TABLE publication.local_publication_request ADD CONSTRAINT local_publication_request_execution_status_check CHECK(execution_status IN ('draft','in_review','approved','published'));
ALTER TABLE publication.local_publication_request ADD COLUMN execution_release_id uuid UNIQUE REFERENCES metadata.entity_release(id);

CREATE FUNCTION publication.bind_local_publication_release(p_release uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q publication.local_publication_request%ROWTYPE; r metadata.entity_release%ROWTYPE; c metadata.entity_change_set%ROWTYPE;
BEGIN
 SELECT * INTO STRICT q FROM publication.local_publication_request WHERE request_hash=NULLIF(current_setting('app.local_publication_request_hash',true),'')
 AND tenant_id=shared.current_tenant_id_soft() AND publisher_id=master.current_principal_id_soft() FOR UPDATE;
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND change_set_id=q.change_set_id AND tenant_id IS NULL;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=q.change_set_id;
 IF q.execution_release_id IS NOT NULL OR q.execution_status IS DISTINCT FROM 'approved'
 OR c.status::text IS DISTINCT FROM 'published' OR c.lock_version IS DISTINCT FROM q.execution_revision+1
 OR c.submitted_by::text IS DISTINCT FROM q.request_json#>>'{admission,authorWorkloadId}' OR c.approved_by IS DISTINCT FROM q.publisher_id
 OR r.published_by IS DISTINCT FROM q.publisher_id OR r.release_kind::text IS DISTINCT FROM 'publish'
 OR r.release_hash IS DISTINCT FROM q.request_json#>>'{inputs,release,descriptorHash}'
 OR r.supersedes_release_id::text IS DISTINCT FROM q.request_json#>>'{inputs,release,predecessorReleaseId}' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_RELEASE_BINDING_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE publication.local_publication_request SET execution_status='published',execution_revision=c.lock_version,execution_release_id=r.id WHERE request_hash=q.request_hash;
END $$;
REVOKE ALL ON FUNCTION publication.bind_local_publication_release(uuid) FROM PUBLIC;
ALTER FUNCTION publication.bind_local_publication_release(uuid) OWNER TO athyper_definer_product_publication;

CREATE OR REPLACE FUNCTION publication.local_publication_phase_authority(p_draft uuid,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.local_publication_request%ROWTYPE; checked jsonb; actor uuid:=master.current_principal_id_soft(); pins jsonb; planes jsonb;
BEGIN
 IF p_phase IS NULL OR p_phase NOT IN ('validate','submit','review','release','prepare') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_PHASE_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('system-entity-release:'||(SELECT entity_id::text FROM metadata.entity_change_set WHERE id=p_draft),0));
 SELECT * INTO STRICT r FROM publication.local_publication_request WHERE request_hash=NULLIF(current_setting('app.local_publication_request_hash',true),'')
 AND change_set_id=p_draft AND tenant_id=shared.current_tenant_id_soft() FOR UPDATE;
 checked:=publication.fn_local_publication_request_authority(r.request_json,false);
 IF r.request_json#>>'{admission,action}' IS DISTINCT FROM 'publish'
 OR actor IS DISTINCT FROM (CASE WHEN p_phase IN ('review','release','prepare') THEN r.publisher_id ELSE (r.request_json#>>'{admission,authorWorkloadId}')::uuid END)
 OR (p_phase IN ('validate','submit') AND checked#>>'{changeSet,status}' IS DISTINCT FROM 'draft')
 OR (p_phase='review' AND checked#>>'{changeSet,status}' IS DISTINCT FROM 'in_review')
 OR (p_phase='release' AND checked#>>'{changeSet,status}' IS DISTINCT FROM 'approved')
 OR (p_phase='prepare' AND (checked#>>'{changeSet,status}' IS DISTINCT FROM 'published' OR r.execution_release_id IS NULL))
 OR (p_phase IN ('review','release','prepare') AND checked#>>'{changeSet,submitted_by}' IS DISTINCT FROM r.request_json#>>'{admission,authorWorkloadId}')
 OR (p_phase IN ('release','prepare') AND checked#>>'{changeSet,approved_by}' IS DISTINCT FROM r.publisher_id::text) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_PHASE_DENIED' USING ERRCODE='42501'; END IF;
 pins:=r.request_json#>'{inputs,release}';
 IF p_phase IN ('release','prepare') AND (jsonb_typeof(pins) IS DISTINCT FROM 'object'
 OR pins->>'descriptorHash' IS NULL OR pins->>'descriptorHash' !~ '^[a-f0-9]{64}$'
 OR NOT (pins ? 'predecessorReleaseId')
 OR pins->>'predecessorReleaseId' IS DISTINCT FROM checked#>>'{changeSet,base_release_id}'
 OR (p_phase='prepare' AND NOT EXISTS(SELECT 1 FROM metadata.entity_release er WHERE er.id=r.execution_release_id
 AND er.change_set_id=p_draft AND er.tenant_id IS NULL AND er.release_hash=pins->>'descriptorHash' AND er.published_by=r.publisher_id))) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_RELEASE_PINS_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(t->>'plane' ORDER BY t->>'plane') INTO planes FROM jsonb_array_elements(r.request_json#>'{inputs,targets}') t;
 IF p_phase IN ('release','prepare') AND planes IS DISTINCT FROM
 (SELECT jsonb_agg(t->>'targetPlane' ORDER BY t->>'targetPlane') FROM jsonb_array_elements(checked#>'{graph,referenceMembers,members,target}') t) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_DECLARED_TARGETS_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN checked||jsonb_build_object('policy',jsonb_build_object(
 'schema','athyper.local-native-release/1','contractHash',r.request_json#>>'{inputs,sourceHash}',
 'descriptorHash',pins->>'descriptorHash','productHash',r.request_json#>>'{inputs,sourceHash}',
 'targetPlanes',planes,'predecessor',jsonb_build_object('authoringReleaseId',pins->>'predecessorReleaseId')));
END $$;

CREATE OR REPLACE FUNCTION publication.fn_create_system_entity_release(
  p_id uuid,p_change_set uuid,p_revision bigint,p_artifact jsonb,p_targets text[],p_actor uuid
) RETURNS SETOF metadata.entity_release LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; cs metadata.entity_change_set%ROWTYPE; revision snapshot.entity_contract_revision%ROWTYPE;
  expected_targets text[];
BEGIN
  authority:=publication.fn_system_entity_authority(p_change_set,'release');
  SELECT * INTO cs FROM metadata.entity_change_set WHERE id=p_change_set;
  SELECT array_agg(value ORDER BY value) INTO expected_targets FROM jsonb_array_elements_text(authority#>'{policy,targetPlanes}');
  IF p_actor IS DISTINCT FROM master.current_principal_id_soft() OR cs.lock_version<>p_revision
    OR p_artifact->>'contractHash' IS DISTINCT FROM authority#>>'{policy,contractHash}'
    OR p_artifact->>'descriptorHash' IS DISTINCT FROM authority#>>'{policy,descriptorHash}'
    OR encode(sha256(convert_to(publication.fn_successor_canonical_json(p_artifact->'descriptor'),'UTF8')),'hex')
      IS DISTINCT FROM authority#>>'{policy,descriptorHash}'
    OR p_artifact->>'signatureAlgorithm' IS DISTINCT FROM 'Ed25519'
    OR NULLIF(p_artifact->>'signingKeyId','') IS NULL OR NULLIF(p_artifact->>'signature','') IS NULL
    OR (SELECT array_agg(t ORDER BY t) FROM unnest(p_targets) t) IS DISTINCT FROM expected_targets THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SIGNED_SOURCE_MISMATCH' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('system-entity-release:'||cs.entity_id,0));
  IF EXISTS(SELECT 1 FROM metadata.entity_release WHERE entity_id=cs.entity_id AND tenant_id IS NULL) THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_FIRST_RELEASE_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO revision FROM snapshot.entity_contract_revision WHERE change_set_id=cs.id
    AND validation_status='valid' AND contract_json=authority->'graph' ORDER BY revision_no DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYSTEM_PUBLICATION_VALIDATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN QUERY INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,release_kind,
    contract_schema_code,contract_schema_version,contract_hash,revision_hash,release_hash,compatibility_level,target_planes,
    signature_algorithm,signing_key_id,contract_signature,published_by)
  VALUES(p_id,NULL,cs.entity_id,cs.id,revision.id,1,'publish',revision.contract_schema_code,revision.contract_schema_version,revision.contract_hash,
    revision.revision_hash,p_artifact->>'descriptorHash','backward_compatible',p_targets,
    'Ed25519',p_artifact->>'signingKeyId',p_artifact->>'signature',p_actor) RETURNING *;
IF authority->>'basis'='local_development_authority' THEN PERFORM publication.bind_local_publication_release(p_id); END IF;
END $$;

CREATE OR REPLACE FUNCTION publication.fn_create_system_entity_successor(
  p_id uuid,p_change_set uuid,p_revision bigint,p_predecessor uuid,p_artifact jsonb,p_targets text[],p_actor uuid
) RETURNS SETOF metadata.entity_release
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; policy jsonb; cs metadata.entity_change_set%ROWTYPE;
  revision snapshot.entity_contract_revision%ROWTYPE; previous metadata.entity_release%ROWTYPE;
  expected_targets text[];
BEGIN
  -- Authority acquires system-entity-release:<entity> before locking source,
  -- rechecks live independent enrollment, actor, lifecycle and predecessor pins.
  authority:=publication.fn_system_entity_authority(p_change_set,'release');
  policy:=authority->'policy';
  IF (policy->>'schema' IS DISTINCT FROM 'athyper.dev-entity-successor-policy/1' AND (authority->>'basis' IS DISTINCT FROM 'local_development_authority' OR policy->>'schema' IS DISTINCT FROM 'athyper.local-native-release/1'))
    OR p_predecessor::text IS DISTINCT FROM policy#>>'{predecessor,authoringReleaseId}' THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_ENROLLMENT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=p_change_set;
  SELECT * INTO previous FROM metadata.entity_release WHERE entity_id=cs.entity_id AND tenant_id IS NULL ORDER BY release_no DESC LIMIT 1 FOR UPDATE;
  IF previous.id IS DISTINCT FROM p_predecessor OR cs.base_release_id IS DISTINCT FROM p_predecessor THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_PREDECESSOR_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT array_agg(value ORDER BY value) INTO expected_targets FROM jsonb_array_elements_text(policy->'targetPlanes');
  IF p_actor IS DISTINCT FROM master.current_principal_id_soft() OR cs.lock_version<>p_revision
    OR p_artifact->>'contractHash' IS DISTINCT FROM policy->>'contractHash'
    OR p_artifact->>'descriptorHash' IS DISTINCT FROM policy->>'descriptorHash'
    OR encode(sha256(convert_to(publication.fn_successor_canonical_json(p_artifact->'descriptor'),'UTF8')),'hex') IS DISTINCT FROM policy->>'descriptorHash'
    OR p_artifact->>'signatureAlgorithm' IS DISTINCT FROM 'Ed25519'
    OR NULLIF(p_artifact->>'signingKeyId','') IS NULL OR NULLIF(p_artifact->>'signature','') IS NULL
    OR (SELECT array_agg(t ORDER BY t) FROM unnest(p_targets) t) IS DISTINCT FROM expected_targets THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SIGNED_SOURCE_MISMATCH' USING ERRCODE='42501'; END IF;
  SELECT * INTO revision FROM snapshot.entity_contract_revision WHERE change_set_id=cs.id AND tenant_id IS NULL
    AND base_release_id=p_predecessor AND validation_status='valid' AND contract_json=authority->'graph'
    ORDER BY revision_no DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYSTEM_PUBLICATION_VALIDATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN QUERY INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,release_kind,supersedes_release_id,
    contract_schema_code,contract_schema_version,contract_hash,revision_hash,release_hash,compatibility_level,target_planes,
    signature_algorithm,signing_key_id,contract_signature,published_by)
  VALUES(p_id,NULL,cs.entity_id,cs.id,revision.id,previous.release_no+1,'publish',p_predecessor,
    revision.contract_schema_code,revision.contract_schema_version,revision.contract_hash,revision.revision_hash,p_artifact->>'descriptorHash','backward_compatible',p_targets,
    'Ed25519',p_artifact->>'signingKeyId',p_artifact->>'signature',p_actor) RETURNING *;
IF authority->>'basis'='local_development_authority' THEN PERFORM publication.bind_local_publication_release(p_id); END IF;
END $$;

CREATE OR REPLACE FUNCTION publication.fn_store_system_entity_artifact(p_release uuid,p_plane text,p_descriptor jsonb,p_compliance jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE; authority jsonb;
BEGIN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL;
  authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
  IF r.published_by IS DISTINCT FROM master.current_principal_id_soft()
    OR p_plane IS NULL OR NOT p_plane=ANY(r.target_planes)
    OR jsonb_typeof(p_descriptor->'runtimeProfiles') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_descriptor->'runtimeProfiles')=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_descriptor->'runtimeProfiles') p WHERE p->>'storagePlane' IS DISTINCT FROM p_plane)
    OR p_descriptor#>>'{entity,entityCode}' IS DISTINCT FROM authority#>>'{graph,entity,entityCode}'
    OR p_compliance->>'schema' IS DISTINCT FROM (CASE WHEN authority#>>'{graph,contractSchema}'='athyper.meta-entity-contract/2.5' THEN 'athyper.native-entity-compilation-source/1' WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(authority#>'{graph,surfaces}') s WHERE s#>'{layoutConfig,tableEntityProduct}' IS NOT NULL) THEN 'athyper.table-entity-compilation-source/1' ELSE 'athyper.system-reference-compilation-source/1' END)
    OR p_compliance->>'productHash' IS DISTINCT FROM authority#>>'{policy,productHash}'
    OR p_compliance->>'sourceContractHash' IS DISTINCT FROM authority#>>'{policy,contractHash}'
    OR p_compliance->>'sourceDescriptorHash' IS DISTINCT FROM authority#>>'{policy,descriptorHash}'
    OR p_compliance->>'targetDescriptorHash' IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(p_descriptor),'UTF8')),'hex') THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_TARGET_SOURCE_MISMATCH' USING ERRCODE='42501'; END IF;
  IF COALESCE((authority->>'humanReview')::boolean,false) AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(authority#>'{executionPolicy,plan,members}') m,
      jsonb_array_elements(m->'targets') t WHERE m->>'changeSetId'=r.change_set_id::text
      AND t->>'plane'=p_plane AND t->>'descriptorHash'=p_compliance->>'targetDescriptorHash') THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_TARGET_PIN_CHANGED' USING ERRCODE='42501'; END IF;
  IF authority->>'basis'='local_development_authority' AND NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(authority#>'{request,inputs,targets}') t
 WHERE t->>'plane'=p_plane AND t->>'artifactHash'=p_compliance->>'targetDescriptorHash') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_TARGET_PIN_CHANGED' USING ERRCODE='42501'; END IF;
  INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,
    release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
  VALUES(NULL,r.id,r.revision_id,r.entity_id,p_plane,r.release_hash,r.contract_hash,p_descriptor,
    snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,p_plane,r.release_hash,r.contract_hash,p_descriptor),
    p_compliance,r.published_by);
END $$;

CREATE OR REPLACE FUNCTION publication.trg_validate_entity_release_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p publication.release%ROWTYPE; r metadata.entity_release%ROWTYPE; authority jsonb;
BEGIN
  SELECT * INTO STRICT p FROM publication.release WHERE id=NEW.publication_release_id;
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=NEW.entity_release_id;
  IF p.release_no<>r.release_no OR p.release_hash<>r.release_hash OR p.release_kind::text<>r.release_kind::text THEN
    RAISE EXCEPTION 'ENTITY_PUBLICATION_COORDINATE_MISMATCH' USING ERRCODE='23503'; END IF;
  IF r.tenant_id IS NULL THEN
    authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
    IF authority->>'basis'='local_development_authority' AND
 (p.metadata->>'approvalBasis' IS DISTINCT FROM 'local_development_authority'
 OR p.metadata->'localPublicationRequest' IS DISTINCT FROM authority->'request'
 OR p.metadata ? 'humanExecutionPolicy' OR p.metadata ? 'successorPolicy') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_RELEASE_LINK_DENIED' USING ERRCODE='42501'; END IF;
    IF COALESCE((authority->>'humanReview')::boolean,false) AND
      (p.metadata->'humanExecutionPolicy' IS DISTINCT FROM authority->'executionPolicy'
       OR p.metadata->>'executionPolicyId' IS DISTINCT FROM authority->>'executionPolicyId'
       OR p.metadata->>'executionPolicyHash' IS DISTINCT FROM authority->>'executionPolicyHash'
       OR p.metadata->>'coordinationHash' IS DISTINCT FROM authority->>'coordinationHash') THEN
      RAISE EXCEPTION 'HUMAN_PUBLICATION_POLICY_LINK_DENIED' USING ERRCODE='42501'; END IF;
    IF authority#>>'{policy,schema}'='athyper.dev-entity-successor-policy/1'
      AND p.metadata->'successorPolicy' IS DISTINCT FROM ((authority->'policy')-'productHash'-'targetPlanes') THEN
      RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_POLICY_LINK_DENIED' USING ERRCODE='42501'; END IF;
    IF p.tenant_id::text IS DISTINCT FROM authority->>'tenantId' OR p.id<>r.id
      OR p.created_by<>r.published_by OR r.published_by IS DISTINCT FROM master.current_principal_id_soft()
      OR p.release_key IS DISTINCT FROM ((CASE WHEN authority#>>'{graph,contractSchema}'='athyper.meta-entity-contract/2.5' THEN CASE WHEN authority#>>'{graph,entity,entityClass}'='reference' THEN 'metadata.reference.' ELSE 'metadata.entity.' END WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(authority#>'{graph,surfaces}') s WHERE s#>'{layoutConfig,tableEntityProduct}' IS NOT NULL) THEN 'metadata.entity.' ELSE 'metadata.reference.' END)||(authority#>>'{graph,entity,entityCode}'))
      OR p.metadata->>'sourceContractHash' IS DISTINCT FROM authority#>>'{policy,contractHash}'
      OR p.metadata->>'sourceDescriptorHash' IS DISTINCT FROM authority#>>'{policy,descriptorHash}'
      OR p.metadata->>'productHash' IS DISTINCT FROM authority#>>'{policy,productHash}' THEN
      RAISE EXCEPTION 'SYSTEM_PUBLICATION_AUTHORITY_LINK_DENIED' USING ERRCODE='42501'; END IF;
  ELSIF p.tenant_id IS DISTINCT FROM r.tenant_id THEN
    RAISE EXCEPTION 'ENTITY_PUBLICATION_COORDINATE_MISMATCH' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION publication.fn_system_entity_execution_metadata(p_release uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE; authority jsonb;
BEGIN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL
    AND published_by=master.current_principal_id_soft();
  authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
  IF authority->>'basis'='local_development_authority' THEN
 RETURN jsonb_build_object('approvalBasis','local_development_authority','localPublicationRequest',authority->'request'); END IF;
  IF NOT COALESCE((authority->>'humanReview')::boolean,false) THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('humanExecutionPolicy',authority->'executionPolicy','executionPolicyId',authority->>'executionPolicyId',
    'executionPolicyHash',authority->>'executionPolicyHash','coordinationHash',authority->>'coordinationHash');
END $$;

CREATE OR REPLACE FUNCTION publication.fn_human_publication_preparation_source(p_release uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE; authority jsonb; result jsonb;
BEGIN
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL
   AND published_by=master.current_principal_id_soft();
 authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
 IF NOT COALESCE((authority->>'humanReview')::boolean,false) AND authority->>'basis' IS DISTINCT FROM 'local_development_authority' THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('contract_json',s.contract_json,'revision_id',r.revision_id,'entity_id',r.entity_id,
   'entity_code',e.entity_code,'change_set_id',r.change_set_id,'release_no',r.release_no,'release_hash',r.release_hash,
   'contract_hash',r.contract_hash,'target_planes',r.target_planes,'contract_signature',r.contract_signature,
   'signature_algorithm',r.signature_algorithm,'signing_key_id',r.signing_key_id,'published_by',r.published_by,
   'approved_by',c.approved_by,'authority_tenant_id',shared.current_tenant_id_soft()) INTO STRICT result
 FROM metadata.entity e JOIN metadata.entity_change_set c ON c.entity_id=e.id AND c.id=r.change_set_id
 JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.change_set_id=c.id AND s.entity_id=e.id
 WHERE e.id=r.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system' AND c.tenant_id IS NULL
   AND s.tenant_id IS NULL AND s.validation_status='valid' AND c.status='published';
 IF authority->>'basis'='local_development_authority' AND EXISTS(
 SELECT 1 FROM publication.release p JOIN publication.entity_release_link l ON l.publication_release_id=p.id
 JOIN metadata.entity_release prior ON prior.id=l.entity_release_id
 WHERE p.release_key=(CASE WHEN authority#>>'{graph,entity,entityClass}'='reference' THEN 'metadata.reference.' ELSE 'metadata.entity.' END)||(result->>'entity_code')
 AND (prior.entity_id<>r.entity_id OR prior.tenant_id IS NOT NULL)) THEN
 RAISE EXCEPTION 'SYSTEM_REFERENCE_PUBLICATION_IDENTITY_CONFLICT' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION publication.finish_native_publication_validation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release; c metadata.entity_change_set; authority jsonb;
BEGIN
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=NEW.entity_release_id;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=r.change_set_id;
 IF c.native_core_layout_version IS NULL OR c.tenant_id IS NOT NULL THEN RETURN NEW; END IF;
 authority:=publication.fn_system_entity_authority(c.id,'prepare');
 IF ((authority->>'humanReview')::boolean IS DISTINCT FROM true AND authority->>'basis' IS DISTINCT FROM 'local_development_authority')
 OR c.source_kind IS DISTINCT FROM 'product' OR c.status::text IS DISTINCT FROM 'published'
 OR r.published_by IS DISTINCT FROM master.current_principal_id_soft()
 OR NEW.publication_release_id IS DISTINCT FROM r.id
 OR NOT EXISTS(SELECT 1 FROM publication.release p WHERE p.id=r.id
   AND p.tenant_id=shared.current_tenant_id_soft() AND p.created_by=r.published_by
   AND ((authority->>'humanReview'='true' AND p.metadata->'humanExecutionPolicy'=authority->'executionPolicy') OR (authority->>'basis'='local_development_authority' AND p.metadata->>'approvalBasis'='local_development_authority' AND p.metadata->'localPublicationRequest'=authority->'request')))
 THEN RAISE EXCEPTION 'NATIVE_PUBLICATION_VALIDATION_DENIED' USING ERRCODE='42501'; END IF;
 SET CONSTRAINTS metadata.native_layout_final_guard,metadata.native_core_final_guard,metadata.native_root_final_guard,metadata.native_snapshot_final_guard,metadata.settings_locale_check IMMEDIATE;
 RETURN NEW;
END $$;

CREATE FUNCTION publication.local_publication_release_receipt(p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q publication.local_publication_request%ROWTYPE; r metadata.entity_release%ROWTYPE; checked jsonb;
BEGIN
 IF p_hash IS DISTINCT FROM NULLIF(current_setting('app.local_publication_request_hash',true),'') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_REQUEST_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT q FROM publication.local_publication_request WHERE request_hash=p_hash AND tenant_id=shared.current_tenant_id_soft() AND publisher_id=master.current_principal_id_soft() FOR UPDATE;
 checked:=publication.fn_local_publication_request_authority(q.request_json,false);
 IF q.execution_release_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=q.execution_release_id AND tenant_id IS NULL AND change_set_id=q.change_set_id AND published_by=q.publisher_id;
 IF NOT EXISTS(SELECT 1 FROM publication.release p JOIN publication.entity_release_link l ON l.publication_release_id=p.id
 WHERE l.entity_release_id=r.id AND p.id=r.id AND p.tenant_id=q.tenant_id AND p.created_by=q.publisher_id
 AND p.metadata->>'approvalBasis'='local_development_authority' AND p.metadata->'localPublicationRequest'=q.request_json
 AND p.status IN ('approved','published') AND p.release_hash=r.release_hash) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_COMMITTED_RELEASE_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',r.id,'releaseNo',r.release_no);
END $$;
REVOKE ALL ON FUNCTION publication.local_publication_release_receipt(text) FROM PUBLIC;
ALTER FUNCTION publication.local_publication_release_receipt(text) OWNER TO athyper_definer_product_publication;
GRANT EXECUTE ON FUNCTION publication.local_publication_release_receipt(text) TO athyper_worker;

-- Downstream readers recheck standing authority and the committed immutable link.
-- This returns workload approval explicitly; it never manufactures human evidence.
CREATE FUNCTION publication.local_publication_execution_context(p_release uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q publication.local_publication_request%ROWTYPE; checked jsonb; prior text:=current_setting('app.local_publication_request_hash',true);
BEGIN
 SELECT * INTO STRICT q FROM publication.local_publication_request WHERE execution_release_id=p_release
 AND tenant_id=shared.current_tenant_id_soft() AND publisher_id=master.current_principal_id_soft() FOR SHARE;
 IF NULLIF(prior,'') IS NOT NULL AND prior<>q.request_hash THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_NESTED_REQUEST_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.local_publication_request_hash',q.request_hash,true);
 PERFORM publication.local_publication_release_receipt(q.request_hash);
 checked:=publication.fn_local_publication_request_authority(q.request_json,false);
 PERFORM set_config('app.local_publication_request_hash',COALESCE(prior,''),true);
 RETURN checked;
END $$;
REVOKE ALL ON FUNCTION publication.local_publication_execution_context(uuid) FROM PUBLIC;
ALTER FUNCTION publication.local_publication_execution_context(uuid) OWNER TO athyper_definer_product_publication;
GRANT EXECUTE ON FUNCTION publication.local_publication_execution_context(uuid) TO athyper_worker;

CREATE OR REPLACE FUNCTION publication.transition_local_publication_request(p_hash text,p_phase text,p_report jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.local_publication_request%ROWTYPE; checked jsonb; current_row metadata.entity_change_set%ROWTYPE;
 prior_scope text:=current_setting('app.local_publication_request_hash',true); wanted text; expected_actor uuid;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_phase IS NULL OR p_phase NOT IN ('submit','review')
 OR (NULLIF(prior_scope,'') IS NOT NULL AND prior_scope<>p_hash) THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_TRANSITION_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT r FROM publication.local_publication_request WHERE request_hash=p_hash
 AND tenant_id=shared.current_tenant_id_soft();
 PERFORM pg_advisory_xact_lock(hashtextextended('system-entity-release:'||(SELECT entity_id::text FROM metadata.entity_change_set WHERE id=r.change_set_id),0));
 SELECT * INTO STRICT r FROM publication.local_publication_request WHERE request_hash=p_hash FOR UPDATE;
 SELECT * INTO STRICT current_row FROM metadata.entity_change_set WHERE id=r.change_set_id FOR UPDATE;
 checked:=publication.fn_local_publication_request_authority(r.request_json,false);
 wanted:=CASE WHEN p_phase='submit' THEN 'in_review' ELSE 'approved' END;
 expected_actor:=CASE WHEN p_phase='submit' THEN (r.request_json#>>'{admission,authorWorkloadId}')::uuid ELSE r.publisher_id END;
 IF master.current_principal_id_soft() IS DISTINCT FROM expected_actor
 OR r.request_json#>>'{admission,action}' IS DISTINCT FROM 'publish' THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_PHASE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_report->>'contractHash' IS DISTINCT FROM r.request_json#>>'{inputs,sourceHash}'
 OR p_report->'issues' IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_VALIDATION_REQUIRED' USING ERRCODE='42501'; END IF;
 -- Replay succeeds only for a transition recorded by this exact request.
 IF (current_row.status::text=wanted OR (p_phase='submit' AND current_row.status='approved') OR (current_row.status='published' AND r.execution_release_id IS NOT NULL))
 AND r.execution_status=current_row.status::text AND r.execution_revision=current_row.lock_version THEN
   RETURN jsonb_build_object('basis','local_development_authority','requestHash',p_hash,'revision',current_row.lock_version,'status',current_row.status::text,'replayed',true);
 END IF;
 PERFORM set_config('app.local_publication_request_hash',p_hash,true);
 checked:=publication.local_publication_phase_authority(r.change_set_id,p_phase);
 IF p_phase='submit' THEN
   PERFORM publication.fn_record_system_entity_validation(r.change_set_id,current_row.lock_version,checked->'graph',p_report,expected_actor);
 END IF;
 SELECT * INTO STRICT current_row FROM publication.fn_transition_system_entity_change_set(
   r.change_set_id,current_row.lock_version,current_row.status::text,wanted,expected_actor);
 -- Native status trigger copies the exact immutable graph into the new revision.
 IF NOT EXISTS(SELECT 1 FROM snapshot.entity_draft_save WHERE change_set_id=r.change_set_id
   AND tenant_id IS NULL AND lock_version=current_row.lock_version AND graph=checked->'graph') THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_TRANSITION_SNAPSHOT_MISSING'; END IF;
 UPDATE publication.local_publication_request SET execution_revision=current_row.lock_version,execution_status=wanted WHERE request_hash=p_hash;
 PERFORM set_config('app.local_publication_request_hash',COALESCE(prior_scope,''),true);
 RETURN jsonb_build_object('basis','local_development_authority','requestHash',p_hash,'revision',current_row.lock_version,'status',wanted,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION publication.pending_local_publication_requests(p_after text,p_limit integer) RETURNS TABLE(request_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR (p_after IS NOT NULL AND p_after !~ '^[a-f0-9]{64}$')
 OR NOT EXISTS(SELECT 1 FROM master.principal WHERE id=master.current_principal_id_soft() AND tenant_id=shared.current_tenant_id_soft() AND status='active' AND principal_type='service_account')
 OR NOT EXISTS(SELECT 1 FROM publication.local_publication_host WHERE singleton AND identity='{"environment":"local","instance":"dev","domainSuffix":"dev.athyper.test"}'::jsonb)
 THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_DISCOVERY_DENIED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.request_hash FROM publication.local_publication_request r
 WHERE r.tenant_id=shared.current_tenant_id_soft() AND r.publisher_id=master.current_principal_id_soft()
 AND (r.execution_status IS NULL OR r.execution_status IN ('in_review','approved','published'))
 AND (r.request_json->>'expiresAt')::timestamptz>clock_timestamp()
 AND (p_after IS NULL OR r.request_hash>p_after)
 ORDER BY r.request_hash LIMIT p_limit;
END $$;

-- Narrow execution grants; each writer independently validates installed request
-- scope or the pre-existing human/machine authority. No source table grants.
GRANT EXECUTE ON FUNCTION publication.fn_create_system_entity_release(uuid,uuid,bigint,jsonb,text[],uuid),
publication.fn_create_system_entity_successor(uuid,uuid,bigint,uuid,jsonb,text[],uuid),
publication.fn_record_system_entity_validation(uuid,bigint,jsonb,jsonb,uuid),
publication.fn_human_publication_preparation_source(uuid),
publication.fn_system_entity_execution_metadata(uuid),
publication.fn_store_system_entity_artifact(uuid,text,jsonb,jsonb),
publication.fn_link_system_entity_release(uuid) TO athyper_worker;

COMMIT;
