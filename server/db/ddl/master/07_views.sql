-- ============================================================================
-- master/07_views.sql
-- Views and materialized views reconstructed from the live catalog.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE VIEW "master"."auth_current_delegation_permission_scope_v" WITH (security_invoker=true, security_barrier=true) AS
SELECT d.tenant_id,
    d.plane_code,
    d.id AS delegation_id,
    d.delegator_id,
    d.delegate_id,
    grant_row.permission_id,
    grant_row.scope_target_id,
    d.effective_from,
    d.effective_until,
    d.reason,
    d.approval_ticket,
    d.metadata
   FROM master.auth_delegation d
     JOIN master.auth_delegation_grant grant_row ON grant_row.delegation_id = d.id AND grant_row.tenant_id = d.tenant_id AND grant_row.plane_code = d.plane_code
     JOIN master.auth_scope_target s ON s.id = grant_row.scope_target_id AND s.tenant_id = grant_row.tenant_id AND s.plane_code = grant_row.plane_code
  WHERE d.status = 'active'::text AND d.effective_from <= now() AND d.effective_until > now() AND s.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."auth_current_group_role_v" WITH (security_invoker=true, security_barrier=true) AS
SELECT a.id,
    a.tenant_id,
    a.plane_code,
    a.group_id,
    a.role_id,
    a.scope_target_id,
    a.status,
    a.effective_from,
    a.effective_until,
    a.source_type,
    a.source_ref,
    a.metadata,
    a.created_at,
    a.created_by,
    a.updated_at,
    a.updated_by
   FROM master.auth_group_role a
     JOIN master.auth_group g ON g.id = a.group_id AND g.tenant_id = a.tenant_id AND g.plane_code = a.plane_code
     JOIN master.auth_role r ON r.id = a.role_id AND r.tenant_id = a.tenant_id AND r.plane_code = a.plane_code
     JOIN master.auth_scope_target s ON s.id = a.scope_target_id AND s.tenant_id = a.tenant_id AND s.plane_code = a.plane_code
  WHERE a.status = 'active'::text AND a.effective_from <= now() AND (a.effective_until IS NULL OR a.effective_until > now()) AND g.status = 'active'::text AND r.status = 'active'::text AND s.status = 'active'::text;

CREATE OR REPLACE VIEW "master"."auth_current_plane_membership_v" WITH (security_invoker=true, security_barrier=true) AS
SELECT m.id,
    m.tenant_id,
    m.plane_code,
    m.principal_id,
    m.status,
    m.effective_from,
    m.effective_until,
    m.source_type,
    m.source_ref,
    m.metadata,
    m.created_at,
    m.created_by,
    m.updated_at,
    m.updated_by
   FROM master.auth_plane_membership m
     JOIN master.principal p ON p.id = m.principal_id AND p.tenant_id = m.tenant_id
  WHERE m.status = 'active'::text AND m.effective_from <= now() AND (m.effective_until IS NULL OR m.effective_until > now()) AND p.status = 'active'::text AND NOT p.is_locked;

CREATE OR REPLACE VIEW "master"."auth_published_role_permission_v" WITH (security_invoker=true, security_barrier=true) AS
SELECT r.tenant_id,
    r.plane_code,
    r.id AS role_id,
    r.code AS role_code,
    rp.id AS compilation_id,
    rp.permission_id,
    p.canonical_code AS permission_code,
    p.entity_id,
    p.operation_code,
    p.risk_tier,
    p.requires_mfa,
    p.requires_sod,
    p.is_shareable,
    p.is_delegable
   FROM master.auth_role r
     JOIN master.auth_role_permission rp ON rp.tenant_id = r.tenant_id AND rp.plane_code = r.plane_code AND rp.role_id = r.id
     JOIN control.auth_permission p ON p.id = rp.permission_id
  WHERE r.status = 'active'::text AND r.effective_from <= now() AND (r.effective_until IS NULL OR r.effective_until > now()) AND rp.status = 'active'::text AND rp.effective_from <= now() AND (rp.effective_until IS NULL OR rp.effective_until > now()) AND p.status = 'published'::text AND (p.plane_code::text = r.plane_code OR p.plane_code = 'all'::control.auth_plane_code) AND p.effective_from <= now() AND (p.effective_until IS NULL OR p.effective_until > now());

