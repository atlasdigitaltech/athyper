BEGIN;
DO $$
DECLARE
  tenant uuid; other_tenant uuid; maker uuid; checker uuid;
  supplier_org uuid; customer_org uuid; contract_id uuid:=gen_random_uuid();
  contract_entity_id uuid:=gen_random_uuid(); release_id uuid:=gen_random_uuid(); revision_id uuid:=gen_random_uuid();
  cycle_type_id uuid:=gen_random_uuid(); phase_id uuid:=gen_random_uuid(); category_id uuid:=gen_random_uuid();
  template_id uuid:=gen_random_uuid(); template_revision_id uuid:=gen_random_uuid();
  case_id uuid; run_id uuid; task_id uuid; form_id uuid; payload jsonb; scenario text;
  scenarios text[]:=ARRAY['buyer_requested_supplier','supplier_self_registration','internal_only_business_partner','customer_onboarding'];
  result record; legacy_before bigint; i integer;
BEGIN
  SELECT p.tenant_id,(array_agg(p.id ORDER BY p.id))[1],(array_agg(p.id ORDER BY p.id))[2]
    INTO tenant,maker,checker FROM master.principal p WHERE p.status='active'
     AND EXISTS(SELECT 1 FROM master.operating_organization o WHERE o.tenant_id=p.tenant_id AND o.status='active' AND o.domain IN('procurement','both'))
     AND EXISTS(SELECT 1 FROM master.operating_organization o WHERE o.tenant_id=p.tenant_id AND o.status='active' AND o.domain IN('sales','both'))
   GROUP BY p.tenant_id HAVING count(*)>=2 ORDER BY p.tenant_id LIMIT 1;
  SELECT candidate.id INTO other_tenant FROM master.tenant candidate
   WHERE candidate.id<>tenant ORDER BY candidate.id LIMIT 1;
  SELECT id INTO supplier_org FROM master.operating_organization
   WHERE tenant_id=tenant AND status='active' AND domain IN('procurement','both') ORDER BY id LIMIT 1;
  SELECT id INTO customer_org FROM master.operating_organization
   WHERE tenant_id=tenant AND status='active' AND domain IN('sales','both') ORDER BY id LIMIT 1;
  IF tenant IS NULL OR maker=checker OR other_tenant IS NULL OR supplier_org IS NULL OR customer_org IS NULL THEN
    RAISE EXCEPTION 'G5 Business Partner matrix requires two actors, another tenant, and active procurement/sales organizations';
  END IF;
  SELECT count(*) INTO legacy_before FROM document.business_partner_request WHERE tenant_id=tenant;
  PERFORM set_config('app.current_tenant_id',tenant::text,true);
  PERFORM set_config('app.current_principal_id',maker::text,true);

  INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,
    release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,
    publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at)
  VALUES(contract_id,tenant,contract_entity_id,'master.business_partner',release_id,revision_id,1,
    'athyper.entity-contract','1.0.0',repeat('9',64),
    '{"type":"object","required":["businessPartnerCode","name","ownershipClass"],"additionalProperties":false,"properties":{"businessPartnerCode":{"type":"string"},"name":{"type":"string"},"displayName":{"type":"string"},"legalName":{"type":"string"},"legalForm":{"type":"string"},"registrationCountryCode":{"type":"string"},"incorporationDate":{"type":"string"},"websiteUrl":{"type":"string"},"description":{"type":"string"},"ownershipClass":{"type":"string"},"requestedRole":{"type":"string"},"roleCode":{"type":"string"},"registrationChannel":{"type":"string"},"operatingOrganizationId":{"type":"string"},"meshRegistrationExchangeId":{"type":"string"},"meshRegistrationEvidenceHash":{"type":"string"},"bankDisclosureReceiptId":{"type":"string"},"bankDisclosurePurposeCode":{"type":"string"},"qualificationTypeCode":{"type":"string"},"preferenceRationale":{"type":"string"},"companyCodeId":{"type":"string"},"commodityCategoryId":{"type":"string"},"preflight":{"type":"object"}}}'::jsonb,
    'g5.business-partner-matrix','ed25519','g5-key','probe',clock_timestamp()-interval '1 second','published',clock_timestamp());
  INSERT INTO control.cycle_type(id,tenant_id,code,name,domain_code,frequency,status,status_changed_at,status_changed_by,created_by)
   VALUES(cycle_type_id,tenant,'G5.BP.MATRIX','G5 Business Partner matrix','governance_review','adhoc','active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_phase(id,tenant_id,cycle_type_id,code,name,sort_order,status,status_changed_at,status_changed_by,created_by)
   VALUES(phase_id,tenant,cycle_type_id,'REVIEW','Review',1,'active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_task_category(id,tenant_id,cycle_type_id,code,name,status,status_changed_at,status_changed_by,created_by)
   VALUES(category_id,tenant,cycle_type_id,'APPROVAL','Approval','active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_task_template(id,tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,completion_mode,status,status_changed_at,status_changed_by,created_by)
   VALUES(template_id,tenant,cycle_type_id,phase_id,category_id,'document.entity_case','DECIDE','Decide','manual','active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_template_revision(id,tenant_id,cycle_type_id,revision_number,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by)
   VALUES(template_revision_id,tenant,cycle_type_id,1,'{}',repeat('8',64),ARRAY[template_id],'g5-bp-matrix-template',maker,maker);

  FOR i IN 1..array_length(scenarios,1) LOOP
    scenario:=scenarios[i]; case_id:=gen_random_uuid(); run_id:=gen_random_uuid(); task_id:=gen_random_uuid(); form_id:=gen_random_uuid();
    payload:=CASE scenario
      WHEN 'buyer_requested_supplier' THEN jsonb_build_object(
        'businessPartnerCode','G5.BUYER.SUPPLIER','name','Buyer Requested Supplier','ownershipClass','external',
        'requestedRole','supplier','roleCode','G5.BUYER.SUPPLIER','registrationChannel','buyer_request',
        'operatingOrganizationId',supplier_org,'meshRegistrationExchangeId',gen_random_uuid(),
        'meshRegistrationEvidenceHash',repeat('6',64),'bankDisclosureReceiptId',gen_random_uuid(),
        'bankDisclosurePurposeCode','supplier_onboarding',
        'qualificationTypeCode','compliance','preferenceRationale','Approved buyer nomination')
      WHEN 'supplier_self_registration' THEN jsonb_build_object(
        'businessPartnerCode','G5.SELF.SUPPLIER','name','Self Registered Supplier','ownershipClass','external',
        'requestedRole','supplier','roleCode','G5.SELF.SUPPLIER','registrationChannel','supplier_self_registration',
        'operatingOrganizationId',supplier_org,'meshRegistrationExchangeId',gen_random_uuid(),
        'meshRegistrationEvidenceHash',repeat('5',64),'qualificationTypeCode','compliance','preflight',
        jsonb_build_object('trust','passed','rate','passed','duplicate','passed','sponsorPolicy','approved'))
      WHEN 'customer_onboarding' THEN jsonb_build_object(
        'businessPartnerCode','G5.CUSTOMER','name','Governed Customer','ownershipClass','external',
        'requestedRole','customer','roleCode','G5.CUSTOMER','registrationChannel','customer_onboarding',
        'operatingOrganizationId',customer_org)
      ELSE jsonb_build_object('businessPartnerCode','G5.INTERNAL','name','Internal Business Partner','ownershipClass','internal')
    END;
    INSERT INTO governance.cycle_run(id,tenant_id,cycle_type_id,template_revision_id,template_revision_number,
      template_hash,code,name,idempotency_key,status,created_by)
    VALUES(run_id,tenant,cycle_type_id,template_revision_id,1,repeat('8',64),'G5.BP.RUN.'||i,
      scenario,'g5-bp-run-'||i,'draft',maker);
    INSERT INTO governance.cycle_task(id,tenant_id,cycle_run_id,cycle_type_id,task_template_id,phase_id,
      code,name,completion_mode,owner_principal_id,status,created_by)
    VALUES(task_id,tenant,run_id,cycle_type_id,template_id,phase_id,'DECIDE.'||i,scenario,'manual',checker,'pending',maker);
    PERFORM document.command_entity_case_draft(tenant,case_id,0,NULL,'G5.BP.'||i,'master.business_partner',
      'register',NULL,'g5-bp-case-'||i,contract_id,repeat('9',64),form_id,1,repeat('7',64),payload,
      'g5-bp-draft-'||i,maker,NULL);
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'submit',1,run_id,task_id,NULL,
      'g5-bp-submit-'||i,maker,NULL);
    PERFORM set_config('app.current_principal_id',checker::text,true);
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'approve',2,run_id,task_id,NULL,
      'g5-bp-approve-'||i,checker,NULL);
    IF scenario='internal_only_business_partner' THEN
      SELECT * INTO result FROM master.command_materialize_internal_business_partner_case(
        tenant,case_id,3,'g5-bp-materialize-'||i,checker,NULL);
      IF result.replayed OR EXISTS(SELECT 1 FROM master.supplier s WHERE s.business_partner_id=result.business_partner_id)
         OR EXISTS(SELECT 1 FROM master.customer c WHERE c.business_partner_id=result.business_partner_id) THEN
        RAISE EXCEPTION 'Internal-only Business Partner crossed a commercial-role boundary';
      END IF;
    ELSE
      SELECT * INTO result FROM master.command_materialize_business_partner_role_case(
        tenant,case_id,3,'g5-bp-materialize-'||i,checker,NULL);
      IF result.replayed OR result.case_status<>'materialized' OR result.row_version<>4 THEN
        RAISE EXCEPTION 'G5 % materialization failed',scenario;
      END IF;
      IF scenario LIKE '%supplier%' AND (
          NOT EXISTS(SELECT 1 FROM master.supplier s WHERE (s.tenant_id,s.id,s.business_partner_id)=(tenant,result.role_id,result.business_partner_id) AND s.status='active')
          OR NOT EXISTS(SELECT 1 FROM control.business_partner_qualification q WHERE q.tenant_id=tenant AND q.id=result.qualification_id AND q.role_id=result.role_id AND q.decision='pending')
          OR (scenario='buyer_requested_supplier' AND NOT EXISTS(SELECT 1 FROM control.supplier_preference_designation d WHERE d.tenant_id=tenant AND d.id=result.preference_id AND d.supplier_id=result.role_id AND d.status='pending'))) THEN
        RAISE EXCEPTION 'G5 % supplier authority projection failed',scenario;
      END IF;
      IF scenario='customer_onboarding' AND NOT EXISTS(
        SELECT 1 FROM master.customer c WHERE (c.tenant_id,c.id,c.business_partner_id)=(tenant,result.role_id,result.business_partner_id) AND c.status='prospect') THEN
        RAISE EXCEPTION 'G5 customer authority projection failed';
      END IF;
      SELECT * INTO result FROM master.command_materialize_business_partner_role_case(
        tenant,case_id,3,'g5-bp-materialize-'||i,checker,NULL);
      IF NOT result.replayed THEN RAISE EXCEPTION 'G5 % exact replay failed',scenario; END IF;
    END IF;
    PERFORM set_config('app.current_principal_id',maker::text,true);
  END LOOP;

  PERFORM set_config('app.current_principal_id',checker::text,true);
  BEGIN
    PERFORM master.command_materialize_business_partner_role_case(tenant,case_id,3,'g5-bp-stale-proof',checker,NULL);
    RAISE EXCEPTION 'G5 stale materialization accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM master.command_materialize_business_partner_role_case(other_tenant,case_id,4,'g5-bp-tenant-proof',checker,NULL);
    RAISE EXCEPTION 'G5 wrong-tenant materialization accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM document.business_partner_request WHERE tenant_id=tenant)<>legacy_before THEN
    RAISE EXCEPTION 'G5 governed matrix wrote legacy Business Partner request storage';
  END IF;
  IF (SELECT count(*) FROM document.entity_case_materialization WHERE tenant_id=tenant
      AND materializer_code IN('neon.internal_business_partner','neon.business_partner_role'))<>4
     OR (SELECT count(*) FROM event.outbox WHERE tenant_id=tenant AND aggregate_type='entity_case'
      AND aggregate_id IN(SELECT id FROM document.entity_case WHERE tenant_id=tenant AND case_code LIKE 'G5.BP.%'))<16 THEN
    RAISE EXCEPTION 'G5 scenario matrix lacks atomic materialization/outbox evidence';
  END IF;
END $$;
ROLLBACK;
SELECT 'G5_BUSINESS_PARTNER_SCENARIO_MATRIX_ROLLBACK_OK';
