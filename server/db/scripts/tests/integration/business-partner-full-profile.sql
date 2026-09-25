-- Reversible governed prototype materialization; synthetic values only.
BEGIN;
DO $$
DECLARE
  tenant uuid; other_tenant uuid; maker uuid; checker uuid;
  supplier_org uuid; customer_org uuid; contract_id uuid:=gen_random_uuid();
  contract_entity_id uuid:=gen_random_uuid(); release_id uuid:=gen_random_uuid(); revision_id uuid:=gen_random_uuid();
  cycle_type_id uuid:=gen_random_uuid(); phase_id uuid:=gen_random_uuid(); category_id uuid:=gen_random_uuid();
  template_id uuid:=gen_random_uuid(); template_revision_id uuid:=gen_random_uuid();
  case_id uuid; run_id uuid; task_id uuid; form_id uuid; payload jsonb; scenario text;
  scenarios text[]:=ARRAY['full_profile'];
  tax_jurisdiction uuid:=gen_random_uuid(); commodity uuid:=gen_random_uuid(); related_partner uuid:=gen_random_uuid(); industry uuid; industry_domain text;
  result record; legacy_before bigint; i integer;
  activation_bp uuid; activation_case uuid; activation_run uuid; activation_task uuid; selected jsonb; pinned jsonb; activation_result record;
  evidence_series uuid:=gen_random_uuid(); evidence_file uuid:=gen_random_uuid(); evidence_certificate uuid;
