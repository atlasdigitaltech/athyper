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
    '{"type":"object","required":["businessPartnerCode","name","ownershipClass"],"additionalProperties":false,"properties":{"businessPartnerCode":{"type":"string"},"name":{"type":"string"},"displayName":{"type":"string"},"legalName":{"type":"string"},"legalForm":{"type":"string"},"registrationCountryCode":{"type":"string"},"incorporationDate":{"type":"string"},"websiteUrl":{"type":"string"},"description":{"type":"string"},"ownershipClass":{"type":"string"},"requestedRole":{"type":"string"},"roleCode":{"type":"string"},"registrationChannel":{"type":"string"},"operatingOrganizationId":{"type":"string"},"meshRegistrationExchangeId":{"type":"string"},"meshRegistrationEvidenceHash":{"type":"string"},"bankDisclosureReceiptId":{"type":"string"},"bankDisclosurePurposeCode":{"type":"string"},"qualificationTypeCode":{"type":"string"},"preferenceRationale":{"type":"string"},"companyCodeId":{"type":"string"},"commodityCategoryId":{"type":"string"},"preflight":{"type":"object"},"relationshipProposals":{"type":"object"},"legalClassification":{"type":"string"}}}'::jsonb,
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
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'submit',1,run_id,task_id,NULL,
      'g5-bp-submit-'||i,maker,NULL);
    PERFORM set_config('app.current_principal_id',checker::text,true);
    PERFORM document.command_entity_case_lifecycle(tenant,case_id,'approve',2,run_id,task_id,NULL,
      'g5-bp-approve-'||i,checker,NULL);
    SELECT * INTO result FROM master.command_materialize_business_partner_role_case(tenant,case_id,3,'full-profile-materialize',checker,NULL);
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
    SELECT * INTO result FROM master.command_materialize_business_partner_role_case(tenant,case_id,3,'full-profile-materialize',checker,NULL);
    IF NOT result.replayed OR (SELECT count(*) FROM master.business_partner_alias WHERE business_partner_id=result.business_partner_id)<>1 THEN RAISE EXCEPTION 'Replay duplicated profile rows'; END IF;
  END LOOP;
END $$;
ROLLBACK;
