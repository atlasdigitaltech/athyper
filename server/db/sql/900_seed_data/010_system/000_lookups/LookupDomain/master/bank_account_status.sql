-- LookupDomain/master/bank_account_status.sql
-- Lookup values for domain: master.bank_account_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('active',   'Active',   'master.bank_account_status', 'Account operational',         10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('inactive', 'Inactive', 'master.bank_account_status', 'Temporarily suspended',       20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('blocked',  'Blocked',  'master.bank_account_status', 'Blocked for transactions',    30, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('closed',   'Closed',   'master.bank_account_status', 'Permanently closed',          40, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
