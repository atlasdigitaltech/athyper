-- Full-schema command acceptance. Rollback-only; no live grants, login or MFA claims.
BEGIN;
DO $$
DECLARE
 tenant uuid; seed_actor uuid; maker uuid:=gen_random_uuid(); checker uuid:=gen_random_uuid();
 contract_id uuid:=gen_random_uuid(); cycle_id uuid:=gen_random_uuid(); phase_id uuid:=gen_random_uuid();
 category_id uuid:=gen_random_uuid(); template_id uuid:=gen_random_uuid(); revision_id uuid:=gen_random_uuid();
 case_id uuid:=gen_random_uuid(); run_id uuid:=gen_random_uuid(); task_id uuid:=gen_random_uuid();
 payload jsonb; result record; replay record; country text; partner_version bigint; snapshot_payload jsonb;
BEGIN
 SELECT p.tenant_id,p.id INTO STRICT tenant,seed_actor FROM master.principal p ORDER BY p.id LIMIT 1;
 INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES
 (maker,tenant,'identity.cutover.maker','Identity cutover maker','user','active',seed_actor),
 (checker,tenant,'identity.cutover.checker','Identity cutover checker','user','active',seed_actor);
 PERFORM set_config('app.database_plane','neon',true);
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',maker::text,true);
 SELECT code INTO STRICT country FROM shared.country ORDER BY code LIMIT 1;
 payload:=jsonb_build_object('businessPartnerCode','BP.IDENTITY.CUTOVER','name','Cutover Legal Organization',
   'partnerCategory','organization','ownershipClass','external','registrationChannel','internal',
   'registrationCountryCode',country,'incorporationDate','2001-02-03');
 INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,
   release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,
   publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at)
 VALUES(contract_id,tenant,gen_random_uuid(),'master.business_partner',gen_random_uuid(),gen_random_uuid(),1,
   'athyper.entity-contract','1.0.0',repeat('9',64),
   '{"type":"object","required":["businessPartnerCode","name","partnerCategory","ownershipClass","registrationChannel"],"additionalProperties":false,"properties":{"businessPartnerCode":{"type":"string"},"name":{"type":"string"},"partnerCategory":{"type":"string"},"ownershipClass":{"type":"string"},"registrationChannel":{"type":"string"},"registrationCountryCode":{"type":"string"},"incorporationDate":{"type":"string"}}}',
   'test.identity.cutover','ed25519','test-only','fixture',clock_timestamp()-interval '1 second','published',clock_timestamp());
 INSERT INTO control.cycle_type(id,tenant_id,code,name,domain_code,frequency,status,status_changed_at,status_changed_by,created_by)
 VALUES(cycle_id,tenant,'IDENTITY.CUTOVER','Identity cutover','governance_review','adhoc','active',clock_timestamp(),maker,maker);
 INSERT INTO control.cycle_phase(id,tenant_id,cycle_type_id,code,name,sort_order,status,status_changed_at,status_changed_by,created_by)
 VALUES(phase_id,tenant,cycle_id,'REVIEW','Review',1,'active',clock_timestamp(),maker,maker);
 INSERT INTO control.cycle_task_category(id,tenant_id,cycle_type_id,code,name,status,status_changed_at,status_changed_by,created_by)
 VALUES(category_id,tenant,cycle_id,'APPROVAL','Approval','active',clock_timestamp(),maker,maker);
 INSERT INTO control.cycle_task_template(id,tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,completion_mode,status,status_changed_at,status_changed_by,created_by)
 VALUES(template_id,tenant,cycle_id,phase_id,category_id,'document.entity_case','DECIDE','Decide','manual','active',clock_timestamp(),maker,maker);
 INSERT INTO control.cycle_template_revision(id,tenant_id,cycle_type_id,revision_number,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by)
 VALUES(revision_id,tenant,cycle_id,1,'{}',repeat('8',64),ARRAY[template_id],'identity-cutover-template',maker,maker);
 INSERT INTO governance.cycle_run(id,tenant_id,cycle_type_id,template_revision_id,template_revision_number,template_hash,code,name,idempotency_key,status,created_by)
 VALUES(run_id,tenant,cycle_id,revision_id,1,repeat('8',64),'IDENTITY.CUTOVER.RUN','Identity cutover','identity-cutover-run','draft',maker);
 INSERT INTO governance.cycle_task(id,tenant_id,cycle_run_id,cycle_type_id,task_template_id,phase_id,code,name,completion_mode,owner_principal_id,status,created_by)
 VALUES(task_id,tenant,run_id,cycle_id,template_id,phase_id,'DECIDE','Decide','manual',checker,'pending',maker);
 PERFORM document.command_entity_case_draft(tenant,case_id,0,NULL,'IDENTITY.CUTOVER.CASE','master.business_partner',
   'new_partner',NULL,'identity-cutover-case',contract_id,repeat('9',64),gen_random_uuid(),1,repeat('7',64),payload,'identity-cutover-draft',maker,NULL);
 PERFORM document.command_entity_case_validation(tenant,case_id,1,gen_random_uuid(),'identity.cutover','1',repeat('6',64),
   '[{"messageCode":"IDENTITY_VALID","severity":"info","outcome":"passed"}]','{"outcome":"passed"}','{}','{}','identity-cutover-validate',maker,NULL);
 PERFORM document.command_entity_case_lifecycle(tenant,case_id,'submit',2,run_id,task_id,NULL,'identity-cutover-submit',maker,NULL);
 PERFORM set_config('app.current_principal_id',checker::text,true);
 PERFORM document.command_entity_case_lifecycle(tenant,case_id,'approve',3,run_id,task_id,NULL,'identity-cutover-approve',checker,NULL);
 SELECT * INTO result FROM master.command_materialize_business_partner_role_case(tenant,case_id,4,'identity-cutover-materialize',checker,NULL);
 IF result.replayed OR result.case_status<>'materialized' OR result.row_version<>5 THEN RAISE EXCEPTION 'Registration did not materialize'; END IF;
 SELECT record_version INTO STRICT partner_version FROM master.business_partner_identity_current
 WHERE tenant_id=tenant AND id=result.business_partner_id AND name='Cutover Legal Organization' AND legal_name=name
   AND registration_country_code=country AND incorporation_date='2001-02-03' AND status='active';
 IF partner_version<>3 THEN RAISE EXCEPTION 'Profile write and activation did not advance aggregate version: %',partner_version; END IF;
 IF EXISTS(SELECT 1 FROM master.supplier WHERE business_partner_id=result.business_partner_id)
 OR EXISTS(SELECT 1 FROM master.customer WHERE business_partner_id=result.business_partner_id)
 OR EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment WHERE business_partner_id=result.business_partner_id)
 THEN RAISE EXCEPTION 'Role-free registration created commercial setup'; END IF;
 SELECT s.payload_json INTO STRICT snapshot_payload FROM document.entity_case c JOIN snapshot.entity_snapshot s
 ON s.tenant_id=c.tenant_id AND s.snapshot_id=c.result_snapshot_id WHERE c.id=case_id;
 IF snapshot_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Pinned result payload changed'; END IF;
 SELECT * INTO replay FROM master.command_materialize_business_partner_role_case(tenant,case_id,4,'identity-cutover-materialize',checker,NULL);
 IF NOT replay.replayed OR replay.business_partner_id<>result.business_partner_id THEN RAISE EXCEPTION 'Replay duplicated partner'; END IF;
 IF (SELECT record_version FROM master.business_partner WHERE id=result.business_partner_id)<>partner_version THEN RAISE EXCEPTION 'Replay changed version'; END IF;
 BEGIN
   PERFORM master.command_materialize_business_partner_role_case(gen_random_uuid(),case_id,4,'identity-cross-tenant',checker,NULL);
   RAISE EXCEPTION 'Wrong tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Exercise the same real-schema patch boundary used by import and Mesh amendment.
 PERFORM master.update_business_partner_organization_identity(tenant,result.business_partner_id,'{"legalName":"Amended Legal Organization","employeeCount":12,"employeeCountAsOf":"2020-01-01","employeeCountScope":"organization"}',checker);
 IF NOT EXISTS(SELECT 1 FROM master.business_partner_identity_current WHERE id=result.business_partner_id
   AND name='Cutover Legal Organization' AND legal_name='Amended Legal Organization' AND employee_count=12
   AND registration_country_code=country AND record_version=partner_version+1) THEN RAISE EXCEPTION 'Patch/projection contract failed'; END IF;
 SET LOCAL ROLE athyperapp;
 IF NOT EXISTS(SELECT 1 FROM master.business_partner_identity_current WHERE id=result.business_partner_id AND legal_name='Amended Legal Organization') THEN
   RAISE EXCEPTION 'Application role cannot read aggregate projection'; END IF;
 PERFORM set_config('app.current_tenant_id',gen_random_uuid()::text,true);
 IF EXISTS(SELECT 1 FROM master.business_partner_identity_current WHERE id=result.business_partner_id) THEN
   RAISE EXCEPTION 'Application projection leaked another tenant'; END IF;
 RESET ROLE;
END $$;
ROLLBACK;
SELECT 'BUSINESS_PARTNER_IDENTITY_CUTOVER_COMMANDS_OK';
