INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('price_adjustment',  'Price adjustment',   'document.purchase_invoice_credit_reason', 'Post-invoice price correction.',              10),
    ('goods_returned',    'Goods returned',     'document.purchase_invoice_credit_reason', 'Supplier credit for returned goods.',          20),
    ('allowance_discount','Allowance / discount','document.purchase_invoice_credit_reason', 'Supplier allowance or discount credit.',       30),
    ('billing_error',     'Billing error',      'document.purchase_invoice_credit_reason', 'Correction for a billing error.',              40),
    ('tax_correction',    'Tax correction',     'document.purchase_invoice_credit_reason', 'Correction of tax treatment or amount.',       50),
    ('other',             'Other',              'document.purchase_invoice_credit_reason', 'Other credit reason.',                         90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
