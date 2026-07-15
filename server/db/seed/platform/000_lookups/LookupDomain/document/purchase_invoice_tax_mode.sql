INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('inclusive',
     'Inclusive',
     'document.purchase_invoice_tax_mode',
     'Tax is included within Invoice Total. Net = Total ÷ (1 + rate). Common in B2C and many VAT jurisdictions.',
     10),
    ('exclusive',
     'Exclusive',
     'document.purchase_invoice_tax_mode',
     'Tax is added on top of Invoice Total. Payable = Total + Tax. Common in B2B and GST regimes.',
     20),
    ('no_tax',
     'No Tax',
     'document.purchase_invoice_tax_mode',
     'Invoice is tax-exempt or zero-rated. tax_amount must be 0.',
     30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
