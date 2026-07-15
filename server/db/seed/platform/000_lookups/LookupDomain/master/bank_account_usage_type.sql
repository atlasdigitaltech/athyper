INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('disbursement', 'Disbursement', 'master.bank_account_usage_type', 'Outbound payments',        10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('collection',   'Collection',   'master.bank_account_usage_type', 'Inbound receipts',         20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('payroll',      'Payroll',      'master.bank_account_usage_type', 'Payroll processing',       30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('treasury',     'Treasury',     'master.bank_account_usage_type', 'Treasury operations',      40, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('escrow',       'Escrow',       'master.bank_account_usage_type', 'Escrow operations',        50, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('petty_cash',   'Petty Cash',   'master.bank_account_usage_type', 'Petty cash replenishment', 60, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
