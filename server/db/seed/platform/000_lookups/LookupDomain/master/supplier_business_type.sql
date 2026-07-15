-- Used by: master.supplier.business_types (text[] — multi-value).

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'master.supplier_business_type',
       'Supplier Business Type',
       'Nature of business for supplier profiling. Multi-value — a supplier can have more than one type.',
       'master', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'master.supplier_business_type'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('service_provider',        'Service Provider',             'master.supplier_business_type', 'Provides services rather than physical goods',                 10),
    ('goods_manufacturer',      'Goods Manufacturer',           'master.supplier_business_type', 'Manufactures physical goods',                                  20),
    ('distributor',             'Distributor',                  'master.supplier_business_type', 'Distributes goods from manufacturer to buyers',                30),
    ('retailer',                'Retailer',                     'master.supplier_business_type', 'Sells goods directly to end consumers',                        40),
    ('logistics_provider',      'Logistics Provider',           'master.supplier_business_type', 'Freight, courier, 3PL, or warehousing services',               50),
    ('technology_provider',     'Technology Provider',          'master.supplier_business_type', 'Software, hardware, IT infrastructure or SaaS',                60),
    ('professional_services',   'Professional Services',        'master.supplier_business_type', 'Legal, audit, consulting, advisory',                           70),
    ('construction',            'Construction / Engineering',   'master.supplier_business_type', 'Civil, structural, or MEP works',                              80),
    ('financial_services',      'Financial Services',           'master.supplier_business_type', 'Banking, insurance, leasing, fintech',                         90),
    ('government',              'Government Body',              'master.supplier_business_type', 'Public sector / statutory authority supplier',                100),
    ('ngo',                     'NGO / Non-Profit',             'master.supplier_business_type', 'Non-governmental or charitable organisation',                 110),
    ('other',                   'Other',                        'master.supplier_business_type', 'Business type not otherwise classified',                      120)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
