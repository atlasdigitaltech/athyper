-- Domain-owned G5 materializer for external supplier and customer registrations.
-- The approved, release-pinned G1 decision snapshot is the only request input;
-- no section-specific request row is created or consulted.
CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_role_case(
 p_tenant_id uuid,p_case_id uuid,p_expected_case_version bigint,
 p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,business_partner_id uuid,role_id uuid,
 qualification_id uuid,preference_id uuid,result_snapshot_id uuid,
 row_version bigint,case_status text,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,document,control,snapshot,event,runtime_meta,shared
SET row_security=on AS $$
DECLARE
 fingerprint text; prior event.command_execution%ROWTYPE; execution uuid;
 current_case document.entity_case%ROWTYPE; payload jsonb; bp master.business_partner%ROWTYPE;
 bp_id uuid:=shared.uuidv7(); new_role_id uuid:=shared.uuidv7(); assignment_id uuid:=shared.uuidv7();
 new_qualification_id uuid; new_preference_id uuid; lifecycle record; role_lifecycle record;
 result_snapshot uuid; next_version bigint; attempt_no integer; materialization_id uuid;
 outbox uuid; result jsonb; lineage_hash text; requested_role text; channel text;
 org_id uuid; qualification_type text; preference_rationale text; preflight jsonb;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon'
    OR shared.current_tenant_id()<>p_tenant_id
    OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Business Partner role materialization context mismatch' USING ERRCODE='insufficient_privilege';
 END IF;
 IF p_expected_case_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key
    OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 THEN
  RAISE EXCEPTION 'Business Partner role materialization arguments are invalid' USING ERRCODE='check_violation';
 END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
  'caseId',p_case_id,'expectedCaseVersion',p_expected_case_version,
  'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-materialization:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e
  WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.materialize.business_partner_role'
    AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF prior.request_fingerprint<>fingerprint THEN
   RAISE EXCEPTION 'Business Partner role materialization idempotency conflict' USING ERRCODE='unique_violation';
  END IF;
  RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,
   (prior.result_payload->>'businessPartnerId')::uuid,(prior.result_payload->>'roleId')::uuid,
   NULLIF(prior.result_payload->>'qualificationId','')::uuid,NULLIF(prior.result_payload->>'preferenceId','')::uuid,
   (prior.result_payload->>'resultSnapshotId')::uuid,(prior.result_payload->>'rowVersion')::bigint,
   prior.result_payload->>'status',true,(prior.result_payload->>'outboxId')::uuid;
  RETURN;
 END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
  actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
 VALUES(p_tenant_id,'entity.case.materialize.business_partner_role',p_idempotency_key,fingerprint,'processing',
  p_actor_id,'neon-business-partner',p_correlation_id,clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
 RETURNING id INTO execution;
 PERFORM set_config('app.entity_case_command_execution_id',execution::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case:'||p_case_id::text,0));
 SELECT c.* INTO current_case FROM document.entity_case c
  WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved entity case was not found' USING ERRCODE='no_data_found'; END IF;
 IF current_case.row_version<>p_expected_case_version THEN
  RAISE EXCEPTION 'Entity case version is stale' USING ERRCODE='serialization_failure';
 END IF;
 IF current_case.status<>'approved' OR current_case.entity_code<>'master.business_partner'
    OR current_case.operation_code NOT IN('register','new_partner','add_supplier','add_customer')
    OR current_case.decision_snapshot_id IS NULL THEN
  RAISE EXCEPTION 'Entity case is not an approved Business Partner role registration' USING ERRCODE='object_not_in_prerequisite_state';
 END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s
  WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current_case.decision_snapshot_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Decision snapshot was not found' USING ERRCODE='data_corrupted'; END IF;
 requested_role:=payload->>'requestedRole'; channel:=payload->>'registrationChannel';
 org_id:=NULLIF(payload->>'operatingOrganizationId','')::uuid;
 qualification_type:=NULLIF(payload->>'qualificationTypeCode','');
 preference_rationale:=NULLIF(payload->>'preferenceRationale',''); preflight:=payload->'preflight';
 IF NOT(payload?'businessPartnerCode' AND payload?'name' AND payload?'roleCode'
        AND payload?'requestedRole' AND payload?'registrationChannel' AND payload?'operatingOrganizationId')
    OR payload->>'ownershipClass' NOT IN('internal','external') OR requested_role NOT IN('supplier','customer')
    OR channel NOT IN('internal','invitation','mesh_proposal','buyer_request','supplier_self_registration','customer_onboarding')
    OR (requested_role='supplier' AND channel='customer_onboarding')
    OR (requested_role='customer' AND channel NOT IN('internal','mesh_proposal','customer_onboarding'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN(
      'businessPartnerCode','name','displayName','legalName','legalForm','registrationCountryCode',
      'incorporationDate','websiteUrl','description','ownershipClass','requestedRole','roleCode',
      'registrationChannel','operatingOrganizationId','meshRegistrationExchangeId',
      'meshRegistrationEvidenceHash','bankDisclosureReceiptId','bankDisclosurePurposeCode',
      'qualificationTypeCode','preferenceRationale','companyCodeId','commodityCategoryId','preflight')) THEN
  RAISE EXCEPTION 'Business Partner role payload is outside the materializer contract' USING ERRCODE='check_violation';
 END IF;
 IF requested_role='supplier' AND channel='mesh_proposal' AND (
    NULLIF(payload->>'meshRegistrationExchangeId','')::uuid IS NULL
    OR payload->>'meshRegistrationEvidenceHash' !~ '^[a-f0-9]{64}$') THEN
  RAISE EXCEPTION 'Supplier registration requires accepted MESH exchange evidence' USING ERRCODE='check_violation';
 END IF;
 IF channel='buyer_request' AND (
    NULLIF(payload->>'bankDisclosureReceiptId','')::uuid IS NULL
    OR payload->>'bankDisclosurePurposeCode' !~ '^[a-z][a-z0-9_.-]{1,62}$') THEN
  RAISE EXCEPTION 'Buyer-requested supplier requires purpose-bound disclosure evidence' USING ERRCODE='check_violation';
 END IF;
 IF channel='supplier_self_registration' AND (
    jsonb_typeof(preflight)<>'object' OR preflight-ARRAY['trust','rate','duplicate','sponsorPolicy']::text[]<>'{}'::jsonb
    OR preflight->>'trust'<>'passed' OR preflight->>'rate'<>'passed'
    OR preflight->>'duplicate'<>'passed' OR preflight->>'sponsorPolicy'<>'approved') THEN
  RAISE EXCEPTION 'Supplier self-registration requires bounded successful preflight evidence' USING ERRCODE='check_violation';
 END IF;
 IF requested_role='supplier' AND payload->>'ownershipClass'='external' AND qualification_type IS NULL THEN
  RAISE EXCEPTION 'Supplier registration requires a qualification type' USING ERRCODE='check_violation';
 END IF;
 IF current_case.target_entity_id IS NULL THEN
  INSERT INTO master.business_partner(id,tenant_id,code,name,display_name,legal_name,partner_category,
   ownership_class,category_locked_by,legal_form,registration_country_code,incorporation_date,website_url,
   description,status,created_by)
  VALUES(bp_id,p_tenant_id,payload->>'businessPartnerCode',payload->>'name',payload->>'displayName',
   payload->>'legalName','organization',payload->>'ownershipClass',p_actor_id,payload->>'legalForm',
   NULLIF(payload->>'registrationCountryCode','')::character(2),NULLIF(payload->>'incorporationDate','')::date,
   payload->>'websiteUrl',payload->>'description','draft',p_actor_id) RETURNING * INTO bp;
 ELSE
  bp_id:=current_case.target_entity_id;
  SELECT * INTO bp FROM master.business_partner WHERE tenant_id=p_tenant_id AND id=bp_id FOR UPDATE;
  IF NOT FOUND OR bp.status<>'active'
     OR (requested_role='supplier' AND EXISTS(SELECT 1 FROM master.supplier r WHERE r.tenant_id=p_tenant_id AND r.business_partner_id=bp_id AND r.status<>'retired'))
     OR (requested_role='customer' AND EXISTS(SELECT 1 FROM master.customer r WHERE r.tenant_id=p_tenant_id AND r.business_partner_id=bp_id AND r.status<>'retired')) THEN
   RAISE EXCEPTION 'Target Business Partner is not eligible for the requested role' USING ERRCODE='unique_violation';
  END IF;
 END IF;
 IF requested_role='supplier' AND qualification_type IS NOT NULL THEN
  INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,status,created_by)
   VALUES(new_role_id,p_tenant_id,bp_id,payload->>'roleCode','onboarding',p_actor_id);
 ELSE
  INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,status,created_by)
   VALUES(new_role_id,p_tenant_id,bp_id,payload->>'roleCode','prospect',p_actor_id);
 END IF;
 INSERT INTO master.business_partner_operating_organization_assignment(
  id,tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,status,
  status_changed_at,status_changed_by,created_by)
 VALUES(assignment_id,p_tenant_id,bp_id,org_id,requested_role::master.partner_role_d,CURRENT_DATE,'active',
  clock_timestamp(),p_actor_id,p_actor_id);
 IF requested_role='supplier' THEN
  SELECT created.aggregate_id INTO new_qualification_id
    FROM control.command_create_business_partner_decision(p_tenant_id,'qualification',bp_id,'supplier',new_role_id,
      org_id,NULLIF(payload->>'companyCodeId','')::uuid,NULLIF(payload->>'commodityCategoryId','')::uuid,
      jsonb_build_object('qualificationTypeCode',qualification_type),
      'case-qualification:'||p_case_id::text,p_actor_id) created;
  IF preference_rationale IS NOT NULL THEN
   SELECT created.aggregate_id INTO new_preference_id
     FROM control.command_create_business_partner_decision(p_tenant_id,'supplier_preference',bp_id,'supplier',new_role_id,
       org_id,NULLIF(payload->>'companyCodeId','')::uuid,NULLIF(payload->>'commodityCategoryId','')::uuid,
       jsonb_build_object('effectiveFrom',CURRENT_DATE,'rationale',preference_rationale),
       'case-preference:'||p_case_id::text,p_actor_id) created;
  END IF;
 END IF;
 IF current_case.target_entity_id IS NULL THEN
  SELECT * INTO lifecycle FROM control.command_business_partner_lifecycle(p_tenant_id,'business_partner',bp_id,
   'active',1,'approved governed role registration','case-bp-activate:'||p_case_id::text,p_actor_id);
 END IF;
 SELECT * INTO role_lifecycle FROM control.command_business_partner_lifecycle(p_tenant_id,requested_role,new_role_id,
  'active',1,'approved governed '||requested_role||' registration','case-'||requested_role||'-activate:'||p_case_id::text,p_actor_id);
 SELECT b.* INTO bp FROM master.business_partner b WHERE b.tenant_id=p_tenant_id AND b.id=bp_id;
 IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status='published'),payload))>0 THEN
  RAISE EXCEPTION 'Materialized Business Partner snapshot violates the pinned contract' USING ERRCODE='check_violation';
 END IF;
 result_snapshot:=snapshot.fn_capture_entity('master.business_partner',bp_id,bp.code,1,
  current_case.entity_contract_hash,bp.record_version,'entity.case.materialized','create',payload,
  p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 next_version:=current_case.row_version+1;
 SELECT COALESCE(max(m.attempt_no),0)+1 INTO attempt_no FROM document.entity_case_materialization m
  WHERE m.tenant_id=p_tenant_id AND m.entity_case_id=p_case_id;
 INSERT INTO document.entity_case_materialization(tenant_id,entity_case_id,attempt_no,source_snapshot_id,
  result_snapshot_id,materializer_code,materializer_version,request_fingerprint,status,result_code,
  started_at,completed_at,requested_by,completed_by)
 VALUES(p_tenant_id,p_case_id,attempt_no,current_case.decision_snapshot_id,result_snapshot,
  'neon.business_partner_role','1',fingerprint,'succeeded',upper(requested_role)||'_CREATED',
  clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO materialization_id;
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,
  'sourceSnapshotId',current_case.decision_snapshot_id,'targetSnapshotId',result_snapshot,
  'businessPartnerId',bp_id,'roleId',new_role_id,'materializationId',materialization_id)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,
  lineage_role,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
 VALUES(p_tenant_id,p_case_id,current_case.decision_snapshot_id,result_snapshot,'materialized_from',
  'master.business_partner',bp_id,'neon.business_partner_role','1',lineage_hash,p_actor_id);
 UPDATE document.entity_case c SET target_entity_id=bp_id,result_snapshot_id=result_snapshot,status='materialized',
  row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,
  request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,
  result_code,result_snapshot_id,result_evidence,recorded_by)
 VALUES(p_tenant_id,p_case_id,'entity.case.materialize',p_idempotency_key,fingerprint,p_expected_case_version,
  current_case.row_version,next_version,'approved','materialized','accepted',upper(requested_role)||'_CREATED',
  result_snapshot,jsonb_build_object('businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,
   'assignmentId',assignment_id,'qualificationId',new_qualification_id,'preferenceId',new_preference_id,
   'materializationId',materialization_id,'authorityEvidenceId',lifecycle.evidence_id),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
  event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
 VALUES(p_tenant_id,'governed-entity-case','entity.case.materialized','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,
  'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,
  'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,
   'businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role,'qualificationId',new_qualification_id,
   'preferenceId',new_preference_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,
   'status','materialized','materializer','neon.business_partner_role'),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'roleId',new_role_id,
  'qualificationId',COALESCE(new_qualification_id::text,''),'preferenceId',COALESCE(new_preference_id::text,''),
  'resultSnapshotId',result_snapshot,'rowVersion',next_version,'status','materialized','outboxId',outbox);
 UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),
  status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,bp_id,new_role_id,new_qualification_id,new_preference_id,result_snapshot,
  next_version,'materialized',false,outbox;
END $$;
