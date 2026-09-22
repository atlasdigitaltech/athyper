BEGIN;

DO $workforce_as_of$
DECLARE
  v_tenant uuid := '11111111-1111-4111-8111-111111111111';
  v_actor uuid := 'ff3d770b-fc3f-5b2c-a5c1-901954691ddf';
  v_company uuid := '9018f615-e2a9-5789-8908-03baca457be8';
  v_legal uuid := '56926e3d-5561-5dae-a3e1-1632c1dbe69b';
  v_person uuid := gen_random_uuid();
  v_employee uuid := gen_random_uuid();
  v_manager_person uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_current_employment uuid := gen_random_uuid();
  v_future_employment uuid := gen_random_uuid();
  v_current_assignment uuid := gen_random_uuid();
  v_future_assignment uuid := gen_random_uuid();
  v_unnumbered_person_one uuid := gen_random_uuid();
  v_unnumbered_person_two uuid := gen_random_uuid();
  v_result record;
BEGIN
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);
  PERFORM set_config('app.current_principal_id', v_actor::text, true);

  INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,status,created_by)
  VALUES(v_unnumbered_person_one,v_tenant,'HR.NULL.ONE.'||v_unnumbered_person_one::text,'Unnumbered One','Unnumbered','One','active',v_actor),
        (v_unnumbered_person_two,v_tenant,'HR.NULL.TWO.'||v_unnumbered_person_two::text,'Unnumbered Two','Unnumbered','Two','active',v_actor);

  INSERT INTO master.person(id,tenant_id,code,name,person_number,first_name,last_name,display_name,status,created_by)
  VALUES(v_person,v_tenant,'HR.ASOF.'||v_person::text,'HR As Of Worker','HR-ASOF-'||left(v_person::text,12),'HR','Worker','HR As Of Worker','active',v_actor);
  INSERT INTO master.employee(id,tenant_id,code,name,person_id,employee_number,first_name,last_name,display_name,employment_type,company_code_id,hire_date,status,created_by)
  VALUES(v_employee,v_tenant,'HR.EMP.'||v_employee::text,'HR As Of Worker',v_person,'HR-EMP-'||left(v_employee::text,12),'HR','Worker','HR As Of Worker','full_time',v_company,current_date-30,'active',v_actor);
  INSERT INTO master.person(id,tenant_id,code,name,person_number,first_name,last_name,status,created_by)
  VALUES(v_manager_person,v_tenant,'HR.MGR.'||v_manager_person::text,'Future Manager','HR-MGR-'||left(v_manager_person::text,12),'Future','Manager','active',v_actor);
  INSERT INTO master.employee(id,tenant_id,code,name,person_id,employee_number,first_name,last_name,employment_type,company_code_id,hire_date,status,created_by)
  VALUES(v_manager,v_tenant,'HR.MGR.EMP.'||v_manager::text,'Future Manager',v_manager_person,'HR-MGR-EMP-'||left(v_manager::text,12),'Future','Manager','full_time',v_company,current_date-30,'active',v_actor);

  INSERT INTO master.employment(id,tenant_id,code,name,person_id,employee_id,legal_entity_id,company_code_id,employment_number,employment_type,is_primary,employment_status,hire_date,status,created_by)
  VALUES(v_current_employment,v_tenant,'HR.EML.CUR.'||v_current_employment::text,'Current employment',v_person,v_employee,v_legal,v_company,'HR-CUR-'||left(v_current_employment::text,12),'full_time',true,'active',current_date-30,'active',v_actor),
        (v_future_employment,v_tenant,'HR.EML.FUT.'||v_future_employment::text,'Future employment',v_person,v_employee,v_legal,v_company,'HR-FUT-'||left(v_future_employment::text,12),'contract',false,'active',current_date+10,'active',v_actor);
  INSERT INTO master.work_assignment(id,tenant_id,code,name,employee_id,employment_id,company_code_id,assignment_type,fte,effective_from,effective_until,status,created_by)
  VALUES(v_current_assignment,v_tenant,'HR.ASN.CUR.'||v_current_assignment::text,'Current assignment',v_employee,v_current_employment,v_company,'primary',1,current_date-30,current_date+5,'active',v_actor),
        (v_future_assignment,v_tenant,'HR.ASN.FUT.'||v_future_assignment::text,'Future assignment',v_employee,v_current_employment,v_company,'primary',1,current_date+5,NULL,'active',v_actor);

  SELECT employee_view.employment_type,employee_view.manager_id
    INTO v_result
    FROM master.v_employee employee_view
   WHERE employee_view.tenant_id=v_tenant
     AND employee_view.id=v_employee;
  IF v_result.employment_type <> 'full_time' THEN
    RAISE EXCEPTION 'Current view selected future employment: %',v_result.employment_type;
  END IF;
  IF v_result.manager_id IS NOT NULL THEN
    RAISE EXCEPTION 'Current view selected future assignment manager: %',v_result.manager_id;
  END IF;
END
$workforce_as_of$;

ROLLBACK;
SELECT 'WORKFORCE_AS_OF_READ_ROLLBACK_OK';
