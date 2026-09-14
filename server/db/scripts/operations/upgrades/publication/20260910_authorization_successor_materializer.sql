BEGIN;
SET LOCAL lock_timeout='5s';
-- Canonical payload encoding used by reviewed descriptor content hashes.
CREATE OR REPLACE FUNCTION publication.fn_successor_canonical_json(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,publication AS $$
 SELECT CASE jsonb_typeof(p)
 WHEN 'object' THEN '{'||COALESCE((SELECT string_agg(to_jsonb(key)::text||':'||publication.fn_successor_canonical_json(value),',' ORDER BY key COLLATE "C") FROM jsonb_each(p)),'')||'}'
 WHEN 'array' THEN '['||COALESCE((SELECT string_agg(publication.fn_successor_canonical_json(value),',' ORDER BY ord) FROM jsonb_array_elements(p) WITH ORDINALITY AS a(value,ord)),'')||']'
 ELSE p::text END
$$;
REVOKE ALL ON FUNCTION publication.fn_successor_canonical_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_successor_canonical_json(jsonb) TO athyperapp,athyperadmin;
-- Installed content is inert: the approved graph must pin its computed hash.
CREATE TABLE publication.entity_authorization_successor_payload (
 content_hash text PRIMARY KEY CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 descriptor jsonb NOT NULL CHECK(jsonb_typeof(descriptor)='object'),
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(content_hash=encode(sha256(convert_to(publication.fn_successor_canonical_json(descriptor),'UTF8')),'hex'))
);
CREATE TRIGGER authorization_successor_payload_immutable BEFORE UPDATE OR DELETE ON publication.entity_authorization_successor_payload FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
ALTER TABLE publication.entity_authorization_successor_payload ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.entity_authorization_successor_payload FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_successor_payload_tenant ON publication.entity_authorization_successor_payload USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON publication.entity_authorization_successor_payload FROM PUBLIC;
GRANT SELECT ON publication.entity_authorization_successor_payload TO athyperapp;
GRANT SELECT,INSERT ON publication.entity_authorization_successor_payload TO athyperadmin;
CREATE TABLE publication.entity_authorization_successor_link (
 publication_release_id uuid PRIMARY KEY REFERENCES publication.release(id),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 predecessor_release_id uuid NOT NULL REFERENCES publication.release(id),
 baseline_id uuid NOT NULL REFERENCES metadata.entity_baseline_import(id),
 descriptor_hash text NOT NULL REFERENCES publication.entity_authorization_successor_payload(content_hash),
 runtime_precondition jsonb NOT NULL,
 FOREIGN KEY(tenant_id,publication_release_id) REFERENCES metadata.entity_release(tenant_id,id)
);
CREATE TRIGGER authorization_successor_link_immutable BEFORE UPDATE OR DELETE ON publication.entity_authorization_successor_link FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
ALTER TABLE publication.entity_authorization_successor_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.entity_authorization_successor_link FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_successor_link_tenant ON publication.entity_authorization_successor_link USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON publication.entity_authorization_successor_link FROM PUBLIC;
GRANT SELECT ON publication.entity_authorization_successor_link TO athyperapp,athyper_publication_service;
CREATE FUNCTION publication.fn_prepare_authorization_successor(p_release_id uuid,p_precondition jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r metadata.entity_release%ROWTYPE; cs metadata.entity_change_set%ROWTYPE; g jsonb; layout jsonb; marker jsonb; predecessor record; payload jsonb; n integer; descriptor_hash text;
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
 IF predecessor.native_entity_id<>r.entity_id OR predecessor.release_key<>marker->'predecessor'->>'publicationKey' OR predecessor.release_no::text<>marker->'predecessor'->>'releaseNo'
 OR EXISTS(SELECT 1 FROM publication.release WHERE release_key=predecessor.release_key AND release_no>predecessor.release_no) THEN RAISE EXCEPTION 'SUCCESSOR_PREDECESSOR_STALE'; END IF;
 IF marker->'predecessor'->>'descriptorHash' IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(predecessor.compiled_json),'UTF8')),'hex') OR marker->'predecessor'->>'authoredContractHash' IS DISTINCT FROM encode(sha256(convert_to(publication.fn_successor_canonical_json(predecessor.predecessor_contract),'UTF8')),'hex') THEN RAISE EXCEPTION 'SUCCESSOR_PREDECESSOR_HASH_MISMATCH'; END IF;
 descriptor_hash:=marker->>'combinedDescriptorHash';
 SELECT descriptor INTO STRICT payload FROM publication.entity_authorization_successor_payload WHERE content_hash=descriptor_hash AND tenant_id=r.tenant_id;
 IF layout->'baselineImport'->>'descriptorHash' IS DISTINCT FROM descriptor_hash
 OR payload->'authorization' IS DISTINCT FROM layout->'authorization' OR payload->'authorizationRuntime' IS DISTINCT FROM layout->'authorizationRuntime'
 OR payload->'ai' IS DISTINCT FROM predecessor.compiled_json->'ai'
 OR payload-ARRAY['fields','operations','listPresentation','authorization','authorizationRuntime','operation_scope_bindings'] IS DISTINCT FROM predecessor.compiled_json-ARRAY['fields','operations','listPresentation','authorization','authorizationRuntime','operation_scope_bindings']
 OR payload->'operation_scope_bindings' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'SUCCESSOR_REVIEWED_PAYLOAD_MISMATCH'; END IF;
 IF (p_precondition->>'sourceReleaseId'=predecessor.id::text AND p_precondition->>'sourceReleaseNo'=predecessor.release_no::text AND p_precondition->>'appliedReleaseId' ~ '^[a-f0-9-]{36}$' AND p_precondition->>'rowVersion' ~ '^[0-9]+$' AND p_precondition->>'artifactHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RAISE EXCEPTION 'SUCCESSOR_RUNTIME_PRECONDITION_REQUIRED'; END IF;
 INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
 VALUES(r.tenant_id,r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,payload,snapshot.fn_compute_entity_release_artifact_hash(r.id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,payload),jsonb_build_object('schema','authorization-successor/1','descriptorHash',descriptor_hash),r.published_by);
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,minimum_runtime_version,release_hash,manifest_hash,created_by,metadata)
 VALUES(r.id,r.tenant_id,predecessor.release_key,predecessor.release_no+1,'publish','preparing','backward_compatible','1.0.0',r.release_hash,r.release_hash,r.published_by,jsonb_build_object('schema','authorization-successor/1','predecessorReleaseId',predecessor.id,'descriptorHash',descriptor_hash));
 INSERT INTO publication.entity_authorization_successor_link VALUES(r.id,r.tenant_id,predecessor.id,predecessor.baseline_id,descriptor_hash,p_precondition);
 PERFORM publication.fn_transition_release(r.id,'approved',cs.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','descriptorHash',descriptor_hash));
END $$;
REVOKE ALL ON FUNCTION publication.fn_prepare_authorization_successor(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_prepare_authorization_successor(uuid,jsonb) TO athyperapp;
CREATE FUNCTION publication.fn_authorization_successor_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid,tenant_id uuid,release_key text,release_no bigint,release_kind text,compatibility_level text,minimum_runtime_version text,revision_id uuid,published_at timestamptz,published_by uuid,entity_id uuid,entity_code text,contract_schema_code text,contract_schema_version text,contract_json jsonb,contract_hash text,contract_signature text,signature_algorithm text,contract_signing_key_id text,descriptor_id uuid,plane_key text,compiled_json jsonb,compiled_hash text,created_at timestamptz,imported_baseline jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
 SELECT pr.id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind::text,pr.compatibility_level::text,
 pr.minimum_runtime_version,er.revision_id,er.published_at,er.published_by,b.source_entity_id,b.entity_code,
 er.contract_schema_code,er.contract_schema_version,rev.contract_json,er.contract_hash,er.contract_signature,er.signature_algorithm,er.signing_key_id,
 a.id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at,l.runtime_precondition
 FROM publication.release pr JOIN publication.entity_authorization_successor_link l ON l.publication_release_id=pr.id AND l.tenant_id=pr.tenant_id
 JOIN metadata.entity_release er ON er.id=pr.id AND er.tenant_id=pr.tenant_id
 JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id AND cs.tenant_id=er.tenant_id
 JOIN snapshot.entity_contract_revision rev ON rev.id=er.revision_id AND rev.tenant_id=er.tenant_id
 JOIN metadata.entity_baseline_import b ON b.id=l.baseline_id AND b.tenant_id=l.tenant_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id AND a.plane_key='neon'
 WHERE pr.id=p_release_id AND pr.tenant_id=shared.current_tenant_id() AND pr.status IN ('approved','published')
 AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
 AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation v WHERE v.baseline_id=b.id)
$$;
REVOKE ALL ON FUNCTION publication.fn_authorization_successor_compilation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_authorization_successor_compilation_source(uuid) TO athyper_publication_service;
COMMIT;