CREATE OR REPLACE VIEW "master"."auth_scope_target_resolved_v" WITH (security_invoker=true, security_barrier=true) AS
SELECT id AS scope_target_id,
    tenant_id,
    plane_code,
    scope_kind,
    scope_key,
    display_name,
    status,
    COALESCE(tenant_scope_id, company_code_id, legal_entity_id, operating_organization_id) AS resource_id,
    metadata,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM master.auth_scope_target;

CREATE MATERIALIZED VIEW "master"."mv_company_postable_account" AS
SELECT cc.id AS company_code_id,
    cc.tenant_id,
    cc.code AS company_code,
    ga.id AS gl_account_id,
    ga.code AS account_code,
    ga.name AS account_name,
    ga.metadata ->> '_display_no'::text AS display_no,
    ga.account_class,
    ga.normal_balance,
    ga.subledger_type,
    COALESCE(ccga.posting_allowed, true) AS posting_allowed,
    COALESCE(ccga.blocked_for_manual, false) AS blocked_for_manual,
    COALESCE(ccga.blocked_for_auto, false) AS blocked_for_auto,
    COALESCE(ccga.requires_cost_center, false) AS requires_cost_center,
    COALESCE(ccga.requires_profit_center, false) AS requires_profit_center,
    COALESCE(ccga.requires_project, false) AS requires_project,
    ccga.default_cost_center_id,
    ccga.default_site_id,
    ccga.tax_category,
    ccga.reconciliation_type
   FROM master.company_code cc
     JOIN master.company_code_chart_assignment cca ON cca.company_code_id = cc.id AND cca.assignment_type = 'operating'::text AND cca.status = 'active'::text
     JOIN master.gl_account ga ON ga.chart_of_account_id = cca.chart_of_account_id AND ga.is_active = true AND ga.node_type = 'posting'::text AND COALESCE((ga.metadata ->> '_journal_postable'::text)::boolean, true) = true
     LEFT JOIN master.company_code_gl_account ccga ON ccga.company_code_id = cc.id AND ccga.gl_account_id = ga.id
  WHERE cc.is_active = true AND COALESCE(ccga.posting_allowed, true) = true
WITH DATA;

COMMENT ON MATERIALIZED VIEW "master"."mv_company_postable_account" IS 'Cached set of GL accounts postable per company_code. Includes display_no (metadata._display_no) for hybrid code strategy. REFRESH MATERIALIZED VIEW CONCURRENTLY after chart/account/ccga changes.';

CREATE OR REPLACE VIEW "master"."v_bank_account_link_resolved" WITH (security_invoker=true, security_barrier=true) AS
SELECT bal.id AS bank_account_link_id,
    bal.tenant_id,
    bal.owner_type,
    bal.owner_id,
    bal.company_code_id,
    bal.purpose,
    bal.is_primary,
    bal.effective_from,
    bal.effective_until,
    ba.id AS bank_account_id,
    ba.account_holder_name,
    ba.account_id_type,
        CASE
            WHEN ba.account_last4 IS NOT NULL THEN repeat('*'::text, GREATEST(length(ba.account_id_value) - 4, 0)) || ba.account_last4
            ELSE repeat('*'::text, GREATEST(length(ba.account_id_value) - 4, 0)) || "right"(ba.account_id_value, 4)
        END AS account_id_value_masked,
    ba.account_last4,
    ba.currency_code,
    ba.is_verified,
    ba.verification_method,
    COALESCE(ba.account_nature, 'DIRECT'::text) AS account_nature,
    ba.provider_account_ref,
    COALESCE(bp.name, ba.bank_name_override) AS bank_name,
    COALESCE(bp.bic, ba.bic_override) AS bic,
    COALESCE(bp.country_code, ba.bank_country_override) AS bank_country_code,
    bp.institution_type,
    bp.national_bank_code_type,
    bp.national_bank_code,
    cbp.name AS correspondent_bank_name,
    cbp.bic AS correspondent_bic,
    hc.id AS house_config_id,
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
     JOIN master.bank_account ba ON ba.tenant_id = bal.tenant_id AND ba.id = bal.bank_account_id
     LEFT JOIN master.bank_party bp ON bp.tenant_id = ba.tenant_id AND bp.id = ba.bank_party_id
     LEFT JOIN master.bank_party cbp ON cbp.tenant_id = ba.tenant_id AND cbp.id = ba.correspondent_bank_party_id
     LEFT JOIN master.bank_account_house_config hc ON hc.tenant_id = bal.tenant_id AND hc.bank_account_link_id = bal.id AND hc.status = 'active'::text
  WHERE bal.effective_from <= CURRENT_DATE AND (bal.effective_until IS NULL OR bal.effective_until > CURRENT_DATE) AND ba.status = 'active'::text;

