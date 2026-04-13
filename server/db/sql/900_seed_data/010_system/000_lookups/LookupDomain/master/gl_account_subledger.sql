-- LookupDomain/master/gl_account_subledger.sql
-- Lookup values for domain: master.gl_account_subledger
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('ap',         'Accounts Payable',    'master.gl_account_subledger', 'Trade payables',      10),
    ('ar',         'Accounts Receivable', 'master.gl_account_subledger', 'Trade receivables',   20),
    ('asset',      'Fixed Assets',        'master.gl_account_subledger', 'Asset register',      30),
    ('inventory',  'Inventory',           'master.gl_account_subledger', 'Inventory valuation', 40),
    ('wip',        'Work in Progress',    'master.gl_account_subledger', 'Production WIP',      50),
    ('commission', 'Commission',          'master.gl_account_subledger', 'Commission accrual',  60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
