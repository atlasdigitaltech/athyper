-- LookupDomain/master/statement_cycle.sql
-- Lookup values for domain: master.statement_cycle
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('monthly',   'Monthly',   'master.statement_cycle', 'Generated once per calendar month', 10),
    ('biweekly',  'Biweekly',  'master.statement_cycle', 'Generated every two weeks',        20),
    ('weekly',    'Weekly',    'master.statement_cycle', 'Generated weekly',                  30),
    ('on_demand', 'On Demand', 'master.statement_cycle', 'Generated only on request',        40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
