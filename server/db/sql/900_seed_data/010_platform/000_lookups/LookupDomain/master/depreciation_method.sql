-- LookupDomain/master/depreciation_method.sql
-- Lookup values for domain: master.depreciation_method
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('straight_line',       'Straight line',       'master.depreciation_method', 'Equal annual depreciation',                    10),
    ('declining_balance',   'Declining balance',   'master.depreciation_method', 'Accelerated declining balance',                20),
    ('units_of_production', 'Units of production', 'master.depreciation_method', 'Usage-based depreciation',                     30),
    ('sum_of_years',        'Sum of years',        'master.depreciation_method', 'Sum-of-the-years-digits method',               40),
    ('double_declining',    'Double declining',    'master.depreciation_method', '200% declining balance method',                50),
    ('no_depreciation',     'No depreciation',     'master.depreciation_method', 'Asset is not depreciated (e.g., land)',        60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
