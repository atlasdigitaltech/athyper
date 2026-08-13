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
CREATE POLICY job_execution_jobs_service_access ON ops.job_execution
    FOR ALL TO athyper_jobs_service
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id IS NULL OR tenant_id = shared.current_tenant_id());

ALTER TABLE ops.job_execution_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.job_execution_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY job_execution_attempt_admin_access ON ops.job_execution_attempt
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY job_execution_attempt_tenant_access ON ops.job_execution_attempt
    FOR SELECT TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY job_execution_attempt_tenant_insert ON ops.job_execution_attempt
    FOR INSERT TO athyperapp
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY job_execution_attempt_jobs_service_access ON ops.job_execution_attempt
    FOR SELECT TO athyper_jobs_service
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY job_execution_attempt_jobs_service_insert ON ops.job_execution_attempt
    FOR INSERT TO athyper_jobs_service
    WITH CHECK (tenant_id IS NULL OR tenant_id = shared.current_tenant_id());

ALTER TABLE ops.job_execution_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.job_execution_command FORCE ROW LEVEL SECURITY;
CREATE POLICY job_execution_command_admin_access ON ops.job_execution_command
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY job_execution_command_tenant_select ON ops.job_execution_command
    FOR SELECT TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY job_execution_command_tenant_insert ON ops.job_execution_command
    FOR INSERT TO athyperapp
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY job_execution_command_jobs_service_select ON ops.job_execution_command
    FOR SELECT TO athyper_jobs_service
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY job_execution_command_jobs_service_insert ON ops.job_execution_command
    FOR INSERT TO athyper_jobs_service
    WITH CHECK (tenant_id IS NULL OR tenant_id = shared.current_tenant_id());
ALTER TABLE ops.identity_admission_shadow_comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.identity_admission_shadow_comparison FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_admission_shadow_insert ON ops.identity_admission_shadow_comparison FOR INSERT
  WITH CHECK(tenant_id=shared.current_tenant_id() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY identity_admission_shadow_seed_owner ON ops.identity_admission_shadow_comparison FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  CREATE POLICY identity_admission_shadow_admin ON ops.identity_admission_shadow_comparison FOR SELECT TO athyperadmin USING(true);
END IF; END $$;

ALTER TABLE ops.record_edit_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.record_edit_lock FORCE ROW LEVEL SECURITY;
CREATE POLICY record_edit_lock_tenant_access ON ops.record_edit_lock FOR ALL TO athyperapp
    USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY record_edit_lock_admin_access ON ops.record_edit_lock FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
ALTER TABLE ops.authorization_session_shadow_comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.authorization_session_shadow_comparison FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_session_shadow_insert ON ops.authorization_session_shadow_comparison FOR INSERT
  WITH CHECK(tenant_id=shared.current_tenant_id() AND principal_id=master.current_principal_id_soft() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY authorization_session_shadow_seed_owner ON ops.authorization_session_shadow_comparison FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  CREATE POLICY authorization_session_shadow_admin ON ops.authorization_session_shadow_comparison FOR SELECT TO athyperadmin USING(true);
END IF; END $$;
ALTER TABLE ops.record_import_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.record_import_session FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.record_import_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.record_import_chunk FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.record_export_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.record_export_request FORCE ROW LEVEL SECURITY;
CREATE POLICY record_import_session_tenant_access ON ops.record_import_session FOR ALL TO athyperapp USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY record_import_chunk_tenant_access ON ops.record_import_chunk FOR ALL TO athyperapp USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY record_export_request_tenant_access ON ops.record_export_request FOR ALL TO athyperapp USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY record_import_session_admin_access ON ops.record_import_session FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
CREATE POLICY record_import_chunk_admin_access ON ops.record_import_chunk FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
CREATE POLICY record_export_request_admin_access ON ops.record_export_request FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
ALTER TABLE ops.control_runtime_command_submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.control_runtime_command_submission FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.control_runtime_command_approval_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.control_runtime_command_approval_request FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.control_runtime_command_approval_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.control_runtime_command_approval_decision FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.control_runtime_command_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.control_runtime_command_history FORCE ROW LEVEL SECURITY;

CREATE POLICY control_runtime_command_submission_tenant ON ops.control_runtime_command_submission
 FOR SELECT TO athyperapp USING (tenant_id=shared.current_tenant_id_soft() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY control_runtime_command_submission_insert ON ops.control_runtime_command_submission
 FOR INSERT TO athyperapp WITH CHECK (tenant_id=shared.current_tenant_id() AND plane_code=current_setting('app.database_plane',true) AND created_by=master.current_principal_id_soft());
CREATE POLICY control_runtime_command_approval_request_tenant ON ops.control_runtime_command_approval_request
 FOR SELECT TO athyperapp USING (tenant_id=shared.current_tenant_id_soft() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY control_runtime_command_approval_request_insert ON ops.control_runtime_command_approval_request
 FOR INSERT TO athyperapp WITH CHECK (tenant_id=shared.current_tenant_id() AND plane_code=current_setting('app.database_plane',true) AND requested_by=master.current_principal_id_soft());
CREATE POLICY control_runtime_command_approval_decision_tenant ON ops.control_runtime_command_approval_decision
 FOR SELECT TO athyperapp USING (EXISTS (SELECT 1 FROM ops.control_runtime_command_approval_request request WHERE request.id=approval_id AND request.tenant_id=shared.current_tenant_id_soft()));
CREATE POLICY control_runtime_command_approval_decision_insert ON ops.control_runtime_command_approval_decision
 FOR INSERT TO athyperapp WITH CHECK (decided_by=master.current_principal_id_soft() AND EXISTS (SELECT 1 FROM ops.control_runtime_command_approval_request request WHERE request.id=approval_id AND request.tenant_id=shared.current_tenant_id() AND request.requested_by<>decided_by));
CREATE POLICY control_runtime_command_history_tenant ON ops.control_runtime_command_history
 FOR SELECT TO athyperapp USING (tenant_id=shared.current_tenant_id_soft() AND plane_code=current_setting('app.database_plane',true));
CREATE POLICY control_runtime_command_history_insert ON ops.control_runtime_command_history
 FOR INSERT TO athyperapp WITH CHECK (tenant_id=shared.current_tenant_id() AND plane_code=current_setting('app.database_plane',true) AND actor_id=master.current_principal_id_soft());

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  CREATE POLICY control_runtime_command_submission_admin ON ops.control_runtime_command_submission FOR SELECT TO athyperadmin USING(true);
  CREATE POLICY control_runtime_command_approval_request_admin ON ops.control_runtime_command_approval_request FOR SELECT TO athyperadmin USING(true);
  CREATE POLICY control_runtime_command_approval_decision_admin ON ops.control_runtime_command_approval_decision FOR SELECT TO athyperadmin USING(true);
  CREATE POLICY control_runtime_command_history_admin ON ops.control_runtime_command_history FOR SELECT TO athyperadmin USING(true);
END IF; END $$;
