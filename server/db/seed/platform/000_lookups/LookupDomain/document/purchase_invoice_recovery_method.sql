INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('next_3_invoices',  'Auto-recover from next 3 invoices', 'document.purchase_invoice_recovery_method', 'Recover evenly from the next three invoices.',         10),
    ('proportional',     'Auto-recover proportionally',       'document.purchase_invoice_recovery_method', 'Recover proportionally from future invoices.',         20),
    ('manual_allocation','Manual allocation only',            'document.purchase_invoice_recovery_method', 'Recover only when manually allocated.',                30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
