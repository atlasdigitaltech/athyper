BEGIN;
-- A reviewed native graph may initialize an empty target after an intentional reset.
-- This never reconstructs historical approvals, grant assignments or active heads.
CREATE TABLE publication.entity_runtime_restoration_link (
 publication_release_id uuid PRIMARY KEY REFERENCES publication.release(id),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 descriptor_hash text NOT NULL CHECK(descriptor_hash ~ '^[a-f0-9]{64}$'),
 runtime_precondition jsonb NOT NULL,
 FOREIGN KEY(tenant_id,publication_release_id) REFERENCES metadata.entity_release(tenant_id,id)
);
CREATE TRIGGER runtime_restoration_link_immutable BEFORE UPDATE OR DELETE ON publication.entity_runtime_restoration_link FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
ALTER TABLE publication.entity_runtime_restoration_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.entity_runtime_restoration_link FORCE ROW LEVEL SECURITY;
CREATE POLICY runtime_restoration_link_tenant ON publication.entity_runtime_restoration_link USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON publication.entity_runtime_restoration_link FROM PUBLIC;
GRANT SELECT ON publication.entity_runtime_restoration_link TO athyperapp,athyper_publication_service;
CREATE FUNCTION publication.fn_prepare_runtime_restoration(p_release_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r metadata.entity_release%ROWTYPE; cs metadata.entity_change_set%ROWTYPE; g jsonb; layout jsonb; marker jsonb; payload jsonb; n integer; descriptor_hash text; precondition jsonb;
BEGIN
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=p_release_id AND tenant_id=shared.current_tenant_id() AND published_by=master.current_principal_id_soft();
 SELECT * INTO STRICT cs FROM metadata.entity_change_set WHERE id=r.change_set_id AND tenant_id=r.tenant_id FOR UPDATE;
 IF r.release_kind<>'publish' OR r.target_planes<>ARRAY['neon']::text[] OR cs.status NOT IN ('approved','published') OR cs.approved_by IS NULL OR cs.submitted_by IS NULL OR cs.approved_by=cs.created_by OR cs.approved_by=cs.submitted_by OR r.contract_signature IS NULL THEN RAISE EXCEPTION 'RESTORATION_APPROVED_NATIVE_RELEASE_REQUIRED'; END IF;
 SELECT contract_json INTO STRICT g FROM snapshot.entity_contract_revision WHERE id=r.revision_id AND tenant_id=r.tenant_id AND validation_status='valid';
 SELECT count(*) INTO n FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ? 'runtimeRestoration';
 IF n<>1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ?| ARRAY['authorizationSuccessor','baselineImport']) THEN RAISE EXCEPTION 'RESTORATION_MARKER_CONFLICT'; END IF;
 SELECT s->'layoutConfig' INTO layout FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ? 'runtimeRestoration';
 marker:=layout->'runtimeRestoration';payload:=marker->'descriptor';descriptor_hash:=marker->>'descriptorHash';
 IF (marker->>'schemaVersion'='1' AND marker->>'kind'='reviewed_empty_target' AND marker->>'tenantId'=r.tenant_id::text AND marker->>'publicationKey' ~ '^metadata[.]entity[.][a-z0-9_.-]+$' AND marker->>'sourceArtifactHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'RESTORATION_MARKER_INVALID'; END IF;
 IF descriptor_hash IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(payload),'UTF8')),'hex')
 OR payload->>'schema' IS DISTINCT FROM 'athyper.entity-runtime-descriptor/1.0'
 OR payload->>'planeKey' IS DISTINCT FROM 'neon'
 OR payload->>'entityCode' IS DISTINCT FROM g->'entity'->>'entityCode'
 OR payload->'authorization' IS DISTINCT FROM layout->'authorization'
 OR payload->'authorizationRuntime' IS DISTINCT FROM layout->'authorizationRuntime'
 OR payload->'ai' IS DISTINCT FROM layout->'ai'
 OR payload->'operation_scope_bindings' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'RESTORATION_REVIEWED_PAYLOAD_MISMATCH'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(marker->>'publicationKey',0));
 IF EXISTS(SELECT 1 FROM publication.release WHERE release_key=marker->>'publicationKey') THEN RAISE EXCEPTION 'RESTORATION_PUBLICATION_ALREADY_EXISTS'; END IF;
 precondition:=jsonb_build_object('kind','reviewed_empty_target','schemaVersion',1,'tenantId',r.tenant_id,'entityCode',payload->>'entityCode','publicationKey',marker->>'publicationKey','descriptorHash',descriptor_hash);
 INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
 VALUES(r.tenant_id,r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,payload,snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,payload),jsonb_build_object('schema','runtime-restoration/1','descriptorHash',descriptor_hash),r.published_by);
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,minimum_runtime_version,release_hash,manifest_hash,created_by,metadata)
 VALUES(r.id,r.tenant_id,marker->>'publicationKey',1,'publish','preparing','backward_compatible','1.0.0',r.release_hash,r.release_hash,r.published_by,jsonb_build_object('schema','runtime-restoration/1','descriptorHash',descriptor_hash));
 INSERT INTO publication.entity_runtime_restoration_link VALUES(r.id,r.tenant_id,descriptor_hash,precondition);
 PERFORM publication.fn_transition_release(r.id,'approved',cs.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','descriptorHash',descriptor_hash,'kind','reviewed_empty_target'));
END $$;
REVOKE ALL ON FUNCTION publication.fn_prepare_runtime_restoration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_prepare_runtime_restoration(uuid) TO athyperapp;
CREATE FUNCTION publication.fn_runtime_restoration_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid,tenant_id uuid,release_key text,release_no bigint,release_kind text,compatibility_level text,minimum_runtime_version text,revision_id uuid,published_at timestamptz,published_by uuid,entity_id uuid,entity_code text,contract_schema_code text,contract_schema_version text,contract_json jsonb,contract_hash text,contract_signature text,signature_algorithm text,contract_signing_key_id text,descriptor_id uuid,plane_key text,compiled_json jsonb,compiled_hash text,created_at timestamptz,imported_baseline jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
 SELECT pr.id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind::text,pr.compatibility_level::text,
 pr.minimum_runtime_version,er.revision_id,er.published_at,er.published_by,er.entity_id,e.entity_code,
 er.contract_schema_code,er.contract_schema_version,rev.contract_json,er.contract_hash,er.contract_signature,er.signature_algorithm,er.signing_key_id,
 a.id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at,l.runtime_precondition
 FROM publication.release pr JOIN publication.entity_runtime_restoration_link l ON l.publication_release_id=pr.id AND l.tenant_id=pr.tenant_id
 JOIN metadata.entity_release er ON er.id=pr.id AND er.tenant_id=pr.tenant_id
 JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id=er.tenant_id
 JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id AND cs.tenant_id=er.tenant_id
 JOIN snapshot.entity_contract_revision rev ON rev.id=er.revision_id AND rev.tenant_id=er.tenant_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id AND a.plane_key='neon'
 WHERE pr.id=p_release_id AND pr.tenant_id=shared.current_tenant_id() AND pr.status IN ('approved','published')
 AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
$$;
REVOKE ALL ON FUNCTION publication.fn_runtime_restoration_compilation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_runtime_restoration_compilation_source(uuid) TO athyper_publication_service;

COMMIT;
