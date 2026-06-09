-- LookupDomain/master/fiscal_period_type.sql
-- Lookup values for domain: master.fiscal_period_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('opening',    'Opening',    'master.fiscal_period_type', 'Opening balance period',               10),
    ('normal',     'Normal',     'master.fiscal_period_type', 'Regular accounting period',            20),
    ('adjustment', 'Adjustment', 'master.fiscal_period_type', 'Post-close adjustment period',        30),
    ('closing',    'Closing',    'master.fiscal_period_type', 'Year-end closing period',              40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
