-- LookupDomain/master/product_status.sql
-- Lookup values for domain: master.product_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',    'Draft',       'master.product_status', 'Not yet published',        10),
    ('active',   'Active',      'master.product_status', 'Available in catalog',      20),
    ('inactive', 'Inactive',    'master.product_status', 'Temporarily unavailable',   30),
    ('discontinued', 'Discontinued', 'master.product_status', 'End of life',          40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
