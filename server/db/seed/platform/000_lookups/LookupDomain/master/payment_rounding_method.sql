-- LookupDomain/master/payment_rounding_method.sql
-- Lookup values for domain: master.payment_rounding_method
-- Used by: payment_term_clause.rounding_method
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('half_up',  'Round Half Up',    'master.payment_rounding_method', 'Round 0.5 away from zero (standard commercial rounding)', 10),
    ('half_down','Round Half Down',  'master.payment_rounding_method', 'Round 0.5 toward zero',                                   20),
    ('bankers',  'Bankers Round',     'master.payment_rounding_method', 'Round 0.5 to nearest even number (IEEE 754)',             30),
    ('ceiling',  'Ceiling',          'master.payment_rounding_method', 'Always round up to next unit (favorable to payee)',       40),
    ('floor',    'Floor',            'master.payment_rounding_method', 'Always round down to previous unit',                     50),
    ('truncate', 'Truncate',         'master.payment_rounding_method', 'Drop fractional digits without rounding',                 60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
