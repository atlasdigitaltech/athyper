CREATE OR REPLACE FUNCTION publication.fn_emit_outbox(
    p_tenant_id uuid, p_topic text, p_event_key text, p_aggregate_type text,
    p_aggregate_id uuid, p_actor_id uuid, p_correlation_id uuid, p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,event,publication
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,aggregate_type,aggregate_id,
    actor_id,source,correlation_id,partition_key,payload,created_by)
  VALUES(p_tenant_id,p_topic,p_topic,p_event_key,p_aggregate_type,p_aggregate_id,
    p_actor_id,'publication',p_correlation_id,p_tenant_id::text,COALESCE(p_payload,'{}'::jsonb),p_actor_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION publication.fn_transition_release(
    p_release_id uuid, p_to_status publication.release_status_d, p_actor_id uuid,
    p_correlation_id uuid DEFAULT NULL, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS publication.release
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,publication,event
AS $$
DECLARE v_row publication.release%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM publication.release WHERE id=p_release_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLICATION_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF v_row.status=p_to_status THEN RETURN v_row; END IF;
  IF NOT ((v_row.status='preparing' AND p_to_status IN ('approved','withdrawn')) OR
          (v_row.status='approved' AND p_to_status IN ('published','withdrawn')) OR
          (v_row.status='published' AND p_to_status='withdrawn')) THEN
    RAISE EXCEPTION 'INVALID_RELEASE_TRANSITION: % -> %',v_row.status,p_to_status USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
  IF p_to_status='published' AND NOT EXISTS (
    SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=v_row.id AND a.status='signed'
  ) THEN RAISE EXCEPTION 'SIGNED_ARTIFACT_REQUIRED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  UPDATE publication.release SET status=p_to_status,
    approved_at=CASE WHEN p_to_status='approved' THEN clock_timestamp() ELSE approved_at END,
    approved_by=CASE WHEN p_to_status='approved' THEN p_actor_id ELSE approved_by END,
    published_at=CASE WHEN p_to_status='published' THEN clock_timestamp() ELSE published_at END,
    published_by=CASE WHEN p_to_status='published' THEN p_actor_id ELSE published_by END,
    withdrawn_at=CASE WHEN p_to_status='withdrawn' THEN clock_timestamp() ELSE withdrawn_at END,
    withdrawn_by=CASE WHEN p_to_status='withdrawn' THEN p_actor_id ELSE withdrawn_by END
  WHERE id=v_row.id RETURNING * INTO v_row;
  IF p_to_status='published' THEN
    PERFORM publication.fn_emit_outbox(v_row.tenant_id,'publication.release.published',v_row.id::text,
      'publication.release',v_row.id,p_actor_id,p_correlation_id,
      jsonb_build_object('releaseId',v_row.id,'publicationKey',v_row.release_key,'releaseNo',v_row.release_no));
  END IF;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION publication.fn_transition_artifact(
    p_artifact_id uuid, p_to_status publication.artifact_status_d,
    p_signature_algorithm text DEFAULT NULL, p_signing_key_id text DEFAULT NULL, p_signature text DEFAULT NULL
) RETURNS publication.artifact
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication
AS $$
DECLARE v_row publication.artifact%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM publication.artifact WHERE id=p_artifact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLICATION_ARTIFACT_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF v_row.status=p_to_status THEN
    IF p_to_status='signed' AND (v_row.signature_algorithm IS DISTINCT FROM p_signature_algorithm OR v_row.signing_key_id IS DISTINCT FROM p_signing_key_id OR v_row.signature IS DISTINCT FROM p_signature) THEN
      RAISE EXCEPTION 'ARTIFACT_SIGNING_CONFLICT' USING ERRCODE='unique_violation';
    END IF;
    RETURN v_row;
  END IF;
  IF NOT ((v_row.status='compiled' AND p_to_status='validated') OR
          (v_row.status='validated' AND p_to_status='signed') OR
          (v_row.status='signed' AND p_to_status='withdrawn')) THEN
    RAISE EXCEPTION 'INVALID_ARTIFACT_TRANSITION: % -> %',v_row.status,p_to_status USING ERRCODE='object_not_in_prerequisite_state';
  END IF;
  IF p_to_status='signed' AND (NULLIF(btrim(p_signature_algorithm),'') IS NULL OR NULLIF(btrim(p_signing_key_id),'') IS NULL OR NULLIF(btrim(p_signature),'') IS NULL) THEN
    RAISE EXCEPTION 'ARTIFACT_SIGNATURE_REQUIRED' USING ERRCODE='not_null_violation';
  END IF;
  UPDATE publication.artifact SET status=p_to_status,
    validated_at=CASE WHEN p_to_status='validated' THEN clock_timestamp() ELSE validated_at END,
    signature_algorithm=CASE WHEN p_to_status='signed' THEN p_signature_algorithm ELSE signature_algorithm END,
    signing_key_id=CASE WHEN p_to_status='signed' THEN p_signing_key_id ELSE signing_key_id END,
    signature=CASE WHEN p_to_status='signed' THEN p_signature ELSE signature END,
    signed_at=CASE WHEN p_to_status='signed' THEN clock_timestamp() ELSE signed_at END
  WHERE id=v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION publication.fn_create_deployment(
    p_command_id uuid,p_artifact_id uuid,p_target_plane text,p_target_environment text,
    p_target_instance text,p_attempt_no integer,p_correlation_id uuid,p_actor_id uuid
) RETURNS publication.deployment
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,event
AS $$
DECLARE v_row publication.deployment%ROWTYPE; v_release publication.release%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM publication.deployment WHERE command_id=p_command_id;
  IF FOUND THEN
    IF v_row.artifact_id<>p_artifact_id OR v_row.target_plane<>p_target_plane OR v_row.target_environment<>p_target_environment OR v_row.target_instance<>p_target_instance OR v_row.attempt_no<>p_attempt_no THEN
      RAISE EXCEPTION 'DEPLOYMENT_COMMAND_CONFLICT' USING ERRCODE='unique_violation';
    END IF;
    RETURN v_row;
  END IF;
  SELECT r.* INTO v_release FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE a.id=p_artifact_id AND a.status='signed';
  IF NOT FOUND THEN RAISE EXCEPTION 'SIGNED_ARTIFACT_NOT_FOUND' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  INSERT INTO publication.deployment(command_id,artifact_id,target_plane,target_environment,target_instance,attempt_no,correlation_id,created_by)
  VALUES(p_command_id,p_artifact_id,p_target_plane,p_target_environment,p_target_instance,p_attempt_no,p_correlation_id,p_actor_id)
  ON CONFLICT(command_id) DO NOTHING RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO STRICT v_row FROM publication.deployment WHERE command_id=p_command_id;
    IF v_row.artifact_id<>p_artifact_id OR v_row.target_plane<>p_target_plane OR v_row.target_environment<>p_target_environment OR v_row.target_instance<>p_target_instance OR v_row.attempt_no<>p_attempt_no THEN
      RAISE EXCEPTION 'DEPLOYMENT_COMMAND_CONFLICT' USING ERRCODE='unique_violation';
    END IF;
    RETURN v_row;
  END IF;
  INSERT INTO publication.deployment_event(deployment_id,from_status,to_status,evidence) VALUES(v_row.id,NULL,'pending',jsonb_build_object('commandId',p_command_id));
  PERFORM publication.fn_emit_outbox(v_release.tenant_id,'publication.deployment.requested',v_row.id::text,
    'publication.deployment',v_row.id,p_actor_id,p_correlation_id,
    jsonb_build_object('deploymentId',v_row.id,'releaseId',v_release.id,'targetPlane',v_row.target_plane,'attempt',v_row.attempt_no));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION publication.fn_transition_deployment(
    p_deployment_id uuid,p_to_status publication.deployment_status_d,p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS publication.deployment
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,event
AS $$
DECLARE v_row publication.deployment%ROWTYPE; v_release publication.release%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM publication.deployment WHERE id=p_deployment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEPLOYMENT_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF v_row.status=p_to_status THEN RETURN v_row; END IF;
  IF NOT ((v_row.status='pending' AND p_to_status IN ('dispatched','failed')) OR (v_row.status='dispatched' AND p_to_status IN ('received','failed')) OR
    (v_row.status='received' AND p_to_status IN ('staged','failed')) OR (v_row.status='staged' AND p_to_status IN ('verified','failed')) OR
    (v_row.status='verified' AND p_to_status IN ('activated','failed')) OR (v_row.status='activated' AND p_to_status='rolled_back')) THEN
    RAISE EXCEPTION 'INVALID_DEPLOYMENT_TRANSITION: % -> %',v_row.status,p_to_status USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  INSERT INTO publication.deployment_event(deployment_id,from_status,to_status,evidence) VALUES(v_row.id,v_row.status,p_to_status,COALESCE(p_evidence,'{}'::jsonb));
  UPDATE publication.deployment SET status=p_to_status,
    dispatched_at=CASE WHEN p_to_status='dispatched' THEN clock_timestamp() ELSE dispatched_at END,
    received_at=CASE WHEN p_to_status='received' THEN clock_timestamp() ELSE received_at END,
    staged_at=CASE WHEN p_to_status='staged' THEN clock_timestamp() ELSE staged_at END,
    verified_at=CASE WHEN p_to_status='verified' THEN clock_timestamp() ELSE verified_at END,
    activated_at=CASE WHEN p_to_status='activated' THEN clock_timestamp() ELSE activated_at END,
    failed_at=CASE WHEN p_to_status='failed' THEN clock_timestamp() ELSE failed_at END,
    failure_code=CASE WHEN p_to_status='failed' THEN NULLIF(p_evidence->>'code','') ELSE failure_code END,
    failure_detail=CASE WHEN p_to_status='failed' THEN NULLIF(p_evidence->>'detail','') ELSE failure_detail END
  WHERE id=v_row.id RETURNING * INTO v_row;
  SELECT r.* INTO STRICT v_release FROM publication.artifact a
    JOIN publication.release r ON r.id=a.publication_release_id
   WHERE a.id=v_row.artifact_id;
  PERFORM publication.fn_emit_outbox(
    v_release.tenant_id,
    CASE p_to_status
      WHEN 'dispatched' THEN 'publication.deployment.dispatched'
      WHEN 'received' THEN 'publication.deployment.received'
      WHEN 'staged' THEN 'publication.deployment.staged'
      WHEN 'verified' THEN 'publication.deployment.verified'
      WHEN 'activated' THEN 'publication.deployment.activated'
      WHEN 'failed' THEN 'publication.deployment.failed'
      WHEN 'rolled_back' THEN 'publication.deployment.rolled_back'
    END,
    format('%s:%s',v_row.id,p_to_status),
    'publication.deployment',v_row.id,v_row.created_by,v_row.correlation_id,
    jsonb_strip_nulls(jsonb_build_object(
      'deploymentId',v_row.id,
      'releaseId',v_release.id,
      'targetPlane',v_row.target_plane,
      'status',p_to_status,
      'attempt',v_row.attempt_no,
      'failureCode',v_row.failure_code
    ))
  );
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION publication.fn_acknowledge_activation(
    p_deployment_id uuid,p_target_instance text,p_active_release_hash text,
    p_local_applied_release_id uuid,p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS publication.deployment_acknowledgement
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,event
AS $$
DECLARE v_deployment publication.deployment%ROWTYPE; v_artifact publication.artifact%ROWTYPE; v_release publication.release%ROWTYPE; v_ack publication.deployment_acknowledgement%ROWTYPE;
BEGIN
  SELECT * INTO v_deployment FROM publication.deployment WHERE id=p_deployment_id AND status='activated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEPLOYMENT_NOT_ACTIVATED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  SELECT * INTO STRICT v_artifact FROM publication.artifact WHERE id=v_deployment.artifact_id;
  IF v_artifact.content_hash<>p_active_release_hash THEN RAISE EXCEPTION 'ACKNOWLEDGEMENT_CONFLICT' USING ERRCODE='unique_violation'; END IF;
  SELECT * INTO v_ack FROM publication.deployment_acknowledgement WHERE deployment_id=p_deployment_id AND target_instance=p_target_instance;
  IF FOUND THEN
    IF v_ack.active_release_hash<>p_active_release_hash OR v_ack.local_applied_release_id<>p_local_applied_release_id THEN RAISE EXCEPTION 'ACKNOWLEDGEMENT_CONFLICT' USING ERRCODE='unique_violation'; END IF;
    RETURN v_ack;
  END IF;
  INSERT INTO publication.deployment_acknowledgement(deployment_id,target_instance,active_release_hash,local_applied_release_id,acknowledged_by,evidence)
  VALUES(p_deployment_id,p_target_instance,p_active_release_hash,p_local_applied_release_id,session_user,COALESCE(p_evidence,'{}'::jsonb)) RETURNING * INTO v_ack;
  SELECT r.* INTO STRICT v_release FROM publication.release r WHERE r.id=v_artifact.publication_release_id;
  PERFORM publication.fn_emit_outbox(v_release.tenant_id,'publication.deployment.acknowledged',v_ack.id::text,
    'publication.deployment',v_deployment.id,v_deployment.created_by,v_deployment.correlation_id,
    jsonb_build_object('deploymentId',v_deployment.id,'acknowledgementId',v_ack.id,'targetPlane',v_deployment.target_plane,'targetInstance',v_ack.target_instance));
  RETURN v_ack;
END; $$;

CREATE OR REPLACE FUNCTION publication.trg_guard_ledger_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME USING ERRCODE='integrity_constraint_violation'; END; $$;

CREATE OR REPLACE FUNCTION publication.trg_validate_entity_release_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,publication,metadata AS $$
DECLARE v_publication publication.release%ROWTYPE; v_entity metadata.entity_release%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_publication FROM publication.release WHERE id=NEW.publication_release_id;
  SELECT * INTO STRICT v_entity FROM metadata.entity_release WHERE id=NEW.entity_release_id;
  IF v_publication.tenant_id IS DISTINCT FROM v_entity.tenant_id OR v_publication.release_no<>v_entity.release_no OR v_publication.release_hash<>v_entity.release_hash OR v_publication.release_kind::text<>v_entity.release_kind::text THEN
    RAISE EXCEPTION 'ENTITY_PUBLICATION_COORDINATE_MISMATCH' USING ERRCODE='foreign_key_violation'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION publication.trg_validate_business_partner_definition_release_link()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,publication,snapshot AS $$
DECLARE v_publication publication.release%ROWTYPE; v_revision snapshot.business_partner_definition_revision%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_publication FROM publication.release WHERE id=NEW.publication_release_id;
  SELECT * INTO STRICT v_revision FROM snapshot.business_partner_definition_revision WHERE id=NEW.definition_revision_id;
  IF v_publication.tenant_id IS DISTINCT FROM v_revision.tenant_id
     OR v_publication.release_hash IS DISTINCT FROM v_revision.bundle_hash
     OR v_publication.release_key IS DISTINCT FROM ('studio.business_partner.definition.'||v_revision.bundle_code) THEN
    RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_PUBLICATION_COORDINATE_MISMATCH' USING ERRCODE='foreign_key_violation';
  END IF;
  IF v_publication.created_by=v_revision.created_by THEN
    RAISE EXCEPTION 'BUSINESS_PARTNER_DEFINITION_SELF_PUBLISH_FORBIDDEN' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION publication.trg_validate_deployment_target() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,publication AS $$
DECLARE v_plane text;
BEGIN SELECT plane_code INTO STRICT v_plane FROM publication.artifact WHERE id=NEW.artifact_id;
  IF v_plane<>NEW.target_plane THEN RAISE EXCEPTION 'DEPLOYMENT_ARTIFACT_PLANE_MISMATCH' USING ERRCODE='foreign_key_violation'; END IF; RETURN NEW;
END; $$;

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
