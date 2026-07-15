-- 'intercompany' code must stay in sync with the CHECK constraint on master.customer.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('corporate',     'Corporate',      'master.customer_type', 'B2B corporate entity',                    10),
    ('individual',    'Individual',     'master.customer_type', 'B2C individual consumer',                  20),
    ('government',    'Government',     'master.customer_type', 'Government / public sector',               30),
    ('intercompany',  'Intercompany',   'master.customer_type', 'Internal group entity — intercompany AR',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
