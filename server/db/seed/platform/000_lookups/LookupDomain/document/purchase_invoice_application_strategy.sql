INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('apply_now',            'Apply now to specific invoice',     'document.purchase_invoice_application_strategy', 'Apply against the selected original invoice.',               10),
    ('hold_for_allocation',  'Hold for future allocation',        'document.purchase_invoice_application_strategy', 'Hold the adjustment for future allocation.',                 20),
    ('pro_rata_open_balance','Apply pro-rata across open balance','document.purchase_invoice_application_strategy', 'Apply across the supplier open balance.',                    30),
    ('next_payment_run',     'Net against next payment run',      'document.purchase_invoice_application_strategy', 'Net against the next supplier payment run.',                 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
