CREATE VIEW control.v_risk_source_config
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    c.id,
    c.tenant_id,
    c.source_code,
    s.name AS source_name,
    s.source_type,
    s.provider_category,
    c.connector_instance_id,
    c.is_enabled,
    COALESCE(c.custom_trust_level, s.trust_level) AS effective_trust_level,
    c.risk_settings,
    c.status,
    c.status_changed_at,
    c.status_changed_by,
    c.created_at,
    c.created_by,
    c.updated_at,
    c.updated_by
FROM control.risk_source_config c
JOIN master.risk_source s ON s.code = c.source_code;

COMMENT ON VIEW control.v_risk_source_config IS
  'Tenant-safe effective risk-source configuration joined to the Neon source registry.';

CREATE VIEW control.accounting_profile_policy_catalog
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    profile.id AS accounting_profile_id,
    profile.tenant_id,
    profile.code AS accounting_profile_code,
    profile.name AS accounting_profile_name,
    profile.direction,
    profile.subledger_type,
    policy.id AS policy_id,
    policy.effective_from,
    policy.effective_to,
    policy.status,
    policy.is_active,
    count(DISTINCT event.id) AS event_count,
    count(entry.id) AS entry_count
FROM master.accounting_profile AS profile
JOIN control.accounting_profile_policy AS policy
  ON policy.tenant_id = profile.tenant_id
 AND policy.accounting_profile_id = profile.id
LEFT JOIN control.accounting_profile_event AS event
  ON event.tenant_id = policy.tenant_id
 AND event.accounting_profile_policy_id = policy.id
LEFT JOIN control.accounting_profile_entry AS entry
  ON entry.tenant_id = event.tenant_id
 AND entry.accounting_profile_event_id = event.id
GROUP BY profile.id, profile.tenant_id, profile.code, profile.name,
         profile.direction, profile.subledger_type, policy.id,
         policy.effective_from, policy.effective_to, policy.status, policy.is_active;

COMMENT ON VIEW control.accounting_profile_policy_catalog IS
  'Canonical accounting-profile policy projection replacing v_acct_profile_full and its retired POC child tables.';

-- Migrated from the 2026-08-01 live Neon catalog snapshot.
-- Dependencies were checked against the active Neon foundation manifest.

CREATE OR REPLACE VIEW "control"."v_authorization_v2_deferred_constraints" WITH (security_invoker=true, security_barrier=true) AS
SELECT conrelid::regclass::text AS relation_name,
    conname AS constraint_name,
    convalidated AS is_validated
   FROM pg_constraint
  WHERE connamespace = 'control'::regnamespace::oid AND NOT convalidated;
