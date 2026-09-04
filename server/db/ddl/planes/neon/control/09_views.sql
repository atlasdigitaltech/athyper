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

CREATE VIEW control.current_customer_account_designation
WITH (security_invoker = true, security_barrier = true) AS
SELECT designation.id AS designation_id, designation.tenant_id,
       designation.business_partner_id, designation.customer_id,
       (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope
         WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id
           AND scope.scope_mode='include' AND scope.scope_kind='operating_organization'
         ORDER BY scope.scope_group,scope.id LIMIT 1) AS operating_organization_id,
       (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope
         WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id
           AND scope.scope_mode='include' AND scope.scope_kind='company_code'
         ORDER BY scope.scope_group,scope.id LIMIT 1) AS company_code_id,
       designation.designation_type, designation.priority_tier,
       designation.effective_from, designation.effective_until,
       designation.rationale, designation.approved_at,
       designation.approved_by, designation.row_version
  FROM control.customer_account_designation designation
 WHERE designation.status = 'approved'
   AND designation.effective_from <= CURRENT_DATE
   AND (designation.effective_until IS NULL OR designation.effective_until > CURRENT_DATE);

COMMENT ON VIEW control.current_customer_account_designation IS
  'Read-only current governed Customer designations; replaces master.customer.is_key_account.';

CREATE VIEW control.current_customer_credit_limit
WITH (security_invoker = true, security_barrier = true) AS
SELECT review.id AS credit_review_id, review.tenant_id,
       review.business_partner_id, review.customer_id,
       (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope
         WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id
           AND scope.scope_mode='include' AND scope.scope_kind='operating_organization'
         ORDER BY scope.scope_group,scope.id LIMIT 1) AS operating_organization_id,
       (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope
         WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id
           AND scope.scope_mode='include' AND scope.scope_kind='company_code'
         ORDER BY scope.scope_group,scope.id LIMIT 1) AS company_code_id,
       review.approved_credit_limit, review.approved_currency_code,
       review.decision, review.effective_from, review.effective_until,
       review.approved_at, review.approved_by, review.row_version
  FROM control.customer_credit_review review
 WHERE review.decision IN ('approved','conditional')
   AND review.approved_credit_limit IS NOT NULL
   AND review.effective_from <= CURRENT_DATE
   AND (review.effective_until IS NULL OR review.effective_until > CURRENT_DATE);

COMMENT ON VIEW control.current_customer_credit_limit IS
  'Read-only current credit-limit resolver. Every returned amount is the effective outcome of one approved or conditional credit review.';

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
