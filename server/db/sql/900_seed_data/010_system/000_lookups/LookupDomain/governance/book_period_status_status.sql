-- LookupDomain/governance/book_period_status_status.sql
-- Lookup values for domain: governance.book_period_status_status
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('future',     'Future',     'governance.book_period_status_status', 'Period not yet open for this book',            10),
    ('open',       'Open',       'governance.book_period_status_status', 'Accepting postings for this book',             20),
    ('soft_close', 'Soft Close', 'governance.book_period_status_status', 'Restricted posting for this book',             30),
    ('hard_close', 'Hard Close', 'governance.book_period_status_status', 'Fully closed for this book, no posting',       40)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
