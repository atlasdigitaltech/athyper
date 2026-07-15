INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('monthly',    'Monthly',     'master.asset_prorate_basis', 'Prorate based on whole months',      10),
    ('daily',      'Daily',       'master.asset_prorate_basis', 'Prorate based on actual days',       20),
    ('half_month', 'Half-Month',  'master.asset_prorate_basis', 'Half-month proration convention',    30),
    ('full_month', 'Full Month',  'master.asset_prorate_basis', 'Full month regardless of start day', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