COMMENT ON VIEW "master"."v_bank_account_link_resolved" IS 'Currently valid bank account links with full resolution chain including fintech fields and correspondent bank. Account values masked. SECURITY INVOKER.';

CREATE OR REPLACE VIEW "master"."v_bank_account_resolved" WITH (security_invoker=true, security_barrier=true) AS
SELECT ba.id AS bank_account_id,
    ba.tenant_id,
    ba.code AS bank_account_code,
    ba.name AS bank_account_name,
    ba.account_holder_name,
    ba.account_id_type,
        CASE
            WHEN ba.account_last4 IS NOT NULL THEN repeat('*'::text, GREATEST(length(ba.account_id_value) - 4, 0)) || ba.account_last4
            ELSE repeat('*'::text, GREATEST(length(ba.account_id_value) - 4, 0)) || "right"(ba.account_id_value, 4)
        END AS account_id_value_masked,
    ba.account_last4,
    ba.currency_code,
    ba.is_verified,
    ba.verified_at,
    ba.verification_method,
    ba.status AS bank_account_status,
    COALESCE(ba.account_nature, 'DIRECT'::text) AS account_nature,
    ba.provider_account_ref,
    COALESCE(bp.id, NULL::uuid) AS bank_party_id,
    COALESCE(bp.name, ba.bank_name_override) AS bank_name,
    COALESCE(bp.bic, ba.bic_override) AS bic,
    COALESCE(bp.country_code, ba.bank_country_override) AS bank_country_code,
    bp.institution_type,
    bp.national_bank_code_type,
    bp.national_bank_code,
    bp.branch_code,
    bp.branch_name,
    bp.supports_swift,
    bp.supports_sepa,
    bp.supports_ach,
    bp.supports_local_clearing,
    cbp.id AS correspondent_bank_party_id,
    cbp.name AS correspondent_bank_name,
    cbp.bic AS correspondent_bic,
    cbp.country_code AS correspondent_country_code,
    cbp.national_bank_code_type AS correspondent_routing_type,
    cbp.national_bank_code AS correspondent_routing_code
   FROM master.bank_account ba
     LEFT JOIN master.bank_party bp ON bp.tenant_id = ba.tenant_id AND bp.id = ba.bank_party_id
     LEFT JOIN master.bank_party cbp ON cbp.tenant_id = ba.tenant_id AND cbp.id = ba.correspondent_bank_party_id
  WHERE ba.status = 'active'::text;

COMMENT ON VIEW "master"."v_bank_account_resolved" IS 'Active bank accounts with bank party + correspondent bank resolution. Includes fintech fields (account_nature, provider_account_ref). Account values masked. SECURITY INVOKER.';

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
    a.formatted_address,
    c.name AS country_name
   FROM master.address_link al
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE al.owner_type = 'business_partner'::text;

COMMENT ON VIEW "master"."v_business_partner_address" IS 'Address links scoped to owner_type=business_partner, joined with address and country. id = address_link.id (the link PK). No temporal filter — shows all links including expired. SECURITY INVOKER — RLS on underlying tables enforces tenant isolation.';

