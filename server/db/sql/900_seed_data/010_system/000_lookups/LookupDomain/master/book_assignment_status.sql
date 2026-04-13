-- LookupDomain/master/company_code_book_assignment_status.sql
-- Lookup values for domain: master.company_code_book_assignment_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('active',   'Active',   'master.company_code_book_assignment_status', 'Assignment is in effect',              10),
    ('inactive', 'Inactive', 'master.company_code_book_assignment_status', 'Temporarily suspended',                20),
    ('expired',  'Expired',  'master.company_code_book_assignment_status', 'Past validity end date',               30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
