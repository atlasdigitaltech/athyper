\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.r4_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.event_type='entity.case.materialized' AND current_setting('test.r4_fail_outbox',true)='on' THEN
  RAISE EXCEPTION 'R4 injected outbox failure' USING ERRCODE='P0002';
 END IF; RETURN NEW; END $$;
CREATE TRIGGER r4_fail_outbox BEFORE INSERT ON event.outbox FOR EACH ROW EXECUTE FUNCTION pg_temp.r4_fail_outbox();
DO $$
DECLARE
  tenant uuid; other_tenant uuid; maker uuid; checker uuid;
  supplier_org uuid; customer_org uuid; contract_id uuid:=gen_random_uuid();
  contract_entity_id uuid:=gen_random_uuid(); release_id uuid:=gen_random_uuid(); revision_id uuid:=gen_random_uuid();
  cycle_type_id uuid:=gen_random_uuid(); phase_id uuid:=gen_random_uuid(); category_id uuid:=gen_random_uuid();
  template_id uuid:=gen_random_uuid(); template_revision_id uuid:=gen_random_uuid();
  case_id uuid; run_id uuid; task_id uuid; form_id uuid; payload jsonb; scenario text;
  scenarios text[]:=ARRAY['buyer_requested_supplier','supplier_self_registration','internal_only_business_partner','customer_onboarding'];
  result record; replay record; legacy_before bigint; i integer; bp_id uuid:=gen_random_uuid(); supplier_id uuid:=gen_random_uuid(); before_count bigint;
 legal_id uuid:=gen_random_uuid();company_id uuid:=gen_random_uuid();org_id uuid:=gen_random_uuid();profile_id uuid:=gen_random_uuid();
 source_tenant uuid:=gen_random_uuid();source_account uuid:=gen_random_uuid();recipient_account uuid:=gen_random_uuid();relationship_id uuid:=gen_random_uuid();publication_id uuid:=gen_random_uuid();
 profile_inbox uuid:=gen_random_uuid();profile_snapshot uuid:=gen_random_uuid();profile_projection uuid:=gen_random_uuid();external_id uuid:=gen_random_uuid();account_link uuid:=gen_random_uuid();
 bank_inbox uuid:=gen_random_uuid();bank_snapshot uuid:=gen_random_uuid();bank_projection uuid:=gen_random_uuid();disclosure_id uuid:=gen_random_uuid();
