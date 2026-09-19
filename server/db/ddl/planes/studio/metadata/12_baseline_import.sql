-- An observed runtime baseline is evidence, not an official Studio release.
CREATE TABLE metadata.entity_baseline_import (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
 tenant_id uuid NOT NULL REFERENCES master.tenant(id),
 publication_key text NOT NULL,
 source_release_id uuid NOT NULL,
 source_release_no bigint NOT NULL CHECK (source_release_no > 0),
 entity_code text NOT NULL,
 source_entity_id uuid NOT NULL,
 source_plane text NOT NULL CHECK (source_plane = 'neon'),
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND pg_column_size(payload) <= 2097152),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 imported_by text NOT NULL DEFAULT session_user,
 UNIQUE(tenant_id, publication_key, source_release_id),
 UNIQUE(tenant_id, id),
 CHECK ((payload->>'schema' = 'athyper.imported-entity-baseline/1') IS TRUE),
 CHECK ((payload->>'tenantId' = tenant_id::text AND payload->>'publicationKey' = publication_key
   AND payload->>'sourceReleaseId' = source_release_id::text AND payload->>'sourceReleaseNo' = source_release_no::text
   AND payload->>'entityCode' = entity_code AND payload->>'sourceEntityId' = source_entity_id::text
   AND payload->>'sourcePlane' = source_plane AND payload->>'contentHash' = content_hash) IS TRUE)
);
CREATE TABLE metadata.entity_baseline_import_revocation (
 baseline_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_by text NOT NULL DEFAULT session_user,
 FOREIGN KEY(tenant_id, baseline_id) REFERENCES metadata.entity_baseline_import(tenant_id,id)
);
COMMENT ON TABLE metadata.entity_baseline_import IS
 'Immutable observed external runtime baseline. Contains original source signatures as unverified evidence; confers no approval, publication or permission.';
COMMENT ON TABLE metadata.entity_baseline_import_revocation IS
 'Append-only import rollback. Disables future use without deleting provenance or changing runtime releases.';
CREATE TRIGGER entity_baseline_import_immutable BEFORE UPDATE OR DELETE ON metadata.entity_baseline_import
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE TRIGGER entity_baseline_revocation_immutable BEFORE UPDATE OR DELETE ON metadata.entity_baseline_import_revocation
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
ALTER TABLE metadata.entity_baseline_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_baseline_import FORCE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_baseline_import_revocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_baseline_import_revocation FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_baseline_import_tenant ON metadata.entity_baseline_import
 USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY entity_baseline_revocation_tenant ON metadata.entity_baseline_import_revocation
 USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
REVOKE ALL ON metadata.entity_baseline_import,metadata.entity_baseline_import_revocation FROM PUBLIC;
GRANT SELECT ON metadata.entity_baseline_import,metadata.entity_baseline_import_revocation TO athyperapp;
-- Import is an explicit operator migration; ordinary API principals cannot write it.
GRANT SELECT,INSERT ON metadata.entity_baseline_import,metadata.entity_baseline_import_revocation TO athyperadmin;

-- New, genuinely reviewed Studio releases can refer to an external predecessor.
-- Runtime release numbers belong to the publication key; Studio's own native
-- sequence still starts at one, and no missing native history is invented.
CREATE TABLE publication.entity_baseline_release_link (
 tenant_id uuid NOT NULL,
 publication_release_id uuid PRIMARY KEY REFERENCES publication.release(id),
 entity_release_id uuid NOT NULL UNIQUE,
 baseline_id uuid NOT NULL UNIQUE,
 FOREIGN KEY(tenant_id,entity_release_id) REFERENCES metadata.entity_release(tenant_id,id),
 FOREIGN KEY(tenant_id,baseline_id) REFERENCES metadata.entity_baseline_import(tenant_id,id)
);
CREATE FUNCTION publication.trg_validate_baseline_release_link() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,publication,metadata AS $$
 BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.baseline_id::text,0));
 IF NOT EXISTS(
   SELECT 1 FROM publication.release p JOIN metadata.entity_release e ON e.id=NEW.entity_release_id
   JOIN metadata.entity_change_set cs ON cs.id=e.change_set_id
   JOIN metadata.entity_baseline_import b ON b.id=NEW.baseline_id
   WHERE p.id=NEW.publication_release_id AND p.tenant_id=NEW.tenant_id AND b.tenant_id=p.tenant_id
     AND e.tenant_id=p.tenant_id AND p.release_key=b.publication_key AND p.release_no=b.source_release_no+1
     AND p.release_hash=e.release_hash AND p.release_kind='publish' AND e.release_kind='publish'
     AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
     AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation r WHERE r.baseline_id=b.id)
 ) THEN RAISE EXCEPTION 'BASELINE_RELEASE_COORDINATE_OR_REVIEW_MISMATCH'; END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER entity_baseline_link_guard BEFORE INSERT ON publication.entity_baseline_release_link
 FOR EACH ROW EXECUTE FUNCTION publication.trg_validate_baseline_release_link();
CREATE TRIGGER entity_baseline_link_immutable BEFORE UPDATE OR DELETE ON publication.entity_baseline_release_link
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_ledger_mutation();
CREATE FUNCTION metadata.trg_revoke_unused_baseline() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,metadata,publication AS $$
 BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.baseline_id::text,0));
 PERFORM 1 FROM metadata.entity_baseline_import WHERE id=NEW.baseline_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM publication.entity_baseline_release_link WHERE baseline_id=NEW.baseline_id) THEN
   RAISE EXCEPTION 'Published baseline requires a reviewed runtime rollback, not import revocation';
 END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER entity_baseline_revocation_unused BEFORE INSERT ON metadata.entity_baseline_import_revocation
 FOR EACH ROW EXECUTE FUNCTION metadata.trg_revoke_unused_baseline();
