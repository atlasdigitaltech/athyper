-- ============================================================================
-- master/07_views.sql
-- Concept: Identity Views — principal summary, auth group, and contact flattened views
-- Depends on: 04_tables/003a_master_identity.sql
-- Covers all master schema views (merged from 003_master + 003b_master_ui_principal).
--
-- SECURITY INVOKER (explicit): all underlying tables have FORCE ROW LEVEL
-- SECURITY, so queries against these views are filtered by the session
-- tenant automatically. Do NOT change to SECURITY DEFINER without adding
-- explicit tenant_id = shared.current_tenant_id_soft() predicates.
-- ============================================================================

-- v_contact_summary — flattened contact view joining contact_link + email/phone extensions
CREATE OR REPLACE VIEW master.v_contact_summary
    WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    cl.id               AS contact_link_id,
    cl.tenant_id,
    cl.owner_type,
    cl.owner_id,
    cl.channel_type,
    cl.value,
    cl.purpose,
    cl.is_primary,
    cl.is_verified,
    cl.verified_at,
    cl.status,
    cl.is_active,
    -- email extension
    ce.local_part       AS email_local_part,
    ce.domain           AS email_domain,
    ce.is_disposable    AS email_is_disposable,
    ce.mx_valid         AS email_mx_valid,
    ce.bounce_count     AS email_bounce_count,
    -- phone extension
    cp.e164             AS phone_e164,
    cp.calling_code     AS phone_calling_code,
    cp.national_number  AS phone_national_number,
    cp.line_type        AS phone_line_type
FROM master.contact_link cl
LEFT JOIN master.contact_email ce
    ON  ce.tenant_id       = cl.tenant_id
    AND ce.contact_link_id = cl.id
LEFT JOIN master.contact_phone cp
    ON  cp.tenant_id       = cl.tenant_id
    AND cp.contact_link_id = cl.id;

COMMENT ON VIEW master.v_contact_summary IS
    'Flattened contact view: contact_link + contact_email + contact_phone. '
    'SECURITY INVOKER — RLS on underlying tables enforces tenant isolation. '
    'Reduces application-side join complexity for common contact queries.';


-- v_resolved_address — address_link joined with address + country for display
CREATE OR REPLACE VIEW master.v_resolved_address
    WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    al.id               AS address_link_id,
    al.tenant_id,
    al.owner_type,
    al.owner_id,
    al.purpose,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    -- address fields
    a.id                AS address_id,
    a.code              AS address_code,
    a.name              AS address_name,
    a.address_type,
    a.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    a.formatted_address,
    a.latitude,
    a.longitude,
    a.status            AS address_status,
    a.is_active         AS address_is_active,
    -- country display fields
    c.name              AS country_name,
    c.calling_code      AS country_calling_code
FROM master.address_link al
JOIN master.address a
    ON  a.tenant_id = al.tenant_id
    AND a.id        = al.address_id
LEFT JOIN shared.country c
    ON  c.code = a.country_code
WHERE al.effective_from  <= CURRENT_DATE
  AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
  AND a.status = 'active';

COMMENT ON VIEW master.v_resolved_address IS
    'Currently valid address links + address + country display fields. '
    'Filters: effective_from <= today AND (effective_until IS NULL OR > today) '
    'AND address status = active. '
    'SECURITY INVOKER — RLS on underlying tables enforces tenant isolation. '
    'For historical or future links, query address_link directly.';


-- v_business_partner_address — address_link + address for business_partner owner_type
-- Exposes id (from address_link) as the record primary key so the entity engine
-- can serve GET /records/business_partner_address?parent_id=<bp_uuid>.
CREATE OR REPLACE VIEW master.v_business_partner_address
    WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    al.id,
    al.tenant_id,
    al.owner_id,
    al.address_id,
    al.purpose,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    al.metadata,
    al.created_at,
    al.created_by,
    al.updated_at,
    al.updated_by,
    -- address display fields
    a.address_type,
    a.line1,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    a.formatted_address,
    -- country label
    c.name              AS country_name
FROM master.address_link al
JOIN master.address a
    ON  a.tenant_id = al.tenant_id
    AND a.id        = al.address_id
LEFT JOIN shared.country c
    ON  c.code = a.country_code
WHERE al.owner_type = 'business_partner';

COMMENT ON VIEW master.v_business_partner_address IS
    'Address links scoped to owner_type=business_partner, joined with address and country. '
    'id = address_link.id (the link PK). No temporal filter — shows all links including expired. '
    'SECURITY INVOKER — RLS on underlying tables enforces tenant isolation.';


