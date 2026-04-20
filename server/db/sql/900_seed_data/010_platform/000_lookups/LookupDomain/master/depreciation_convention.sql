-- LookupDomain/master/depreciation_convention.sql
-- Lookup values for domain: master.depreciation_convention
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('full_month',         'Full Month',          'master.depreciation_convention', 'Full month depreciation in period of acquisition',    10),
    ('half_month',         'Half-Month',          'master.depreciation_convention', 'Half-month convention for partial periods',            20),
    ('mid_quarter',        'Mid-Quarter',         'master.depreciation_convention', 'Mid-quarter convention (US tax MACRS)',                30),
    ('half_year',          'Half-Year',           'master.depreciation_convention', 'Half-year convention (US tax MACRS)',                  40),
    ('modified_half_year', 'Modified Half-Year',  'master.depreciation_convention', 'Modified half-year convention',                        50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
