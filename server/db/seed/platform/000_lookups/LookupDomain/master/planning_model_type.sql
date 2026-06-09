-- LookupDomain/master/planning_model_type.sql
-- Lookup values for domain: master.planning_model_type
-- Used by: planning_model.model_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('top_down',     'Top-Down',      'master.planning_model_type', 'Targets set at executive level and cascaded down',      10),
    ('bottom_up',    'Bottom-Up',     'master.planning_model_type', 'Teams submit plans that are rolled up for approval',    20),
    ('hybrid',       'Hybrid',        'master.planning_model_type', 'Combination of top-down targets and bottom-up inputs',  30),
    ('driver_based', 'Driver-Based',  'master.planning_model_type', 'Plans derived from key business drivers and formulas',  40),
    ('zero_based',   'Zero-Based',    'master.planning_model_type', 'All costs justified from zero each period',             50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
