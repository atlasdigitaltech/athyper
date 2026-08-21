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

CREATE OR REPLACE VIEW master.v_employee
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    e.id,
    e.tenant_id,
    e.code,
    e.name,
    e.principal_id,
    e.employee_number,
    p.first_name,
    p.last_name,
    COALESCE(p.display_name, p.name, e.display_name, e.name) AS display_name,
    COALESCE(p.primary_email, e.email) AS email,
    COALESCE(p.primary_phone, e.phone) AS phone,
    COALESCE(em.employment_type, e.employment_type) AS employment_type,
    COALESCE(ou.name, e.department) AS department,
    COALESCE(j.name, e.title) AS title,
    COALESCE(wa.manager_employee_id, e.manager_id) AS manager_id,
    COALESCE(em.company_code_id, wa.company_code_id, e.company_code_id) AS company_code_id,
    COALESCE(em.hire_date, e.hire_date) AS hire_date,
    COALESCE(em.termination_date, e.termination_date) AS termination_date,
    e.metadata,
    e.status,
    e.is_active,
    e.status_changed_at,
    e.status_changed_by,
    e.created_at,
    e.created_by,
    e.updated_at,
    e.updated_by,
    e.person_id,
    COALESCE(em.termination_date, e.termination_date) IS NOT NULL
        AND COALESCE(em.termination_date, e.termination_date) <= CURRENT_DATE
        AS is_terminated,
    CASE
        WHEN COALESCE(em.termination_date, e.termination_date) IS NOT NULL
             AND COALESCE(em.termination_date, e.termination_date) <= CURRENT_DATE
            THEN 'terminated'
        WHEN COALESCE(em.hire_date, e.hire_date) > CURRENT_DATE
            THEN 'future'
        WHEN COALESCE(em.employment_status, e.status) = 'suspended'
            THEN 'suspended'
        ELSE 'employed'
    END AS employment_status
FROM master.employee e
JOIN master.person p
  ON p.tenant_id = e.tenant_id
 AND p.id = e.person_id
LEFT JOIN LATERAL (
    SELECT x.*
      FROM master.employment x
     WHERE x.tenant_id = e.tenant_id
       AND (x.employee_id = e.id OR (x.employee_id IS NULL AND x.person_id = e.person_id))
     ORDER BY
       (x.employment_status = 'active') DESC,
       x.hire_date DESC,
       x.id
     LIMIT 1
) em ON true
LEFT JOIN LATERAL (
    SELECT x.*
      FROM master.work_assignment x
     WHERE x.tenant_id = e.tenant_id
       AND x.employee_id = e.id
     ORDER BY
       (x.assignment_type = 'primary' AND x.status = 'active') DESC,
       x.effective_from DESC,
       x.id
     LIMIT 1
) wa ON true
LEFT JOIN master.org_unit ou
  ON ou.tenant_id = wa.tenant_id
 AND ou.id = wa.org_unit_id
LEFT JOIN master.job j
  ON j.tenant_id = wa.tenant_id
 AND j.id = wa.job_id;

COMMENT ON VIEW master.v_employee IS
  'Compatibility employee projection. Person, employment, and work_assignment values override deprecated flattened employee columns; base-table RLS remains enforced.';

-- Migrated from the 2026-08-01 live Neon catalog snapshot.
-- Dependencies were checked against the active Neon foundation manifest.

CREATE OR REPLACE VIEW "master"."v_business_partner_address" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.id,
    al.tenant_id,
    al.owner_id,
    al.address_id,
    al.purpose,
    al.role_qualifier,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    al.metadata,
    al.created_at,
    al.created_by,
    al.updated_at,
    al.updated_by,
    a.address_type,
    a.line1,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    NULLIF(concat_ws(', ', a.line1, a.line2, a.line3, a.city,
        a.region, a.postal_code, a.country_code::text), '') AS formatted_address,
    c.name AS country_name
   FROM master.address_link al
     JOIN control.owner_type ot ON ot.id = al.owner_type_id
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE ot.code = 'business_partner'::text;

