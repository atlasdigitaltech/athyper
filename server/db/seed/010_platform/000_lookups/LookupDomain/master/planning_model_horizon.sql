-- LookupDomain/master/planning_model_horizon.sql
-- Lookup values for domain: master.planning_model_horizon
-- Used by: planning_model.planning_horizon
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('quarterly',   'Quarterly',      'master.planning_model_horizon', 'Single quarter planning horizon',                10),
    ('annual',      'Annual',         'master.planning_model_horizon', 'Single fiscal year planning horizon',            20),
    ('rolling_12',  'Rolling 12M',    'master.planning_model_horizon', '12-month rolling forecast window',               30),
    ('rolling_24',  'Rolling 24M',    'master.planning_model_horizon', '24-month rolling forecast window',               40),
    ('rolling_36',  'Rolling 36M',    'master.planning_model_horizon', '36-month rolling forecast window',               50),
    ('multi_year',  'Multi-Year',     'master.planning_model_horizon', 'Fixed multi-year horizon (3-5 year strategic)',  60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
