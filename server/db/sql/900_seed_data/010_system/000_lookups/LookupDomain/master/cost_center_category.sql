-- LookupDomain/master/cost_center_category.sql
-- Lookup values for domain: master.cost_center_category
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('production', 'Production',      'master.cost_center_category', 'Manufacturing / assembly',     10),
    ('admin',      'Administration',  'master.cost_center_category', 'General & administrative',     20),
    ('sales',      'Sales',           'master.cost_center_category', 'Sales & distribution',         30),
    ('service',    'Service',         'master.cost_center_category', 'Service delivery',             40),
    ('logistics',  'Logistics',       'master.cost_center_category', 'Warehousing & transport',      50),
    ('r_and_d',    'R&D',             'master.cost_center_category', 'Research & development',       60),
    ('shared',     'Shared Services', 'master.cost_center_category', 'Shared IT/HR/Finance',         70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
