BEGIN;
SET LOCAL app.database_plane='studio';
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('metadata_development_runtime','^metadata\.development_runtime\.(qualified|activation_authorized)$',23,ARRAY['execute']::audit.operation_d[],'critical',ARRAY['service_account']::audit.actor_type_d[],'tenant',false,'metadata',65536,1,'{"owner":"publication","purpose":"devfull_workload_runtime_approval"}'::jsonb,'active')
ON CONFLICT(code) DO NOTHING;
COMMIT;
