-- LookupDomain/master/pay_component_value_type.sql
-- Lookup values for domain: master.pay_component_value_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('amount',  'Fixed Amount',     'master.pay_component_value_type', 'Static monetary amount (e.g., ₹1,600/month transport allowance)',              10),
    ('rate',    'Rate / Percentage','master.pay_component_value_type', 'Percentage of another component (e.g., 40% of basic as HRA)',                  20),
    ('formula', 'Formula',          'master.pay_component_value_type', 'Computed by a linked formula_expression (for complex payroll rules)',           30),
    ('units',   'Units × Rate',     'master.pay_component_value_type', 'Quantity × unit rate (e.g., overtime hours × hourly rate)',                    40),
    ('flat',    'Flat Per Period',  'master.pay_component_value_type', 'Fixed amount that does not change unless manually overridden per pay period',   50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
