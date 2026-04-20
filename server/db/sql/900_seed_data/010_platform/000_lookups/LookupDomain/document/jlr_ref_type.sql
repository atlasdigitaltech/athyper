-- LookupDomain/document/jlr_ref_type.sql
-- Lookup values for domain: document.jlr_ref_type
-- Idempotent: WHERE NOT EXISTS guard

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
    ('capitalization',      'Capitalization',       'document.jlr_ref_type', 'Capitalized to fixed asset',            60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
