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
