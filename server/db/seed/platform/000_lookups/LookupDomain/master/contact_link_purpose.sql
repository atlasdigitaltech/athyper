-- Business bucket mirrors master.address_purpose so the same role token can
-- resolve a contact and an address for an owner (master.v_resolved_identity).
-- Auth bucket (login/recovery/mfa/verification) FORBIDS role_qualifier via
-- contact_link_auth_no_qualifier_chk — keep these four free of qualifiers.
-- Sub-classification uses master.contact_link.role_qualifier (lookup-validated
-- against master.contact_role_qualifier).

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.category, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── Auth bucket (reserved for principal/employee) ───────────────────────
    ('login',          'Login',
     'master.contact_link_purpose',
     'Primary login credential email. Exactly one per principal. '
     'Cached in master.principal.login_email by fn_sync_principal_login_email trigger. '
     'role_qualifier MUST be NULL (CHECK contact_link_auth_no_qualifier_chk).',
     'auth', 10),

    ('recovery',       'Account Recovery',
     'master.contact_link_purpose',
     'Password reset and account recovery flows. May differ from login email. '
     'role_qualifier MUST be NULL.',
     'auth', 20),

    ('mfa',            'MFA Delivery',
     'master.contact_link_purpose',
     'Dedicated channel for MFA OTP delivery. Referenced by control.mfa_config.contact_link_id. '
     'role_qualifier MUST be NULL.',
     'auth', 30),

    ('verification',   'Verification',
     'master.contact_link_purpose',
     'Onboarding channel verification (email/phone ownership confirmation). '
     'role_qualifier MUST be NULL.',
     'auth', 40),

    -- ── Business bucket (mirrors address vocabulary) ────────────────────────
    ('bill_to',        'Bill To',
     'master.contact_link_purpose',
     'Recipient of invoices and billing statements. Buyer-side AR contact. '
     'Pairs with address_link.purpose=bill_to for full invoice routing.',
     'business', 50),

    ('remit_to',       'Remit To',
     'master.contact_link_purpose',
     'Recipient of remittance advice and payment confirmations. Supplier-side '
     'treasury/AR contact. Pairs with address_link.purpose=remit_to.',
     'business', 51),

    ('bill_from',     'Bill From',
     'master.contact_link_purpose',
     'Seller-side billing contact for supplier invoices, credit memos, and billing statements. '
     'Pairs with address_link.purpose=bill_from.',
     'business', 52),

    ('ship_to',        'Ship To',
     'master.contact_link_purpose',
     'Receiving/inbound logistics contact (warehouse manager, site receiving). '
     'Pairs with address_link.purpose=ship_to.',
     'business', 53),

    ('ship_from',      'Ship From',
     'master.contact_link_purpose',
     'Dispatch/outbound logistics contact (supplier-side). '
     'Pairs with address_link.purpose=ship_from.',
     'business', 54),

    ('place_of_service', 'Place of Service',
     'master.contact_link_purpose',
     'Service execution contact at the location where services are performed '
     'or equipment is installed. Pairs with address_link.purpose=place_of_service.',
     'business', 55),

    ('correspondence', 'Correspondence',
     'master.contact_link_purpose',
     'General correspondence: statutory/legal/regulatory/tax filings, '
     'employee letters, payslips. Use role_qualifier to sub-classify '
     '(legal_notice, tax_filing, account_statement, emergency, payslip).',
     'business', 56),

    -- ── Operational bucket (contact-specific) ───────────────────────────────
    ('support',        'Support',
     'master.contact_link_purpose',
     'Inbound support requests and ticket updates. Use role_qualifier to '
     'distinguish escalation / vip tiers.',
     'operational', 60),

    ('notification',   'Notification',
     'master.contact_link_purpose',
     'Operational system events (alerts, reports, dispatch alerts, treasury '
     'events). High-frequency, low-touch. Use role_qualifier for specific '
     'event streams.',
     'operational', 70),

    ('marketing',      'Marketing',
     'master.contact_link_purpose',
     'Promotional communications. Send-path MUST check '
     'master.contact_marketing_consent before resolving — opt-out / consent '
     'lifecycle lives there, not on the link.',
     'operational', 80),

    -- ── Generic fallback ────────────────────────────────────────────────────
    ('default',        'Default',
     'master.contact_link_purpose',
     'Universal fallback. Resolved by fn_resolve_contact() when no exact '
     'purpose match exists. Every owner type that supports contacts allows this.',
     'generic', 99)

) AS v(code, name, domain_code, description, category, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
