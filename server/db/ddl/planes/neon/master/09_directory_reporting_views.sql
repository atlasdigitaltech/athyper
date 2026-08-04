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
