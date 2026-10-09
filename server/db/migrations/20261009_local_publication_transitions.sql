-- Checked native lifecycle progression for immutable local requests.
BEGIN;
ALTER TABLE publication.local_publication_request ADD COLUMN execution_revision bigint,
 ADD COLUMN execution_status text CHECK (execution_status IN ('draft','in_review','approved'));
CREATE OR REPLACE FUNCTION publication.fn_local_publication_request_authority(p_request jsonb,p_admit boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid:=shared.current_tenant_id_soft(); actor uuid:=master.current_principal_id_soft();
 d control.policy_definition%ROWTYPE; config jsonb; policy jsonb; expected_condition jsonb; a jsonb; host jsonb; admission jsonb:=p_request->'admission';
 developer uuid; author uuid; publisher uuid; c metadata.entity_change_set%ROWTYPE; saved jsonb; actual_hash text; receipt publication.local_publication_request%ROWTYPE;
BEGIN
 IF p_admit IS NULL OR actor IS NULL OR tenant IS NULL OR p_request->>'schema' IS DISTINCT FROM 'athyper.local-publication-request/1'
 OR p_request->>'basis' IS DISTINCT FROM 'local_development_authority' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_REQUEST_INVALID' USING ERRCODE='42501'; END IF;
 SELECT identity INTO STRICT host FROM publication.local_publication_host WHERE singleton;
 -- The installed host record is writable only by the schema installer.
 IF host IS DISTINCT FROM '{"environment":"local","instance":"dev","domainSuffix":"dev.athyper.test"}'::jsonb
 OR admission->'host' IS DISTINCT FROM host THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_DEV_ONLY' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT d FROM control.policy_definition WHERE id=(p_request#>>'{authority,id}')::uuid
 AND tenant_id=tenant AND entity_type='metadata.publication' AND status='active' FOR SHARE;
 IF d.definition_hash IS DISTINCT FROM p_request#>>'{authority,hash}' OR d.version_no::text IS DISTINCT FROM p_request#>>'{authority,version}'
 OR d.created_by=d.updated_by OR d.effective_from>CURRENT_DATE OR (d.effective_until IS NOT NULL AND d.effective_until<CURRENT_DATE)
 OR EXISTS(SELECT 1 FROM control.policy_definition n WHERE n.tenant_id=d.tenant_id AND n.entity_type=d.entity_type AND n.name=d.name
   AND n.id<>d.id AND n.status='active' AND n.version_no>=d.version_no)
 OR (SELECT count(*) FROM control.policy_rule WHERE policy_definition_id=d.id)<>1 THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_AUTHORITY_CHANGED' USING ERRCODE='42501'; END IF;
 SELECT action_config INTO STRICT config FROM control.policy_rule WHERE policy_definition_id=d.id
 AND action_code='allow' FOR SHARE;
 policy:=config->'policy';
 expected_condition:=jsonb_build_object('and',jsonb_build_array(
   jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','environment'),'dev')),
   jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','tenantId'),tenant::text)),
   jsonb_build_object('===',jsonb_build_array(jsonb_build_object('var','policyHash'),
     encode(sha256(convert_to(publication.fn_successor_canonical_json(policy),'UTF8')),'hex')))));
 IF NOT EXISTS(SELECT 1 FROM control.policy_rule WHERE policy_definition_id=d.id AND condition_expr=expected_condition)
 OR config->>'schema' IS DISTINCT FROM 'athyper.machine-publication-enrollment/1'
 OR config->>'environment' IS DISTINCT FROM 'dev' OR config->>'tenantId' IS DISTINCT FROM tenant::text
 OR policy->>'schema' IS DISTINCT FROM 'athyper.local-publication-policy/1'
 OR policy->>'policyId' IS DISTINCT FROM d.name THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_ENROLLMENT_INVALID' USING ERRCODE='42501'; END IF;
 a:=policy->'authority'||jsonb_build_object('schema','athyper.local-development-authority/1',
   'active',true,'enrollmentReceiptId',d.id,'authorWorkloadId',policy->>'authorPrincipalId',
   'publisherWorkloadId',policy->>'publisherPrincipalId');
 IF a->>'schema' IS DISTINCT FROM 'athyper.local-development-authority/1'
 OR a->'host' IS DISTINCT FROM host OR a->'scope' IS DISTINCT FROM admission->'scope'
 OR a->>'active' IS DISTINCT FROM 'true' OR nullif(a->>'enrollmentReceiptId','') IS NULL
 OR a->>'validFrom' IS NULL OR a->>'expiresAt' IS NULL
 OR NOT ((a->>'validFrom')::timestamptz<=clock_timestamp() AND (a->>'expiresAt')::timestamptz>clock_timestamp()) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_AUTHORITY_DENIED' USING ERRCODE='42501'; END IF;
 IF (a#>>'{scope,kind}') IS DISTINCT FROM 'product' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_PRODUCT_SOURCE_REQUIRED' USING ERRCODE='42501'; END IF;
 developer:=(admission->>'developerPrincipalId')::uuid; author:=(admission->>'authorWorkloadId')::uuid; publisher:=(admission->>'publisherWorkloadId')::uuid;
 IF (p_admit AND actor IS DISTINCT FROM developer) OR (NOT p_admit AND actor IS DISTINCT FROM publisher AND actor IS DISTINCT FROM author)
 OR developer=author OR developer=publisher OR author=publisher
 OR a->>'authorWorkloadId' IS DISTINCT FROM author::text OR a->>'publisherWorkloadId' IS DISTINCT FROM publisher::text
 OR NOT COALESCE(a->'developerPrincipalIds' @> jsonb_build_array(developer::text),false)
 OR admission->>'action' IS NULL OR admission->>'action' NOT IN ('publish','retry','recover','rollback')
 OR NOT COALESCE(a->'actions' @> jsonb_build_array(admission->>'action'),false)
 OR NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=tenant AND id=developer AND principal_type='user' AND status='active')
 OR (SELECT count(*) FROM master.principal WHERE tenant_id=tenant AND id IN (author,publisher) AND principal_type='service_account' AND status='active')<>2
 OR (SELECT count(*) FROM master.principal WHERE tenant_id=tenant AND id IN (d.created_by,d.updated_by) AND principal_type='user' AND status='active')<>2
 OR d.updated_by IN (author,publisher) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF (p_request->>'issuedAt')::timestamptz IS NULL OR (p_request->>'expiresAt')::timestamptz IS NULL
 OR NOT ((p_request->>'issuedAt')::timestamptz<=clock_timestamp() AND (p_request->>'expiresAt')::timestamptz>clock_timestamp()
 AND (p_request->>'expiresAt')::timestamptz<=(a->>'expiresAt')::timestamptz
 AND (p_request->>'expiresAt')::timestamptz-(p_request->>'issuedAt')::timestamptz<=interval '24 hours') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_REQUEST_EXPIRED' USING ERRCODE='42501'; END IF;
 actual_hash:=encode(sha256(convert_to(publication.fn_successor_canonical_json(p_request-'hash'),'UTF8')),'hex');
 IF p_request->>'hash' IS DISTINCT FROM actual_hash
 OR p_request#>>'{inputs,compilerHash}' IS NULL OR p_request#>>'{inputs,compilerHash}' !~ '^[a-f0-9]{64}$'
 OR jsonb_typeof(p_request#>'{inputs,targets}') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_request#>'{inputs,targets}')=0
 OR jsonb_typeof(p_request#>'{inputs,resourceHashes}') IS DISTINCT FROM 'array'
 OR jsonb_typeof(a->'destinations') IS DISTINCT FROM 'array' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_REQUEST_HASH_INVALID' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_request#>'{inputs,resourceHashes}') h WHERE h IS NULL OR h !~ '^[a-f0-9]{64}$')
 OR (SELECT count(DISTINCT h) FROM jsonb_array_elements_text(p_request#>'{inputs,resourceHashes}') h)<>jsonb_array_length(p_request#>'{inputs,resourceHashes}')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request#>'{inputs,targets}') t
 WHERE t->>'plane' IS NULL OR t->>'plane' NOT IN ('studio','neon','mesh') OR t->>'instance' IS DISTINCT FROM host->>'instance'
 OR NOT COALESCE(a->'destinations' @> jsonb_build_array(jsonb_build_object('plane',t->>'plane','instance',t->>'instance')),false)
 OR NOT (t ? 'predecessorHash') OR (t->'predecessorHash'<>'null'::jsonb AND (t->>'predecessorHash' IS NULL OR t->>'predecessorHash' !~ '^[a-f0-9]{64}$'))
 OR t->>'artifactHash' IS NULL OR t->>'artifactHash' !~ '^[a-f0-9]{64}$')
 OR (SELECT count(DISTINCT t->>'plane') FROM jsonb_array_elements(p_request#>'{inputs,targets}') t)<>jsonb_array_length(p_request#>'{inputs,targets}')
 OR (SELECT jsonb_agg(jsonb_build_object('plane',t->>'plane','instance',t->>'instance') ORDER BY t->>'plane') FROM jsonb_array_elements(p_request#>'{inputs,targets}') t)
 IS DISTINCT FROM (SELECT jsonb_agg(t ORDER BY t->>'plane') FROM jsonb_array_elements(admission->'targets') t) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_TARGET_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=(p_request#>>'{inputs,changeSetId}')::uuid FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM metadata.entity WHERE id=c.entity_id AND tenant_id IS NULL AND ownership_model='system')
 OR c.tenant_id IS NOT NULL OR c.source_kind IS DISTINCT FROM 'product' OR c.native_core_layout_version IS DISTINCT FROM 2
 OR c.created_by IS DISTINCT FROM developer
 OR c.status::text NOT IN ('draft','in_review','approved','published') THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
 SELECT * INTO receipt FROM publication.local_publication_request WHERE request_hash=p_request->>'hash'
 AND request_json=p_request AND tenant_id=tenant;
 IF c.lock_version::text IS DISTINCT FROM p_request#>>'{inputs,revision}' AND
   (p_admit OR receipt.execution_revision IS DISTINCT FROM c.lock_version OR receipt.execution_status IS DISTINCT FROM c.status::text
    OR (c.status='in_review' AND c.submitted_by IS DISTINCT FROM author)
    OR (c.status='approved' AND (c.submitted_by IS DISTINCT FROM author OR c.approved_by IS DISTINCT FROM publisher))) THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
 SELECT graph INTO STRICT saved FROM snapshot.entity_draft_save WHERE change_set_id=c.id AND tenant_id IS NULL AND lock_version=c.lock_version;
 IF saved->>'contractSchema' IS DISTINCT FROM 'athyper.meta-entity-contract/2.5'
 OR saved#>>'{authoringSource,entityId}' IS DISTINCT FROM c.entity_id::text
 OR encode(sha256(convert_to(publication.fn_successor_canonical_json(saved),'UTF8')),'hex') IS DISTINCT FROM p_request#>>'{inputs,sourceHash}' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('basis','local_development_authority','authorityId',d.id,'authorityHash',d.definition_hash,
   'developerId',developer,'publisherId',publisher,'tenantId',tenant,'graph',saved,'changeSet',to_jsonb(c),'request',p_request);
END $$;
REVOKE ALL ON FUNCTION publication.fn_local_publication_request_authority(jsonb,boolean) FROM PUBLIC;


-- Local DEV lifecycle commands reuse native validation and review transitions.
-- The request is immutable. Only this routine advances its checked revision;
-- a save, rejection, unrelated review, or changed source invalidates execution.
CREATE FUNCTION publication.local_publication_phase_authority(p_draft uuid,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r publication.local_publication_request%ROWTYPE; checked jsonb; actor uuid:=master.current_principal_id_soft();
BEGIN
 IF p_phase IS NULL OR p_phase NOT IN ('validate','submit','review') THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_RELEASE_EXECUTION_NOT_CONFIGURED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('system-entity-release:'||(SELECT entity_id::text FROM metadata.entity_change_set WHERE id=p_draft),0));
 SELECT * INTO STRICT r FROM publication.local_publication_request
 WHERE request_hash=NULLIF(current_setting('app.local_publication_request_hash',true),'')
 AND change_set_id=p_draft AND tenant_id=shared.current_tenant_id_soft() FOR UPDATE;
 checked:=publication.fn_local_publication_request_authority(r.request_json,false);
 IF r.request_json#>>'{admission,action}' IS DISTINCT FROM 'publish'
 OR actor IS DISTINCT FROM (CASE WHEN p_phase='review' THEN r.publisher_id ELSE (r.request_json#>>'{admission,authorWorkloadId}')::uuid END)
 OR (p_phase IN ('validate','submit') AND checked#>>'{changeSet,status}' IS DISTINCT FROM 'draft')
 OR (p_phase='review' AND (checked#>>'{changeSet,status}' IS DISTINCT FROM 'in_review'
   OR checked#>>'{changeSet,submitted_by}' IS DISTINCT FROM r.request_json#>>'{admission,authorWorkloadId}')) THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_PHASE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN checked||jsonb_build_object('policy',jsonb_build_object('contractHash',r.request_json#>>'{inputs,sourceHash}'));
END $$;
REVOKE ALL ON FUNCTION publication.local_publication_phase_authority(uuid,text) FROM PUBLIC;

CREATE FUNCTION publication.transition_local_publication_request(p_hash text,p_phase text,p_report jsonb)
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
 IF (current_row.status::text=wanted OR (p_phase='submit' AND current_row.status='approved'))
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
REVOKE ALL ON FUNCTION publication.transition_local_publication_request(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.transition_local_publication_request(text,text,jsonb) TO athyper_worker;
ALTER FUNCTION publication.local_publication_phase_authority(uuid,text) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.transition_local_publication_request(text,text,jsonb) OWNER TO athyper_definer_product_publication;

CREATE OR REPLACE FUNCTION publication.fn_system_entity_authority(p_change_set uuid,p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cs metadata.entity_change_set%ROWTYPE; d control.policy_definition%ROWTYPE;
  config jsonb; policy jsonb; enrolled_policy jsonb; human_review boolean; saved jsonb; actor uuid:=master.current_principal_id_soft();
  tenant uuid:=shared.current_tenant_id_soft(); author uuid; publisher uuid; n integer; predecessor jsonb; marker jsonb;
BEGIN
  IF NULLIF(current_setting('app.local_publication_request_hash',true),'') IS NOT NULL THEN
    RETURN publication.local_publication_phase_authority(p_change_set,p_phase);
  END IF;
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
    IF NOT human_review THEN
    SELECT COALESCE(value#>'{layoutConfig,systemReferenceProduct}',value#>'{layoutConfig,tableEntityProduct}') INTO STRICT marker FROM jsonb_array_elements(saved->'surfaces')
      WHERE COALESCE(value#>'{layoutConfig,systemReferenceProduct}',value#>'{layoutConfig,tableEntityProduct}') IS NOT NULL;
    IF (SELECT array_agg(t->>'plane' ORDER BY t->>'plane') FROM jsonb_array_elements(policy->'targets') t)
      IS DISTINCT FROM (SELECT array_agg(t ORDER BY t) FROM jsonb_array_elements_text(marker->'targetPlanes') t) THEN
      RAISE EXCEPTION 'SYSTEM_PUBLICATION_SUCCESSOR_TARGETS_CHANGED' USING ERRCODE='42501'; END IF;
    policy:=policy||jsonb_build_object('productHash',marker->>'productHash','targetPlanes',marker->'targetPlanes');
    END IF;
  ELSIF cs.base_release_id IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_PUBLICATION_FIRST_RELEASE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('policy',policy,'graph',saved,'changeSet',to_jsonb(cs),'tenantId',tenant)
    || CASE WHEN human_review THEN jsonb_build_object('humanReview',true,'executionPolicy',enrolled_policy,
      'executionPolicyId',d.id,'executionPolicyHash',d.definition_hash,
      'coordinationHash',encode(sha256(convert_to(publication.fn_successor_canonical_json(enrolled_policy->'plan'),'UTF8')),'hex')) ELSE '{}'::jsonb END;
END $$;


COMMIT;
