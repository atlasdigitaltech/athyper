-- LookupDomain/control/bpr_amount_strategy.sql
-- Lookup values for domain: control.bpr_amount_strategy
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('mirror',   'Mirror',   'control.bpr_amount_strategy', 'Copy amount 1:1 from source book',     10),
    ('multiply', 'Multiply', 'control.bpr_amount_strategy', 'Apply a fixed multiplier to amount',   20),
    ('formula',  'Formula',  'control.bpr_amount_strategy', 'Evaluate expression-based formula',    30),
    ('suppress', 'Suppress', 'control.bpr_amount_strategy', 'Do not post amount to target book',    40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
