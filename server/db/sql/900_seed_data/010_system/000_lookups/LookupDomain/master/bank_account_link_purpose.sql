-- Lookup values for domain: master.bank_account_link_purpose
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('default',       'Default',       'master.bank_account_link_purpose', 'General-purpose payment account',      10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('disbursement',  'Disbursement',  'master.bank_account_link_purpose', 'Outbound payments (house bank)',       20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('collection',    'Collection',    'master.bank_account_link_purpose', 'Inbound receipts (house bank)',        30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('payroll',       'Payroll',       'master.bank_account_link_purpose', 'Salary / wages payment',               40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('refund',        'Refund',        'master.bank_account_link_purpose', 'Customer refund disbursement',         50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('reimbursement', 'Reimbursement', 'master.bank_account_link_purpose', 'Employee expense reimbursement',       60, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('advance',       'Advance',       'master.bank_account_link_purpose', 'Advance payment account',              70, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('commission',    'Commission',    'master.bank_account_link_purpose', 'Commission / incentive payment',       80, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
