-- LookupDomain/master/bank_account_reconciliation_mode.sql
-- Lookup values for domain: master.bank_account_reconciliation_mode
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.* FROM (VALUES
    ('manual',    'Manual',    'master.bank_account_reconciliation_mode', 'Manual matching by user',         10, true, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    ('auto',      'Automatic', 'master.bank_account_reconciliation_mode', 'System auto-matches',             20, true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('semi_auto', 'Semi-Auto', 'master.bank_account_reconciliation_mode', 'System proposes, user confirms',  30, true, 'active', '00000000-0000-0000-0000-000000000000')
) AS v(code, name, domain_code, description, sort_order, is_system, status, created_by)
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_value x WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL);
