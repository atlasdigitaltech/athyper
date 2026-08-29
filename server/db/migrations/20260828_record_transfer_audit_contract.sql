BEGIN;

INSERT INTO master.audit_event_contract (
  code, event_code_pattern, priority, allowed_operations, default_severity,
  allowed_actor_types, allowed_scope, reason_required, capture_mode,
  max_payload_bytes, schema_version, metadata, status
)
VALUES (
  'records_transfer_event',
  '^records\.(import|export)\.[a-z][a-z0-9_]*$',
  27,
  ARRAY['import','export']::audit.operation_d[],
  'info',
  ARRAY['user','service_account','bot','system']::audit.actor_type_d[],
  'tenant',
  false,
  'metadata',
  32768,
  1,
  '{"event_category":"integration","owner":"records","purpose":"record_transfer_evidence"}'::jsonb,
  'active'
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
