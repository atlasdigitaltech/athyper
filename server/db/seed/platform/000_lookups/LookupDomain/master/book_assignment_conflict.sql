INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('highest_priority', 'Highest Priority', 'master.company_code_book_assignment_conflict', 'Use assignment with highest priority value', 10),
    ('most_specific',    'Most Specific',    'master.company_code_book_assignment_conflict', 'Use most narrowly scoped assignment',        20),
    ('error_on_conflict','Error on Conflict','master.company_code_book_assignment_conflict', 'Raise error when assignments conflict',      30)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
