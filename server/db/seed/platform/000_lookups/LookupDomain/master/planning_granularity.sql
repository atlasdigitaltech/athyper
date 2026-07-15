-- Used by: planning_model.granularity.

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('weekly',     'Weekly',     'master.planning_granularity', 'Periods are individual weeks',        10),
    ('monthly',    'Monthly',    'master.planning_granularity', 'Periods are calendar/fiscal months',  20),
    ('quarterly',  'Quarterly',  'master.planning_granularity', 'Periods are fiscal quarters',         30),
    ('annually',   'Annually',   'master.planning_granularity', 'Periods are full fiscal years',       40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
