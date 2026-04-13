-- LookupDomain/master/valuation_method.sql
-- Lookup values for domain: master.valuation_method
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('fifo',          'FIFO',             'master.valuation_method', 'First in, first out',              10),
    ('weighted_avg',  'Weighted average', 'master.valuation_method', 'Weighted average cost',            20),
    ('standard_cost', 'Standard cost',    'master.valuation_method', 'Pre-determined standard cost',     30),
    ('specific_id',   'Specific ID',      'master.valuation_method', 'Specific identification / serial', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
