-- LookupDomain/master/payment_term_flexibility_mode.sql
-- Lookup values for domain: master.payment_term_flexibility_mode
-- Used by: payment_term_clause.flexibility_mode
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('fixed',       'Fixed',       'master.payment_term_flexibility_mode', 'Clause amounts and dates are locked after application',      10),
    ('flexible',    'Flexible',    'master.payment_term_flexibility_mode', 'Amounts can be adjusted within min/max bounds',              20),
    ('negotiable',  'Negotiable',  'master.payment_term_flexibility_mode', 'Open for negotiation on each individual transaction',       30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
