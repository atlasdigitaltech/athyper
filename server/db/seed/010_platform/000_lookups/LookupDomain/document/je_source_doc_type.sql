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
    ('bank_recon',       'Bank Reconciliation', 'document.je_source_doc_type', 'Originated from bank reconciliation sign-off', 40),
    ('credit_note',      'Credit Note',      'document.je_source_doc_type', 'Originated from credit note',            50),
    ('debit_note',       'Debit Note',       'document.je_source_doc_type', 'Originated from debit note',             60),
    ('accrual',          'Accrual',          'document.je_source_doc_type', 'Accrual or provision entry',             70),
    ('reclass',          'Reclass',          'document.je_source_doc_type', 'Reclassification entry',                 80),
    ('fx_revaluation',   'FX Revaluation',   'document.je_source_doc_type', 'Foreign exchange revaluation',           90),
    ('depreciation',     'Depreciation',     'document.je_source_doc_type', 'Asset depreciation entry',              100),
    ('ic_elimination',   'IC Elimination',   'document.je_source_doc_type', 'Intercompany elimination entry',        110),
    ('reversal',         'Reversal',         'document.je_source_doc_type', 'Reversal of a prior entry',             120),
    ('correction',       'Correction',       'document.je_source_doc_type', 'Correction of a prior entry',           130),
    ('year_end_close',   'Year End Close',   'document.je_source_doc_type', 'Year-end closing entry',                140),
    ('opening_balance',  'Opening Balance',  'document.je_source_doc_type', 'Opening balance carry-forward entry',   150),
    ('receipt',          'Receipt',          'document.je_source_doc_type', 'Originated from a customer receipt or receipt adjustment', 160),
    ('sales_invoice',    'Sales Invoice',    'document.je_source_doc_type', 'Originated from a sales invoice',       170),
    ('payroll',          'Payroll',          'document.je_source_doc_type', 'Originated from salary or payroll processing', 180),
    ('travel_expense',   'Travel Expense',   'document.je_source_doc_type', 'Originated from travel expense processing', 190),
    ('advance',          'Advance',          'document.je_source_doc_type', 'Originated from employee, customer, or supplier advance processing', 200),
    ('retention',        'Retention',        'document.je_source_doc_type', 'Originated from retention accrual or release', 210),
    ('tax_engine',       'Tax Engine',       'document.je_source_doc_type', 'Originated from VAT, WHT, or tax adjustment processing', 220),
    ('import',           'Import',           'document.je_source_doc_type', 'Imported journal entry',                230)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
