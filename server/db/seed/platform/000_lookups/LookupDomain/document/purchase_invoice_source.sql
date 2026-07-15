INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, metadata, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, v.metadata,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('po_based',          'PO-Based',          'document.purchase_invoice_source',
     'Invoice against an existing purchase order.',
     10::smallint,
     '{"preflight":{"description":"Invoice against an existing purchase order. Matched against the PO and the goods receipt."}}'::jsonb),

    ('contract_based',    'Contract-Based',    'document.purchase_invoice_source',
     'Invoice against an existing master agreement or framework contract.',
     20::smallint,
     '{"preflight":{"description":"Invoice against an existing master agreement or framework contract."}}'::jsonb),

    ('non_po',            'Non-PO',            'document.purchase_invoice_source',
     'Invoice with no upstream PO or contract.',
     30::smallint,
     '{"preflight":{"description":"Invoice with no upstream PO or contract. Approver derives intent from spend category at invoice time."}}'::jsonb),

    ('one_time_supplier', 'One-Time Supplier', 'document.purchase_invoice_source',
     'Invoice from a party not in supplier master data.',
     40::smallint,
     '{"preflight":{"description":"Invoice from a party not in supplier master data. Inline party creation, single-use payment, no recurring relationship."}}'::jsonb)
) AS v(code, name, domain_code, description, sort_order, metadata)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