CREATE OR REPLACE VIEW "master"."v_business_partner_app_index"
WITH (security_invoker = true, security_barrier = true) AS
WITH supplier_role AS (
         SELECT s.tenant_id,
            s.business_partner_id,
            s.id AS supplier_id,
            s.supplier_code,
            s.supplier_type,
            s.status AS supplier_status,
            s.is_active AS supplier_is_active,
            COALESCE(bool_or(
                scp.is_active AND scp.payment_term_id IS NOT NULL
            ), false) AS is_payment_ready,
            count(scp.id)::integer AS supplier_company_scope_count,
            count(scp.id) FILTER (WHERE scp.is_active)::integer AS supplier_active_scope_count,
            0::integer AS supplier_blocked_scope_count,
            max(scp.updated_at) AS supplier_scope_updated_at,
            s.created_at AS supplier_created_at,
            s.updated_at AS supplier_updated_at
           FROM master.supplier s
             LEFT JOIN master.company_code_supplier_profile scp ON scp.tenant_id = s.tenant_id AND scp.supplier_id = s.id
          GROUP BY s.tenant_id, s.business_partner_id, s.id, s.supplier_code, s.supplier_type, s.status, s.is_active, s.created_at, s.updated_at
        ), customer_role AS (
         SELECT c.tenant_id,
            c.business_partner_id,
            c.id AS customer_id,
            c.customer_code,
            c.customer_type,
            c.status AS customer_status,
            c.is_active AS customer_is_active,
            COALESCE(c.is_key_account, false) AS is_key_account,
            NULL::text AS risk_rating,
            count(ccp.id)::integer AS customer_company_scope_count,
            count(ccp.id) FILTER (WHERE ccp.is_active)::integer AS customer_active_scope_count,
            0::integer AS customer_blocked_scope_count,
            max(ccp.updated_at) AS customer_scope_updated_at,
            c.created_at AS customer_created_at,
            c.updated_at AS customer_updated_at
           FROM master.customer c
             LEFT JOIN master.company_code_customer_profile ccp ON ccp.tenant_id = c.tenant_id AND ccp.customer_id = c.id
          GROUP BY c.tenant_id, c.business_partner_id, c.id, c.customer_code, c.customer_type, c.status, c.is_active, c.is_key_account, c.created_at, c.updated_at
        )
 SELECT bp.id,
    bp.tenant_id,
    bp.code,
    bp.name,
    bp.display_name,
    bp.partner_category,
    bp.legal_name,
    bp.legal_form,
    NULL::text AS registration_no,
    bp.registration_country_code,
    NULL::character(2) AS tax_residence_country_code,
    bp.website_url,
    bp.parent_business_partner_id,
    bp.description,
    NULL::text AS long_description,
    bp.aliases,
    '{}'::text[] AS tags,
    '{}'::text[] AS business_types,
    NULL::integer AS founded_year,
    NULL::text AS employee_count_band,
    NULL::text AS annual_revenue_band,
    bp.incorporation_date,
    NULL::date AS effective_from,
    NULL::date AS effective_until,
    NULL::text AS external_ref,
    bp.status,
    bp.is_active,
    sr.supplier_id,
    sr.supplier_code,
    sr.supplier_type,
    sr.supplier_status,
    sr.supplier_is_active,
    sr.is_payment_ready,
    cr.customer_id,
    cr.customer_code,
    cr.customer_type,
    cr.customer_status,
    cr.customer_is_active,
    cr.is_key_account,
    cr.risk_rating,
    sr.supplier_id IS NOT NULL AS has_supplier_role,
    cr.customer_id IS NOT NULL AS has_customer_role,
    sr.supplier_id IS NOT NULL AND cr.customer_id IS NOT NULL AS is_dual_role,
    (sr.supplier_id IS NOT NULL)::integer + (cr.customer_id IS NOT NULL)::integer AS role_count,
    array_remove(ARRAY[
        CASE
            WHEN sr.supplier_id IS NOT NULL THEN 'supplier'::text
            ELSE NULL::text
        END,
        CASE
            WHEN cr.customer_id IS NOT NULL THEN 'customer'::text
            ELSE NULL::text
        END], NULL::text) AS role_kinds,
    NULLIF(concat_ws(' / '::text, sr.supplier_code, cr.customer_code), ''::text) AS role_codes,
        CASE
            WHEN sr.supplier_id IS NOT NULL AND cr.customer_id IS NOT NULL THEN 'Supplier + Customer'::text
            WHEN sr.supplier_id IS NOT NULL THEN 'Supplier'::text
            WHEN cr.customer_id IS NOT NULL THEN 'Customer'::text
            WHEN bp.partner_category = 'internal'::text THEN 'Internal'::text
            ELSE 'Identity'::text
        END AS role_summary,
    COALESCE(sr.supplier_company_scope_count, 0) + COALESCE(cr.customer_company_scope_count, 0) AS company_scope_count,
    COALESCE(sr.supplier_active_scope_count, 0) + COALESCE(cr.customer_active_scope_count, 0) AS active_scope_count,
    COALESCE(sr.supplier_blocked_scope_count, 0) + COALESCE(cr.customer_blocked_scope_count, 0) AS blocked_scope_count,
    COALESCE(sr.supplier_blocked_scope_count, 0) > 0 OR COALESCE(cr.customer_blocked_scope_count, 0) > 0 OR (sr.supplier_status::text = ANY (ARRAY['on_hold'::text, 'suspended'::text])) OR (cr.customer_status::text = ANY (ARRAY['on_hold'::text, 'credit_hold'::text])) OR (bp.status::text = ANY (ARRAY['on_hold'::text, 'blocked'::text])) AS is_blocked,
    lower(concat_ws(' '::text, bp.code, bp.name, bp.display_name, bp.legal_name, sr.supplier_code, sr.supplier_type, cr.customer_code, cr.customer_type, array_to_string(bp.aliases, ' '::text))) AS search_text,
    bp.created_at,
    bp.created_by,
    GREATEST(COALESCE(bp.updated_at, bp.created_at), COALESCE(sr.supplier_updated_at, sr.supplier_created_at, bp.created_at), COALESCE(sr.supplier_scope_updated_at, bp.created_at), COALESCE(cr.customer_updated_at, cr.customer_created_at, bp.created_at), COALESCE(cr.customer_scope_updated_at, bp.created_at)) AS updated_at,
    bp.updated_by
   FROM master.business_partner bp
     LEFT JOIN supplier_role sr ON sr.tenant_id = bp.tenant_id AND sr.business_partner_id = bp.id
     LEFT JOIN customer_role cr ON cr.tenant_id = bp.tenant_id AND cr.business_partner_id = bp.id;

