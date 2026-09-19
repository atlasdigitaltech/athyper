-- Company setup lifecycle support. No human grants or release activation.
BEGIN;
CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_company_case(
 p_tenant_id uuid,p_case_id uuid,p_expected_case_version bigint,
 p_idempotency_key text,p_actor_id uuid,p_correlation_id uuid DEFAULT NULL)
RETURNS TABLE(entity_case_id uuid,business_partner_id uuid,role_id uuid,
 qualification_id uuid,preference_id uuid,result_snapshot_id uuid,
 row_version bigint,case_status text,replayed boolean,outbox_id uuid,
 company_profile_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,master,document,control,snapshot,event,runtime_meta,shared
SET row_security=on AS $$
DECLARE
 fingerprint text; prior event.command_execution%ROWTYPE; execution uuid;
 current_case document.entity_case%ROWTYPE; payload jsonb; bp master.business_partner%ROWTYPE;
 bp_id uuid; target_role_id uuid; profile_id uuid; company_id uuid; org_id uuid;
 requested_role text; currency text; payment_term uuid; accounting_profile uuid;
 dimension_set uuid; remittance_link uuid; statement_cycle text; profile_payload jsonb;
 result_snapshot uuid; next_version bigint; attempt_no integer; materialization_id uuid;
 outbox uuid; result jsonb; lineage_hash text; target_type text;
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon'
    OR shared.current_tenant_id()<>p_tenant_id
    OR master.current_principal_id_soft() IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Business Partner company materialization context mismatch' USING ERRCODE='insufficient_privilege';
 END IF;
 IF p_expected_case_version<1 OR btrim(p_idempotency_key)<>p_idempotency_key
    OR length(p_idempotency_key) NOT BETWEEN 8 AND 180 THEN
  RAISE EXCEPTION 'Business Partner company materialization arguments are invalid' USING ERRCODE='check_violation';
 END IF;
 fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
  'caseId',p_case_id,'expectedCaseVersion',p_expected_case_version,
  'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':entity-case-materialization:'||p_idempotency_key,0));
 SELECT e.* INTO prior FROM event.command_execution e
  WHERE e.tenant_id=p_tenant_id AND e.command_code='entity.case.materialize.business_partner_company'
    AND e.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF prior.request_fingerprint<>fingerprint THEN
   RAISE EXCEPTION 'Business Partner company materialization idempotency conflict' USING ERRCODE='unique_violation';
  END IF;
  RETURN QUERY SELECT (prior.result_payload->>'caseId')::uuid,
   (prior.result_payload->>'businessPartnerId')::uuid,(prior.result_payload->>'roleId')::uuid,
   NULL::uuid,NULL::uuid,(prior.result_payload->>'resultSnapshotId')::uuid,
   (prior.result_payload->>'rowVersion')::bigint,prior.result_payload->>'status',true,
   (prior.result_payload->>'outboxId')::uuid,(prior.result_payload->>'companyProfileId')::uuid;
  RETURN;
 END IF;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
  actor_principal_id,source_service,correlation_id,started_at,status_changed_at,status_changed_by,created_by)
 VALUES(p_tenant_id,'entity.case.materialize.business_partner_company',p_idempotency_key,fingerprint,'processing',
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
 IF current_case.status<>'approved' OR current_case.entity_code NOT IN('master.business_partner','master.business_partner_company_setup_request')
    OR current_case.operation_code<>'configure_company' OR current_case.target_entity_id IS NULL
    OR current_case.decision_snapshot_id IS NULL THEN
  RAISE EXCEPTION 'Entity case is not an approved Business Partner company configuration' USING ERRCODE='object_not_in_prerequisite_state';
 END IF;
 SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s
  WHERE s.tenant_id=p_tenant_id AND s.snapshot_id=current_case.decision_snapshot_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Decision snapshot was not found' USING ERRCODE='data_corrupted'; END IF;
 IF cardinality(document.fn_validate_entity_case_payload((SELECT c.contract_json FROM runtime_meta.entity_contract c
   WHERE c.tenant_id=p_tenant_id AND c.id=current_case.entity_contract_id
     AND c.entity_contract_hash=current_case.entity_contract_hash AND c.status IN('published','superseded')),payload))>0 THEN
  RAISE EXCEPTION 'Company configuration payload violates the pinned contract' USING ERRCODE='check_violation';
 END IF;
 bp_id:=current_case.target_entity_id;
 requested_role:=payload->>'requestedRole';
 org_id:=NULLIF(payload->>'operatingOrganizationId','')::uuid;
 company_id:=NULLIF(payload->>'companyCodeId','')::uuid;
 IF current_case.entity_code='master.business_partner_company_setup_request' AND current_case.owner_company_code_id IS DISTINCT FROM company_id THEN
  RAISE EXCEPTION 'Company setup decision does not match its immutable owner' USING ERRCODE='check_violation';
 END IF;
 currency:=upper(NULLIF(btrim(payload->>'currencyCode'),''));
 payment_term:=NULLIF(payload->>'paymentTermId','')::uuid;
 accounting_profile:=NULLIF(payload->>'defaultAccountingProfileId','')::uuid;
 dimension_set:=NULLIF(payload->>'defaultDimensionSetId','')::uuid;
 remittance_link:=NULLIF(payload->>'preferredRemittanceBankLinkId','')::uuid;
 statement_cycle:=NULLIF(btrim(payload->>'statementCycleCode'),'');
 IF requested_role NOT IN('supplier','customer') OR org_id IS NULL OR company_id IS NULL
    OR currency !~ '^[A-Z]{3}$' OR payment_term IS NULL OR accounting_profile IS NULL
    OR (requested_role='supplier' AND remittance_link IS NULL)
    OR (requested_role='customer' AND remittance_link IS NOT NULL) THEN
  RAISE EXCEPTION 'Company configuration coordinates or finance fields are incomplete' USING ERRCODE='check_violation';
 END IF;
 SELECT b.* INTO bp FROM master.business_partner b
  WHERE b.tenant_id=p_tenant_id AND b.id=bp_id AND b.status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target Business Partner is not active' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
   JOIN master.operating_organization_company_assignment company_scope
     ON company_scope.tenant_id=assignment.tenant_id
    AND company_scope.operating_organization_id=assignment.operating_organization_id
    AND company_scope.company_code_id=company_id
   WHERE assignment.tenant_id=p_tenant_id AND assignment.business_partner_id=bp_id
    AND assignment.operating_organization_id=org_id AND assignment.partner_role=requested_role::master.partner_role_d
    AND assignment.status='active' AND assignment.effective_from<=CURRENT_DATE
    AND (assignment.effective_until IS NULL OR assignment.effective_until>CURRENT_DATE)
    AND company_scope.status='active' AND company_scope.effective_from<=CURRENT_DATE
    AND (company_scope.effective_until IS NULL OR company_scope.effective_until>CURRENT_DATE)
  ) THEN
  RAISE EXCEPTION 'Active Business Partner role scope does not cover the selected company' USING ERRCODE='check_violation';
 END IF;
 IF requested_role='supplier' THEN
  SELECT supplier.id INTO target_role_id FROM master.supplier supplier
   WHERE supplier.tenant_id=p_tenant_id AND supplier.business_partner_id=bp_id AND supplier.status<>'retired'
   ORDER BY supplier.created_at,supplier.id LIMIT 1 FOR SHARE;
  IF target_role_id IS NULL THEN RAISE EXCEPTION 'Active supplier role is required' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  INSERT INTO master.company_code_supplier_profile(
   tenant_id,supplier_id,company_code_id,currency_code,payment_term_id,
   default_accounting_profile_id,preferred_remittance_bank_link_id,default_dimension_set_id,
   metadata,status,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,target_role_id,company_id,currency,payment_term,accounting_profile,
   remittance_link,dimension_set,jsonb_build_object('sourceCaseId',p_case_id),'active',
   clock_timestamp(),p_actor_id,p_actor_id)
  ON CONFLICT(tenant_id,supplier_id,company_code_id) DO UPDATE SET
   currency_code=EXCLUDED.currency_code,payment_term_id=EXCLUDED.payment_term_id,
   default_accounting_profile_id=EXCLUDED.default_accounting_profile_id,
   preferred_remittance_bank_link_id=EXCLUDED.preferred_remittance_bank_link_id,
   default_dimension_set_id=EXCLUDED.default_dimension_set_id,
   metadata=master.company_code_supplier_profile.metadata||jsonb_build_object('sourceCaseId',p_case_id),
   status='active',status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,
   updated_at=clock_timestamp(),updated_by=p_actor_id
  RETURNING id INTO profile_id;
  target_type:='master.company_code_supplier_profile';
 ELSE
  SELECT customer.id INTO target_role_id FROM master.customer customer
   WHERE customer.tenant_id=p_tenant_id AND customer.business_partner_id=bp_id AND customer.status<>'retired'
   ORDER BY customer.created_at,customer.id LIMIT 1 FOR SHARE;
  IF target_role_id IS NULL THEN RAISE EXCEPTION 'Active customer role is required' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  INSERT INTO master.company_code_customer_profile(
   tenant_id,customer_id,company_code_id,currency_code,payment_term_id,
   default_accounting_profile_id,default_dimension_set_id,statement_cycle_code,
   metadata,status,status_changed_at,status_changed_by,created_by)
  VALUES(p_tenant_id,target_role_id,company_id,currency,payment_term,accounting_profile,
   dimension_set,statement_cycle,jsonb_build_object('sourceCaseId',p_case_id),'active',
   clock_timestamp(),p_actor_id,p_actor_id)
  ON CONFLICT(tenant_id,customer_id,company_code_id) DO UPDATE SET
   currency_code=EXCLUDED.currency_code,payment_term_id=EXCLUDED.payment_term_id,
   default_accounting_profile_id=EXCLUDED.default_accounting_profile_id,
   default_dimension_set_id=EXCLUDED.default_dimension_set_id,
   statement_cycle_code=EXCLUDED.statement_cycle_code,
   metadata=master.company_code_customer_profile.metadata||jsonb_build_object('sourceCaseId',p_case_id),
   status='active',status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,
   updated_at=clock_timestamp(),updated_by=p_actor_id
  RETURNING id INTO profile_id;
  target_type:='master.company_code_customer_profile';
 END IF;
 profile_payload:=jsonb_strip_nulls(jsonb_build_object(
  'businessPartnerId',bp_id,'requestedRole',requested_role,'roleId',target_role_id,
  'operatingOrganizationId',org_id,'companyCodeId',company_id,'companyProfileId',profile_id,
  'currencyCode',currency,'paymentTermId',payment_term,
  'defaultAccountingProfileId',accounting_profile,'defaultDimensionSetId',dimension_set,
  'preferredRemittanceBankLinkId',remittance_link,'statementCycleCode',statement_cycle));
 result_snapshot:=snapshot.fn_capture_entity(target_type,profile_id,bp.code||':'||company_id::text,1,
  current_case.entity_contract_hash,p_expected_case_version,'entity.case.materialized','version',profile_payload,
  p_correlation_id,NULL,NULL,NULL,'legal','neon-business-partner');
 next_version:=current_case.row_version+1;
 SELECT COALESCE(max(m.attempt_no),0)+1 INTO attempt_no FROM document.entity_case_materialization m
  WHERE m.tenant_id=p_tenant_id AND m.entity_case_id=p_case_id;
 INSERT INTO document.entity_case_materialization(tenant_id,entity_case_id,attempt_no,source_snapshot_id,
  result_snapshot_id,materializer_code,materializer_version,request_fingerprint,status,result_code,
  started_at,completed_at,requested_by,completed_by)
 VALUES(p_tenant_id,p_case_id,attempt_no,current_case.decision_snapshot_id,result_snapshot,
  'neon.business_partner_company','1',fingerprint,'succeeded','COMPANY_CONFIGURED',
  clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id) RETURNING id INTO materialization_id;
 lineage_hash:=encode(public.digest(convert_to(jsonb_build_object('caseId',p_case_id,
  'sourceSnapshotId',current_case.decision_snapshot_id,'targetSnapshotId',result_snapshot,
  'businessPartnerId',bp_id,'roleId',target_role_id,'companyProfileId',profile_id,
  'materializationId',materialization_id)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO snapshot.entity_case_snapshot_lineage(tenant_id,entity_case_id,source_snapshot_id,target_snapshot_id,
  lineage_role,target_authority_type,target_authority_id,transformation_code,transformation_version,evidence_hash,created_by)
 VALUES(p_tenant_id,p_case_id,current_case.decision_snapshot_id,result_snapshot,'materialized_from',
  target_type,profile_id,'neon.business_partner_company','1',lineage_hash,p_actor_id);
 UPDATE document.entity_case c SET result_snapshot_id=result_snapshot,status='materialized',
  row_version=next_version,updated_by=p_actor_id WHERE c.tenant_id=p_tenant_id AND c.id=p_case_id;
 INSERT INTO document.entity_case_command_evidence(tenant_id,entity_case_id,command_code,idempotency_key,
  request_fingerprint,expected_version,before_version,after_version,before_status,after_status,outcome,
  result_code,result_snapshot_id,result_evidence,recorded_by)
 VALUES(p_tenant_id,p_case_id,'entity.case.materialize',p_idempotency_key,fingerprint,p_expected_case_version,
  current_case.row_version,next_version,'approved','materialized','accepted','COMPANY_CONFIGURED',
  result_snapshot,jsonb_build_object('businessPartnerId',bp_id,'roleId',target_role_id,'role',requested_role,
   'companyProfileId',profile_id,'companyCodeId',company_id,'operatingOrganizationId',org_id,
   'materializationId',materialization_id,'resultKind','company_configured'),p_actor_id);
 INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,
  event_version,actor_id,source,correlation_id,partition_key,payload,created_by)
 VALUES(p_tenant_id,'governed-entity-case','entity.case.materialized','entity-case:'||p_case_id::text||':v'||next_version::text||':'||p_idempotency_key,
  'document.entity_case',p_case_id,'entity_case',p_case_id,LEAST(next_version,2147483647)::integer,p_actor_id,
  'neon-business-partner',p_correlation_id,p_tenant_id::text,jsonb_build_object('caseId',p_case_id,
   'businessPartnerId',bp_id,'roleId',target_role_id,'role',requested_role,'companyProfileId',profile_id,
   'companyCodeId',company_id,'operatingOrganizationId',org_id,'resultSnapshotId',result_snapshot,
   'rowVersion',next_version,'status','materialized','materializer','neon.business_partner_company',
   'resultKind','company_configured'),p_actor_id) RETURNING id INTO outbox;
 result:=jsonb_build_object('caseId',p_case_id,'businessPartnerId',bp_id,'roleId',target_role_id,
  'companyProfileId',profile_id,'resultSnapshotId',result_snapshot,'rowVersion',next_version,
  'status','materialized','outboxId',outbox);
 UPDATE event.command_execution SET status='succeeded',result_payload=result,completed_at=clock_timestamp(),
  status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id WHERE id=execution;
 RETURN QUERY SELECT p_case_id,bp_id,target_role_id,NULL::uuid,NULL::uuid,result_snapshot,
  next_version,'materialized',false,outbox,profile_id;
END $$;

-- Kind-specific G5 changes reuse native lifecycle and independent bank-verification authorities.
CREATE OR REPLACE FUNCTION document.fn_company_setup_case_approvers(p_tenant_id uuid,p_company_code_id uuid,p_excluded_principal_id uuid)
RETURNS TABLE(principal_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,authz AS $$
 SELECT DISTINCT member.principal_id FROM authz.group_member member
 JOIN authz.principal_group group_row ON group_row.tenant_id=member.tenant_id AND group_row.id=member.group_id AND group_row.status='active'
 JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND (membership.effective_until IS NULL OR membership.effective_until>now())
 JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.propagation_mode='exact' AND grant_row.effective_from<=now() AND (grant_row.effective_until IS NULL OR grant_row.effective_until>now())
 JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
 JOIN authz.role_permission role_permission ON role_permission.tenant_id=role_row.tenant_id AND role_permission.role_id=role_row.id
 JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.canonical_code='neon.relationship.bp_company_setup_request.decide' AND permission.status='published'
 JOIN authz.permission_scope_kind scope_kind ON scope_kind.permission_id=permission.id AND scope_kind.scope_kind='company_code' AND scope_kind.propagation_mode='exact' AND scope_kind.status='active'
 JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
 WHERE member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND (member.effective_until IS NULL OR member.effective_until>now()) AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
   AND p_tenant_id=shared.current_tenant_id()
   AND p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id
   AND EXISTS(SELECT 1 FROM master.principal principal WHERE principal.tenant_id=member.tenant_id AND principal.id=member.principal_id AND principal.status='active')
   AND NOT EXISTS(SELECT 1 FROM authz.deny_rule deny WHERE deny.tenant_id=member.tenant_id AND deny.permission_id=permission.id AND deny.status='active' AND deny.effective_from<=now() AND (deny.effective_until IS NULL OR deny.effective_until>now()) AND (deny.subject_kind='tenant' OR (deny.subject_kind='principal' AND deny.principal_id=member.principal_id) OR (deny.subject_kind='group' AND EXISTS(SELECT 1 FROM authz.group_member denied_member WHERE denied_member.tenant_id=member.tenant_id AND denied_member.principal_id=member.principal_id AND denied_member.group_id=deny.group_id AND denied_member.status='active' AND denied_member.effective_from<=now() AND (denied_member.effective_until IS NULL OR denied_member.effective_until>now())))))
   ORDER BY member.principal_id LIMIT 200;
$$;
REVOKE ALL ON FUNCTION document.fn_company_setup_case_approvers(uuid,uuid,uuid) FROM PUBLIC;
DO $grants$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION document.fn_company_setup_case_approvers(uuid,uuid,uuid) TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION document.fn_company_setup_case_approvers(uuid,uuid,uuid) TO athyperadmin; END IF;
END $grants$;

-- Company setup reference permissions. No role assignment or human access.
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id,value.code,'entity_operation',module.id,CASE WHEN value.mfa THEN 'high' ELSE 'low' END,value.mfa,value.sod,false,false,false,
 '{"_seed":{"pack":"neon.company-setup-case-permissions","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
('5501da5d-5d50-520d-ab62-30f2377210eb'::uuid,'neon.relationship.bp_company_setup_request.read',false,false),
('a7d03b8a-3ac5-5735-ba1c-2a717fd1651c'::uuid,'neon.relationship.bp_company_setup_request.create',false,false),
('bd16524d-88a1-5000-b8d5-6653c2a531cf'::uuid,'neon.relationship.bp_company_setup_request.update',false,false),
('1854e00f-efbc-5497-b398-8fd6b9457365'::uuid,'neon.relationship.bp_company_setup_request.validate',false,false),
('00cc6d29-b788-5cfe-af69-9f3f53120c91'::uuid,'neon.relationship.bp_company_setup_request.submit',false,true),
('bff4ba92-f62b-5252-9551-16a023cad379'::uuid,'neon.relationship.bp_company_setup_request.decide',true,true),
('e93f2c94-3a00-5b6d-a3ca-ce752f2eb440'::uuid,'neon.relationship.bp_company_setup_request.materialize',true,true)
) value(id,code,mfa,sod)
JOIN control.module module ON module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'company_code','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission
WHERE canonical_code LIKE 'neon.relationship.bp_company_setup_request.%'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
DO $catalog$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code LIKE 'neon.relationship.bp_company_setup_request.%' AND status='published')<>7 THEN RAISE EXCEPTION 'Company setup permission catalog incomplete'; END IF;
END $catalog$;

COMMIT;