-- ============================================================================
-- CORE FINANCE — mv_company_postable_account
-- Materialized view caching the set of GL accounts postable per company.
-- Refresh after: chart assignment changes, gl_account activation, ccga updates.
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS master.mv_company_postable_account AS
SELECT
    cc.id           AS company_code_id,
    cc.tenant_id,
    cc.code         AS company_code,
    ga.id           AS gl_account_id,
    ga.code         AS account_code,
    ga.name         AS account_name,
    ga.account_class,
    ga.normal_balance,
    ga.subledger_type,
    COALESCE(ccga.posting_allowed, true)          AS posting_allowed,
    COALESCE(ccga.blocked_for_manual, false)      AS blocked_for_manual,
    COALESCE(ccga.blocked_for_auto, false)        AS blocked_for_auto,
    COALESCE(ccga.requires_cost_center, false)    AS requires_cost_center,
    COALESCE(ccga.requires_profit_center, false)  AS requires_profit_center,
    COALESCE(ccga.requires_project, false)        AS requires_project,
    ccga.default_cost_center_id,
    ccga.default_site_id,
    ccga.tax_category,
    ccga.reconciliation_type
FROM master.company_code cc
JOIN master.company_code_chart_assignment cca
    ON cca.company_code_id = cc.id
    AND cca.assignment_type = 'operating'
    AND cca.status = 'active'
JOIN master.gl_account ga
    ON ga.chart_of_account_id = cca.chart_of_account_id
    AND ga.is_active = true
    AND ga.node_type = 'posting'
LEFT JOIN master.company_code_gl_account ccga
    ON ccga.company_code_id = cc.id
    AND ccga.gl_account_id = ga.id
WHERE cc.is_active = true
  AND COALESCE(ccga.posting_allowed, true) = true
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_cpa_lookup_idx
    ON master.mv_company_postable_account (tenant_id, company_code_id, account_code);
CREATE INDEX IF NOT EXISTS mv_cpa_account_idx
    ON master.mv_company_postable_account (tenant_id, company_code_id, gl_account_id);
CREATE INDEX IF NOT EXISTS mv_cpa_class_idx
    ON master.mv_company_postable_account (tenant_id, company_code_id, account_class);

COMMENT ON MATERIALIZED VIEW master.mv_company_postable_account IS
    'Cached set of GL accounts postable per company_code. '
    'Join: company_code → ccca (operating/active) → gl_account (active/posting) → ccga (controls). '
    'REFRESH MATERIALIZED VIEW CONCURRENTLY after chart/account/ccga changes. '
    'Trigger-based refresh: call master.fn_refresh_mv_cpa() from AFTER triggers on '
    'company_code_chart_assignment, gl_account, company_code_gl_account. '
    'Alternatively, schedule via cron (recommended for high-write workloads).';

-- ── MV refresh helper ──────────────────────────────────────────────────────
-- Designed to be called from AFTER triggers or pg_cron.
-- Uses CONCURRENTLY to avoid locking readers during refresh.
CREATE OR REPLACE FUNCTION master.fn_refresh_mv_cpa()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY master.mv_company_postable_account;
END;
$$;

COMMENT ON FUNCTION master.fn_refresh_mv_cpa IS
    'Refreshes mv_company_postable_account concurrently. '
    'Call from AFTER triggers on ccca/gl_account/ccga or via pg_cron.';


-- =============================================================================
-- MODULE 400 — v_entity_commodity (classification bridge helper view)
-- =============================================================================

CREATE OR REPLACE VIEW master.v_entity_commodity
    WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    cl.tenant_id,
    cl.owner_type,
    cl.owner_id,
    cl.classification_type,
    cl.domain_code,
    cl.is_primary,
    cl.mapping_type,
    cl.confidence,
    cl.provenance,
    CASE cl.classification_type
        WHEN 'commodity' THEN cc.code
        WHEN 'industry'  THEN ic.code
    END AS system_code,
    CASE cl.classification_type
        WHEN 'commodity' THEN cc.name
        WHEN 'industry'  THEN ic.name
    END AS system_name,
    CASE cl.classification_type
        WHEN 'commodity' THEN cc.level_no
        WHEN 'industry'  THEN ic.level_no
    END AS level_no,
    CASE cl.classification_type
        WHEN 'commodity' THEN cc.domain_code
        WHEN 'industry'  THEN ic.domain_code
    END AS code_domain,
    cl.code_id
FROM master.commodity_classification cl
LEFT JOIN shared.commodity_code cc
    ON cl.classification_type = 'commodity' AND cc.id = cl.code_id
LEFT JOIN shared.industry_code ic
    ON cl.classification_type = 'industry' AND ic.id = cl.code_id
WHERE cl.is_active = true;

COMMENT ON VIEW master.v_entity_commodity IS
    'Flattened bridge: commodity_classification + commodity_code + industry_code. '
    'Reduces app-side JOINs from 3 to 2. LEFT JOINs with classification_type guards '
    'ensure only the correct code table is accessed per row. '
    'SECURITY INVOKER — RLS on commodity_classification enforces tenant isolation.';


