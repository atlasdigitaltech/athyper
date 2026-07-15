INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('statutory',  'Statutory',  'master.ledger_book_category', 'Primary GAAP / statutory reporting',  10),
    ('tax',        'Tax',        'master.ledger_book_category', 'Tax-basis accounting',                20),
    ('management', 'Management', 'master.ledger_book_category', 'Internal management reporting',       30),
    ('insurance',  'Insurance',  'master.ledger_book_category', 'Insurance-specific accounting',       40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
