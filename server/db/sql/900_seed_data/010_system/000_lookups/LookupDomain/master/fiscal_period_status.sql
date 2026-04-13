-- LookupDomain/master/fiscal_period_status.sql
-- Lookup values for domain: master.fiscal_period_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('future',     'Future',     'master.fiscal_period_status', 'Not yet open for posting',              10),
    ('open',       'Open',       'master.fiscal_period_status', 'Accepting journal entries',             20),
    ('soft_close', 'Soft Close', 'master.fiscal_period_status', 'Restricted posting (adjustments only)', 30),
    ('hard_close', 'Hard Close', 'master.fiscal_period_status', 'Fully closed, no posting allowed',     40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
