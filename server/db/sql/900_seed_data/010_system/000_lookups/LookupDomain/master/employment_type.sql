-- LookupDomain/master/employment_type.sql
-- Lookup values for domain: master.employment_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('full_time',  'Full-time',   'master.employment_type', 'Full-time permanent',      10),
    ('part_time',  'Part-time',   'master.employment_type', 'Part-time permanent',      20),
    ('contract',   'Contract',    'master.employment_type', 'Fixed-term contract',      30),
    ('intern',     'Intern',      'master.employment_type', 'Internship / trainee',     40),
    ('consultant', 'Consultant',  'master.employment_type', 'External consultant',      50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
