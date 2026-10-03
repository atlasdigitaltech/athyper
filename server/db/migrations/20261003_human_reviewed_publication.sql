-- Exact human-reviewed Entity publication, coordinated worker evidence and bounded definer ownership.
-- Policy enrollment remains an authenticated, independent control API operation.
BEGIN;
SET LOCAL lock_timeout = '10s';

-- Canonical: ddl/planes/studio/control/13_publication_policy_evidence.sql
-- Narrow machine-policy evidence read. Principal RLS remains unchanged.
-- Caller sees a boolean for its exact enrolled policy, never principal records.
CREATE OR REPLACE FUNCTION control.publication_policy_enrollment_is_active(
  p_id uuid, p_hash text, p_author uuid, p_publisher uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,control,master,shared AS $$
 SELECT EXISTS(
  SELECT 1 FROM control.policy_definition d
  JOIN master.principal reviewer ON reviewer.tenant_id=d.tenant_id AND reviewer.id=d.updated_by
    AND reviewer.status='active' AND reviewer.principal_type='user'
  JOIN master.principal publisher ON publisher.tenant_id=d.tenant_id AND publisher.id=p_publisher
    AND publisher.status='active' AND publisher.principal_type='service_account'
  WHERE d.id=p_id AND d.tenant_id=shared.current_tenant_id_soft()
    AND p_publisher=master.current_principal_id_soft() AND p_author<>p_publisher
    AND d.entity_type='metadata.publication' AND d.definition_hash=p_hash AND d.status='active'
    AND d.updated_by<>d.created_by AND d.updated_by<>p_author AND d.updated_by<>p_publisher
    AND (SELECT count(*) FROM control.policy_rule r WHERE r.policy_definition_id=d.id)=1
    AND EXISTS(SELECT 1 FROM control.policy_rule r WHERE r.policy_definition_id=d.id AND r.action_code='allow'
      AND r.action_config->>'schema'='athyper.machine-publication-enrollment/1'
      AND r.action_config->>'environment'='dev'
      AND r.action_config->>'tenantId'=d.tenant_id::text
      AND r.action_config#>>'{policy,authorPrincipalId}'=p_author::text
      AND r.action_config#>>'{policy,publisherPrincipalId}'=p_publisher::text)
    AND NOT EXISTS(SELECT 1 FROM control.policy_definition newer
      WHERE newer.tenant_id=d.tenant_id AND newer.entity_type=d.entity_type AND newer.name=d.name
        AND newer.id<>d.id AND newer.status='active' AND newer.version_no>=d.version_no)
 );
$$;
REVOKE ALL ON FUNCTION control.publication_policy_enrollment_is_active(uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.publication_policy_enrollment_is_active(uuid,text,uuid,uuid) TO athyper_runtime,athyper_worker;

-- Canonical: ddl/planes/studio/publication/15_system_entity_commands.sql
-- Enrolled system-entity publication commands. No global UPDATE/INSERT policy.
-- DEV enrollment is a separate authority from tenant authoring and human MFA.
-- Source definitions remain immutable to these commands; no entity-name routing.
CREATE OR REPLACE FUNCTION publication.fn_system_entity_authority(p_change_set uuid,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cs metadata.entity_change_set%ROWTYPE; d control.policy_definition%ROWTYPE;
  config jsonb; policy jsonb; enrolled_policy jsonb; human_review boolean; saved jsonb; actor uuid:=master.current_principal_id_soft();
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
      AND (r.action_config#>>'{policy,changeSetId}'=p_change_set::text OR
        (r.action_config#>>'{policy,schema}'='athyper.dev-human-reviewed-publication/1'
          AND r.action_config#>'{policy,plan,members}' @> jsonb_build_array(jsonb_build_object('changeSetId',p_change_set))));
  IF n<>1 THEN RAISE EXCEPTION 'SYSTEM_PUBLICATION_ENROLLMENT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT pd.* INTO STRICT d FROM control.policy_definition pd JOIN control.policy_rule r ON r.policy_definition_id=pd.id
    WHERE pd.tenant_id=tenant AND pd.entity_type='metadata.publication' AND pd.status='active'
      AND (r.action_config#>>'{policy,changeSetId}'=p_change_set::text OR
        (r.action_config#>>'{policy,schema}'='athyper.dev-human-reviewed-publication/1'
          AND r.action_config#>'{policy,plan,members}' @> jsonb_build_array(jsonb_build_object('changeSetId',p_change_set)))) FOR SHARE OF pd;
  SELECT action_config INTO STRICT config FROM control.policy_rule WHERE policy_definition_id=d.id AND action_code='allow' FOR SHARE;
  policy:=config->'policy';
  enrolled_policy:=policy;
  human_review:=policy->>'schema'='athyper.dev-human-reviewed-publication/1';
  IF human_review THEN policy:=publication.fn_human_reviewed_entity_policy(enrolled_policy,p_change_set,p_phase); END IF;
  author:=(policy->>'authorPrincipalId')::uuid; publisher:=(policy->>'publisherPrincipalId')::uuid;
  IF human_review AND NOT control.publication_policy_enrollment_is_active(d.id,d.definition_hash,author,publisher) THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_EXECUTION_POLICY_REVOKED' USING ERRCODE='42501'; END IF;
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
          encode(sha256(convert_to(publication.fn_successor_canonical_json(enrolled_policy),'UTF8')),'hex'))))))
    OR EXISTS(SELECT 1 FROM control.policy_definition newer WHERE newer.tenant_id=tenant
      AND newer.entity_type=d.entity_type AND newer.name=d.name AND newer.id<>d.id
      AND newer.status='active' AND newer.version_no>=d.version_no)
    OR NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=tenant AND id=d.updated_by AND status='active' AND principal_type='user')
    OR (SELECT count(*) FROM master.principal WHERE tenant_id=tenant AND id IN (author,publisher)
      AND status='active' AND principal_type='service_account' AND provisioning_source='internal')<>2 THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_ENROLLMENT_DENIED' USING ERRCODE='42501';
  END IF;
  IF NOT human_review AND (actor IS DISTINCT FROM (CASE WHEN p_phase IN ('validate','submit') THEN author ELSE publisher END)
    OR (cs.submitted_by IS NOT NULL AND cs.submitted_by<>author)
    OR (cs.approved_by IS NOT NULL AND cs.approved_by<>publisher)
    OR (p_phase='validate' AND cs.status NOT IN ('draft','in_review','approved'))
    OR (p_phase='submit' AND cs.status<>'draft')
    OR (p_phase='review' AND (cs.status<>'in_review' OR cs.submitted_by IS DISTINCT FROM author))
    OR (p_phase='release' AND (cs.status<>'approved' OR cs.submitted_by IS DISTINCT FROM author OR cs.approved_by IS DISTINCT FROM publisher))
    OR (p_phase='prepare' AND (cs.status<>'published' OR cs.approved_by IS DISTINCT FROM publisher))) THEN
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
  RETURN jsonb_build_object('policy',policy,'graph',saved,'changeSet',to_jsonb(cs),'tenantId',tenant)
    || CASE WHEN human_review THEN jsonb_build_object('humanReview',true,'executionPolicy',enrolled_policy,
      'executionPolicyId',d.id,'executionPolicyHash',d.definition_hash,
      'coordinationHash',encode(sha256(convert_to(publication.fn_successor_canonical_json(enrolled_policy->'plan'),'UTF8')),'hex')) ELSE '{}'::jsonb END;
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
  IF cs.status='approved' AND NOT (COALESCE((authority->>'humanReview')::boolean,false) AND outcome='valid') THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_APPROVED_VALIDATION_IMMUTABLE' USING ERRCODE='42501'; END IF;
  INSERT INTO snapshot.entity_contract_revision(tenant_id,entity_id,change_set_id,revision_no,parent_revision_id,parent_revision_hash,
    base_release_id,contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,payload_size_bytes,
    validation_status,validation_diagnostics,captured_by)
  VALUES(NULL,cs.entity_id,cs.id,COALESCE(prior.revision_no,0)+1,prior.id,prior.revision_hash,cs.base_release_id,
    'athyper.meta-entity-contract','2.1',p_graph,p_report->>'contractHash',p_report->>'contractHash',
    octet_length(publication.fn_successor_canonical_json(p_graph)),outcome::metadata.contract_validation_status_d,p_report->'issues',p_actor);
END $$;
REVOKE ALL ON FUNCTION publication.fn_record_system_entity_validation(uuid,bigint,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_record_system_entity_validation(uuid,bigint,jsonb,jsonb,uuid) TO athyper_runtime;

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
GRANT EXECUTE ON FUNCTION publication.fn_transition_system_entity_change_set(uuid,bigint,text,text,uuid) TO athyper_runtime;

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
GRANT EXECUTE ON FUNCTION publication.fn_create_system_entity_release(uuid,uuid,bigint,jsonb,text[],uuid) TO athyper_runtime;

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
  IF COALESCE((authority->>'humanReview')::boolean,false) AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(authority#>'{executionPolicy,plan,members}') m,
      jsonb_array_elements(m->'targets') t WHERE m->>'changeSetId'=r.change_set_id::text
      AND t->>'plane'=p_plane AND t->>'descriptorHash'=p_compliance->>'targetDescriptorHash') THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_TARGET_PIN_CHANGED' USING ERRCODE='42501'; END IF;
  INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,
    release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
  VALUES(NULL,r.id,r.revision_id,r.entity_id,p_plane,r.release_hash,r.contract_hash,p_descriptor,
    snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,p_plane,r.release_hash,r.contract_hash,p_descriptor),
    p_compliance,r.published_by);
END $$;
REVOKE ALL ON FUNCTION publication.fn_store_system_entity_artifact(uuid,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_store_system_entity_artifact(uuid,text,jsonb,jsonb) TO athyper_runtime;

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
GRANT EXECUTE ON FUNCTION publication.fn_link_system_entity_release(uuid) TO athyper_runtime;

-- Canonical: ddl/planes/studio/publication/16_compiled_entity_source_identity.sql
-- Add source identity without changing the v1 SQL return contract or any signed
-- historical artifact. The v1 function remains the approval/tenant read gate.
CREATE OR REPLACE FUNCTION publication.fn_compiled_entity_compilation_source_v2(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid, release_key text, release_no bigint,
 source_tenant_id uuid, revision_id uuid, published_by uuid, entity_code text,
 contract_json jsonb, compiled_json jsonb, plane_key text, created_at timestamptz,
 target_planes text[], source_entity_id uuid, source_release_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.*,r.entity_id,r.release_hash
 FROM publication.fn_compiled_entity_compilation_source(p_release_id) s
 JOIN publication.entity_release_link l ON l.publication_release_id=s.publication_release_id
 JOIN metadata.entity_release r ON r.id=l.entity_release_id AND r.revision_id=s.revision_id
   AND r.tenant_id IS NOT DISTINCT FROM s.source_tenant_id;
$$;
REVOKE ALL ON FUNCTION publication.fn_compiled_entity_compilation_source_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_compiled_entity_compilation_source_v2(uuid) TO athyper_publication_service;

-- Canonical: ddl/planes/studio/publication/17_system_entity_successor.sql
-- Separate successor command. The first-release allocator retains its original
-- no-existing-release restriction. No broad RLS policy or table write grant.
CREATE OR REPLACE FUNCTION publication.fn_entity_successor_saved_graph(p_change_set uuid,p_predecessor uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT saved.graph FROM metadata.entity_change_set cs
 JOIN metadata.entity e ON e.id=cs.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
 JOIN metadata.entity_release r ON r.id=cs.base_release_id AND r.entity_id=cs.entity_id AND r.tenant_id IS NULL
 JOIN publication.entity_release_link l ON l.entity_release_id=r.id
 JOIN publication.release p ON p.id=l.publication_release_id AND p.tenant_id=shared.current_tenant_id_soft()
 JOIN master.principal actor ON actor.id=master.current_principal_id_soft() AND actor.tenant_id=p.tenant_id AND actor.status='active'
 JOIN LATERAL (SELECT graph FROM snapshot.entity_draft_save WHERE change_set_id=cs.id
   AND lock_version<=cs.lock_version ORDER BY lock_version DESC LIMIT 1) saved ON true
 WHERE cs.id=p_change_set AND r.id=p_predecessor AND cs.tenant_id IS NULL
   AND cs.status IN ('draft','in_review','approved') AND p.status IN ('approved','published');
$$;
REVOKE ALL ON FUNCTION publication.fn_entity_successor_saved_graph(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_entity_successor_saved_graph(uuid,uuid) TO athyper_runtime;

-- Control API needs the pinned source, not broad reads of metadata, snapshots
-- and publication tables. Caller tenant/principal remain mandatory.
CREATE OR REPLACE FUNCTION publication.fn_entity_successor_enrollment_source(p_policy jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT publication.fn_entity_successor_saved_graph(cs.id,r.id)
 FROM metadata.entity_change_set cs
 JOIN metadata.entity e ON e.id=cs.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
 JOIN metadata.entity_release r ON r.id=cs.base_release_id AND r.entity_id=cs.entity_id AND r.tenant_id IS NULL
 JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.entity_id=r.entity_id AND s.tenant_id IS NULL
 JOIN publication.entity_release_link l ON l.entity_release_id=r.id
 JOIN publication.release pr ON pr.id=l.publication_release_id
 WHERE p_policy->>'schema'='athyper.dev-entity-successor-policy/1'
   AND p_policy->>'authorityTenantId'=shared.current_tenant_id_soft()::text
   AND cs.id::text=p_policy->>'changeSetId' AND cs.entity_id::text=p_policy->>'entityId' AND cs.tenant_id IS NULL
   AND cs.status IN ('draft','in_review','approved') AND cs.created_by::text<>p_policy->>'publisherPrincipalId'
   AND (cs.submitted_by IS NULL OR cs.submitted_by::text=p_policy->>'authorPrincipalId')
   AND (cs.approved_by IS NULL OR cs.approved_by::text=p_policy->>'publisherPrincipalId')
   AND r.id::text=p_policy#>>'{predecessor,authoringReleaseId}' AND r.release_no::text=p_policy#>>'{predecessor,authoringReleaseNo}'
   AND r.release_hash=p_policy#>>'{predecessor,authoringReleaseHash}' AND r.contract_hash=p_policy#>>'{predecessor,contractHash}'
   AND r.revision_id::text=p_policy#>>'{predecessor,revisionId}' AND s.validation_status='valid'
   AND s.contract_hash=r.contract_hash AND s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json)
   AND r.signature_algorithm='Ed25519' AND r.contract_signature IS NOT NULL
   AND pr.id::text=p_policy#>>'{predecessor,publicationReleaseId}' AND pr.tenant_id=shared.current_tenant_id_soft()
   AND pr.release_no::text=p_policy#>>'{predecessor,publicationReleaseNo}' AND pr.release_hash=p_policy#>>'{predecessor,publicationReleaseHash}'
   AND pr.release_key=p_policy#>>'{targets,0,publicationKey}' AND pr.status IN ('approved','published')
   AND NOT EXISTS(SELECT 1 FROM metadata.entity_release n WHERE n.entity_id=r.entity_id AND n.tenant_id IS NULL AND n.release_no>r.release_no)
   AND NOT EXISTS(SELECT 1 FROM publication.release n WHERE n.release_key=pr.release_key AND n.tenant_id=pr.tenant_id AND n.release_no>pr.release_no)
   AND (SELECT count(*) FROM master.principal WHERE tenant_id=pr.tenant_id
     AND id::text IN (p_policy->>'authorPrincipalId',p_policy->>'publisherPrincipalId')
     AND principal_type='service_account' AND provisioning_source='internal' AND status='active')=2;
$$;
REVOKE ALL ON FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) TO athyper_runtime;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
  GRANT USAGE ON SCHEMA publication TO athyper_control_api;
  GRANT EXECUTE ON FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) TO athyper_control_api;
END IF; END $$;

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
  IF policy->>'schema' IS DISTINCT FROM 'athyper.dev-entity-successor-policy/1'
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
    'athyper.meta-entity-contract','2.1',revision.contract_hash,revision.revision_hash,p_artifact->>'descriptorHash','backward_compatible',p_targets,
    'Ed25519',p_artifact->>'signingKeyId',p_artifact->>'signature',p_actor) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION publication.fn_create_system_entity_successor(uuid,uuid,bigint,uuid,jsonb,text[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_create_system_entity_successor(uuid,uuid,bigint,uuid,jsonb,text[],uuid) TO athyper_runtime;

CREATE OR REPLACE FUNCTION publication.fn_system_entity_successor_policy(p_release uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE; authority jsonb;
BEGIN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL AND release_no>1;
  authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
  IF authority#>>'{policy,schema}' IS DISTINCT FROM 'athyper.dev-entity-successor-policy/1' THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_ENROLLMENT_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN (authority->'policy')-'productHash'-'targetPlanes';
END $$;
REVOKE ALL ON FUNCTION publication.fn_system_entity_successor_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_system_entity_successor_policy(uuid) TO athyper_runtime;

-- Approved immutable policy coordinates accompany the existing scoped source.
-- v1/v2 readers and historical signed artifacts are not rewritten.
CREATE OR REPLACE FUNCTION publication.fn_compiled_entity_compilation_source_v3(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid, release_key text, release_no bigint,
 source_tenant_id uuid, revision_id uuid, published_by uuid, entity_code text,
 contract_json jsonb, compiled_json jsonb, plane_key text, created_at timestamptz,
 target_planes text[], source_entity_id uuid, source_release_hash text, successor_policy jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.*,p.metadata->'successorPolicy'
 FROM publication.fn_compiled_entity_compilation_source_v2(p_release_id) s
 JOIN publication.release p ON p.id=s.publication_release_id;
$$;
REVOKE ALL ON FUNCTION publication.fn_compiled_entity_compilation_source_v3(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_compiled_entity_compilation_source_v3(uuid) TO athyper_publication_service;

-- Canonical: ddl/planes/studio/publication/18_compilation_recovery.sql
-- Bounded, read-only evidence for pre-artifact compilation recovery. This does
-- not approve, allocate, rewrite or activate releases. No table grants change.
CREATE OR REPLACE FUNCTION publication.fn_compilation_recovery_source(p_policy jsonb, p_require_empty boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('graph',s.contract_json,'originalPolicy',pr.metadata->'successorPolicy',
   'releaseId',pr.id,'releaseHash',pr.release_hash,'revisionId',s.id,
   'empty',NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=pr.id)
     AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=pr.id))
 FROM publication.release pr
 JOIN publication.entity_release_link l ON l.publication_release_id=pr.id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id IS NULL
 JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id AND cs.tenant_id IS NULL
 JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
 JOIN snapshot.entity_contract_revision s ON s.id=er.revision_id AND s.entity_id=er.entity_id AND s.tenant_id IS NULL
 JOIN master.principal actor ON actor.id=master.current_principal_id_soft() AND actor.tenant_id=pr.tenant_id AND actor.status='active'
 JOIN ops.job_execution j ON j.id::text=p_policy->>'failedJobId' AND j.tenant_id=pr.tenant_id
 WHERE p_policy->>'schema'='athyper.dev-compilation-recovery-policy/1'
   AND p_policy->>'environment'='local' AND p_policy->>'instance'='dev'
   AND pr.tenant_id=shared.current_tenant_id_soft() AND pr.tenant_id::text=p_policy->>'authorityTenantId'
   AND pr.id::text=p_policy->>'failedReleaseId' AND pr.release_hash=p_policy->>'failedReleaseHash'
   AND pr.status IN ('approved','published') AND er.release_no=pr.release_no
   AND pr.release_no=(p_policy#>>'{predecessor,publicationReleaseNo}')::bigint+1
   AND cs.id::text=p_policy->>'changeSetId' AND cs.entity_id::text=p_policy->>'entityId' AND cs.status='published'
   AND cs.submitted_by::text=p_policy->>'authorPrincipalId' AND cs.approved_by::text=p_policy->>'publisherPrincipalId'
   AND cs.approved_by<>cs.created_by AND cs.approved_by<>cs.submitted_by AND er.published_by=cs.approved_by
   AND s.validation_status='valid' AND s.contract_hash=er.contract_hash
   AND s.contract_hash=snapshot.fn_compute_entity_contract_hash(s.contract_json)
   AND er.signature_algorithm='Ed25519' AND er.contract_signature IS NOT NULL
   AND pr.metadata#>>'{successorPolicy,compiler,buildHash}'=p_policy->>'originalCompilerHash'
   AND j.job_code='publication.compile-artifact' AND j.status IN ('failed','dead_letter')
   AND j.input_payload->>'releaseId'=pr.id::text AND j.completed_at IS NOT NULL
   AND j.error_code IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM publication.release newer WHERE newer.tenant_id=pr.tenant_id AND newer.release_key=pr.release_key AND newer.release_no>pr.release_no)
   AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=er.entity_id AND newer.tenant_id IS NULL AND newer.release_no>er.release_no)
   AND (SELECT count(*) FROM master.principal WHERE tenant_id=pr.tenant_id
     AND id::text IN (p_policy->>'authorPrincipalId',p_policy->>'publisherPrincipalId')
     AND principal_type='service_account' AND provisioning_source='internal' AND status='active')=2
   AND (NOT p_require_empty OR (
     NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=pr.id)
     AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=pr.id)));
$$;
REVOKE ALL ON FUNCTION publication.fn_compilation_recovery_source(jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_compilation_recovery_source(jsonb,boolean) TO athyper_runtime;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
  GRANT EXECUTE ON FUNCTION publication.fn_compilation_recovery_source(jsonb,boolean) TO athyper_control_api;
END IF; END $$;

-- Canonical: ddl/planes/studio/publication/19_human_reviewed_publication.sql
-- Bounded interpretation of an independently enrolled human-reviewed product
-- execution policy. It never alters authorship, review receipts or source graphs.
CREATE OR REPLACE FUNCTION publication.fn_human_review_identity_status(p_author uuid,p_reviewer uuid,p_workload_author uuid,p_publisher uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_author<>p_reviewer AND p_workload_author<>p_publisher
   AND p_author NOT IN (p_workload_author,p_publisher) AND p_reviewer NOT IN (p_workload_author,p_publisher)
   AND EXISTS(SELECT 1 FROM master.principal p JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id
     WHERE p.tenant_id=shared.current_tenant_id_soft() AND p.id=master.current_principal_id_soft()
       AND p.status='active' AND p.principal_type='user' AND b.status='active' AND b.service_client_id IS NULL
       AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api')
   AND (SELECT count(*) FROM master.principal p WHERE p.tenant_id=shared.current_tenant_id_soft() AND p.id IN (p_author,p_reviewer)
     AND p.status='active' AND p.principal_type='user' AND EXISTS(SELECT 1 FROM master.principal_identity_binding b
       WHERE b.principal_id=p.id AND b.tenant_id=p.tenant_id AND b.status='active' AND b.service_client_id IS NULL
         AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api'))=2
   AND (SELECT count(*) FROM master.principal p WHERE p.tenant_id=shared.current_tenant_id_soft() AND p.id IN (p_workload_author,p_publisher)
     AND p.status='active' AND p.principal_type='service_account' AND p.provisioning_source='internal')=2;
$$;
REVOKE ALL ON FUNCTION publication.fn_human_review_identity_status(uuid,uuid,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_control_api') THEN
 GRANT EXECUTE ON FUNCTION publication.fn_human_review_identity_status(uuid,uuid,uuid,uuid) TO athyper_control_api;
END IF; END $$;

CREATE OR REPLACE FUNCTION publication.fn_human_reviewed_entity_policy(p_policy jsonb,p_change_set uuid,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cs metadata.entity_change_set%ROWTYPE; member jsonb; result jsonb; graph jsonb; marker jsonb;
  tenant uuid:=shared.current_tenant_id_soft(); actor uuid:=master.current_principal_id_soft(); revision bigint;
BEGIN
  IF p_policy->>'schema' IS DISTINCT FROM 'athyper.dev-human-reviewed-publication/1'
    OR p_policy->>'authorityTenantId' IS DISTINCT FROM tenant::text
    OR p_policy->>'publisherPrincipalId' IS DISTINCT FROM actor::text
    OR p_policy#>>'{plan,publisherId}' IS DISTINCT FROM actor::text
    OR p_policy#>>'{plan,schema}' IS DISTINCT FROM 'athyper.human-reviewed-publication-plan/1'
    OR p_phase NOT IN ('validate','release','prepare') OR p_phase IS NULL
    OR jsonb_typeof(p_policy#>'{plan,members}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_CONTEXT_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=p_change_set AND tenant_id IS NULL;
  IF (SELECT count(*) FROM jsonb_array_elements(p_policy#>'{plan,members}') m WHERE m->>'changeSetId'=cs.id::text)<>1 THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_MEMBER_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  SELECT m INTO STRICT member FROM jsonb_array_elements(p_policy#>'{plan,members}') m WHERE m->>'changeSetId'=cs.id::text;
  revision:=(member->>'revision')::bigint;
  IF (member->>'entityId'=cs.entity_id::text AND revision>=2
    AND cs.submitted_by::text=member->>'authorId' AND cs.approved_by::text=member->>'reviewerId'
    AND cs.submitted_by<>cs.approved_by AND cs.created_by<>cs.approved_by
    AND cs.base_release_id::text IS NOT DISTINCT FROM member->>'sourceReleaseId'
    AND cs.submitted_by::text NOT IN (p_policy->>'authorPrincipalId',p_policy->>'publisherPrincipalId')
    AND cs.approved_by::text NOT IN (p_policy->>'authorPrincipalId',p_policy->>'publisherPrincipalId')
    AND ((p_phase IN ('validate','release') AND cs.status='approved' AND cs.lock_version=revision)
      OR (p_phase='prepare' AND cs.status='published' AND cs.lock_version=revision+1))) IS NOT TRUE THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_SOURCE_OR_REVIEW_CHANGED' USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM master.principal p WHERE p.tenant_id=tenant AND p.id IN (cs.submitted_by,cs.approved_by)
    AND p.principal_type='user' AND p.status='active' AND EXISTS(SELECT 1 FROM master.principal_identity_binding b
      WHERE b.principal_id=p.id AND b.tenant_id=p.tenant_id AND b.status='active' AND b.service_client_id IS NULL
        AND b.realm_key='platform-control' AND b.audience='athyper-platform-control-api'))<>2 THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_REVIEW_IDENTITY_REVOKED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM metadata.entity_product_review_receipt a
    JOIN metadata.entity_product_review_receipt s ON s.authority_tenant_id=a.authority_tenant_id
      AND s.change_set_id=a.change_set_id AND s.contract_hash=a.contract_hash AND s.actor_id=a.actor_id
      AND s.expected_revision=a.expected_revision AND s.action='submit'
    JOIN metadata.entity_product_review_receipt r ON r.authority_tenant_id=s.authority_tenant_id
      AND r.change_set_id=s.change_set_id AND r.contract_hash=s.contract_hash AND r.actor_id=cs.approved_by
      AND r.expected_revision=s.expected_revision+1 AND r.action='approve'
    WHERE a.authority_tenant_id=tenant AND a.change_set_id=cs.id AND a.actor_id=cs.submitted_by AND a.action='adopt'
      AND a.expected_revision=revision-2 AND a.contract_hash=member->>'contractHash')
    OR EXISTS(SELECT 1 FROM metadata.entity_product_review_receipt r WHERE r.authority_tenant_id=tenant AND r.change_set_id=cs.id
      AND r.actor_id=cs.approved_by AND r.action='adopt' AND r.expected_revision=revision-2 AND r.contract_hash=member->>'contractHash') THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_RECEIPTS_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT saved.graph INTO STRICT graph FROM snapshot.entity_draft_save saved WHERE saved.change_set_id=cs.id
    AND saved.lock_version<=cs.lock_version ORDER BY saved.lock_version DESC LIMIT 1;
  IF encode(sha256(convert_to(publication.fn_successor_canonical_json(graph),'UTF8')),'hex') IS DISTINCT FROM member->>'contractHash' THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_GRAPH_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(s#>'{layoutConfig,systemReferenceProduct}',s#>'{layoutConfig,tableEntityProduct}') INTO STRICT marker
    FROM jsonb_array_elements(graph->'surfaces') s WHERE COALESCE(s#>'{layoutConfig,systemReferenceProduct}',s#>'{layoutConfig,tableEntityProduct}') IS NOT NULL;
  IF (SELECT array_agg(t->>'plane' ORDER BY t->>'plane') FROM jsonb_array_elements(member->'targets') t)
    IS DISTINCT FROM (SELECT array_agg(t ORDER BY t) FROM jsonb_array_elements_text(marker->'targetPlanes') t) THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_TARGETS_CHANGED' USING ERRCODE='42501'; END IF;
  IF cs.base_release_id IS NULL THEN
    result:=jsonb_build_object('schema','athyper.dev-entity-onboarding/1','environment','local','instance','dev','preset','devfull',
      'policyId',p_policy->>'policyId','revision',p_policy->'revision','entityId',cs.entity_id,'changeSetId',cs.id,
      'authorPrincipalId',p_policy->>'authorPrincipalId','publisherPrincipalId',p_policy->>'publisherPrincipalId',
      'contractHash',member->>'contractHash','descriptorHash',member->>'descriptorHash',
      'productHash',marker->>'productHash','targetPlanes',marker->'targetPlanes');
  ELSE
    SELECT p INTO STRICT result FROM jsonb_array_elements(p_policy->'predecessors') p WHERE p->>'changeSetId'=cs.id::text;
    IF (result->>'schema'='athyper.dev-entity-successor-policy/1' AND result->>'entityId'=cs.entity_id::text
      AND result->>'authorityTenantId'=tenant::text AND result->>'contractHash'=member->>'contractHash'
      AND result->>'descriptorHash'=member->>'descriptorHash' AND result->'compiler'=p_policy->'compiler'
      AND result->>'authorPrincipalId'=p_policy->>'authorPrincipalId' AND result->>'publisherPrincipalId'=actor::text
      AND result#>>'{predecessor,authoringReleaseId}'=cs.base_release_id::text) IS NOT TRUE THEN
      RAISE EXCEPTION 'HUMAN_PUBLICATION_PREDECESSOR_CHANGED' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION publication.fn_human_reviewed_entity_policy(jsonb,uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION publication.fn_system_entity_execution_metadata(p_release uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE; authority jsonb;
BEGIN
  SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL
    AND published_by=master.current_principal_id_soft();
  authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
  IF NOT COALESCE((authority->>'humanReview')::boolean,false) THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('humanExecutionPolicy',authority->'executionPolicy','executionPolicyId',authority->>'executionPolicyId',
    'executionPolicyHash',authority->>'executionPolicyHash','coordinationHash',authority->>'coordinationHash');
END $$;
REVOKE ALL ON FUNCTION publication.fn_system_entity_execution_metadata(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_system_entity_execution_metadata(uuid) TO athyper_runtime;

CREATE OR REPLACE FUNCTION publication.fn_human_publication_review_evidence(p_change_set uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; state text; receipts jsonb;
BEGIN
  SELECT status::text INTO STRICT state FROM metadata.entity_change_set WHERE id=p_change_set;
  authority:=publication.fn_system_entity_authority(p_change_set,CASE WHEN state='published' THEN 'prepare' ELSE 'validate' END);
  IF NOT COALESCE((authority->>'humanReview')::boolean,false) THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_POLICY_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_agg(receipt ORDER BY expected_revision,action) INTO receipts FROM metadata.entity_product_review_receipt
    WHERE authority_tenant_id=shared.current_tenant_id_soft() AND change_set_id=p_change_set;
  RETURN jsonb_build_object('receipts',receipts,'sourceReleaseId',authority#>'{changeSet,base_release_id}');
END $$;
REVOKE ALL ON FUNCTION publication.fn_human_publication_review_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_human_publication_review_evidence(uuid) TO athyper_runtime;

-- Read-only worker authority: current enrollment and human evidence are checked
-- again at compilation/signing/dispatch/activation, not only release creation.
CREATE OR REPLACE FUNCTION publication.fn_human_execution_context(p_release uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.release%ROWTYPE; cs uuid; policy jsonb; rule jsonb; definition control.policy_definition%ROWTYPE; tenant uuid:=shared.current_tenant_id_soft();
  member jsonb; member_status text; member_graph jsonb; graphs jsonb:='[]'::jsonb;
BEGIN
  SELECT * INTO STRICT r FROM publication.release WHERE id=p_release AND tenant_id=tenant AND status IN ('approved','published');
  IF NOT r.metadata ? 'humanExecutionPolicy' THEN RETURN NULL; END IF;
  policy:=r.metadata->'humanExecutionPolicy';
  SELECT * INTO definition FROM control.policy_definition WHERE id=(r.metadata->>'executionPolicyId')::uuid
    AND tenant_id=tenant AND entity_type='metadata.publication' AND status='active'
    AND definition_hash=r.metadata->>'executionPolicyHash';
  IF definition.id IS NULL OR NOT control.publication_policy_enrollment_is_active(definition.id,definition.definition_hash,
    (policy->>'authorPrincipalId')::uuid,(policy->>'publisherPrincipalId')::uuid)
    OR definition.effective_from>CURRENT_DATE OR (definition.effective_until IS NOT NULL AND definition.effective_until<CURRENT_DATE)
    OR r.created_by IS DISTINCT FROM master.current_principal_id_soft() THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_EXECUTION_POLICY_REVOKED' USING ERRCODE='42501'; END IF;
  SELECT action_config INTO STRICT rule FROM control.policy_rule WHERE policy_definition_id=definition.id AND action_code='allow';
  IF rule->'policy' IS DISTINCT FROM policy OR rule->>'permissionCode' IS DISTINCT FROM 'studio.metadata.contract.publish_automated'
    OR r.metadata->>'coordinationHash' IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(policy->'plan'),'UTF8')),'hex') THEN
    RAISE EXCEPTION 'HUMAN_PUBLICATION_EXECUTION_POLICY_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT er.change_set_id INTO STRICT cs FROM publication.entity_release_link l JOIN metadata.entity_release er ON er.id=l.entity_release_id
    WHERE l.publication_release_id=r.id AND er.tenant_id IS NULL AND er.published_by=r.created_by;
  PERFORM publication.fn_human_reviewed_entity_policy(policy,cs,'prepare');
  FOR member IN SELECT m FROM jsonb_array_elements(policy#>'{plan,members}') m LOOP
    SELECT status::text INTO STRICT member_status FROM metadata.entity_change_set WHERE id=(member->>'changeSetId')::uuid;
    PERFORM publication.fn_human_reviewed_entity_policy(policy,(member->>'changeSetId')::uuid,
      CASE WHEN member_status='published' THEN 'prepare' ELSE 'validate' END);
    SELECT graph INTO STRICT member_graph FROM snapshot.entity_draft_save WHERE change_set_id=(member->>'changeSetId')::uuid
      ORDER BY lock_version DESC LIMIT 1;
    graphs:=graphs||jsonb_build_array(jsonb_build_object('changeSetId',member->>'changeSetId','graph',member_graph));
  END LOOP;
  RETURN jsonb_build_object('policy',policy,'policyId',definition.id,'policyHash',definition.definition_hash,
    'coordinationHash',r.metadata->>'coordinationHash','sources',graphs);
END $$;
REVOKE ALL ON FUNCTION publication.fn_human_execution_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_human_execution_context(uuid) TO athyper_publication_service,athyper_runtime,athyper_worker;

INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,
 allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('entity_product_human_publication','^metadata[.]entity[.]product[.]publication$',25,ARRAY['execute']::audit.operation_d[],
 'critical',ARRAY['service_account']::audit.actor_type_d[],'tenant',false,'metadata',65536,1,
 '{"owner":"meta-entity-authoring","purpose":"publication_consuming_independent_human_review"}'::jsonb,'active') ON CONFLICT(code) DO NOTHING;

-- The publishing role cannot browse other principals. Expose only the exact
-- enrolled, approved source; do not relax principal or snapshot RLS.
CREATE OR REPLACE FUNCTION publication.fn_human_publication_preparation_source(p_release uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release%ROWTYPE; authority jsonb; result jsonb;
BEGIN
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release AND tenant_id IS NULL
   AND published_by=master.current_principal_id_soft();
 authority:=publication.fn_system_entity_authority(r.change_set_id,'prepare');
 IF NOT COALESCE((authority->>'humanReview')::boolean,false) THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('contract_json',s.contract_json,'revision_id',r.revision_id,'entity_id',r.entity_id,
   'entity_code',e.entity_code,'change_set_id',r.change_set_id,'release_no',r.release_no,'release_hash',r.release_hash,
   'contract_hash',r.contract_hash,'target_planes',r.target_planes,'contract_signature',r.contract_signature,
   'signature_algorithm',r.signature_algorithm,'signing_key_id',r.signing_key_id,'published_by',r.published_by,
   'approved_by',c.approved_by,'authority_tenant_id',shared.current_tenant_id_soft()) INTO STRICT result
 FROM metadata.entity e JOIN metadata.entity_change_set c ON c.entity_id=e.id AND c.id=r.change_set_id
 JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.change_set_id=c.id AND s.entity_id=e.id
 WHERE e.id=r.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system' AND c.tenant_id IS NULL
   AND s.tenant_id IS NULL AND s.validation_status='valid' AND c.status='published';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION publication.fn_human_publication_preparation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_human_publication_preparation_source(uuid) TO athyper_runtime;

-- Canonical: ddl/planes/studio/publication/20_product_publication_owner.sql
-- Generated by scripts/checks/security/generate-security-definer-contract.ts.
-- Source: contracts/security/security-definer-ownership.v1.json.
-- No table ownership, administrative privileges, runtime membership, or blanket grants.
DO $definer_privileges$
DECLARE
    role_contract jsonb;
    object_contract jsonb;
    schema_name text;
    routine_signature text;
    role_name text;
    policy_contract jsonb;
    old_policy record;
    policy_index integer;
BEGIN
    FOR role_contract IN SELECT value FROM jsonb_array_elements('[
  {
    "name": "athyper_definer_product_publication",
    "bypassRls": false,
    "schemas": [
      "master",
      "control",
      "metadata",
      "snapshot",
      "publication",
      "shared",
      "ops",
      "public"
    ],
    "tables": [
      {
        "relation": "master.principal",
        "privileges": [
          "SELECT"
        ]
      },
      {
        "relation": "master.principal_identity_binding",
        "privileges": [
          "SELECT"
        ]
      },
      {
        "relation": "control.policy_definition",
        "privileges": [
          "SELECT",
          "UPDATE"
        ]
      },
      {
        "relation": "control.policy_rule",
        "privileges": [
          "SELECT",
          "UPDATE"
        ]
      },
      {
        "relation": "metadata.entity",
        "privileges": [
          "SELECT",
          "UPDATE"
        ]
      },
      {
        "relation": "metadata.entity_change_set",
        "privileges": [
          "SELECT",
          "UPDATE"
        ]
      },
      {
        "relation": "metadata.entity_release",
        "privileges": [
          "SELECT",
          "INSERT",
          "UPDATE"
        ]
      },
      {
        "relation": "metadata.entity_product_review_receipt",
        "privileges": [
          "SELECT"
        ]
      },
      {
        "relation": "snapshot.entity_draft_save",
        "privileges": [
          "SELECT"
        ]
      },
      {
        "relation": "snapshot.entity_contract_revision",
        "privileges": [
          "SELECT",
          "INSERT"
        ]
      },
      {
        "relation": "snapshot.entity_release_artifact",
        "privileges": [
          "SELECT",
          "INSERT"
        ]
      },
      {
        "relation": "publication.release",
        "privileges": [
          "SELECT"
        ]
      },
      {
        "relation": "publication.entity_release_link",
        "privileges": [
          "SELECT",
          "INSERT"
        ]
      },
      {
        "relation": "publication.artifact",
        "privileges": [
          "SELECT"
        ]
      },
      {
        "relation": "publication.artifact_compilation",
        "privileges": [
          "SELECT"
        ]
      },
      {
        "relation": "ops.job_execution",
        "privileges": [
          "SELECT"
        ]
      }
    ],
    "functions": [
      "snapshot.fn_compute_entity_contract_revision_hash(uuid, uuid, uuid, integer, text, uuid, text, text, text, text[], metadata.compatibility_level_d, metadata.contract_validation_status_d, jsonb, timestamp with time zone, uuid)",
      "metadata.current_actor_id(uuid)",
      "metadata.fn_compute_entity_release_hash(uuid, uuid, uuid, uuid, bigint, text, metadata.entity_release_kind_d, uuid, uuid, text, text, text, text, metadata.compatibility_level_d, text[], text, text, text, uuid, timestamp with time zone, uuid)",
      "shared.uuidv7()",
      "master.current_principal_id_soft()",
      "shared.current_tenant_id_soft()",
      "shared.current_tenant_id()",
      "control.publication_policy_enrollment_is_active(uuid, text, uuid, uuid)",
      "publication.fn_successor_canonical_json(jsonb)",
      "publication.fn_compiled_entity_compilation_source(uuid)",
      "snapshot.fn_compute_entity_contract_hash(jsonb)",
      "snapshot.fn_compute_entity_release_artifact_hash(uuid, uuid, uuid, text, text, text, jsonb)",
      "public.digest(bytea, text)",
      "public.digest(text, text)"
    ],
    "policies": [
      {
        "relation": "master.principal",
        "command": "SELECT",
        "using": "tenant_id=shared.current_tenant_id_soft()",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "master.principal_identity_binding",
        "command": "SELECT",
        "using": "tenant_id=shared.current_tenant_id_soft()",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "control.policy_definition",
        "command": "SELECT",
        "using": "tenant_id=shared.current_tenant_id_soft()",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "control.policy_definition",
        "command": "UPDATE",
        "using": "tenant_id=shared.current_tenant_id_soft()",
        "check": "false",
        "reason": "Permit policy row locks; reject every policy write by the publication owner."
      },
      {
        "relation": "control.policy_rule",
        "command": "SELECT",
        "using": "EXISTS (SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.tenant_id=shared.current_tenant_id_soft())",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "control.policy_rule",
        "command": "UPDATE",
        "using": "EXISTS (SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.tenant_id=shared.current_tenant_id_soft())",
        "check": "false",
        "reason": "Permit policy row locks; reject every policy write by the publication owner."
      },
      {
        "relation": "metadata.entity",
        "command": "SELECT",
        "using": "tenant_id IS NULL",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "metadata.entity",
        "command": "UPDATE",
        "check": "tenant_id IS NULL",
        "reason": "Exact enrolled source and human review are checked in private publication commands before global source mutation.",
        "using": "tenant_id IS NULL"
      },
      {
        "relation": "metadata.entity_change_set",
        "command": "SELECT",
        "using": "tenant_id IS NULL",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "metadata.entity_change_set",
        "command": "UPDATE",
        "check": "tenant_id IS NULL",
        "reason": "Exact enrolled source and human review are checked in private publication commands before global source mutation.",
        "using": "tenant_id IS NULL"
      },
      {
        "relation": "metadata.entity_release",
        "command": "SELECT",
        "using": "tenant_id IS NULL",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "metadata.entity_release",
        "command": "INSERT",
        "check": "tenant_id IS NULL",
        "reason": "Exact enrolled source and human review are checked in private publication commands before global source mutation."
      },
      {
        "relation": "metadata.entity_release",
        "command": "UPDATE",
        "using": "tenant_id IS NULL",
        "check": "false",
        "reason": "Permit policy row locks; reject every policy write by the publication owner."
      },
      {
        "relation": "metadata.entity_product_review_receipt",
        "command": "SELECT",
        "using": "authority_tenant_id=shared.current_tenant_id_soft()",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "snapshot.entity_draft_save",
        "command": "SELECT",
        "using": "tenant_id IS NULL",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "snapshot.entity_contract_revision",
        "command": "SELECT",
        "using": "tenant_id IS NULL",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "snapshot.entity_contract_revision",
        "command": "INSERT",
        "check": "tenant_id IS NULL",
        "reason": "Exact enrolled source and human review are checked in private publication commands before global source mutation."
      },
      {
        "relation": "snapshot.entity_release_artifact",
        "command": "SELECT",
        "using": "tenant_id IS NULL",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "snapshot.entity_release_artifact",
        "command": "INSERT",
        "check": "tenant_id IS NULL",
        "reason": "Exact enrolled source and human review are checked in private publication commands before global source mutation."
      },
      {
        "relation": "publication.release",
        "command": "SELECT",
        "using": "tenant_id=shared.current_tenant_id_soft()",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "publication.entity_release_link",
        "command": "SELECT",
        "using": "EXISTS (SELECT 1 FROM publication.release r WHERE r.id=publication_release_id AND r.tenant_id=shared.current_tenant_id_soft())",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "publication.entity_release_link",
        "command": "INSERT",
        "check": "EXISTS (SELECT 1 FROM publication.release r WHERE r.id=publication_release_id AND r.tenant_id=shared.current_tenant_id_soft())",
        "reason": "Exact enrolled source and human review are checked in private publication commands before global source mutation."
      },
      {
        "relation": "publication.artifact",
        "command": "SELECT",
        "using": "EXISTS (SELECT 1 FROM publication.release r WHERE r.id=publication_release_id AND r.tenant_id=shared.current_tenant_id_soft())",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "publication.artifact_compilation",
        "command": "SELECT",
        "using": "EXISTS (SELECT 1 FROM publication.release r WHERE r.id=publication_release_id AND r.tenant_id=shared.current_tenant_id_soft())",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      },
      {
        "relation": "ops.job_execution",
        "command": "SELECT",
        "using": "tenant_id=shared.current_tenant_id_soft()",
        "reason": "Bounded product publication functions read current authority or global source evidence; no caller role membership."
      }
    ]
  }
]'::jsonb) LOOP
        role_name := role_contract->>'name';
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
        END IF;
        EXECUTE format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT %s',
            role_name, CASE WHEN (role_contract->>'bypassRls')::boolean THEN 'BYPASSRLS' ELSE 'NOBYPASSRLS' END);
        IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = role_name)) THEN
            RAISE EXCEPTION 'Definer owner % must not inherit or assume other roles', role_name;
        END IF;
        FOR schema_name IN SELECT jsonb_array_elements_text(role_contract->'schemas') LOOP
            IF to_regnamespace(schema_name) IS NOT NULL THEN
                EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, role_name);
            END IF;
        END LOOP;
        FOR object_contract IN SELECT value FROM jsonb_array_elements(role_contract->'tables') LOOP
            IF to_regclass(object_contract->>'relation') IS NOT NULL THEN
                EXECUTE format('GRANT %s ON TABLE %s TO %I',
                    (SELECT string_agg(value, ',') FROM jsonb_array_elements_text(object_contract->'privileges')),
                    (object_contract->>'relation')::regclass, role_name);
            END IF;
        END LOOP;
        FOR routine_signature IN SELECT jsonb_array_elements_text(role_contract->'functions') LOOP
            IF to_regprocedure(routine_signature) IS NOT NULL THEN
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', routine_signature::regprocedure, role_name);
            END IF;
        END LOOP;
        FOR routine_signature IN SELECT jsonb_array_elements_text(COALESCE(role_contract->'tenantReadPolicies','[]'::jsonb)) LOOP
            IF to_regclass(routine_signature) IS NOT NULL THEN
                EXECUTE format('DROP POLICY IF EXISTS %I ON %s', role_name || '_tenant_read', routine_signature::regclass);
                EXECUTE format('CREATE POLICY %I ON %s FOR SELECT TO %I USING (tenant_id = shared.current_tenant_id_soft())',
                    role_name || '_tenant_read', routine_signature::regclass, role_name);
            END IF;
        END LOOP;
        -- Reconcile only this contract's reserved policy namespace so a stricter
        -- successor cannot leave an older permissive policy active alongside it.
        FOR old_policy IN SELECT pol.polname,pol.polrelid::regclass AS relation FROM pg_policy pol
            WHERE starts_with(pol.polname,role_name || '_p_') AND (SELECT oid FROM pg_roles WHERE rolname=role_name)=ANY(pol.polroles) LOOP
            EXECUTE format('DROP POLICY %I ON %s',old_policy.polname,old_policy.relation);
        END LOOP;
        policy_index := 0;
        FOR policy_contract IN SELECT value FROM jsonb_array_elements(COALESCE(role_contract->'policies','[]'::jsonb)) LOOP
            IF to_regclass(policy_contract->>'relation') IS NOT NULL THEN
                EXECUTE format('CREATE POLICY %I ON %s FOR %s TO %I%s%s',
                    role_name || '_p_' || policy_index, (policy_contract->>'relation')::regclass,policy_contract->>'command',role_name,
                    CASE WHEN policy_contract ? 'using' THEN ' USING (' || (policy_contract->>'using') || ')' ELSE '' END,
                    CASE WHEN policy_contract ? 'check' THEN ' WITH CHECK (' || (policy_contract->>'check') || ')' ELSE '' END);
            END IF;
            policy_index := policy_index + 1;
        END LOOP;
    END LOOP;
END
$definer_privileges$;
ALTER FUNCTION publication.fn_system_entity_authority(uuid, text) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_record_system_entity_validation(uuid, bigint, jsonb, jsonb, uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_transition_system_entity_change_set(uuid, bigint, text, text, uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_create_system_entity_release(uuid, uuid, bigint, jsonb, text[], uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_store_system_entity_artifact(uuid, text, jsonb, jsonb) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_link_system_entity_release(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_compiled_entity_compilation_source_v2(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_entity_successor_saved_graph(uuid, uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_entity_successor_enrollment_source(jsonb) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_create_system_entity_successor(uuid, uuid, bigint, uuid, jsonb, text[], uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_system_entity_successor_policy(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_compiled_entity_compilation_source_v3(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_compilation_recovery_source(jsonb, boolean) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_human_review_identity_status(uuid, uuid, uuid, uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_human_reviewed_entity_policy(jsonb, uuid, text) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_system_entity_execution_metadata(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_human_publication_review_evidence(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_human_execution_context(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_human_publication_preparation_source(uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION control.publication_policy_enrollment_is_active(uuid, text, uuid, uuid) OWNER TO athyper_definer_product_publication;

COMMIT;
