-- Demo operating-organization hierarchy. "All operating organizations" is a
-- virtual system root and is deliberately not stored. Every Company Code gets
-- a default owner; shared nodes represent business ownership, never workflow teams.
DO $demo_operating_organizations$
DECLARE
  v_tenant_id uuid; v_actor uuid;
  v_meta constant jsonb := '{"_seed":{"pack":"demo.operating-organizations","version":"2.0.0"}}'::jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM master.tenant WHERE realm_key='athyper' AND code='athyper';
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION '[202_operating_organizations] demo tenant not found'; END IF;
  SELECT id INTO v_actor FROM master.principal WHERE tenant_id=v_tenant_id AND code='seed.three-plane-provisioner' AND status='active';
  IF v_actor IS NULL THEN RAISE EXCEPTION '[202_operating_organizations] demo seed principal not found'; END IF;
  PERFORM set_config('app.current_principal_id', v_actor::text, true);

  -- Level 2: one selectable fallback organization for each Company Code.
  INSERT INTO master.operating_organization (tenant_id,code,name,description,organization_kind,effective_from,metadata,status,created_by)
  SELECT v_tenant_id, lower(company.code) || '-company-operations', company.name || ' Operations',
         'Default owner for ' || company.name || ' transactions.', 'company_operations', current_date,
         v_meta || jsonb_build_object('context',jsonb_build_object('is_company_default',true)),'active',v_actor
    FROM master.company_code company WHERE company.tenant_id=v_tenant_id AND company.code NOT LIKE '%.ops'
  ON CONFLICT (tenant_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,organization_kind=EXCLUDED.organization_kind,metadata=master.operating_organization.metadata || EXCLUDED.metadata,status='active',updated_at=now(),updated_by=v_actor;

  -- Insert browse parents before their leaves. The authorization projection
  -- makes a parent immutable once an organization has been created.
  WITH seed(code,name,description) AS (VALUES
    ('global-shared-operations','Global Shared Operations','Browse node for global shared ownership.'),
    ('apac-shared-operations','APAC Shared Operations','Browse node for APAC shared ownership.'),
    ('gcc-shared-operations','GCC Shared Operations','Browse node for GCC shared ownership.'))
  INSERT INTO master.operating_organization (tenant_id,code,name,description,organization_kind,effective_from,metadata,status,created_by)
  SELECT v_tenant_id,code,name,description,'shared_operations',current_date,v_meta || jsonb_build_object('context',jsonb_build_object('is_browse_only',true)),'active',v_actor FROM seed
  ON CONFLICT (tenant_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,organization_kind=EXCLUDED.organization_kind,metadata=master.operating_organization.metadata || EXCLUDED.metadata,status='active',updated_at=now(),updated_by=v_actor;
  WITH seed(code,name,description,capability_code,parent_code) AS (VALUES
    ('global-strategic-sourcing','Global Strategic Sourcing','Cross-company strategic sourcing owner.','procurement','global-shared-operations'),
    ('global-enterprise-sales','Global Enterprise Sales','Cross-company enterprise sales owner.','sales','global-shared-operations'),
    ('apac-shared-procurement','APAC Shared Procurement','Regional procurement owner.','procurement','apac-shared-operations'),
    ('apac-shared-sales','APAC Shared Sales','Regional sales owner.','sales','apac-shared-operations'),
    ('gcc-shared-procurement','GCC Shared Procurement','Regional procurement owner.','procurement','gcc-shared-operations'),
    ('gcc-shared-sales','GCC Shared Sales','Regional sales owner.','sales','gcc-shared-operations'))
  INSERT INTO master.operating_organization (tenant_id,code,name,description,organization_kind,parent_operating_organization_id,effective_from,metadata,status,created_by)
  SELECT v_tenant_id,seed.code,seed.name,seed.description,'shared_operations',parent.id,current_date,v_meta,'active',v_actor
    FROM seed JOIN master.operating_organization parent ON parent.tenant_id=v_tenant_id AND parent.code=seed.parent_code
  ON CONFLICT (tenant_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,organization_kind=EXCLUDED.organization_kind,metadata=master.operating_organization.metadata || EXCLUDED.metadata,status='active',updated_at=now(),updated_by=v_actor;

  -- Direct default assignments for every Demo company.
  INSERT INTO master.operating_organization_company_assignment (tenant_id,operating_organization_id,company_code_id,participation_role,effective_from,metadata,status,created_by)
  SELECT v_tenant_id,org.id,company.id,'lead',current_date,v_meta,'active',v_actor
    FROM master.company_code company JOIN master.operating_organization org ON org.tenant_id=v_tenant_id AND org.code=lower(company.code)||'-company-operations'
   WHERE company.tenant_id=v_tenant_id AND company.code NOT LIKE '%.ops'
  ON CONFLICT (tenant_id,operating_organization_id,company_code_id,effective_from) DO UPDATE SET participation_role='lead',metadata=EXCLUDED.metadata,status='active',effective_until=NULL,updated_at=now(),updated_by=v_actor;

  -- Global leaves serve every company. APAC and GCC leaves serve only their
  -- approved participant companies; the first listed company is the lead.
  WITH membership(org_code,company_code,role) AS (VALUES
    ('global-strategic-sourcing','ATHQ','lead'),('global-enterprise-sales','ATHQ','lead'),
    ('apac-shared-procurement','ATHQ','lead'),('apac-shared-sales','ATHQ','lead'),
    ('gcc-shared-procurement','ASAC','lead'),('gcc-shared-sales','ASAC','lead'),
    ('apac-shared-procurement','AMRE','participant'),('apac-shared-procurement','ASGF','participant'),('apac-shared-procurement','AITM','participant'),('apac-shared-procurement','ATEM','participant'),('apac-shared-procurement','AJED','participant'),('apac-shared-procurement','APHS','participant'),
    ('apac-shared-sales','AMRE','participant'),('apac-shared-sales','ASGF','participant'),('apac-shared-sales','AITM','participant'),('apac-shared-sales','ATEM','participant'),('apac-shared-sales','AJED','participant'),('apac-shared-sales','APHS','participant'),
    ('gcc-shared-procurement','AQTU','participant'),('gcc-shared-procurement','AQTS','participant'),('gcc-shared-procurement','AUET','participant'),('gcc-shared-procurement','ASAH','participant'),
    ('gcc-shared-sales','AQTU','participant'),('gcc-shared-sales','AQTS','participant'),('gcc-shared-sales','AUET','participant'),('gcc-shared-sales','ASAH','participant')),
  global_membership AS (SELECT 'global-strategic-sourcing'::text org_code,upper(code) company_code,'participant' role FROM master.company_code WHERE tenant_id=v_tenant_id AND code NOT LIKE '%.ops' AND upper(code)<>'ATHQ' UNION ALL SELECT 'global-enterprise-sales',upper(code),'participant' FROM master.company_code WHERE tenant_id=v_tenant_id AND code NOT LIKE '%.ops' AND upper(code)<>'ATHQ'),
  all_membership AS (SELECT * FROM membership UNION ALL SELECT * FROM global_membership)
  INSERT INTO master.operating_organization_company_assignment (tenant_id,operating_organization_id,company_code_id,participation_role,effective_from,metadata,status,created_by)
  SELECT v_tenant_id,org.id,company.id,all_membership.role,current_date,v_meta,'active',v_actor FROM all_membership JOIN master.operating_organization org ON org.tenant_id=v_tenant_id AND org.code=all_membership.org_code JOIN master.company_code company ON company.tenant_id=v_tenant_id AND upper(company.code)=all_membership.company_code
  ON CONFLICT (tenant_id,operating_organization_id,company_code_id,effective_from) DO UPDATE SET participation_role=EXCLUDED.participation_role,metadata=EXCLUDED.metadata,status='active',effective_until=NULL,updated_at=now(),updated_by=v_actor;

  INSERT INTO master.operating_organization_capability(tenant_id,operating_organization_id,capability_code,effective_from,metadata,status,created_by)
  SELECT org.tenant_id,org.id,capability.code,current_date,v_meta,'active',v_actor FROM master.operating_organization org CROSS JOIN LATERAL unnest(CASE WHEN org.organization_kind='company_operations' THEN ARRAY['finance','procurement','people','sales','operations','warehouse','projects'] WHEN org.code LIKE '%procurement' OR org.code LIKE '%sourcing' THEN ARRAY['procurement'] WHEN org.code LIKE '%sales' THEN ARRAY['sales'] ELSE ARRAY[]::text[] END) capability(code)
   WHERE org.tenant_id=v_tenant_id AND org.metadata#>>'{_seed,pack}'='demo.operating-organizations'
  ON CONFLICT(tenant_id,operating_organization_id,capability_code,effective_from) DO UPDATE SET status='active',metadata=EXCLUDED.metadata,updated_at=now(),updated_by=v_actor;
  -- Profiles are configured only for selectable owners. Company defaults are
  -- available for both buying and selling; shared leaves expose their own facet.
  INSERT INTO master.procurement_organization_profile (tenant_id,operating_organization_id,buying_model,default_currency,lead_company_code_id,metadata,created_by)
  SELECT v_tenant_id,org.id,'federated',company.functional_currency,company.id,v_meta,v_actor FROM master.operating_organization org JOIN master.operating_organization_company_assignment a ON a.tenant_id=org.tenant_id AND a.operating_organization_id=org.id AND a.participation_role='lead' AND a.status='active' JOIN master.company_code company ON company.tenant_id=a.tenant_id AND company.id=a.company_code_id WHERE org.tenant_id=v_tenant_id AND org.metadata#>>'{_seed,pack}'='demo.operating-organizations' AND EXISTS (SELECT 1 FROM master.operating_organization_capability capability WHERE capability.tenant_id=org.tenant_id AND capability.operating_organization_id=org.id AND capability.capability_code='procurement' AND capability.status='active') AND org.metadata->'context'->>'is_browse_only' IS DISTINCT FROM 'true'
  ON CONFLICT (tenant_id,operating_organization_id) DO UPDATE SET buying_model=EXCLUDED.buying_model,default_currency=EXCLUDED.default_currency,lead_company_code_id=EXCLUDED.lead_company_code_id,metadata=EXCLUDED.metadata,updated_at=now(),updated_by=v_actor;
  INSERT INTO master.sales_organization_profile (tenant_id,operating_organization_id,selling_model,default_currency,booking_company_code_id,invoicing_company_code_id,metadata,created_by)
  SELECT v_tenant_id,org.id,'federated',company.functional_currency,company.id,company.id,v_meta,v_actor FROM master.operating_organization org JOIN master.operating_organization_company_assignment a ON a.tenant_id=org.tenant_id AND a.operating_organization_id=org.id AND a.participation_role='lead' AND a.status='active' JOIN master.company_code company ON company.tenant_id=a.tenant_id AND company.id=a.company_code_id WHERE org.tenant_id=v_tenant_id AND org.metadata#>>'{_seed,pack}'='demo.operating-organizations' AND EXISTS (SELECT 1 FROM master.operating_organization_capability capability WHERE capability.tenant_id=org.tenant_id AND capability.operating_organization_id=org.id AND capability.capability_code='sales' AND capability.status='active') AND org.metadata->'context'->>'is_browse_only' IS DISTINCT FROM 'true'
  ON CONFLICT (tenant_id,operating_organization_id) DO UPDATE SET selling_model=EXCLUDED.selling_model,default_currency=EXCLUDED.default_currency,booking_company_code_id=EXCLUDED.booking_company_code_id,invoicing_company_code_id=EXCLUDED.invoicing_company_code_id,metadata=EXCLUDED.metadata,updated_at=now(),updated_by=v_actor;
END;
$demo_operating_organizations$;
