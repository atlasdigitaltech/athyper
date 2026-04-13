-- LookupDomain/master/project_type.sql
-- Lookup values for domain: master.project_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('capex',       'CAPEX',       'master.project_type', 'Capital expenditure',    10),
    ('opex',        'OPEX',        'master.project_type', 'Operating expenditure',  20),
    ('internal',    'Internal',    'master.project_type', 'Internal improvement',   30),
    ('customer',    'Customer',    'master.project_type', 'Customer delivery',      40),
    ('r_and_d',     'R&D',         'master.project_type', 'Research & development', 50),
    ('maintenance', 'Maintenance', 'master.project_type', 'Plant / asset maint.',   60)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