-- v_employee — employee with computed is_terminated and employment_status
-- NOTE: is_terminated cannot be GENERATED STORED safely because CURRENT_DATE
-- evaluates at write time, not at query time. This view computes it correctly.
-- Drop and recreate (SELECT * expands at creation time; base table columns changed)
DROP VIEW IF EXISTS master.v_employee;
CREATE OR REPLACE VIEW master.v_employee
    WITH (security_invoker = true, security_barrier = true)
AS
SELECT *,
    (termination_date IS NOT NULL AND termination_date <= CURRENT_DATE) AS is_terminated,
    CASE
        WHEN termination_date IS NOT NULL AND termination_date <= CURRENT_DATE THEN 'terminated'
        WHEN hire_date IS NULL THEN 'pending'
        WHEN hire_date > CURRENT_DATE THEN 'future'
        ELSE 'employed'
    END AS employment_status
FROM master.employee;

COMMENT ON VIEW master.v_employee IS
    'Employee view with computed is_terminated (safe — evaluates CURRENT_DATE at query time, '
    'not at write time) and employment_status derived from hire_date + termination_date. '
    'SECURITY INVOKER — RLS on master.employee enforces tenant isolation.';


-- ============================================================================
-- BANK ENGINE — Views
-- ============================================================================

-- v_bank_account_resolved — bank_account + bank_party + correspondent for display
CREATE OR REPLACE VIEW master.v_bank_account_resolved
    WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    ba.id                       AS bank_account_id,
    ba.tenant_id,
    ba.code                     AS bank_account_code,
    ba.name                     AS bank_account_name,
    ba.account_holder_name,
    ba.account_id_type,
    CASE
        WHEN ba.account_last4 IS NOT NULL
        THEN repeat('*', greatest(length(ba.account_id_value) - 4, 0)) || ba.account_last4
        ELSE repeat('*', greatest(length(ba.account_id_value) - 4, 0))
             || right(ba.account_id_value, 4)
    END                         AS account_id_value_masked,
    ba.account_last4,
    ba.currency_code,
    ba.is_verified,
    ba.verified_at,
    ba.verification_method,
    ba.status                   AS bank_account_status,
    COALESCE(ba.account_nature, 'DIRECT') AS account_nature,
    ba.provider_account_ref,
    COALESCE(bp.id, NULL)       AS bank_party_id,
    COALESCE(bp.name, ba.bank_name_override)            AS bank_name,
    COALESCE(bp.bic, ba.bic_override)                   AS bic,
    COALESCE(bp.country_code, ba.bank_country_override)  AS bank_country_code,
    bp.institution_type,
    bp.national_bank_code_type,
    bp.national_bank_code,
    bp.branch_code,
    bp.branch_name,
    bp.supports_swift,
    bp.supports_sepa,
    bp.supports_ach,
    bp.supports_local_clearing,
    cbp.id                      AS correspondent_bank_party_id,
    cbp.name                    AS correspondent_bank_name,
    cbp.bic                     AS correspondent_bic,
    cbp.country_code            AS correspondent_country_code,
    cbp.national_bank_code_type AS correspondent_routing_type,
    cbp.national_bank_code      AS correspondent_routing_code
FROM master.bank_account ba
LEFT JOIN master.bank_party bp
    ON bp.tenant_id = ba.tenant_id AND bp.id = ba.bank_party_id
LEFT JOIN master.bank_party cbp
    ON cbp.tenant_id = ba.tenant_id AND cbp.id = ba.correspondent_bank_party_id
WHERE ba.status = 'active';

COMMENT ON VIEW master.v_bank_account_resolved IS
    'Active bank accounts with bank party + correspondent bank resolution. '
    'Includes fintech fields (account_nature, provider_account_ref). '
    'Account values masked. SECURITY INVOKER.';

