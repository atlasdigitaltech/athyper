CREATE OR REPLACE FUNCTION publication.fn_transition_deployment(
    p_deployment_id uuid,
    p_to_status publication.deployment_status_d,
    p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS publication.deployment
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, publication
AS $$
DECLARE v_row publication.deployment%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM publication.deployment WHERE id = p_deployment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEPLOYMENT_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF NOT (
        (v_row.status='pending' AND p_to_status IN ('dispatched','failed')) OR
        (v_row.status='dispatched' AND p_to_status IN ('received','failed')) OR
        (v_row.status='received' AND p_to_status IN ('staged','failed')) OR
        (v_row.status='staged' AND p_to_status IN ('verified','failed')) OR
        (v_row.status='verified' AND p_to_status IN ('activated','failed')) OR
        (v_row.status='activated' AND p_to_status='rolled_back')
    ) THEN RAISE EXCEPTION 'INVALID_DEPLOYMENT_TRANSITION: % -> %', v_row.status, p_to_status USING ERRCODE='object_not_in_prerequisite_state'; END IF;

    INSERT INTO publication.deployment_event(deployment_id,from_status,to_status,evidence)
    VALUES (v_row.id,v_row.status,p_to_status,COALESCE(p_evidence,'{}'::jsonb));
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
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION publication.fn_acknowledge_activation(
    p_deployment_id uuid, p_target_instance text, p_active_release_hash text,
    p_local_applied_release_id uuid, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS publication.deployment_acknowledgement
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, publication
AS $$
DECLARE v_deployment publication.deployment%ROWTYPE; v_artifact publication.artifact%ROWTYPE; v_ack publication.deployment_acknowledgement%ROWTYPE;
BEGIN
    SELECT * INTO v_deployment FROM publication.deployment WHERE id=p_deployment_id AND status='activated';
    IF NOT FOUND THEN RAISE EXCEPTION 'DEPLOYMENT_NOT_ACTIVATED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    SELECT * INTO STRICT v_artifact FROM publication.artifact WHERE id=v_deployment.artifact_id;
    IF v_artifact.content_hash <> p_active_release_hash THEN RAISE EXCEPTION 'ACKNOWLEDGEMENT_HASH_MISMATCH' USING ERRCODE='data_exception'; END IF;
    INSERT INTO publication.deployment_acknowledgement(deployment_id,target_instance,active_release_hash,local_applied_release_id,acknowledged_by,evidence)
    VALUES(p_deployment_id,p_target_instance,p_active_release_hash,p_local_applied_release_id,session_user,COALESCE(p_evidence,'{}'::jsonb))
    ON CONFLICT (deployment_id,target_instance) DO UPDATE SET
      active_release_hash=EXCLUDED.active_release_hash, local_applied_release_id=EXCLUDED.local_applied_release_id,
      acknowledged_at=clock_timestamp(), acknowledged_by=session_user, evidence=EXCLUDED.evidence
    RETURNING * INTO v_ack;
    RETURN v_ack;
END; $$;

CREATE OR REPLACE FUNCTION publication.trg_guard_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='integrity_constraint_violation'; END; $$;

CREATE OR REPLACE FUNCTION publication.trg_validate_entity_release_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,publication,metadata
AS $$
DECLARE v_publication publication.release%ROWTYPE; v_entity metadata.entity_release%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_publication FROM publication.release WHERE id=NEW.publication_release_id;
  SELECT * INTO STRICT v_entity FROM metadata.entity_release WHERE id=NEW.entity_release_id;
  IF v_publication.release_no<>v_entity.release_no OR v_publication.release_hash<>v_entity.release_hash
     OR v_publication.release_kind::text<>v_entity.release_kind::text
     OR v_publication.compatibility_level::text<>v_entity.compatibility_level::text THEN
    RAISE EXCEPTION 'ENTITY_PUBLICATION_COORDINATE_MISMATCH' USING ERRCODE='foreign_key_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION publication.trg_validate_deployment_target() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,publication
AS $$
DECLARE v_plane text;
BEGIN
  SELECT plane_code INTO STRICT v_plane FROM publication.artifact WHERE id=NEW.artifact_id;
  IF v_plane<>NEW.target_plane THEN RAISE EXCEPTION 'DEPLOYMENT_ARTIFACT_PLANE_MISMATCH' USING ERRCODE='foreign_key_violation'; END IF;
  RETURN NEW;
END; $$;