CREATE OR REPLACE VIEW "master"."v_business_partner_app_index" AS
WITH supplier_role AS (
         SELECT s.tenant_id,
            s.business_partner_id,
            s.id AS supplier_id,
            s.supplier_code,
            s.supplier_type,
            s.status AS supplier_status,
            s.is_active AS supplier_is_active,
            COALESCE(s.is_payment_ready, false) AS is_payment_ready,
            count(scp.id)::integer AS supplier_company_scope_count,
            count(scp.id) FILTER (WHERE scp.is_active)::integer AS supplier_active_scope_count,
            count(scp.id) FILTER (WHERE scp.is_blocked)::integer AS supplier_blocked_scope_count,
            max(scp.updated_at) AS supplier_scope_updated_at,
            s.created_at AS supplier_created_at,
            s.updated_at AS supplier_updated_at
           FROM master.supplier s
             LEFT JOIN master.company_code_supplier_profile scp ON scp.tenant_id = s.tenant_id AND scp.supplier_id = s.id
          GROUP BY s.tenant_id, s.business_partner_id, s.id, s.supplier_code, s.supplier_type, s.status, s.is_active, s.is_payment_ready, s.created_at, s.updated_at
        ), customer_role AS (
         SELECT c.tenant_id,
            c.business_partner_id,
            c.id AS customer_id,
            c.customer_code,
            c.customer_type,
            c.status AS customer_status,
            c.is_active AS customer_is_active,
            COALESCE(c.is_key_account, false) AS is_key_account,
            c.risk_rating,
            count(ccp.id)::integer AS customer_company_scope_count,
            count(ccp.id) FILTER (WHERE ccp.is_active)::integer AS customer_active_scope_count,
            count(ccp.id) FILTER (WHERE ccp.is_blocked)::integer AS customer_blocked_scope_count,
            max(ccp.updated_at) AS customer_scope_updated_at,
            c.created_at AS customer_created_at,
            c.updated_at AS customer_updated_at
           FROM master.customer c
             LEFT JOIN master.company_code_customer_profile ccp ON ccp.tenant_id = c.tenant_id AND ccp.customer_id = c.id
          GROUP BY c.tenant_id, c.business_partner_id, c.id, c.customer_code, c.customer_type, c.status, c.is_active, c.is_key_account, c.risk_rating, c.created_at, c.updated_at
        )
 SELECT bp.id,
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
    COALESCE(sr.supplier_blocked_scope_count, 0) > 0 OR COALESCE(cr.customer_blocked_scope_count, 0) > 0 OR (sr.supplier_status = ANY (ARRAY['on_hold'::text, 'suspended'::text])) OR (cr.customer_status = ANY (ARRAY['on_hold'::text, 'credit_hold'::text])) OR (bp.status = ANY (ARRAY['on_hold'::text, 'blocked'::text])) AS is_blocked,
    lower(concat_ws(' '::text, bp.code, bp.name, bp.display_name, bp.legal_name, bp.registration_no, bp.external_ref, sr.supplier_code, sr.supplier_type, cr.customer_code, cr.customer_type, array_to_string(bp.aliases, ' '::text), array_to_string(bp.business_types, ' '::text))) AS search_text,
    bp.created_at,
    bp.created_by,
    GREATEST(COALESCE(bp.updated_at, bp.created_at), COALESCE(sr.supplier_updated_at, sr.supplier_created_at, bp.created_at), COALESCE(sr.supplier_scope_updated_at, bp.created_at), COALESCE(cr.customer_updated_at, cr.customer_created_at, bp.created_at), COALESCE(cr.customer_scope_updated_at, bp.created_at)) AS updated_at,
    bp.updated_by
   FROM master.business_partner bp
     LEFT JOIN supplier_role sr ON sr.tenant_id = bp.tenant_id AND sr.business_partner_id = bp.id
     LEFT JOIN customer_role cr ON cr.tenant_id = bp.tenant_id AND cr.business_partner_id = bp.id;

COMMENT ON VIEW "master"."v_business_partner_app_index" IS 'BP meta-entity list read model. One row per business_partner with canonical identity fields plus supplier/customer role presence, role codes, company-scope counts, block posture, and search text. Detail pages still read master.business_partner.';

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

COMMENT ON VIEW "master"."v_business_partner_bank_account" IS 'Canonical BP banking view over bank_account_link + bank_account. owner_type=business_partner is canonical; supplier/customer owner links are included as temporary compatibility rows via their BP role anchors.';

