INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('general',        'General Supplier',     'master.supplier_type', 'Standard goods/services supplier',          10),
    ('contractor',     'Contractor',           'master.supplier_type', 'Contract-based service provider',             20),
    ('manufacturer',   'Manufacturer',         'master.supplier_type', 'Direct manufacturer',                        30),
    ('service',        'Service Provider',     'master.supplier_type', 'Professional or managed service provider',   40),
    ('utility',        'Utility',              'master.supplier_type', 'Utility / infrastructure provider',          50),
    ('distributor',    'Distributor',          'master.supplier_type', 'Distribution partner',                       60),
    ('government',     'Government',           'master.supplier_type', 'Government / public sector supplier',        70),
    ('intercompany',   'Intercompany',         'master.supplier_type', 'Internal group entity — intercompany AP',   80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
