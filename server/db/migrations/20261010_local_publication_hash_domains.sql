-- Ledger release/revision hashes are distinct from canonical source and descriptor hashes.
-- Signed descriptor equality remains enforced by creation and artifact/link routines.
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
 OR NOT EXISTS (SELECT 1 FROM snapshot.entity_contract_revision s WHERE s.id=r.revision_id AND s.change_set_id=q.change_set_id AND s.contract_hash=r.contract_hash AND s.revision_hash=r.revision_hash AND encode(sha256(convert_to(publication.fn_successor_canonical_json(s.contract_json),'UTF8')),'hex')=q.request_json#>>'{inputs,sourceHash}')
 OR r.supersedes_release_id::text IS DISTINCT FROM q.request_json#>>'{inputs,release,predecessorReleaseId}' THEN
 RAISE EXCEPTION 'LOCAL_PUBLICATION_RELEASE_BINDING_DENIED' USING ERRCODE='42501', DETAIL=jsonb_build_object(
 'alreadyBound',q.execution_release_id IS NOT NULL,'requestStatus',q.execution_status,
 'draftStatus',c.status,'draftRevision',c.lock_version,'expectedRevision',q.execution_revision+1,
 'authorMatches',c.submitted_by::text IS NOT DISTINCT FROM q.request_json#>>'{admission,authorWorkloadId}',
 'reviewerMatches',c.approved_by IS NOT DISTINCT FROM q.publisher_id,
 'publisherMatches',r.published_by IS NOT DISTINCT FROM q.publisher_id,
 'releaseKind',r.release_kind,
 'revisionMatches',EXISTS(SELECT 1 FROM snapshot.entity_contract_revision s WHERE s.id=r.revision_id AND s.contract_hash=r.contract_hash AND s.revision_hash=r.revision_hash),
 'predecessorMatches',r.supersedes_release_id::text IS NOT DISTINCT FROM q.request_json#>>'{inputs,release,predecessorReleaseId}')::text; END IF;
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

