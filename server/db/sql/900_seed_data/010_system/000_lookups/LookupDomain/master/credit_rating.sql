-- LookupDomain/master/credit_rating.sql
-- Lookup values for domain: master.credit_rating
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('aaa',  'AAA',  'master.credit_rating', 'Highest credit quality',      10),
    ('aa',   'AA',   'master.credit_rating', 'Very high credit quality',    20),
    ('a',    'A',    'master.credit_rating', 'High credit quality',         30),
    ('bbb',  'BBB',  'master.credit_rating', 'Good credit quality',         40),
    ('bb',   'BB',   'master.credit_rating', 'Speculative',                 50),
    ('b',    'B',    'master.credit_rating', 'Highly speculative',          60),
    ('ccc',  'CCC',  'master.credit_rating', 'Substantial risk',            70),
    ('nr',   'NR',   'master.credit_rating', 'Not rated',                   80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
