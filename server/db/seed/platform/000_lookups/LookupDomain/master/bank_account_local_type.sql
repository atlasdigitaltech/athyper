INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('current',    'Current Account', 'master.bank_account_local_type', 'Checking / current account',   10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('savings',    'Savings Account', 'master.bank_account_local_type', 'Savings / deposit account',    20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('escrow',     'Escrow Account',  'master.bank_account_local_type', 'Escrow / trust account',       30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('payroll',    'Payroll Account', 'master.bank_account_local_type', 'Dedicated payroll account',    40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('petty_cash', 'Petty Cash',      'master.bank_account_local_type', 'Petty cash float',             50, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
