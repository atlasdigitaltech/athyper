INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('ifrs',       'IFRS',       'master.chart_of_account_framework', 'IFRS-aligned structure',    10),
    ('us_gaap',    'US GAAP',    'master.chart_of_account_framework', 'US GAAP-aligned',           20),
    ('reporting_taxonomy', 'Reporting Taxonomy', 'master.chart_of_account_framework', 'Internal non-operating group reporting taxonomy', 90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
