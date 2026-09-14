BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION publication.fn_prepare_initial_baseline_release(p_release_id uuid,p_baseline_id uuid,p_descriptor jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r metadata.entity_release%ROWTYPE; b metadata.entity_baseline_import%ROWTYPE; cs metadata.entity_change_set%ROWTYPE; g jsonb; marker jsonb; authored_ai jsonb; count_markers integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_baseline_id::text,0));
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release_id AND tenant_id=shared.current_tenant_id() AND published_by=master.current_principal_id_soft();
 SELECT * INTO STRICT b FROM metadata.entity_baseline_import WHERE id=p_baseline_id AND tenant_id=r.tenant_id;
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=r.change_set_id AND tenant_id=r.tenant_id;
 IF r.release_kind<>'publish' OR r.target_planes<>ARRAY['neon']::text[] OR cs.approved_by IS NULL OR cs.submitted_by IS NULL
   OR cs.approved_by=cs.created_by OR cs.approved_by=cs.submitted_by OR cs.status NOT IN ('approved','published')
   OR NOT EXISTS(SELECT 1 FROM metadata.entity e WHERE e.id=r.entity_id AND e.tenant_id=r.tenant_id AND e.entity_code=b.entity_code)
   OR EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation WHERE baseline_id=b.id)
   OR r.contract_signature IS NULL THEN RAISE EXCEPTION 'APPROVED_BASELINE_RELEASE_REQUIRED'; END IF;
 SELECT contract_json INTO STRICT g FROM snapshot.entity_contract_revision WHERE id=r.revision_id AND tenant_id=r.tenant_id AND validation_status='valid';
 SELECT count(*) INTO count_markers FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ? 'baselineImport';
 IF count_markers<>1 THEN RAISE EXCEPTION 'REVIEWED_BASELINE_MARKER_REQUIRED'; END IF;
 SELECT s->'layoutConfig'->'baselineImport',s->'layoutConfig'->'ai' INTO marker,authored_ai FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ? 'baselineImport';
 IF COALESCE(marker->>'id','')<>b.id::text OR COALESCE(marker->>'contentHash','')<>b.content_hash
   OR COALESCE(marker->>'sourceEntityId','')<>b.source_entity_id::text
   OR authored_ai IS NULL OR p_descriptor->'ai' IS DISTINCT FROM authored_ai
   OR p_descriptor-'ai' IS DISTINCT FROM (b.payload->'source'->'descriptor'->'compiled_json')-'ai'
   OR COALESCE(authored_ai->>'enabled','')<>'true' THEN RAISE EXCEPTION 'REVIEWED_BASELINE_PAYLOAD_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM publication.release WHERE release_key=b.publication_key AND release_no>=b.source_release_no+1) THEN RAISE EXCEPTION 'BASELINE_SUCCESSOR_EXISTS'; END IF;
 INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
 VALUES(r.tenant_id,r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,p_descriptor,
 snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,p_descriptor),
 jsonb_build_object('schema','initial-baseline-ai/1','baselineImportId',b.id,'baselineHash',b.content_hash,'descriptorContentHash',marker->>'descriptorHash'),r.published_by);
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
 VALUES(r.id,r.tenant_id,b.publication_key,b.source_release_no+1,'publish','preparing','backward_compatible',r.release_hash,r.release_hash,r.published_by,
 jsonb_build_object('schema','initial-baseline-ai/1','baselineImportId',b.id,'sourceReleaseId',b.source_release_id,'sourceDescriptorHash',marker->>'descriptorHash'));
 INSERT INTO publication.entity_baseline_release_link(tenant_id,publication_release_id,entity_release_id,baseline_id) VALUES(r.tenant_id,r.id,r.id,b.id);
 PERFORM publication.fn_transition_release(r.id,'approved',cs.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','baselineImportId',b.id,'descriptorHash',marker->>'descriptorHash'));
END $$;
REVOKE ALL ON FUNCTION publication.fn_prepare_initial_baseline_release(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_prepare_initial_baseline_release(uuid,uuid,jsonb) TO athyperapp;

COMMIT;
