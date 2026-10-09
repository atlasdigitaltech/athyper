-- Admit rollback under the same current authority; preserve publish/recovery semantics.
CREATE OR REPLACE FUNCTION publication.admit_local_publication_request(p_request jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE checked jsonb; c metadata.entity_change_set%ROWTYPE; prior publication.local_publication_request%ROWTYPE;
BEGIN
 checked:=publication.fn_local_publication_request_authority(p_request,true);
 IF EXISTS(SELECT 1 FROM publication.local_publication_request WHERE request_hash=p_request->>'hash' AND request_json=p_request AND tenant_id=(checked->>'tenantId')::uuid) THEN RETURN p_request->>'hash'; END IF;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=(checked#>>'{changeSet,id}')::uuid FOR UPDATE;
 IF p_request#>>'{admission,action}'='rollback' THEN
  IF c.status::text<>'published' OR EXISTS(
   (SELECT t.target_plane,t.artifact_hash FROM publication.read_local_rollback_targets(c.id) t
    EXCEPT SELECT t->>'plane',t->>'artifactHash' FROM jsonb_array_elements(p_request#>'{inputs,targets}') t)
   UNION ALL
   (SELECT t->>'plane',t->>'artifactHash' FROM jsonb_array_elements(p_request#>'{inputs,targets}') t
    EXCEPT SELECT t.target_plane,t.artifact_hash FROM publication.read_local_rollback_targets(c.id) t)
  ) THEN RAISE EXCEPTION 'LOCAL_ROLLBACK_SIGNED_TARGET_REQUIRED' USING ERRCODE='42501'; END IF;
  INSERT INTO publication.local_publication_request(request_hash,tenant_id,authority_id,change_set_id,developer_id,publisher_id,request_json)
  VALUES(p_request->>'hash',(checked->>'tenantId')::uuid,(checked->>'authorityId')::uuid,c.id,
   (checked->>'developerId')::uuid,(checked->>'publisherId')::uuid,p_request);
  RETURN p_request->>'hash';
 END IF;
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
