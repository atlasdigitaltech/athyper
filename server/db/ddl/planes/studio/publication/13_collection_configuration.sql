-- Collection-only native drafts reuse the reviewed publication ledger and per-plane runtime heads.
CREATE OR REPLACE FUNCTION publication.fn_prepare_collection_configuration_release(p_release_id uuid,p_descriptor jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r record; g jsonb; branch text; expected jsonb; config jsonb; collection_key text; release_key_value text; plane text; existing record; target_list text[];
BEGIN
 SELECT er.*,e.entity_code,e.entity_class,c.approved_by,c.created_by author_id,c.submitted_by,s.contract_json INTO STRICT r
 FROM metadata.entity_release er JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id=er.tenant_id
 JOIN metadata.entity_change_set c ON c.id=er.change_set_id AND c.tenant_id=er.tenant_id
 JOIN snapshot.entity_contract_revision s ON s.id=er.revision_id AND s.tenant_id=er.tenant_id
 WHERE er.id=p_release_id AND er.tenant_id=shared.current_tenant_id() AND er.published_by=master.current_principal_id_soft()
 AND c.status IN ('approved','published') AND c.approved_by IS NOT NULL AND c.submitted_by IS NOT NULL
 AND c.approved_by<>c.created_by AND c.approved_by<>c.submitted_by;
 IF r.release_kind<>'publish' OR r.contract_signature IS NULL OR r.signature_algorithm IS DISTINCT FROM 'Ed25519' OR r.entity_class IS DISTINCT FROM 'configuration' THEN RAISE EXCEPTION 'COLLECTION_REVIEW_REQUIRED'; END IF;
 g:=r.contract_json;
 FOR branch IN SELECT jsonb_object_keys(g) LOOP
  IF jsonb_typeof(g->branch)='array' AND branch NOT IN ('surfaces','runtimeProfiles','tests') AND jsonb_array_length(g->branch)>0 THEN RAISE EXCEPTION 'COLLECTION_ONLY_DRAFT_REQUIRED'; END IF;
 END LOOP;
 IF jsonb_array_length(g->'runtimeProfiles') IS DISTINCT FROM 1 OR g#>>'{runtimeProfiles,0,backingKind}' IS DISTINCT FROM 'virtual'
 OR g#>>'{runtimeProfiles,0,apiExposure}' IS DISTINCT FROM 'catalog_only' OR g#>>'{runtimeProfiles,0,readMode}' IS DISTINCT FROM 'none'
 OR g#>>'{runtimeProfiles,0,writeMode}' IS DISTINCT FROM 'none' OR jsonb_array_length(g->'surfaces') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'COLLECTION_ONLY_DRAFT_REQUIRED'; END IF;
 config:=g#>'{surfaces,0,layoutConfig,collectionConfiguration}';collection_key:=config->>'collectionKey';
 IF config->>'schema' IS DISTINCT FROM 'athyper.collection-presentation/1' OR collection_key IS NULL OR collection_key NOT IN ('activity.notifications','activity.inbox') THEN RAISE EXCEPTION 'COLLECTION_SCHEMA_INVALID'; END IF;
 SELECT array_agg(value ORDER BY value) INTO target_list FROM jsonb_array_elements_text(config->'targetPlanes');
 IF target_list IS NULL OR cardinality(target_list)=0 OR NOT target_list <@ ARRAY['neon','mesh','studio']::text[] OR target_list IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(r.target_planes) x) THEN RAISE EXCEPTION 'COLLECTION_TARGET_MISMATCH'; END IF;
 expected:=jsonb_build_object('schema','athyper.published-collection/1','sourceEntityCode',r.entity_code,'configuration',config);
 IF p_descriptor IS DISTINCT FROM expected THEN RAISE EXCEPTION 'COLLECTION_SOURCE_MISMATCH'; END IF;
 release_key_value:='metadata.collection.'||collection_key||'.'||replace(r.tenant_id::text,'-','');
 PERFORM pg_advisory_xact_lock(hashtextextended(release_key_value,0));
 IF EXISTS(SELECT 1 FROM snapshot.entity_release_artifact a WHERE a.entity_id=r.entity_id AND a.tenant_id=r.tenant_id AND a.compiled_json->>'schema'='athyper.published-collection/1' AND a.compiled_json#>>'{configuration,collectionKey}' IS DISTINCT FROM collection_key) THEN RAISE EXCEPTION 'COLLECTION_IDENTITY_IMMUTABLE'; END IF;
 IF EXISTS(SELECT 1 FROM publication.release p JOIN publication.entity_release_link l ON l.publication_release_id=p.id JOIN metadata.entity_release er ON er.id=l.entity_release_id WHERE p.release_key=release_key_value AND er.entity_id<>r.entity_id) THEN RAISE EXCEPTION 'COLLECTION_ALREADY_CONFIGURED'; END IF;
 SELECT p.release_key INTO existing FROM publication.entity_release_link l JOIN publication.release p ON p.id=l.publication_release_id WHERE l.publication_release_id=p_release_id;
 IF FOUND THEN
  IF existing.release_key<>release_key_value OR (SELECT count(*) FROM snapshot.entity_release_artifact a WHERE a.source_release_id=p_release_id AND a.compiled_json=expected AND a.plane_key=ANY(target_list))<>cardinality(target_list) THEN RAISE EXCEPTION 'COLLECTION_RELEASE_CONFLICT'; END IF;
  RETURN;
 END IF;
 FOREACH plane IN ARRAY target_list LOOP
  INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
  VALUES(r.tenant_id,p_release_id,r.revision_id,r.entity_id,plane,r.release_hash,r.contract_hash,expected,snapshot.fn_compute_entity_release_artifact_hash(p_release_id,r.revision_id,r.entity_id,plane,r.release_hash,r.contract_hash,expected),'{"schema":"collection-configuration/1","sourceChecked":true}'::jsonb,r.published_by);
 END LOOP;
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
 VALUES(p_release_id,r.tenant_id,release_key_value,r.release_no,'publish','preparing','backward_compatible',r.release_hash,r.release_hash,r.published_by,'{"schema":"collection-configuration/1"}'::jsonb);
 INSERT INTO publication.entity_release_link(publication_release_id,entity_release_id) VALUES(p_release_id,p_release_id);
 PERFORM publication.fn_transition_release(p_release_id,'approved',r.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','changeSetId',r.change_set_id));
END $$;
REVOKE ALL ON FUNCTION publication.fn_prepare_collection_configuration_release(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_prepare_collection_configuration_release(uuid,jsonb) TO athyper_publication_service;

CREATE OR REPLACE FUNCTION publication.fn_collection_configuration_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid,tenant_id uuid,release_key text,release_no bigint,release_kind text,compatibility_level text,minimum_runtime_version text,release_hash text,revision_id uuid,contract_schema_code text,contract_schema_version text,contract_hash text,contract_signature text,signature_algorithm text,contract_signing_key_id text,published_at timestamptz,published_by uuid,entity_id uuid,entity_code text,contract_json jsonb,descriptor_id uuid,plane_key text,compiled_json jsonb,compiled_hash text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
 SELECT pr.id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind::text,pr.compatibility_level::text,pr.minimum_runtime_version,
 er.release_hash,er.revision_id,er.contract_schema_code,er.contract_schema_version,er.contract_hash,er.contract_signature,
 er.signature_algorithm,er.signing_key_id,er.published_at,er.published_by,e.id,e.entity_code,r.contract_json,
 a.id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at
 FROM publication.release pr JOIN publication.entity_release_link l ON l.publication_release_id=pr.id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id=pr.tenant_id
 JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id=er.tenant_id
 JOIN snapshot.entity_contract_revision r ON r.id=er.revision_id AND r.tenant_id=er.tenant_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id
 WHERE pr.id=p_release_id AND pr.tenant_id=shared.current_tenant_id() AND pr.status IN ('approved','published')
 AND e.entity_class='configuration' AND a.plane_key=ANY(er.target_planes) AND a.compiled_json->>'schema'='athyper.published-collection/1'
 AND pr.release_key='metadata.collection.'||(a.compiled_json#>>'{configuration,collectionKey}')||'.'||replace(pr.tenant_id::text,'-','');
$$;
REVOKE ALL ON FUNCTION publication.fn_collection_configuration_compilation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_collection_configuration_compilation_source(uuid) TO athyper_publication_service;
