BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION publication.fn_prepare_initial_baseline_release(p_release_id uuid,p_baseline_id uuid,p_descriptor jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r metadata.entity_release%ROWTYPE; b metadata.entity_baseline_import%ROWTYPE; cs metadata.entity_change_set%ROWTYPE; g jsonb; marker jsonb; authored_ai jsonb; count_markers integer; target_key text; target_no bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_baseline_id::text,0));
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release_id AND tenant_id=shared.current_tenant_id() AND published_by=master.current_principal_id_soft();
 SELECT * INTO STRICT b FROM metadata.entity_baseline_import WHERE id=p_baseline_id AND tenant_id=r.tenant_id;
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=r.change_set_id AND tenant_id=r.tenant_id;
 target_key:=CASE WHEN b.source_plane='mesh' THEN b.publication_key||'.tenant.'||b.tenant_id::text ELSE b.publication_key END;
 target_no:=CASE WHEN b.source_plane='mesh' THEN 1 ELSE b.source_release_no+1 END;
 IF r.release_kind<>'publish' OR r.target_planes<>ARRAY[b.source_plane]::text[] OR cs.approved_by IS NULL OR cs.submitted_by IS NULL
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
 IF EXISTS(SELECT 1 FROM publication.release WHERE release_key=target_key AND release_no>=target_no) THEN RAISE EXCEPTION 'BASELINE_SUCCESSOR_EXISTS'; END IF;
 INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
 VALUES(r.tenant_id,r.id,r.revision_id,r.entity_id,b.source_plane,r.release_hash,r.contract_hash,p_descriptor,
 snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,b.source_plane,r.release_hash,r.contract_hash,p_descriptor),
 jsonb_build_object('schema','initial-baseline-ai/1','baselineImportId',b.id,'baselineHash',b.content_hash,'descriptorContentHash',marker->>'descriptorHash'),r.published_by);
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
 VALUES(r.id,r.tenant_id,target_key,target_no,'publish','preparing','backward_compatible',r.release_hash,r.release_hash,r.published_by,
 jsonb_build_object('schema','initial-baseline-ai/1','baselineImportId',b.id,'sourceReleaseId',b.source_release_id,'sourceDescriptorHash',marker->>'descriptorHash'));
 INSERT INTO publication.entity_baseline_release_link(tenant_id,publication_release_id,entity_release_id,baseline_id) VALUES(r.tenant_id,r.id,r.id,b.id);
 PERFORM publication.fn_transition_release(r.id,'approved',cs.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','baselineImportId',b.id,'descriptorHash',marker->>'descriptorHash'));
END $$;
REVOKE ALL ON FUNCTION publication.fn_prepare_initial_baseline_release(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_prepare_initial_baseline_release(uuid,uuid,jsonb) TO athyperapp;


CREATE OR REPLACE FUNCTION publication.trg_validate_baseline_release_link() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,publication,metadata AS $$
 BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM publication.release p JOIN metadata.entity_release e ON e.id=NEW.entity_release_id
   JOIN metadata.entity_change_set cs ON cs.id=e.change_set_id
   JOIN metadata.entity_baseline_import b ON b.id=NEW.baseline_id
   WHERE p.id=NEW.publication_release_id AND p.tenant_id=NEW.tenant_id AND b.tenant_id=p.tenant_id
     AND e.tenant_id=p.tenant_id AND p.release_key=CASE WHEN b.source_plane='mesh' THEN b.publication_key||'.tenant.'||b.tenant_id::text ELSE b.publication_key END AND p.release_no=CASE WHEN b.source_plane='mesh' THEN 1 ELSE b.source_release_no+1 END
     AND p.release_hash=e.release_hash AND p.release_kind='publish' AND e.release_kind='publish'
     AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
     AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation r WHERE r.baseline_id=b.id)
 ) THEN RAISE EXCEPTION 'BASELINE_RELEASE_COORDINATE_OR_REVIEW_MISMATCH'; END IF;
 RETURN NEW;
 END $$;

DROP TRIGGER entity_baseline_global_link_guard ON publication.entity_baseline_release_link;

CREATE OR REPLACE FUNCTION publication.fn_initial_baseline_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid,tenant_id uuid,release_key text,release_no bigint,release_kind text,compatibility_level text,minimum_runtime_version text,revision_id uuid,published_at timestamptz,published_by uuid,entity_id uuid,entity_code text,contract_schema_code text,contract_schema_version text,contract_json jsonb,contract_hash text,contract_signature text,signature_algorithm text,contract_signing_key_id text,descriptor_id uuid,plane_key text,compiled_json jsonb,compiled_hash text,created_at timestamptz,imported_baseline jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
SELECT pr.id publication_release_id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind::text,
        pr.compatibility_level::text,pr.minimum_runtime_version,er.revision_id,er.published_at,er.published_by,
        CASE WHEN b.source_plane='mesh' THEN er.entity_id ELSE b.source_entity_id END AS entity_id,b.entity_code,b.payload->'source'->'contract'->>'contract_schema_code' AS contract_schema_code,
        b.payload->'source'->'contract'->>'contract_schema_version' AS contract_schema_version,
        b.payload->'source'->'contract'->'contract_json' AS contract_json,
        er.contract_hash,er.contract_signature,er.signature_algorithm,er.signing_key_id AS contract_signing_key_id,
        a.id AS descriptor_id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at,
        jsonb_build_object('kind',CASE WHEN b.source_plane='mesh' THEN 'global_tenant_fork' ELSE 'same_key_successor' END,'sourcePublicationKey',b.publication_key,'sourceReleaseId',b.source_release_id,'tenantId',b.tenant_id,'baselineImportId',b.id,'contentHash',b.content_hash,'appliedReleaseId',b.payload->'source'->'head'->>'applied_release_id',
          'rowVersion',b.payload->'source'->'head'->>'row_version','sourceReleaseNo',b.source_release_no,'artifactHash',b.payload->'source'->'head'->>'artifact_hash') AS imported_baseline
        FROM publication.release pr JOIN publication.entity_baseline_release_link l ON l.publication_release_id=pr.id AND l.tenant_id=pr.tenant_id
        JOIN metadata.entity_baseline_import b ON b.id=l.baseline_id AND b.tenant_id=l.tenant_id
        JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id=l.tenant_id
        JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id
        WHERE pr.tenant_id=shared.current_tenant_id() AND pr.id=p_release_id AND pr.status IN ('approved','published')
          AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation revoked WHERE revoked.baseline_id=b.id);
$$;
REVOKE ALL ON FUNCTION publication.fn_initial_baseline_compilation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_initial_baseline_compilation_source(uuid) TO athyper_publication_service;

COMMIT;
