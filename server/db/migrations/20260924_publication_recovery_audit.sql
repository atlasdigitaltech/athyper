BEGIN;
-- Recovery is a distinct administrator-approved replay, never an old approval event.
INSERT INTO master.audit_event_contract(
 code,event_code_pattern,priority,allowed_operations,default_severity,
 allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,
 schema_version,metadata,status)
VALUES('metadata_publication_recovery','^metadata\.publication_recovery\.activation_authorized$',
 23,ARRAY['execute']::audit.operation_d[],'critical',
 ARRAY['service_account']::audit.actor_type_d[],'tenant',false,'metadata',65536,1,
 '{"owner":"publication","purpose":"operator_approved_exact_artifact_recovery"}'::jsonb,'active')
ON CONFLICT(code) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.audit_event_contract WHERE code='metadata_publication_recovery'
 AND event_code_pattern='^metadata\.publication_recovery\.activation_authorized$'
 AND status='active' AND allowed_operations=ARRAY['execute']::audit.operation_d[]
 AND default_severity='critical' AND allowed_actor_types=ARRAY['service_account']::audit.actor_type_d[]
 AND allowed_scope='tenant' AND capture_mode='metadata' AND schema_version=1)
 THEN RAISE EXCEPTION 'RECOVERY_AUDIT_CONTRACT_CONFLICT'; END IF;
END $$;

COMMIT;
