INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, metadata, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, v.metadata,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('standard',          'Standard',          'document.purchase_invoice_type',
     'Regular supplier bill for goods received or services delivered.',
     10::smallint,
     '{"display_tier":"primary","preflight":{"description":"Regular supplier bill for goods received or services delivered."}}'::jsonb),

    ('credit_note',       'Credit Note',       'document.purchase_invoice_type',
     'Supplier-issued credit reducing an outstanding payable.',
     20::smallint,
     '{"display_tier":"primary","preflight":{"description":"Supplier-issued credit reducing an outstanding payable. Mirrors an original invoice in full or in part."}}'::jsonb),

    ('debit_note',        'Debit Note',        'document.purchase_invoice_type',
     'Buyer-issued document charging the supplier for a shortfall or breach.',
     30::smallint,
     '{"display_tier":"primary","preflight":{"description":"Buyer-issued document charging the supplier for a shortfall or breach. Reduces what we owe them."}}'::jsonb),

    ('advance',           'Advance',           'document.purchase_invoice_type',
     'Standalone prepayment to a supplier before any work or delivery.',
     40::smallint,
     '{"display_tier":"primary","preflight":{"description":"Standalone prepayment to a supplier before any work or delivery and recovered by future invoices."}}'::jsonb),

    ('retention_release', 'Retention Release', 'document.purchase_invoice_type',
     'Releases previously-withheld retention back to the supplier.',
     50::smallint,
     '{"display_tier":"primary","preflight":{"description":"Releases previously-withheld retention back to the supplier when contractual conditions are met."}}'::jsonb),

    ('final',             'Final',             'document.purchase_invoice_type',
     'Closing invoice on a PO or contract.',
     60::smallint,
     '{"display_tier":"advanced","preflight":{"description":"Closing invoice on a PO or contract. Posts normally and releases any remaining encumbered budget on the parent commitment."}}'::jsonb),

    ('self_billed',       'Self-Billed',       'document.purchase_invoice_type',
     'Buyer-created invoice on behalf of the supplier under a self-billing agreement.',
     70::smallint,
     '{"display_tier":"advanced","preflight":{"description":"Buyer-created invoice on behalf of the supplier under a self-billing agreement. We compute the amount owed and notify the supplier.","helper":"Requires a contractual basis; not valid for Non-PO or One-Time Supplier."}}'::jsonb)
) AS v(code, name, domain_code, description, sort_order, metadata)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
