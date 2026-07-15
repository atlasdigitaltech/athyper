INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('payment_allocation',  'Payment Allocation',  'document.jlr_ref_type', 'Payment applied against invoice',      10),
    ('credit_application',  'Credit Application',  'document.jlr_ref_type', 'Credit note applied to invoice',       20),
    ('netting',             'Netting',             'document.jlr_ref_type', 'AR/AP netting offset',                  30),
    ('advance_clearing',    'Advance Clearing',    'document.jlr_ref_type', 'Advance payment cleared on receipt',    40),
    ('po_match',            'PO Match',            'document.jlr_ref_type', 'Matched against purchase order',        50),
    ('capitalization',      'Capitalization',       'document.jlr_ref_type', 'Capitalized to fixed asset',            60),
    ('manual_adjustment',   'Manual Adjustment',   'document.jlr_ref_type', 'Manual JE adjustment with optional business document reference', 70),
    ('invoice_adjustment',  'Invoice Adjustment',  'document.jlr_ref_type', 'Adjustment against an invoice or invoice line', 80),
    ('receipt_adjustment',  'Receipt Adjustment',  'document.jlr_ref_type', 'Adjustment against a receipt or payment line', 90),
    ('sales_invoice_adjustment', 'Sales Invoice Adjustment', 'document.jlr_ref_type', 'Adjustment against a sales invoice or line', 100),
    ('payroll_posting',     'Payroll Posting',     'document.jlr_ref_type', 'Payroll or salary related journal posting', 110),
    ('travel_expense',      'Travel Expense',      'document.jlr_ref_type', 'Travel expense adjustment or reclassification', 120),
    ('tax_posting',         'Tax Posting',         'document.jlr_ref_type', 'Tax adjustment or tax authority posting', 130),
    ('withholding_tax',     'Withholding Tax',     'document.jlr_ref_type', 'Withholding tax adjustment or settlement', 140),
    ('retention',           'Retention',           'document.jlr_ref_type', 'Retention accrual, release, or settlement', 150)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