BEGIN
  SELECT p.tenant_id,(array_agg(p.id ORDER BY p.id))[1],(array_agg(p.id ORDER BY p.id))[2]
    INTO tenant,maker,checker FROM master.principal p WHERE p.status='active'
     AND EXISTS(SELECT 1 FROM master.operating_organization o JOIN master.operating_organization_capability c ON c.tenant_id=o.tenant_id AND c.operating_organization_id=o.id AND c.capability_code='procurement' AND c.status='active' WHERE o.tenant_id=p.tenant_id AND o.status='active')
     AND EXISTS(SELECT 1 FROM master.operating_organization o JOIN master.operating_organization_capability c ON c.tenant_id=o.tenant_id AND c.operating_organization_id=o.id AND c.capability_code='sales' AND c.status='active' WHERE o.tenant_id=p.tenant_id AND o.status='active')
   GROUP BY p.tenant_id HAVING count(*)>=2 ORDER BY p.tenant_id LIMIT 1;
  SELECT candidate.id INTO other_tenant FROM master.tenant candidate
   WHERE candidate.id<>tenant ORDER BY candidate.id LIMIT 1;
  SELECT id INTO supplier_org FROM master.operating_organization
   WHERE tenant_id=tenant AND status='active' AND EXISTS(SELECT 1 FROM master.operating_organization_capability c WHERE c.tenant_id=master.operating_organization.tenant_id AND c.operating_organization_id=master.operating_organization.id AND c.capability_code='procurement' AND c.status='active') ORDER BY id LIMIT 1;
  SELECT id INTO customer_org FROM master.operating_organization
   WHERE tenant_id=tenant AND status='active' AND EXISTS(SELECT 1 FROM master.operating_organization_capability c WHERE c.tenant_id=master.operating_organization.tenant_id AND c.operating_organization_id=master.operating_organization.id AND c.capability_code='sales' AND c.status='active') ORDER BY id LIMIT 1;
  IF tenant IS NULL OR maker=checker OR other_tenant IS NULL OR supplier_org IS NULL OR customer_org IS NULL THEN
    RAISE EXCEPTION 'G5 Business Partner matrix requires two actors, another tenant, and active procurement/sales organizations';
  END IF;
  PERFORM set_config('app.current_tenant_id',tenant::text,true);
  PERFORM set_config('app.current_principal_id',maker::text,true);

  INSERT INTO master.tax_jurisdiction(id,tenant_id,code,name,jurisdiction_type,country_code,status,created_by)
  VALUES(tax_jurisdiction,tenant,'TEST.PROFILE.TAX','Synthetic tax jurisdiction','country','MY','active',maker);
  INSERT INTO master.commodity_category(id,tenant_id,code,name,status,created_by)
  VALUES(commodity,tenant,'TEST.PROFILE.COMMODITY','Synthetic commodity','active',maker);
  INSERT INTO master.business_partner(id,tenant_id,code,name,category_locked_by,created_by)
  VALUES(related_partner,tenant,'TEST.PROFILE.RELATED','Synthetic related organization',maker,maker);
  SELECT id,domain_code INTO industry,industry_domain FROM shared.industry_code WHERE status='active' ORDER BY id LIMIT 1;
  IF industry IS NULL THEN RAISE EXCEPTION 'An industry reference fixture is required'; END IF;

  INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,
    release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,
    publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at)
  VALUES(contract_id,tenant,contract_entity_id,'master.business_partner',release_id,revision_id,1,
    'athyper.entity-contract','1.0.0',repeat('9',64),
    '{"type":"object","required":["businessPartnerCode","name","ownershipClass"],"additionalProperties":false,"properties":{"businessPartnerCode":{"type":"string"},"name":{"type":"string"},"displayName":{"type":"string"},"legalName":{"type":"string"},"legalForm":{"type":"string"},"registrationCountryCode":{"type":"string"},"incorporationDate":{"type":"string"},"websiteUrl":{"type":"string"},"description":{"type":"string"},"ownershipClass":{"type":"string"},"requestedRole":{"type":"string"},"roleCode":{"type":"string"},"registrationChannel":{"type":"string"},"operatingOrganizationId":{"type":"string"},"meshRegistrationExchangeId":{"type":"string"},"meshRegistrationEvidenceHash":{"type":"string"},"bankDisclosureReceiptId":{"type":"string"},"bankDisclosurePurposeCode":{"type":"string"},"qualificationTypeCode":{"type":"string"},"preferenceRationale":{"type":"string"},"companyCodeId":{"type":"string"},"commodityCategoryId":{"type":"string"},"preflight":{"type":"object"},"relationshipProposals":{"type":"object"},"legalClassification":{"type":"string"},"childActivation":{"type":"object"},"expectedBusinessPartnerVersion":{"type":"integer"},"priorStatus":{"type":"string"},"reasonCode":{"type":"string"}}}'::jsonb,
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
    payload:=jsonb_build_object('businessPartnerCode','TEST.PROFILE.SUPPLIER','name','Full Profile Test Organization','ownershipClass','external','requestedRole','supplier','roleCode','TEST.PROFILE.SUPPLIER','registrationChannel','internal','operatingOrganizationId',supplier_org,'qualificationTypeCode','compliance','legalClassification','nonprofit','relationshipProposals',jsonb_build_object(
 'addresses',jsonb_build_array(jsonb_build_object('clientItemKey','address-1','definitionFieldCode','address.primary','purpose','default','countryCode','MY','isPrimary',true,'normalizedHash',repeat('a',64))),
 'contactPersons',jsonb_build_array(jsonb_build_object('clientItemKey','contact-1','definitionFieldCode','contact.primary','contactName','Test Contact','isPrimary',true)),
 'contactChannels',jsonb_build_array(jsonb_build_object('clientItemKey','channel-1','contactClientItemKey','contact-1','definitionFieldCode','contact.email','channelType','email','value','profile-test@example.invalid','purpose','default','isPrimary',true)),
 'aliases',jsonb_build_array(jsonb_build_object('clientItemKey','alias-1','aliasName','Full Profile Trading','aliasKind','trading','isPrimary',true)),
 'identifiers',jsonb_build_array(jsonb_build_object('clientItemKey','identifier-1','schemeCode','business_registration','value','TEST-00001234','issuingCountryCode','MY','isPrimary',true)),
 'governanceRelations',jsonb_build_array(jsonb_build_object('clientItemKey','member-1','relationTypeCode','director','memberName','Test Director','memberType','individual','ownershipPct',25)),
 'taxRegistrations',jsonb_build_array(jsonb_build_object('clientItemKey','tax-1','jurisdictionId',tax_jurisdiction,'registrationTypeCode','vat','protectedValueToken','tax:synthetic-profile','maskedValue','****1234','valueHash',repeat('b',64))),
 'classifications',jsonb_build_array(jsonb_build_object('clientItemKey','commodity-1','classificationKind','commodity','referenceId',commodity,'partnerRole','supplier'),jsonb_build_object('clientItemKey','industry-1','classificationKind','industry','referenceId',industry,'domainCode',industry_domain,'isPrimary',true)),
 'relationships',jsonb_build_array(jsonb_build_object('clientItemKey','relationship-1','targetBusinessPartnerId',related_partner,'relationshipTypeCode','parent')),
 'certifications',jsonb_build_array(jsonb_build_object('clientItemKey','cert-1','customName','Test Certificate','certificateNumberToken','certificate:full-profile-test','certifiedBy','Test Issuer'))
));
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
    PERFORM document.command_entity_case_validation(tenant,case_id,1,gen_random_uuid(),'bp2.fixture','1',repeat('1',64),
      '[{"ruleCode":"fixture.valid","messageCode":"FIXTURE_VALID","severity":"info","outcome":"passed"}]'::jsonb,'{"outcome":"passed"}'::jsonb,'{}','{}','bp2-profile-validate',maker,NULL);
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'submit',2,run_id,task_id,NULL,
      'g5-bp-submit-'||i,maker,NULL);
    PERFORM set_config('app.current_principal_id',checker::text,true);
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'approve',3,run_id,task_id,NULL,
      'g5-bp-approve-'||i,checker,NULL);
    SELECT * INTO result FROM master.command_materialize_business_partner_role_case(tenant,case_id,4,'full-profile-materialize',checker,NULL);
    IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE id=result.business_partner_id AND legal_classification='nonprofit') THEN RAISE EXCEPTION 'Legal classification was lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_alias WHERE business_partner_id=result.business_partner_id AND alias_name='Full Profile Trading') THEN RAISE EXCEPTION 'Alias was lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_identifier WHERE business_partner_id=result.business_partner_id AND identifier_value='TEST-00001234' AND verified_at IS NULL) THEN RAISE EXCEPTION 'Identifier was lost or self-verified'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_governance_relation WHERE business_partner_id=result.business_partner_id AND ownership_pct=25 AND status='draft') THEN RAISE EXCEPTION 'Governance proposal was lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.certification WHERE owner_id=result.business_partner_id AND certificate_number='certificate:full-profile-test') THEN RAISE EXCEPTION 'Certificate token was lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_tax_registration WHERE business_partner_id=result.business_partner_id AND registration_number=repeat('B',64) AND metadata->>'protectedValueToken'='tax:synthetic-profile' AND status='draft') THEN RAISE EXCEPTION 'Protected tax proposal was lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_commodity_capability WHERE business_partner_id=result.business_partner_id AND commodity_category_id=commodity) THEN RAISE EXCEPTION 'Commodity proposal was lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_industry_classification WHERE business_partner_id=result.business_partner_id AND industry_code_id=industry AND assignment_kind='declared') THEN RAISE EXCEPTION 'Industry proposal was lost or self-verified'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_relationship WHERE source_business_partner_id=result.business_partner_id AND target_business_partner_id=related_partner) THEN RAISE EXCEPTION 'Relationship proposal was lost'; END IF;
    IF (SELECT count(*) FROM snapshot.entity_case_snapshot_lineage WHERE entity_case_id=case_id AND source_member_path LIKE '$.relationshipProposals.%')<>11 THEN RAISE EXCEPTION 'Child materialization lineage is incomplete'; END IF;
    SELECT * INTO result FROM master.command_materialize_business_partner_role_case(tenant,case_id,4,'full-profile-materialize',checker,NULL);
    IF NOT result.replayed OR (SELECT count(*) FROM master.business_partner_alias WHERE business_partner_id=result.business_partner_id)<>1 THEN RAISE EXCEPTION 'Replay duplicated profile rows'; END IF;
    activation_bp:=result.business_partner_id;
    SELECT jsonb_agg(jsonb_build_object('kind',kind,'id',id)) INTO selected FROM (
      SELECT 'identifier' kind,id FROM master.business_partner_identifier WHERE business_partner_id=activation_bp
      UNION ALL SELECT 'tax_registration',id FROM master.business_partner_tax_registration WHERE business_partner_id=activation_bp
      UNION ALL SELECT 'relationship',id FROM master.business_partner_relationship WHERE source_business_partner_id=activation_bp
      UNION ALL SELECT 'governance_relation',id FROM master.business_partner_governance_relation WHERE business_partner_id=activation_bp
      UNION ALL SELECT 'commodity_capability',id FROM master.business_partner_commodity_capability WHERE business_partner_id=activation_bp
      UNION ALL SELECT 'industry_classification',id FROM master.business_partner_industry_classification WHERE business_partner_id=activation_bp
    ) children;
    SELECT id INTO evidence_certificate FROM master.certification WHERE tenant_id=tenant AND owner_id=activation_bp;
    INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(evidence_series,tenant,maker);
    INSERT INTO document.attachment(id,tenant_id,series_id,file_name,content_type,size_bytes,sha256,storage_bucket,storage_key,status,is_active,is_virus_scanned,uploaded_by,created_by)
     VALUES(evidence_file,tenant,evidence_series,'synthetic-certificate.txt','text/plain',4,repeat('c',64),'synthetic-no-object','synthetic-no-object','active',true,true,maker,maker);
    UPDATE document.attachment_series SET current_attachment_id=evidence_file WHERE id=evidence_series;
    selected:=selected||jsonb_build_array(jsonb_build_object('kind','certificate_evidence','id',evidence_certificate,'attachmentId',evidence_file));
    BEGIN
      PERFORM master.fn_pin_business_partner_child_activation(tenant,activation_bp,selected,false);
      RAISE EXCEPTION 'Unlinked evidence accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,link_kind,created_by)
     VALUES(tenant,'business_partner',activation_bp::text,evidence_series,'context',maker);
    pinned:=master.fn_pin_business_partner_child_activation(tenant,activation_bp,selected,false);
    IF jsonb_array_length(pinned)<>7 THEN RAISE EXCEPTION 'Expected six activation rows and certificate binding'; END IF;
    BEGIN
      PERFORM master.fn_pin_business_partner_child_activation(tenant,related_partner,selected,false);
      RAISE EXCEPTION 'Wrong parent accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      PERFORM master.fn_pin_business_partner_child_activation(tenant,activation_bp,pinned||pinned,true);
      RAISE EXCEPTION 'Duplicate rows accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      PERFORM master.fn_pin_business_partner_child_activation(tenant,activation_bp,jsonb_set(pinned,'{0,fingerprint}',to_jsonb(repeat('0',64))),true);
      RAISE EXCEPTION 'Forged fingerprint accepted';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
    activation_case:=gen_random_uuid(); activation_run:=gen_random_uuid(); activation_task:=gen_random_uuid();
    PERFORM set_config('app.current_principal_id',maker::text,true);
    INSERT INTO governance.cycle_run(id,tenant_id,cycle_type_id,template_revision_id,template_revision_number,template_hash,code,name,idempotency_key,status,created_by)
    VALUES(activation_run,tenant,cycle_type_id,template_revision_id,1,repeat('8',64),'BP2.ACTIVATE','Child activation','bp2-child-activation-run','draft',maker);
    INSERT INTO governance.cycle_task(id,tenant_id,cycle_run_id,cycle_type_id,task_template_id,phase_id,code,name,completion_mode,owner_principal_id,status,created_by)
    VALUES(activation_task,tenant,activation_run,cycle_type_id,template_id,phase_id,'ACTIVATE','Activate children','manual',checker,'pending',maker);
    SELECT jsonb_build_object('businessPartnerCode',code,'name',name,'ownershipClass',ownership_class,
      'expectedBusinessPartnerVersion',record_version,'priorStatus',status,'reasonCode','PROFILE_ACCEPTED',
      'childActivation',jsonb_build_object('schema','athyper.bp-child-activation/1','items',pinned)) INTO payload
      FROM master.business_partner WHERE id=activation_bp;
    PERFORM document.command_entity_case_draft(tenant,activation_case,0,NULL,'BP2.ACTIVATE','master.business_partner','amend_partner',activation_bp,NULL,contract_id,repeat('9',64),form_id,1,repeat('7',64),payload,'bp2-child-draft',maker,NULL);
    BEGIN
      PERFORM master.command_materialize_business_partner_change_case(tenant,activation_case,1,'bp2-child-unapproved',maker,NULL);
      RAISE EXCEPTION 'Unapproved activation accepted';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
    PERFORM document.command_entity_case_validation(tenant,activation_case,1,gen_random_uuid(),'bp2.fixture','1',repeat('1',64),
      '[{"ruleCode":"fixture.valid","messageCode":"FIXTURE_VALID","severity":"info","outcome":"passed"}]'::jsonb,'{"outcome":"passed"}'::jsonb,'{}','{}','bp2-child-validate',maker,NULL);
    PERFORM document.command_entity_case_lifecycle(tenant,activation_case,'submit',2,activation_run,activation_task,NULL,'bp2-child-submit',maker,NULL);
    BEGIN
      PERFORM document.command_entity_case_lifecycle(tenant,activation_case,'approve',3,activation_run,activation_task,NULL,'bp2-child-self-approve',maker,NULL);
      RAISE EXCEPTION 'Self approval accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('app.current_principal_id',checker::text,true);
    PERFORM document.command_entity_case_lifecycle(tenant,activation_case,'approve',3,activation_run,activation_task,NULL,'bp2-child-approve',checker,NULL);
    BEGIN
      UPDATE master.business_partner_identifier SET issuing_authority='Changed after approval' WHERE business_partner_id=activation_bp;
      PERFORM master.command_materialize_business_partner_change_case(tenant,activation_case,4,'bp2-child-stale',checker,NULL);
      RAISE EXCEPTION 'Stale approved child accepted';
    EXCEPTION WHEN serialization_failure THEN NULL; END;
    SELECT * INTO activation_result FROM master.command_materialize_business_partner_change_case(tenant,activation_case,4,'bp2-child-materialize',checker,NULL);
    IF activation_result.case_status<>'materialized' OR activation_result.replayed THEN RAISE EXCEPTION 'Activation failed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.business_partner_identifier WHERE business_partner_id=activation_bp AND status='active' AND verified_at IS NULL)
      OR NOT EXISTS(SELECT 1 FROM master.business_partner_tax_registration WHERE business_partner_id=activation_bp AND status='active')
      OR NOT EXISTS(SELECT 1 FROM master.business_partner_relationship WHERE source_business_partner_id=activation_bp AND status='active')
      OR NOT EXISTS(SELECT 1 FROM master.business_partner_governance_relation WHERE business_partner_id=activation_bp AND status='active')
      OR NOT EXISTS(SELECT 1 FROM master.business_partner_commodity_capability WHERE business_partner_id=activation_bp AND status='active')
      OR NOT EXISTS(SELECT 1 FROM master.business_partner_industry_classification WHERE business_partner_id=activation_bp AND status='active' AND assignment_kind='declared') THEN RAISE EXCEPTION 'Activation changed verification or lost a child'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.certification WHERE id=evidence_certificate AND document_attachment_id=evidence_file AND status='active') THEN RAISE EXCEPTION 'Certificate evidence binding missing'; END IF;
    IF (SELECT count(*) FROM snapshot.entity_case_snapshot_lineage WHERE entity_case_id=activation_case AND transformation_code='neon.business_partner_child_activation')<>7 THEN RAISE EXCEPTION 'Activation lineage missing'; END IF;
    SELECT * INTO activation_result FROM master.command_materialize_business_partner_change_case(tenant,activation_case,4,'bp2-child-materialize',checker,NULL);
    IF NOT activation_result.replayed THEN RAISE EXCEPTION 'Activation replay failed'; END IF;
  END LOOP;
END $$;
ROLLBACK;