-- v_bank_account_link_resolved — full resolved chain for payment execution
CREATE OR REPLACE VIEW master.v_bank_account_link_resolved
    WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    bal.id                      AS bank_account_link_id,
    bal.tenant_id,
    bal.owner_type,
    bal.owner_id,
    bal.company_code_id,
    bal.purpose,
    bal.is_primary,
    bal.effective_from,
    bal.effective_until,
    ba.id                       AS bank_account_id,
    ba.account_holder_name,
    ba.account_id_type,
    CASE
        WHEN ba.account_last4 IS NOT NULL
        THEN repeat('*', greatest(length(ba.account_id_value) - 4, 0)) || ba.account_last4
        ELSE repeat('*', greatest(length(ba.account_id_value) - 4, 0))
             || right(ba.account_id_value, 4)
    END                         AS account_id_value_masked,
    ba.account_last4,
    ba.currency_code,
    ba.is_verified,
    ba.verification_method,
    COALESCE(ba.account_nature, 'DIRECT') AS account_nature,
    ba.provider_account_ref,
    COALESCE(bp.name, ba.bank_name_override)            AS bank_name,
    COALESCE(bp.bic, ba.bic_override)                   AS bic,
    COALESCE(bp.country_code, ba.bank_country_override)  AS bank_country_code,
    bp.institution_type,
    bp.national_bank_code_type,
    bp.national_bank_code,
    cbp.name                    AS correspondent_bank_name,
    cbp.bic                     AS correspondent_bic,
    hc.id                       AS house_config_id,
    hc.gl_account_id,
    hc.usage_type,
    hc.local_account_type,
    hc.is_disbursement_enabled,
    hc.is_collection_enabled,
    hc.is_default_disbursement,
    hc.is_default_collection,
    hc.priority,
    hc.reconciliation_mode
FROM master.bank_account_link bal
JOIN master.bank_account ba
    ON ba.tenant_id = bal.tenant_id AND ba.id = bal.bank_account_id
LEFT JOIN master.bank_party bp
    ON bp.tenant_id = ba.tenant_id AND bp.id = ba.bank_party_id
LEFT JOIN master.bank_party cbp
    ON cbp.tenant_id = ba.tenant_id AND cbp.id = ba.correspondent_bank_party_id
LEFT JOIN master.bank_account_house_config hc
    ON hc.tenant_id = bal.tenant_id AND hc.bank_account_link_id = bal.id
    AND hc.status = 'active'
WHERE bal.effective_from <= CURRENT_DATE
  AND (bal.effective_until IS NULL OR bal.effective_until > CURRENT_DATE)
  AND ba.status = 'active';

COMMENT ON VIEW master.v_bank_account_link_resolved IS
    'Currently valid bank account links with full resolution chain including '
    'fintech fields and correspondent bank. Account values masked. SECURITY INVOKER.';


-- v_business_partner_bank_account - canonical BP-owned banking lens.
-- Includes legacy supplier/customer-owned links as a compatibility bridge by
-- resolving their parent business_partner_id through the role anchor.
CREATE OR REPLACE VIEW master.v_business_partner_bank_account
    WITH (security_invoker = true, security_barrier = true)
AS
WITH bp_scoped_link AS (
    SELECT
        bal.*,
        bal.owner_id AS business_partner_id
    FROM master.bank_account_link bal
    WHERE bal.owner_type = 'business_partner'

    UNION ALL

    SELECT
        bal.*,
        s.business_partner_id
    FROM master.bank_account_link bal
    JOIN master.supplier s
      ON s.tenant_id = bal.tenant_id
     AND s.id        = bal.owner_id
    WHERE bal.owner_type = 'supplier'

    UNION ALL

    SELECT
        bal.*,
        c.business_partner_id
    FROM master.bank_account_link bal
    JOIN master.customer c
      ON c.tenant_id = bal.tenant_id
     AND c.id        = bal.owner_id
    WHERE bal.owner_type = 'customer'
)
SELECT
    bal.id,
    bal.tenant_id,
    bal.business_partner_id,
    ba.account_id_value                      AS account_number,
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
    cc.code                                  AS company_code,
    COALESCE(cc.display_name, cc.name)       AS company_code_name,
    ba.account_id_value,
    CASE
        WHEN ba.account_last4 IS NOT NULL
        THEN repeat('*', greatest(length(ba.account_id_value) - 4, 0)) || ba.account_last4
        ELSE repeat('*', greatest(length(ba.account_id_value) - 4, 0))
             || right(ba.account_id_value, 4)
    END                                      AS account_id_value_masked,
    ba.account_last4,
    ba.verified_at,
    ba.verified_by,
    ba.verification_method,
    ba.bank_name_override,
    COALESCE(bp.bic, ba.bic_override)        AS bic,
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
    cbp.name                                 AS correspondent_bank_name,
    cbp.bic                                  AS correspondent_bic,
    bal.metadata                             AS link_metadata,
    ba.metadata                              AS account_metadata
FROM bp_scoped_link bal
JOIN master.bank_account ba
  ON ba.id        = bal.bank_account_id
 AND ba.tenant_id = bal.tenant_id
LEFT JOIN master.bank_party bp
  ON bp.id        = ba.bank_party_id
 AND bp.tenant_id = ba.tenant_id
LEFT JOIN master.bank_party cbp
  ON cbp.id        = ba.correspondent_bank_party_id
 AND cbp.tenant_id = ba.tenant_id
LEFT JOIN master.company_code cc
  ON cc.id        = bal.company_code_id
 AND cc.tenant_id = bal.tenant_id;

