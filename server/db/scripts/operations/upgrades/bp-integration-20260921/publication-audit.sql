BEGIN;
SET LOCAL app.database_plane='studio';
-- DEV publication workload audit events retain explicit automation attribution.
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('metadata_development_publication','^metadata\.development_publication\.(started|submitted|approved|dispatched)$',22,ARRAY['execute']::audit.operation_d[],'critical',ARRAY['service_account']::audit.actor_type_d[],'tenant',false,'metadata',65536,1,'{"owner":"publication","purpose":"development_workload_maker_checker_publication"}'::jsonb,'active')
ON CONFLICT(code) DO NOTHING;
COMMIT;
