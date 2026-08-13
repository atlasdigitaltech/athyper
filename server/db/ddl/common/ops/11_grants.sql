REVOKE ALL ON ops.authorization_parity_certification,ops.authorization_operation_rollout,ops.authorization_qualification_cohort_requirement FROM PUBLIC;
REVOKE ALL ON ops.authorization_operation_cutover_drill FROM PUBLIC;
REVOKE ALL ON ops.authorization_legacy_retirement_approval FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.certify_authorization_operation_parity(text,text,uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.set_authorization_operation_rollout(text,text,uuid,text,text,text,uuid,text,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON ops.authorization_operation_rollout TO athyperapp;
    GRANT SELECT ON ops.authorization_qualification_cohort_requirement TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT SELECT,INSERT ON ops.authorization_parity_certification TO athyperadmin;
        GRANT SELECT,INSERT,UPDATE ON ops.authorization_operation_rollout TO athyperadmin;
        GRANT SELECT,INSERT ON ops.authorization_operation_cutover_drill TO athyperadmin;
        GRANT SELECT,INSERT ON ops.authorization_legacy_retirement_approval TO athyperadmin;
    GRANT SELECT,INSERT,DELETE ON ops.authorization_qualification_cohort_requirement TO athyperadmin;
    GRANT EXECUTE ON FUNCTION ops.certify_authorization_operation_parity(text,text,uuid,text,text,uuid) TO athyperadmin;
    GRANT EXECUTE ON FUNCTION ops.set_authorization_operation_rollout(text,text,uuid,text,text,text,uuid,text,text) TO athyperadmin;
  END IF;
END $$;

REVOKE ALL ON ops.record_edit_lock FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.acquire_record_edit_lock(uuid,text,uuid,uuid,integer,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.heartbeat_record_edit_lock(uuid,text,uuid,uuid,uuid,bigint,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.release_record_edit_lock(uuid,text,uuid,uuid,uuid,bigint) FROM PUBLIC;
GRANT SELECT ON ops.record_edit_lock TO athyperapp;
GRANT EXECUTE ON FUNCTION ops.acquire_record_edit_lock(uuid,text,uuid,uuid,integer,uuid), ops.heartbeat_record_edit_lock(uuid,text,uuid,uuid,uuid,bigint,integer), ops.release_record_edit_lock(uuid,text,uuid,uuid,uuid,bigint) TO athyperapp;
GRANT SELECT ON ops.record_edit_lock TO athyperadmin;
REVOKE ALL ON ops.authorization_session_shadow_comparison FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT INSERT ON ops.authorization_session_shadow_comparison TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT ON ops.authorization_session_shadow_comparison TO athyperadmin; END IF;
END $$;

REVOKE ALL ON ops.authorization_shadow_comparison FROM PUBLIC;
REVOKE ALL ON ops.authorization_shadow_qualification_v FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.trg_guard_authorization_shadow_comparison() FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT INSERT ON ops.authorization_shadow_comparison TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT SELECT,INSERT ON ops.authorization_shadow_comparison TO athyperadmin;
        GRANT SELECT ON ops.authorization_shadow_qualification_v TO athyperadmin;
        GRANT EXECUTE ON FUNCTION ops.trg_guard_authorization_shadow_comparison() TO athyperadmin;
    END IF;
END $$;

GRANT USAGE ON SCHEMA ops TO athyperapp, athyperadmin;
REVOKE ALL ON ops.job_execution FROM PUBLIC;
REVOKE ALL ON ops.job_execution_attempt, ops.job_execution_command FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON ops.job_execution TO athyperapp;
GRANT SELECT, INSERT ON ops.job_execution_attempt, ops.job_execution_command TO athyperapp;
GRANT ALL PRIVILEGES ON ops.job_execution TO athyperadmin;
GRANT ALL PRIVILEGES ON ops.job_execution_attempt, ops.job_execution_command TO athyperadmin;
GRANT USAGE ON SCHEMA ops TO athyper_jobs_service;
GRANT SELECT, INSERT, UPDATE ON ops.job_execution TO athyper_jobs_service;
GRANT SELECT, INSERT ON ops.job_execution_attempt, ops.job_execution_command TO athyper_jobs_service;
REVOKE ALL ON FUNCTION ops.trg_guard_job_execution_evidence() FROM PUBLIC;
REVOKE ALL ON ops.identity_admission_shadow_comparison FROM PUBLIC;
REVOKE ALL ON ops.identity_admission_shadow_gate FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.trg_guard_identity_admission_shadow_comparison() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT INSERT ON ops.identity_admission_shadow_comparison TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT ON ops.identity_admission_shadow_comparison,ops.identity_admission_shadow_gate TO athyperadmin; END IF;
END $$;
REVOKE ALL ON ops.record_import_session,ops.record_import_chunk,ops.record_export_request FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON ops.record_import_session,ops.record_import_chunk,ops.record_export_request TO athyperapp;
GRANT ALL PRIVILEGES ON ops.record_import_session,ops.record_import_chunk,ops.record_export_request TO athyperadmin;
REVOKE ALL ON ops.control_runtime_command_submission,ops.control_runtime_command_approval_request,
 ops.control_runtime_command_approval_decision,ops.control_runtime_command_history FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.trg_guard_control_runtime_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.trg_prepare_control_runtime_history() FROM PUBLIC;
REVOKE ALL ON SEQUENCE ops.control_runtime_command_history_sequence_no_seq FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
  GRANT SELECT,INSERT ON ops.control_runtime_command_submission,ops.control_runtime_command_approval_request,
   ops.control_runtime_command_approval_decision,ops.control_runtime_command_history TO athyperapp;
  GRANT USAGE ON SEQUENCE ops.control_runtime_command_history_sequence_no_seq TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  GRANT SELECT ON ops.control_runtime_command_submission,ops.control_runtime_command_approval_request,
   ops.control_runtime_command_approval_decision,ops.control_runtime_command_history TO athyperadmin;
 END IF;
END $$;
