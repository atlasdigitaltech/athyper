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
