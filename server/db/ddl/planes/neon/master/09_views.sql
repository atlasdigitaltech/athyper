CREATE VIEW master.principal_directory
WITH (security_barrier = true)
AS
SELECT
    p.id,
    p.tenant_id,
    p.code,
    p.name,
    p.principal_type,
    p.status,
    p.is_active,
    profile.given_name,
    profile.family_name,
    profile.preferred_name,
    profile.display_name,
    profile.avatar_url
FROM master.principal AS p
LEFT JOIN master.principal_profile AS profile
  ON profile.tenant_id = p.tenant_id
 AND profile.principal_id = p.id
WHERE p.tenant_id = shared.current_tenant_id_soft();

COMMENT ON VIEW master.principal_directory IS
  'Safe tenant directory projection. Excludes IAM subjects, auth_epoch, external references, provider attributes, and unrestricted metadata.';

CREATE MATERIALIZED VIEW master.mv_company_postable_account AS
SELECT
    company.id AS company_code_id,
    company.tenant_id,
    company.code AS company_code,
    account.id AS gl_account_id,
    account.code AS account_code,
    account.name AS account_name,
    account.metadata ->> '_display_no' AS display_no,
    account.account_class,
    account.normal_balance,
    account.subledger_type,
    COALESCE(control.posting_allowed, true) AS posting_allowed,
    COALESCE(control.blocked_for_manual, false) AS blocked_for_manual,
    COALESCE(control.blocked_for_auto, false) AS blocked_for_auto,
    COALESCE(control.requires_cost_center, false) AS requires_cost_center,
    COALESCE(control.requires_profit_center, false) AS requires_profit_center,
    COALESCE(control.requires_project, false) AS requires_project,
    control.default_cost_center_id,
    control.default_site_id,
    control.tax_category,
    control.reconciliation_type
FROM master.company_code AS company
JOIN master.company_code_chart_assignment AS assignment
  ON assignment.tenant_id = company.tenant_id
 AND assignment.company_code_id = company.id
 AND assignment.assignment_type = 'operating'
 AND assignment.is_primary
 AND assignment.status = 'active'
 AND (assignment.effective_from IS NULL OR assignment.effective_from <= CURRENT_DATE)
 AND (assignment.effective_to IS NULL OR assignment.effective_to >= CURRENT_DATE)
JOIN master.gl_account AS account
  ON account.tenant_id = assignment.tenant_id
 AND account.chart_of_account_id = assignment.chart_of_account_id
 AND account.status = 'active'
 AND account.node_type = 'posting'
 AND account.is_blocked = false
 AND COALESCE((account.metadata ->> '_journal_postable')::boolean, true)
LEFT JOIN master.company_code_gl_account AS control
  ON control.tenant_id = company.tenant_id
 AND control.company_code_id = company.id
 AND control.gl_account_id = account.id
 AND control.status = 'active'
WHERE company.status = 'active'
  AND COALESCE(control.posting_allowed, true)
WITH DATA;

CREATE UNIQUE INDEX mv_cpa_lookup_idx
    ON master.mv_company_postable_account
       (tenant_id, company_code_id, account_code);
CREATE INDEX mv_cpa_account_idx
    ON master.mv_company_postable_account
       (tenant_id, company_code_id, gl_account_id);
CREATE INDEX mv_cpa_class_idx
    ON master.mv_company_postable_account
       (tenant_id, company_code_id, account_class);

COMMENT ON MATERIALIZED VIEW master.mv_company_postable_account IS
  'Cached company-postable account set used by finance readiness and configuration. Refresh through master.fn_refresh_mv_cpa after chart/control mutations.';

CREATE OR REPLACE VIEW master.v_bank_account_resolved
WITH (security_barrier = true)
AS
SELECT
    account.id AS bank_account_id,
    account.tenant_id,
    account.code AS bank_account_code,
    account.name AS bank_account_name,
    account.account_holder_name,
    account.account_id_type,
    repeat('*', GREATEST(length(account.account_id_value) - 4, 0))
        || account.account_last4 AS account_id_value_masked,
    account.account_last4,
    account.currency_code,
    account.account_nature,
    account.provider_account_ref,
    account.is_verified,
    account.verified_at,
    account.verification_method,
    account.status AS bank_account_status,
    party.id AS bank_party_id,
    COALESCE(party.name, account.bank_name_override) AS bank_name,
    COALESCE(party.bic, account.bic_override) AS bic,
    COALESCE(
        party.country_code,
        account.bank_country_override
    ) AS bank_country_code,
    party.institution_type,
    party.national_bank_code_type,
    party.national_bank_code,
    party.branch_code,
    party.branch_name,
    correspondent.id AS correspondent_bank_party_id,
    correspondent.name AS correspondent_bank_name,
    correspondent.bic AS correspondent_bic
FROM master.bank_account AS account
LEFT JOIN master.bank_party AS party
  ON party.tenant_id = account.tenant_id
 AND party.id = account.bank_party_id
LEFT JOIN master.bank_party AS correspondent
  ON correspondent.tenant_id = account.tenant_id
 AND correspondent.id = account.correspondent_bank_party_id
WHERE account.tenant_id = shared.current_tenant_id()
  AND account.status NOT IN ('closed', 'retired');

COMMENT ON VIEW master.v_bank_account_resolved IS
  'Masked bank-account directory. The sensitive account identifier is never projected.';

CREATE OR REPLACE VIEW master.v_bank_account_link_resolved
WITH (security_barrier = true)
AS
SELECT
    link.id AS bank_account_link_id,
    link.tenant_id,
    link.owner_type_id,
    link.owner_type,
    link.owner_id,
    link.relationship_role,
    link.company_code_id,
    link.purpose,
    link.is_primary,
    link.effective_from,
    link.effective_until,
    account.bank_account_id,
    account.bank_account_name,
    account.account_holder_name,
    account.account_id_type,
    account.account_id_value_masked,
    account.account_last4,
    account.currency_code,
    account.account_nature,
    account.is_verified,
    account.verification_method,
    account.bank_name,
    account.bic,
    account.bank_country_code,
    config.id AS house_config_id,
    config.gl_account_id,
    config.usage_type,
    config.local_account_type,
    config.is_disbursement_enabled,
    config.is_collection_enabled,
    config.is_default_disbursement,
    config.is_default_collection,
    config.priority,
    config.reconciliation_mode,
    config.status AS house_config_status,
    account.bank_account_status
FROM master.bank_account_link AS link
JOIN master.v_bank_account_resolved AS account
  ON account.tenant_id = link.tenant_id
 AND account.bank_account_id = link.bank_account_id
LEFT JOIN master.bank_account_house_config AS config
  ON config.tenant_id = link.tenant_id
 AND config.bank_account_link_id = link.id
 AND config.status = 'active'
WHERE link.tenant_id = shared.current_tenant_id()
  AND link.effective_from <= CURRENT_DATE
  AND (
      link.effective_until IS NULL
      OR link.effective_until > CURRENT_DATE
  );

COMMENT ON VIEW master.v_bank_account_link_resolved IS
  'Currently effective masked bank-account ownership and operational-use links.';
