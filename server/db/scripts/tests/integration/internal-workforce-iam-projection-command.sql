BEGIN;

DO $$
DECLARE
  v_tenant uuid;v_actor uuid;v_company uuid;v_legal uuid;v_person uuid:=gen_random_uuid();v_employee uuid:=gen_random_uuid();v_employment uuid:=gen_random_uuid();v_projection uuid:=gen_random_uuid();v_result record;v_wrong_tenant uuid;
BEGIN
  SELECT tenant.id,principal.id,company.id,company.legal_entity_id INTO v_tenant,v_actor,v_company,v_legal
    FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id AND principal.status='active'
    JOIN master.company_code company ON company.tenant_id=tenant.id AND company.status='active'
   ORDER BY tenant.id,principal.id,company.id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'G5 internal workforce probe requires tenant, actor and company fixtures'; END IF;
  PERFORM set_config('app.current_tenant_id',v_tenant::text,true);PERFORM set_config('app.current_principal_id',v_actor::text,true);
  INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,display_name,primary_email,status,created_by) VALUES(v_person,v_tenant,'G5.INT.'||v_person::text,'G5 Internal Worker','G5','Worker','G5 Internal Worker','g5-internal-'||v_person::text||'@example.test','active',v_actor);
  INSERT INTO master.employee(id,tenant_id,code,name,person_id,employee_number,first_name,last_name,display_name,email,employment_type,company_code_id,hire_date,status,created_by) VALUES(v_employee,v_tenant,'G5.EMP.'||v_employee::text,'G5 Internal Worker',v_person,'G5-'||left(v_employee::text,20),'G5','Worker','G5 Internal Worker','g5-internal-'||v_person::text||'@example.test','full_time',v_company,current_date,'active',v_actor);
  INSERT INTO master.employment(id,tenant_id,code,name,person_id,employee_id,legal_entity_id,company_code_id,employment_number,employment_type,employment_status,hire_date,status,created_by) VALUES(v_employment,v_tenant,'G5.EMPL.'||v_employment::text,'G5 Internal Employment',v_person,v_employee,v_legal,v_company,'G5-'||left(v_employment::text,20),'full_time','active',current_date,'active',v_actor);
  INSERT INTO document.workforce_iam_projection(id,tenant_id,employee_id,employer_organization_id,requested_principal_creation,desired_state,observed_state,idempotency_key,created_by) VALUES(v_projection,v_tenant,v_employee,v_legal,true,'member','pending','g5-internal-intake-0001',v_actor);
  SELECT * INTO v_result FROM document.command_workforce_iam_projection(v_tenant,v_projection,1,'g5-internal-command-0001',v_actor,NULL);
  IF v_result.desired_status<>'active' OR v_result.desired_version<>1 OR v_result.replayed THEN RAISE EXCEPTION 'G5 internal active command failed'; END IF;
  IF (SELECT payload->>'relationship' FROM event.outbox WHERE id=v_result.outbox_id)<>'employer' OR (SELECT payload->>'sourceRef' FROM event.outbox WHERE id=v_result.outbox_id)<>'employment:'||v_employment::text THEN RAISE EXCEPTION 'G5 internal intent coordinates are wrong'; END IF;
  SELECT * INTO v_result FROM document.command_workforce_iam_projection(v_tenant,v_projection,1,'g5-internal-command-0001',v_actor,NULL);
  IF NOT v_result.replayed THEN RAISE EXCEPTION 'G5 internal exact replay failed'; END IF;
  BEGIN PERFORM document.command_workforce_iam_projection(v_tenant,v_projection,2,'g5-internal-stale-0001',v_actor,NULL);RAISE EXCEPTION 'stale version accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
  SELECT id INTO v_wrong_tenant FROM master.tenant WHERE id<>v_tenant ORDER BY id LIMIT 1;
  IF v_wrong_tenant IS NOT NULL THEN BEGIN PERFORM set_config('app.current_tenant_id',v_wrong_tenant::text,true);PERFORM document.command_workforce_iam_projection(v_tenant,v_projection,1,'g5-internal-wrong-tenant-0001',v_actor,NULL);RAISE EXCEPTION 'wrong tenant accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END IF;
  PERFORM set_config('app.current_tenant_id',v_tenant::text,true);
  UPDATE document.workforce_iam_projection SET desired_state='suspended',row_version=2,updated_at=clock_timestamp(),updated_by=v_actor WHERE id=v_projection;
  SELECT * INTO v_result FROM document.command_workforce_iam_projection(v_tenant,v_projection,2,'g5-internal-command-0002',v_actor,NULL);
  IF v_result.desired_status<>'suspended' OR v_result.desired_version<>2 THEN RAISE EXCEPTION 'G5 internal suspension command failed'; END IF;
  UPDATE document.workforce_iam_projection SET desired_state='deprovisioned',row_version=3,updated_at=clock_timestamp(),updated_by=v_actor WHERE id=v_projection;
  SELECT * INTO v_result FROM document.command_workforce_iam_projection(v_tenant,v_projection,3,'g5-internal-command-0003',v_actor,NULL);
  IF v_result.desired_status<>'deprovisioned' OR v_result.desired_version<>3 THEN RAISE EXCEPTION 'G5 internal deprovision command failed'; END IF;
  IF (SELECT count(*) FROM event.outbox WHERE tenant_id=v_tenant AND event_type='workforce.employee.identity_projection.requested' AND aggregate_id=v_employment)<>3 THEN RAISE EXCEPTION 'G5 internal outbox evidence mismatch'; END IF;
  IF (SELECT count(*) FROM event.command_execution WHERE tenant_id=v_tenant AND command_code='workforce.employee.iam.project' AND status='succeeded')<>3 THEN RAISE EXCEPTION 'G5 internal command evidence mismatch'; END IF;
END $$;

ROLLBACK;
SELECT 'G5_INTERNAL_WORKFORCE_IAM_COMMAND_ROLLBACK_OK';