CREATE OR REPLACE VIEW "master"."v_business_partner_bank_account" WITH (security_invoker=true, security_barrier=true) AS
WITH bp_scoped_link AS (
         SELECT bal_1.id,
            bal_1.tenant_id,
            bal_1.owner_type,
            bal_1.owner_id,
            bal_1.bank_account_id,
            bal_1.company_code_id,
            bal_1.purpose,
            bal_1.is_primary,
            bal_1.effective_from,
            bal_1.effective_until,
            bal_1.metadata,
            bal_1.created_at,
            bal_1.created_by,
            bal_1.updated_at,
            bal_1.updated_by,
            bal_1.owner_id AS business_partner_id
           FROM master.bank_account_link bal_1
          WHERE bal_1.owner_type = 'business_partner'::text
        UNION ALL
         SELECT bal_1.id,
            bal_1.tenant_id,
            bal_1.owner_type,
            bal_1.owner_id,
            bal_1.bank_account_id,
            bal_1.company_code_id,
            bal_1.purpose,
            bal_1.is_primary,
            bal_1.effective_from,
            bal_1.effective_until,
            bal_1.metadata,
            bal_1.created_at,
            bal_1.created_by,
            bal_1.updated_at,
            bal_1.updated_by,
            s.business_partner_id
           FROM master.bank_account_link bal_1
             JOIN master.supplier s ON s.tenant_id = bal_1.tenant_id AND s.id = bal_1.owner_id
          WHERE bal_1.owner_type = 'supplier'::text
        UNION ALL
         SELECT bal_1.id,
            bal_1.tenant_id,
            bal_1.owner_type,
            bal_1.owner_id,
            bal_1.bank_account_id,
            bal_1.company_code_id,
            bal_1.purpose,
            bal_1.is_primary,
            bal_1.effective_from,
            bal_1.effective_until,
            bal_1.metadata,
            bal_1.created_at,
            bal_1.created_by,
            bal_1.updated_at,
            bal_1.updated_by,
            c.business_partner_id
           FROM master.bank_account_link bal_1
             JOIN master.customer c ON c.tenant_id = bal_1.tenant_id AND c.id = bal_1.owner_id
          WHERE bal_1.owner_type = 'customer'::text
        )
 SELECT bal.id,
    bal.tenant_id,
    bal.business_partner_id,
    ba.account_id_value AS account_number,
    ba.currency_code,
    ba.account_holder_name,
    ba.account_id_type,
    ba.account_nature,
    ba.is_verified,
    bal.purpose,
    bal.is_primary,
    bal.effective_from,
    bal.effective_until,
    COALESCE(bp.name, ba.bank_name_override) AS bank_name,
    ba.bic_override,
    ba.bank_party_id,
    bal.bank_account_id,
    bal.created_at,
    bal.updated_at,
    bal.owner_type,
    bal.owner_id,
    bal.company_code_id,
    cc.code AS company_code,
    COALESCE(cc.display_name, cc.name) AS company_code_name,
    ba.account_id_value,
        CASE
            WHEN ba.account_last4 IS NOT NULL THEN repeat('*'::text, GREATEST(length(ba.account_id_value) - 4, 0)) || ba.account_last4
            ELSE repeat('*'::text, GREATEST(length(ba.account_id_value) - 4, 0)) || "right"(ba.account_id_value, 4)
        END AS account_id_value_masked,
    ba.account_last4,
    ba.verified_at,
    ba.verified_by,
    ba.verification_method,
    ba.bank_name_override,
    COALESCE(bp.bic, ba.bic_override) AS bic,
    COALESCE(bp.country_code, ba.bank_country_override) AS bank_country_code,
    ba.bank_country_override,
    bp.institution_type,
    bp.branch_code,
    bp.branch_name,
    bp.national_bank_code_type,
    bp.national_bank_code,
    bp.supports_swift,
    bp.supports_local_clearing,
    bp.supports_sepa,
    bp.supports_ach,
    ba.provider_account_ref,
    cbp.name AS correspondent_bank_name,
    cbp.bic AS correspondent_bic,
    bal.metadata AS link_metadata,
    ba.metadata AS account_metadata
   FROM bp_scoped_link bal
     JOIN master.bank_account ba ON ba.id = bal.bank_account_id AND ba.tenant_id = bal.tenant_id
     LEFT JOIN master.bank_party bp ON bp.id = ba.bank_party_id AND bp.tenant_id = ba.tenant_id
     LEFT JOIN master.bank_party cbp ON cbp.id = ba.correspondent_bank_party_id AND cbp.tenant_id = ba.tenant_id
     LEFT JOIN master.company_code cc ON cc.id = bal.company_code_id AND cc.tenant_id = bal.tenant_id;

