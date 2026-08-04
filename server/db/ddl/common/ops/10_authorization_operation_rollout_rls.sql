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