BEGIN
  SELECT tenant_id,id INTO tenant,maker FROM master.principal ORDER BY id LIMIT 1;
  checker:=gen_random_uuid();
  INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by)
   VALUES(checker,tenant,'r4.checker','R4 checker','user','active',maker);
  PERFORM set_config('app.database_plane','neon',true);
  PERFORM set_config('app.current_tenant_id',tenant::text,true);
  PERFORM set_config('app.current_principal_id',maker::text,true);

  INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,
    release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,
    publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at)
  VALUES(contract_id,tenant,contract_entity_id,'master.business_partner',release_id,revision_id,1,
    'athyper.entity-contract','1.0.0',repeat('9',64),
    '{"type":"object","required":["businessPartnerCode","name","ownershipClass"],"additionalProperties":false,"properties":{"businessPartnerCode":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"displayName":{"type":"string"},"legalName":{"type":"string"},"legalForm":{"type":"string"},"registrationCountryCode":{"type":"string"},"incorporationDate":{"type":"string"},"websiteUrl":{"type":"string"},"description":{"type":"string"},"ownershipClass":{"type":"string","enum":["internal","external"]},"requestedRole":{"type":"string","enum":["supplier","customer"]},"roleCode":{"type":"string"},"registrationChannel":{"type":"string"},"operatingOrganizationId":{"type":"string"},"meshRegistrationExchangeId":{"type":"string"},"meshRegistrationEvidenceHash":{"type":"string"},"bankDisclosureReceiptId":{"type":"string"},"bankDisclosurePurposeCode":{"type":"string"},"qualificationTypeCode":{"type":"string"},"preferenceRationale":{"type":"string"},"companyCodeId":{"type":"string"},"commodityCategoryId":{"type":"string"},"preflight":{"type":"object"},"supplierType":{"type":"string"},"customerType":{"type":"string"},"expectedBusinessPartnerVersion":{"type":"integer","minimum":1},"priorStatus":{"type":"string"},"reasonCode":{"type":"string"},"dependencies":{"type":"array"},"bankProjectionId":{"type":"string"},"supplierCompanyProfileId":{"type":"string"},"expectedBankSnapshotId":{"type":"string"},"priorBankLinkId":{"type":"string"}}}'::jsonb,
    'g5.business-partner-matrix','ed25519','g5-key','probe',clock_timestamp()-interval '1 second','published',clock_timestamp());
  INSERT INTO control.cycle_type(id,tenant_id,code,name,domain_code,frequency,status,status_changed_at,status_changed_by,created_by)
   VALUES(cycle_type_id,tenant,'R4.BP.MATRIX','G5 Business Partner matrix','governance_review','adhoc','active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_phase(id,tenant_id,cycle_type_id,code,name,sort_order,status,status_changed_at,status_changed_by,created_by)
   VALUES(phase_id,tenant,cycle_type_id,'REVIEW','Review',1,'active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_task_category(id,tenant_id,cycle_type_id,code,name,status,status_changed_at,status_changed_by,created_by)
   VALUES(category_id,tenant,cycle_type_id,'APPROVAL','Approval','active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_task_template(id,tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,completion_mode,status,status_changed_at,status_changed_by,created_by)
   VALUES(template_id,tenant,cycle_type_id,phase_id,category_id,'document.entity_case','DECIDE','Decide','manual','active',clock_timestamp(),maker,maker);
  INSERT INTO control.cycle_template_revision(id,tenant_id,cycle_type_id,revision_number,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by)
   VALUES(template_revision_id,tenant,cycle_type_id,1,'{}',repeat('8',64),ARRAY[template_id],'g5-bp-matrix-template',maker,maker);


  INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,ownership_class,status,created_by)
   VALUES(bp_id,tenant,'R4.BP.TEST','R4 BP','organization','external','active',maker);
  INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,status,created_by)
   VALUES(supplier_id,tenant,bp_id,'R4.SUP.TEST','onboarding',maker);
  INSERT INTO master.legal_entity(id,tenant_id,code,name,legal_name,functional_currency,status,created_by)
   VALUES(legal_id,tenant,'r4.legal','R4 Legal','R4 Legal','USD','active',maker);
  INSERT INTO master.company_code(id,tenant_id,legal_entity_id,code,name,functional_currency,status,created_by)
   VALUES(company_id,tenant,legal_id,'r4.company','R4 Company','USD','active',maker);
  INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,status,created_by)
   VALUES(org_id,tenant,'r4.procurement','R4 Procurement','procurement','active',maker);
  INSERT INTO master.operating_organization_company_assignment(tenant_id,operating_organization_id,company_code_id,status,created_by)
   VALUES(tenant,org_id,company_id,'active',maker);
  INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,status,created_by)
   VALUES(tenant,bp_id,org_id,'supplier','active',maker);
  INSERT INTO master.company_code_supplier_profile(id,tenant_id,supplier_id,company_code_id,status,created_by)
   VALUES(profile_id,tenant,supplier_id,company_id,'active',maker);
  INSERT INTO control.mesh_business_partner_profile_inbox(id,tenant_id,event_id,event_type,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,lifecycle_version,schema_code,schema_version,field_set_code,payload_hash,envelope_json,envelope_hash,occurred_at,received_by)
   VALUES(profile_inbox,tenant,gen_random_uuid(),'business_partner.profile_publication.published',source_tenant,source_account,recipient_account,relationship_id,publication_id,1,1,'mesh.business_partner_profile',1,'recipient_safe_v1',repeat('a',64),'{}',repeat('a',64),clock_timestamp(),maker);
  INSERT INTO snapshot.mesh_business_partner_profile_received(id,tenant_id,inbox_event_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,schema_code,schema_version,field_set_code,payload_json,payload_hash,received_by)
   VALUES(profile_snapshot,tenant,profile_inbox,source_tenant,source_account,recipient_account,relationship_id,publication_id,1,'mesh.business_partner_profile',1,'recipient_safe_v1','{}',repeat('a',64),maker);
  INSERT INTO control.mesh_business_partner_profile_projection(id,tenant_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,current_publication_id,current_publication_version,current_lifecycle_version,current_snapshot_id,last_inbox_event_id,projection_status,updated_by)
   VALUES(profile_projection,tenant,source_tenant,source_account,recipient_account,relationship_id,publication_id,1,1,profile_snapshot,profile_inbox,'active',maker);
  INSERT INTO master.external_reference(id,tenant_id,owner_type_id,owner_id,source_system_code,external_entity_code,external_id,created_by)
   VALUES(external_id,tenant,(SELECT id FROM control.owner_type WHERE code='business_partner'),bp_id,'athyper_mesh','network_account',source_account::text,maker);
  INSERT INTO control.mesh_business_partner_account_link(id,tenant_id,profile_projection_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,business_partner_id,proposed_role,idempotency_key,status,decision_fingerprint,reviewed_at,reviewed_by,approved_at,approved_by,external_reference_id,created_by)
   VALUES(account_link,tenant,profile_projection,source_tenant,source_account,recipient_account,relationship_id,bp_id,'supplier','r4-account-link','active',repeat('b',64),clock_timestamp(),checker,clock_timestamp(),checker,external_id,maker);
  INSERT INTO control.mesh_bank_account_disclosure_inbox(id,tenant_id,event_id,event_type,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,disclosure_id,disclosure_version,lifecycle_version,payload_hash,envelope_json,envelope_hash,occurred_at,received_by)
   VALUES(bank_inbox,tenant,gen_random_uuid(),'mesh.bank_account.disclosed',source_tenant,source_account,recipient_account,relationship_id,disclosure_id,1,1,repeat('c',64),'{}',repeat('c',64),clock_timestamp(),maker);
  INSERT INTO snapshot.mesh_bank_account_disclosure_received(id,tenant_id,inbox_event_id,source_tenant_id,network_relationship_id,disclosure_id,disclosure_version,lifecycle_version,payload_json,payload_hash,received_by)
   VALUES(bank_snapshot,tenant,bank_inbox,source_tenant,relationship_id,disclosure_id,1,1,'{}',repeat('c',64),maker);
  INSERT INTO control.mesh_bank_account_projection(id,tenant_id,account_link_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,current_disclosure_id,current_disclosure_version,current_lifecycle_version,current_snapshot_id,last_inbox_event_id,account_fingerprint,projection_status,updated_by)
   VALUES(bank_projection,tenant,account_link,source_tenant,source_account,recipient_account,relationship_id,disclosure_id,1,1,bank_snapshot,bank_inbox,repeat('d',64),'available',maker);

  FOR i IN 0..4 LOOP
    scenario:=CASE i WHEN 0 THEN 'change_bank' WHEN 1 THEN 'deactivate' WHEN 2 THEN 'reactivate' WHEN 3 THEN 'archive' ELSE 'deactivate' END;
    case_id:=gen_random_uuid();run_id:=gen_random_uuid();task_id:=gen_random_uuid();form_id:=gen_random_uuid();
    payload:=jsonb_build_object('businessPartnerCode','R4.BP.TEST','name','R4 BP','ownershipClass','external','expectedBusinessPartnerVersion',GREATEST(1,LEAST(i,4)),'priorStatus',CASE i WHEN 0 THEN 'active' WHEN 1 THEN 'active' WHEN 2 THEN 'inactive' WHEN 3 THEN 'active' ELSE 'archived' END,'reasonCode','R4_TEST');
    IF i=0 THEN payload:=payload||jsonb_build_object('requestedRole','supplier','operatingOrganizationId',org_id,'companyCodeId',company_id,'bankProjectionId',bank_projection,'supplierCompanyProfileId',profile_id,'expectedBankSnapshotId',bank_snapshot); END IF;
    PERFORM set_config('app.current_principal_id',maker::text,true);
    INSERT INTO governance.cycle_run(id,tenant_id,cycle_type_id,template_revision_id,template_revision_number,
      template_hash,code,name,idempotency_key,status,created_by)
    VALUES(run_id,tenant,cycle_type_id,template_revision_id,1,repeat('8',64),'R4.BP.RUN.'||i,scenario,'r4-bp-run-'||i,'draft',maker);
    INSERT INTO governance.cycle_task(id,tenant_id,cycle_run_id,cycle_type_id,task_template_id,phase_id,
      code,name,completion_mode,owner_principal_id,status,created_by)
    VALUES(task_id,tenant,run_id,cycle_type_id,template_id,phase_id,'DECIDE.'||i,scenario,'manual',checker,'pending',maker);
    PERFORM document.command_entity_case_draft(tenant,case_id,0,NULL,'R4.BP.'||i,'master.business_partner',
      scenario,bp_id,'r4-bp-case-'||i,contract_id,repeat('9',64),form_id,1,repeat('7',64),payload,'r4-bp-draft-'||i,maker,NULL);
    BEGIN
      PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,1,'r4-unapproved-'||i,maker,NULL);
      RAISE EXCEPTION 'Unapproved case was materialized';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
    -- Submission must consume validation of the current immutable snapshot.
    BEGIN
      PERFORM document.command_entity_case_lifecycle(tenant,case_id,'submit',1,run_id,task_id,NULL,'r4-unvalidated-'||i,maker,NULL);
      RAISE EXCEPTION 'Unvalidated case was submitted';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
    PERFORM document.command_entity_case_validation(tenant,case_id,1,gen_random_uuid(),
      'r4.integration','1',repeat('6',64),
      '[{"messageCode":"R4_CONTRACT_VALID","severity":"info","ruleCode":"r4.contract","outcome":"passed"}]'::jsonb,
      '{"outcome":"passed"}'::jsonb,'{}'::jsonb,'{}'::jsonb,'r4-validation-'||i,maker,NULL);
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'submit',2,run_id,task_id,NULL,'r4-bp-submit-'||i,maker,NULL);
    BEGIN
      PERFORM document.command_entity_case_lifecycle(tenant,case_id,'approve',3,run_id,task_id,NULL,'r4-self-approve-'||i,maker,NULL);
      RAISE EXCEPTION 'Maker approved their own case';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('app.current_principal_id',checker::text,true);
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'approve',3,run_id,task_id,NULL,'r4-bp-approve-'||i,checker,NULL);
    IF i=4 THEN
      BEGIN
        PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,4,'r4-invalid-transition',checker,NULL);
        RAISE EXCEPTION 'Terminal transition was accepted';
      EXCEPTION WHEN check_violation THEN NULL; END;
      IF EXISTS(SELECT 1 FROM event.command_execution WHERE tenant_id=tenant AND idempotency_key='r4-invalid-transition') THEN RAISE EXCEPTION 'Failed command retained partial execution'; END IF;
      RAISE NOTICE 'R4 PASS: archived partner rejects further lifecycle mutation';
      CONTINUE;
    END IF;
    BEGIN
      PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,2,'r4-stale-case-'||i,checker,NULL);
      RAISE EXCEPTION 'Stale case was accepted';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
    IF i IN(0,1) THEN
      PERFORM set_config('test.r4_fail_outbox','on',true);
      BEGIN
        PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,4,'r4-injected-'||i,checker,NULL);
        RAISE EXCEPTION 'Injected outbox failure did not occur';
      EXCEPTION WHEN no_data_found THEN NULL; END;
      PERFORM set_config('test.r4_fail_outbox','off',true);
      IF EXISTS(SELECT 1 FROM event.command_execution WHERE tenant_id=tenant AND idempotency_key='r4-injected-'||i)
       OR EXISTS(SELECT 1 FROM document.entity_case_materialization WHERE tenant_id=tenant AND entity_case_id=case_id)
       OR NOT EXISTS(SELECT 1 FROM document.entity_case WHERE id=case_id AND status='approved' AND row_version=4)
       OR NOT EXISTS(SELECT 1 FROM master.business_partner WHERE id=bp_id AND status='active' AND record_version=1)
       OR (i=0 AND EXISTS(SELECT 1 FROM document.business_partner_bank_verification WHERE business_partner_id=bp_id))
      THEN RAISE EXCEPTION 'Outbox failure leaked authority or evidence'; END IF;
    END IF;
    IF i=0 THEN
      BEGIN
        UPDATE control.mesh_bank_account_projection SET projection_status='revoked' WHERE id=bank_projection;
        BEGIN
          PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,4,'r4-revoked-bank',checker,NULL);
          RAISE EXCEPTION 'Revoked bank disclosure accepted';
        EXCEPTION WHEN check_violation THEN NULL; END;
        RAISE EXCEPTION 'rollback revoked fixture' USING ERRCODE='P0002';
      EXCEPTION WHEN no_data_found THEN NULL; END;
    END IF;
    IF i=1 THEN
      BEGIN
        PERFORM control.command_business_partner_lifecycle(tenant,'business_partner',bp_id,'inactive',1,'Concurrent change','r4-concurrent-change',checker);
        BEGIN
          PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,4,'r4-stale-aggregate',checker,NULL);
          RAISE EXCEPTION 'Stale aggregate accepted';
        EXCEPTION WHEN serialization_failure THEN NULL; END;
        RAISE EXCEPTION 'rollback concurrent fixture' USING ERRCODE='P0002';
      EXCEPTION WHEN no_data_found THEN NULL; END;
    END IF;
    -- Activation of a newer contract must not invalidate an already approved case.
    UPDATE runtime_meta.entity_contract SET status='superseded' WHERE id=contract_id;
    SELECT * INTO result FROM master.command_materialize_business_partner_change_case(tenant,case_id,4,'r4-materialize-'||i,checker,NULL);
    IF result.case_status<>'materialized' OR result.row_version<>5 OR result.business_partner_id<>bp_id
      OR NOT EXISTS(SELECT 1 FROM master.business_partner WHERE id=bp_id
        AND status=CASE i WHEN 0 THEN 'active' WHEN 1 THEN 'inactive' WHEN 2 THEN 'active' ELSE 'archived' END
        AND record_version=CASE WHEN i=0 THEN 1 ELSE i+1 END)
    THEN RAISE EXCEPTION 'R4 did not materialize the requested native authority state'; END IF;
    BEGIN
      UPDATE document.entity_case SET row_version=row_version+1 WHERE id=case_id;
      RAISE EXCEPTION 'Direct case mutation was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('app.current_principal_id',maker::text,true);
    BEGIN
      PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,4,'r4-wrong-actor-'||i,checker,NULL);
      RAISE EXCEPTION 'Actor mismatch was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('app.current_principal_id',checker::text,true);
    SELECT * INTO replay FROM master.command_materialize_business_partner_change_case(tenant,case_id,4,'r4-materialize-'||i,checker,NULL);
    IF result.replayed OR NOT replay.replayed OR result.result_snapshot_id<>replay.result_snapshot_id OR result.outbox_id<>replay.outbox_id OR result.role_id IS NOT NULL THEN RAISE EXCEPTION 'R4 replay/result authority mismatch'; END IF;
    IF i=0 AND (result.bank_verification_id IS NULL OR NOT EXISTS(SELECT 1 FROM document.business_partner_bank_verification WHERE id=result.bank_verification_id AND status='pending_verification' AND created_by=maker)
      OR EXISTS(SELECT 1 FROM master.company_code_supplier_profile WHERE id=profile_id AND preferred_remittance_bank_link_id IS NOT NULL)) THEN RAISE EXCEPTION 'Bank case must start independent verification without switching remittance'; END IF;
    BEGIN
      PERFORM master.command_materialize_business_partner_change_case(tenant,case_id,5,'r4-materialize-'||i,checker,NULL);
      RAISE EXCEPTION 'Conflicting key was accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    IF NOT EXISTS(SELECT 1 FROM master.supplier WHERE id=supplier_id AND status='onboarding' AND record_version=1) THEN RAISE EXCEPTION 'Partner lifecycle changed Supplier authority'; END IF;
    IF (SELECT count(*) FROM document.entity_case_materialization WHERE tenant_id=tenant AND entity_case_id=case_id)<>1
      OR (SELECT count(*) FROM snapshot.entity_case_snapshot_lineage WHERE tenant_id=tenant AND entity_case_id=case_id AND transformation_code='neon.business_partner_change')<>1 THEN RAISE EXCEPTION 'R4 materialization proof duplicated or absent'; END IF;
    UPDATE runtime_meta.entity_contract SET status='published' WHERE id=contract_id;
    RAISE NOTICE 'R4 PASS: % native materialization, replay, authority state and evidence', scenario;
  END LOOP;
END $$;
ROLLBACK;
