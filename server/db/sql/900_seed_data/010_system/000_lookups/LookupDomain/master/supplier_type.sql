-- LookupDomain/master/supplier_type.sql
-- Lookup values for domain: master.supplier_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('vendor',       'Vendor',        'master.supplier_type', 'Standard goods/services vendor',   10),
    ('contractor',   'Contractor',    'master.supplier_type', 'Contract-based service provider',   20),
    ('distributor',  'Distributor',   'master.supplier_type', 'Distribution partner',              30),
    ('manufacturer', 'Manufacturer',  'master.supplier_type', 'Direct manufacturer',               40),
    ('government',   'Government',    'master.supplier_type', 'Government / public sector',        50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
