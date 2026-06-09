-- LookupDomain/master/company_code_fy_variant.sql
-- Lookup values for domain: master.company_code_fy_variant
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('calendar', 'Calendar year', 'master.company_code_fy_variant', 'Jan-Dec',         10),
    ('fy_445',   '4-4-5',         'master.company_code_fy_variant', '4-4-5 weeks',     20),
    ('fy_454',   '4-5-4',         'master.company_code_fy_variant', '4-5-4 weeks',     30),
    ('fy_544',   '5-4-4',         'master.company_code_fy_variant', '5-4-4 weeks',     40),
    ('custom',   'Custom',        'master.company_code_fy_variant', 'Tenant-defined',  50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
