ALTER TABLE ops.authorization_parity_certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_parity_certification FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_operation_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_operation_rollout FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_operation_cutover_drill ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_operation_cutover_drill FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_legacy_retirement_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_legacy_retirement_approval FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_qualification_cohort_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_qualification_cohort_requirement FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    CREATE POLICY authorization_parity_admin ON ops.authorization_parity_certification
      FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    CREATE POLICY authorization_rollout_admin ON ops.authorization_operation_rollout
      FOR ALL TO athyperadmin USING (plane_code=current_setting('app.database_plane',true))
      WITH CHECK (plane_code=current_setting('app.database_plane',true));
    CREATE POLICY authorization_cohort_requirement_admin ON ops.authorization_qualification_cohort_requirement
      FOR ALL TO athyperadmin USING (plane_code=current_setting('app.database_plane',true))
      WITH CHECK (plane_code=current_setting('app.database_plane',true));
    CREATE POLICY authorization_operation_cutover_drill_admin ON ops.authorization_operation_cutover_drill
      FOR ALL TO athyperadmin USING (plane_code=current_setting('app.database_plane',true))
      WITH CHECK (plane_code=current_setting('app.database_plane',true));
    CREATE POLICY authorization_legacy_retirement_approval_admin ON ops.authorization_legacy_retirement_approval
      FOR ALL TO athyperadmin USING(plane_code=current_setting('app.database_plane',true))
      WITH CHECK(plane_code=current_setting('app.database_plane',true));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    CREATE POLICY authorization_rollout_runtime_read ON ops.authorization_operation_rollout
      FOR SELECT TO athyperapp USING (plane_code=current_setting('app.database_plane',true));
    CREATE POLICY authorization_cohort_requirement_runtime_read ON ops.authorization_qualification_cohort_requirement
      FOR SELECT TO athyperapp USING (plane_code=current_setting('app.database_plane',true));
  END IF;
END $$;

ALTER TABLE ops.authorization_shadow_comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_shadow_comparison FORCE ROW LEVEL SECURITY;

CREATE POLICY authorization_shadow_insert ON ops.authorization_shadow_comparison
FOR INSERT WITH CHECK (
    tenant_id=shared.current_tenant_id()
    AND principal_id=master.current_principal_id_soft()
    AND created_by=principal_id
    AND plane_code=current_setting('app.database_plane',true));

CREATE POLICY authorization_shadow_seed_access ON ops.authorization_shadow_comparison
FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        CREATE POLICY authorization_shadow_admin_access ON ops.authorization_shadow_comparison
        FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END $$;

ALTER TABLE ops.job_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.job_execution FORCE ROW LEVEL SECURITY;

CREATE POLICY job_execution_admin_access ON ops.job_execution
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY job_execution_tenant_access ON ops.job_execution
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
ALTER TABLE ops.identity_admission_shadow_comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.identity_admission_shadow_comparison FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_admission_shadow_insert ON ops.identity_admission_shadow_comparison FOR INSERT
  WITH CHECK(tenant_id=shared.current_tenant_id() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY identity_admission_shadow_seed_owner ON ops.identity_admission_shadow_comparison FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  CREATE POLICY identity_admission_shadow_admin ON ops.identity_admission_shadow_comparison FOR SELECT TO athyperadmin USING(true);
END IF; END $$;
ALTER TABLE ops.authorization_session_shadow_comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_session_shadow_comparison FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_session_shadow_insert ON ops.authorization_session_shadow_comparison FOR INSERT
  WITH CHECK(tenant_id=shared.current_tenant_id() AND principal_id=master.current_principal_id_soft() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY authorization_session_shadow_seed_owner ON ops.authorization_session_shadow_comparison FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  CREATE POLICY authorization_session_shadow_admin ON ops.authorization_session_shadow_comparison FOR SELECT TO athyperadmin USING(true);
END IF; END $$;
