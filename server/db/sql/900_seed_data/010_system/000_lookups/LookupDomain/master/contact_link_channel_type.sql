-- LookupDomain/master/contact_link_channel_type.sql
-- Lookup values for domain: master.contact_link_channel_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('email', 'Email',
     'master.contact_link_channel_type',
     'Email address. Requires a contact_email extension row for deliverability metadata.',
     10),
    ('sms', 'SMS',
     'master.contact_link_channel_type',
     'SMS text message. Requires a contact_phone extension row. Used for OTP delivery and alerts.',
     20),
    ('phone', 'Phone (Voice)',
     'master.contact_link_channel_type',
     'Voice call channel. Requires a contact_phone extension row.',
     30),
    ('whatsapp', 'WhatsApp',
     'master.contact_link_channel_type',
     'WhatsApp messaging. Requires a contact_phone extension row with a valid E.164 number.',
     40),
    ('push', 'Push Notification',
     'master.contact_link_channel_type',
     'Mobile or web push notification. Device token stored in metadata.',
     50),
    ('webhook', 'Webhook',
     'master.contact_link_channel_type',
     'HTTP callback endpoint. URL and signing secret stored in metadata.',
     60),
    ('in_app', 'In-App',
     'master.contact_link_channel_type',
     'In-application notification delivered through the platform UI.',
     70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
