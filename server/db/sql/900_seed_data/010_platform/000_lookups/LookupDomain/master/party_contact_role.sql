-- LookupDomain/master/party_contact_role.sql
-- Lookup domain + values for: master.party_contact_role
-- Used by: master.party_contact_role.role_code
-- Idempotent: WHERE NOT EXISTS guards

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.party_contact_role',
       'Party Contact Role',
       'Business function roles assignable to named contact persons (main contact, AP, logistics, etc.).',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.party_contact_role'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('main_contact',            'Main Contact',                 'master.party_contact_role', 'Primary contact for this supplier',                            10),
    ('accounts_payable',        'Accounts Payable',             'master.party_contact_role', 'Contact for invoice and payment queries',                       20),
    ('finance_manager',         'Finance Manager',              'master.party_contact_role', 'Finance or CFO-level contact',                                  30),
    ('bid_proposal_manager',    'Bid / Proposal Manager',       'master.party_contact_role', 'Handles RFQ, RFP, and tender submissions',                      40),
    ('customer_care_manager',   'Customer Care Manager',        'master.party_contact_role', 'Handles service issues and escalations',                        50),
    ('catalog_manager',         'Catalog Manager',              'master.party_contact_role', 'Manages product/service catalog and pricing',                   60),
    ('ebusiness_manager',       'eBusiness Manager',            'master.party_contact_role', 'Manages electronic/EDI/portal integration',                     70),
    ('logistics',               'Logistics',                    'master.party_contact_role', 'Delivery, shipping, and dispatch queries',                      80),
    ('operations_manager',      'Operations Manager',           'master.party_contact_role', 'Operational delivery and service fulfilment',                   90),
    ('marketing_manager',       'Marketing Manager',            'master.party_contact_role', 'Marketing and communications contact',                         100),
    ('compliance_manager',      'Compliance Manager',           'master.party_contact_role', 'Regulatory, audit, and compliance contact',                    110),
    ('legal',                   'Legal',                        'master.party_contact_role', 'Legal and contract contact',                                   120),
    ('it',                      'IT',                           'master.party_contact_role', 'Technical / IT systems contact',                               130),
    ('sustainability',          'Sustainability',               'master.party_contact_role', 'ESG and sustainability reporting contact',                      140),
    ('other',                   'Other',                        'master.party_contact_role', 'Role not otherwise listed',                                    150)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
