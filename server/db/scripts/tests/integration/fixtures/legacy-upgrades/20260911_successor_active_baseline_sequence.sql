BEGIN;
CREATE OR REPLACE FUNCTION publication.fn_prepare_authorization_successor(p_release_id uuid,p_precondition jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r metadata.entity_release%ROWTYPE; cs metadata.entity_change_set%ROWTYPE; g jsonb; layout jsonb; marker jsonb; predecessor record; payload jsonb; n integer; descriptor_hash text; next_publication_no bigint;
BEGIN
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release_id AND tenant_id=shared.current_tenant_id() AND published_by=master.current_principal_id_soft();
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=r.change_set_id AND tenant_id=r.tenant_id FOR UPDATE;
 IF r.release_kind<>'publish' OR r.target_planes<>ARRAY['neon']::text[] OR cs.status NOT IN ('approved','published') OR cs.approved_by IS NULL OR cs.submitted_by IS NULL OR cs.approved_by=cs.created_by OR cs.approved_by=cs.submitted_by OR r.contract_signature IS NULL THEN RAISE EXCEPTION 'SUCCESSOR_APPROVED_NATIVE_RELEASE_REQUIRED'; END IF;
 SELECT contract_json INTO STRICT g FROM snapshot.entity_contract_revision WHERE id=r.revision_id AND tenant_id=r.tenant_id AND validation_status='valid';
 SELECT count(*) INTO n FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ? 'authorizationSuccessor';
 IF n<>1 THEN RAISE EXCEPTION 'SUCCESSOR_MARKER_REQUIRED'; END IF;
 SELECT s->'layoutConfig' INTO layout FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ? 'authorizationSuccessor';
 marker:=layout->'authorizationSuccessor';
 IF (marker->>'schemaVersion'='1' AND marker->>'publicationEligible'='false') IS NOT TRUE THEN RAISE EXCEPTION 'SUCCESSOR_MARKER_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(marker->'predecessor'->>'publicationKey',0));
 SELECT pr.*,a.compiled_json,rev.contract_json predecessor_contract,b.id baseline_id,er.entity_id native_entity_id INTO STRICT predecessor
 FROM publication.release pr JOIN publication.entity_baseline_release_link l ON l.publication_release_id=pr.id AND l.tenant_id=pr.tenant_id
 JOIN metadata.entity_baseline_import b ON b.id=l.baseline_id AND b.tenant_id=l.tenant_id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id=l.tenant_id
 JOIN metadata.entity_change_set pcs ON pcs.id=er.change_set_id AND pcs.tenant_id=er.tenant_id AND pcs.approved_by IS NOT NULL AND pcs.approved_by<>pcs.created_by AND pcs.approved_by IS DISTINCT FROM pcs.submitted_by
 JOIN snapshot.entity_contract_revision rev ON rev.id=er.revision_id AND rev.tenant_id=er.tenant_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id AND a.plane_key='neon'
 WHERE pr.id=(marker->'predecessor'->>'releaseId')::uuid AND pr.tenant_id=r.tenant_id AND pr.status IN('approved','published')
 AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation v WHERE v.baseline_id=b.id) FOR SHARE OF pr;
 IF predecessor.native_entity_id<>r.entity_id OR predecessor.release_key<>marker->'predecessor'->>'publicationKey' OR predecessor.release_no::text<>marker->'predecessor'->>'releaseNo' THEN RAISE EXCEPTION 'SUCCESSOR_PREDECESSOR_STALE'; END IF;
 IF marker->'predecessor'->>'descriptorHash' IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(predecessor.compiled_json),'UTF8')),'hex') OR marker->'predecessor'->>'authoredContractHash' IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(predecessor.predecessor_contract),'UTF8')),'hex') THEN RAISE EXCEPTION 'SUCCESSOR_PREDECESSOR_HASH_MISMATCH'; END IF;
 descriptor_hash:=marker->>'combinedDescriptorHash';
 SELECT descriptor INTO STRICT payload FROM publication.entity_authorization_successor_payload WHERE content_hash=descriptor_hash AND tenant_id=r.tenant_id;
 IF layout->'baselineImport'->>'descriptorHash' IS DISTINCT FROM descriptor_hash
 OR payload->'authorization' IS DISTINCT FROM layout->'authorization' OR payload->'authorizationRuntime' IS DISTINCT FROM layout->'authorizationRuntime'
 OR payload->'ai' IS DISTINCT FROM predecessor.compiled_json->'ai'
 OR payload-ARRAY['fields','operations','listPresentation','authorization','authorizationRuntime','operation_scope_bindings'] IS DISTINCT FROM predecessor.compiled_json-ARRAY['fields','operations','listPresentation','authorization','authorizationRuntime','operation_scope_bindings']
 OR payload->'operation_scope_bindings' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'SUCCESSOR_REVIEWED_PAYLOAD_MISMATCH'; END IF;
 IF (p_precondition->>'sourceReleaseId'=predecessor.id::text AND p_precondition->>'sourceReleaseNo'=predecessor.release_no::text AND p_precondition->>'appliedReleaseId' ~ '^[a-f0-9-]{36}$' AND p_precondition->>'rowVersion' ~ '^[0-9]+$' AND p_precondition->>'artifactHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'SUCCESSOR_RUNTIME_PRECONDITION_REQUIRED'; END IF;
 -- The reviewed predecessor is the exact runtime activation head, checked by
 -- the adapter and pinned below. A newer unactivated publication must not be
 -- mistaken for that head. Reserve a fresh publication sequence under the
 -- release-key advisory lock; never overwrite or reuse an existing release.
 SELECT COALESCE(max(release_no),0)+1 INTO next_publication_no FROM publication.release
 WHERE tenant_id=r.tenant_id AND release_key=predecessor.release_key;
 INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
 VALUES(r.tenant_id,r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,payload,snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,payload),jsonb_build_object('schema','authorization-successor/1','descriptorHash',descriptor_hash),r.published_by);
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,minimum_runtime_version,release_hash,manifest_hash,created_by,metadata)
 VALUES(r.id,r.tenant_id,predecessor.release_key,next_publication_no,'publish','preparing','backward_compatible','1.0.0',r.release_hash,r.release_hash,r.published_by,jsonb_build_object('schema','authorization-successor/1','predecessorReleaseId',predecessor.id,'descriptorHash',descriptor_hash));
 INSERT INTO publication.entity_authorization_successor_link VALUES(r.id,r.tenant_id,predecessor.id,predecessor.baseline_id,descriptor_hash,p_precondition);
 PERFORM publication.fn_transition_release(r.id,'approved',cs.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','descriptorHash',descriptor_hash));
END $$;
COMMIT;