CREATE OR REPLACE VIEW "master"."v_business_partner_role_summary"
WITH (security_invoker = true, security_barrier = true) AS
WITH supplier_scope AS (
         SELECT company_code_supplier_profile.supplier_id,
            company_code_supplier_profile.tenant_id,
            count(*) FILTER (WHERE company_code_supplier_profile.is_active)::integer AS active_scope_count,
            count(*)::integer AS company_scope_count,
            0::integer AS blocked_scope_count,
            min(company_code_supplier_profile.currency_code) FILTER (WHERE company_code_supplier_profile.is_active AND company_code_supplier_profile.currency_code IS NOT NULL)::text AS primary_currency_code,
            max(company_code_supplier_profile.updated_at) AS last_scope_updated_at
           FROM master.company_code_supplier_profile
          GROUP BY company_code_supplier_profile.tenant_id, company_code_supplier_profile.supplier_id
        ), customer_scope AS (
         SELECT company_code_customer_profile.customer_id,
            company_code_customer_profile.tenant_id,
            count(*) FILTER (WHERE company_code_customer_profile.is_active)::integer AS active_scope_count,
            count(*)::integer AS company_scope_count,
            0::integer AS blocked_scope_count,
            min(company_code_customer_profile.currency_code) FILTER (WHERE company_code_customer_profile.is_active AND company_code_customer_profile.currency_code IS NOT NULL)::text AS primary_currency_code,
            max(company_code_customer_profile.updated_at) AS last_scope_updated_at
           FROM master.company_code_customer_profile
          GROUP BY company_code_customer_profile.tenant_id, company_code_customer_profile.customer_id
        )
 SELECT s.id,
    s.tenant_id,
    s.business_partner_id,
    'supplier'::text AS role_kind,
    'Supplier Role'::text AS role_label,
    'supplier'::text AS role_entity_code,
    s.id AS role_record_id,
    s.supplier_code AS role_code,
    s.supplier_type AS role_type,
    s.status,
    s.is_active,
    COALESCE(ss.active_scope_count, 0) AS active_scope_count,
    COALESCE(ss.company_scope_count, 0) AS company_scope_count,
    COALESCE(ss.blocked_scope_count, 0) AS blocked_scope_count,
    COALESCE(ss.active_scope_count, 0) > 0 AS is_payment_ready,
    NULL::boolean AS is_key_account,
    NULL::text AS risk_rating,
    COALESCE(ss.blocked_scope_count, 0) > 0 OR (s.status::text = ANY (ARRAY['on_hold'::text, 'suspended'::text])) AS is_blocked,
    ss.primary_currency_code,
    NULL::integer AS open_document_count,
    NULL::numeric(18,4) AS ytd_amount,
    ss.primary_currency_code AS ytd_currency_code,
    10 AS display_order,
    s.created_at,
    GREATEST(COALESCE(s.updated_at, s.created_at), COALESCE(ss.last_scope_updated_at, s.created_at)) AS updated_at
   FROM master.supplier s
     LEFT JOIN supplier_scope ss ON ss.supplier_id = s.id AND ss.tenant_id = s.tenant_id
