CREATE OR REPLACE FUNCTION publication.bind_local_publication_release(p_release uuid) RETURNS void
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
 RAISE EXCEPTION 'LOCAL_PUBLICATION_RELEASE_BINDING_DENIED' USING ERRCODE='42501', DETAIL=jsonb_build_object(
 'alreadyBound',q.execution_release_id IS NOT NULL,'requestStatus',q.execution_status,
 'draftStatus',c.status,'draftRevision',c.lock_version,'expectedRevision',q.execution_revision+1,
 'authorMatches',c.submitted_by::text IS NOT DISTINCT FROM q.request_json#>>'{admission,authorWorkloadId}',
 'reviewerMatches',c.approved_by IS NOT DISTINCT FROM q.publisher_id,
 'publisherMatches',r.published_by IS NOT DISTINCT FROM q.publisher_id,
 'releaseKind',r.release_kind,
 'descriptorMatches',r.release_hash IS NOT DISTINCT FROM q.request_json#>>'{inputs,release,descriptorHash}',
 'predecessorMatches',r.supersedes_release_id::text IS NOT DISTINCT FROM q.request_json#>>'{inputs,release,predecessorReleaseId}')::text; END IF;
 UPDATE publication.local_publication_request SET execution_status='published',execution_revision=c.lock_version,execution_release_id=r.id WHERE request_hash=q.request_hash;
END $$;
REVOKE ALL ON FUNCTION publication.bind_local_publication_release(uuid) FROM PUBLIC;
ALTER FUNCTION publication.bind_local_publication_release(uuid) OWNER TO athyper_definer_product_publication;

