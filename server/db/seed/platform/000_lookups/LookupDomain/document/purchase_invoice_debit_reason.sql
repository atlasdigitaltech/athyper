INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('damaged_goods',      'Damaged goods',         'document.purchase_invoice_debit_reason', 'Debit raised for damaged goods.',                          10),
    ('short_delivery',     'Short delivery',        'document.purchase_invoice_debit_reason', 'Debit raised for a delivery shortfall.',                   20),
    ('sla_penalty',        'Penalty / SLA breach',  'document.purchase_invoice_debit_reason', 'Debit raised for a contractual penalty.',                  30),
    ('rebate',             'Rebate',                'document.purchase_invoice_debit_reason', 'Debit raised for a rebate.',                               40),
    ('freight_back_charge','Freight back-charge',   'document.purchase_invoice_debit_reason', 'Debit raised for freight charged back to supplier.',       50),
    ('other',              'Other',                 'document.purchase_invoice_debit_reason', 'Other debit reason.',                                      90)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
