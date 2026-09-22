-- Runtime-role exercise; all writes are rolled back.
BEGIN;
SET LOCAL ROLE athyper_runtime;
SELECT set_config('app.database_plane','neon',true),
       set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true),
       set_config('app.current_principal_id','d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c',true);
DO $$
DECLARE actor uuid := 'd4250b08-6e5e-5887-b4e1-6f3eb31d7c8c';
        tenant uuid := '11111111-1111-4111-8111-111111111111';
        employee uuid := '1fc65c52-0aeb-558d-b8fe-21a8a652bdba';
        person uuid := 'ff8950db-49b1-5574-bca7-8896b172855c';
        employment uuid;
        onboarding uuid;
        offboarding uuid;
        version bigint;
BEGIN
  SELECT id INTO employment FROM master.employment
  WHERE tenant_id=tenant AND employee_id=employee AND status='active'
  ORDER BY hire_date DESC LIMIT 1;
  IF employment IS NULL THEN RAISE EXCEPTION 'Workforce employment fixture missing'; END IF;
  INSERT INTO document.onboarding_case(tenant_id,code,name,person_id,employee_id,checklist,status,created_by)
  VALUES(tenant,'ONB.RECONCILE.TEST','Synthetic onboarding',person,employee,
    '[{"code":"identity","status":"pending","required":true}]'::jsonb,'draft',actor)
  RETURNING id,row_version INTO onboarding,version;
  IF version<>1 THEN RAISE EXCEPTION 'Onboarding initial version invalid'; END IF;
  UPDATE document.onboarding_case SET status='active',updated_by=actor
  WHERE tenant_id=tenant AND id=onboarding;
  UPDATE document.onboarding_case SET checklist='[{"code":"identity","status":"completed","required":true}]'::jsonb,
    row_version=row_version+1,status='completed',updated_by=actor
  WHERE tenant_id=tenant AND id=onboarding AND row_version=1 RETURNING row_version INTO version;
  IF version<>2 THEN RAISE EXCEPTION 'Onboarding optimistic update failed'; END IF;
  INSERT INTO document.offboarding_case(tenant_id,code,name,employee_id,employment_id,target_exit_date,
    checklist,idempotency_key,access_deprovision_status,status,created_by)
  VALUES(tenant,'OFF.RECONCILE.TEST','Synthetic offboarding',employee,employment,current_date+30,
    '[]'::jsonb,'workforce-case-reconciliation-test','requested','draft',actor)
  RETURNING id,row_version INTO offboarding,version;
  IF version<>1 THEN RAISE EXCEPTION 'Offboarding initial version invalid'; END IF;
  UPDATE document.offboarding_case SET status='active',updated_by=actor
  WHERE tenant_id=tenant AND id=offboarding;
  UPDATE document.offboarding_case SET resource_checklist_completed_at=now(),row_version=row_version+1,updated_by=actor
  WHERE tenant_id=tenant AND id=offboarding AND row_version=1 RETURNING row_version INTO version;
  IF version<>2 THEN RAISE EXCEPTION 'Offboarding optimistic update failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM document.offboarding_case WHERE tenant_id=tenant AND id=offboarding
    AND employment_id=employment AND access_deprovision_status='requested'
    AND resource_checklist_completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Offboarding lifecycle columns were not persisted';
  END IF;
END $$;
ROLLBACK;
