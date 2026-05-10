-- LookupDomain/document/je_source_doc_type.sql
-- Lookup values for domain: document.je_source_doc_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('manual',           'Manual',           'document.je_source_doc_type', 'Manually created journal entry',         10),
    ('purchase_invoice', 'Purchase Invoice', 'document.je_source_doc_type', 'Originated from purchase invoice',       20),
    ('payment_entry',    'Payment Entry',    'document.je_source_doc_type', 'Originated from payment entry',          30),
    ('credit_note',      'Credit Note',      'document.je_source_doc_type', 'Originated from credit note',            40),
    ('debit_note',       'Debit Note',       'document.je_source_doc_type', 'Originated from debit note',             50),
    ('accrual',          'Accrual',          'document.je_source_doc_type', 'Accrual or provision entry',             60),
    ('reclass',          'Reclass',          'document.je_source_doc_type', 'Reclassification entry',                 70),
    ('fx_revaluation',   'FX Revaluation',   'document.je_source_doc_type', 'Foreign exchange revaluation',           80),
    ('depreciation',     'Depreciation',     'document.je_source_doc_type', 'Asset depreciation entry',               90),
    ('ic_elimination',   'IC Elimination',   'document.je_source_doc_type', 'Intercompany elimination entry',        100),
    ('reversal',         'Reversal',         'document.je_source_doc_type', 'Reversal of a prior entry',             110),
    ('correction',       'Correction',       'document.je_source_doc_type', 'Correction of a prior entry',           120),
    ('year_end_close',   'Year End Close',   'document.je_source_doc_type', 'Year-end closing entry',                130),
    ('opening_balance',  'Opening Balance',  'document.je_source_doc_type', 'Opening balance carry-forward entry',   140),
    ('receipt',          'Receipt',          'document.je_source_doc_type', 'Originated from a customer receipt or receipt adjustment', 150),
    ('sales_invoice',    'Sales Invoice',    'document.je_source_doc_type', 'Originated from a sales invoice',       160),
    ('payroll',          'Payroll',          'document.je_source_doc_type', 'Originated from salary or payroll processing', 170),
    ('travel_expense',   'Travel Expense',   'document.je_source_doc_type', 'Originated from travel expense processing', 180),
    ('advance',          'Advance',          'document.je_source_doc_type', 'Originated from employee, customer, or supplier advance processing', 190),
    ('retention',        'Retention',        'document.je_source_doc_type', 'Originated from retention accrual or release', 200),
    ('tax_engine',       'Tax Engine',       'document.je_source_doc_type', 'Originated from VAT, WHT, or tax adjustment processing', 210),
    ('import',           'Import',           'document.je_source_doc_type', 'Imported journal entry',                220)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