COMMENT ON VIEW master.v_business_partner_bank_account IS
    'Canonical BP banking view over bank_account_link + bank_account. '
    'owner_type=business_partner is canonical; supplier/customer owner links '
    'are included as temporary compatibility rows via their BP role anchors.';


-- v_supplier_bank_account - temporary supplier compatibility view.
-- New writes should use owner_type='business_partner' and read through
-- v_business_partner_bank_account. This view keeps Supplier Banking tabs
-- working while callers move to BP-owned banking.
CREATE OR REPLACE VIEW master.v_supplier_bank_account
    WITH (security_invoker = true, security_barrier = true)
AS
WITH supplier_scoped_link AS (
    SELECT
        bal.*,
        s.id AS supplier_id
    FROM master.supplier s
    JOIN master.bank_account_link bal
      ON bal.tenant_id = s.tenant_id
     AND bal.owner_id  = s.business_partner_id
    WHERE bal.owner_type = 'business_partner'

    UNION ALL

    SELECT
        bal.*,
        bal.owner_id AS supplier_id
    FROM master.bank_account_link bal
    WHERE bal.owner_type = 'supplier'
)
SELECT
    bal.id,
    bal.tenant_id,
    bal.supplier_id,
    ba.account_id_value                      AS account_number,
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
JOIN master.bank_account ba
  ON ba.id        = bal.bank_account_id
 AND ba.tenant_id = bal.tenant_id
LEFT JOIN master.bank_party bp
  ON bp.id        = ba.bank_party_id
 AND bp.tenant_id = ba.tenant_id;

COMMENT ON VIEW master.v_supplier_bank_account IS
    'Temporary compatibility view for supplier banking. Shows canonical '
    'BP-owned bank links for each supplier plus legacy owner_type=supplier '
    'links. New code should use master.v_business_partner_bank_account.';

-- ============================================================================
-- BP app index
-- ============================================================================

