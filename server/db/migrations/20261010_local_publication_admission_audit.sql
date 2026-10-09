BEGIN;
-- Local developer admission is neither human independent review nor workload publication.
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,
 allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('entity_local_publication_admission','^metadata[.]entity[.]local[.]admission$',25,ARRAY['execute']::audit.operation_d[],
 'critical',ARRAY['user']::audit.actor_type_d[],'tenant',false,'metadata',16384,1,
 '{"owner":"meta-entity-authoring","purpose":"authenticated_developer_standing_authority_admission"}'::jsonb,'active');
COMMIT;
