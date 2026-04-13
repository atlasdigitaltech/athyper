-- LookupDomain/control/document_sequence_doc_type.sql
-- Lookup domain + values for control.document_sequence_config.doc_type
-- is_extensible = true — tenants may register custom document types.
-- Idempotent: WHERE NOT EXISTS guard on both domain and value inserts.

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT 'control.document_sequence_doc_type',
       'Document sequence document type',
       'Document types that require sequential numbering. '
       'Tenant-extensible — tenants may add custom document types.',
       'control', true, 'active', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain x
    WHERE x.code = 'control.document_sequence_doc_type'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('purchase_invoice',
     'Purchase Invoice',
     'control.document_sequence_doc_type',
     'Accounts Payable (AP) invoice from a vendor.',
     10),
    ('sales_invoice',
     'Sales Invoice',
     'control.document_sequence_doc_type',
     'Accounts Receivable (AR) invoice to a customer.',
     20),
    ('credit_note',
     'Credit Note',
     'control.document_sequence_doc_type',
     'Credit memo issued to a customer or received from a vendor.',
     30),
    ('debit_note',
     'Debit Note',
     'control.document_sequence_doc_type',
     'Debit memo issued to a customer or sent to a vendor.',
     40),
    ('payment_entry',
     'Payment Entry',
     'control.document_sequence_doc_type',
     'Payment made or received.',
     50),
    ('journal_entry',
     'Journal Entry',
     'control.document_sequence_doc_type',
     'Manual general ledger journal entry.',
     60),
    ('goods_receipt',
     'Goods Receipt',
     'control.document_sequence_doc_type',
     'Goods receipt note (GRN) for inventory or asset inbound.',
     70),
    ('purchase_order',
     'Purchase Order',
     'control.document_sequence_doc_type',
     'Purchase order sent to a vendor.',
     80),
    ('sales_order',
     'Sales Order',
     'control.document_sequence_doc_type',
     'Sales order from a customer.',
     90),
    ('commitment',
     'Commitment',
     'control.document_sequence_doc_type',
     'Budget commitment or encumbrance.',
     100)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