UNION ALL
 SELECT c.id,
    c.tenant_id,
    c.business_partner_id,
    'customer'::text AS role_kind,
    'Customer Role'::text AS role_label,
    'customer'::text AS role_entity_code,
    c.id AS role_record_id,
    c.customer_code AS role_code,
    c.customer_type AS role_type,
    c.status,
    c.is_active,
    COALESCE(cs.active_scope_count, 0) AS active_scope_count,
    COALESCE(cs.company_scope_count, 0) AS company_scope_count,
    COALESCE(cs.blocked_scope_count, 0) AS blocked_scope_count,
    NULL::boolean AS is_payment_ready,
    COALESCE(c.is_key_account, false) AS is_key_account,
    NULL::text AS risk_rating,
    COALESCE(cs.blocked_scope_count, 0) > 0 OR (c.status::text = ANY (ARRAY['on_hold'::text, 'credit_hold'::text])) AS is_blocked,
    cs.primary_currency_code,
    NULL::integer AS open_document_count,
    NULL::numeric(18,4) AS ytd_amount,
    cs.primary_currency_code AS ytd_currency_code,
    20 AS display_order,
    c.created_at,
    GREATEST(COALESCE(c.updated_at, c.created_at), COALESCE(cs.last_scope_updated_at, c.created_at)) AS updated_at
   FROM master.customer c
     LEFT JOIN customer_scope cs ON cs.customer_id = c.id AND cs.tenant_id = c.tenant_id;