DROP VIEW IF EXISTS master.v_business_partner_app_index;
CREATE OR REPLACE VIEW master.v_business_partner_app_index AS
WITH supplier_role AS (
    SELECT
        s.tenant_id,
        s.business_partner_id,
        s.id AS supplier_id,
        s.supplier_code,
        s.supplier_type,
        s.status AS supplier_status,
        s.is_active AS supplier_is_active,
        COALESCE(s.is_payment_ready, false) AS is_payment_ready,
        COUNT(scp.id)::integer AS supplier_company_scope_count,
        (COUNT(scp.id) FILTER (WHERE scp.is_active))::integer AS supplier_active_scope_count,
        (COUNT(scp.id) FILTER (WHERE scp.is_blocked))::integer AS supplier_blocked_scope_count,
        MAX(scp.updated_at) AS supplier_scope_updated_at,
        s.created_at AS supplier_created_at,
        s.updated_at AS supplier_updated_at
    FROM master.supplier s
    LEFT JOIN master.company_code_supplier_profile scp
      ON scp.tenant_id = s.tenant_id
     AND scp.supplier_id = s.id
    GROUP BY
        s.tenant_id,
        s.business_partner_id,
        s.id,
        s.supplier_code,
        s.supplier_type,
        s.status,
        s.is_active,
        s.is_payment_ready,
        s.created_at,
        s.updated_at
),
customer_role AS (
    SELECT
        c.tenant_id,
        c.business_partner_id,
        c.id AS customer_id,
        c.customer_code,
        c.customer_type,
        c.status AS customer_status,
        c.is_active AS customer_is_active,
        COALESCE(c.is_key_account, false) AS is_key_account,
        c.risk_rating,
        COUNT(ccp.id)::integer AS customer_company_scope_count,
        (COUNT(ccp.id) FILTER (WHERE ccp.is_active))::integer AS customer_active_scope_count,
        (COUNT(ccp.id) FILTER (WHERE ccp.is_blocked))::integer AS customer_blocked_scope_count,
        MAX(ccp.updated_at) AS customer_scope_updated_at,
        c.created_at AS customer_created_at,
        c.updated_at AS customer_updated_at
    FROM master.customer c
    LEFT JOIN master.company_code_customer_profile ccp
      ON ccp.tenant_id = c.tenant_id
     AND ccp.customer_id = c.id
    GROUP BY
        c.tenant_id,
        c.business_partner_id,
        c.id,
        c.customer_code,
        c.customer_type,
        c.status,
        c.is_active,
        c.is_key_account,
        c.risk_rating,
        c.created_at,
        c.updated_at
)
SELECT
    bp.id,
    bp.tenant_id,
    bp.code,
    bp.name,
    bp.display_name,
    bp.partner_category,
    bp.legal_name,
    bp.legal_form,
    bp.registration_no,
    bp.registration_country_code,
    bp.tax_residence_country_code,
    bp.website_url,
    bp.parent_business_partner_id,
    bp.description,
    bp.long_description,
    bp.aliases,
    bp.tags,
    bp.business_types,
    bp.founded_year,
    bp.employee_count_band,
    bp.annual_revenue_band,
    bp.incorporation_date,
    bp.effective_from,
    bp.effective_until,
    bp.external_ref,
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
    (sr.supplier_id IS NOT NULL) AS has_supplier_role,
    (cr.customer_id IS NOT NULL) AS has_customer_role,
    (sr.supplier_id IS NOT NULL AND cr.customer_id IS NOT NULL) AS is_dual_role,
    ((sr.supplier_id IS NOT NULL)::integer + (cr.customer_id IS NOT NULL)::integer) AS role_count,
    array_remove(ARRAY[
        CASE WHEN sr.supplier_id IS NOT NULL THEN 'supplier' END,
        CASE WHEN cr.customer_id IS NOT NULL THEN 'customer' END
    ], NULL)::text[] AS role_kinds,
    NULLIF(concat_ws(' / ', sr.supplier_code, cr.customer_code), '') AS role_codes,
    CASE
        WHEN sr.supplier_id IS NOT NULL AND cr.customer_id IS NOT NULL THEN 'Supplier + Customer'
        WHEN sr.supplier_id IS NOT NULL THEN 'Supplier'
        WHEN cr.customer_id IS NOT NULL THEN 'Customer'
        WHEN bp.partner_category = 'internal' THEN 'Internal'
        ELSE 'Identity'
    END AS role_summary,
    COALESCE(sr.supplier_company_scope_count, 0) + COALESCE(cr.customer_company_scope_count, 0) AS company_scope_count,
    COALESCE(sr.supplier_active_scope_count, 0) + COALESCE(cr.customer_active_scope_count, 0) AS active_scope_count,
    COALESCE(sr.supplier_blocked_scope_count, 0) + COALESCE(cr.customer_blocked_scope_count, 0) AS blocked_scope_count,
    (
        COALESCE(sr.supplier_blocked_scope_count, 0) > 0
        OR COALESCE(cr.customer_blocked_scope_count, 0) > 0
        OR sr.supplier_status IN ('on_hold', 'suspended')
        OR cr.customer_status IN ('on_hold', 'credit_hold')
        OR bp.status IN ('on_hold', 'blocked')
    ) AS is_blocked,
    lower(concat_ws(' ',
        bp.code,
        bp.name,
        bp.display_name,
        bp.legal_name,
        bp.registration_no,
        bp.external_ref,
        sr.supplier_code,
        sr.supplier_type,
        cr.customer_code,
        cr.customer_type,
        array_to_string(bp.aliases, ' '),
        array_to_string(bp.business_types, ' ')
    )) AS search_text,
    bp.created_at,
    bp.created_by,
    GREATEST(
        COALESCE(bp.updated_at, bp.created_at),
        COALESCE(sr.supplier_updated_at, sr.supplier_created_at, bp.created_at),
        COALESCE(sr.supplier_scope_updated_at, bp.created_at),
        COALESCE(cr.customer_updated_at, cr.customer_created_at, bp.created_at),
        COALESCE(cr.customer_scope_updated_at, bp.created_at)
    ) AS updated_at,
    bp.updated_by
FROM master.business_partner bp
LEFT JOIN supplier_role sr
  ON sr.tenant_id = bp.tenant_id
 AND sr.business_partner_id = bp.id
LEFT JOIN customer_role cr
  ON cr.tenant_id = bp.tenant_id
 AND cr.business_partner_id = bp.id;

COMMENT ON VIEW master.v_business_partner_app_index IS
    'BP meta-entity list read model. One row per business_partner with canonical '
    'identity fields plus supplier/customer role presence, role codes, company-scope '
    'counts, block posture, and search text. Detail pages still read master.business_partner.';

-- ============================================================================
-- BP role summary
-- ============================================================================

