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