CREATE OR REPLACE VIEW "master"."v_company_code_address" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.id,
    al.id AS link_id,
    al.tenant_id,
    al.owner_id AS company_code_id,
    al.purpose,
    al.role_qualifier,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    a.id AS address_id,
    NULL::text AS code,
    NULL::text AS name,
    al.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    NULLIF(concat_ws(', ', a.line1, a.line2, a.line3, a.city,
        a.region, a.postal_code, a.country_code::text), '') AS formatted_address,
    NULL::uuid AS tax_jurisdiction_id,
    a.status AS address_status,
    c.name AS country_name
   FROM master.address_link al
     JOIN control.owner_type ot ON ot.id = al.owner_type_id
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE ot.code = 'company_code'::text AND al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."v_contact_summary" WITH (security_invoker=true, security_barrier=true) AS
SELECT cl.id AS contact_link_id,
    cl.tenant_id,
    ot.code AS owner_type,
    cl.owner_id,
    cl.channel_type,
    cl.value,
    cl.purpose,
    cl.is_primary,
    cl.is_verified,
    cl.verified_at,
    cl.status,
    cl.is_active,
    CASE WHEN cl.channel_type = 'email' THEN split_part(cl.value, '@', 1) END AS email_local_part,
    CASE WHEN cl.channel_type = 'email' THEN split_part(cl.value, '@', 2) END AS email_domain,
    ce.is_disposable AS email_is_disposable,
    ce.mx_valid AS email_mx_valid,
    ce.bounce_count AS email_bounce_count,
    CASE WHEN cl.channel_type IN ('phone','fax','sms','whatsapp') THEN cl.value END AS phone_e164,
    NULL::text AS phone_calling_code,
    NULL::text AS phone_national_number,
    cp.line_type AS phone_line_type
   FROM master.contact_link cl
     JOIN control.owner_type ot ON ot.id = cl.owner_type_id
     LEFT JOIN master.contact_email ce ON ce.tenant_id = cl.tenant_id AND ce.contact_link_id = cl.id
     LEFT JOIN master.contact_phone cp ON cp.tenant_id = cl.tenant_id AND cp.contact_link_id = cl.id;

