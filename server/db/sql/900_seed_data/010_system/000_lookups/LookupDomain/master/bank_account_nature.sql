-- Lookup values for domain: master.bank_account_nature
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('direct',      'Direct Account',     'master.bank_account_nature', 'Real account at the institution. Traditional bank account.',                              10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('virtual',     'Virtual Account',    'master.bank_account_nature', 'Virtual identifier routed through provider pooled/omnibus account.',                      20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('collection',  'Collection Account', 'master.bank_account_nature', 'Virtual inbound-only account for receiving payments in a specific currency.',             30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('sub_account', 'Sub-Account',        'master.bank_account_nature', 'Sub-account under a master account at the same bank for departmental segregation.',      40, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