DROP VIEW IF EXISTS master.v_business_partner_role_summary;
CREATE OR REPLACE VIEW master.v_business_partner_role_summary AS
WITH supplier_scope AS (
    SELECT
        supplier_id,
        tenant_id,
        (COUNT(*) FILTER (WHERE is_active))::integer AS active_scope_count,
        COUNT(*)::integer AS company_scope_count,
        (COUNT(*) FILTER (WHERE is_blocked))::integer AS blocked_scope_count,
        (MIN(currency_code) FILTER (WHERE is_active AND currency_code IS NOT NULL))::text AS primary_currency_code,
        MAX(updated_at) AS last_scope_updated_at
    FROM master.company_code_supplier_profile
    GROUP BY tenant_id, supplier_id
),
customer_scope AS (
    SELECT
        customer_id,
        tenant_id,
        (COUNT(*) FILTER (WHERE is_active))::integer AS active_scope_count,
        COUNT(*)::integer AS company_scope_count,
        (COUNT(*) FILTER (WHERE is_blocked))::integer AS blocked_scope_count,
        (MIN(currency_code) FILTER (WHERE is_active AND currency_code IS NOT NULL))::text AS primary_currency_code,
        MAX(updated_at) AS last_scope_updated_at
    FROM master.company_code_customer_profile
    GROUP BY tenant_id, customer_id
)
SELECT
    s.id,
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
    COALESCE(ss.active_scope_count, 0)::integer AS active_scope_count,
    COALESCE(ss.company_scope_count, 0)::integer AS company_scope_count,
    COALESCE(ss.blocked_scope_count, 0)::integer AS blocked_scope_count,
    COALESCE(s.is_payment_ready, false) AS is_payment_ready,
    NULL::boolean AS is_key_account,
    NULL::text AS risk_rating,
    COALESCE(ss.blocked_scope_count, 0) > 0 OR s.status IN ('on_hold', 'suspended') AS is_blocked,
    ss.primary_currency_code,
    NULL::integer AS open_document_count,
    NULL::numeric(18,4) AS ytd_amount,
    ss.primary_currency_code AS ytd_currency_code,
    10::integer AS display_order,
    s.created_at,
    GREATEST(
        COALESCE(s.updated_at, s.created_at),
        COALESCE(ss.last_scope_updated_at, s.created_at)
    ) AS updated_at
FROM master.supplier s
LEFT JOIN supplier_scope ss
  ON ss.supplier_id = s.id
 AND ss.tenant_id = s.tenant_id
UNION ALL
SELECT
    c.id,
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
    COALESCE(cs.active_scope_count, 0)::integer AS active_scope_count,
    COALESCE(cs.company_scope_count, 0)::integer AS company_scope_count,
    COALESCE(cs.blocked_scope_count, 0)::integer AS blocked_scope_count,
    NULL::boolean AS is_payment_ready,
    COALESCE(c.is_key_account, false) AS is_key_account,
    c.risk_rating,
    COALESCE(cs.blocked_scope_count, 0) > 0 OR c.status IN ('on_hold', 'credit_hold') AS is_blocked,
    cs.primary_currency_code,
    NULL::integer AS open_document_count,
    NULL::numeric(18,4) AS ytd_amount,
    cs.primary_currency_code AS ytd_currency_code,
    20::integer AS display_order,
    c.created_at,
    GREATEST(
        COALESCE(c.updated_at, c.created_at),
        COALESCE(cs.last_scope_updated_at, c.created_at)
    ) AS updated_at
FROM master.customer c
LEFT JOIN customer_scope cs
  ON cs.customer_id = c.id
 AND cs.tenant_id = c.tenant_id;

COMMENT ON VIEW master.v_business_partner_role_summary IS
    'BP 360 read model for Overview role cards. One row per supplier/customer role, '
    'with role identity, status, company-code scope counts, block posture, and typed '
    'future AP/AR document metrics. SECURITY INVOKER; base-table RLS applies.';

-- ============================================================================
-- BP 360 governance summary
-- ============================================================================

DROP VIEW IF EXISTS master.v_business_partner_governance_summary;
CREATE OR REPLACE VIEW master.v_business_partner_governance_summary AS
SELECT
    tenant_id,
    party_id AS business_partner_id,
    SUM(CASE
        WHEN relation_type = 'shareholder' AND is_active THEN COALESCE(ownership_pct, 0)
        ELSE 0
    END) AS disclosed_equity_pct,
    SUM(CASE
        WHEN relation_type IN ('ubo', 'shareholder') AND is_active
            THEN COALESCE(beneficial_ownership_pct, ownership_pct, 0)
        ELSE 0
    END) AS disclosed_beneficial_ownership_pct,
    COUNT(*) FILTER (WHERE relation_type = 'ubo' AND is_active) AS ubo_count,
    COUNT(*) FILTER (WHERE relation_type IN ('director', 'board_member', 'officer') AND is_active) AS leadership_count,
    COUNT(*) FILTER (WHERE relation_type IN ('signatory', 'authorized_representative', 'proxy') AND is_active) AS signatory_count,
    COUNT(*) FILTER (WHERE relation_type IN ('auditor', 'advisor', 'company_secretary') AND is_active) AS advisory_count,
    COUNT(*) FILTER (WHERE sanctions_status IN ('flagged', 'blocked') AND is_active) AS sanctions_issue_count,
    COUNT(*) FILTER (WHERE pep_status = 'pep' AND is_active) AS pep_count,
    COUNT(*) FILTER (WHERE kyc_status IN ('verified', 'passed') AND is_active) AS kyc_verified_count,
    COUNT(*) FILTER (WHERE evidence_status IN ('verified', 'waived') AND is_active) AS evidence_ready_count,
    MAX(last_screened_at) FILTER (WHERE is_active) AS last_screened_at,
    MAX(last_reviewed_at) FILTER (WHERE is_active) AS last_reviewed_at,
    MIN(next_review_at) FILTER (WHERE is_active AND next_review_at IS NOT NULL) AS next_review_at
