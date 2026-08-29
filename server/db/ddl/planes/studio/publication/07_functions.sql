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
