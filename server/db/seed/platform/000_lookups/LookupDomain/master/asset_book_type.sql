INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('statutory',  'Statutory Book',   'master.asset_book_type', 'IFRS/GAAP statutory reporting book',    10),
    ('tax',        'Tax Book',         'master.asset_book_type', 'Tax depreciation book',                 20),
    ('management', 'Management Book',  'master.asset_book_type', 'Internal management reporting book',    30),
    ('insurance',  'Insurance Book',   'master.asset_book_type', 'Insurance valuation book',              40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
