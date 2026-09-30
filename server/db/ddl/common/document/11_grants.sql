REVOKE ALL ON document.work_item FROM PUBLIC;
REVOKE ALL ON document.entity_case,document.entity_case_command_evidence,document.entity_case_validation,document.entity_case_materialization FROM PUBLIC;
REVOKE ALL ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION document.fn_entity_case_three_way_merge(jsonb,jsonb,jsonb,text),document.fn_validate_entity_case_payload(jsonb,jsonb),document.trg_guard_entity_case_mutation(),document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid),document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON document.work_item TO athyperapp;
        GRANT SELECT ON document.entity_case,document.entity_case_command_evidence,document.entity_case_validation,document.entity_case_materialization TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid) TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid) TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON document.work_item TO athyperadmin;
        GRANT ALL PRIVILEGES ON document.entity_case,document.entity_case_command_evidence,document.entity_case_validation,document.entity_case_materialization TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.fn_entity_case_three_way_merge(jsonb,jsonb,jsonb,text),document.fn_validate_entity_case_payload(jsonb,jsonb),document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid) TO athyperadmin;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_jobs_service') THEN
        GRANT EXECUTE ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) TO athyper_jobs_service;
    END IF;
END;
$$;
