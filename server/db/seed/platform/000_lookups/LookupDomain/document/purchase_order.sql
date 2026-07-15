INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',  'Standard',  'document.purchase_order_type', 'Standard one-time purchase order',          10),
    ('blanket',   'Blanket',   'document.purchase_order_type', 'Blanket PO for recurring or open purchases', 20),
    ('service',   'Service',   'document.purchase_order_type', 'Service procurement order',                  30),
    ('emergency', 'Emergency', 'document.purchase_order_type', 'Emergency fast-track purchase order',        40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);

