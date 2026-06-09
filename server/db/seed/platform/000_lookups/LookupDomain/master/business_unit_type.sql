-- LookupDomain/master/business_unit_type.sql
-- Lookup values for domain: master.business_unit_type
-- Used by: business_unit.bu_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('operational',     'Operational',      'master.business_unit_type', 'Core operational / revenue-generating unit',            10),
    ('strategic',       'Strategic',        'master.business_unit_type', 'Strategic business unit with P&L responsibility',       20),
    ('support',         'Support',          'master.business_unit_type', 'Support function (HR, Finance, IT, Legal)',              30),
    ('shared_services', 'Shared Services',  'master.business_unit_type', 'Shared service center providing services to other units',40),
    ('product',         'Product',          'master.business_unit_type', 'Product-focused unit owning a product line',             50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
