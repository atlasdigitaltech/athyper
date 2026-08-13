REVOKE ALL ON document.work_item FROM PUBLIC;
REVOKE ALL ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON document.work_item TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON document.work_item TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) TO athyperadmin;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_jobs_service') THEN
        GRANT EXECUTE ON FUNCTION document.fn_workflow_sla_due_tenants(timestamptz, integer) TO athyper_jobs_service;
    END IF;
END;
$$;