CREATE OR REPLACE VIEW "master"."v_business_partner_governance_summary" AS
SELECT tenant_id,
    party_id AS business_partner_id,
    sum(
        CASE
            WHEN relation_type = 'shareholder'::text AND is_active THEN COALESCE(ownership_pct, 0::numeric)
            ELSE 0::numeric
        END) AS disclosed_equity_pct,
    sum(
        CASE
            WHEN (relation_type = ANY (ARRAY['ubo'::text, 'shareholder'::text])) AND is_active THEN COALESCE(beneficial_ownership_pct, ownership_pct, 0::numeric)
            ELSE 0::numeric
        END) AS disclosed_beneficial_ownership_pct,
    count(*) FILTER (WHERE relation_type = 'ubo'::text AND is_active) AS ubo_count,
    count(*) FILTER (WHERE (relation_type = ANY (ARRAY['director'::text, 'board_member'::text, 'officer'::text])) AND is_active) AS leadership_count,
    count(*) FILTER (WHERE (relation_type = ANY (ARRAY['signatory'::text, 'authorized_representative'::text, 'proxy'::text])) AND is_active) AS signatory_count,
    count(*) FILTER (WHERE (relation_type = ANY (ARRAY['auditor'::text, 'advisor'::text, 'company_secretary'::text])) AND is_active) AS advisory_count,
    count(*) FILTER (WHERE (sanctions_status = ANY (ARRAY['flagged'::text, 'blocked'::text])) AND is_active) AS sanctions_issue_count,
    count(*) FILTER (WHERE pep_status = 'pep'::text AND is_active) AS pep_count,
    count(*) FILTER (WHERE (kyc_status = ANY (ARRAY['verified'::text, 'passed'::text])) AND is_active) AS kyc_verified_count,
    count(*) FILTER (WHERE (evidence_status = ANY (ARRAY['verified'::text, 'waived'::text])) AND is_active) AS evidence_ready_count,
    max(last_screened_at) FILTER (WHERE is_active) AS last_screened_at,
    max(last_reviewed_at) FILTER (WHERE is_active) AS last_reviewed_at,
    min(next_review_at) FILTER (WHERE is_active AND next_review_at IS NOT NULL) AS next_review_at
   FROM master.party_governance_relation
  WHERE party_type = 'business_partner'::text
  GROUP BY tenant_id, party_id;

COMMENT ON VIEW "master"."v_business_partner_governance_summary" IS 'BP 360 read model for governance posture: ownership disclosure, UBOs, leadership, signatories, compliance exceptions, and review cadence. SECURITY INVOKER; base-table RLS applies.';

