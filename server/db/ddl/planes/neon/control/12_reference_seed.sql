INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible, metadata, status, created_by
)
VALUES (
    'master.warehouse_type',
    'Warehouse Type',
    'Inventory storage classification used by Neon warehouse master data.',
    'master',
    true,
    '{"configurability":"tenant_extensible"}'::jsonb,
    'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = EXCLUDED.source_schema,
    is_extensible = EXCLUDED.is_extensible,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, sort_order,
    is_system, metadata, status, created_by
)
SELECT NULL, value.code, value.name, 'master.warehouse_type',
       value.description, value.sort_order, true, '{}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM (VALUES
      ('raw', 'Raw Materials', 'Raw material and purchased component storage.', 10::smallint),
      ('finished_goods', 'Finished Goods', 'Finished product and trading-goods storage.', 20::smallint),
      ('spares', 'Spares', 'Maintenance, repair and operating spare-parts storage.', 30::smallint),
      ('transit', 'In Transit', 'Goods currently controlled in transit.', 40::smallint),
      ('returns', 'Returns', 'Customer or supplier return staging.', 50::smallint)
  ) AS value(code, name, description, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    status = 'active';

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    supports_bank_account,
    sort_order, status, created_by
)
VALUES (
    NULL, 'tenant', 'Tenant',
    'Plane-local tenant root with headquarters address and functional contacts.',
    'identity', 'platform',
    'master', 'tenant', 'id',
    true, 'id',
    true, true, true, true,
    10, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column, is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference, supports_bank_account,
    sort_order, status, created_by
) VALUES (
    NULL, 'principal', 'Principal', 'Authenticated tenant principal contact owner.',
    'identity', 'platform', 'master', 'principal', 'id', true, 'tenant_id',
    false, true, true, false, 20, 'active', '00000000-0000-0000-0000-000000000000'::uuid
) ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT ot.id, p.capability, p.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type ot
 CROSS JOIN (
    VALUES
        ('address', 'default'),
        ('address', 'correspondence'),
        ('address', 'bill_from'),
        ('address', 'bill_to'),
        ('address', 'ship_from'),
        ('address', 'ship_to'),
        ('address', 'place_of_service'),
        ('address', 'remit_to'),
        ('contact', 'default'),
        ('contact', 'correspondence'),
        ('contact', 'notification'),
        ('contact', 'support'),
        ('bank_account', 'default'),
        ('bank_account', 'treasury'),
        ('bank_account', 'escrow')
 ) AS p(capability, purpose_code)
 WHERE ot.tenant_id IS NULL
   AND (ot.code = 'tenant' OR (ot.code = 'principal' AND p.capability = 'contact'))
ON CONFLICT DO NOTHING;

