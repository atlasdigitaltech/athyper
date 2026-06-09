-- LookupDomain/master/contact_role.sql
-- Lookup values for domain: master.contact_role
-- Functional roles for party_contact_person — drives AP/AR, legal, and escalation routing.
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('primary',    'Primary Contact',
     'master.contact_role',
     'Default contact for general communication with this party.',
     10),
    ('billing',    'Billing',
     'master.contact_role',
     'Receives invoices, payment confirmations, and AP/AR correspondence.',
     20),
    ('delivery',   'Delivery / Logistics',
     'master.contact_role',
     'Handles shipping notifications, delivery confirmations, and logistics coordination.',
     30),
    ('legal',      'Legal / Compliance',
     'master.contact_role',
     'Receives contracts, compliance notices, and legal correspondence.',
     40),
    ('escalation', 'Escalation',
     'master.contact_role',
     'Senior contact for dispute resolution and issue escalation.',
     50),
    ('technical',  'Technical',
     'master.contact_role',
     'Handles integration, EDI, and technical onboarding communications.',
     60),
    ('general',    'General',
     'master.contact_role',
     'General-purpose contact with no specific routing function.',
     70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