CREATE OR REPLACE VIEW "master"."v_business_partner_role_summary" AS
WITH supplier_scope AS (
         SELECT company_code_supplier_profile.supplier_id,
            company_code_supplier_profile.tenant_id,
            count(*) FILTER (WHERE company_code_supplier_profile.is_active)::integer AS active_scope_count,
            count(*)::integer AS company_scope_count,
            count(*) FILTER (WHERE company_code_supplier_profile.is_blocked)::integer AS blocked_scope_count,
            min(company_code_supplier_profile.currency_code) FILTER (WHERE company_code_supplier_profile.is_active AND company_code_supplier_profile.currency_code IS NOT NULL)::text AS primary_currency_code,
            max(company_code_supplier_profile.updated_at) AS last_scope_updated_at
           FROM master.company_code_supplier_profile
          GROUP BY company_code_supplier_profile.tenant_id, company_code_supplier_profile.supplier_id
        ), customer_scope AS (
         SELECT company_code_customer_profile.customer_id,
            company_code_customer_profile.tenant_id,
            count(*) FILTER (WHERE company_code_customer_profile.is_active)::integer AS active_scope_count,
            count(*)::integer AS company_scope_count,
            count(*) FILTER (WHERE company_code_customer_profile.is_blocked)::integer AS blocked_scope_count,
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
    COALESCE(s.is_payment_ready, false) AS is_payment_ready,
    NULL::boolean AS is_key_account,
    NULL::text AS risk_rating,
    COALESCE(ss.blocked_scope_count, 0) > 0 OR (s.status = ANY (ARRAY['on_hold'::text, 'suspended'::text])) AS is_blocked,
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
    c.risk_rating,
    COALESCE(cs.blocked_scope_count, 0) > 0 OR (c.status = ANY (ARRAY['on_hold'::text, 'credit_hold'::text])) AS is_blocked,
    cs.primary_currency_code,
    NULL::integer AS open_document_count,
    NULL::numeric(18,4) AS ytd_amount,
    cs.primary_currency_code AS ytd_currency_code,
    20 AS display_order,
    c.created_at,
    GREATEST(COALESCE(c.updated_at, c.created_at), COALESCE(cs.last_scope_updated_at, c.created_at)) AS updated_at
   FROM master.customer c
     LEFT JOIN customer_scope cs ON cs.customer_id = c.id AND cs.tenant_id = c.tenant_id;

COMMENT ON VIEW "master"."v_business_partner_role_summary" IS 'BP 360 read model for Overview role cards. One row per supplier/customer role, with role identity, status, company-code scope counts, block posture, and typed future AP/AR document metrics. SECURITY INVOKER; base-table RLS applies.';

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
    a.code,
    a.name,
    a.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    a.formatted_address,
    a.tax_jurisdiction_id,
    a.status AS address_status,
    c.name AS country_name
   FROM master.address_link al
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE al.owner_type = 'company_code'::text AND al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

COMMENT ON VIEW "master"."v_company_code_address" IS 'Address links scoped to owner_type=company_code, exposed with company_code_id as the filter key so PI/PO/SES bill-to pickers can dependent-filter on a single column. Currently-effective links only; carries jurisdiction + country for inline rendering. SECURITY INVOKER — RLS enforces tenancy.';

CREATE OR REPLACE VIEW "master"."v_contact_summary" WITH (security_invoker=true, security_barrier=true) AS
SELECT cl.id AS contact_link_id,
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
    ce.local_part AS email_local_part,
    ce.domain AS email_domain,
    ce.is_disposable AS email_is_disposable,
    ce.mx_valid AS email_mx_valid,
    ce.bounce_count AS email_bounce_count,
    cp.e164 AS phone_e164,
    cp.calling_code AS phone_calling_code,
    cp.national_number AS phone_national_number,
    cp.line_type AS phone_line_type
   FROM master.contact_link cl
     LEFT JOIN master.contact_email ce ON ce.tenant_id = cl.tenant_id AND ce.contact_link_id = cl.id
     LEFT JOIN master.contact_phone cp ON cp.tenant_id = cl.tenant_id AND cp.contact_link_id = cl.id;

COMMENT ON VIEW "master"."v_contact_summary" IS 'Flattened contact view: contact_link + contact_email + contact_phone. SECURITY INVOKER — RLS on underlying tables enforces tenant isolation. Reduces application-side join complexity for common contact queries.';

CREATE OR REPLACE VIEW "master"."v_effective_principal_ui" AS
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
    pui.home_workspace_code,
    pui.home_module_code,
    COALESCE(pui.default_company_code_id, pp.default_company_code_id) AS default_company_code_id,
    pui.default_book_id,
    pui.default_dashboard_id
   FROM master.principal p
     LEFT JOIN master.principal_profile pp ON pp.principal_id = p.id AND pp.tenant_id = p.tenant_id
     LEFT JOIN master.principal_ui_profile pui ON pui.principal_id = p.id AND pui.tenant_id = p.tenant_id
     LEFT JOIN master.tenant_profile tp ON tp.tenant_id = p.tenant_id
  WHERE p.status = 'active'::text;

COMMENT ON VIEW "master"."v_effective_principal_ui" IS 'Effective UI settings for active principals. Applies resolution cascade: platform default → tenant_profile → principal_ui_profile. Appearance (appearance_mode, density_code) defaults are system/compact — no tenant-level column for these. Working-context defaults fall back to principal_profile (HR/operational defaults). SECURITY INVOKER — RLS on base tables applies to the calling session.';

CREATE OR REPLACE VIEW "master"."v_employee" WITH (security_invoker=true, security_barrier=true) AS
SELECT id,
    tenant_id,
    code,
    name,
    principal_id,
    employee_number,
    first_name,
    last_name,
    display_name,
    email,
    phone,
    employment_type,
    department,
    title,
    manager_id,
    company_code_id,
    hire_date,
    termination_date,
    metadata,
    tags,
    status,
    is_active,
    status_changed_at,
    status_changed_by,
    created_at,
    created_by,
    updated_at,
    updated_by,
    person_id,
    termination_date IS NOT NULL AND termination_date <= CURRENT_DATE AS is_terminated,
        CASE
            WHEN termination_date IS NOT NULL AND termination_date <= CURRENT_DATE THEN 'terminated'::text
            WHEN hire_date IS NULL THEN 'pending'::text
            WHEN hire_date > CURRENT_DATE THEN 'future'::text
            ELSE 'employed'::text
        END AS employment_status
   FROM master.employee;

COMMENT ON VIEW "master"."v_employee" IS 'Employee view with computed is_terminated (safe — evaluates CURRENT_DATE at query time, not at write time) and employment_status derived from hire_date + termination_date. SECURITY INVOKER — RLS on master.employee enforces tenant isolation.';

CREATE OR REPLACE VIEW "master"."v_entity_commodity" WITH (security_invoker=true, security_barrier=true) AS
SELECT cl.tenant_id,
    cl.owner_type,
    cl.owner_id,
    cl.classification_type,
    cl.domain_code,
    cl.is_primary,
    cl.mapping_type,
    cl.confidence,
    cl.provenance,
        CASE cl.classification_type
            WHEN 'commodity'::text THEN cc.code
            WHEN 'industry'::text THEN ic.code
            ELSE NULL::text
        END AS system_code,
        CASE cl.classification_type
            WHEN 'commodity'::text THEN cc.name
            WHEN 'industry'::text THEN ic.name
            ELSE NULL::text
        END AS system_name,
        CASE cl.classification_type
            WHEN 'commodity'::text THEN cc.level_no
            WHEN 'industry'::text THEN ic.level_no
            ELSE NULL::integer
        END AS level_no,
        CASE cl.classification_type
            WHEN 'commodity'::text THEN cc.domain_code
            WHEN 'industry'::text THEN ic.domain_code
            ELSE NULL::text
        END AS code_domain,
    cl.code_id
   FROM master.commodity_classification cl
     LEFT JOIN shared.commodity_code cc ON cl.classification_type = 'commodity'::text AND cc.id = cl.code_id
     LEFT JOIN shared.industry_code ic ON cl.classification_type = 'industry'::text AND ic.id = cl.code_id
  WHERE cl.is_active = true;

COMMENT ON VIEW "master"."v_entity_commodity" IS 'Flattened bridge: commodity_classification + commodity_code + industry_code. Reduces app-side JOINs from 3 to 2. LEFT JOINs with classification_type guards ensure only the correct code table is accessed per row. SECURITY INVOKER — RLS on commodity_classification enforces tenant isolation.';

CREATE OR REPLACE VIEW "master"."v_resolved_address" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.id AS address_link_id,
    al.tenant_id,
    al.owner_type,
    al.owner_id,
    al.purpose,
    al.role_qualifier,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    a.id AS address_id,
    a.code AS address_code,
    a.name AS address_name,
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
    a.status AS address_status,
    a.is_active AS address_is_active,
    c.name AS country_name,
    c.calling_code AS country_calling_code
   FROM master.address_link al
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

COMMENT ON VIEW "master"."v_resolved_address" IS 'Currently valid address links + address + country display fields. Filters: effective_from <= today AND (effective_until IS NULL OR > today) AND address status = active. SECURITY INVOKER — RLS on underlying tables enforces tenant isolation. For historical or future links, query address_link directly.';

CREATE OR REPLACE VIEW "master"."v_resolved_identity" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.tenant_id,
    al.owner_type,
    al.owner_id,
    al.purpose AS role,
    al.role_qualifier AS address_qualifier,
    al.id AS address_link_id,
    al.is_primary AS address_is_primary,
    al.effective_from AS address_effective_from,
    al.effective_until AS address_effective_until,
    a.id AS address_id,
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
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
     LEFT JOIN LATERAL ( SELECT cl.id,
            cl.value,
            cl.role_qualifier
           FROM master.contact_link cl
          WHERE cl.tenant_id = al.tenant_id AND cl.owner_type = al.owner_type AND cl.owner_id = al.owner_id AND cl.purpose = al.purpose AND cl.channel_type = 'email'::text AND cl.is_primary = true AND cl.status = 'active'::text
          ORDER BY (NOT cl.role_qualifier IS DISTINCT FROM al.role_qualifier) DESC, cl.updated_at DESC NULLS LAST, cl.id
         LIMIT 1) cl_email ON true
     LEFT JOIN LATERAL ( SELECT cl.id,
            cl.value,
            cl.role_qualifier
           FROM master.contact_link cl
          WHERE cl.tenant_id = al.tenant_id AND cl.owner_type = al.owner_type AND cl.owner_id = al.owner_id AND cl.purpose = al.purpose AND cl.channel_type = 'phone'::text AND cl.is_primary = true AND cl.status = 'active'::text
          ORDER BY (NOT cl.role_qualifier IS DISTINCT FROM al.role_qualifier) DESC, cl.updated_at DESC NULLS LAST, cl.id
         LIMIT 1) cl_phone ON true
  WHERE al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

COMMENT ON VIEW "master"."v_resolved_identity" IS 'Paired address + email + phone view, one row per active (owner, role). LATERAL joins land on ux_contact_link_one_primary partial index — single index seek per outer row, no N+1. Use for invoice routing, document snapshot capture, identity strip UI. SECURITY INVOKER — RLS on underlying tables enforces tenant isolation. Filters: effective_from <= today, effective_until > today or NULL, address.status=''active''.';

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
    a.code,
    a.name,
    a.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    a.formatted_address,
    a.tax_jurisdiction_id,
    a.status AS address_status,
    c.name AS country_name
   FROM master.address_link al
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE al.owner_type = 'site'::text AND al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

COMMENT ON VIEW "master"."v_site_address" IS 'Address links scoped to owner_type=site, exposed with site_id as the filter key so PI/PO/GR/SE ship-to pickers can dependent-filter on a single column. Currently-effective links only; carries jurisdiction + country for inline rendering. SECURITY INVOKER — RLS enforces tenancy.';

CREATE OR REPLACE VIEW "master"."v_supplier_address" WITH (security_invoker=true, security_barrier=true) AS
SELECT al.id,
    al.id AS link_id,
    al.tenant_id,
    s.id AS supplier_id,
    al.owner_type AS link_owner_type,
    al.purpose,
    al.role_qualifier,
    al.is_primary,
    al.effective_from,
    al.effective_until,
    a.id AS address_id,
    a.code,
    a.name,
    a.attention_line,
    a.line1,
    a.line2,
    a.line3,
    a.city,
    a.region,
    a.postal_code,
    a.country_code,
    a.formatted_address,
    a.tax_jurisdiction_id,
    a.status AS address_status,
    c.name AS country_name
   FROM master.supplier s
     JOIN master.address_link al ON al.tenant_id = s.tenant_id AND (al.owner_type = 'supplier'::text AND al.owner_id = s.id OR al.owner_type = 'business_partner'::text AND al.owner_id = s.business_partner_id)
     JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
     LEFT JOIN shared.country c ON c.code::text = a.country_code
  WHERE al.effective_from <= CURRENT_DATE AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE) AND a.status = 'active'::text;