CREATE OR REPLACE VIEW "master"."v_effective_principal_ui"
WITH (security_invoker = true, security_barrier = true) AS
SELECT p.id AS principal_id,
    p.tenant_id,
    COALESCE(pui.locale_code, tp.locale_code, 'en'::text) AS locale_code,
    COALESCE(pui.language_code, tp.language_code, 'en'::text) AS language_code,
    COALESCE(pui.timezone_code, tp.timezone_code, 'UTC'::text) AS timezone_code,
    COALESCE(pui.date_format, tp.date_format, '%d %b %Y'::text) AS date_format,
    COALESCE(pui.number_format, tp.number_format) AS number_format,
    COALESCE(pui.week_start::integer, tp.week_start::integer, 1) AS week_start,
    COALESCE(pui.appearance_mode, 'system'::text) AS appearance_mode,
    COALESCE(pui.density_code, 'compact'::text) AS density_code,
    NULL::text AS home_workspace_code,
    NULL::text AS home_module_code,
    NULL::uuid AS default_company_code_id,
    NULL::uuid AS default_book_id,
    NULL::uuid AS default_dashboard_id
   FROM master.principal p
     LEFT JOIN master.principal_ui_profile pui ON pui.principal_id = p.id AND pui.tenant_id = p.tenant_id
     LEFT JOIN master.tenant_profile tp ON tp.tenant_id = p.tenant_id
  WHERE p.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."v_resolved_address" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.id AS address_link_id,
    al.tenant_id,
    ot.code AS owner_type,
    al.owner_id,
    al.purpose,
    al.role_qualifier,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    a.id AS address_id,
    NULL::text AS address_code,
    NULL::text AS address_name,
    a.address_type,
    al.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    NULLIF(concat_ws(', ', a.line1, a.line2, a.line3, a.city,
        a.region, a.postal_code, a.country_code::text), '') AS formatted_address,
    a.latitude,
    a.longitude,
    a.status AS address_status,
    a.is_active AS address_is_active,
    c.name AS country_name,
    c.calling_code AS country_calling_code
   FROM master.address_link al
     JOIN control.owner_type ot ON ot.id = al.owner_type_id
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."v_resolved_identity" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.tenant_id,
    ot.code AS owner_type,
    al.owner_id,
    al.purpose AS role,
    al.role_qualifier AS address_qualifier,
    al.id AS address_link_id,
    al.is_primary AS address_is_primary,
    al.effective_from AS address_effective_from,
    al.effective_until AS address_effective_until,
    a.id AS address_id,
    a.address_type,
    al.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    NULLIF(concat_ws(', ', a.line1, a.line2, a.line3, a.city,
        a.region, a.postal_code, a.country_code::text), '') AS formatted_address,
    a.latitude,
    a.longitude,
    c.name AS country_name,
    c.calling_code AS country_calling_code,
    cl_email.id AS email_link_id,
    cl_email.value AS email,
    cl_email.role_qualifier AS email_qualifier,
    cl_email.id IS NOT NULL AS email_present,
    cl_phone.id AS phone_link_id,
    cl_phone.value AS phone,
    cl_phone.role_qualifier AS phone_qualifier,
    cl_phone.id IS NOT NULL AS phone_present
   FROM master.address_link al
     JOIN control.owner_type ot ON ot.id = al.owner_type_id
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
     LEFT JOIN LATERAL ( SELECT cl.id,
            cl.value,
            cl.role_qualifier
           FROM master.contact_link cl
          WHERE cl.tenant_id = al.tenant_id AND cl.owner_type_id = al.owner_type_id AND cl.owner_id = al.owner_id AND cl.purpose = al.purpose AND cl.channel_type = 'email'::text AND cl.is_primary = true AND cl.status = 'active'::text
          ORDER BY (NOT cl.role_qualifier IS DISTINCT FROM al.role_qualifier) DESC, cl.updated_at DESC NULLS LAST, cl.id
         LIMIT 1) cl_email ON true
     LEFT JOIN LATERAL ( SELECT cl.id,
            cl.value,
            cl.role_qualifier
           FROM master.contact_link cl
          WHERE cl.tenant_id = al.tenant_id AND cl.owner_type_id = al.owner_type_id AND cl.owner_id = al.owner_id AND cl.purpose = al.purpose AND cl.channel_type = 'phone'::text AND cl.is_primary = true AND cl.status = 'active'::text
          ORDER BY (NOT cl.role_qualifier IS DISTINCT FROM al.role_qualifier) DESC, cl.updated_at DESC NULLS LAST, cl.id
         LIMIT 1) cl_phone ON true
  WHERE al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."v_site_address" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.id,
    al.id AS link_id,
    al.tenant_id,
    al.owner_id AS site_id,
    al.purpose,
    al.role_qualifier,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    a.id AS address_id,
    NULL::text AS code,
    NULL::text AS name,
    al.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    NULLIF(concat_ws(', ', a.line1, a.line2, a.line3, a.city,
        a.region, a.postal_code, a.country_code::text), '') AS formatted_address,
    NULL::uuid AS tax_jurisdiction_id,
    a.status AS address_status,
    c.name AS country_name
   FROM master.address_link al
     JOIN control.owner_type ot ON ot.id = al.owner_type_id
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE ot.code = 'site'::text AND al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."v_supplier_address" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.id,
    al.id AS link_id,
    al.tenant_id,
    s.id AS supplier_id,
    ot.code AS link_owner_type,
    al.purpose,
    al.role_qualifier,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    a.id AS address_id,
    NULL::text AS code,
    NULL::text AS name,
    al.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    NULLIF(concat_ws(', ', a.line1, a.line2, a.line3, a.city,
        a.region, a.postal_code, a.country_code::text), '') AS formatted_address,
    NULL::uuid AS tax_jurisdiction_id,
    a.status AS address_status,
    c.name AS country_name
   FROM master.supplier s
     JOIN master.address_link al ON al.tenant_id = s.tenant_id
     JOIN control.owner_type ot ON ot.id = al.owner_type_id
       AND (ot.code = 'supplier'::text AND al.owner_id = s.id
         OR ot.code = 'business_partner'::text AND al.owner_id = s.business_partner_id)
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."v_supplier_bank_account" WITH (security_invoker=true, security_barrier=true) AS
WITH supplier_scoped_link AS (
         SELECT bal_1.id,
            bal_1.tenant_id,
            bal_1.owner_type,
            bal_1.owner_id,
            bal_1.bank_account_id,
            bal_1.company_code_id,
            bal_1.purpose,
            bal_1.is_primary,
            bal_1.effective_from,
            bal_1.effective_until,
            bal_1.metadata,
            bal_1.created_at,
            bal_1.created_by,
            bal_1.updated_at,
            bal_1.updated_by,
            s.id AS supplier_id
           FROM master.supplier s
             JOIN master.bank_account_link bal_1 ON bal_1.tenant_id = s.tenant_id AND bal_1.owner_id = s.business_partner_id
          WHERE bal_1.owner_type = 'business_partner'::text
        UNION ALL
         SELECT bal_1.id,
            bal_1.tenant_id,
            bal_1.owner_type,
            bal_1.owner_id,
            bal_1.bank_account_id,
            bal_1.company_code_id,
            bal_1.purpose,
            bal_1.is_primary,
            bal_1.effective_from,
            bal_1.effective_until,
            bal_1.metadata,
            bal_1.created_at,
            bal_1.created_by,
            bal_1.updated_at,
            bal_1.updated_by,
            bal_1.owner_id AS supplier_id
           FROM master.bank_account_link bal_1
          WHERE bal_1.owner_type = 'supplier'::text
        )
 SELECT bal.id,
    bal.tenant_id,
    bal.supplier_id,
    ba.account_id_value AS account_number,
    ba.currency_code,
    ba.account_holder_name,
    ba.account_id_type,
    ba.account_nature,
    ba.is_verified,
    bal.purpose,
    bal.is_primary,
    bal.effective_from,
    bal.effective_until,
    COALESCE(bp.name, ba.bank_name_override) AS bank_name,
    ba.bic_override,
    ba.bank_party_id,
    bal.bank_account_id,
    bal.created_at,
    bal.updated_at
   FROM supplier_scoped_link bal
     JOIN master.bank_account ba ON ba.id = bal.bank_account_id AND ba.tenant_id = bal.tenant_id
     LEFT JOIN master.bank_party bp ON bp.id = ba.bank_party_id AND bp.tenant_id = ba.tenant_id;

