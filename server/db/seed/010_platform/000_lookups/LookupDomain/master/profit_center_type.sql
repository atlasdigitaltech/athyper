-- LookupDomain/master/profit_center_type.sql
-- Lookup values for domain: master.profit_center_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('revenue',    'Revenue',    'master.profit_center_type', 'Revenue-generating unit',     10),
    ('service',    'Service',    'master.profit_center_type', 'Internal service provider',   20),
    ('investment', 'Investment', 'master.profit_center_type', 'Investment / holding',        30),
    ('shared',     'Shared',     'master.profit_center_type', 'Shared / corporate overhead', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
