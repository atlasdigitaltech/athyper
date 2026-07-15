-- Used by: budget_profile.multi_year_strategy.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('annual',         'Annual',           'master.budget_multi_year_strategy', 'Budget resets each fiscal year — no carry',         10),
    ('rolling',        'Rolling',          'master.budget_multi_year_strategy', 'Budget rolls forward on a continuous basis',        20),
    ('carry_forward',  'Carry Forward',    'master.budget_multi_year_strategy', 'Unspent balance carries to next year',              30),
    ('periodic',       'Periodic',         'master.budget_multi_year_strategy', 'Multi-year budget allocated by defined periods',    40),
    ('cumulative',     'Cumulative',       'master.budget_multi_year_strategy', 'Cumulative envelope tracked across all years',      50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
