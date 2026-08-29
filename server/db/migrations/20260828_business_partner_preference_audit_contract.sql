BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('athyper_studio','athyper_neon','athyper_mesh') THEN
    RAISE EXCEPTION 'Business Partner preference audit contract requires an Athyper plane database';
  END IF;
END $guard$;

UPDATE master.audit_event_contract SET
  event_code_pattern='^business_partner\.(request\.(created|updated|validated|submitted|returned|rejected|approved|applying|applied|failed|cancelled|superseded)|qualification\.(created|approved|conditional|rejected|suspended)|preference\.(created|approved|rejected|revoked))$',
  allowed_operations=ARRAY['create','update','execute','approve','reject','revoke']::audit.operation_d[],
  schema_version=3,
  metadata='{"event_category":"business_critical","owner":"master-data","purpose":"business_partner_onboarding_qualification_and_preference_evidence"}'::jsonb,
  status='active'
WHERE code='business_partner_request_event';

DO $assertions$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM master.audit_event_contract WHERE code='business_partner_request_event' AND schema_version=3 AND event_code_pattern LIKE '%preference%' AND 'revoke'=ANY(allowed_operations) AND status='active') THEN
    RAISE EXCEPTION 'Business Partner preference audit contract v3 was not installed';
  END IF;
END $assertions$;

COMMIT;