-- Canonical business-partner identity and its thin commercial roles.
INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    supports_bank_account,
    sort_order, status, created_by
)
VALUES
    (NULL, 'business_partner', 'Business Partner',
     'Canonical Neon commercial counterparty identity.',
     'party', 'platform',
     'master', 'business_partner', 'id', true, 'tenant_id',
     true, true, true, true, 60, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'supplier', 'Supplier',
     'Procurement/AP role. Address and contact links are role overrides; bank ownership resolves through the business partner.',
     'party', 'platform',
     'master', 'supplier', 'id', true, 'tenant_id',
     true, true, true, false, 70, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'customer', 'Customer',
     'Sales/AR role. Address and contact links are role overrides; bank ownership resolves through the business partner.',
     'party', 'platform',
     'master', 'customer', 'id', true, 'tenant_id',
     true, true, true, false, 80, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT owner_type.id, purpose.capability, purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS owner_type
 CROSS JOIN (
    VALUES
        ('address', 'default'),
        ('address', 'correspondence'),
        ('address', 'bill_from'),
        ('address', 'bill_to'),
        ('address', 'ship_from'),
        ('address', 'ship_to'),
        ('address', 'remit_to'),
        ('contact', 'default'),
        ('contact', 'correspondence'),
        ('contact', 'notification'),
        ('contact', 'sales'),
        ('contact', 'procurement')
 ) AS purpose(capability, purpose_code)
 WHERE owner_type.tenant_id IS NULL
   AND owner_type.code IN ('business_partner', 'supplier', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT owner_type.id, 'bank_account', purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS owner_type
 CROSS JOIN (
    VALUES
        ('default'),
        ('disbursement'),
        ('collection'),
        ('escrow')
 ) AS purpose(purpose_code)
 WHERE owner_type.tenant_id IS NULL
   AND owner_type.code = 'business_partner'
ON CONFLICT DO NOTHING;

INSERT INTO control.owner_type (
    tenant_id, code, name, description, category, source_type,
    target_schema, target_table, pk_column,
    is_tenant_scoped, tenant_column,
    supports_address, supports_contact, supports_external_reference,
    supports_bank_account,
    sort_order, status, created_by
)
VALUES
    (NULL, 'legal_entity', 'Legal Entity',
     'Neon statutory organization.', 'organization', 'platform',
     'master', 'legal_entity', 'id', true, 'tenant_id',
     true, true, true, true, 20, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'company_code', 'Company Code',
     'Neon accounting and balancing entity.', 'organization', 'platform',
     'master', 'company_code', 'id', true, 'tenant_id',
     true, true, true, true, 30, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'operating_organization', 'Operating Organization',
     'Neon procurement or sales coordination boundary.', 'organization', 'platform',
     'master', 'operating_organization', 'id', true, 'tenant_id',
     true, true, true, false, 40, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'org_unit', 'Organization Unit',
     'Neon workforce hierarchy node.', 'organization', 'platform',
     'master', 'org_unit', 'id', true, 'tenant_id',
     true, true, true, false, 50, 'active',
     '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT ot.id, purpose.capability, purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS ot
 CROSS JOIN (
    VALUES
        ('address', 'default'),
        ('address', 'correspondence'),
        ('address', 'bill_from'),
        ('address', 'bill_to'),
        ('address', 'ship_from'),
        ('address', 'ship_to'),
        ('address', 'remit_to'),
        ('contact', 'default'),
        ('contact', 'correspondence'),
        ('contact', 'notification')
 ) AS purpose(capability, purpose_code)
 WHERE ot.tenant_id IS NULL
   AND ot.code IN (
       'legal_entity', 'company_code', 'operating_organization', 'org_unit'
   )
ON CONFLICT DO NOTHING;

INSERT INTO control.owner_type_purpose (
    owner_type_id, capability, purpose_code, created_by
)
SELECT ot.id, 'bank_account', purpose.purpose_code,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM control.owner_type AS ot
 CROSS JOIN (
    VALUES
        ('default'),
        ('disbursement'),
        ('collection'),
        ('payroll'),
        ('treasury'),
        ('escrow'),
        ('petty_cash'),
        ('tax')
 ) AS purpose(purpose_code)
 WHERE ot.tenant_id IS NULL
   AND ot.code IN ('legal_entity', 'company_code')
ON CONFLICT DO NOTHING;

DO $publish$
DECLARE
  tenant record;
  v_cycle_type_id uuid;
  v_phase_id uuid;
  v_category_id uuid;
  v_invitation_id uuid;
  v_registration_id uuid;
  v_duplicate_id uuid;
  v_qualification_id uuid;
  template_body jsonb;
  v_template_hash text;
  preview jsonb;
  v_revision_no integer;
BEGIN
  FOR tenant IN
    SELECT t.id tenant_id, p.id principal_id
      FROM master.tenant t
      JOIN LATERAL (
        SELECT id FROM master.principal p
         WHERE p.tenant_id=t.id AND p.status='active'
         ORDER BY p.created_at,p.id LIMIT 1
      ) p ON true
     WHERE t.status='active'
  LOOP
    INSERT INTO control.lookup_value(tenant_id,code,name,domain_code,description,sort_order,is_system,metadata,status,created_by)
    VALUES(tenant.tenant_id,'business_partner_onboarding','Business Partner Onboarding','governance.cycle_domain','Supplier invitation, registration, duplicate review, and qualification.',60,false,'{"owner":"master.business_partner"}'::jsonb,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,domain_code,code) WHERE tenant_id IS NOT NULL DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,metadata=EXCLUDED.metadata,status='active',updated_at=now(),updated_by=EXCLUDED.created_by;

    INSERT INTO control.cycle_type(tenant_id,code,name,description,domain_code,frequency,clean_cycle_policy,approval_policy,run_data_schema,task_data_schema,status,created_by)
    VALUES(tenant.tenant_id,'BP_SUPPLIER_ONBOARDING','Supplier onboarding','Invitation through supplier qualification for a governed Business Partner case.','business_partner_onboarding','adhoc','{"requiredTasks":["INVITATION","REGISTRATION","DUPLICATE_REVIEW","QUALIFICATION"]}'::jsonb,'{"qualificationUsesCaseApproval":true}'::jsonb,'{"type":"object"}'::jsonb,'{"type":"object"}'::jsonb,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,clean_cycle_policy=EXCLUDED.clean_cycle_policy,approval_policy=EXCLUDED.approval_policy,status='active',updated_at=now(),updated_by=EXCLUDED.created_by
    RETURNING id INTO v_cycle_type_id;

    INSERT INTO control.cycle_phase(tenant_id,cycle_type_id,code,name,description,sort_order,is_gate_enforced,minimum_readiness_pct,status,created_by)
    VALUES(tenant.tenant_id,v_cycle_type_id,'ONBOARDING','Onboarding','Supplier intake and qualification gates.',1,true,100,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,cycle_type_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_gate_enforced=true,minimum_readiness_pct=100,status='active',updated_at=now(),updated_by=EXCLUDED.created_by
    RETURNING id INTO v_phase_id;

    INSERT INTO control.cycle_task_category(tenant_id,cycle_type_id,code,name,description,sort_order,color_code,status,created_by)
    VALUES(tenant.tenant_id,v_cycle_type_id,'SUPPLIER_INTAKE','Supplier intake','Event-driven supplier onboarding work.',10,'#24558F','active',tenant.principal_id)
    ON CONFLICT(tenant_id,cycle_type_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status='active',updated_at=now(),updated_by=EXCLUDED.created_by
    RETURNING id INTO v_category_id;

    INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
      (tenant.tenant_id,v_cycle_type_id,v_phase_id,v_category_id,'master.business_partner','INVITATION','Invitation','Invitee accepted, or an internal direct request was created.','system','business_partner_onboarding_event',true,false,10,true,'{"events":["business_partner_invitation.supplier.accepted","business_partner.case.created"]}'::jsonb,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,completion_mode=EXCLUDED.completion_mode,system_check_handler=EXCLUDED.system_check_handler,applicability=EXCLUDED.applicability,status='active',updated_at=now(),updated_by=EXCLUDED.created_by RETURNING id INTO v_invitation_id;
    INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
      (tenant.tenant_id,v_cycle_type_id,v_phase_id,v_category_id,'master.business_partner','REGISTRATION','Registration','A validated supplier registration was submitted.','system','business_partner_onboarding_event',true,false,20,true,'{"events":["business_partner.case.submitted"]}'::jsonb,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,completion_mode=EXCLUDED.completion_mode,system_check_handler=EXCLUDED.system_check_handler,applicability=EXCLUDED.applicability,status='active',updated_at=now(),updated_by=EXCLUDED.created_by RETURNING id INTO v_registration_id;
    INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
      (tenant.tenant_id,v_cycle_type_id,v_phase_id,v_category_id,'master.business_partner','DUPLICATE_REVIEW','Duplicate review','Record duplicate-screening evidence; block when validation identifies a blocking match.','hybrid','business_partner_duplicate_review',true,false,30,true,'{"events":["business_partner.case.submitted"],"blockWhen":"duplicateSummary.blocking"}'::jsonb,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,completion_mode=EXCLUDED.completion_mode,system_check_handler=EXCLUDED.system_check_handler,applicability=EXCLUDED.applicability,status='active',updated_at=now(),updated_by=EXCLUDED.created_by RETURNING id INTO v_duplicate_id;
    INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
      (tenant.tenant_id,v_cycle_type_id,v_phase_id,v_category_id,'master.business_partner','QUALIFICATION','Qualification','Configured approval workflow qualified the supplier.','system','business_partner_onboarding_event',true,false,40,true,'{"events":["business_partner.case.approved"]}'::jsonb,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,completion_mode=EXCLUDED.completion_mode,system_check_handler=EXCLUDED.system_check_handler,applicability=EXCLUDED.applicability,status='active',updated_at=now(),updated_by=EXCLUDED.created_by RETURNING id INTO v_qualification_id;

    INSERT INTO control.cycle_task_dependency(tenant_id,cycle_type_id,predecessor_template_id,successor_template_id,dependency_type,is_hard,status,created_by) VALUES
      (tenant.tenant_id,v_cycle_type_id,v_invitation_id,v_registration_id,'finish_to_start',true,'active',tenant.principal_id),
      (tenant.tenant_id,v_cycle_type_id,v_registration_id,v_duplicate_id,'finish_to_start',true,'active',tenant.principal_id),
      (tenant.tenant_id,v_cycle_type_id,v_duplicate_id,v_qualification_id,'finish_to_start',true,'active',tenant.principal_id)
    ON CONFLICT(tenant_id,cycle_type_id,predecessor_template_id,successor_template_id) DO UPDATE SET dependency_type=EXCLUDED.dependency_type,is_hard=true,status='active',updated_at=now(),updated_by=EXCLUDED.created_by;

    template_body := jsonb_build_object(
      'cycleType',jsonb_build_object('id',v_cycle_type_id,'code','BP_SUPPLIER_ONBOARDING','name','Supplier onboarding','domainCode','business_partner_onboarding','frequency','adhoc','cleanCyclePolicy',jsonb_build_object('requiredTasks',jsonb_build_array('INVITATION','REGISTRATION','DUPLICATE_REVIEW','QUALIFICATION')),'approvalPolicy',jsonb_build_object('qualificationUsesCaseApproval',true),'runDataSchema',jsonb_build_object('type','object'),'taskDataSchema',jsonb_build_object('type','object')),
      'phases',jsonb_build_array(jsonb_build_object('id',v_phase_id,'code','ONBOARDING','name','Onboarding','sortOrder',1,'isGateEnforced',true,'minimumReadinessPct',100)),
      'categories',jsonb_build_array(jsonb_build_object('id',v_category_id,'code','SUPPLIER_INTAKE','name','Supplier intake','sortOrder',10)),
      'tasks',jsonb_build_array(
        jsonb_build_object('id',v_invitation_id,'phaseId',v_phase_id,'categoryId',v_category_id,'entityCode','master.business_partner','code','INVITATION','name','Invitation','completionMode','system','systemCheckHandler','business_partner_onboarding_event','isMandatory',true,'isWaivable',false,'sortOrder',10,'applicability',jsonb_build_object('events',jsonb_build_array('business_partner_invitation.supplier.accepted','business_partner.case.created'))),
        jsonb_build_object('id',v_registration_id,'phaseId',v_phase_id,'categoryId',v_category_id,'entityCode','master.business_partner','code','REGISTRATION','name','Registration','completionMode','system','systemCheckHandler','business_partner_onboarding_event','isMandatory',true,'isWaivable',false,'sortOrder',20,'applicability',jsonb_build_object('events',jsonb_build_array('business_partner.case.submitted'))),
        jsonb_build_object('id',v_duplicate_id,'phaseId',v_phase_id,'categoryId',v_category_id,'entityCode','master.business_partner','code','DUPLICATE_REVIEW','name','Duplicate review','completionMode','hybrid','systemCheckHandler','business_partner_duplicate_review','isMandatory',true,'isWaivable',false,'sortOrder',30,'applicability',jsonb_build_object('events',jsonb_build_array('business_partner.case.submitted'),'blockWhen','duplicateSummary.blocking')),
        jsonb_build_object('id',v_qualification_id,'phaseId',v_phase_id,'categoryId',v_category_id,'entityCode','master.business_partner','code','QUALIFICATION','name','Qualification','completionMode','system','systemCheckHandler','business_partner_onboarding_event','isMandatory',true,'isWaivable',false,'sortOrder',40,'applicability',jsonb_build_object('events',jsonb_build_array('business_partner.case.approved')))
      ),
      'dependencies',jsonb_build_array(
        jsonb_build_object('predecessorTemplateId',v_invitation_id,'successorTemplateId',v_registration_id,'dependencyType','finish_to_start','isHard',true),
        jsonb_build_object('predecessorTemplateId',v_registration_id,'successorTemplateId',v_duplicate_id,'dependencyType','finish_to_start','isHard',true),
        jsonb_build_object('predecessorTemplateId',v_duplicate_id,'successorTemplateId',v_qualification_id,'dependencyType','finish_to_start','isHard',true)
      ),'crossDependencies','[]'::jsonb,'carryForwardRules','[]'::jsonb
    );
    v_template_hash := encode(digest(convert_to(template_body::text,'UTF8'),'sha256'),'hex');
    preview := jsonb_build_object('schema','athyper.cycle-template/1.0','template',template_body,'templateHash',v_template_hash,'valid',true,'issues','[]'::jsonb,'topologicalTaskIds',jsonb_build_array(v_invitation_id,v_registration_id,v_duplicate_id,v_qualification_id));
    IF NOT EXISTS(SELECT 1 FROM control.cycle_template_revision r WHERE r.tenant_id=tenant.tenant_id AND r.cycle_type_id=v_cycle_type_id AND r.idempotency_key='business-partner-onboarding-v1') THEN
      SELECT COALESCE(max(r.revision_number),0)+1 INTO v_revision_no FROM control.cycle_template_revision r WHERE r.tenant_id=tenant.tenant_id AND r.cycle_type_id=v_cycle_type_id;
      INSERT INTO control.cycle_template_revision(tenant_id,cycle_type_id,revision_number,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by)
      VALUES(tenant.tenant_id,v_cycle_type_id,v_revision_no,preview,v_template_hash,ARRAY[v_invitation_id,v_registration_id,v_duplicate_id,v_qualification_id],'business-partner-onboarding-v1',tenant.principal_id,tenant.principal_id);
    END IF;
  END LOOP;
END $publish$;

DO $assert$ BEGIN
  IF EXISTS(SELECT 1 FROM master.tenant t WHERE t.status='active' AND EXISTS(SELECT 1 FROM master.principal p WHERE p.tenant_id=t.id AND p.status='active') AND NOT EXISTS(SELECT 1 FROM control.cycle_type c JOIN control.cycle_template_revision r ON r.tenant_id=c.tenant_id AND r.cycle_type_id=c.id WHERE c.tenant_id=t.id AND c.code='BP_SUPPLIER_ONBOARDING' AND c.status='active')) THEN
    RAISE EXCEPTION 'Release 4 supplier onboarding template was not published for every eligible tenant';
  END IF;
END $assert$;

DO $publish$
DECLARE tenant record; cycle_id uuid; phase_id uuid; category_id uuid; prior jsonb; body jsonb; preview jsonb; template_hash text; revision_no int;
  qualification_id uuid; registration_id uuid; verification_id uuid; readiness_id uuid; activation_id uuid;
BEGIN
 FOR tenant IN SELECT t.id tenant_id,p.id principal_id FROM master.tenant t JOIN LATERAL(SELECT id FROM master.principal p WHERE p.tenant_id=t.id AND p.status='active' ORDER BY p.created_at,p.id LIMIT 1)p ON true WHERE t.status='active' LOOP
  SELECT id INTO cycle_id FROM control.cycle_type WHERE tenant_id=tenant.tenant_id AND code='BP_SUPPLIER_ONBOARDING';
  IF cycle_id IS NULL THEN RAISE EXCEPTION 'Release 4 supplier onboarding cycle is required for tenant %',tenant.tenant_id; END IF;
  SELECT id INTO phase_id FROM control.cycle_phase WHERE tenant_id=tenant.tenant_id AND cycle_type_id=cycle_id AND code='ONBOARDING';
  SELECT id INTO category_id FROM control.cycle_task_category WHERE tenant_id=tenant.tenant_id AND cycle_type_id=cycle_id AND code='SUPPLIER_INTAKE';
  SELECT id INTO qualification_id FROM control.cycle_task_template WHERE tenant_id=tenant.tenant_id AND cycle_type_id=cycle_id AND code='QUALIFICATION';
  INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
   (tenant.tenant_id,cycle_id,phase_id,category_id,'master.bank_account','BANK_REGISTRATION','Protected bank registration','Bank identifier was tokenized; only masked and fingerprint evidence entered NEON.','system','business_partner_onboarding_event',true,false,50,true,'{"events":["business_partner.bank_registration.protected"]}'::jsonb,'active',tenant.principal_id)
  ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=excluded.name,description=excluded.description,applicability=excluded.applicability,status='active',updated_at=now(),updated_by=excluded.created_by RETURNING id INTO registration_id;
  INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
   (tenant.tenant_id,cycle_id,phase_id,category_id,'master.bank_account','BANK_VERIFICATION','Independent bank verification','A principal other than the registrant verified the beneficiary account and evidence.','system','business_partner_onboarding_event',true,false,60,true,'{"events":["business_partner.bank_verification.verified"],"makerChecker":true}'::jsonb,'active',tenant.principal_id)
  ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=excluded.name,description=excluded.description,applicability=excluded.applicability,status='active',updated_at=now(),updated_by=excluded.created_by RETURNING id INTO verification_id;
  INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
   (tenant.tenant_id,cycle_id,phase_id,category_id,'master.supplier','SUPPLIER_READINESS','Supplier readiness','Current role, scope, qualification, risk, block, payment-term, and bank gates passed.','system','business_partner_onboarding_event',true,false,70,true,'{"events":["business_partner.supplier.readiness.completed"],"volatileRecheck":true}'::jsonb,'active',tenant.principal_id)
  ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=excluded.name,description=excluded.description,applicability=excluded.applicability,status='active',updated_at=now(),updated_by=excluded.created_by RETURNING id INTO readiness_id;
  INSERT INTO control.cycle_task_template(tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,description,completion_mode,system_check_handler,is_mandatory,is_waivable,sort_order,auto_start_when_ready,applicability,status,created_by) VALUES
   (tenant.tenant_id,cycle_id,phase_id,category_id,'master.supplier','ACTIVATION','Supplier activation','An independently approved activation case invoked the readiness-pinned activation command.','system','business_partner_onboarding_event',true,false,80,true,'{"events":["business_partner.supplier.activated"],"requiresEntityCase":true}'::jsonb,'active',tenant.principal_id)
  ON CONFLICT(tenant_id,cycle_type_id,entity_code,code) DO UPDATE SET name=excluded.name,description=excluded.description,applicability=excluded.applicability,status='active',updated_at=now(),updated_by=excluded.created_by RETURNING id INTO activation_id;
  INSERT INTO control.cycle_task_dependency(tenant_id,cycle_type_id,predecessor_template_id,successor_template_id,dependency_type,is_hard,status,created_by) VALUES
   (tenant.tenant_id,cycle_id,qualification_id,registration_id,'finish_to_start',true,'active',tenant.principal_id),(tenant.tenant_id,cycle_id,registration_id,verification_id,'finish_to_start',true,'active',tenant.principal_id),(tenant.tenant_id,cycle_id,verification_id,readiness_id,'finish_to_start',true,'active',tenant.principal_id),(tenant.tenant_id,cycle_id,readiness_id,activation_id,'finish_to_start',true,'active',tenant.principal_id)
  ON CONFLICT(tenant_id,cycle_type_id,predecessor_template_id,successor_template_id) DO UPDATE SET dependency_type=excluded.dependency_type,is_hard=true,status='active',updated_at=now(),updated_by=excluded.created_by;
  UPDATE control.cycle_type SET description='Invitation through protected banking, readiness, and explicit supplier activation.',clean_cycle_policy='{"requiredTasks":["INVITATION","REGISTRATION","DUPLICATE_REVIEW","QUALIFICATION","BANK_REGISTRATION","BANK_VERIFICATION","SUPPLIER_READINESS","ACTIVATION"]}'::jsonb,approval_policy='{"qualificationUsesCaseApproval":true,"activationRequiresCaseApproval":true,"bankMakerChecker":true}'::jsonb,updated_at=now(),updated_by=tenant.principal_id WHERE id=cycle_id;
  IF NOT EXISTS(SELECT 1 FROM control.cycle_template_revision WHERE tenant_id=tenant.tenant_id AND cycle_type_id=cycle_id AND idempotency_key='business-partner-onboarding-v2') THEN
   SELECT template_json->'template' INTO prior FROM control.cycle_template_revision WHERE tenant_id=tenant.tenant_id AND cycle_type_id=cycle_id ORDER BY revision_number DESC LIMIT 1;
   body:=jsonb_set(jsonb_set(prior,'{cycleType,cleanCyclePolicy}','{"requiredTasks":["INVITATION","REGISTRATION","DUPLICATE_REVIEW","QUALIFICATION","BANK_REGISTRATION","BANK_VERIFICATION","SUPPLIER_READINESS","ACTIVATION"]}'::jsonb),'{cycleType,approvalPolicy}','{"qualificationUsesCaseApproval":true,"activationRequiresCaseApproval":true,"bankMakerChecker":true}'::jsonb);
   body:=jsonb_set(body,'{tasks}',body->'tasks'||jsonb_build_array(jsonb_build_object('id',registration_id,'phaseId',phase_id,'categoryId',category_id,'entityCode','master.bank_account','code','BANK_REGISTRATION','name','Protected bank registration','completionMode','system','isMandatory',true,'isWaivable',false,'sortOrder',50),jsonb_build_object('id',verification_id,'phaseId',phase_id,'categoryId',category_id,'entityCode','master.bank_account','code','BANK_VERIFICATION','name','Independent bank verification','completionMode','system','isMandatory',true,'isWaivable',false,'sortOrder',60),jsonb_build_object('id',readiness_id,'phaseId',phase_id,'categoryId',category_id,'entityCode','master.supplier','code','SUPPLIER_READINESS','name','Supplier readiness','completionMode','system','isMandatory',true,'isWaivable',false,'sortOrder',70),jsonb_build_object('id',activation_id,'phaseId',phase_id,'categoryId',category_id,'entityCode','master.supplier','code','ACTIVATION','name','Supplier activation','completionMode','system','isMandatory',true,'isWaivable',false,'sortOrder',80)));
   body:=jsonb_set(body,'{dependencies}',body->'dependencies'||jsonb_build_array(jsonb_build_object('predecessorTemplateId',qualification_id,'successorTemplateId',registration_id,'dependencyType','finish_to_start','isHard',true),jsonb_build_object('predecessorTemplateId',registration_id,'successorTemplateId',verification_id,'dependencyType','finish_to_start','isHard',true),jsonb_build_object('predecessorTemplateId',verification_id,'successorTemplateId',readiness_id,'dependencyType','finish_to_start','isHard',true),jsonb_build_object('predecessorTemplateId',readiness_id,'successorTemplateId',activation_id,'dependencyType','finish_to_start','isHard',true)));
   template_hash:=encode(digest(convert_to(body::text,'UTF8'),'sha256'),'hex');SELECT coalesce(max(revision_number),0)+1 INTO revision_no FROM control.cycle_template_revision WHERE tenant_id=tenant.tenant_id AND cycle_type_id=cycle_id;
   preview:=jsonb_build_object('schema','athyper.cycle-template/1.0','template',body,'templateHash',template_hash,'valid',true,'issues','[]'::jsonb,'topologicalTaskIds',(SELECT jsonb_agg(value->>'id') FROM jsonb_array_elements(body->'tasks')value));
   INSERT INTO control.cycle_template_revision(tenant_id,cycle_type_id,revision_number,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by) SELECT tenant.tenant_id,cycle_id,revision_no,preview,template_hash,array_agg((value->>'id')::uuid),'business-partner-onboarding-v2',tenant.principal_id,tenant.principal_id FROM jsonb_array_elements(body->'tasks')value;
  END IF;
 END LOOP;
END $publish$;

DO $assert$ BEGIN IF EXISTS(SELECT 1 FROM master.tenant t WHERE t.status='active' AND NOT EXISTS(SELECT 1 FROM control.cycle_type c JOIN control.cycle_template_revision r ON r.tenant_id=c.tenant_id AND r.cycle_type_id=c.id WHERE c.tenant_id=t.id AND c.code='BP_SUPPLIER_ONBOARDING' AND r.idempotency_key='business-partner-onboarding-v2')) THEN RAISE EXCEPTION 'Release 5 onboarding revision was not published for every tenant'; END IF; END $assert$;
