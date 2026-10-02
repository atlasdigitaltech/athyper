-- Exact durable rollback retries preserve the current activation head.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database() NOT IN ('athyper_studio','athyper_neon','athyper_mesh') THEN RAISE EXCEPTION 'Known plane database required'; END IF;
 IF to_regprocedure('runtime_meta.fn_rollback_release(text,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'Runtime publication baseline required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION runtime_meta.fn_rollback_release(
    p_publication_key text, p_target_applied_release_id uuid, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS runtime_meta.release_activation_head
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE
    v_head runtime_meta.release_activation_head%ROWTYPE;
    v_target runtime_meta.applied_release%ROWTYPE;
    v_previous uuid;
    v_activated_at timestamptz := clock_timestamp();
    v_completed runtime_meta.release_activation_event%ROWTYPE;
BEGIN
    -- Use the activation lock order and serialize retries for this publication.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_publication_key,0));
    SELECT * INTO v_head FROM runtime_meta.release_activation_head
     WHERE publication_key=p_publication_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF p_evidence ? 'operationId' THEN
      IF jsonb_typeof(p_evidence->'operationId') IS DISTINCT FROM 'string'
         OR COALESCE(p_evidence->>'operationId','')=''
         OR jsonb_typeof(p_evidence->'tenantId') IS DISTINCT FROM 'string'
         OR COALESCE(p_evidence->>'tenantId','')=''
         OR p_evidence->>'tenantId' IS DISTINCT FROM current_setting('app.current_tenant_id',true) THEN
        RAISE EXCEPTION 'ROLLBACK_OPERATION_COORDINATES_INVALID' USING ERRCODE='insufficient_privilege';
      END IF;
      SELECT * INTO v_completed FROM runtime_meta.release_activation_event
       WHERE publication_key=p_publication_key
         AND evidence->>'operationId'=p_evidence->>'operationId'
         AND evidence->>'tenantId'=p_evidence->>'tenantId'
       ORDER BY activated_at DESC,id DESC LIMIT 1;
      IF FOUND THEN
        IF v_completed.applied_release_id=p_target_applied_release_id
           AND v_completed.evidence=p_evidence||jsonb_build_object('rollback',true)
           AND v_head.applied_release_id=v_completed.applied_release_id
           AND v_head.activated_at=v_completed.activated_at THEN
          RETURN v_head;
        END IF;
        RAISE EXCEPTION 'ROLLBACK_OPERATION_REPLAY_MISMATCH' USING ERRCODE='object_not_in_prerequisite_state';
      END IF;
    END IF;
    SELECT * INTO v_target FROM runtime_meta.applied_release
     WHERE id=p_target_applied_release_id AND publication_key=p_publication_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF v_target.status NOT IN ('superseded','verified') THEN
      RAISE EXCEPTION 'ROLLBACK_RELEASE_NOT_ELIGIBLE' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM runtime_meta.entity_descriptor WHERE applied_release_id=v_target.id)
       AND NOT EXISTS (SELECT 1 FROM runtime_meta.applied_release_payload WHERE applied_release_id=v_target.id) THEN
      RAISE EXCEPTION 'ROLLBACK_PROJECTION_NOT_FOUND' USING ERRCODE='no_data_found';
    END IF;

    v_previous := v_head.applied_release_id;
    PERFORM authz.fn_retire_entity_operation_projection(v_previous,v_activated_at);
    UPDATE runtime_meta.entity_descriptor SET status='retired',retired_at=v_activated_at
     WHERE applied_release_id=v_previous AND status='active';
    UPDATE runtime_meta.entity_contract c SET status='superseded',status_changed_at=v_activated_at
     WHERE c.id IN (SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_previous)
       AND c.status='published';
    UPDATE runtime_meta.applied_release SET status='superseded' WHERE id=v_previous AND status='active';

    PERFORM authz.fn_restore_entity_operation_projection(v_target.id,v_activated_at);
    UPDATE runtime_meta.entity_descriptor
       SET status='active',activated_at=v_activated_at,retired_at=NULL
     WHERE applied_release_id=v_target.id AND status IN ('staged','retired');
    UPDATE runtime_meta.entity_contract c SET status='published',status_changed_at=v_activated_at
     WHERE c.id IN (SELECT d.entity_contract_id FROM runtime_meta.entity_descriptor d WHERE d.applied_release_id=v_target.id)
       AND c.status IN ('staged','superseded');
    UPDATE runtime_meta.applied_release SET status='active',activated_at=v_activated_at WHERE id=v_target.id;
    UPDATE runtime_meta.release_activation_head
       SET applied_release_id=v_target.id,source_release_no=v_target.source_release_no,
           artifact_hash=v_target.artifact_hash,activated_at=v_activated_at,row_version=row_version+1
     WHERE publication_key=p_publication_key RETURNING * INTO v_head;
    INSERT INTO runtime_meta.release_activation_event(
        publication_key,previous_applied_release_id,applied_release_id,activated_at,evidence
    ) VALUES(p_publication_key,v_previous,v_target.id,v_activated_at,
        COALESCE(p_evidence,'{}'::jsonb)||jsonb_build_object('rollback',true));
    RETURN v_head;
END; $$;
COMMIT;
