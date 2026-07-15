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
    ('project_item',     'Project Item',     'document.jlr_ref_doc_type', 'Reference to a project WBS item',  80),
    ('receipt',          'Receipt',          'document.jlr_ref_doc_type', 'Reference to a customer receipt or receipt line', 90),
    ('sales_invoice',    'Sales Invoice',    'document.jlr_ref_doc_type', 'Reference to a sales invoice or invoice line', 100),
    ('salary_run',       'Salary Run',       'document.jlr_ref_doc_type', 'Reference to a payroll/salary run or employee salary line', 110),
    ('travel_expense',   'Travel Expense',   'document.jlr_ref_doc_type', 'Reference to a travel expense claim or line', 120),
    ('advance',          'Advance',          'document.jlr_ref_doc_type', 'Reference to employee, supplier, or customer advance', 130),
    ('retention',        'Retention',        'document.jlr_ref_doc_type', 'Reference to a retention obligation or release', 140),
    ('tax_document',     'Tax Document',     'document.jlr_ref_doc_type', 'Reference to a tax return, tax invoice, or adjustment', 150),
    ('withholding_tax',  'Withholding Tax',  'document.jlr_ref_doc_type', 'Reference to a withholding tax certificate or settlement', 160)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