FROM master.party_governance_relation
WHERE party_type = 'business_partner'
GROUP BY tenant_id, party_id;

COMMENT ON VIEW master.v_business_partner_governance_summary IS
    'BP 360 read model for governance posture: ownership disclosure, UBOs, leadership, '
    'signatories, compliance exceptions, and review cadence. SECURITY INVOKER; base-table RLS applies.';


-- ============================================================================
-- UI Principal views
-- ============================================================================
-- ════════════════════════════════════════════════════════════════════════════
-- master.v_effective_principal_ui
-- ════════════════════════════════════════════════════════════════════════════
-- Applies the UI settings resolution cascade:
--   platform default → master.tenant_profile → master.principal_ui_profile
--
-- Used by API endpoints and reporting. Callers read this view instead of
-- manually joining the three source tables.
--
-- Security: SECURITY INVOKER (default). RLS on principal_ui_profile and
-- principal_profile applies to the calling session. Admin sessions see all.

DROP VIEW IF EXISTS master.v_effective_principal_ui;
CREATE OR REPLACE VIEW master.v_effective_principal_ui AS
SELECT
    p.id                    AS principal_id,
    p.tenant_id,

    -- Locale chain: principal_ui_profile → tenant_profile → platform default
    COALESCE(pui.locale_code,   tp.locale_code,   'en')       AS locale_code,
    COALESCE(pui.language_code, tp.language_code,  'en')       AS language_code,
    COALESCE(pui.timezone_code, tp.timezone_code,  'UTC')      AS timezone_code,
    COALESCE(pui.date_format,   tp.date_format,   '%Y-%m-%d') AS date_format,
    COALESCE(pui.number_format, tp.number_format)              AS number_format,
    COALESCE(pui.week_start,    tp.week_start,    1)           AS week_start,

    -- Appearance (principal-level only — no tenant defaults for these columns)
    COALESCE(pui.appearance_mode, 'system')                    AS appearance_mode,
    COALESCE(pui.density_code,    'comfortable')               AS density_code,

    -- Navigation defaults
    pui.home_workspace_code,
    pui.home_module_code,

    -- Working-context defaults: UI-level overrides → principal_profile HR/operational fallback
    COALESCE(pui.default_company_code_id, pp.default_company_code_id) AS default_company_code_id,
    pui.default_book_id,
    pui.default_dashboard_id

FROM master.principal p
LEFT JOIN master.principal_profile    pp  ON pp.principal_id = p.id AND pp.tenant_id = p.tenant_id
LEFT JOIN master.principal_ui_profile pui ON pui.principal_id = p.id AND pui.tenant_id = p.tenant_id
LEFT JOIN master.tenant_profile       tp  ON tp.tenant_id = p.tenant_id
WHERE p.status = 'active';

COMMENT ON VIEW master.v_effective_principal_ui IS
    'Effective UI settings for active principals. Applies resolution cascade: '
    'platform default → tenant_profile → principal_ui_profile. '
    'Appearance (appearance_mode, density_code) defaults are system/comfortable '
    '— no tenant-level column for these. '
    'Working-context defaults fall back to principal_profile (HR/operational defaults). '
    'SECURITY INVOKER — RLS on base tables applies to the calling session.';


-- ============================================================================
-- §RK  master.v_tenant_risk_source_config — redacted source config view
-- Omits api_config (provider credentials). Application code uses this view
-- for all display and management surfaces. Server-side integration workers
-- read api_config directly from the base table, running as athyperadmin.
-- ============================================================================

DROP VIEW IF EXISTS master.v_tenant_risk_source_config;
CREATE OR REPLACE VIEW master.v_tenant_risk_source_config AS
SELECT
    id,
    tenant_id,
    source_code,
    is_enabled,
    custom_trust_level,
    -- api_config intentionally excluded; contains provider credentials.
    -- Read from master.tenant_risk_source_config as athyperadmin only.
    status,
    created_at,
    created_by,
    updated_at,
    updated_by
FROM master.tenant_risk_source_config;

COMMENT ON VIEW master.v_tenant_risk_source_config IS
    'Redacted view of master.tenant_risk_source_config. api_config (provider API '
    'credentials) is excluded from this view. '
    'All application-facing reads (settings UI, config management) MUST use this view. '
    'Integration workers that call provider APIs read the base table as athyperadmin. '
    'SECURITY INVOKER — RLS on the base table applies to the calling session.';
