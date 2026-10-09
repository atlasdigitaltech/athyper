-- Renew exact local requests without rewriting expired evidence or inventing review.
ALTER TABLE publication.local_publication_request ADD COLUMN renewed_from_hash text REFERENCES publication.local_publication_request(request_hash);
CREATE OR REPLACE FUNCTION publication.admit_local_publication_request(p_request jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE checked jsonb; c metadata.entity_change_set%ROWTYPE; prior publication.local_publication_request%ROWTYPE;
BEGIN
 checked:=publication.fn_local_publication_request_authority(p_request,true);
 IF EXISTS(SELECT 1 FROM publication.local_publication_request WHERE request_hash=p_request->>'hash' AND request_json=p_request AND tenant_id=(checked->>'tenantId')::uuid) THEN RETURN p_request->>'hash'; END IF;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=(checked#>>'{changeSet,id}')::uuid FOR UPDATE;
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
