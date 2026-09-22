-- Synthetic DEV-only profile examples for the Stage 1 employee fixture.
BEGIN;
SELECT set_config('app.database_plane','neon',true),
       set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true),
       set_config('app.current_principal_id','d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c',true);
DO $$ BEGIN
  IF current_database()<>'athyper_neon' OR NOT EXISTS(
    SELECT 1 FROM master.employee WHERE tenant_id='11111111-1111-4111-8111-111111111111'
      AND id='1fc65c52-0aeb-558d-b8fe-21a8a652bdba' AND employee_number='HRD-0001'
      AND person_id='ff8950db-49b1-5574-bca7-8896b172855c'
  ) THEN RAISE EXCEPTION 'Local Workforce profile fixture mismatch'; END IF;
END $$;
INSERT INTO master.person_education(id,tenant_id,person_id,institution_name,qualification_name,level_code,field_of_study,completion_year,verification_status,created_by)
VALUES('e5b54d7c-0a87-4ceb-8eb0-86a17d6d9141','11111111-1111-4111-8111-111111111111','ff8950db-49b1-5574-bca7-8896b172855c','Harbor Technical University','Bachelor of Engineering','bachelor','Industrial Engineering',2017,'verified','d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c')
ON CONFLICT(id) DO NOTHING;
INSERT INTO master.person_prior_employment(id,tenant_id,person_id,employer_name,role_title,start_year,end_year,verification_status,created_by)
VALUES('12c17910-b14d-4656-b52f-720eeb9eb69d','11111111-1111-4111-8111-111111111111','ff8950db-49b1-5574-bca7-8896b172855c','Northwind Components','Operations Analyst',2018,2024,'verified','d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c')
ON CONFLICT(id) DO NOTHING;
COMMIT;
