-- Enrolled system-entity publication commands. No global UPDATE/INSERT policy.
-- DEV enrollment is a separate authority from tenant authoring and human MFA.
-- Source definitions remain immutable to these commands; no entity-name routing.
CREATE OR REPLACE FUNCTION publication.fn_system_entity_authority(p_change_set uuid,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cs metadata.entity_change_set%ROWTYPE; d control.policy_definition%ROWTYPE;
  config jsonb; policy jsonb; saved jsonb; actor uuid:=master.current_principal_id_soft();
  tenant uuid:=shared.current_tenant_id_soft(); author uuid; publisher uuid; n integer; predecessor jsonb; marker jsonb;
BEGIN
  IF actor IS NULL OR tenant IS NULL OR p_phase IS NULL OR p_phase NOT IN ('validate','submit','review','release','prepare') THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_CONTEXT_DENIED' USING ERRCODE='42501';
  END IF;
  -- Use the same lock order as source enrollment and successor allocation.
  PERFORM pg_advisory_xact_lock(hashtextextended('system-entity-release:'||(SELECT entity_id::text FROM metadata.entity_change_set WHERE id=p_change_set),0));
  SELECT * INTO cs FROM metadata.entity_change_set WHERE id=p_change_set FOR UPDATE;
  IF NOT FOUND OR cs.tenant_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM metadata.entity e
    WHERE e.id=cs.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system') THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SOURCE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO n FROM control.policy_definition pd JOIN control.policy_rule r ON r.policy_definition_id=pd.id
    WHERE pd.tenant_id=tenant AND pd.entity_type='metadata.publication' AND pd.status='active'
      AND r.action_config#>>'{policy,changeSetId}'=p_change_set::text;
  IF n<>1 THEN RAISE EXCEPTION 'SYSTEM_PUBLICATION_ENROLLMENT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT pd.* INTO STRICT d FROM control.policy_definition pd JOIN control.policy_rule r ON r.policy_definition_id=pd.id
    WHERE pd.tenant_id=tenant AND pd.entity_type='metadata.publication' AND pd.status='active'
      AND r.action_config#>>'{policy,changeSetId}'=p_change_set::text FOR SHARE OF pd;
  SELECT action_config INTO STRICT config FROM control.policy_rule WHERE policy_definition_id=d.id AND action_code='allow' FOR SHARE;
  policy:=config->'policy';
  author:=(policy->>'authorPrincipalId')::uuid; publisher:=(policy->>'publisherPrincipalId')::uuid;
  IF (config->>'schema'='athyper.machine-publication-enrollment/1' AND config->>'environment'='dev'
    AND config->>'permissionCode'='studio.metadata.contract.publish_automated' AND config->>'tenantId'=tenant::text
    AND policy->>'schema' IN ('athyper.dev-reference-onboarding/1','athyper.dev-entity-onboarding/1','athyper.dev-entity-successor-policy/1') AND policy->>'environment'='local'
    AND policy->>'instance'='dev' AND policy->>'entityId'=cs.entity_id::text
    AND author<>publisher AND cs.created_by<>publisher AND d.created_by<>d.updated_by
    AND d.updated_by<>author AND d.updated_by<>publisher) IS NOT TRUE
    OR d.effective_from>CURRENT_DATE OR (d.effective_until IS NOT NULL AND d.effective_until<CURRENT_DATE)
    OR (SELECT count(*) FROM control.policy_rule WHERE policy_definition_id=d.id)<>1
    OR NOT EXISTS(SELECT 1 FROM control.policy_rule WHERE policy_definition_id=d.id
      AND condition_expr=jsonb_build_object('and',jsonb_build_array(
        jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','environment'),'dev')),
        jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','tenantId'),tenant::text)),
        jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','policyHash'),
          encode(sha256(convert_to(publication.fn_successor_canonical_json(policy),'UTF8')),'hex'))))))
    OR EXISTS(SELECT 1 FROM control.policy_definition newer WHERE newer.tenant_id=tenant
      AND newer.entity_type=d.entity_type AND newer.name=d.name AND newer.id<>d.id
      AND newer.status='active' AND newer.version_no>=d.version_no)
    OR NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=tenant AND id=d.updated_by AND status='active' AND principal_type='user')
    OR (SELECT count(*) FROM master.principal WHERE tenant_id=tenant AND id IN (author,publisher)
      AND status='active' AND principal_type='service_account' AND provisioning_source='internal')<>2 THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_ENROLLMENT_DENIED' USING ERRCODE='42501';
  END IF;
  IF actor IS DISTINCT FROM (CASE WHEN p_phase IN ('validate','submit') THEN author ELSE publisher END)
    OR (cs.submitted_by IS NOT NULL AND cs.submitted_by<>author)
    OR (cs.approved_by IS NOT NULL AND cs.approved_by<>publisher)
    OR (p_phase='validate' AND cs.status NOT IN ('draft','in_review','approved'))
    OR (p_phase='submit' AND cs.status<>'draft')
    OR (p_phase='review' AND (cs.status<>'in_review' OR cs.submitted_by IS DISTINCT FROM author))
    OR (p_phase='release' AND (cs.status<>'approved' OR cs.submitted_by IS DISTINCT FROM author OR cs.approved_by IS DISTINCT FROM publisher))
    OR (p_phase='prepare' AND (cs.status<>'published' OR cs.approved_by IS DISTINCT FROM publisher)) THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_ACTOR_OR_STATE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT graph INTO saved FROM snapshot.entity_draft_save WHERE change_set_id=cs.id
    AND lock_version<=cs.lock_version ORDER BY lock_version DESC LIMIT 1;
  IF saved IS NULL OR encode(sha256(convert_to(publication.fn_successor_canonical_json(saved),'UTF8')),'hex')
      IS DISTINCT FROM policy->>'contractHash' THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SOURCE_PIN_CHANGED' USING ERRCODE='42501';
  END IF;
  IF policy->>'schema'='athyper.dev-entity-successor-policy/1' THEN
    predecessor:=policy->'predecessor';
    IF policy->>'authorityTenantId' IS DISTINCT FROM tenant::text OR cs.base_release_id::text IS DISTINCT FROM predecessor->>'authoringReleaseId'
      OR jsonb_typeof(policy->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(policy->'targets')=0
      OR NOT EXISTS(SELECT 1 FROM metadata.entity_release r
        JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.entity_id=r.entity_id AND s.tenant_id IS NULL
        JOIN publication.entity_release_link l ON l.entity_release_id=r.id
        JOIN publication.release pr ON pr.id=l.publication_release_id
        WHERE r.id=cs.base_release_id AND r.entity_id=cs.entity_id AND r.tenant_id IS NULL
          AND r.release_no::text=predecessor->>'authoringReleaseNo' AND r.release_hash=predecessor->>'authoringReleaseHash'
          AND r.revision_id::text=predecessor->>'revisionId' AND r.contract_hash=predecessor->>'contractHash'
          AND s.contract_hash=r.contract_hash AND s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json)
          AND s.validation_status='valid' AND r.signature_algorithm='Ed25519' AND r.contract_signature IS NOT NULL
          AND pr.id::text=predecessor->>'publicationReleaseId' AND pr.release_no::text=predecessor->>'publicationReleaseNo'
          AND pr.release_hash=predecessor->>'publicationReleaseHash' AND pr.tenant_id=tenant AND pr.status IN ('approved','published')
          AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=r.entity_id AND newer.tenant_id IS NULL
            AND newer.release_no>r.release_no AND NOT (p_phase='prepare' AND newer.change_set_id=cs.id AND newer.supersedes_release_id=r.id))
          AND NOT EXISTS(SELECT 1 FROM publication.release newer WHERE newer.release_key=pr.release_key AND newer.tenant_id=tenant
            AND newer.release_no>pr.release_no AND NOT (p_phase='prepare' AND EXISTS(SELECT 1 FROM metadata.entity_release own WHERE own.id=newer.id AND own.change_set_id=cs.id)))
          AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'targets') t WHERE
            (t->>'sourceReleaseId'=pr.id::text AND t->>'sourceReleaseNo'=pr.release_no::text AND t->>'publicationKey'=pr.release_key
              AND t->>'environment'='local' AND t->>'instance'='dev' AND t->>'plane' IN ('studio','neon','mesh')) IS NOT TRUE)) THEN
      RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_PREDECESSOR_CHANGED' USING ERRCODE='42501';
    END IF;
    -- Derived internal preparation coordinates, not extra authority added to
    -- the enrolled policy. The policy digest above uses the original document.
    SELECT COALESCE(value#>'{layoutConfig,systemReferenceProduct}',value#>'{layoutConfig,tableEntityProduct}') INTO STRICT marker FROM jsonb_array_elements(saved->'surfaces')
      WHERE COALESCE(value#>'{layoutConfig,systemReferenceProduct}',value#>'{layoutConfig,tableEntityProduct}') IS NOT NULL;
    IF (SELECT array_agg(t->>'plane' ORDER BY t->>'plane') FROM jsonb_array_elements(policy->'targets') t)
      IS DISTINCT FROM (SELECT array_agg(t ORDER BY t) FROM jsonb_array_elements_text(marker->'targetPlanes') t) THEN
      RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_TARGETS_CHANGED' USING ERRCODE='42501'; END IF;
    policy:=policy||jsonb_build_object('productHash',marker->>'productHash','targetPlanes',marker->'targetPlanes');
  ELSIF cs.base_release_id IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_FIRST_RELEASE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('policy',policy,'graph',saved,'changeSet',to_jsonb(cs),'tenantId',tenant);
END $$;
REVOKE ALL ON FUNCTION publication.fn_system_entity_authority(uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION publication.fn_record_system_entity_validation(
  p_change_set uuid,p_revision bigint,p_graph jsonb,p_report jsonb,p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; cs metadata.entity_change_set%ROWTYPE; prior snapshot.entity_contract_revision%ROWTYPE;
  outcome text;
BEGIN
  -- Publication revalidates the approved graph under the publisher. It may
  -- reuse an identical validation receipt, never manufacture new approval evidence.
  SELECT * INTO cs FROM metadata.entity_change_set WHERE id=p_change_set;
  authority:=publication.fn_system_entity_authority(p_change_set,
    CASE WHEN cs.status='approved' AND cs.approved_by=master.current_principal_id_soft() THEN 'release' ELSE 'validate' END);
  SELECT * INTO cs FROM metadata.entity_change_set WHERE id=p_change_set;
  IF p_actor IS DISTINCT FROM master.current_principal_id_soft() OR cs.lock_version<>p_revision
    OR p_graph IS DISTINCT FROM authority->'graph'
    OR p_report->>'contractHash' IS DISTINCT FROM authority#>>'{policy,contractHash}'
    OR jsonb_typeof(p_report->'issues') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_VALIDATION_MISMATCH' USING ERRCODE='42501';
  END IF;
  SELECT * INTO prior FROM snapshot.entity_contract_revision WHERE change_set_id=cs.id ORDER BY revision_no DESC LIMIT 1;
  outcome:=CASE WHEN jsonb_array_length(p_report->'issues')=0 THEN 'valid' ELSE 'invalid' END;
  IF prior.id IS NOT NULL AND prior.contract_json=p_graph AND prior.validation_status::text=outcome THEN RETURN; END IF;
  IF cs.status='approved' THEN RAISE EXCEPTION 'SYSTEM_PUBLICATION_APPROVED_VALIDATION_IMMUTABLE' USING ERRCODE='42501'; END IF;
  INSERT INTO snapshot.entity_contract_revision(tenant_id,entity_id,change_set_id,revision_no,parent_revision_id,parent_revision_hash,
    base_release_id,contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,payload_size_bytes,
    validation_status,validation_diagnostics,captured_by)
  VALUES(NULL,cs.entity_id,cs.id,COALESCE(prior.revision_no,0)+1,prior.id,prior.revision_hash,cs.base_release_id,
    'athyper.meta-entity-contract','2.1',p_graph,p_report->>'contractHash',p_report->>'contractHash',
    octet_length(publication.fn_successor_canonical_json(p_graph)),outcome::metadata.contract_validation_status_d,p_report->'issues',p_actor);
END $$;
REVOKE ALL ON FUNCTION publication.fn_record_system_entity_validation(uuid,bigint,jsonb,jsonb,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_record_system_entity_validation(uuid,bigint,jsonb,jsonb,uuid) TO athyper_runtime;
END IF; END $$;

CREATE OR REPLACE FUNCTION publication.fn_transition_system_entity_change_set(
  p_change_set uuid,p_revision bigint,p_from text,p_to text,p_actor uuid
) RETURNS SETOF metadata.entity_change_set LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; phase text;
BEGIN
  phase:=CASE WHEN p_from='draft' AND p_to='in_review' THEN 'submit'
    WHEN p_from='in_review' AND p_to='approved' THEN 'review' ELSE NULL END;
  IF phase IS NULL OR p_actor IS DISTINCT FROM master.current_principal_id_soft() THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_TRANSITION_DENIED' USING ERRCODE='42501'; END IF;
  authority:=publication.fn_system_entity_authority(p_change_set,phase);
  IF NOT EXISTS(SELECT 1 FROM snapshot.entity_contract_revision WHERE change_set_id=p_change_set
    AND validation_status='valid' AND contract_json=authority->'graph') THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_VALIDATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN QUERY UPDATE metadata.entity_change_set SET status=p_to::metadata.entity_change_set_status_d,status_changed_by=p_actor
    WHERE id=p_change_set AND lock_version=p_revision AND status::text=p_from RETURNING *;
END $$;
REVOKE ALL ON FUNCTION publication.fn_transition_system_entity_change_set(uuid,bigint,text,text,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_transition_system_entity_change_set(uuid,bigint,text,text,uuid) TO athyper_runtime;
END IF; END $$;

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
  VALUES(p_id,NULL,cs.entity_id,cs.id,revision.id,1,'publish','athyper.meta-entity-contract','2.1',revision.contract_hash,
    revision.revision_hash,p_artifact->>'descriptorHash','backward_compatible',p_targets,
    'Ed25519',p_artifact->>'signingKeyId',p_artifact->>'signature',p_actor) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION publication.fn_create_system_entity_release(uuid,uuid,bigint,jsonb,text[],uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_create_system_entity_release(uuid,uuid,bigint,jsonb,text[],uuid) TO athyper_runtime;
END IF; END $$;

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
    OR p_compliance->>'schema' IS DISTINCT FROM (CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(authority#>'{graph,surfaces}') s WHERE s#>'{layoutConfig,tableEntityProduct}' IS NOT NULL) THEN 'athyper.table-entity-compilation-source/1' ELSE 'athyper.system-reference-compilation-source/1' END)
    OR p_compliance->>'productHash' IS DISTINCT FROM authority#>>'{policy,productHash}'
    OR p_compliance->>'sourceContractHash' IS DISTINCT FROM authority#>>'{policy,contractHash}'
    OR p_compliance->>'sourceDescriptorHash' IS DISTINCT FROM authority#>>'{policy,descriptorHash}'
    OR p_compliance->>'targetDescriptorHash' IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(p_descriptor),'UTF8')),'hex') THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_TARGET_SOURCE_MISMATCH' USING ERRCODE='42501'; END IF;
  INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,
    release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
  VALUES(NULL,r.id,r.revision_id,r.entity_id,p_plane,r.release_hash,r.contract_hash,p_descriptor,
    snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,p_plane,r.release_hash,r.contract_hash,p_descriptor),
    p_compliance,r.published_by);
END $$;
REVOKE ALL ON FUNCTION publication.fn_store_system_entity_artifact(uuid,text,jsonb,jsonb) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_store_system_entity_artifact(uuid,text,jsonb,jsonb) TO athyper_runtime;
END IF; END $$;

-- Tenant content retains same-tenant correspondence. Global system content is
-- linked only through the private enrolled authority check, not a NULL exception.
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
    IF authority#>>'{policy,schema}'='athyper.dev-entity-successor-policy/1'
      AND p.metadata->'successorPolicy' IS DISTINCT FROM ((authority->'policy')-'productHash'-'targetPlanes') THEN
      RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_POLICY_LINK_DENIED' USING ERRCODE='42501'; END IF;
    IF p.tenant_id::text IS DISTINCT FROM authority->>'tenantId' OR p.id<>r.id
      OR p.created_by<>r.published_by OR r.published_by IS DISTINCT FROM master.current_principal_id_soft()
      OR p.release_key IS DISTINCT FROM ((CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(authority#>'{graph,surfaces}') s WHERE s#>'{layoutConfig,tableEntityProduct}' IS NOT NULL) THEN 'metadata.entity.' ELSE 'metadata.reference.' END)||(authority#>>'{graph,entity,entityCode}'))
      OR p.metadata->>'sourceContractHash' IS DISTINCT FROM authority#>>'{policy,contractHash}'
      OR p.metadata->>'sourceDescriptorHash' IS DISTINCT FROM authority#>>'{policy,descriptorHash}'
      OR p.metadata->>'productHash' IS DISTINCT FROM authority#>>'{policy,productHash}' THEN
      RAISE EXCEPTION 'SYSTEM_PUBLICATION_AUTHORITY_LINK_DENIED' USING ERRCODE='42501'; END IF;
  ELSIF p.tenant_id IS DISTINCT FROM r.tenant_id THEN
    RAISE EXCEPTION 'ENTITY_PUBLICATION_COORDINATE_MISMATCH' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION publication.fn_link_system_entity_release(p_release uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL;
  PERFORM publication.fn_system_entity_authority(r.change_set_id,'prepare');
  INSERT INTO publication.entity_release_link(publication_release_id,entity_release_id) VALUES(p_release,p_release);
END $$;
REVOKE ALL ON FUNCTION publication.fn_link_system_entity_release(uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_runtime') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_link_system_entity_release(uuid) TO athyper_runtime;
END IF; END $$;
