-- Audited retry of the same reviewed recovery command after a pre-receipt permission denial.
BEGIN;
CREATE OR REPLACE FUNCTION publication.fn_transition_deployment(
    p_deployment_id uuid,p_to_status publication.deployment_status_d,p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS publication.deployment
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,event
AS $$
DECLARE v_row publication.deployment%ROWTYPE; v_release publication.release%ROWTYPE;
  retry_definition record; retry_policy jsonb; retry_delivery jsonb; retry_source jsonb; retry_command text; retry_authorized boolean:=false; transition_event_id uuid;
BEGIN
  SELECT * INTO v_row FROM publication.deployment WHERE id=p_deployment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEPLOYMENT_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF v_row.status=p_to_status THEN RETURN v_row; END IF;
  -- Retry only a pre-receipt permission failure of the SAME independently
  -- reviewed recovery command. Failed ledger events remain append-only.
  IF v_row.status='failed' AND p_to_status='dispatched' THEN
    SELECT d.*,r.action_config->'policy' AS recovery_policy INTO retry_definition
      FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
      WHERE d.id=(p_evidence->>'recoveryPolicyId')::uuid
        AND d.tenant_id=shared.current_tenant_id_soft() AND d.entity_type='metadata.publication'
        AND d.definition_hash=p_evidence->>'recoveryPolicyHash' AND d.status='active'
        AND r.action_code='allow' AND r.action_config->>'schema'='athyper.machine-publication-enrollment/1'
        AND r.action_config->>'environment'='dev'
        AND r.action_config->>'permissionCode'='studio.metadata.contract.publish_automated'
      FOR SHARE OF d,r;
    retry_policy:=retry_definition.recovery_policy;
    IF (p_evidence->>'schema'='athyper.coordinated-deployment-retry/1'
      AND length(p_evidence->>'reason') BETWEEN 10 AND 1000
      AND retry_policy->>'schema'='athyper.dev-coordinated-deployment-recovery/1'
      AND retry_policy->>'authorityTenantId'=shared.current_tenant_id_soft()::text
      AND retry_policy->>'publisherPrincipalId'=master.current_principal_id_soft()::text
      AND retry_policy#>>'{compiler,buildHash}'=p_evidence->>'compilerHash'
      AND (retry_policy->>'expiresAt')::timestamptz>clock_timestamp()
      AND retry_policy->>'environment'='local' AND retry_policy->>'instance'='dev'
      AND v_row.created_by=master.current_principal_id_soft()
      AND v_row.failure_code='42501' AND v_row.received_at IS NULL
      AND v_row.staged_at IS NULL AND v_row.verified_at IS NULL AND v_row.activated_at IS NULL
      AND v_row.target_environment='local' AND v_row.target_instance='dev'
      AND control.publication_policy_enrollment_is_active(retry_definition.id,retry_definition.definition_hash,
        (retry_policy->>'authorPrincipalId')::uuid,(retry_policy->>'publisherPrincipalId')::uuid)
      AND NOT EXISTS(SELECT 1 FROM publication.deployment_acknowledgement WHERE deployment_id=v_row.id)
      AND NOT EXISTS(SELECT 1 FROM publication.deployment_event WHERE deployment_id=v_row.id
        AND to_status IN ('received','staged','verified','activated'))
      AND (SELECT count(*) FROM control.policy_rule WHERE policy_definition_id=retry_definition.id)=1) IS NOT TRUE THEN
      RAISE EXCEPTION 'DEPLOYMENT_RECOVERY_RETRY_DENIED' USING ERRCODE='42501';
    END IF;
    IF NOT pg_try_advisory_xact_lock(hashtextextended('deployment-recovery:'||shared.current_tenant_id_soft()::text||':'||
      (retry_policy#>>'{originalPolicy,id}'),0)) THEN
      RAISE EXCEPTION 'DEPLOYMENT_RECOVERY_RETRY_BUSY' USING ERRCODE='55P03';
    END IF;
    SELECT r.* INTO STRICT v_release FROM publication.artifact a
      JOIN publication.release r ON r.id=a.publication_release_id WHERE a.id=v_row.artifact_id FOR SHARE OF r;
    -- Revalidate original human source receipts and the exact signed wildcard predecessor.
    PERFORM publication.fn_human_execution_context(v_release.id);
    retry_source:=publication.fn_coordinated_deployment_recovery_source(
      (retry_policy#>>'{originalPolicy,id}')::uuid,retry_policy#>>'{originalPolicy,hash}');
    SELECT pin INTO STRICT retry_delivery FROM jsonb_array_elements(retry_policy->'deliveries') pin
      WHERE pin->>'artifactId'=v_row.artifact_id::text AND pin->>'releaseId'=v_release.id::text
        AND pin->>'plane'=v_row.target_plane AND (pin->>'attempt')::integer+1=v_row.attempt_no;
    retry_command:=encode(sha256(convert_to('publication:coordinated-recovery:'||retry_definition.definition_hash||':'||
      (retry_delivery->>'deploymentId'),'UTF8')),'hex');
    IF v_row.command_id<>(substr(retry_command,1,8)||'-'||substr(retry_command,9,4)||'-4'||substr(retry_command,14,3)||
      '-8'||substr(retry_command,18,3)||'-'||substr(retry_command,21,12))::uuid
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(retry_source->'deliveries') old
        WHERE old->>'deploymentId'=retry_delivery->>'deploymentId' AND old->>'artifactId'=v_row.artifact_id::text
          AND old->>'artifactHash'=retry_delivery->>'artifactHash' AND old->>'artifactStatus'='signed'
          AND old->>'status'='failed' AND old->>'instance'='*' AND (old->>'acknowledged')::boolean=false)
      OR NOT EXISTS(SELECT 1 FROM publication.deployment_event ev WHERE ev.deployment_id=v_row.id AND ev.to_status='dispatched'
        AND ev.evidence->>'recoveryPolicyId'=retry_definition.id::text
        AND ev.evidence->>'recoveryPolicyHash'=retry_definition.definition_hash
        AND ev.evidence->>'previousDeploymentId'=retry_delivery->>'deploymentId'
        AND ev.evidence->>'artifactHash'=retry_delivery->>'artifactHash'
        AND ev.evidence->>'compilerHash'=retry_policy#>>'{compiler,buildHash}') THEN
      RAISE EXCEPTION 'DEPLOYMENT_RECOVERY_RETRY_PIN_CHANGED' USING ERRCODE='42501';
    END IF;
    retry_authorized:=true;
  END IF;
  IF NOT (retry_authorized OR (v_row.status='pending' AND p_to_status IN ('dispatched','failed')) OR (v_row.status='dispatched' AND p_to_status IN ('received','failed')) OR
    (v_row.status='received' AND p_to_status IN ('staged','failed')) OR (v_row.status='staged' AND p_to_status IN ('verified','failed')) OR
    (v_row.status='verified' AND p_to_status IN ('activated','failed')) OR (v_row.status='activated' AND p_to_status='rolled_back')) THEN
    RAISE EXCEPTION 'INVALID_DEPLOYMENT_TRANSITION: % -> %',v_row.status,p_to_status USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  INSERT INTO publication.deployment_event(deployment_id,from_status,to_status,evidence) VALUES(v_row.id,v_row.status,p_to_status,COALESCE(p_evidence,'{}'::jsonb)) RETURNING id INTO transition_event_id;
  UPDATE publication.deployment SET status=p_to_status,
    dispatched_at=CASE WHEN p_to_status='dispatched' THEN clock_timestamp() ELSE dispatched_at END,
    received_at=CASE WHEN p_to_status='received' THEN clock_timestamp() ELSE received_at END,
    staged_at=CASE WHEN p_to_status='staged' THEN clock_timestamp() ELSE staged_at END,
    verified_at=CASE WHEN p_to_status='verified' THEN clock_timestamp() ELSE verified_at END,
    activated_at=CASE WHEN p_to_status='activated' THEN clock_timestamp() ELSE activated_at END,
    failed_at=CASE WHEN p_to_status='failed' THEN clock_timestamp() WHEN retry_authorized THEN NULL ELSE failed_at END,
    failure_code=CASE WHEN p_to_status='failed' THEN NULLIF(p_evidence->>'code','') WHEN retry_authorized THEN NULL ELSE failure_code END,
    failure_detail=CASE WHEN p_to_status='failed' THEN NULLIF(p_evidence->>'detail','') WHEN retry_authorized THEN NULL ELSE failure_detail END
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
    format('%s:%s',v_row.id,p_to_status)||CASE WHEN retry_authorized THEN ':retry:'||transition_event_id::text ELSE '' END,
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

COMMIT;
