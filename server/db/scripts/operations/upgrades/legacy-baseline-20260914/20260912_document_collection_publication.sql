BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION publication.fn_prepare_document_collection_release(p_release_id uuid,p_descriptor jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,publication,metadata,snapshot,shared,master AS $$
DECLARE r record; g jsonb; layout jsonb; branch text; lhs jsonb; rhs jsonb; release_key_value text; link record; list_surface jsonb; columns_json jsonb; expected_presentation jsonb;
BEGIN
 SELECT er.*,e.entity_code,c.approved_by,c.created_by author_id,c.submitted_by,s.contract_json INTO STRICT r
 FROM metadata.entity_release er JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id=er.tenant_id
 JOIN metadata.entity_change_set c ON c.id=er.change_set_id AND c.tenant_id=er.tenant_id
 JOIN snapshot.entity_contract_revision s ON s.id=er.revision_id AND s.tenant_id=er.tenant_id
 WHERE er.id=p_release_id AND er.tenant_id=shared.current_tenant_id() AND er.published_by=master.current_principal_id_soft()
 AND c.status IN ('approved','published') AND c.approved_by IS NOT NULL AND c.submitted_by IS NOT NULL
 AND c.approved_by<>c.created_by AND c.approved_by<>c.submitted_by;
 IF r.entity_code<>'business_partner_request' OR r.release_kind<>'publish' OR r.target_planes IS DISTINCT FROM ARRAY['neon']::text[]
 OR r.contract_signature IS NULL OR r.signature_algorithm IS DISTINCT FROM 'Ed25519' THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_REVIEW_REQUIRED';END IF;
 g:=r.contract_json;
 IF jsonb_typeof(p_descriptor) IS DISTINCT FROM 'object' OR p_descriptor->'entity' IS DISTINCT FROM g->'entity'
 OR p_descriptor-ARRAY['entity','fields','keys','keyFields','searchProfiles','searchFields','relations','relationTargets','relationFields','operations','operationPermissions','operationRules','operationScopeBindings','surfaces','surfaceSections','surfaceFieldBindings','surfaceOperations','flows','flowSteps','lifecycleBindings','lifecycleOperationBindings','policyBindings','fieldPolicyBindings','numberingBindings','classProfiles','runtimeProfiles','authorization','collectionRelationship','listPresentation']<>'{}'::jsonb THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_SOURCE_MISMATCH';END IF;
 FOREACH branch IN ARRAY ARRAY['fields','keys','keyFields','searchProfiles','searchFields','relations','relationTargets','relationFields','operations','operationPermissions','operationRules','operationScopeBindings','surfaces','surfaceSections','surfaceFieldBindings','surfaceOperations','flows','flowSteps','lifecycleBindings','lifecycleOperationBindings','policyBindings','fieldPolicyBindings','numberingBindings','classProfiles','runtimeProfiles'] LOOP
  IF jsonb_typeof(p_descriptor->branch) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_BRANCH_INVALID';END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) INTO lhs FROM jsonb_array_elements(p_descriptor->branch);
  SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) INTO rhs FROM jsonb_array_elements(coalesce(g->branch,'[]'::jsonb));
  IF lhs IS DISTINCT FROM rhs THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_SOURCE_MISMATCH: %',branch;END IF;
 END LOOP;
 SELECT s->'layoutConfig' INTO STRICT layout FROM jsonb_array_elements(g->'surfaces') s WHERE s->'layoutConfig' ? 'collectionRelationship' AND coalesce(s->>'status','active')<>'deprecated';
 IF p_descriptor->'authorization' IS DISTINCT FROM layout->'authorization' OR p_descriptor->'collectionRelationship' IS DISTINCT FROM layout->'collectionRelationship'
 OR layout->'collectionRelationship'->'subject'->>'value' IS DISTINCT FROM 'master.business_partner'
 OR layout->'collectionRelationship'->'scope'->>'contextRef' IS DISTINCT FROM 'operatingOrganizationId' THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_POLICY_MISMATCH';END IF;
 -- This adapter supports the reviewed simple read-only collection presentation.
 -- Future layout features require compiler/adapter support, not unchecked JSON.
 SELECT value INTO STRICT list_surface FROM jsonb_array_elements(g->'surfaces')
 WHERE value->>'surfaceKind'='list' AND value->>'status' IS DISTINCT FROM 'deprecated';
 IF layout - ARRAY['authorization','collectionRelationship','defaultState','supportedModes'] <> '{}'::jsonb
 OR coalesce(layout->'defaultState','{}'::jsonb)-ARRAY['sort'] <> '{}'::jsonb
 OR coalesce(g->'surfaceOperations','[]'::jsonb)<>'[]'::jsonb
 OR coalesce(g->'searchProfiles','[]'::jsonb)<>'[]'::jsonb
 OR list_surface ? 'description' THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_PRESENTATION_UNSUPPORTED'; END IF;
 SELECT coalesce(jsonb_agg(f->>'fieldKey' ORDER BY (b->>'position')::integer,b->>'bindingKey'),'[]'::jsonb)
 INTO columns_json FROM jsonb_array_elements(g->'surfaceFieldBindings') b
 JOIN jsonb_array_elements(g->'fields') f ON f->>'id'=b->>'entityFieldId'
 WHERE b->>'entitySurfaceId'=list_surface->>'id' AND b->>'status' IS DISTINCT FROM 'deprecated'
 AND b->'displayConfig'->'defaultVisible' IS DISTINCT FROM 'false'::jsonb;
 expected_presentation:=jsonb_build_object('schemaVersion',1,'title',list_surface->>'title',
 'identityField',columns_json->>0,'supportedModes',layout->'supportedModes',
 'defaultState',coalesce(layout->'defaultState','{}'::jsonb)||jsonb_build_object('columns',columns_json,'density','comfortable','mode',layout->'supportedModes'->>0),
 'search',jsonb_build_object('minimumQueryLength',1),
 'limits',jsonb_build_object('defaultPageSize',25,'allowedPageSizes',jsonb_build_array(25,50,100),'maxSortLevels',3,'countMode','none'),
 'experience',jsonb_build_object('schemaVersion',1,'header',jsonb_build_object('title',jsonb_build_object('defaultLocale','en','values',jsonb_build_object('en',list_surface->>'title'))),'actions','[]'::jsonb,'routes','[]'::jsonb));
 IF p_descriptor->'listPresentation' IS DISTINCT FROM expected_presentation THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_PRESENTATION_MISMATCH'; END IF;
 release_key_value:='metadata.entity.business_partner_request.'||replace(r.tenant_id::text,'-','');
 PERFORM pg_advisory_xact_lock(hashtextextended(release_key_value,0));
 SELECT l.entity_release_id,p.release_key,a.compiled_json INTO link FROM publication.entity_release_link l
 JOIN publication.release p ON p.id=l.publication_release_id JOIN snapshot.entity_release_artifact a ON a.source_release_id=l.entity_release_id AND a.plane_key='neon'
 WHERE l.publication_release_id=p_release_id;
 IF FOUND THEN
  IF link.entity_release_id<>p_release_id OR link.release_key<>release_key_value OR link.compiled_json IS DISTINCT FROM p_descriptor THEN RAISE EXCEPTION 'DOCUMENT_COLLECTION_RELEASE_CONFLICT';END IF;
  RETURN;
 END IF;
 INSERT INTO snapshot.entity_release_artifact(tenant_id,source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json,compiled_hash,compliance_report,created_by)
 VALUES(r.tenant_id,p_release_id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,p_descriptor,snapshot.fn_compute_entity_release_artifact_hash(p_release_id,r.revision_id,r.entity_id,'neon',r.release_hash,r.contract_hash,p_descriptor),' {"schema":"registered-document-collection/1","sourceChecked":true}'::jsonb,r.published_by);
 INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,created_by,metadata)
 VALUES(p_release_id,r.tenant_id,release_key_value,r.release_no,'publish','preparing','backward_compatible',r.release_hash,r.release_hash,r.published_by,'{"schema":"registered-document-collection/1"}'::jsonb);
 INSERT INTO publication.entity_release_link(publication_release_id,entity_release_id) VALUES(p_release_id,p_release_id);
 PERFORM publication.fn_transition_release(p_release_id,'approved',r.approved_by,NULL::uuid,jsonb_build_object('review','meta-entity-change-set','changeSetId',r.change_set_id));
END $$;
REVOKE ALL ON FUNCTION publication.fn_prepare_document_collection_release(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_prepare_document_collection_release(uuid,jsonb) TO athyper_publication_service;
COMMIT;
