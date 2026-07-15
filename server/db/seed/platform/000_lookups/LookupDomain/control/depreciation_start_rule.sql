INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('in_service_date',     'In-Service Date',     'control.depreciation_start_rule', 'Depreciation begins when asset is placed in service',  10),
    ('capitalization_date', 'Capitalization Date',  'control.depreciation_start_rule', 'Depreciation begins on capitalization (e.g. software)', 20),
    ('next_period',         'Next Period',          'control.depreciation_start_rule', 'Depreciation begins at start of next fiscal period',   30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
