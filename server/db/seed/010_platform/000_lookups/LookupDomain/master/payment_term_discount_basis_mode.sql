-- LookupDomain/master/payment_term_discount_basis_mode.sql
-- Lookup values for domain: master.payment_term_discount_basis_mode
-- Used by: payment_term_discount_tier.discount_basis_mode
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('percentage_of_gross', 'Percentage of Gross', 'master.payment_term_discount_basis_mode', 'Discount % applied to gross invoice total',          10),
    ('percentage_of_net',   'Percentage of Net',   'master.payment_term_discount_basis_mode', 'Discount % applied to net (post-deduction) total',   20),
    ('fixed_amount',        'Fixed Amount',         'master.payment_term_discount_basis_mode', 'Fixed currency discount independent of invoice total',30),
    ('tiered',              'Tiered',               'master.payment_term_discount_basis_mode', 'Discount determined by payment amount tier bracket',  40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