COMMENT ON VIEW "master"."v_supplier_address" IS 'Address links scoped to a supplier (direct owner_type=supplier OR via underlying business_partner). Exposes supplier_id as the filter key so PI/PO ship-from / remit-to pickers can dependent-filter on a single column. Currently-effective links only. SECURITY INVOKER — RLS enforces tenancy.';

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

COMMENT ON VIEW "master"."v_supplier_bank_account" IS 'Temporary compatibility view for supplier banking. Shows canonical BP-owned bank links for each supplier plus legacy owner_type=supplier links. New code should use master.v_business_partner_bank_account.';

CREATE OR REPLACE VIEW "master"."v_tenant_risk_source_config" AS
SELECT id,
    tenant_id,
    source_code,
    is_enabled,
    custom_trust_level,
    status,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM master.tenant_risk_source_config;

COMMENT ON VIEW "master"."v_tenant_risk_source_config" IS 'Redacted view of master.tenant_risk_source_config. api_config (provider API credentials) is excluded from this view. All application-facing reads (settings UI, config management) MUST use this view. Integration workers that call provider APIs read the base table as athyperadmin. SECURITY INVOKER — RLS on the base table applies to the calling session.';

CREATE OR REPLACE VIEW "master"."auth_current_group_member_v" WITH (security_invoker=true, security_barrier=true) AS
SELECT m.id,
    m.tenant_id,
    m.plane_code,
    m.group_id,
    m.principal_id,
    m.status,
    m.effective_from,
    m.effective_until,
    m.source_type,
    m.source_ref,
    m.metadata,
    m.created_at,
    m.created_by,
    m.updated_at,
    m.updated_by
   FROM master.auth_group_member m
     JOIN master.auth_group g ON g.id = m.group_id AND g.tenant_id = m.tenant_id AND g.plane_code = m.plane_code
     JOIN master.auth_current_plane_membership_v pm ON pm.tenant_id = m.tenant_id AND pm.plane_code = m.plane_code AND pm.principal_id = m.principal_id
  WHERE m.status = 'active'::text AND m.effective_from <= now() AND (m.effective_until IS NULL OR m.effective_until > now()) AND g.status = 'active'::text;
