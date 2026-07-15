INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',          'Standard',             'document.purchase_requisition_type', 'Standard planned purchase requisition',                      10),
    ('urgent',            'Urgent',               'document.purchase_requisition_type', 'Fast-track requisition bypassing standard lead times',       20),
    ('blanket',           'Blanket',              'document.purchase_requisition_type', 'Standing blanket requisition for recurring spend',           30),
    ('framework_call_off','Framework Call-Off',   'document.purchase_requisition_type', 'Call-off against a pre-negotiated framework agreement',      40),
    ('capex',             'Capital Expenditure',  'document.purchase_requisition_type', 'Capital asset purchase requiring project/asset code',        50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
