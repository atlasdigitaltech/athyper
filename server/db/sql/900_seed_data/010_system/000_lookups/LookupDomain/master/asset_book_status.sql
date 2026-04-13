-- LookupDomain/master/asset_book_status.sql
-- Lookup values for domain: master.asset_book_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('draft',     'Draft',      'master.asset_book_status', 'Book profile created, not yet active',  10),
    ('active',    'Active',     'master.asset_book_status', 'Book profile in use for depreciation',  20),
    ('suspended', 'Suspended',  'master.asset_book_status', 'Depreciation temporarily halted',       30),
    ('closed',    'Closed',     'master.asset_book_status', 'Book profile closed — no further activity', 40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
