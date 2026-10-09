-- Recovery preserves the committed release and original request. A fresh exact
-- compiler request is allowed only before any artifact compilation has committed.
ALTER TABLE publication.local_publication_request DROP CONSTRAINT local_publication_request_execution_release_id_key;
CREATE UNIQUE INDEX local_publication_original_release_uq ON publication.local_publication_request(execution_release_id)
 WHERE request_json#>>'{admission,action}'='publish';
CREATE OR REPLACE FUNCTION publication.admit_local_publication_request(p_request jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE checked jsonb; c metadata.entity_change_set%ROWTYPE; prior publication.local_publication_request%ROWTYPE;
BEGIN
 checked:=publication.fn_local_publication_request_authority(p_request,true);
 IF EXISTS(SELECT 1 FROM publication.local_publication_request WHERE request_hash=p_request->>'hash' AND request_json=p_request AND tenant_id=(checked->>'tenantId')::uuid) THEN RETURN p_request->>'hash'; END IF;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=(checked#>>'{changeSet,id}')::uuid FOR UPDATE;
 IF c.status::text='published' THEN
  IF p_request#>>'{admission,action}' IS DISTINCT FROM 'recover' THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_RECOVERY_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM publication.local_publication_request q
  WHERE q.change_set_id=c.id AND q.tenant_id=(checked->>'tenantId')::uuid
   AND q.developer_id=(checked->>'developerId')::uuid AND q.publisher_id=(checked->>'publisherId')::uuid
   AND q.authority_id=(checked->>'authorityId')::uuid AND q.request_json->'authority'=p_request->'authority'
   AND q.execution_status='published' AND q.execution_revision=c.lock_version AND q.execution_release_id IS NOT NULL
   AND q.request_json#>>'{admission,action}'='publish'
   AND (q.request_json->'admission')-'action'=(p_request->'admission')-'action'
   AND (q.request_json->'inputs')-ARRAY['compilerHash','revision']=(p_request->'inputs')-ARRAY['compilerHash','revision']
   AND c.submitted_by::text=p_request#>>'{admission,authorWorkloadId}' AND c.approved_by=(checked->>'publisherId')::uuid;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM publication.artifact_compilation WHERE publication_release_id=prior.execution_release_id)
   OR NOT EXISTS(SELECT 1 FROM publication.release p JOIN publication.entity_release_link l ON l.publication_release_id=p.id
    JOIN metadata.entity_release e ON e.id=l.entity_release_id
    WHERE p.id=prior.execution_release_id AND e.id=p.id AND e.change_set_id=c.id AND e.tenant_id IS NULL
     AND p.tenant_id=prior.tenant_id AND p.created_by=prior.publisher_id AND e.published_by=prior.publisher_id
     AND p.status='approved' AND p.release_hash=e.release_hash
     AND p.metadata->>'approvalBasis'='local_development_authority' AND p.metadata->'localPublicationRequest'=prior.request_json) THEN
   RAISE EXCEPTION 'LOCAL_PUBLICATION_RECOVERY_SOURCE_REQUIRED' USING ERRCODE='42501'; END IF;
  INSERT INTO publication.local_publication_request(request_hash,tenant_id,authority_id,change_set_id,developer_id,publisher_id,request_json,
    execution_status,execution_revision,execution_release_id,renewed_from_hash)
  VALUES(p_request->>'hash',prior.tenant_id,prior.authority_id,c.id,prior.developer_id,prior.publisher_id,p_request,
    'published',c.lock_version,prior.execution_release_id,prior.request_hash);
  RETURN p_request->>'hash';
 END IF;
 IF c.status::text NOT IN ('draft','in_review','approved') OR p_request#>>'{admission,action}' IS DISTINCT FROM 'publish'
 THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_RENEWAL_SOURCE_DENIED' USING ERRCODE='42501'; END IF;
 IF c.status::text<>'draft' THEN
  SELECT * INTO prior FROM publication.local_publication_request q
  WHERE q.change_set_id=c.id AND q.tenant_id=(checked->>'tenantId')::uuid
    AND q.developer_id=(checked->>'developerId')::uuid AND q.publisher_id=(checked->>'publisherId')::uuid
    AND q.authority_id=(checked->>'authorityId')::uuid
    AND q.execution_status=c.status::text AND q.execution_revision=c.lock_version AND q.execution_release_id IS NULL
    AND q.request_json#>>'{inputs,sourceHash}'=p_request#>>'{inputs,sourceHash}'
    AND q.request_json#>'{admission}'=p_request#>'{admission}'
    AND q.request_json#>'{inputs,release,predecessorReleaseId}'=p_request#>'{inputs,release,predecessorReleaseId}'
    AND c.submitted_by::text=p_request#>>'{admission,authorWorkloadId}'
    AND (c.status::text<>'approved' OR c.approved_by=(checked->>'publisherId')::uuid)
  ORDER BY q.request_json->>'issuedAt' DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_RENEWAL_PROGRESS_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO publication.local_publication_request(request_hash,tenant_id,authority_id,change_set_id,developer_id,publisher_id,request_json,execution_status,execution_revision,renewed_from_hash)
 VALUES(p_request->>'hash',(checked->>'tenantId')::uuid,(checked->>'authorityId')::uuid,c.id,
   (checked->>'developerId')::uuid,(checked->>'publisherId')::uuid,p_request,
   CASE WHEN prior.request_hash IS NOT NULL THEN c.status::text END,
   CASE WHEN prior.request_hash IS NOT NULL THEN c.lock_version END,prior.request_hash)
 ON CONFLICT(request_hash) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM publication.local_publication_request WHERE request_hash=p_request->>'hash' AND request_json=p_request
 AND tenant_id=(checked->>'tenantId')::uuid) THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_REPLAY_CONFLICT' USING ERRCODE='42501'; END IF;
 RETURN p_request->>'hash';
END $$;
CREATE OR REPLACE FUNCTION publication.local_publication_release_receipt(p_hash text) RETURNS jsonb
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
 AND p.metadata->>'approvalBasis'='local_development_authority' AND (p.metadata->'localPublicationRequest'=q.request_json OR (q.request_json#>>'{admission,action}'='recover' AND EXISTS(SELECT 1 FROM publication.local_publication_request original WHERE original.request_hash=q.renewed_from_hash AND original.execution_release_id=r.id AND original.tenant_id=q.tenant_id AND original.request_json#>>'{admission,action}'='publish' AND original.request_json=p.metadata->'localPublicationRequest')))
 AND p.status IN ('approved','published') AND p.release_hash=r.release_hash) THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_COMMITTED_RELEASE_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',r.id,'releaseNo',r.release_no);
END $$;
CREATE OR REPLACE FUNCTION publication.local_publication_execution_context(p_release uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q publication.local_publication_request%ROWTYPE; checked jsonb; prior text:=current_setting('app.local_publication_request_hash',true);
BEGIN
 SELECT * INTO STRICT q FROM publication.local_publication_request WHERE execution_release_id=p_release
 AND tenant_id=shared.current_tenant_id_soft() AND publisher_id=master.current_principal_id_soft()
 AND (NULLIF(prior,'') IS NULL OR request_hash=prior)
 ORDER BY (request_json->>'issuedAt')::timestamptz DESC,request_hash DESC LIMIT 1 FOR SHARE;
 IF NULLIF(prior,'') IS NOT NULL AND prior<>q.request_hash THEN RAISE EXCEPTION 'LOCAL_PUBLICATION_NESTED_REQUEST_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.local_publication_request_hash',q.request_hash,true);
 PERFORM publication.local_publication_release_receipt(q.request_hash);
 checked:=publication.fn_local_publication_request_authority(q.request_json,false);
 PERFORM set_config('app.local_publication_request_hash',COALESCE(prior,''),true);
 RETURN checked;
END $$;
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
 IF NOT (r.request_json#>>'{admission,action}'='publish' OR (p_phase='prepare' AND r.request_json#>>'{admission,action}'='recover' AND r.execution_release_id IS NOT NULL))
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
 AND er.change_set_id=p_draft AND er.tenant_id IS NULL AND EXISTS (SELECT 1 FROM snapshot.entity_contract_revision s WHERE s.id=er.revision_id AND s.change_set_id=p_draft AND s.contract_hash=er.contract_hash AND s.revision_hash=er.revision_hash AND encode(sha256(convert_to(publication.fn_successor_canonical_json(s.contract_json),'UTF8')),'hex')=r.request_json#>>'{inputs,sourceHash}') AND er.published_by=r.publisher_id))) THEN
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
 OR NOT (r.request_json#>>'{admission,action}'='publish' OR (r.request_json#>>'{admission,action}'='recover' AND current_row.status::text='published' AND r.execution_release_id IS NOT NULL)) THEN
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
 -- Drain deferred native graph checks before leaving exact request authority.
 SET CONSTRAINTS metadata.native_layout_final_guard,metadata.native_core_final_guard,metadata.native_root_final_guard,metadata.native_snapshot_final_guard,metadata.settings_locale_check IMMEDIATE;
 PERFORM set_config('app.local_publication_request_hash',COALESCE(prior_scope,''),true);
 RETURN jsonb_build_object('basis','local_development_authority','requestHash',p_hash,'revision',current_row.lock_version,'status',wanted,'replayed',false);
END $$;
