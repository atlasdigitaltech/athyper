-- 10_views/003_master.sql
-- Depends on: 04_tables/003_master.sql, 04_tables/003a_master_identity.sql,
--             04_tables/003e_master_ui_principal.sql, 04_tables/001_shared.sql
-- Covers all master schema views (merged from 003_master + 003b_master_ui_principal).
--
-- SECURITY INVOKER (explicit): all underlying tables have FORCE ROW LEVEL
-- SECURITY, so queries against these views are filtered by the session
-- tenant automatically. Do NOT change to SECURITY DEFINER without adding
-- explicit tenant_id = shared.current_tenant_id_soft() predicates.

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
