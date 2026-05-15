-- LookupDomain/master/product_type.sql
-- Lookup values for domain: master.product_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('physical',     'Physical',     'master.product_type', 'Tangible goods',            10),
    ('service',      'Service',      'master.product_type', 'Intangible service',        20),
    ('digital',      'Digital',      'master.product_type', 'Digital / downloadable',    30),
    ('subscription', 'Subscription', 'master.product_type', 'Recurring subscription',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
