-- LookupDomain/document/jlr_ref_doc_type.sql
-- Lookup values for domain: document.jlr_ref_doc_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('purchase_invoice', 'Purchase Invoice', 'document.jlr_ref_doc_type', 'Reference to a purchase invoice',  10),
    ('credit_note',      'Credit Note',      'document.jlr_ref_doc_type', 'Reference to a credit note',       20),
    ('debit_note',       'Debit Note',       'document.jlr_ref_doc_type', 'Reference to a debit note',        30),
    ('payment_entry',    'Payment Entry',    'document.jlr_ref_doc_type', 'Reference to a payment entry',     40),
    ('journal_entry',    'Journal Entry',    'document.jlr_ref_doc_type', 'Reference to a journal entry',     50),
    ('commitment',       'Commitment',       'document.jlr_ref_doc_type', 'Reference to a commitment',        60),
    ('asset',            'Asset',            'document.jlr_ref_doc_type', 'Reference to a fixed asset',       70),
    ('project_item',     'Project Item',     'document.jlr_ref_doc_type', 'Reference to a project WBS item',  80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