CREATE VIEW master.business_partner_governance_summary
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    tenant_id,
    business_partner_id,
    sum(COALESCE(ownership_pct, 0)) FILTER (WHERE status = 'active') AS disclosed_equity_pct,
    sum(COALESCE(beneficial_ownership_pct, ownership_pct, 0)) FILTER (WHERE status = 'active') AS disclosed_beneficial_ownership_pct,
    count(*) FILTER (WHERE relation_type_code = 'ubo' AND status = 'active') AS ubo_count,
    count(*) FILTER (WHERE relation_type_code IN ('director','board_member','officer') AND status = 'active') AS leadership_count,
    count(*) FILTER (WHERE relation_type_code IN ('signatory','authorized_representative','proxy') AND status = 'active') AS signatory_count,
    min(end_of_term) FILTER (WHERE status = 'active' AND end_of_term IS NOT NULL) AS next_end_of_term
FROM master.business_partner_governance_relation
GROUP BY tenant_id, business_partner_id;

CREATE VIEW master.entity_commodity_assignment
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    assignment.id,
    assignment.tenant_id,
    CASE
      WHEN assignment.commodity_category_id IS NOT NULL THEN 'commodity_category'
      WHEN assignment.product_id IS NOT NULL THEN 'product'
      ELSE 'item'
    END AS owner_type,
    COALESCE(assignment.commodity_category_id, assignment.product_id, assignment.item_id) AS owner_id,
    assignment.commodity_domain_code,
    assignment.commodity_code_id,
    code.code,
    code.name,
    assignment.mapping_type,
    assignment.confidence,
    assignment.provenance,
    assignment.is_owner_primary,
    assignment.is_code_routing_default,
    assignment.status
FROM master.commodity_code_assignment AS assignment
JOIN shared.commodity_code AS code ON code.id = assignment.commodity_code_id
WHERE assignment.status = 'active';

COMMENT ON VIEW master.business_partner_governance_summary IS
  'Canonical governance summary over business_partner_governance_relation.';
COMMENT ON VIEW master.entity_commodity_assignment IS
  'Canonical commodity assignment projection replacing v_entity_commodity.';
