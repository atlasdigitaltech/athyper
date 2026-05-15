-- LookupDomain/master/contact_link_purpose.sql
-- Lookup values for domain: master.contact_link_purpose
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('login', 'Login',
     'master.contact_link_purpose',
     'Primary login credential email. Exactly one per principal. Cached in master.principal.login_email by trigger.',
     10),
    ('recovery', 'Account Recovery',
     'master.contact_link_purpose',
     'Used for password reset and account recovery flows. May differ from login email.',
     20),
    ('mfa', 'MFA Delivery',
     'master.contact_link_purpose',
     'Dedicated channel for MFA OTP delivery. Referenced by control.mfa_config.contact_link_id.',
     30),
    ('verification', 'Verification',
     'master.contact_link_purpose',
     'Used during onboarding to verify ownership of a channel (email/phone).',
     40),
    ('billing', 'Billing',
     'master.contact_link_purpose',
     'Receives invoices, payment receipts, and subscription-related communications.',
     50),
    ('support', 'Support',
     'master.contact_link_purpose',
     'Inbound support requests and ticket status updates.',
     60),
    ('notification', 'Notification',
     'master.contact_link_purpose',
     'General platform operational notifications (alerts, reports, system events).',
     70),
    ('marketing', 'Marketing',
     'master.contact_link_purpose',
     'Commercial and promotional communications. Subject to unsubscribe/opt-out handling.',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
