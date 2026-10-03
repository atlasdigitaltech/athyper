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
