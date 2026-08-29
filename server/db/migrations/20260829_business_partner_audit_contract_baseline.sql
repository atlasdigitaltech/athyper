BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('athyper_studio', 'athyper_neon', 'athyper_mesh') THEN
    RAISE EXCEPTION 'Business Partner audit contract baseline requires an Athyper plane database';
  END IF;
END $guard$;

INSERT INTO master.audit_event_contract (
  code, event_code_pattern, priority, allowed_operations, default_severity,
  allowed_actor_types, allowed_scope, reason_required, capture_mode,
  max_payload_bytes, schema_version, metadata, status
)
VALUES (
  'business_partner_request_event',
  '^business_partner\.(request\.(created|updated|validated|submitted|returned|rejected|approved|applying|applied|failed|cancelled|superseded)|qualification\.(created|approved|conditional|rejected|suspended))$',
  21,
  ARRAY['create','update','execute','approve','reject']::audit.operation_d[],
  'warning',
  ARRAY['user','service_account','bot','integration','support','system']::audit.actor_type_d[],
  'tenant',
  false,
  'safe_values',
  65536,
  2,
  '{"event_category":"business_critical","owner":"master-data","purpose":"business_partner_onboarding_qualification_evidence"}'::jsonb,
  'active'
)
ON CONFLICT (code) DO NOTHING;

DO $assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM master.audit_event_contract
     WHERE code = 'business_partner_request_event'
       AND schema_version >= 2
       AND event_code_pattern LIKE '%qualification%'
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Business Partner audit contract baseline v2 is unavailable or incompatible';
  END IF;
END $assertions$;

COMMIT;
