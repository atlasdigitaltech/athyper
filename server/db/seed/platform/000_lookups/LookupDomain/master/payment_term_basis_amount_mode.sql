-- LookupDomain/master/payment_term_basis_amount_mode.sql
-- Lookup values for domain: master.payment_term_basis_amount_mode
-- Used by: payment_term_clause.basis_amount_mode
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('gross',      'Gross',     'master.payment_term_basis_amount_mode', 'Percentage applies to gross amount (before discounts/tax)',   10),
    ('net',        'Net',       'master.payment_term_basis_amount_mode', 'Percentage applies to net amount (after all discounts)',       20),
    ('pre_tax',    'Pre-Tax',   'master.payment_term_basis_amount_mode', 'Percentage applies to amount before tax is added',            30),
    ('line_total', 'Line Total','master.payment_term_basis_amount_mode', 'Percentage applies to the individual line item total',        40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