ALTER TABLE publication.entity_baseline_release_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.entity_baseline_release_link FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_baseline_link_tenant ON publication.entity_baseline_release_link
 USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
REVOKE ALL ON publication.entity_baseline_release_link FROM PUBLIC;
GRANT SELECT,INSERT ON publication.entity_baseline_release_link TO athyperapp,athyperadmin;

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

CREATE OR REPLACE FUNCTION publication.fn_initial_baseline_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid,tenant_id uuid,release_key text,release_no bigint,release_kind text,compatibility_level text,minimum_runtime_version text,revision_id uuid,published_at timestamptz,published_by uuid,entity_id uuid,entity_code text,contract_schema_code text,contract_schema_version text,contract_json jsonb,contract_hash text,contract_signature text,signature_algorithm text,contract_signing_key_id text,descriptor_id uuid,plane_key text,compiled_json jsonb,compiled_hash text,created_at timestamptz,imported_baseline jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
SELECT pr.id publication_release_id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind::text,
        pr.compatibility_level::text,pr.minimum_runtime_version,er.revision_id,er.published_at,er.published_by,
        b.source_entity_id AS entity_id,b.entity_code,b.payload->'source'->'contract'->>'contract_schema_code' AS contract_schema_code,
        b.payload->'source'->'contract'->>'contract_schema_version' AS contract_schema_version,
        b.payload->'source'->'contract'->'contract_json' AS contract_json,
        er.contract_hash,er.contract_signature,er.signature_algorithm,er.signing_key_id AS contract_signing_key_id,
        a.id AS descriptor_id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at,
        jsonb_build_object('baselineImportId',b.id,'contentHash',b.content_hash,'appliedReleaseId',b.payload->'source'->'head'->>'applied_release_id',
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

-- The API may confirm an acknowledged native publication, never emit arbitrary events.
CREATE OR REPLACE FUNCTION publication.fn_confirm_metadata_activation(p_release_id uuid,p_plane text,p_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,shared AS $$
DECLARE v_release record; v_actor uuid:=NULLIF(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
 SELECT r.tenant_id,e.entity_code,pr.release_no INTO v_release
 FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
 JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.tenant_id=r.tenant_id
 JOIN publication.release pr ON pr.id=r.id AND pr.tenant_id=r.tenant_id
 WHERE r.id=p_release_id AND r.tenant_id=shared.current_tenant_id() AND v_actor IS NOT NULL
 AND p_plane=ANY(r.target_planes) AND cs.status='published'
 AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
 AND EXISTS(SELECT 1 FROM publication.artifact a JOIN publication.deployment d ON d.artifact_id=a.id
   WHERE a.publication_release_id=pr.id AND a.status='signed' AND d.target_plane::text=p_plane AND d.status='activated');
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_ACTIVATION_ACKNOWLEDGEMENT_REQUIRED' USING ERRCODE='insufficient_privilege'; END IF;
 RETURN publication.fn_emit_outbox(v_release.tenant_id,'metadata.generation.advanced',p_event_id::text,'metadata.entity_release',p_release_id,v_actor,NULL,
   jsonb_build_object('eventId',p_event_id,'planeKey',p_plane,'tenantId',v_release.tenant_id,'entityCode',v_release.entity_code,'generation',v_release.release_no,'releaseId',p_release_id));
END; $$;
REVOKE ALL ON FUNCTION publication.fn_confirm_metadata_activation(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_confirm_metadata_activation(uuid,text,uuid) TO athyperapp;

-- The ledger's tenant owns the observation, not the global runtime source.
ALTER TABLE metadata.entity_baseline_import DROP CONSTRAINT entity_baseline_import_source_plane_check;
ALTER TABLE metadata.entity_baseline_import DROP CONSTRAINT entity_baseline_import_payload_check1;
ALTER TABLE metadata.entity_baseline_import ADD CONSTRAINT entity_baseline_import_source_scope_check CHECK ((
 (payload->>'schema'='athyper.imported-entity-baseline/1' AND source_plane='neon')
 OR
 (payload->>'schema'='athyper.imported-global-entity-baseline/1' AND source_plane='mesh'
  AND entity_code='network_relationship'
  AND payload->'sourceTenantId'='null'::jsonb
  AND payload#>'{source,contract,tenant_id}'='null'::jsonb
  AND payload#>'{source,descriptor,tenant_id}'='null'::jsonb
  AND payload#>>'{source,contract,publication_key}'=publication_key
  AND payload#>>'{source,contract,entity_id}'=source_entity_id::text
  AND payload#>>'{source,descriptor,plane_code}'='mesh'
  AND payload#>>'{provenance,kind}'='observed_global_runtime_import')
) IS TRUE);
-- A global observation must never enter the legacy same-key Neon successor
-- bridge. Tenant fork publication needs its own independently reviewed contract.
CREATE FUNCTION publication.trg_guard_global_baseline_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,metadata AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM metadata.entity_baseline_import WHERE id=NEW.baseline_id
   AND payload->>'schema'='athyper.imported-global-entity-baseline/1') THEN
   RAISE EXCEPTION 'GLOBAL_BASELINE_REQUIRES_TENANT_FORK_PUBLICATION';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER entity_baseline_global_link_guard BEFORE INSERT ON publication.entity_baseline_release_link
 FOR EACH ROW EXECUTE FUNCTION publication.trg_guard_global_baseline_link();

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
