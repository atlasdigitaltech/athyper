INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('wire',    'Wire transfer', 'master.supplier_payment_method', 'Bank wire transfer',       10),
    ('check',   'Check',         'master.supplier_payment_method', 'Paper check',              20),
    ('ach',     'ACH',           'master.supplier_payment_method', 'Automated clearing house',  30),
    ('card',    'Card',          'master.supplier_payment_method', 'Credit/debit card',         40),
    ('netting', 'Netting',       'master.supplier_payment_method', 'Offset against receivable', 50),
    ('cash',    'Cash',          'master.supplier_payment_method', 'Cash payment',              60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
