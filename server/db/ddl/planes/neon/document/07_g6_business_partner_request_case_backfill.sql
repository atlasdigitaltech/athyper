-- Explicit, release-bounded historical cutover. This command is intentionally
-- not automatic: callers must supply the reviewed mapping between one legacy
-- request-schema release, one published entity contract, and one form release.
CREATE OR REPLACE FUNCTION document.command_backfill_business_partner_request_cases(
  p_tenant_id uuid,p_schema_code text,p_schema_version bigint,p_schema_hash text,
  p_entity_contract_id uuid,p_entity_contract_hash text,
  p_form_template_release_id uuid,p_form_template_release_no bigint,p_form_template_hash text,
  p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL
) RETURNS TABLE(migrated_count bigint,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,document,snapshot,runtime_meta,event,shared,master
SET row_security=on
AS $$
DECLARE
  prior event.command_execution%ROWTYPE;execution uuid;request_row document.business_partner_request%ROWTYPE;
  contract runtime_meta.entity_contract%ROWTYPE;snapshot_id uuid;case_status text;case_version bigint;
  fingerprint text;row_fingerprint text;result jsonb;outbox uuid;migrated bigint:=0;
BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon'
     OR shared.current_tenant_id()<>p_tenant_id OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Business Partner request backfill context mismatch' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_schema_version<1 OR p_form_template_release_no<1
     OR p_schema_hash!~'^[a-f0-9]{64}$' OR p_entity_contract_hash!~'^[a-f0-9]{64}$'
     OR p_form_template_hash!~'^[a-f0-9]{64}$'
     OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Business Partner request backfill release coordinates are invalid' USING ERRCODE='check_violation';
  END IF;
  SELECT c.* INTO contract FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=p_entity_contract_id
     AND c.entity_code='master.business_partner' AND c.entity_contract_hash=p_entity_contract_hash
     AND c.status='published';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pinned published Business Partner entity contract was not found' USING ERRCODE='foreign_key_violation';END IF;
  fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
    'tenantId',p_tenant_id,'schemaCode',p_schema_code,'schemaVersion',p_schema_version,'schemaHash',p_schema_hash,
    'entityContractId',p_entity_contract_id,'entityContractHash',p_entity_contract_hash,
    'formTemplateReleaseId',p_form_template_release_id,'formTemplateReleaseNo',p_form_template_release_no,
    'formTemplateHash',p_form_template_hash,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':bp-request-case-backfill:'||p_idempotency_key,0));
  SELECT e.* INTO prior FROM event.command_execution e WHERE e.tenant_id=p_tenant_id
    AND e.command_code='entity.case.backfill.business_partner_request' AND e.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF prior.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Business Partner request backfill idempotency conflict' USING ERRCODE='unique_violation';END IF;
    RETURN QUERY SELECT (prior.result_payload->>'migratedCount')::bigint,true,(prior.result_payload->>'outboxId')::uuid;RETURN;
  END IF;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
    actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,'entity.case.backfill.business_partner_request',p_idempotency_key,fingerprint,'processing',
    p_actor_id,'g6-compatibility-cutover',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
  RETURNING id INTO execution;
  PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);
  FOR request_row IN SELECT r.* FROM document.business_partner_request r
    WHERE r.tenant_id=p_tenant_id AND r.payload_schema_code=p_schema_code
      AND r.payload_schema_version=p_schema_version AND r.payload_schema_hash=p_schema_hash
      AND NOT EXISTS(SELECT 1 FROM document.entity_case c WHERE c.tenant_id=r.tenant_id AND c.id=r.id)
    ORDER BY r.created_at,r.id FOR UPDATE
  LOOP
    IF cardinality(document.fn_validate_entity_case_payload(contract.contract_json,request_row.proposed_payload))>0 THEN
      RAISE EXCEPTION 'Legacy Business Partner request % does not satisfy the pinned entity contract',request_row.id
        USING ERRCODE='check_violation';
    END IF;
    snapshot_id:=snapshot.fn_capture_entity('document.entity_case',request_row.id,
      'BPR.'||upper(substr(replace(request_row.id::text,'-',''),1,32)),1,p_entity_contract_hash,
      request_row.row_version,'entity.case.legacy_request.backfilled','create',request_row.proposed_payload,
      p_correlation_id,NULL,NULL,NULL,'legal','g6-compatibility-cutover');
    case_status:=CASE request_row.status
      WHEN 'pending_approval' THEN 'submitted' WHEN 'approved' THEN 'approved'
      WHEN 'applying' THEN 'materializing' WHEN 'applied' THEN 'materialized'
      WHEN 'rejected' THEN 'rejected' WHEN 'cancelled' THEN 'cancelled'
      WHEN 'superseded' THEN 'cancelled' WHEN 'returned' THEN 'conflicted'
      WHEN 'failed' THEN 'conflicted' ELSE 'draft' END;
    case_version:=GREATEST(request_row.row_version,1);
    INSERT INTO document.entity_case(id,tenant_id,case_code,entity_code,operation_code,target_entity_id,
      pre_materialization_ref,entity_contract_id,entity_contract_hash,form_template_release_id,
      form_template_release_no,form_template_hash,current_snapshot_id,submitted_snapshot_id,
      decision_snapshot_id,result_snapshot_id,status,row_version,idempotency_key,status_changed_at,
      status_changed_by,created_at,created_by,updated_at,updated_by)
    VALUES(request_row.id,p_tenant_id,'BPR.'||upper(substr(replace(request_row.id::text,'-',''),1,32)),
      'master.business_partner',request_row.request_kind,request_row.target_business_partner_id,
      CASE WHEN request_row.target_business_partner_id IS NULL THEN 'legacy-request:'||request_row.id::text END,
      p_entity_contract_id,p_entity_contract_hash,p_form_template_release_id,p_form_template_release_no,
      p_form_template_hash,snapshot_id,
      CASE WHEN case_status IN('submitted','approved','materializing','materialized','rejected','conflicted') THEN snapshot_id END,
      CASE WHEN case_status IN('approved','materializing','materialized','rejected') THEN snapshot_id END,
      CASE WHEN case_status='materialized' THEN snapshot_id END,case_status,case_version,
      'legacy-request:'||request_row.id::text,
      CASE WHEN case_status<>'draft' THEN COALESCE(request_row.updated_at,request_row.created_at) END,
      CASE WHEN case_status<>'draft' THEN COALESCE(request_row.updated_by,request_row.created_by) END,
      request_row.created_at,request_row.created_by,request_row.updated_at,request_row.updated_by);
    row_fingerprint:=encode(public.digest(convert_to(fingerprint||':'||request_row.id::text,'UTF8'),'sha256'),'hex');
    INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,
      request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,
      result_code,result_snapshot_id,result_evidence,recorded_at,recorded_by)
    VALUES(p_tenant_id,request_row.id,'entity.case.backfill.business_partner_request',
      'legacy-request:'||request_row.id::text,row_fingerprint,0,0,case_version,'legacy',case_status,'accepted',
      'LEGACY_REQUEST_BACKFILLED',snapshot_id,jsonb_strip_nulls(jsonb_build_object('legacyRequestId',request_row.id,
        'legacyRequestNo',request_row.request_no,'schemaCode',p_schema_code,'schemaVersion',p_schema_version,
        'schemaHash',p_schema_hash,'formTemplateReleaseId',p_form_template_release_id,
        'formTemplateReleaseNo',p_form_template_release_no,'formTemplateHash',p_form_template_hash,
        'workflowRequestId',request_row.workflow_request_id,'baseSnapshotId',request_row.base_snapshot_id,
        'materializationSnapshotId',request_row.materialization_snapshot_id)),
      COALESCE(request_row.updated_at,request_row.created_at),p_actor_id);
    migrated:=migrated+1;
  END LOOP;
  INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,
    aggregate_id,event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
  VALUES(p_tenant_id,'governed-entity-case','entity.case.legacy_request.backfill.completed',
    'bp-request-case-backfill:'||p_idempotency_key,'event.command_execution',execution,'compatibility_backfill',
    execution,1,p_actor_id,'g6-compatibility-cutover',p_correlation_id,p_tenant_id::text,
    jsonb_build_object('schemaCode',p_schema_code,'schemaVersion',p_schema_version,'schemaHash',p_schema_hash,
      'entityContractId',p_entity_contract_id,'entityContractHash',p_entity_contract_hash,
      'formTemplateReleaseId',p_form_template_release_id,'formTemplateReleaseNo',p_form_template_release_no,
      'formTemplateHash',p_form_template_hash,'migratedCount',migrated),p_actor_id) RETURNING id INTO outbox;
  result:=jsonb_build_object('migratedCount',migrated,'outboxId',outbox);
  UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),
    status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
  RETURN QUERY SELECT migrated,false,outbox;
END $$;

REVOKE ALL ON FUNCTION document.command_backfill_business_partner_request_cases(
  uuid,text,bigint,text,uuid,text,uuid,bigint,text,text,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT EXECUTE ON FUNCTION document.command_backfill_business_partner_request_cases(
      uuid,text,bigint,text,uuid,text,uuid,bigint,text,text,uuid,uuid) TO athyperadmin;
  END IF;
END $$;
